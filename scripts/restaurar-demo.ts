// Restaura la junta de demostración al estado guardado (migración 1100) y limpia los archivos que los
// visitantes subieron a Storage. La misma restauración de la base corre cada noche con pg_cron.
// Uso: npm run demo:restaurar              → restaura y verifica que las cuentas demo entran
//      npm run demo:restaurar -- --guardar → guarda el estado ACTUAL como nuevo punto de restauración
// Requiere en .env.local (nunca en el repositorio): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY. Solo afecta a la junta en modo demostración.
import { createClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_SB || !SERVICIO || !ANON) {
  console.error('Faltan VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const JUNTA = '7a1c0de0-0000-4000-8000-000000000001'
const CUENTAS = ['admin@arcomunity.demo', 'casa12@arcomunity.demo', 'casa08@arcomunity.demo', 'dpto301@arcomunity.demo']
const CLAVE_DEMO = 'Demo2026!'
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const sb = createClient(URL_SB, SERVICIO, opciones)

if (process.argv.includes('--guardar')) {
  const { data, error } = await sb.rpc('guardar_estado_demo', { p_junta: JUNTA })
  if (error) { console.error(`✗ No se pudo guardar: ${error.message}`); process.exit(1) }
  console.log('✓ Estado actual guardado como punto de restauración:', JSON.stringify(data))
  process.exit(0)
}

const { data: r, error } = await sb.rpc('restaurar_estado_demo', { p_junta: JUNTA })
if (error) { console.error(`✗ No se pudo restaurar: ${error.message}`); process.exit(1) }
console.log(`✓ Base restaurada (foto del ${String(r.foto_del).slice(0, 16)}): ${r.pagos_quitados} pago(s) quitados, ${r.registros_desvinculados} registro(s) desvinculados`)

// Archivos subidos durante la demostración que ya no usa ningún pago ni la configuración.
async function listar(bucket: string, carpeta: string): Promise<string[]> {
  const rutas: string[] = []
  const { data } = await sb.storage.from(bucket).list(carpeta, { limit: 1000 })
  for (const o of data ?? []) {
    const ruta = `${carpeta}/${o.name}`
    if (o.id === null) rutas.push(...await listar(bucket, ruta))
    else rutas.push(ruta)
  }
  return rutas
}
const enUso = new Set<string>()
for (let desde = 0; ; desde += 1000) {
  const { data } = await sb.from('pagos').select('comprobante_path').eq('junta_id', JUNTA).not('comprobante_path', 'is', null).range(desde, desde + 999)
  for (const p of data ?? []) enUso.add(p.comprobante_path)
  if ((data ?? []).length < 1000) break
}
const { data: junta } = await sb.from('juntas').select('yape_qr_path').eq('id', JUNTA).single()
if (junta?.yape_qr_path) enUso.add(junta.yape_qr_path)
for (const bucket of ['comprobantes', 'junta-archivos']) {
  const sobrantes = (await listar(bucket, JUNTA)).filter(r => !enUso.has(r))
  if (sobrantes.length) await sb.storage.from(bucket).remove(sobrantes)
  console.log(`✓ ${bucket}: ${sobrantes.length} archivo(s) de la demostración eliminados`)
}

// Las cuentas demo deben poder entrar con la contraseña documentada.
let fallos = 0
for (const correo of CUENTAS) {
  const c = createClient(URL_SB, ANON, opciones)
  const { error: e } = await c.auth.signInWithPassword({ email: correo, password: CLAVE_DEMO })
  if (e) fallos++
  console.log(`${e ? '✗' : '✓'} ${correo} ${e ? e.message : 'entra'}`)
  await c.auth.signOut()
}
process.exit(fallos ? 1 : 0)
