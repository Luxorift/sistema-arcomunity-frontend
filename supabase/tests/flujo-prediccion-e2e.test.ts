// Flujo de extremo a extremo de la predicción (migración 1500): registro nuevo → predicción registrada → acción,
// con degradación controlada (regla de respaldo), entradas inválidas rechazadas y bitácora de solo inserción.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

let db: PGlite
const ids = {
  junta: '00000000-0000-4000-8000-0000000000d1', real: '00000000-0000-4000-8000-0000000000d2',
  admin: '10000000-0000-4000-8000-0000000000d1', adminReal: '10000000-0000-4000-8000-0000000000d2',
  prop: '20000000-0000-4000-8000-0000000000d1',
  conHistorial: '30000000-0000-4000-8000-0000000000d1', nueva: '30000000-0000-4000-8000-0000000000d2',
}
let mesSiguiente = ''
let mesAnterior = ''

type Resumen = { cuotas: number; alto: number; medio: number; bajo: number; respaldo: number; motivos_respaldo: string[]; modelo_version: string; aviso?: string }
const rpc = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await filas<{ r: T }>(db, `select ${sql} as r`, params))[0].r
const comoAdmin = () => como(db, { tipo: 'usuario', id: ids.admin })
const comoPostgres = () => como(db, { tipo: 'postgres' })
const calcularPeriodo = () => rpc<Resumen>('public.calcular_riesgo_periodo($1, $2::date)', [ids.junta, mesSiguiente])
const vigentes = async () => {
  await comoAdmin()
  return filas<{ unidad_codigo: string; nivel_riesgo: string; origen: string; motivo_respaldo: string | null; probabilidad: string | null; ultimo_recordatorio: string | null; cuota_id: string }>(db,
    'select * from public.predicciones_vigentes($1) order by unidad_codigo', [ids.junta])
}
const registros = async () => {
  await comoPostgres()
  return (await filas<{ n: number }>(db, `select count(*)::int as n from public.registro_predicciones where junta_id = $1`, [ids.junta]))[0].n
}

async function usuario(id: string, email: string, meta: Record<string, unknown> = {}) {
  await comoPostgres()
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, email, JSON.stringify({ nombre_completo: email.split('@')[0], acepto_datos: 'true', ...meta })])
}

beforeAll(async () => {
  db = await crearBaseDePrueba()
  const [m] = await filas<{ s: string; a: string }>(db, `select (date_trunc('month', public.hoy_lima()) + interval '1 month')::date::text as s,
    (date_trunc('month', public.hoy_lima()) - interval '1 month')::date::text as a`)
  mesSiguiente = m.s; mesAnterior = m.a
  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado, modo_demo) values
      ('${ids.junta}', 'Junta demo E2E', 150, 5, true, true), ('${ids.real}', 'Junta real E2E', 100, 5, true, false);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.junta}', 'E2EDEMO01'), ('${ids.real}', 'E2EREAL01');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values ('${ids.conHistorial}', '${ids.junta}', 'Casa 01', true);
  `)
  await usuario(ids.admin, 'admin-e2e@ejemplo.test')
  await usuario(ids.adminReal, 'admin-real-e2e@ejemplo.test')
  await db.exec(`insert into public.miembros_junta (junta_id, perfil_id, rol) values
    ('${ids.junta}', '${ids.admin}', 'admin'), ('${ids.real}', '${ids.adminReal}', 'admin')`)
  await usuario(ids.prop, 'casa01-e2e@ejemplo.test', { codigo_invitacion: 'E2EDEMO01', unidad_id: ids.conHistorial })
  // Historial: tres meses vencidos e impagos para Casa 01. Casa 02 llega después, sin historial.
  await comoAdmin()
  for (const atras of [3, 2, 1]) {
    await db.query(`select public.generar_cuotas($1, (date_trunc('month', public.hoy_lima()) - make_interval(months => $2))::date)`, [ids.junta, atras])
  }
  await comoPostgres()
  await db.query(`insert into public.unidades (id, junta_id, codigo, es_simulado) values ($1, $2, 'Casa 02', true)`, [ids.nueva, ids.junta])
})

describe('Escenario (a): un registro nuevo dispara la predicción', () => {
  it('generar las cuotas del mes siguiente y calcular su riesgo guarda una predicción por cuota con el modelo v1', async () => {
    await comoAdmin()
    expect(await rpc<{ creadas: number }>('public.generar_cuotas($1, $2::date)', [ids.junta, mesSiguiente])).toMatchObject({ creadas: 2 })
    const r = await calcularPeriodo()
    expect(r).toMatchObject({ cuotas: 2, alto: 1, bajo: 1, respaldo: 0, modelo_version: 'v1' })
    const v = await vigentes()
    expect(v.map(x => [x.unidad_codigo, x.nivel_riesgo, x.origen])).toEqual([['Casa 01', 'alto', 'modelo'], ['Casa 02', 'bajo', 'modelo']])
    expect(v.every(x => x.probabilidad !== null && x.motivo_respaldo === null)).toBe(true)
  })

  it('cada cálculo queda en la bitácora con entrada, salida, probabilidad, versión, usuario y fecha', async () => {
    await comoPostgres()
    const reg = await filas<{ tipo: string; modelo_version: string; origen: string; entrada: Record<string, number>; probabilidad: string; nivel_riesgo: string; umbral: number; solicitado_por: string; unidad_ref: string; registrado_en: string }>(db,
      `select * from public.registro_predicciones where junta_id = $1 order by nivel_riesgo`, [ids.junta])
    expect(reg).toHaveLength(2)
    for (const x of reg) {
      expect(x).toMatchObject({ tipo: 'cuota', modelo_version: 'v1', origen: 'modelo', solicitado_por: ids.admin })
      expect(x.umbral).toBeCloseTo(0.2258, 4)
      expect(Number(x.probabilidad)).toBeGreaterThan(0)
      expect(x.unidad_ref).toMatch(/^U-[0-9a-f]{10}$/)
      expect(x.registrado_en).toBeTruthy()
      expect(Object.keys(x.entrada)).toEqual(expect.arrayContaining(['pagos_atrasados_previos', 'atrasos_previos_total', 'tasa_atraso_previa', 'dias_atraso_promedio_previo']))
      expect(Object.keys(x.entrada)).not.toEqual(expect.arrayContaining(['fecha_pago']))
    }
  })

  it('recalcular no duplica las predicciones vigentes, pero agrega la historia a la bitácora', async () => {
    await comoAdmin()
    await calcularPeriodo()
    await comoPostgres()
    expect(await filas(db, 'select 1 from public.predicciones_morosidad where junta_id = $1', [ids.junta])).toHaveLength(2)
    expect(await registros()).toBe(4)
  })

  it('la bitácora no se puede editar ni borrar desde la aplicación', async () => {
    await comoPostgres()
    expect(await errorDe(db, `update public.registro_predicciones set nivel_riesgo = 'bajo' where junta_id = $1`, [ids.junta])).toMatch(/no se puede modificar/)
    await comoAdmin()
    expect(await errorDe(db, `delete from public.registro_predicciones where junta_id = $1`, [ids.junta])).toMatch(/permission denied/)
  })

  it('un periodo ya vencido no se predice y un periodo mal escrito se rechaza', async () => {
    await comoAdmin()
    expect((await rpc<Resumen>('public.calcular_riesgo_periodo($1, $2::date)', [ids.junta, mesAnterior])).aviso).toMatch(/ya vencieron/)
    expect(await errorDe(db, `select public.calcular_riesgo_periodo($1, (public.hoy_lima() - 400))`, [ids.junta])).toMatch(/primer día del mes|No hay cuotas/)
  })
})

describe('Degradación controlada', () => {
  it('con la falla simulada se aplica la regla manual de respaldo, sin probabilidad inventada', async () => {
    await comoAdmin()
    expect(await rpc('public.simular_falla_modelo($1, true)', [ids.junta])).toMatchObject({ simular_falla_modelo: true })
    const r = await calcularPeriodo()
    expect(r).toMatchObject({ cuotas: 2, respaldo: 2, motivos_respaldo: ['falla_simulada'], modelo_version: 'regla-respaldo' })
    const v = await vigentes()
    expect(v.map(x => [x.unidad_codigo, x.nivel_riesgo, x.origen, x.motivo_respaldo, x.probabilidad]))
      .toEqual([['Casa 01', 'alto', 'regla_respaldo', 'falla_simulada', null], ['Casa 02', 'bajo', 'regla_respaldo', 'falla_simulada', null]])
    await comoPostgres()
    const [a] = await filas<{ n: number }>(db, `select count(*)::int as n from public.auditoria where junta_id = $1 and accion = 'simular_falla_modelo'`, [ids.junta])
    expect(a.n).toBe(1)
  })

  it('al restablecer el modelo vuelve a calcular con v1', async () => {
    await comoAdmin()
    await rpc('public.simular_falla_modelo($1, false)', [ids.junta])
    expect(await calcularPeriodo()).toMatchObject({ respaldo: 0, modelo_version: 'v1' })
    expect((await vigentes()).every(x => x.origen === 'modelo')).toBe(true)
  })

  it('la falla simulada no existe fuera de la junta de demostración', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminReal })
    expect(await errorDe(db, 'select public.simular_falla_modelo($1, true)', [ids.real])).toMatch(/junta de demostración/)
    await comoAdmin()
    expect(await errorDe(db, 'select public.simular_falla_modelo($1, true)', [ids.real])).toMatch(/permiso/)
  })

  it('sin modelo activo el cálculo no se cae: usa la regla y lo explica', async () => {
    await comoPostgres()
    await db.query(`update public.modelos_ml set activo = false where version = 'v1'`)
    await comoAdmin()
    const r = await rpc<Resumen>('public.calcular_riesgo_morosidad($1, null, 62)', [ids.junta])
    expect(r).toMatchObject({ respaldo: 2, motivos_respaldo: ['modelo_no_disponible'] })
    await comoPostgres()
    await db.query(`update public.modelos_ml set activo = true where version = 'v1'`)
  })

  it('una entrada incoherente se escala a revisión y una salida fuera de rango usa la regla', async () => {
    await comoPostgres()
    const [{ p }] = await filas<{ p: unknown }>(db, `select parametros as p from public.modelos_ml where version = 'v1'`)
    const evaluar = (parametros: unknown, entrada: Record<string, unknown>) =>
      rpc<{ origen: string; motivo_respaldo: string; nivel_riesgo: string; probabilidad: number | null }>('public.ml_evaluar($1::jsonb, $2::jsonb)', [JSON.stringify(parametros), JSON.stringify(entrada)])
    const ok = { pagos_atrasados_previos: 1, atrasos_previos_total: 2, tasa_atraso_previa: 0.2, dias_atraso_promedio_previo: 3 }
    expect(await evaluar(p, ok)).toMatchObject({ origen: 'modelo' })
    expect(await evaluar(p, { ...ok, tasa_atraso_previa: 1.5 })).toMatchObject({ origen: 'regla_respaldo', motivo_respaldo: 'entrada_fuera_de_rango', nivel_riesgo: 'medio', probabilidad: null })
    expect(await evaluar(p, { ...ok, atrasos_previos_total: 0 })).toMatchObject({ motivo_respaldo: 'entrada_fuera_de_rango' })
    expect(await evaluar(p, { ...ok, pagos_atrasados_previos: 'dos' })).toMatchObject({ motivo_respaldo: 'entrada_fuera_de_rango' })
    expect(await evaluar({ ...(p as object), umbral: 7 }, ok)).toMatchObject({ origen: 'regla_respaldo', motivo_respaldo: 'salida_fuera_de_rango', nivel_riesgo: 'alto' })
    const enorme = { ...(p as { coeficientes: Record<string, number> }), coeficientes: { ...(p as { coeficientes: Record<string, number> }).coeficientes, atrasos_previos_total: -1e308 } }
    expect(await evaluar(enorme, ok)).toMatchObject({ origen: 'regla_respaldo', motivo_respaldo: 'error_modelo' })
  })

  it('las funciones internas de evaluación no se exponen a la API', async () => {
    await comoAdmin()
    expect(await errorDe(db, `select public.ml_evaluar('{}'::jsonb, '{}'::jsonb)`)).toMatch(/permission denied/)
    expect(await errorDe(db, `select public.ml_calcular($1, public.hoy_lima(), 31)`, [ids.junta])).toMatch(/permission denied/)
  })
})

describe('Escenario (b): entradas inválidas rechazadas con un mensaje claro', () => {
  const probar = (entrada: Record<string, unknown>) => errorDe(db, 'select public.probar_entrada_modelo($1, $2::jsonb)', [ids.junta, JSON.stringify(entrada)])
  const ok = { pagos_atrasados_previos: 2, atrasos_previos_total: 5, tasa_atraso_previa: 0.4167, dias_atraso_promedio_previo: 4.5 }

  it('un caso válido escrito a mano devuelve la probabilidad del modelo y queda registrado', async () => {
    await comoAdmin()
    const r = await rpc<{ origen: string; nivel_riesgo: string; probabilidad: number; modelo_version: string }>('public.probar_entrada_modelo($1, $2::jsonb)', [ids.junta, JSON.stringify(ok)])
    expect(r).toMatchObject({ origen: 'modelo', modelo_version: 'v1', nivel_riesgo: 'alto' })
    expect(r.probabilidad).toBeCloseTo(0.4503, 4)    // mismo ejemplo y resultado de inferencia.py (APF3)
    await comoPostgres()
    expect(await filas(db, `select 1 from public.registro_predicciones where junta_id = $1 and tipo = 'caso_manual'`, [ids.junta])).toHaveLength(1)
  })

  it.each([
    [{ ...ok, tasa_atraso_previa: '' }, /Falta el dato «tasa_atraso_previa»/],
    [{ ...ok, atrasos_previos_total: 'cinco' }, /debe ser un número/],
    [{ ...ok, dias_atraso_promedio_previo: -1 }, /no puede ser negativo/],
    [{ ...ok, pagos_atrasados_previos: 4, atrasos_previos_total: 6 }, /van de 0 a 3/],
    [{ ...ok, atrasos_previos_total: 1 }, /no pueden ser menos/],
    [{ ...ok, tasa_atraso_previa: 1.4 }, /va de 0 a 1/],
    [{ ...ok, pagos_atrasados_previos: 1.5 }, /números enteros/],
  ])('rechaza %j', async (entrada, mensaje) => {
    await comoAdmin()
    expect(await probar(entrada)).toMatch(mensaje)
  })

  it('un propietario no puede probar el modelo', async () => {
    await como(db, { tipo: 'usuario', id: ids.prop })
    expect(await probar(ok)).toMatch(/permiso/)
  })
})

describe('Acción de la administración: recordatorio', () => {
  it('registra un recordatorio sobre la alerta, lo muestra en la predicción y lo audita', async () => {
    const [casa01] = await vigentes()
    await comoAdmin()
    expect(await rpc(`public.registrar_recordatorio($1, 'whatsapp', 'Recordatorio antes del vencimiento')`, [casa01.cuota_id])).toMatchObject({ canal: 'whatsapp' })
    const [despues] = await vigentes()
    expect(despues.ultimo_recordatorio).toBeTruthy()
    await comoPostgres()
    const [a] = await filas<{ n: number }>(db, `select count(*)::int as n from public.auditoria where junta_id = $1 and accion = 'registrar_recordatorio'`, [ids.junta])
    expect(a.n).toBe(1)
  })

  it('rechaza un canal no válido y una nota demasiado larga', async () => {
    const [casa01] = await vigentes()
    await comoAdmin()
    expect(await errorDe(db, `select public.registrar_recordatorio($1, 'telegrama')`, [casa01.cuota_id])).toMatch(/Elige el canal/)
    expect(await errorDe(db, `select public.registrar_recordatorio($1, 'llamada', $2)`, [casa01.cuota_id, 'x'.repeat(201)])).toMatch(/200 caracteres/)
  })

  it('un propietario no ve predicciones, recordatorios ni la bitácora, y no puede calcular', async () => {
    const [casa01] = await vigentes()
    await como(db, { tipo: 'usuario', id: ids.prop })
    expect(await errorDe(db, `select public.registrar_recordatorio($1, 'whatsapp')`, [casa01.cuota_id])).toMatch(/permiso/)
    expect(await errorDe(db, 'select public.calcular_riesgo_periodo($1, $2::date)', [ids.junta, mesSiguiente])).toMatch(/permiso/)
    expect(await errorDe(db, 'select * from public.predicciones_vigentes($1)', [ids.junta])).toMatch(/permiso/)
    expect(await filas(db, 'select 1 from public.recordatorios')).toHaveLength(0)
    expect(await filas(db, 'select 1 from public.registro_predicciones')).toHaveLength(0)
    expect(await filas(db, 'select 1 from public.predicciones_morosidad')).toHaveLength(0)
  })
})
