// Herramientas de demostración en Auditoría (migración 1300): preparar y reiniciar desde la web.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

let db: PGlite
const ids = {
  junta: '00000000-0000-4000-8000-0000000000f1', real: '00000000-0000-4000-8000-0000000000f2',
  admin: '10000000-0000-4000-8000-0000000000f1', adminReal: '10000000-0000-4000-8000-0000000000f2',
  casa12: '20000000-0000-4000-8000-0000000000f1', casa08: '20000000-0000-4000-8000-0000000000f2',
  dpto301: '20000000-0000-4000-8000-0000000000f3',
  u12: '30000000-0000-4000-8000-0000000000f1', u08: '30000000-0000-4000-8000-0000000000f2',
  u301: '30000000-0000-4000-8000-0000000000f3',
}
let hoy = ''
let mesAnterior = ''
let mesSiguiente = ''
const comprobante08 = () => `${ids.junta}/${ids.u08}/pago-en-revision.jpg`

async function usuario(id: string, email: string, meta: Record<string, unknown>, demo: boolean) {
  await como(db, { tipo: 'postgres' })
  await db.query('insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4, $5)',
    [id, email, `hash-${id.slice(-2)}`, JSON.stringify(demo ? { demo: true } : {}),
      JSON.stringify({ nombre_completo: email.split('@')[0], acepto_datos: 'true', ...meta })])
}

async function pagar(perfil: string, unidad: string, archivo: string) {
  await como(db, { tipo: 'postgres' })
  const [cuota] = await filas<{ id: string }>(db, `select id from public.cuotas where unidad_id = $1 and periodo = $2::date`, [unidad, mesAnterior])
  await como(db, { tipo: 'usuario', id: perfil })
  await db.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [archivo])
  const [r] = await filas<{ r: { pago_id: string } }>(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, $3, $4) as r`,
    [cuota.id, hoy, `OP${unidad.slice(-2)}${Date.now() % 100000}`, archivo])
  return r.r.pago_id
}

const rpc = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await filas<{ r: T }>(db, `select ${sql} as r`, params))[0].r

async function foto() {
  await como(db, { tipo: 'postgres' })
  const q = async (sql: string) => JSON.stringify(await filas(db, sql, [ids.junta]))
  return {
    cuotas: await q('select id, estado, pago_id from public.cuotas where junta_id = $1 order by id'),
    pagos: await q('select id, estado from public.pagos where junta_id = $1 order by id'),
    egresos: await q('select id, monto, anulado from public.egresos where junta_id = $1 order by id'),
    junta: await q('select cuota_mensual, dia_vencimiento, conciliacion_automatica from public.juntas where id = $1'),
  }
}
const contar = async (sql: string, params: unknown[] = [ids.junta]) => {
  await como(db, { tipo: 'postgres' })
  return Number((await filas<{ n: string }>(db, sql, params))[0].n)
}

beforeAll(async () => {
  db = await crearBaseDePrueba()
  const [f] = await filas<{ h: string; a: string; s: string }>(db, `select public.hoy_lima()::text as h,
    (date_trunc('month', public.hoy_lima()) - interval '1 month')::date::text as a,
    (date_trunc('month', public.hoy_lima()) + interval '1 month')::date::text as s`)
  ;({ h: hoy, a: mesAnterior, s: mesSiguiente } = f)
  // Vence el día 1: la cuota del mes anterior ya venció y la del mes siguiente vence en ≤ 31 días.
  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado, conciliacion_automatica) values
      ('${ids.junta}', 'Junta demo', 150, 1, true, false), ('${ids.real}', 'Junta real', 120, 1, false, false);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.junta}', 'DEMOF2026'), ('${ids.real}', 'REALF2026');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values
      ('${ids.u12}', '${ids.junta}', 'Casa 12', true), ('${ids.u08}', '${ids.junta}', 'Casa 08', true),
      ('${ids.u301}', '${ids.junta}', 'Dpto 301', true);
  `)
  await usuario(ids.admin, 'admin@arcomunity.demo', {}, true)
  await usuario(ids.adminReal, 'admin-real@ejemplo.test', {}, false)
  await db.exec(`insert into public.miembros_junta (junta_id, perfil_id, rol) values
    ('${ids.junta}', '${ids.admin}', 'admin'), ('${ids.real}', '${ids.adminReal}', 'admin')`)
  await usuario(ids.casa12, 'casa12@arcomunity.demo', { codigo_invitacion: 'DEMOF2026', unidad_id: ids.u12 }, true)
  await usuario(ids.casa08, 'casa08@arcomunity.demo', { codigo_invitacion: 'DEMOF2026', unidad_id: ids.u08 }, true)
  await usuario(ids.dpto301, 'dpto301@arcomunity.demo', { codigo_invitacion: 'DEMOF2026', unidad_id: ids.u301 }, true)
  await como(db, { tipo: 'usuario', id: ids.admin })
  await db.query('select public.generar_cuotas($1, $2::date)', [ids.junta, mesAnterior])
  // Casa 08: pago en revisión. Dpto 301: pagado y aprobado. Casa 12: cuota vencida sin pagar.
  await pagar(ids.casa08, ids.u08, comprobante08())
  const p301 = await pagar(ids.dpto301, ids.u301, `${ids.junta}/${ids.u301}/pago-aprobado.jpg`)
  await como(db, { tipo: 'usuario', id: ids.admin })
  await db.query(`select public.revisar_pago($1, 'aprobar')`, [p301])
  await como(db, { tipo: 'postgres' })
  await db.query('update public.juntas set modo_demo = true where id = $1', [ids.junta])
  await db.query('select public.guardar_estado_demo($1)', [ids.junta])
})

describe('Acceso a las herramientas de demostración', () => {
  it('visitantes y propietarios no pueden ejecutarlas', async () => {
    await como(db, { tipo: 'anon' })
    for (const f of ['preparar_demostracion', 'reiniciar_demostracion', 'diagnostico_demostracion']) {
      expect(await errorDe(db, `select public.${f}($1)`, [ids.junta])).toMatch(/permission denied/)
    }
    await como(db, { tipo: 'usuario', id: ids.casa12 })
    for (const f of ['preparar_demostracion', 'reiniciar_demostracion', 'diagnostico_demostracion']) {
      expect(await errorDe(db, `select public.${f}($1)`, [ids.junta])).toMatch(/No tienes permiso/)
    }
  })

  it('la administración de otra junta no puede tocar la demo ni usar las herramientas en una junta real', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminReal })
    expect(await errorDe(db, 'select public.reiniciar_demostracion($1)', [ids.junta])).toMatch(/No tienes permiso/)
    expect(await errorDe(db, 'select public.preparar_demostracion($1)', [ids.real])).toMatch(/solo están disponibles en la junta de demostración/)
    expect(await errorDe(db, 'select public.reiniciar_demostracion($1)', [ids.real])).toMatch(/solo están disponibles en la junta de demostración/)
  })

  it('las funciones internas no se pueden llamar directamente', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, 'select public.restaurar_demo_datos($1)', [ids.junta])).toMatch(/permission denied/)
    expect(await errorDe(db, 'select public.escenarios_demo($1)', [ids.junta])).toMatch(/permission denied/)
    expect(await errorDe(db, 'select public.restaurar_estado_demo($1)', [ids.junta])).toMatch(/permission denied/)
  })
})

describe('Preparar demostración', () => {
  it('el diagnóstico confirma los tres escenarios sin cambios', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const d = await rpc<{ escenarios: { cuenta: string; ok: boolean }[]; cambios: Record<string, number>; cuotas_mes_siguiente: number; modelo_activo: string }>(
      'public.diagnostico_demostracion($1)', [ids.junta])
    expect(d.escenarios.map(e => [e.cuenta, e.ok])).toEqual([['Casa 12', true], ['Casa 08', true], ['Dpto. 301', true]])
    expect(d.cambios).toEqual({ pagos_nuevos: 0, pagos_revisados: 0, egresos_nuevos: 0, cuotas_nuevas: 0 })
    expect(d.cuotas_mes_siguiente).toBe(0)
    expect(d.modelo_activo).toBe('v1')
  })

  it('genera las cuotas del mes siguiente y calcula el riesgo real; repetirlo no duplica nada', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const r1 = await rpc<{ periodo: string; cuotas_creadas: number; predicciones: number; alto: number; bajo: number; medio: number; modelo: string; avisos: string[] }>(
      'public.preparar_demostracion($1)', [ids.junta])
    expect(r1).toMatchObject({ periodo: mesSiguiente, cuotas_creadas: 3, predicciones: 3, modelo: 'v1', avisos: [] })
    expect(r1.alto + r1.medio + r1.bajo).toBe(3)
    const probs1 = JSON.stringify(await filas(db, 'select cuota_id, probabilidad, nivel_riesgo from public.predicciones_morosidad where junta_id = $1 order by cuota_id', [ids.junta]))

    const r2 = await rpc<{ cuotas_creadas: number; cuotas_existentes: number; predicciones: number }>('public.preparar_demostracion($1)', [ids.junta])
    expect(r2).toMatchObject({ cuotas_creadas: 0, cuotas_existentes: 3, predicciones: 3 })
    expect(await contar('select count(*) as n from public.cuotas where junta_id = $1 and periodo = $2::date', [ids.junta, mesSiguiente])).toBe(3)
    expect(await contar('select count(*) as n from public.predicciones_morosidad where junta_id = $1')).toBe(3)
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(JSON.stringify(await filas(db, 'select cuota_id, probabilidad, nivel_riesgo from public.predicciones_morosidad where junta_id = $1 order by cuota_id', [ids.junta]))).toBe(probs1)
  })

  it('queda en la auditoría con el nombre de quien la ejecutó', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const a = await filas<{ actor_id: string; detalle: { predicciones: number } }>(db,
      `select actor_id, detalle from public.auditoria where junta_id = $1 and accion = 'preparar_demo' order by id`, [ids.junta])
    expect(a).toHaveLength(2)
    expect(a[0]).toMatchObject({ actor_id: ids.admin, detalle: { predicciones: 3 } })
  })

  it('si un ensayo revisó el pago de Casa 08, lo avisa en vez de inventar uno', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    const [p] = await filas<{ id: string }>(db, `select id from public.pagos where unidad_id = $1 and estado = 'pendiente_revision'`, [ids.u08])
    await db.query(`select public.revisar_pago($1, 'rechazar', 'Comprobante ilegible')`, [p.id])
    const d = await rpc<{ cambios: { pagos_revisados: number } }>('public.diagnostico_demostracion($1)', [ids.junta])
    expect(d.cambios.pagos_revisados).toBe(1)
    const r = await rpc<{ avisos: string[] }>('public.preparar_demostracion($1)', [ids.junta])
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/Casa 08 ya no tiene un pago en revisión/)
    expect(await contar(`select count(*) as n from public.pagos where junta_id = $1 and estado = 'pendiente_revision'`)).toBe(0)
  })
})

describe('Reiniciar demostración', () => {
  it('vuelve a la foto, quita predicciones y cuotas nuevas, conserva la auditoría y lista los archivos del ensayo', async () => {
    await como(db, { tipo: 'servicio' })
    await db.query('select public.restaurar_estado_demo($1)', [ids.junta])
    const inicial = await foto()
    const auditoriaAntes = await contar('select count(*) as n from public.auditoria where junta_id = $1')

    // Ensayo: Casa 12 paga con un comprobante nuevo, la administración registra un egreso y prepara.
    const sobrante = `${ids.junta}/${ids.u12}/ensayo.jpg`
    await pagar(ids.casa12, ids.u12, sobrante)
    await como(db, { tipo: 'usuario', id: ids.admin })
    await db.query(`select public.registrar_egreso($1, $2::date, 'otros', 'Gasto del ensayo', 40, null)`, [ids.junta, hoy])
    await db.query('select public.preparar_demostracion($1)', [ids.junta])
    expect(await foto()).not.toEqual(inicial)

    await como(db, { tipo: 'usuario', id: ids.admin })
    const r = await rpc<{ ok: boolean; pagos_quitados: number; predicciones_quitadas: number; archivos: { bucket: string; nombre: string }[] }>(
      'public.reiniciar_demostracion($1)', [ids.junta])
    expect(r).toMatchObject({ ok: true, pagos_quitados: 1, predicciones_quitadas: 3 })
    expect(r.archivos).toEqual([{ bucket: 'comprobantes', nombre: sobrante }])
    expect(await foto()).toEqual(inicial)
    expect(await contar('select count(*) as n from public.predicciones_morosidad where junta_id = $1')).toBe(0)
    expect(await contar('select count(*) as n from public.cuotas where junta_id = $1 and periodo = $2::date', [ids.junta, mesSiguiente])).toBe(0)
    // La auditoría no pierde registros: suma el pago, el egreso, la preparación y el reinicio.
    expect(await contar('select count(*) as n from public.auditoria where junta_id = $1')).toBeGreaterThan(auditoriaAntes)
    const [ultimo] = await filas<{ accion: string; actor_id: string }>(db,
      'select accion, actor_id from public.auditoria where junta_id = $1 order by id desc limit 1', [ids.junta])
    expect(ultimo).toEqual({ accion: 'reiniciar_demo', actor_id: ids.admin })
    // Los escenarios vuelven a estar listos y las protecciones siguen activas.
    await como(db, { tipo: 'usuario', id: ids.admin })
    const d = await rpc<{ escenarios: { ok: boolean }[] }>('public.diagnostico_demostracion($1)', [ids.junta])
    expect(d.escenarios.every(e => e.ok)).toBe(true)
    await como(db, { tipo: 'postgres' })
    expect(await errorDe(db, `update auth.users set encrypted_password = 'x' where id = $1`, [ids.admin])).toMatch(/no pueden cambiar/)
  })

  it('solo se pueden borrar los archivos del ensayo que nadie usa', async () => {
    const sobrante = `${ids.junta}/${ids.u12}/ensayo.jpg`
    await como(db, { tipo: 'usuario', id: ids.casa12 })
    expect((await db.query(`delete from storage.objects where bucket_id = 'comprobantes' and name = $1`, [sobrante])).affectedRows).toBe(0)
    await como(db, { tipo: 'usuario', id: ids.adminReal })
    expect((await db.query(`delete from storage.objects where bucket_id = 'comprobantes' and name = $1`, [sobrante])).affectedRows).toBe(0)
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect((await db.query(`delete from storage.objects where bucket_id = 'comprobantes' and name = $1`, [comprobante08()])).affectedRows).toBe(0)
    expect((await db.query(`delete from storage.objects where bucket_id = 'comprobantes' and name = $1`, [sobrante])).affectedRows).toBe(1)
  })

  it('se puede repetir sin inconsistencias y no toca otras juntas', async () => {
    await como(db, { tipo: 'postgres' })
    const otra = JSON.stringify(await filas(db, 'select id, estado from public.cuotas where junta_id = $1 order by id', [ids.real]))
    const antes = await foto()
    await como(db, { tipo: 'usuario', id: ids.admin })
    const r = await rpc<{ pagos_quitados: number; archivos: unknown[] }>('public.reiniciar_demostracion($1)', [ids.junta])
    expect(r).toMatchObject({ pagos_quitados: 0, archivos: [] })
    expect(await foto()).toEqual(antes)
    await como(db, { tipo: 'postgres' })
    expect(JSON.stringify(await filas(db, 'select id, estado from public.cuotas where junta_id = $1 order by id', [ids.real]))).toBe(otra)
  })

  it('la restauración del servicio (pg_cron) sigue funcionando y también quita las predicciones', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    await db.query('select public.preparar_demostracion($1)', [ids.junta])
    await como(db, { tipo: 'servicio' })
    const r = await rpc<{ ok: boolean; predicciones_quitadas: number }>('public.restaurar_estado_demo($1)', [ids.junta])
    expect(r).toMatchObject({ ok: true, predicciones_quitadas: 3 })
  })
})
