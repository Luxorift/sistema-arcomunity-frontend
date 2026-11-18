// Verifica, desde la red donde se va a exponer (p. ej. el wifi de la universidad), qué direcciones de
// Arcomunity y de Supabase responden. No usa claves secretas: solo la URL y la clave pública (anon),
// las mismas que ya van dentro de la aplicación web. No modifica datos.
// Uso: npm run verificar:red                        (lee .env.local)
//      ALTERNATIVAS=https://arcomunity.pages.dev,https://arcomunity.netlify.app npm run verificar:red
const SUPABASE = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SITIOS = ['https://sistema-arcomunity-frontend.vercel.app', ...(process.env.ALTERNATIVAS?.split(',').filter(Boolean) ?? [])]

let fallos = 0
async function probar(nombre: string, url: string, init?: RequestInit, esperado = (s: number) => s < 400) {
  const t0 = performance.now()
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
    const ms = Math.round(performance.now() - t0)
    const ok = esperado(r.status)
    if (!ok) fallos++
    console.log(`${ok ? '✓' : '✗'} ${nombre}: HTTP ${r.status} en ${ms} ms`)
    return r
  } catch (e) {
    fallos++
    console.log(`✗ ${nombre}: sin respuesta (${(e as Error).message.slice(0, 80)}). ¿Bloqueado por la red?`)
    return null
  }
}

for (const sitio of SITIOS) {
  const r = await probar(`Sitio ${sitio}`, sitio)
  if (r) {
    const html = await r.text()
    const js = html.match(/\/assets\/index-[\w-]+\.js/)?.[0]
    if (js) await probar(`  código de la aplicación (${js})`, `${sitio}${js}`)
    // Ruta interna servida como aplicación de una sola página (no debe dar 404).
    await probar('  ruta interna /admin/prediccion', `${sitio}/admin/prediccion`)
  }
}

if (!SUPABASE || !ANON) {
  console.log('! Sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: no se prueba Supabase.')
} else {
  const h = { apikey: ANON, Authorization: `Bearer ${ANON}` }
  await probar('Supabase Auth (inicio de sesión)', `${SUPABASE}/auth/v1/health`, { headers: h })
  await probar('Supabase API (datos)', `${SUPABASE}/rest/v1/rpc/servidor_ahora`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' })
  await probar('Supabase Storage (comprobantes)', `${SUPABASE}/storage/v1/bucket`, { headers: h }, s => s < 500)
  // Tiempo real (aprobaciones al instante): WebSocket.
  await new Promise<void>(fin => {
    const t0 = performance.now()
    const ws = new WebSocket(`${SUPABASE.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`)
    const corte = setTimeout(() => { fallos++; console.log('✗ Supabase Realtime (WebSocket): sin conexión en 10 s. Las actualizaciones llegarán al recargar.'); ws.close(); fin() }, 10000)
    ws.onopen = () => { clearTimeout(corte); console.log(`✓ Supabase Realtime (WebSocket): conectado en ${Math.round(performance.now() - t0)} ms`); ws.close(); fin() }
    ws.onerror = () => { clearTimeout(corte); fallos++; console.log('✗ Supabase Realtime (WebSocket): rechazado por la red.'); fin() }
  })
}
console.log(fallos ? `\n${fallos} comprobación(es) fallaron: usa la dirección alternativa, la app local o los datos del celular (ver docs/DEMO_APF3_COMPLETA.md).` : '\nTodo responde desde esta red.')
process.exit(fallos ? 1 : 0)
