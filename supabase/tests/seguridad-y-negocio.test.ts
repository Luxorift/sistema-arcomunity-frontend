// Pruebas de RLS, Storage y funciones financieras con identidades distintas y consultas directas
// (no a través de la interfaz). Se ejecutan con: npm run test:db
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

let db: PGlite
const ids = {
  juntaA: '00000000-0000-4000-8000-00000000000a',
  juntaB: '00000000-0000-4000-8000-00000000000b',
  adminA: '10000000-0000-4000-8000-000000000001',
  adminB: '10000000-0000-4000-8000-000000000002',
  propA1: '20000000-0000-4000-8000-000000000001',
  propA2: '20000000-0000-4000-8000-000000000002',
  intruso: '20000000-0000-4000-8000-000000000099',
  unidadA1: '30000000-0000-4000-8000-000000000001',
  unidadA2: '30000000-0000-4000-8000-000000000002',
  unidadA3: '30000000-0000-4000-8000-000000000003',
  unidadB1: '30000000-0000-4000-8000-0000000000b1',
}
let hoy = ''
let periodoActual = ''

async function crearUsuario(id: string, email: string, meta: Record<string, unknown>) {
  await como(db, { tipo: 'postgres' })
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)])
}

async function subirComprobante(usuario: string, nombre: string) {
  await como(db, { tipo: 'usuario', id: usuario })
  await db.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [nombre])
}

async function cuotaActual(unidad: string) {
  await como(db, { tipo: 'postgres' })
  const [c] = await filas<{ id: string; monto: string; estado: string }>(db,
    'select id, monto, estado from public.cuotas where unidad_id = $1 and periodo = $2', [unidad, periodoActual])
  return c
}

const enviarPago = (cuota: string, monto: number, op: string, path: string, extra: { fecha?: string; sha?: string; conf?: number | null; ex?: object | null } = {}) =>
  db.query(`select public.enviar_pago($1, 'yape_captura', $2, $3::date, $4, $5, $6, $7, $8) as r`,
    [cuota, monto, extra.fecha ?? hoy, op, path, extra.sha ?? null, extra.conf ?? null, extra.ex ? JSON.stringify(extra.ex) : null])

beforeAll(async () => {
  db = await crearBaseDePrueba()
  const [f] = await filas<{ hoy: string; periodo: string }>(db,
    `select public.hoy_lima()::text as hoy, date_trunc('month', public.hoy_lima())::date::text as periodo`)
  hoy = f.hoy
  periodoActual = f.periodo

  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado) values
      ('${ids.juntaA}', 'Junta A (simulada)', 150, 28, true),
      ('${ids.juntaB}', 'Junta B (simulada)', 200, 10, true);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.juntaA}', 'ARCO2026'), ('${ids.juntaB}', 'OTRA2026');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values
      ('${ids.unidadA1}', '${ids.juntaA}', 'Casa 01', true),
      ('${ids.unidadA2}', '${ids.juntaA}', 'Casa 02', true),
      ('${ids.unidadA3}', '${ids.juntaA}', 'Casa 03', true),
      ('${ids.unidadB1}', '${ids.juntaB}', 'Dpto 101', true);
  `)
  await crearUsuario(ids.adminA, 'admin-a@demo.test', { nombre_completo: 'Admin A', acepto_datos: 'true' })
  await crearUsuario(ids.adminB, 'admin-b@demo.test', { nombre_completo: 'Admin B', acepto_datos: 'true' })
  await db.exec(`insert into public.miembros_junta (junta_id, perfil_id, rol) values
    ('${ids.juntaA}', '${ids.adminA}', 'admin'), ('${ids.juntaB}', '${ids.adminB}', 'admin')`)
  // Propietarios registrados por el flujo real (signUp con metadata). Uno intenta escalar a admin.
  await crearUsuario(ids.propA1, 'casa01@demo.test', {
    nombre_completo: 'Vecina Uno', codigo_invitacion: 'arco2026', unidad_id: ids.unidadA1, acepto_datos: 'true', rol: 'admin',
  })
  await crearUsuario(ids.propA2, 'casa02@demo.test', {
    nombre_completo: 'Vecino Dos', codigo_invitacion: 'ARCO2026', unidad_id: ids.unidadA2, acepto_datos: 'true', telefono: '987654321',
  })
  await como(db, { tipo: 'usuario', id: ids.adminA })
  await db.query('select public.generar_cuotas($1)', [ids.juntaA])
  await como(db, { tipo: 'usuario', id: ids.adminB })
  await db.query('select public.generar_cuotas($1)', [ids.juntaB])
})

describe('Registro y roles', () => {
  it('asigna rol propietario aunque la metadata pida admin', async () => {
    await como(db, { tipo: 'postgres' })
    const r = await filas<{ rol: string }>(db, 'select rol from public.miembros_junta where perfil_id = $1', [ids.propA1])
    expect(r).toEqual([{ rol: 'propietario' }])
  })

  it('rechaza registro sin consentimiento, con código inválido o con unidad ocupada', async () => {
    await como(db, { tipo: 'postgres' })
    const base = { nombre_completo: 'Prueba', codigo_invitacion: 'ARCO2026', unidad_id: ids.unidadA3, acepto_datos: 'true' }
    const insertar = (email: string, meta: object) =>
      errorDe(db, 'insert into auth.users (email, raw_user_meta_data) values ($1, $2)', [email, JSON.stringify(meta)])
    expect(await insertar('x1@demo.test', { ...base, acepto_datos: 'false' })).toMatch(/tratamiento de datos/)
    expect(await insertar('x2@demo.test', { ...base, codigo_invitacion: 'FALSO123' })).toMatch(/código de invitación/)
    expect(await insertar('x3@demo.test', { ...base, unidad_id: ids.unidadA1 })).toMatch(/ya tiene un propietario/)
    expect(await insertar('x4@demo.test', { ...base, unidad_id: ids.unidadB1 })).toMatch(/unidad disponible/)
    expect(await insertar('x5@demo.test', { ...base, telefono: '12345' })).toMatch(/9 dígitos/)
  })

  it('anon solo ve unidades libres si conoce el código', async () => {
    await como(db, { tipo: 'anon' })
    expect(await filas(db, `select * from public.unidades_disponibles('NOEXISTE')`)).toHaveLength(0)
    const libres = await filas<{ codigo: string }>(db, `select codigo from public.unidades_disponibles('arco2026')`)
    expect(libres.map(u => u.codigo)).toEqual(['Casa 03'])
  })

  it('anon obtiene la hora del servidor en America/Lima', async () => {
    await como(db, { tipo: 'anon' })
    const [r] = await filas<{ r: { hoy_lima: string; zona_horaria: string } }>(db, 'select public.servidor_ahora() as r')
    expect(r.r.zona_horaria).toBe('America/Lima')
    expect(r.r.hoy_lima).toBe(hoy)
  })

  it('anon no puede leer tablas ni llamar funciones administrativas', async () => {
    await como(db, { tipo: 'anon' })
    for (const tabla of ['juntas', 'cuotas', 'pagos', 'perfiles', 'auditoria', 'egresos', 'juntas_invitacion']) {
      expect(await errorDe(db, `select * from public.${tabla}`)).toMatch(/permission denied/)
    }
    expect(await errorDe(db, 'select public.generar_cuotas($1)', [ids.juntaA])).toMatch(/permission denied/)
  })

  it('un propietario no puede auto-asignarse rol ni unidades', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, `insert into public.miembros_junta (junta_id, perfil_id, rol) values ($1, $2, 'admin')`, [ids.juntaA, ids.propA1])).toMatch(/permission denied/)
    expect(await errorDe(db, `update public.miembros_junta set rol = 'admin' where perfil_id = $1`, [ids.propA1])).toMatch(/permission denied/)
    expect(await errorDe(db, `insert into public.unidad_propietarios (junta_id, unidad_id, perfil_id) values ($1, $2, $3)`, [ids.juntaA, ids.unidadA3, ids.propA1])).toMatch(/permission denied/)
    const [ctx] = await filas<{ c: { membresias: { rol: string }[] } }>(db, 'select public.mi_contexto() as c')
    expect(ctx.c.membresias.map(m => m.rol)).toEqual(['propietario'])
  })

  it('el propietario edita solo su nombre y teléfono', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    await db.query(`update public.perfiles set telefono = '912345678' where id = $1`, [ids.propA1])
    const r = await db.query(`update public.perfiles set nombre_completo = 'Hackeado' where id = $1`, [ids.propA2])
    expect(r.affectedRows).toBe(0)
    expect(await errorDe(db, `update public.perfiles set acepto_datos = false where id = $1`, [ids.propA1])).toMatch(/permission denied/)
  })
})

describe('Aislamiento de datos (RLS)', () => {
  it('el propietario solo ve sus cuotas y no ve egresos, auditoría ni código de invitación', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const cuotas = await filas<{ unidad_id: string }>(db, 'select unidad_id from public.cuotas')
    expect(cuotas.length).toBeGreaterThan(0)
    expect(new Set(cuotas.map(c => c.unidad_id))).toEqual(new Set([ids.unidadA1]))
    expect(await filas(db, 'select * from public.egresos')).toHaveLength(0)
    expect(await filas(db, 'select * from public.auditoria')).toHaveLength(0)
    expect(await filas(db, 'select * from public.juntas_invitacion')).toHaveLength(0)
    expect(await filas(db, 'select * from public.juntas where id = $1', [ids.juntaB])).toHaveLength(0)
  })

  it('el propietario no ve perfiles de otros vecinos', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const perfiles = await filas<{ id: string }>(db, 'select id from public.perfiles')
    expect(perfiles.map(p => p.id)).toEqual([ids.propA1])
  })

  it('el administrador de la junta A no ve nada de la junta B', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await filas(db, 'select * from public.cuotas where junta_id = $1', [ids.juntaB])).toHaveLength(0)
    expect(await filas(db, 'select * from public.unidades where junta_id = $1', [ids.juntaB])).toHaveLength(0)
    expect(await filas(db, 'select * from public.perfiles where id = $1', [ids.adminB])).toHaveLength(0)
    expect(await errorDe(db, 'select public.generar_cuotas($1)', [ids.juntaB])).toMatch(/No tienes permiso/)
    expect(await errorDe(db, 'select public.metricas_periodo($1, $2::date)', [ids.juntaB, periodoActual])).toMatch(/No tienes permiso/)
    const propietarios = await filas(db, 'select id from public.perfiles')
    expect(propietarios).toHaveLength(3) // admin A + dos propietarios de A
  })

  it('nadie escribe cuotas o pagos directamente (solo por RPC)', async () => {
    for (const usuario of [ids.adminA, ids.propA1]) {
      await como(db, { tipo: 'usuario', id: usuario })
      expect(await errorDe(db, `update public.cuotas set estado = 'pagada'`)).toMatch(/permission denied/)
      expect(await errorDe(db, `update public.cuotas set monto = 1`)).toMatch(/permission denied/)
      expect(await errorDe(db, `insert into public.pagos (junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, estado) values ($1, $2, $3, 'efectivo', 150, current_date, 'conciliado_manual')`, [ids.juntaA, ids.unidadA1, ids.unidadA1])).toMatch(/permission denied/)
      expect(await errorDe(db, `delete from public.auditoria`)).toMatch(/permission denied/)
    }
  })

  it('el propietario no puede usar funciones de administrador', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, 'select public.generar_cuotas($1)', [ids.juntaA])).toMatch(/No tienes permiso/)
    expect(await errorDe(db, `select public.registrar_egreso($1, current_date, 'otros', 'Yo', 10)`, [ids.juntaA])).toMatch(/No tienes permiso/)
    expect(await errorDe(db, 'select public.metricas_periodo($1, $2::date)', [ids.juntaA, periodoActual])).toMatch(/No tienes permiso/)
    expect(await errorDe(db, 'select * from public.exportar_dataset_morosidad($1)', [ids.juntaA])).toMatch(/No tienes permiso/)
  })
})

describe('Cuotas', () => {
  it('generar cuotas dos veces no duplica', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [r] = await filas<{ r: { creadas: number; existentes: number } }>(db, 'select public.generar_cuotas($1) as r', [ids.juntaA])
    expect(r.r).toMatchObject({ creadas: 0, existentes: 3 })
    const [c] = await filas<{ n: number }>(db, 'select count(*)::int as n from public.cuotas where junta_id = $1 and periodo = $2', [ids.juntaA, periodoActual])
    expect(c.n).toBe(3)
  })

  it('rechaza periodos fuera de rango', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await errorDe(db, `select public.generar_cuotas($1, '2020-01-01')`, [ids.juntaA])).toMatch(/Solo puedes generar/)
    expect(await errorDe(db, `select public.generar_cuotas($1, (date_trunc('month', current_date) + interval '15 days')::date)`, [ids.juntaA])).toMatch(/primer día/)
  })
})

describe('Comprobantes en Storage privado', () => {
  it('solo el propietario sube en la carpeta de su unidad', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, `insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [`${ids.juntaA}/${ids.unidadA2}/ajeno.jpg`])).toMatch(/row-level security/)
    expect(await errorDe(db, `insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [`${ids.juntaB}/${ids.unidadA1}/x.jpg`])).toMatch(/row-level security/)
    expect(await errorDe(db, `insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [`${ids.juntaA}/${ids.unidadA1}/../../x.jpg`])).toMatch(/row-level security/)
    await subirComprobante(ids.propA1, `${ids.juntaA}/${ids.unidadA1}/propio.jpg`)
  })

  it('otro propietario no lee el comprobante; el admin de la junta sí, el de otra junta no', async () => {
    const nombre = `${ids.juntaA}/${ids.unidadA1}/propio.jpg`
    await como(db, { tipo: 'usuario', id: ids.propA2 })
    expect(await filas(db, 'select * from storage.objects where name = $1', [nombre])).toHaveLength(0)
    await como(db, { tipo: 'usuario', id: ids.adminB })
    expect(await filas(db, 'select * from storage.objects where name = $1', [nombre])).toHaveLength(0)
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await filas(db, 'select * from storage.objects where name = $1', [nombre])).toHaveLength(1)
  })

  it('nadie modifica ni borra comprobantes desde la API', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const r = await db.query(`delete from storage.objects where bucket_id = 'comprobantes'`)
    expect(r.affectedRows).toBe(0)
    const u = await db.query(`update storage.objects set name = 'x' where bucket_id = 'comprobantes'`)
    expect(u.affectedRows).toBe(0)
  })
})

describe('Pagos y conciliación', () => {
  it('pago correcto con comprobante propio se concilia por reglas y marca la cuota pagada', async () => {
    const cuota = await cuotaActual(ids.unidadA1)
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const { rows } = await enviarPago(cuota.id, 150, 'OP123456', `${ids.juntaA}/${ids.unidadA1}/propio.jpg`, { conf: 92 })
    expect((rows[0] as { r: { estado: string } }).r).toMatchObject({ estado: 'conciliado_auto', alertas: [] })
    expect((await cuotaActual(ids.unidadA1)).estado).toBe('pagada')
  })

  it('no permite pagar dos veces ni reutilizar el comprobante', async () => {
    const cuota = await cuotaActual(ids.unidadA1)
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, 'OP999999', $3)`, [cuota.id, hoy, `${ids.juntaA}/${ids.unidadA1}/propio.jpg`])).toMatch(/ya está pagada/)
  })

  it('exige que el comprobante exista y pertenezca al propietario', async () => {
    const cuota = await cuotaActual(ids.unidadA2)
    await como(db, { tipo: 'usuario', id: ids.propA2 })
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, 'OP777777', $3)`, [cuota.id, hoy, `${ids.juntaA}/${ids.unidadA2}/no-existe.jpg`])).toMatch(/No encontramos el comprobante/)
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, 'OP777777', $3)`, [cuota.id, hoy, `${ids.juntaA}/${ids.unidadA1}/propio.jpg`])).toMatch(/No encontramos el comprobante/)
  })

  it('un propietario no puede pagar la cuota de otra unidad', async () => {
    const cuota = await cuotaActual(ids.unidadA2)
    await subirComprobante(ids.propA1, `${ids.juntaA}/${ids.unidadA1}/otro.jpg`)
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, 'OP555555', $3)`, [cuota.id, hoy, `${ids.juntaA}/${ids.unidadA1}/otro.jpg`])).toMatch(/no tienes acceso/)
  })

  it('valida fecha futura, monto y número de operación en el servidor', async () => {
    const cuota = await cuotaActual(ids.unidadA2)
    await subirComprobante(ids.propA2, `${ids.juntaA}/${ids.unidadA2}/c1.jpg`)
    await como(db, { tipo: 'usuario', id: ids.propA2 })
    const path = `${ids.juntaA}/${ids.unidadA2}/c1.jpg`
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, (current_date + 30), 'OP444444', $2)`, [cuota.id, path])).toMatch(/futura/)
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150.555, $2::date, 'OP444444', $3)`, [cuota.id, hoy, path])).toMatch(/monto válido/)
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', -5, $2::date, 'OP444444', $3)`, [cuota.id, hoy, path])).toMatch(/monto válido/)
    expect(await errorDe(db, `select public.enviar_pago($1, 'yape_captura', 150, $2::date, 'x', $3)`, [cuota.id, hoy, path])).toMatch(/número de operación/)
    expect(await errorDe(db, `select public.enviar_pago($1, 'efectivo', 150, $2::date, 'OP444444', $3)`, [cuota.id, hoy, path])).toMatch(/cómo realizaste/)
  })

  it('monto distinto y operación repetida pasan a revisión con alertas (R1, R2)', async () => {
    const cuota = await cuotaActual(ids.unidadA2)
    await como(db, { tipo: 'usuario', id: ids.propA2 })
    const { rows } = await enviarPago(cuota.id, 140, 'op123456', `${ids.juntaA}/${ids.unidadA2}/c1.jpg`)
    const r = (rows[0] as { r: { estado: string; alertas: string[] } }).r
    expect(r.estado).toBe('pendiente_revision')
    expect(r.alertas).toEqual(expect.arrayContaining(['monto_no_coincide', 'operacion_duplicada']))
    expect((await cuotaActual(ids.unidadA2)).estado).toBe('en_revision')
  })

  it('el otro propietario no ve ese pago; el admin sí', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await filas(db, 'select * from public.pagos where unidad_id = $1', [ids.unidadA2])).toHaveLength(0)
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await filas(db, `select * from public.pagos where unidad_id = $1 and estado = 'pendiente_revision'`, [ids.unidadA2])).toHaveLength(1)
  })

  it('aprobar un pago con operación ya conciliada falla; rechazar exige motivo', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [p] = await filas<{ id: string }>(db, `select id from public.pagos where unidad_id = $1 and estado = 'pendiente_revision'`, [ids.unidadA2])
    expect(await errorDe(db, `select public.revisar_pago($1, 'aprobar')`, [p.id])).toMatch(/ya está conciliado/)
    expect(await errorDe(db, `select public.revisar_pago($1, 'rechazar', 'no')`, [p.id])).toMatch(/motivo/)
    await db.query(`select public.revisar_pago($1, 'rechazar', 'Número de operación repetido')`, [p.id])
    expect((await cuotaActual(ids.unidadA2)).estado).toBe('pendiente')
  })

  it('el propietario corrige y el administrador aprueba manualmente', async () => {
    const cuota = await cuotaActual(ids.unidadA2)
    await subirComprobante(ids.propA2, `${ids.juntaA}/${ids.unidadA2}/c2.jpg`)
    await como(db, { tipo: 'usuario', id: ids.propA2 })
    // Baja confianza OCR sin corrección (R4) → revisión.
    const { rows } = await enviarPago(cuota.id, 150, 'OP222222', `${ids.juntaA}/${ids.unidadA2}/c2.jpg`, {
      conf: 40, ex: { monto: '150', fecha: hoy, operacion: 'OP222222' },
    })
    expect((rows[0] as { r: { alertas: string[] } }).r.alertas).toEqual(['datos_incompletos'])
    expect(await errorDe(db, `select public.revisar_pago(id, 'aprobar') from public.pagos where unidad_id = $1 and estado = 'pendiente_revision'`, [ids.unidadA2])).toMatch(/No tienes permiso/)

    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [p] = await filas<{ id: string }>(db, `select id from public.pagos where unidad_id = $1 and estado = 'pendiente_revision'`, [ids.unidadA2])
    await db.query(`select public.revisar_pago($1, 'aprobar', 'Verificado en la app de Yape')`, [p.id])
    expect(await errorDe(db, `select public.revisar_pago($1, 'aprobar')`, [p.id])).toMatch(/ya fue revisado/)
    expect((await cuotaActual(ids.unidadA2)).estado).toBe('pagada')
  })

  it('el administrador puede revertir una conciliación automática (dinero no recibido)', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [p] = await filas<{ id: string }>(db, `select id from public.pagos where unidad_id = $1 and estado = 'conciliado_auto'`, [ids.unidadA1])
    const [r] = await filas<{ r: { accion: string } }>(db, `select public.revisar_pago($1, 'rechazar', 'No figura en la app de Yape') as r`, [p.id])
    expect(r.r.accion).toBe('revertir_pago')
    expect((await cuotaActual(ids.unidadA1)).estado).toBe('pendiente')
  })

  it('pago manual del administrador y bloqueo de operación duplicada', async () => {
    const cuota = await cuotaActual(ids.unidadA1)
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await errorDe(db, `select public.registrar_pago_manual($1, 'transferencia', 150, $2::date, 'OP222222')`, [cuota.id, hoy])).toMatch(/ya fue registrado/)
    expect(await errorDe(db, `select public.registrar_pago_manual($1, 'transferencia', 150, $2::date, null)`, [cuota.id, hoy])).toMatch(/número de operación/)
    await db.query(`select public.registrar_pago_manual($1, 'efectivo', 150, $2::date, null, 'Pago en caja')`, [cuota.id, hoy])
    expect((await cuotaActual(ids.unidadA1)).estado).toBe('pagada')
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await errorDe(db, `select public.registrar_pago_manual($1, 'efectivo', 150, $2::date)`, [cuota.id, hoy])).toMatch(/ya está pagada/)
  })

  it('la base impide dos pagos vigentes para la misma cuota aunque se salten las funciones', async () => {
    const cuota = await cuotaActual(ids.unidadA1)
    const libre = await cuotaActual(ids.unidadA3)
    await como(db, { tipo: 'postgres' })
    expect(await errorDe(db, `insert into public.pagos (junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, estado, conciliado_en) values ($1, $2, $3, 'efectivo', 150, current_date, 'conciliado_manual', now())`, [ids.juntaA, cuota.id, ids.unidadA1])).toMatch(/pagos_vigente_por_cuota/)
    // Pago que apunta a una cuota de la junta A declarando la junta B o la unidad equivocada.
    expect(await errorDe(db, `insert into public.pagos (junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, estado, conciliado_en) values ($1, $2, $3, 'efectivo', 150, current_date, 'conciliado_manual', now())`, [ids.juntaB, libre.id, ids.unidadA3])).toMatch(/foreign key/)
    expect(await errorDe(db, `insert into public.pagos (junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, estado, conciliado_en) values ($1, $2, $3, 'efectivo', 150, current_date, 'conciliado_manual', now())`, [ids.juntaA, libre.id, ids.unidadA1])).toMatch(/foreign key/)
    expect(await errorDe(db, `update public.cuotas set estado = 'pagada', pago_id = null where id = $1`, [cuota.id])).toMatch(/cuotas_pagada_consistente/)
  })
})

describe('Egresos, auditoría, métricas y transparencia', () => {
  it('registra egresos válidos y rechaza fechas futuras', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    await db.query(`select public.registrar_egreso($1, $2::date, 'pago_vigilante', 'Personal de vigilancia (demo)', 250)`, [ids.juntaA, hoy])
    expect(await errorDe(db, `select public.registrar_egreso($1, current_date + 10, 'otros', 'X', 10)`, [ids.juntaA])).toMatch(/futura/)
  })

  it('las métricas se calculan desde los registros', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [m] = await filas<{ m: Record<string, number> }>(db, 'select public.metricas_periodo($1, $2::date) as m', [ids.juntaA, periodoActual])
    expect(Number(m.m.recaudado)).toBe(300)
    expect(Number(m.m.egresos)).toBe(250)
    expect(Number(m.m.saldo)).toBe(50)
    expect(m.m.cuotas_total).toBe(3)
    expect(m.m.cuotas_pagadas).toBe(2)
  })

  it('transparencia muestra totales y estado por unidad sin nombres; respeta el interruptor', async () => {
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const [t] = await filas<{ t: { recaudado: number; unidades: Record<string, unknown>[] } }>(db, 'select public.transparencia($1, $2::date) as t', [ids.juntaA, periodoActual])
    expect(Number(t.t.recaudado)).toBe(300)
    expect(t.t.unidades).toHaveLength(3)
    expect(Object.keys(t.t.unidades[0]).sort()).toEqual(['codigo', 'es_mia', 'estado', 'fecha_pago'])
    expect(JSON.stringify(t.t)).not.toMatch(/Vecin|casa0\d@/)
    expect(await errorDe(db, 'select public.transparencia($1, $2::date)', [ids.juntaB, periodoActual])).toMatch(/No tienes acceso/)

    await como(db, { tipo: 'usuario', id: ids.adminA })
    await db.query(`select public.actualizar_configuracion($1, 'Junta A (simulada)', 150, 28, null, true, false, 'ARCO2026')`, [ids.juntaA])
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    const [t2] = await filas<{ t: { unidades: unknown[]; detalle_habilitado: boolean } }>(db, 'select public.transparencia($1, $2::date) as t', [ids.juntaA, periodoActual])
    expect(t2.t.detalle_habilitado).toBe(false)
    expect(t2.t.unidades).toEqual([])
  })

  it('la auditoría registra acciones sensibles y no se puede alterar', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const acciones = (await filas<{ accion: string }>(db, 'select distinct accion from public.auditoria')).map(a => a.accion)
    expect(acciones).toEqual(expect.arrayContaining(['registro_propietario', 'generar_cuotas', 'pago_conciliado_auto', 'pago_en_revision', 'rechazar_pago', 'aprobar_pago', 'revertir_pago', 'pago_manual', 'registrar_egreso', 'actualizar_configuracion']))
    await como(db, { tipo: 'postgres' })
    expect(await errorDe(db, `update public.auditoria set accion = 'x'`)).toMatch(/no se puede modificar/)
  })
})

describe('Preparación ML sin fuga de información', () => {
  it('las características solo usan historia vencida antes del corte', async () => {
    await como(db, { tipo: 'postgres' })
    const prev = '2026-01-01'
    const unidad = ids.unidadA3
    // Cuota previa vencida el 2026-01-28 y pagada recién el 2026-03-15 (después del corte 2026-02-01).
    await db.exec(`
      insert into public.cuotas (id, junta_id, unidad_id, periodo, monto, fecha_vencimiento, es_simulado)
      values ('40000000-0000-4000-8000-000000000001', '${ids.juntaA}', '${unidad}', '${prev}', 150, '2026-01-28', true),
             ('40000000-0000-4000-8000-000000000002', '${ids.juntaA}', '${unidad}', '2026-02-01', 150, '2026-02-28', true);
      insert into public.pagos (id, junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, estado, conciliado_en)
      values ('50000000-0000-4000-8000-000000000001', '${ids.juntaA}', '40000000-0000-4000-8000-000000000001', '${unidad}', 'efectivo', 150, '2026-03-15', 'conciliado_manual', now());
      update public.cuotas set estado = 'pagada', fecha_pago = '2026-03-15', pago_id = '50000000-0000-4000-8000-000000000001'
      where id = '40000000-0000-4000-8000-000000000001';
    `)
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const feats = await filas<Record<string, unknown>>(db, `select * from public.ml_caracteristicas_cuotas($1, '2026-02-01', 31)`, [ids.juntaA])
    const f = feats.find(x => x.cuota_id === '40000000-0000-4000-8000-000000000002')!
    expect(f).toBeDefined()
    expect(f.pagos_atrasados_previos).toBe(1)
    expect(f.cuotas_previas).toBe(1)
    expect(f.metodo_pago_ultimo).toBeNull() // el pago del 15/03 no se conocía el 01/02
    expect(Number(f.dias_atraso_promedio_previo)).toBe(4) // 01/02 − 28/01, no 46 días
    expect(f).not.toHaveProperty('fecha_pago')
    expect(f).not.toHaveProperty('dias_atraso')
    expect(String(f.unidad_ref)).toMatch(/^U-[0-9a-f]{10}$/)
  })

  it('el export del contrato APF2 excluye cuotas sin etiqueta definitiva y rotula el origen', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const filasExport = await filas<Record<string, unknown>>(db, 'select * from public.exportar_dataset_morosidad($1)', [ids.juntaA])
    expect(filasExport.length).toBeGreaterThan(0)
    expect(filasExport.every(r => r.origen === 'simulado')).toBe(true)
    expect(Object.keys(filasExport[0])).toEqual(['unidad_ref', 'periodo', 'monto', 'fecha_vencimiento', 'fecha_pago', 'dias_atraso', 'metodo_pago', 'pagos_atrasados_previos', 'moroso', 'es_simulado', 'origen'])
    // Cuota de enero pagada el 15/03: 46 días de atraso → moroso = 1.
    const tardia = filasExport.find(r => r.dias_atraso === 46)
    expect(tardia?.moroso).toBe(1)
    // La cuota de febrero sigue impaga pero ya venció → moroso = 1; la del mes actual no vencida se excluye.
    expect(filasExport.filter(r => r.fecha_pago === null && r.moroso === 0)).toHaveLength(0)
  })

  it('las predicciones solo las escribe el servicio de inferencia', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await errorDe(db, `insert into public.modelos_ml (version, algoritmo, umbral, caracteristicas, entrenado_en) values ('v0', 'falso', 0.5, '{}', now())`)).toMatch(/permission denied/)
    expect(await filas(db, 'select * from public.predicciones_vigentes($1)', [ids.juntaA])).toHaveLength(0)
    await como(db, { tipo: 'servicio' })
    const feats = await filas(db, `select * from public.ml_caracteristicas_cuotas($1, '2026-02-01')`, [ids.juntaA])
    expect(feats.length).toBeGreaterThan(0)
  })
})

describe('Seguridad del código de invitación', () => {
  const consultar = async (codigo: string, ip: string) => {
    await como(db, { tipo: 'anon' })
    await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })])
    return errorDe(db, 'select * from public.unidades_disponibles($1)', [codigo])
  }

  it('bloquea una IP tras 10 códigos incorrectos en 15 minutos, sin afectar a otras', async () => {
    for (let i = 0; i < 10; i++) expect(await consultar(`MAL${i}CODIGO`, '203.0.113.7')).toBeNull()
    expect(await consultar('OTROMAL1', '203.0.113.7')).toMatch(/Demasiados intentos/)
    expect(await consultar('ARCO2026', '203.0.113.7')).toMatch(/Demasiados intentos/)
    expect(await consultar('ARCO2026', '198.51.100.20')).toBeNull()
  })

  it('guarda la IP solo como hash', async () => {
    await como(db, { tipo: 'postgres' })
    const r = await filas<{ ip_hash: string }>(db, 'select ip_hash from public.intentos_invitacion limit 1')
    expect(r[0].ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(await filas(db, 'select * from public.intentos_invitacion'))).not.toMatch(/203\.0\.113/)
  })

  it('nadie lee los intentos desde la API', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    expect(await errorDe(db, 'select * from public.intentos_invitacion')).toMatch(/permission denied/)
  })

  it('exige códigos de al menos 8 caracteres con letras y números', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const guardar = (c: string) => errorDe(db, `select public.actualizar_configuracion($1, 'Junta A (simulada)', 150, 28, null, true, true, $2)`, [ids.juntaA, c])
    expect(await guardar('ABCDEFGH')).toMatch(/letras y números/)
    expect(await guardar('1234-5678')).toMatch(/letras y números/)
    expect(await guardar('ARC0-1')).toMatch(/entre 6 y 32|al menos 8/)
    expect(await guardar('ARCO2026')).toBeNull()
  })

  it('el administrador genera un código aleatorio; el propietario no puede', async () => {
    await como(db, { tipo: 'usuario', id: ids.adminA })
    const [r] = await filas<{ c: string }>(db, 'select public.generar_codigo_invitacion($1) as c', [ids.juntaA])
    expect(r.c).toMatch(/^ARCO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    const [r2] = await filas<{ c: string }>(db, 'select public.generar_codigo_invitacion($1) as c', [ids.juntaA])
    expect(r2.c).not.toBe(r.c)
    await como(db, { tipo: 'usuario', id: ids.propA1 })
    expect(await errorDe(db, 'select public.generar_codigo_invitacion($1)', [ids.juntaA])).toMatch(/No tienes permiso/)
  })
})
