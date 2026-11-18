// Modelo de riesgo de morosidad v1 dentro de la base: paridad con scikit-learn, permisos y flujo completo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

type Caso = { entrada: Record<string, number>; probabilidad_sklearn: number }
const casos: Caso[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'ml', 'modelo_morosidad', 'modelo', 'paridad_sql_casos_v1.json'), 'utf8')).casos

let db: PGlite
const ids = {
  junta: '00000000-0000-4000-8000-0000000000e1', otra: '00000000-0000-4000-8000-0000000000e2',
  admin: '10000000-0000-4000-8000-0000000000e1', adminOtra: '10000000-0000-4000-8000-0000000000e2',
  prop: '20000000-0000-4000-8000-0000000000e1',
  conHistorial: '30000000-0000-4000-8000-0000000000e1', nueva: '30000000-0000-4000-8000-0000000000e2',
}
let mesSiguiente = ''

async function usuario(id: string, email: string, meta: Record<string, unknown> = {}) {
  await como(db, { tipo: 'postgres' })
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, email, JSON.stringify({ nombre_completo: email.split('@')[0], acepto_datos: 'true', ...meta })])
}

beforeAll(async () => {
  db = await crearBaseDePrueba()
  mesSiguiente = (await filas<{ m: string }>(db, `select (date_trunc('month', public.hoy_lima()) + interval '1 month')::date::text as m`))[0].m
  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado) values
      ('${ids.junta}', 'Junta ML de prueba', 150, 5, true), ('${ids.otra}', 'Otra junta', 100, 5, true);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.junta}', 'MLPRUEBA1'), ('${ids.otra}', 'OTRAML01');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values ('${ids.conHistorial}', '${ids.junta}', 'Casa 01', true);
  `)
  await usuario(ids.admin, 'admin-ml@ejemplo.test')
  await usuario(ids.adminOtra, 'admin-otra@ejemplo.test')
  await db.exec(`insert into public.miembros_junta (junta_id, perfil_id, rol) values
    ('${ids.junta}', '${ids.admin}', 'admin'), ('${ids.otra}', '${ids.adminOtra}', 'admin')`)
  await usuario(ids.prop, 'casa01-ml@ejemplo.test', { codigo_invitacion: 'MLPRUEBA1', unidad_id: ids.conHistorial })
  // Historial: tres meses vencidos e impagos para Casa 01 (cuentan como atrasos).
  await como(db, { tipo: 'usuario', id: ids.admin })
  for (const atras of [3, 2, 1]) {
    await db.query(`select public.generar_cuotas($1, (date_trunc('month', public.hoy_lima()) - make_interval(months => $2))::date)`, [ids.junta, atras])
  }
  // Una unidad nueva, sin historial, y las cuotas del mes siguiente (aún no vencen).
  await como(db, { tipo: 'postgres' })
  await db.query(`insert into public.unidades (id, junta_id, codigo, es_simulado) values ($1, $2, 'Casa 02', true)`, [ids.nueva, ids.junta])
  await como(db, { tipo: 'usuario', id: ids.admin })
  await db.query('select public.generar_cuotas($1, $2::date)', [ids.junta, mesSiguiente])
})

describe('Modelo v1 registrado en la base', () => {
  it('hay un único modelo activo con sus parámetros', async () => {
    await como(db, { tipo: 'postgres' })
    const m = await filas<{ version: string; activo: boolean; umbral: string; p: { umbral: number; caracteristicas: string[] } }>(db,
      'select version, activo, umbral::text, parametros as p from public.modelos_ml where activo')
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ version: 'v1', activo: true })
    expect(m[0].p.caracteristicas).toEqual(['pagos_atrasados_previos', 'atrasos_previos_total', 'tasa_atraso_previa', 'dias_atraso_promedio_previo'])
    expect(m[0].p.umbral).toBeCloseTo(0.2258, 4)
  })

  it('las métricas de prueba coinciden con los resultados del notebook y con su matriz de confusión', async () => {
    const resumen = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'ml', 'modelo_morosidad', 'resultados', 'resumen.json'), 'utf8')) as { prueba: Record<string, number> }
    await como(db, { tipo: 'postgres' })
    const [{ m }] = await filas<{ m: { prueba_meses_11_12: Record<string, number> & { matriz: Record<string, number> } } }>(db, `select metricas as m from public.modelos_ml where version = 'v1'`)
    const p = m.prueba_meses_11_12
    for (const k of ['accuracy', 'precision', 'recall', 'f1']) expect(p[k]).toBe(resumen.prueba[k])
    const { verdaderos_positivos: vp, falsos_negativos: fn, falsos_positivos: fp, verdaderos_negativos: vn, cuotas } = p.matriz
    expect([vp, fn, fp, vn, cuotas]).toEqual([11, 2, 7, 39, 59])
    expect(vp + fn + fp + vn).toBe(cuotas)
    const r3 = (x: number) => Math.round(x * 1000) / 1000
    expect(r3(vp / (vp + fn))).toBe(p.recall)
    expect(r3(vp / (vp + fp))).toBe(p.precision)
    expect(r3((vp + vn) / cuotas)).toBe(p.accuracy)
    expect(r3((2 * vp) / (2 * vp + fp + fn))).toBe(p.f1)
  })

  it('reproduce las probabilidades de scikit-learn en los 115 casos del dataset', async () => {
    await como(db, { tipo: 'postgres' })
    const r = await filas<{ i: number; p: number; umbral: number }>(db, `
      select (c.ord - 1)::int as i, public.ml_probabilidad(m.parametros, c.caso -> 'entrada') as p, (m.parametros ->> 'umbral')::float8 as umbral
      from public.modelos_ml m, jsonb_array_elements($1::jsonb) with ordinality as c(caso, ord) where m.activo`, [JSON.stringify(casos)])
    expect(r).toHaveLength(casos.length)
    const difMax = Math.max(...r.map(x => Math.abs(x.p - casos[x.i].probabilidad_sklearn)))
    expect(difMax).toBeLessThan(1e-9)
    expect(r.every(x => (x.p >= x.umbral) === (casos[x.i].probabilidad_sklearn >= x.umbral))).toBe(true)
  })

  it('las funciones internas no se exponen a la API', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, `select public.ml_probabilidad('{}'::jsonb, '{}'::jsonb)`)).toMatch(/permission denied/)
  })
})

describe('Cálculo de riesgo para cuotas por vencer', () => {
  const calcular = (corte: string | null = null) =>
    filas<{ r: { cuotas: number; alto: number; bajo: number; modelo_version: string } }>(db,
      'select public.calcular_riesgo_morosidad($1, $2::date, 62) as r', [ids.junta, corte])

  it('la administración calcula y guarda una predicción por cuota por vencer', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const [{ r }] = await calcular()
    expect(r).toMatchObject({ modelo_version: 'v1', cuotas: 2 })
    await como(db, { tipo: 'postgres' })
    const p = await filas<{ unidad: string; probabilidad: string; nivel_riesgo: string; prediccion: number; factores: { variable: string }[]; entrada: Record<string, number> }>(db, `
      select u.codigo as unidad, pr.probabilidad::text, pr.nivel_riesgo, pr.prediccion, pr.factores, pr.entrada
      from public.predicciones_morosidad pr join public.cuotas c on c.id = pr.cuota_id join public.unidades u on u.id = c.unidad_id
      where pr.junta_id = $1 order by u.codigo`, [ids.junta])
    const [historial, nueva] = p
    expect(historial).toMatchObject({ unidad: 'Casa 01', nivel_riesgo: 'alto', prediccion: 1 })
    // Casa 01: tres meses vencidos impagos; la ventana de 3 meses del periodo siguiente solo incluye los dos últimos.
    expect(historial.entrada).toMatchObject({ atrasos_previos_total: 3, pagos_atrasados_previos: 2, tasa_atraso_previa: 1 })
    expect(historial.factores.length).toBeGreaterThan(0)
    expect(nueva).toMatchObject({ unidad: 'Casa 02', nivel_riesgo: 'bajo', prediccion: 0, factores: [] })
    // La entrada guardada no contiene campos del desenlace de la cuota.
    expect(Object.keys(historial.entrada)).not.toEqual(expect.arrayContaining(['fecha_pago']))
  })

  it('recalcular el mismo día no duplica predicciones', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    await calcular()
    await como(db, { tipo: 'postgres' })
    expect((await filas(db, 'select 1 from public.predicciones_morosidad where junta_id = $1', [ids.junta]))).toHaveLength(2)
  })

  it('predicciones_vigentes muestra los resultados a la administración', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const v = await filas<{ unidad_codigo: string; nivel_riesgo: string; modelo_version: string }>(db, 'select * from public.predicciones_vigentes($1)', [ids.junta])
    expect(v.map(x => [x.unidad_codigo, x.nivel_riesgo, x.modelo_version]).sort()).toEqual([['Casa 01', 'alto', 'v1'], ['Casa 02', 'bajo', 'v1']])
  })

  it('propietarios, visitantes y administradores de otra junta no calculan ni leen el riesgo', async () => {
    await como(db, { tipo: 'usuario', id: ids.prop })
    expect(await errorDe(db, 'select public.calcular_riesgo_morosidad($1)', [ids.junta])).toMatch(/permiso/)
    expect(await filas(db, 'select * from public.predicciones_morosidad')).toHaveLength(0)
    expect(await errorDe(db, 'select * from public.predicciones_vigentes($1)', [ids.junta])).toMatch(/permiso/)
    await como(db, { tipo: 'usuario', id: ids.adminOtra })
    expect(await errorDe(db, 'select public.calcular_riesgo_morosidad($1)', [ids.junta])).toMatch(/permiso/)
    expect(await filas(db, 'select * from public.predicciones_morosidad')).toHaveLength(0)
    await como(db, { tipo: 'anon' })
    expect(await errorDe(db, 'select public.calcular_riesgo_morosidad($1)', [ids.junta])).toMatch(/permission denied/)
  })

  it('la administración no fija fechas de corte; el servicio sí (para evidencias históricas)', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, `select public.calcular_riesgo_morosidad($1, (public.hoy_lima() - 30))`, [ids.junta])).toMatch(/fecha de hoy/)
    await como(db, { tipo: 'servicio' })
    expect(await errorDe(db, `select public.calcular_riesgo_morosidad($1, (public.hoy_lima() - 1), 62)`, [ids.junta])).toBeNull()
  })

  it('cada cálculo queda en la auditoría', async () => {
    await como(db, { tipo: 'postgres' })
    const a = await filas<{ detalle: { modelo: string; cuotas: number } }>(db,
      `select detalle from public.auditoria where junta_id = $1 and accion = 'calcular_riesgo_morosidad'`, [ids.junta])
    expect(a.length).toBeGreaterThanOrEqual(2)
    expect(a[0].detalle).toMatchObject({ modelo: 'v1' })
  })
})
