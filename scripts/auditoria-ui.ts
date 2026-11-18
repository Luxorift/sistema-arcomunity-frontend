// Auditoría de solo lectura de la interfaz: recorre todas las pantallas por rol en escritorio y
// móvil (Chrome del sistema) y revisa errores de consola, peticiones fallidas, desborde horizontal y
// accesibilidad básica (nombres accesibles, etiquetas, alt, encabezados, idioma, tamaño táctil).
// No crea ni modifica datos. Requiere el frontend en marcha (npm run dev o vite preview) y la semilla.
// Uso: npm run test:ui            (APP_URL=http://localhost:4173 para probar el build de producción)
//      CAPTURAS=carpeta npm run test:ui   → guarda una captura por pantalla
import { chromium, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CAPTURAS = process.env.CAPTURAS
const CLAVE_DEMO = 'Demo2026!'
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true })

const RUTAS = {
  publica: ['/login', '/registro', '/recuperar'],
  propietario: ['/mi-cuenta', '/transparencia', '/videovigilancia'],
  admin: ['/admin', '/admin/configuracion', '/admin/unidades', '/admin/cuotas', '/admin/conciliacion', '/admin/pagos', '/admin/egresos', '/admin/reportes', '/admin/auditoria', '/admin/prediccion', '/transparencia', '/videovigilancia'],
}
const VISTAS = [{ nombre: 'escritorio', viewport: { width: 1366, height: 860 }, movil: false }, { nombre: 'móvil', viewport: { width: 375, height: 812 }, movil: true }]

let fallos = 0, avisos = 0
const fallo = (m: string) => { fallos++; console.log(`  ✗ ${m}`) }
const aviso = (m: string) => { avisos++; console.log(`  ! ${m}`) }

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE_DEMO)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

// Revisión en la página: devuelve problemas encontrados.
const revisarDom = (movil: boolean) => {
  const nombre = (el: Element) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || el.querySelector('img,svg[aria-label]')?.getAttribute('alt') || el.querySelector('svg[aria-label]')?.getAttribute('aria-label') || '').trim()
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`
  const fallos: string[] = [], avisos: string[] = []
  if (!document.documentElement.lang) fallos.push('html sin lang')
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    const anchos = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && visible(e) && !e.closest('.table-wrap,[data-scroll-x]')).slice(0, 3).map(desc)
    fallos.push(`desborde horizontal (${document.documentElement.scrollWidth}px > ${window.innerWidth}px): ${anchos.join(', ')}`)
  }
  const sinNombre = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(e => visible(e) && !nombre(e))
  if (sinNombre.length) fallos.push(`${sinNombre.length} botón/enlace sin nombre accesible: ${sinNombre.slice(0, 3).map(desc).join(', ')}`)
  const campos = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(e => visible(e) || (e as HTMLInputElement).type === 'file')
  const sinEtiqueta = campos.filter(e => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.closest('label') || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.getAttribute('title')))
  if (sinEtiqueta.length) fallos.push(`${sinEtiqueta.length} campo(s) sin etiqueta: ${sinEtiqueta.slice(0, 3).map(e => `${desc(e)}[${e.getAttribute('name') || e.getAttribute('placeholder') || (e as HTMLInputElement).type}]`).join(', ')}`)
  const imgs = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt'))
  if (imgs.length) fallos.push(`${imgs.length} imagen(es) sin alt`)
  const h1 = [...document.querySelectorAll('h1')].filter(visible).length
  if (h1 !== 1) avisos.push(`${h1} encabezados h1 visibles (se espera 1)`)
  if (!document.title) fallos.push('página sin <title>')
  if (movil) {
    const chicos = [...document.querySelectorAll('button, a[href], input[type=checkbox], select')].filter(e => { const r = e.getBoundingClientRect(); return visible(e) && r.height > 0 && (r.height < 24 || r.width < 24) && !e.closest('p, td, li, label') })
    if (chicos.length) avisos.push(`${chicos.length} objetivo(s) táctiles menores de 24 px: ${chicos.slice(0, 3).map(desc).join(', ')}`)
  }
  return { fallos, avisos }
}

async function auditar(p: Page, ruta: string, vista: typeof VISTAS[number], rol: string) {
  const errores: string[] = []
  const onConsole = (m: import('playwright-core').ConsoleMessage) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)) }
  const onError = (e: Error) => errores.push(`excepción: ${e.message.slice(0, 160)}`)
  const onResp = (r: import('playwright-core').Response) => { if (r.status() >= 400 && !r.url().includes('/auth/v1/token')) errores.push(`HTTP ${r.status()} ${r.url().replace(/\?.*/, '').slice(-80)}`) }
  p.on('console', onConsole); p.on('pageerror', onError); p.on('response', onResp)
  await p.goto(`${APP}${ruta}`)
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await p.waitForFunction(() => !document.querySelector('.loading-screen, .cargando'), null, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(600)
  const destino = new URL(p.url()).pathname
  const r = await p.evaluate(revisarDom, vista.movil)
  p.off('console', onConsole); p.off('pageerror', onError); p.off('response', onResp)
  const etiqueta = `[${vista.nombre}] ${rol} ${ruta}${destino !== ruta ? ` → ${destino}` : ''}`
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/${vista.nombre === 'móvil' ? 'movil' : 'escritorio'}_${rol}${ruta.replaceAll('/', '_')}.png`, fullPage: true })
  if (!r.fallos.length && !r.avisos.length && !errores.length) return console.log(`  ✓ ${etiqueta}`)
  for (const f of r.fallos) fallo(`${etiqueta}: ${f}`)
  for (const e of errores) fallo(`${etiqueta}: ${e}`)
  for (const a of r.avisos) aviso(`${etiqueta}: ${a}`)
}

const navegador = await chromium.launch({ executablePath: CHROME, headless: true })
try {
  for (const vista of VISTAS) {
    console.log(`\n${vista.nombre} (${vista.viewport.width}×${vista.viewport.height})`)
    const contexto = (correo?: string) => navegador.newContext({ viewport: vista.viewport, locale: 'es-PE', isMobile: vista.movil, hasTouch: vista.movil }).then(async c => { const p = await c.newPage(); if (correo) await entrar(p, correo); return p })
    const anon = await contexto()
    for (const ruta of RUTAS.publica) await auditar(anon, ruta, vista, 'anónimo')
    await anon.goto(`${APP}/admin`); await anon.waitForURL(u => u.pathname === '/login', { timeout: 10000 }).catch(() => {})
    if (new URL(anon.url()).pathname !== '/login') fallo(`[${vista.nombre}] anónimo puede abrir /admin`)
    const vecina = await contexto('casa12@arcomunity.demo')
    for (const ruta of RUTAS.propietario) await auditar(vecina, ruta, vista, 'propietario')
    await vecina.goto(`${APP}/admin/pagos`); await vecina.waitForTimeout(1500)
    if (new URL(vecina.url()).pathname.startsWith('/admin')) fallo(`[${vista.nombre}] propietario puede abrir /admin/pagos`)
    const admin = await contexto('admin@arcomunity.demo')
    for (const ruta of RUTAS.admin) await auditar(admin, ruta, vista, 'admin')
    await Promise.all([anon, vecina, admin].map(p => p.context().close()))
  }
} finally {
  await navegador.close()
}
console.log(`\nResultado: ${fallos} problema(s), ${avisos} aviso(s)`)
process.exit(fallos ? 1 : 0)
