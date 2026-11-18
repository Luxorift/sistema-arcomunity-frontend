// Capturas de las pantallas principales en modo claro y oscuro (escritorio y celular). Solo lee.
// Sirven para revisar el diseño y como respaldo (plan B) si falla internet durante la exposición.
// Uso: CAPTURAS=carpeta npm run capturas:temas    (APP_URL=… para la versión publicada)
import { chromium, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DESTINO = process.env.CAPTURAS ?? 'capturas-temas'
const CLAVE_DEMO = 'Demo2026!'
mkdirSync(DESTINO, { recursive: true })

const PANTALLAS: { rol: 'anonimo' | 'propietario' | 'admin'; nombre: string; ruta: string; accion?: (p: Page) => Promise<unknown> }[] = [
  { rol: 'anonimo', nombre: 'login', ruta: '/login' },
  { rol: 'anonimo', nombre: 'registro', ruta: '/registro' },
  { rol: 'propietario', nombre: 'mi-cuenta', ruta: '/mi-cuenta' },
  { rol: 'propietario', nombre: 'pago-paso-2', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await p.getByRole('button', { name: /Ya pagué/ }).click(); await p.getByRole('button', { name: /comprobante de ejemplo/ }).click() } },
  { rol: 'propietario', nombre: 'transparencia', ruta: '/transparencia' },
  { rol: 'admin', nombre: 'resumen', ruta: '/admin' },
  { rol: 'admin', nombre: 'conciliacion-revisar', ruta: '/admin/conciliacion', accion: async p => { await p.getByRole('button', { name: /Revisar/ }).first().click(); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'cuotas', ruta: '/admin/cuotas' },
  { rol: 'admin', nombre: 'reportes', ruta: '/admin/reportes' },
  { rol: 'admin', nombre: 'auditoria', ruta: '/admin/auditoria' },
  { rol: 'admin', nombre: 'auditoria-reiniciar', ruta: '/admin/auditoria', accion: async p => { await p.getByRole('button', { name: 'Reiniciar demostración' }).click(); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'configuracion', ruta: '/admin/configuracion' },
  { rol: 'admin', nombre: 'prediccion', ruta: '/admin/prediccion' },
]
const filtro = process.env.SOLO?.split(',')
const VISTAS = [{ nombre: 'escritorio', w: 1366, h: 768, movil: false }, { nombre: 'movil', w: 375, h: 812, movil: true }]

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE_DEMO)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

const nav = await chromium.launch({ executablePath: CHROME, headless: true })
let n = 0
try {
  for (const tema of ['claro', 'oscuro'] as const) for (const v of VISTAS) {
    const op = { viewport: { width: v.w, height: v.h }, isMobile: v.movil, hasTouch: v.movil, locale: 'es-PE', colorScheme: tema === 'oscuro' ? 'dark' as const : 'light' as const, deviceScaleFactor: 1 }
    const pag = { anonimo: await (await nav.newContext(op)).newPage(), propietario: await (await nav.newContext(op)).newPage(), admin: await (await nav.newContext(op)).newPage() }
    await entrar(pag.propietario, 'casa12@arcomunity.demo')
    await entrar(pag.admin, 'admin@arcomunity.demo')
    for (const s of PANTALLAS.filter(x => !filtro || filtro.includes(x.nombre))) {
      const p = pag[s.rol]
      try {
        await p.goto(`${APP}${s.ruta}`)
        await p.locator('#contenido, .auth-form-wrap').first().waitFor({ timeout: 20000 })
        await p.waitForFunction(() => !document.querySelector('.loading-screen, .loading-inline'), null, { timeout: 15000 }).catch(() => {})
        await p.waitForTimeout(500)
        if (s.accion) { await s.accion(p); await p.waitForTimeout(500) }
        await p.screenshot({ path: `${DESTINO}/${tema}_${v.nombre}_${s.nombre}.png`, fullPage: !s.accion })
        n++
      } catch (e) { console.log(`✗ ${tema} ${v.nombre} ${s.nombre}: ${(e as Error).message.split('\n')[0].slice(0, 100)}`) }
    }
    await Promise.all(Object.values(pag).map(p => p.context().close()))
  }
} finally { await nav.close() }
console.log(`✓ ${n} capturas en ${DESTINO}`)
