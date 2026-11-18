// Carga la junta de demostración (datos 100 % simulados) en un proyecto Supabase.
// Uso:  npm run seed:demo            → crea la demo si no existe
//       npm run seed:demo -- --reset → borra la demo anterior y la vuelve a crear
// Requiere en .env.local (nunca en el repositorio): VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// La clave de servicio salta RLS: este script se ejecuta solo en la computadora del equipo técnico.
import { createClient } from '@supabase/supabase-js'
import { crearDatos } from '../src/model.ts'

const URL_SUPABASE = process.env.VITE_SUPABASE_URL
const CLAVE_SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SUPABASE || !CLAVE_SERVICIO) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const JUNTA_ID = '7a1c0de0-0000-4000-8000-000000000001'
const CODIGO_INVITACION = 'ARCO2026'
const CLAVE_DEMO = 'Demo2026!'
const reset = process.argv.includes('--reset')

const sb = createClient(URL_SUPABASE, CLAVE_SERVICIO, { auth: { persistSession: false, autoRefreshToken: false } })

function fallar(paso: string, error: { message: string } | null) {
  if (error) {
    console.error(`✗ ${paso}: ${error.message}`)
    process.exit(1)
  }
}

async function enLotes<T>(filas: T[], tam: number, fn: (lote: T[]) => Promise<{ error: { message: string } | null }>, paso: string) {
  for (let i = 0; i < filas.length; i += tam) fallar(paso, (await fn(filas.slice(i, i + tam))).error)
}

async function buscarUsuario(correo: string) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    fallar('listar usuarios', error)
    const u = data.users.find(x => x.email?.toLowerCase() === correo)
    if (u || data.users.length < 200) return u
  }
  return undefined
}

const semilla = crearDatos()
const cuentas = semilla.usuarios.map(u => ({ ...u, correo: u.correo.toLowerCase() }))

const { data: existente } = await sb.from('juntas').select('id').eq('id', JUNTA_ID).maybeSingle()
if (existente && !reset) {
  console.log('La junta de demostración ya existe. Usa --reset para recrearla.')
  process.exit(0)
}
if (reset) {
  for (const c of cuentas) {
    const u = await buscarUsuario(c.correo)
    if (u) fallar(`borrar ${c.correo}`, (await sb.auth.admin.deleteUser(u.id)).error)
  }
  fallar('borrar junta demo', (await sb.from('juntas').delete().eq('id', JUNTA_ID)).error)
  console.log('✓ Demo anterior eliminada')
}

// Identificadores locales de la semilla → uuid.
const uuid = new Map<string, string>()
const idDe = (local: string) => {
  if (!uuid.has(local)) uuid.set(local, crypto.randomUUID())
  return uuid.get(local)!
}

const cfg = semilla.configuracion
fallar('junta', (await sb.from('juntas').insert({
  id: JUNTA_ID, nombre: cfg.nombre, cuota_mensual: cfg.cuotaMensual, dia_vencimiento: cfg.diaVencimiento,
  yape_titular: cfg.yapeTitular, conciliacion_automatica: cfg.conciliacionAutomatica, es_simulado: true,
})).error)
fallar('código de invitación', (await sb.from('juntas_invitacion').insert({ junta_id: JUNTA_ID, codigo: CODIGO_INVITACION })).error)
fallar('unidades', (await sb.from('unidades').insert(semilla.unidades.map(u => ({
  id: idDe(u.id), junta_id: JUNTA_ID, codigo: u.codigo, activa: u.activa, es_simulado: true,
})))).error)
console.log(`✓ Junta, código ${CODIGO_INVITACION} y ${semilla.unidades.length} unidades`)

// Cuentas: los propietarios pasan por el mismo disparador de registro que la app.
for (const c of cuentas) {
  const meta: Record<string, string> = { nombre_completo: c.nombre, acepto_datos: 'true' }
  if (c.rol === 'propietario' && c.unidadId) Object.assign(meta, { codigo_invitacion: CODIGO_INVITACION, unidad_id: idDe(c.unidadId) })
  const { data, error } = await sb.auth.admin.createUser({ email: c.correo, password: CLAVE_DEMO, email_confirm: true, user_metadata: meta })
  fallar(`cuenta ${c.correo}`, error)
  if (c.rol === 'admin') {
    fallar('rol admin', (await sb.from('miembros_junta').insert({ junta_id: JUNTA_ID, perfil_id: data.user!.id, rol: 'admin' })).error)
  }
}
console.log(`✓ ${cuentas.length} cuentas de demostración (contraseña ${CLAVE_DEMO})`)

// Cuotas: primero sin pago; luego pagos; luego se marcan pagadas (la base exige pago_id).
const cuotas = semilla.cuotas.map(c => ({
  id: idDe(c.id), junta_id: JUNTA_ID, unidad_id: idDe(c.unidadId), periodo: c.periodo, monto: c.monto,
  fecha_vencimiento: c.vencimiento, estado: c.estado === 'en_revision' ? 'en_revision' : 'pendiente', es_simulado: true,
}))
await enLotes(cuotas, 500, l => sb.from('cuotas').insert(l), 'cuotas')

const pagos = semilla.pagos.map(p => ({
  id: idDe(p.id), junta_id: JUNTA_ID, cuota_id: idDe(p.cuotaId), unidad_id: idDe(p.unidadId), metodo: p.metodo,
  monto_declarado: p.monto, fecha_operacion: p.fecha, numero_operacion: p.operacion, estado: p.estado,
  alertas: p.alertas, subido_en: p.subidoEn, conciliado_en: p.conciliadoEn ?? null, es_simulado: true,
}))
await enLotes(pagos, 500, l => sb.from('pagos').insert(l), 'pagos')

const pagadas = semilla.cuotas.filter(c => c.estado === 'pagada').map(c => ({
  id: idDe(c.id), junta_id: JUNTA_ID, unidad_id: idDe(c.unidadId), periodo: c.periodo, monto: c.monto,
  fecha_vencimiento: c.vencimiento, estado: 'pagada', fecha_pago: c.fechaPago, pago_id: idDe(c.pagoId!), es_simulado: true,
}))
await enLotes(pagadas, 500, l => sb.from('cuotas').upsert(l), 'marcar cuotas pagadas')
console.log(`✓ ${cuotas.length} cuotas y ${pagos.length} pagos simulados`)

fallar('egresos', (await sb.from('egresos').insert(semilla.egresos.map(e => ({
  junta_id: JUNTA_ID, fecha: e.fecha, concepto: e.concepto, beneficiario: e.beneficiario, monto: e.monto,
  comentario: e.comentario, es_simulado: true,
})))).error)
fallar('cámaras', (await sb.from('camaras').insert(semilla.camaras.map(c => ({
  junta_id: JUNTA_ID, nombre: c.nombre, ubicacion: c.ubicacion, tipo: c.tipo, url: c.url ?? null, activa: c.activa,
})))).error)
fallar('auditoría', (await sb.from('auditoria').insert({
  junta_id: JUNTA_ID, actor_nombre: 'Sistema', accion: 'datos_simulados', entidad: 'junta', entidad_id: JUNTA_ID,
  detalle: { unidades: semilla.unidades.length, cuotas: cuotas.length, nota: 'Historial ficticio de 12 meses' },
})).error)

const morosas = semilla.cuotas.filter(c => (c.fechaPago && c.fechaPago > c.vencimiento) || (!c.fechaPago && c.estado === 'pendiente' && c.vencimiento < new Date().toISOString().slice(0, 10))).length
console.log(`✓ Egresos, cámaras simuladas y auditoría. Cuotas con atraso en la semilla: ${morosas}`)
console.log('Listo. Todos los registros tienen es_simulado = true.')
