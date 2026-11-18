// Modo demostración: cuentas públicas de prueba protegidas y restauración de la junta.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

let db: PGlite
const ids = {
  junta: '00000000-0000-4000-8000-0000000000d1',
  admin: '10000000-0000-4000-8000-0000000000d1',
  propDemo: '20000000-0000-4000-8000-0000000000d1',
  propComun: '20000000-0000-4000-8000-0000000000d2',
  extrano: '20000000-0000-4000-8000-0000000000d3',
  u1: '30000000-0000-4000-8000-0000000000d1',
  u2: '30000000-0000-4000-8000-0000000000d2',
  u3: '30000000-0000-4000-8000-0000000000d3',
}
let hoy = ''

async function crearUsuario(id: string, email: string, meta: Record<string, unknown>, demo = false) {
  await como(db, { tipo: 'postgres' })
  await db.query(
    'insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4, $5)',
    [id, email, `hash-original-${id.slice(-2)}`, JSON.stringify(demo ? { demo: true } : {}), JSON.stringify(meta)])
}

// Foto comparable del estado de la junta (sin columnas que cambian solas).
async function foto() {
  await como(db, { tipo: 'postgres' })
  const q = async (sql: string) => JSON.stringify(await filas(db, sql, [ids.junta]))
  return {
    junta: await q('select nombre, cuota_mensual, dia_vencimiento, yape_titular, yape_qr_path, conciliacion_automatica from public.juntas where id = $1'),
    codigo: await q('select codigo from public.juntas_invitacion where junta_id = $1'),
    cuotas: await q('select id, estado, fecha_pago, pago_id, monto from public.cuotas where junta_id = $1 order by id'),
    pagos: await q('select id, estado, monto_declarado from public.pagos where junta_id = $1 order by id'),
    egresos: await q('select id, monto, anulado from public.egresos where junta_id = $1 order by id'),
    camaras: await q('select id, nombre, tipo from public.camaras where junta_id = $1 order by id'),
    unidades: await q('select id, codigo, activa from public.unidades where junta_id = $1 order by id'),
    vinculos: await q('select unidad_id, perfil_id from public.unidad_propietarios where junta_id = $1 and hasta is null order by unidad_id'),
  }
}

beforeAll(async () => {
  db = await crearBaseDePrueba()
  hoy = (await filas<{ h: string }>(db, 'select public.hoy_lima()::text as h'))[0].h
  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, yape_titular, es_simulado) values
      ('${ids.junta}', 'Junta demo de prueba', 150, 28, 'Titular demo', true);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.junta}', 'DEMO2026');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values
      ('${ids.u1}', '${ids.junta}', 'Casa 01', true), ('${ids.u2}', '${ids.junta}', 'Casa 02', true), ('${ids.u3}', '${ids.junta}', 'Casa 03', true);
  `)
  await crearUsuario(ids.admin, 'admin@arcomunity.demo', { nombre_completo: 'Administración demo', acepto_datos: 'true' }, true)
  await db.exec(`insert into public.miembros_junta (junta_id, perfil_id, rol) values ('${ids.junta}', '${ids.admin}', 'admin')`)
  await crearUsuario(ids.propDemo, 'casa01@arcomunity.demo', { nombre_completo: 'Vecina demo', codigo_invitacion: 'DEMO2026', unidad_id: ids.u1, acepto_datos: 'true' }, true)
  await crearUsuario(ids.propComun, 'casa02@ejemplo.test', { nombre_completo: 'Vecino común', codigo_invitacion: 'DEMO2026', unidad_id: ids.u2, acepto_datos: 'true' })
  await como(db, { tipo: 'usuario', id: ids.admin })
  await db.query('select public.generar_cuotas($1)', [ids.junta])
  await db.query(`select public.registrar_egreso($1, $2::date, 'pago_vigilante', 'Vigilancia demo', 900, null)`, [ids.junta, hoy])
  await db.query(`select public.guardar_camara($1, null, 'Ingreso', 'Puerta', 'simulada', null, true)`, [ids.junta])
  await como(db, { tipo: 'postgres' })
  await db.query('update public.juntas set modo_demo = true where id = $1', [ids.junta])
  await db.query('select public.guardar_estado_demo($1)', [ids.junta])
})

describe('Cuentas de demostración protegidas', () => {
  it('no cambian contraseña, correo ni teléfono', async () => {
    await como(db, { tipo: 'postgres' }) // GoTrue escribe en auth.users con su propio rol
    expect(await errorDe(db, `update auth.users set encrypted_password = 'nuevo' where id = $1`, [ids.admin])).toMatch(/no pueden cambiar su contraseña/)
    expect(await errorDe(db, `update auth.users set email = 'otro@x.test' where id = $1`, [ids.propDemo])).toMatch(/no pueden cambiar/)
    expect(await errorDe(db, `update auth.users set email_change = 'otro@x.test' where id = $1`, [ids.propDemo])).toMatch(/no pueden cambiar/)
    expect(await errorDe(db, `update auth.users set phone = '51999999999' where id = $1`, [ids.propDemo])).toMatch(/no pueden cambiar/)
  })

  it('las cuentas normales sí pueden cambiar su contraseña y los inicios de sesión no se bloquean', async () => {
    await como(db, { tipo: 'postgres' })
    expect(await errorDe(db, `update auth.users set encrypted_password = 'nuevo' where id = $1`, [ids.propComun])).toBeNull()
    expect(await errorDe(db, `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"x":1}' where id = $1`, [ids.admin])).toBeNull()
  })

  it('no cambian su nombre ni teléfono desde Mi cuenta', async () => {
    await como(db, { tipo: 'usuario', id: ids.propDemo })
    expect(await errorDe(db, `update public.perfiles set nombre_completo = 'Otro nombre' where id = $1`, [ids.propDemo])).toMatch(/no pueden cambiar su nombre/)
    await como(db, { tipo: 'usuario', id: ids.propComun })
    expect(await errorDe(db, `update public.perfiles set telefono = '987654321' where id = $1`, [ids.propComun])).toBeNull()
  })
})

describe('Junta en modo demostración', () => {
  const configurar = (nombre: string, cuota: number, titular: string, codigo: string) =>
    errorDe(db, `select public.actualizar_configuracion($1, $2, $3, 28, $4, true, true, $5)`, [ids.junta, nombre, cuota, titular, codigo])

  it('permite ajustar cuota y opciones, pero no nombre, titular, QR ni código', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await configurar('Junta demo de prueba', 175, 'Titular demo', 'DEMO2026')).toBeNull()
    expect(await configurar('Otra junta', 175, 'Titular demo', 'DEMO2026')).toMatch(/nombre de la junta/)
    expect(await configurar('Junta demo de prueba', 175, 'Mi cuenta personal', 'DEMO2026')).toMatch(/titular/)
    expect(await configurar('Junta demo de prueba', 175, 'Titular demo', 'NUEVO2026')).toMatch(/código de invitación no se puede cambiar/)
    expect(await errorDe(db, 'select public.generar_codigo_invitacion($1)', [ids.junta])).toMatch(/código de invitación no se puede cambiar/)
  })

  it('no desvincula a las cuentas demo ni desactiva sus unidades', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, 'select public.desvincular_propietario($1)', [ids.u1])).toMatch(/no se puede desvincular/)
    expect(await errorDe(db, 'select public.cambiar_estado_unidad($1, false)', [ids.u1])).toMatch(/no se puede desactivar/)
    // Con otras unidades sí se puede probar la función (se restaura después).
    expect(await errorDe(db, 'select public.desvincular_propietario($1)', [ids.u2])).toBeNull()
    expect(await errorDe(db, 'select public.cambiar_estado_unidad($1, false)', [ids.u3])).toBeNull()
  })

  it('solo admite cámaras simuladas (sin enlaces externos)', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, `select public.guardar_camara($1, null, 'Externa', 'Calle', 'embed', 'https://ejemplo.test/video', true)`, [ids.junta])).toMatch(/solo se pueden usar cámaras simuladas/)
    expect(await errorDe(db, `select public.guardar_camara($1, null, 'Patio', 'Patio', 'simulada', null, true)`, [ids.junta])).toBeNull()
  })
})

describe('Restauración de la demostración', () => {
  it('solo la ejecuta el equipo técnico', async () => {
    await como(db, { tipo: 'anon' })
    expect(await errorDe(db, 'select public.restaurar_estado_demo($1)', [ids.junta])).toMatch(/permission denied/)
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, 'select public.restaurar_estado_demo($1)', [ids.junta])).toMatch(/permission denied/)
    expect(await errorDe(db, 'select public.guardar_estado_demo($1)', [ids.junta])).toMatch(/permission denied/)
    expect(await errorDe(db, 'select * from public.demo_estados')).toMatch(/permission denied/)
  })

  it('devuelve cuotas, pagos, egresos, cámaras, configuración, unidades, vínculos y contraseñas', async () => {
    await como(db, { tipo: 'postgres' })
    // Estado guardado (antes de las pruebas anteriores): se vuelve a medir tras restaurar.
    await db.query('select public.restaurar_estado_demo($1)', [ids.junta])
    const inicial = await foto()

    // Uso normal de la demostración por un visitante.
    const [cuota] = await filas<{ id: string }>(db, `select id from public.cuotas where unidad_id = $1`, [ids.u1])
    await como(db, { tipo: 'usuario', id: ids.propDemo })
    await db.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [`${ids.junta}/${ids.u1}/demo.jpg`])
    const pago = (await filas<{ r: { pago_id: string } }>(db, `select public.enviar_pago($1, 'yape_captura', 140, $2::date, 'OPDEMO1', $3) as r`,
      [cuota.id, hoy, `${ids.junta}/${ids.u1}/demo.jpg`]))[0].r
    await como(db, { tipo: 'usuario', id: ids.admin })
    await db.query(`select public.revisar_pago($1, 'aprobar')`, [pago.pago_id])
    await db.query(`select public.registrar_egreso($1, $2::date, 'otros', 'Gasto de prueba', 50, null)`, [ids.junta, hoy])
    await db.query(`select public.anular_egreso(id, 'Prueba de anulación') from public.egresos where junta_id = $1 and monto = 900`, [ids.junta])
    await db.query(`select public.guardar_camara($1, null, 'Extra', 'Extra', 'simulada', null, true)`, [ids.junta])
    await db.query(`select public.eliminar_camara(id) from public.camaras where junta_id = $1 and nombre = 'Ingreso'`, [ids.junta])
    await db.query(`select public.actualizar_configuracion($1, 'Junta demo de prueba', 999, 15, 'Titular demo', false, false, 'DEMO2026')`, [ids.junta])
    await db.query('select public.desvincular_propietario($1)', [ids.u2])
    await como(db, { tipo: 'postgres' })
    await db.query(`insert into public.unidades (junta_id, codigo) values ($1, 'Casa 99')`, [ids.junta])
    // Alguien se registra con el código público en una unidad libre.
    await crearUsuario(ids.extrano, 'visitante@ejemplo.test', { nombre_completo: 'Visitante', codigo_invitacion: 'DEMO2026', unidad_id: ids.u3, acepto_datos: 'true' })
    // Contraseña alterada por otra vía (simula un cambio que se haya colado).
    await db.query(`select set_config('arcomunity.restaurando_demo', 'on', false)`)
    await db.query(`update auth.users set encrypted_password = 'alterada' where id = $1`, [ids.admin])
    await db.query(`select set_config('arcomunity.restaurando_demo', '', false)`)
    expect(await foto()).not.toEqual(inicial)

    await como(db, { tipo: 'servicio' })
    const [r] = await filas<{ r: { ok: boolean; pagos_quitados: number; registros_desvinculados: number } }>(db, 'select public.restaurar_estado_demo($1) as r', [ids.junta])
    expect(r.r).toMatchObject({ ok: true, pagos_quitados: 1, registros_desvinculados: 1 })
    expect(await foto()).toEqual(inicial)

    await como(db, { tipo: 'postgres' })
    expect((await filas<{ p: string }>(db, 'select encrypted_password as p from auth.users where id = $1', [ids.admin]))[0].p).toBe('hash-original-d1')
    // El visitante conserva su cuenta, pero ya no está vinculado a la junta demo.
    expect(await filas(db, 'select 1 from auth.users where id = $1', [ids.extrano])).toHaveLength(1)
    expect((await filas<{ activo: boolean }>(db, 'select activo from public.miembros_junta where perfil_id = $1', [ids.extrano]))[0].activo).toBe(false)
    // La auditoría no se borra: se agrega el registro de la restauración.
    const acciones = (await filas<{ accion: string }>(db, 'select accion from public.auditoria where junta_id = $1', [ids.junta])).map(a => a.accion)
    expect(acciones).toContain('aprobar_pago')
    expect(acciones).toContain('restaurar_demo')
    // Las protecciones vuelven a regir después de restaurar.
    expect(await errorDe(db, `update auth.users set encrypted_password = 'x' where id = $1`, [ids.admin])).toMatch(/no pueden cambiar/)
  })

  it('el diagnóstico es solo para el servicio', async () => {
    await como(db, { tipo: 'usuario', id: ids.admin })
    expect(await errorDe(db, 'select public.estado_demo($1)', [ids.junta])).toMatch(/permission denied/)
    await como(db, { tipo: 'servicio' })
    const [d] = await filas<{ r: Record<string, unknown> }>(db, 'select public.estado_demo($1) as r', [ids.junta])
    expect(d.r).toMatchObject({ modo_demo: true, cuentas_demo: 2, restauracion_nocturna: null })
    expect(d.r.foto_del).toBeTruthy()
  })

  it('el servicio puede guardar una nueva foto', async () => {
    await como(db, { tipo: 'servicio' })
    const [g] = await filas<{ r: { cuotas: number; cuentas_demo: number } }>(db, 'select public.guardar_estado_demo($1) as r', [ids.junta])
    expect(g.r.cuotas).toBeGreaterThan(0)
    expect(g.r.cuentas_demo).toBe(2)
  })
})
