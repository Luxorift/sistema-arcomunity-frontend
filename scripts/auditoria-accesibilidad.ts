// Auditoría automática de accesibilidad (WCAG 2.2 A/AA con axe-core) en modo claro y oscuro, escritorio,
// móvil y el equivalente a 200 % de zoom (683×384 px de ventana CSS en una pantalla de 1366×768).
// Solo lee: abre pantallas, menús y ventanas de confirmación sin confirmar nada. axe no reemplaza la
// revisión manual (lectores de pantalla, lenguaje, orden lógico): complementa las pruebas a mano.
// Uso: npm run test:a11y          (APP_URL=… para otro servidor; TEMAS=oscuro; VISTAS=movil)
import { chromium, type Page } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CLAVE_DEMO = 'Demo2026!'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const TEMAS = (process.env.TEMAS ?? 'claro,oscuro').split(',') as ('claro' | 'oscuro')[]
const VISTAS = [
  { nombre: 'escritorio', w: 1366, h: 768, movil: false },
  { nombre: 'movil', w: 360, h: 800, movil: true },
  { nombre: 'zoom200', w: 683, h: 384, movil: false },
].filter(v => !process.env.VISTAS || process.env.VISTAS.split(',').includes(v.nombre))

const clic = (nombre: string | RegExp) => (p: Page) => p.getByRole('button', { name: nombre }).first().click()
type Escena = { rol: 'anonimo' | 'propietario' | 'admin'; nombre: string; ruta: string; accion?: (p: Page) => Promise<unknown> }
const ESCENAS: Escena[] = [
  { rol: 'anonimo', nombre: 'login', ruta: '/login' },
  { rol: 'anonimo', nombre: 'registro', ruta: '/registro' },
  { rol: 'anonimo', nombre: 'recuperar', ruta: '/recuperar' },
  { rol: 'propietario', nombre: 'mi-cuenta', ruta: '/mi-cuenta' },
  { rol: 'propietario', nombre: 'mi-cuenta-ayuda', ruta: '/mi-cuenta', accion: p => p.getByText('¿Qué significa «En revisión»?').click() },
  { rol: 'propietario', nombre: 'pago-paso-1', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await p.getByRole('button', { name: /Ya pagué/ }).waitFor() } },
  { rol: 'propietario', nombre: 'pago-paso-3-errores', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await clic(/Ya pagué/)(p); await clic(/comprobante de ejemplo/)(p); await clic('Continuar')(p); await p.locator('#pago-operacion').fill('x'); await clic('Enviar comprobante')(p) } },
  { rol: 'propietario', nombre: 'transparencia', ruta: '/transparencia' },
  { rol: 'propietario', nombre: 'videovigilancia', ruta: '/videovigilancia' },
  { rol: 'admin', nombre: 'resumen', ruta: '/admin' },
  { rol: 'admin', nombre: 'conciliacion', ruta: '/admin/conciliacion' },
  { rol: 'admin', nombre: 'conciliacion-revisar', ruta: '/admin/conciliacion', accion: async p => { await clic(/Revisar/)(p); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'cuotas', ruta: '/admin/cuotas' },
  { rol: 'admin', nombre: 'cuotas-confirmar', ruta: '/admin/cuotas', accion: clic(/Generar cuotas/) },
  { rol: 'admin', nombre: 'pagos', ruta: '/admin/pagos' },
  { rol: 'admin', nombre: 'egresos', ruta: '/admin/egresos' },
  { rol: 'admin', nombre: 'reportes', ruta: '/admin/reportes' },
  { rol: 'admin', nombre: 'unidades', ruta: '/admin/unidades' },
  { rol: 'admin', nombre: 'auditoria', ruta: '/admin/auditoria' },
  { rol: 'admin', nombre: 'auditoria-reiniciar', ruta: '/admin/auditoria', accion: async p => { await clic('Reiniciar demostración')(p); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'auditoria-preparar', ruta: '/admin/auditoria', accion: async p => { await clic('Preparar demostración')(p); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'configuracion', ruta: '/admin/configuracion' },
  { rol: 'admin', nombre: 'prediccion', ruta: '/admin/prediccion' },
  { rol: 'admin', nombre: 'menu', ruta: '/admin', accion: async p => { if (await p.locator('.menu-button').isVisible()) await p.locator('.menu-button').click() } },
]

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE_DEMO)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

type Resultado = { id: string; impact: string; help: string; nodes: { target: string[]; failureSummary?: string }[] }
let fallos = 0, vistas = 0
const resumen = new Map<string, { n: number; ejemplo: string; help: string }>()
const navegador = await chromium.launch({ executablePath: CHROME, headless: true })
try {
  for (const tema of TEMAS) for (const v of VISTAS) {
    const opciones = { viewport: { width: v.w, height: v.h }, isMobile: v.movil, hasTouch: v.movil, locale: 'es-PE', colorScheme: tema === 'oscuro' ? 'dark' as const : 'light' as const, reducedMotion: 'reduce' as const }
    const paginas = { anonimo: await (await navegador.newContext(opciones)).newPage(), propietario: await (await navegador.newContext(opciones)).newPage(), admin: await (await navegador.newContext(opciones)).newPage() }
    await entrar(paginas.propietario, 'casa12@arcomunity.demo')
    await entrar(paginas.admin, 'admin@arcomunity.demo')
    let antes = fallos
    for (const e of ESCENAS) {
      const p = paginas[e.rol]
      const etiqueta = `[${tema} ${v.nombre}] ${e.rol} ${e.nombre}`
      try {
        await p.goto(`${APP}${e.ruta}`)
        await p.locator('#contenido, .auth-form-wrap').first().waitFor({ timeout: 20000 })
        await p.waitForFunction(() => !document.querySelector('.loading-screen, .loading-inline'), null, { timeout: 15000 }).catch(() => {})
        await p.waitForTimeout(400)
        if (e.accion) { await e.accion(p); await p.waitForTimeout(450) }
        const temaReal = await p.evaluate(() => document.documentElement.dataset.theme)
        if (temaReal !== (tema === 'oscuro' ? 'dark' : 'light')) { fallos++; console.log(`  ✗ ${etiqueta}: el tema aplicado es ${temaReal}`) }
        await p.addScriptTag({ content: AXE })
        const r = await p.evaluate(async () => {
          // @ts-expect-error axe se inyecta en la página
          const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })
          return res.violations.map((x: { id: string; impact: string; help: string; nodes: { target: string[]; failureSummary?: string }[] }) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) }))
        }) as Resultado[]
        vistas++
        for (const x of r) {
          fallos += x.nodes.length
          const clave = `${x.id}: ${x.nodes[0].target.join(' ')}`
          const prev = resumen.get(clave)
          resumen.set(clave, { n: (prev?.n ?? 0) + 1, ejemplo: `${etiqueta} · ${(x.nodes[0].failureSummary ?? '').split('\n').slice(1, 2).join(' ').trim().slice(0, 160)}`, help: x.help })
        }
      } catch (err) {
        fallos++
        console.log(`  ✗ ${etiqueta}: no se pudo revisar (${(err as Error).message.split('\n')[0].slice(0, 120)})`)
      }
    }
    console.log(`${tema} ${v.nombre} ${v.w}×${v.h}: ${fallos === antes ? 'sin incumplimientos' : `${fallos - antes} incumplimiento(s)`}`)
    antes = fallos
    await Promise.all(Object.values(paginas).map(p => p.context().close()))
  }
} finally {
  await navegador.close()
}
for (const [clave, d] of [...resumen].sort((a, b) => b[1].n - a[1].n)) console.log(`  ✗ ${clave} (×${d.n}) — ${d.help}\n      ${d.ejemplo}`)
console.log(`\nResultado: ${vistas} vistas revisadas con axe-core · ${fallos} incumplimiento(s)`)
process.exit(fallos ? 1 : 0)
