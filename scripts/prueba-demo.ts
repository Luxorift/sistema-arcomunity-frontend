// Verifica contra Supabase real que las cuentas públicas de demostración funcionan y están protegidas
// (migración 1100). Intenta los abusos que permitiría una contraseña publicada y comprueba que la base
// los rechaza; lo que sí se permite (cambiar la cuota) se revierte con restaurar_estado_demo al final.
// Uso: npm run test:demo   (requiere VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const servicio = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY!, opciones)
const JUNTA = '7a1c0de0-0000-4000-8000-000000000001'
const CLAVE = 'Demo2026!'

let ok = 0, fallos = 0
const check = (n: string, c: boolean, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { fallos++; console.log(`  ✗ ${n} ${d}`) } }
const seccion = (t: string) => console.log(`\n${t}`)
async function sesion(correo: string): Promise<SupabaseClient> {
  const c = createClient(URL_SB, ANON, opciones)
  const { error } = await c.auth.signInWithPassword({ email: correo, password: CLAVE })
  if (error) throw new Error(`${correo}: ${error.message}`)
  return c
}

seccion('1. Estado del modo demostración')
const est = await servicio.rpc('estado_demo', { p_junta: JUNTA })
if (est.error) { console.error(`No existe estado_demo (¿falta aplicar la migración 1100?): ${est.error.message}`); process.exit(1) }
console.log('  ', JSON.stringify(est.data))
check('la junta piloto está en modo demostración', est.data.modo_demo === true)
check('hay un estado guardado para restaurar', !!est.data.foto_del)
check('las 4 cuentas @arcomunity.demo están marcadas', est.data.cuentas_demo === 4, String(est.data.cuentas_demo))
check('la restauración nocturna está programada', Array.isArray(est.data.restauracion_nocturna) && est.data.restauracion_nocturna.some((j: { activa: boolean }) => j.activa), JSON.stringify(est.data.restauracion_nocturna))

seccion('2. Cada cuenta entra y ve lo que corresponde')
const admin = await sesion('admin@arcomunity.demo')
const casa12 = await sesion('casa12@arcomunity.demo')
const casa08 = await sesion('casa08@arcomunity.demo')
const dpto301 = await sesion('dpto301@arcomunity.demo')
type Contexto = { perfil: { nombre_completo: string }; membresias: { rol: string; junta_id: string; unidades?: { codigo: string }[] }[] }
const ctx = async (c: SupabaseClient) => { const { data } = await c.rpc('mi_contexto'); return (Array.isArray(data) ? data[0] : data) as Contexto }
const rolDe = async (c: SupabaseClient) => JSON.stringify(await ctx(c))
check('admin entra con rol de administración', /"rol":"admin"/.test(await rolDe(admin)))
for (const [n, c, u] of [['casa12', casa12, 'Casa 12'], ['casa08', casa08, 'Casa 08'], ['dpto301', dpto301, 'Dpto 301']] as const) {
  const r = await rolDe(c)
  check(`${n} entra como propietario de ${u}`, /"rol":"propietario"/.test(r) && r.includes(u), r.slice(0, 160))
}
const cuotasDe = async (c: SupabaseClient) => ((await c.from('cuotas').select('unidad_id, estado, fecha_vencimiento')).data ?? []) as { unidad_id: string; estado: string; fecha_vencimiento: string }[]
const c12 = await cuotasDe(casa12), c301 = await cuotasDe(dpto301), cAdmin = await cuotasDe(admin)
check('el propietario solo ve las cuotas de su unidad', c12.length === 12 && new Set(c12.map(c => c.unidad_id)).size === 1, `${c12.length} cuotas`)
check('el administrador ve las 360 cuotas de la junta', cAdmin.length === 360, String(cAdmin.length))
const hoy = ((await createClient(URL_SB, ANON, opciones).rpc('servidor_ahora')).data as { hoy_lima: string }).hoy_lima
check('Casa 12 tiene una cuota vencida', c12.some(c => c.estado === 'pendiente' && c.fecha_vencimiento < hoy))
check('Dpto 301 está al día', c301.length === 12 && c301.every(c => c.estado === 'pagada'))
check('Casa 08 tiene un pago en revisión', ((await casa08.from('pagos').select('estado')).data ?? []).some(p => p.estado === 'pendiente_revision'))
check('un propietario no lee auditoría ni egresos', ((await casa12.from('auditoria').select('id')).data ?? []).length === 0 && ((await casa12.from('egresos').select('id')).data ?? []).length === 0)
check('un propietario no ejecuta funciones de administración', !!(await casa12.rpc('generar_cuotas', { p_junta: JUNTA })).error)
check('las sesiones son independientes', (await ctx(admin)).membresias[0].rol === 'admin' && (await ctx(casa12)).membresias[0].rol === 'propietario')

seccion('3. Abusos que la base rechaza')
check('una cuenta demo no cambia su contraseña', !!(await casa12.auth.updateUser({ password: 'Otra2026!x' })).error)
check('una cuenta demo no cambia su correo', !!(await dpto301.auth.updateUser({ email: 'otro@ejemplo.test' })).error)
check('la contraseña documentada sigue funcionando', !(await createClient(URL_SB, ANON, opciones).auth.signInWithPassword({ email: 'casa12@arcomunity.demo', password: CLAVE })).error)
const yo = (await casa12.auth.getUser()).data.user!.id
check('una cuenta demo no cambia su nombre', !!(await casa12.from('perfiles').update({ nombre_completo: 'Otro nombre' }).eq('id', yo).select()).error)
const { data: j } = await servicio.from('juntas').select('nombre, cuota_mensual, dia_vencimiento, yape_titular, conciliacion_automatica, transparencia_detalle_unidades').eq('id', JUNTA).single()
const config = (cambios: Record<string, unknown>) => admin.rpc('actualizar_configuracion', {
  p_junta: JUNTA, p_nombre: j!.nombre, p_cuota_mensual: j!.cuota_mensual, p_dia_vencimiento: j!.dia_vencimiento, p_yape_titular: j!.yape_titular,
  p_conciliacion_automatica: j!.conciliacion_automatica, p_transparencia_detalle_unidades: j!.transparencia_detalle_unidades, p_codigo_invitacion: 'ARCO2026', ...cambios })
check('la administración demo no cambia el nombre de la junta', /nombre de la junta/.test((await config({ p_nombre: 'Otra junta' })).error?.message ?? ''))
check('ni el titular de Yape', /titular/.test((await config({ p_yape_titular: 'Cuenta personal' })).error?.message ?? ''))
check('ni el código de invitación', /código de invitación/.test((await config({ p_codigo_invitacion: 'NUEVO2026' })).error?.message ?? ''))
check('ni genera un código nuevo', /código de invitación/.test((await admin.rpc('generar_codigo_invitacion', { p_junta: JUNTA })).error?.message ?? ''))
const { data: unidades } = await servicio.from('unidades').select('id, codigo').eq('junta_id', JUNTA)
const u12 = unidades!.find(u => u.codigo === 'Casa 12')!.id
check('ni desvincula a una cuenta demo', /desvincular/.test((await admin.rpc('desvincular_propietario', { p_unidad_id: u12 })).error?.message ?? ''))
check('ni desactiva su unidad', /desactivar/.test((await admin.rpc('cambiar_estado_unidad', { p_unidad_id: u12, p_activa: false })).error?.message ?? ''))
check('ni agrega cámaras con enlaces externos', /simuladas/.test((await admin.rpc('guardar_camara', { p_junta: JUNTA, p_camara_id: null, p_nombre: 'Externa', p_ubicacion: 'Calle', p_tipo: 'embed', p_url: 'https://ejemplo.test/v', p_activa: true })).error?.message ?? ''))
check('ni ejecuta la restauración', !!(await admin.rpc('restaurar_estado_demo', { p_junta: JUNTA })).error)
check('un visitante tampoco', !!(await createClient(URL_SB, ANON, opciones).rpc('restaurar_estado_demo', { p_junta: JUNTA })).error)

seccion('4. Lo permitido funciona y se restaura')
check('la administración demo sí puede cambiar la cuota', !(await config({ p_cuota_mensual: 175 })).error)
const r = await servicio.rpc('restaurar_estado_demo', { p_junta: JUNTA })
check('la restauración devuelve la configuración', !r.error && (await servicio.from('juntas').select('cuota_mensual').eq('id', JUNTA).single()).data?.cuota_mensual === j!.cuota_mensual, r.error?.message)
check('después de restaurar las cuentas siguen entrando', !(await createClient(URL_SB, ANON, opciones).auth.signInWithPassword({ email: 'admin@arcomunity.demo', password: CLAVE })).error)

console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas`)
process.exit(fallos ? 1 : 0)
