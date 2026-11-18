// Recorre la web como lo haría el docente siguiendo solo el README: abre /login, escribe el correo y la
// contraseña de cada cuenta de demostración e ingresa, en Chrome y Edge, en escritorio y en celular.
// Comprueba a dónde llega cada perfil, lo que ve y que un propietario no entra al panel administrativo.
// Solo lectura: no envía pagos ni cambia datos.
// Uso: npm run test:acceso   (APP_URL=… para otra URL; por defecto la web pública)
import { chromium, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'https://sistema-arcomunity-frontend.vercel.app'
const CLAVE = 'Demo2026!' // documentada en el README (cuentas ficticias)
const NAVEGADORES = {
  Chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  Edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
}
const VISTAS = [
  { nombre: 'escritorio', viewport: { width: 1366, height: 768 }, movil: false },
  { nombre: 'celular', viewport: { width: 360, height: 800 }, movil: true },
]
type Perfil = { correo: string; destino: string; texto: RegExp; propietario: boolean }
const PERFILES: Perfil[] = [
  { correo: 'admin@arcomunity.demo', destino: '/admin', texto: /Recaudado/, propietario: false },
  { correo: 'casa12@arcomunity.demo', destino: '/mi-cuenta', texto: /vencida/i, propietario: true },
  { correo: 'casa08@arcomunity.demo', destino: '/mi-cuenta', texto: /revisión/i, propietario: true },
  // Sin cuotas vencidas: «Estás al día» (demo reiniciada) o «No tienes cuotas vencidas» (demo preparada,
  // con la cuota del mes siguiente por vencer).
  { correo: 'dpto301@arcomunity.demo', destino: '/mi-cuenta', texto: /al día|no tienes cuotas vencidas/i, propietario: true },
]

let ok = 0, fallos = 0
const check = (n: string, c: boolean, d = '') => { if (c) ok++; else { fallos++; console.log(`  ✗ ${n} ${d}`) } }

async function probar(p: Page, perfil: Perfil, etiqueta: string) {
  const errores: string[] = []
  p.on('pageerror', e => errores.push(e.message))
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('/auth/v1/token')) errores.push(`HTTP ${r.status()} ${r.url().replace(/\?.*/, '').slice(-60)}`) })
  await p.goto(`${APP}/login`)
  await p.getByLabel(/Correo/i).first().fill(perfil.correo)
  await p.getByLabel(/Contraseña/i).first().fill(CLAVE)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {})
  const ruta = new URL(p.url()).pathname
  check(`${etiqueta}: entra y llega a ${perfil.destino}`, ruta === perfil.destino, `llegó a ${ruta}`)
  const visible = await p.getByText(perfil.texto).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
  check(`${etiqueta}: muestra sus datos (${perfil.texto})`, visible)
  if (perfil.propietario) {
    await p.goto(`${APP}/admin/pagos`)
    await p.waitForTimeout(1500)
    check(`${etiqueta}: no entra al panel administrativo`, !new URL(p.url()).pathname.startsWith('/admin'), p.url())
  } else {
    for (const r of ['/admin/conciliacion', '/admin/reportes']) {
      await p.goto(`${APP}${r}`)
      check(`${etiqueta}: abre ${r}`, await p.locator('#contenido h1').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false))
    }
  }
  check(`${etiqueta}: sin errores en la página`, errores.length === 0, errores.join(' | '))
}

for (const [nombre, ruta] of Object.entries(NAVEGADORES)) {
  const nav = await chromium.launch({ executablePath: ruta, headless: true })
  try {
    for (const v of VISTAS) {
      for (const perfil of PERFILES) {
        const ctx = await nav.newContext({ viewport: v.viewport, isMobile: v.movil, hasTouch: v.movil, locale: 'es-PE' })
        await probar(await ctx.newPage(), perfil, `${nombre} ${v.nombre} ${perfil.correo}`)
        await ctx.close()
      }
      console.log(`${nombre} ${v.nombre}: revisado`)
    }
  } finally {
    await nav.close()
  }
}
console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas`)
process.exit(fallos ? 1 : 0)
