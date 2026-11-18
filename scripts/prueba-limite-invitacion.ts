// Prueba contra Supabase real del límite de intentos del código de invitación (migraciones 0900 y 1000).
// Envía 10 códigos falsos cambiando X-Forwarded-For en cada intento: si el límite se basa en una
// cabecera que controla el cliente, el intento 11 pasaría. Al final libera el bloqueo de esta prueba
// (borra solo los intentos registrados desde que empezó) y comprueba que la IP vuelve a funcionar.
// Uso: npm run test:limite   (requiere VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL!
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const servicio = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY!, opciones)
const visitante = (xff?: string) => createClient(URL_SB, process.env.VITE_SUPABASE_ANON_KEY!, { ...opciones, global: { headers: xff ? { 'X-Forwarded-For': xff } : {} } })

let ok = 0, fallos = 0
const check = (n: string, c: boolean, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { fallos++; console.log(`  ✗ ${n} ${d}`) } }
const intentar = async (xff?: string) => (await visitante(xff).rpc('unidades_disponibles', { p_codigo: `FALSO${crypto.randomUUID().slice(0, 6)}` })).error?.message ?? null

const diag = await servicio.rpc('diagnostico_ip_solicitud')
if (diag.error) {
  console.error(`No existe el diagnóstico (¿falta aplicar la migración 1000?): ${diag.error.message}`)
  process.exit(1)
}
console.log('Cabeceras que llegan a la base:', JSON.stringify(diag.data))
check('la IP se toma de una cabecera que fija el proxy', ['cf-connecting-ip', 'x-forwarded-for (último público)'].includes((diag.data as { fuente: string }).fuente))

const inicio = (await servicio.rpc('servidor_ahora')).data?.ahora as string | undefined
const desde = inicio ?? new Date(Date.now() - 5000).toISOString()
try {
  const errores: (string | null)[] = []
  for (let i = 0; i < 10; i++) errores.push(await intentar(`192.0.2.${i + 1}`))
  check('los 10 primeros códigos falsos se rechazan sin bloquear', errores.every(e => e === null), JSON.stringify(errores.filter(Boolean)))
  check('el intento 11 se bloquea aunque cambie X-Forwarded-For', /Demasiados intentos/.test((await intentar('192.0.2.200')) ?? ''))
  check('también se bloquea sin cabecera falsa (misma IP real)', /Demasiados intentos/.test((await intentar()) ?? ''))
} finally {
  const borrado = await servicio.from('intentos_invitacion').delete().gte('creado_en', desde)
  check('el servicio libera el bloqueo de la prueba', !borrado.error, borrado.error?.message)
}
check('después de liberar, la IP vuelve a consultar', (await intentar()) === null)
await servicio.from('intentos_invitacion').delete().gte('creado_en', desde)
console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas`)
process.exit(fallos ? 1 : 0)
