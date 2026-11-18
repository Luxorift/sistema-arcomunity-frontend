// Prueba de regresión responsive (solo lectura): recorre pantallas, menú, modales y los pasos del pago
// en varios tamaños con Chrome y Edge, y busca contenido que se sale del ancho o queda recortado.
// No basta con comparar scrollWidth: un overflow-x:hidden en html/body esconde el desborde. Por eso
// se mide cada elemento contra el ancho visible y contra los contenedores que lo recortan.
// Uso: npm run test:responsive            (APP_URL=… para otro servidor; CAPTURAS=carpeta guarda capturas)
//      TAMANOS=360x800,768x1024 npm run test:responsive   → solo esos tamaños
import { chromium, type Browser, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CLAVE_DEMO = 'Demo2026!'
const CAPTURAS = process.env.CAPTURAS
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true })
const NAVEGADORES = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
}
type Tamano = { nombre: string; w: number; h: number; movil: boolean }
const TODOS: Tamano[] = [
  { nombre: 'compacto', w: 320, h: 568, movil: true },
  { nombre: 'galaxy-a55', w: 360, h: 800, movil: true },
  { nombre: 'estandar', w: 375, h: 812, movil: true },
  { nombre: 'grande', w: 430, h: 932, movil: true },
  { nombre: 'tablet', w: 768, h: 1024, movil: true },
  { nombre: 'escritorio', w: 1366, h: 768, movil: false },
  { nombre: 'a55-horizontal', w: 800, h: 360, movil: true },
  { nombre: 'compacto-horizontal', w: 568, h: 320, movil: true },
]
const filtro = process.env.TAMANOS?.split(',')
const TAMANOS = filtro ? TODOS.filter(t => filtro.includes(`${t.w}x${t.h}`)) : TODOS
// Chrome en todos los tamaños; Edge en móvil, tablet y horizontal.
const PLAN: [keyof typeof NAVEGADORES, Tamano[]][] = [
  ['chrome', TAMANOS],
  ['edge', TAMANOS.filter(t => ['galaxy-a55', 'tablet', 'a55-horizontal'].includes(t.nombre))],
]

type Escena = { rol: 'anonimo' | 'propietario' | 'admin'; nombre: string; ruta: string; accion?: (p: Page) => Promise<unknown> }
const clic = (nombre: string | RegExp) => (p: Page) => p.getByRole('button', { name: nombre }).first().click()
const abrirMenu = async (p: Page) => { if (await p.locator('.menu-button').isVisible()) { await p.locator('.menu-button').click(); await p.waitForTimeout(350) } }
const ESCENAS: Escena[] = [
  { rol: 'anonimo', nombre: 'login', ruta: '/login' },
  { rol: 'anonimo', nombre: 'registro', ruta: '/registro' },
  { rol: 'anonimo', nombre: 'registro-validado', ruta: '/registro', accion: async p => { await p.getByLabel('Código de la junta').fill('ARCO2026'); await clic('Validar')(p); await p.getByText('Código válido').waitFor({ timeout: 15000 }) } },
  { rol: 'anonimo', nombre: 'recuperar', ruta: '/recuperar' },
  { rol: 'anonimo', nombre: 'restablecer-expirado', ruta: '/restablecer' },
  { rol: 'propietario', nombre: 'mi-cuenta', ruta: '/mi-cuenta' },
  { rol: 'propietario', nombre: 'menu', ruta: '/mi-cuenta', accion: abrirMenu },
  { rol: 'propietario', nombre: 'pago-paso-1', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await p.getByRole('button', { name: /Ya pagué/ }).waitFor() } },
  { rol: 'propietario', nombre: 'pago-paso-2', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await clic(/Ya pagué/)(p); await clic(/comprobante de ejemplo/)(p); await p.waitForTimeout(400) } },
  { rol: 'propietario', nombre: 'pago-paso-3', ruta: '/mi-cuenta', accion: async p => { await p.getByRole('link', { name: /Pagar ahora/ }).click(); await clic(/Ya pagué/)(p); await clic(/comprobante de ejemplo/)(p); await clic('Continuar')(p); await p.getByPlaceholder('150.00').fill('140') } },
  { rol: 'propietario', nombre: 'transparencia', ruta: '/transparencia' },
  { rol: 'propietario', nombre: 'videovigilancia', ruta: '/videovigilancia' },
  { rol: 'admin', nombre: 'resumen', ruta: '/admin' },
  { rol: 'admin', nombre: 'menu', ruta: '/admin', accion: abrirMenu },
  { rol: 'admin', nombre: 'configuracion', ruta: '/admin/configuracion' },
  { rol: 'admin', nombre: 'unidades', ruta: '/admin/unidades' },
  { rol: 'admin', nombre: 'unidades-modal', ruta: '/admin/unidades', accion: clic(/Nueva unidad/) },
  { rol: 'admin', nombre: 'unidades-confirmar', ruta: '/admin/unidades', accion: clic('Desactivar') },
  { rol: 'admin', nombre: 'cuotas', ruta: '/admin/cuotas' },
  { rol: 'admin', nombre: 'cuotas-confirmar', ruta: '/admin/cuotas', accion: clic(/Generar cuotas/) },
  { rol: 'admin', nombre: 'conciliacion', ruta: '/admin/conciliacion' },
  { rol: 'admin', nombre: 'conciliacion-revisar', ruta: '/admin/conciliacion', accion: async p => { await clic(/Revisar/)(p); await p.locator('.modal').waitFor() } },
  { rol: 'admin', nombre: 'pagos', ruta: '/admin/pagos' },
  { rol: 'admin', nombre: 'pagos-manual', ruta: '/admin/pagos', accion: clic(/Registrar pago manual/) },
  { rol: 'admin', nombre: 'egresos', ruta: '/admin/egresos' },
  { rol: 'admin', nombre: 'egresos-modal', ruta: '/admin/egresos', accion: clic(/Nuevo egreso/) },
  { rol: 'admin', nombre: 'reportes', ruta: '/admin/reportes' },
  { rol: 'admin', nombre: 'auditoria', ruta: '/admin/auditoria' },
  { rol: 'admin', nombre: 'prediccion', ruta: '/admin/prediccion' },
  { rol: 'admin', nombre: 'transparencia', ruta: '/transparencia' },
  { rol: 'admin', nombre: 'videovigilancia', ruta: '/videovigilancia' },
  { rol: 'admin', nombre: 'camara-modal', ruta: '/admin/configuracion', accion: clic(/Nueva cámara/) },
]

// Se ejecuta dentro de la página. Devuelve problemas (fallan la prueba) y avisos.
const medir = (movil: boolean) => {
  const W = document.documentElement.clientWidth
  const problemas: string[] = [], avisos: string[] = []
  const desc = (el: Element) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    const txt = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` «${txt}»` : ''}`
  }
  const visible = (el: Element) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const tieneTexto = (el: Element) => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim().length > 0)
  const interactivo = (el: Element) => el.matches('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [tabindex]:not([tabindex="-1"])')
  const raiz = document.documentElement, cuerpo = document.body
  // 1) Desborde del documento (sin contar el recorte de html/body).
  const ancho = Math.max(raiz.scrollWidth, cuerpo.scrollWidth)
  if (ancho > W + 1) problemas.push(`el documento mide ${ancho}px de ancho (> ${W}px)`)
  const fuera = new Set<Element>()
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, [aria-hidden="true"], .skip-link, .sidebar:not(.sidebar-open)') || !visible(el)) continue
    const r = el.getBoundingClientRect()
    // Contenedor más cercano que recorta o desplaza (sin contar html/body).
    let cont: Element | null = null
    for (let p = el.parentElement; p && p !== cuerpo && p !== raiz; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox !== 'visible') { cont = p; break }
    }
    if (cont) {
      const ox = getComputedStyle(cont).overflowX
      if (ox === 'auto' || ox === 'scroll') continue // dentro de un área con scroll horizontal intencional
      const rc = cont.getBoundingClientRect()
      // Recortado por un contenedor con overflow hidden: solo importa si es contenido real.
      if ((r.right > rc.right + 1 || r.left < rc.left - 1) && (tieneTexto(el) || interactivo(el))) {
        if (!fuera.has(el.parentElement!)) problemas.push(`recortado por ${desc(cont)}: ${desc(el)} (${Math.round(r.left)}–${Math.round(r.right)} de ${Math.round(rc.left)}–${Math.round(rc.right)})`)
        fuera.add(el)
      }
      continue
    }
    if ((r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') {
      if (!fuera.has(el.parentElement!)) problemas.push(`se sale del ancho: ${desc(el)} (${Math.round(r.left)}–${Math.round(r.right)} de 0–${W})`)
      fuera.add(el)
    }
  }
  // Las áreas con scroll horizontal deben caber en la pantalla.
  for (const el of document.querySelectorAll('body *')) {
    const ox = getComputedStyle(el).overflowX
    if ((ox === 'auto' || ox === 'scroll') && visible(el) && el !== cuerpo) {
      const r = el.getBoundingClientRect()
      if (r.right > W + 1 || r.left < -1) problemas.push(`área con scroll más ancha que la pantalla: ${desc(el)}`)
    }
  }
  // Áreas con scroll vertical tan bajas que esconden su contenido (p. ej. un menú encogido a 0 px).
  for (const el of document.querySelectorAll('body *')) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1 && !el.closest('.sidebar:not(.sidebar-open)')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height < 60 && getComputedStyle(el).display !== 'none') problemas.push(`área con scroll de solo ${Math.round(r.height)}px de alto: ${desc(el)}`)
    }
  }
  // El menú lateral visible debe mostrar todos sus enlaces (desplazando el propio menú si hace falta).
  const menu = document.querySelector('.sidebar')
  if (menu && visible(menu) && !(getComputedStyle(menu).visibility === 'hidden')) {
    for (const a of menu.querySelectorAll('.nav-link')) {
      let oculto = false
      for (let p = a.parentElement; p && p !== menu; p = p.parentElement) {
        const rp = p.getBoundingClientRect(), ra = a.getBoundingClientRect()
        if (getComputedStyle(p).overflowY !== 'visible' && (ra.bottom > rp.bottom + 1 || ra.top < rp.top - 1)) oculto = true
      }
      if (oculto) problemas.push(`enlace del menú oculto dentro de un área con scroll: ${desc(a)}`)
    }
  }
  // 2) Texto cortado sin puntos suspensivos.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !tieneTexto(el) || el.closest('svg, .sidebar:not(.sidebar-open)')) continue
    const s = getComputedStyle(el)
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) {
      if (s.textOverflow === 'ellipsis') avisos.push(`texto abreviado con …: ${desc(el)}`)
      else problemas.push(`texto cortado: ${desc(el)}`)
    }
  }
  // 3) Controles táctiles y letra.
  if (movil) {
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=radio]')) {
      if (!visible(el) || el.closest('.sidebar:not(.sidebar-open), p')) continue
      const r = el.getBoundingClientRect()
      if (el.closest('label') && el.matches('input')) continue
      if (r.height < 24 || r.width < 24) problemas.push(`control táctil de ${Math.round(r.width)}×${Math.round(r.height)}px: ${desc(el)}`)
    }
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !tieneTexto(el) || el.closest('svg, .sidebar:not(.sidebar-open)')) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < 10) avisos.push(`letra de ${fs}px: ${desc(el)}`)
  }
  return { problemas: [...new Set(problemas)], avisos: [...new Set(avisos)] }
}

let fallos = 0, avisosTotales = 0, revisadas = 0
const resumenAvisos = new Map<string, number>()

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE_DEMO)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

async function revisar(nav: Browser, navNombre: string, t: Tamano) {
  const contexto = await nav.newContext({ viewport: { width: t.w, height: t.h }, isMobile: t.movil, hasTouch: t.movil, locale: 'es-PE', deviceScaleFactor: 1 })
  const paginas: Record<Escena['rol'], Page> = {
    anonimo: await contexto.newPage(),
    propietario: await (await nav.newContext({ viewport: { width: t.w, height: t.h }, isMobile: t.movil, hasTouch: t.movil, locale: 'es-PE', deviceScaleFactor: 1 })).newPage(),
    admin: await (await nav.newContext({ viewport: { width: t.w, height: t.h }, isMobile: t.movil, hasTouch: t.movil, locale: 'es-PE', deviceScaleFactor: 1 })).newPage(),
  }
  await entrar(paginas.propietario, 'casa12@arcomunity.demo')
  await entrar(paginas.admin, 'admin@arcomunity.demo')
  for (const e of ESCENAS) {
    const p = paginas[e.rol]
    const etiqueta = `[${navNombre} ${t.w}×${t.h}] ${e.rol} ${e.nombre}`
    try {
      await p.goto(`${APP}${e.ruta}`)
      await p.locator('#contenido, .auth-form-wrap').first().waitFor({ timeout: 20000 })
      await p.waitForFunction(() => !document.querySelector('.loading-screen, .cargando'), null, { timeout: 15000 }).catch(() => {})
      await p.waitForTimeout(500)
      if (e.accion) { await e.accion(p); await p.waitForTimeout(450) }
      const r = await p.evaluate(medir, t.movil)
      revisadas++
      if (CAPTURAS && (r.problemas.length || process.env.TODAS)) await p.screenshot({ path: `${CAPTURAS}/${navNombre}_${t.w}x${t.h}_${e.rol}_${e.nombre}.png`, fullPage: true })
      for (const m of r.problemas) { fallos++; console.log(`  ✗ ${etiqueta}: ${m}`) }
      for (const a of r.avisos) { avisosTotales++; resumenAvisos.set(a, (resumenAvisos.get(a) ?? 0) + 1) }
      if (!r.problemas.length && process.env.DETALLE) console.log(`  ✓ ${etiqueta}`)
    } catch (err) {
      fallos++
      console.log(`  ✗ ${etiqueta}: no se pudo revisar (${(err as Error).message.split('\n')[0].slice(0, 120)})`)
    }
  }
  await Promise.all(Object.values(paginas).map(p => p.context().close()))
}

for (const [navNombre, tamanos] of PLAN) {
  if (!tamanos.length) continue
  const nav = await chromium.launch({ executablePath: NAVEGADORES[navNombre], headless: true })
  try {
    for (const t of tamanos) {
      const antes = fallos
      await revisar(nav, navNombre, t)
      console.log(`${navNombre} ${t.nombre} ${t.w}×${t.h}: ${fallos === antes ? 'sin problemas' : `${fallos - antes} problema(s)`}`)
    }
  } finally {
    await nav.close()
  }
}
if (resumenAvisos.size) {
  console.log('\nAvisos (no fallan la prueba):')
  for (const [a, n] of [...resumenAvisos].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ! ${a} ×${n}`)
}
console.log(`\nResultado: ${revisadas} vistas revisadas · ${fallos} problema(s) · ${avisosTotales} aviso(s)`)
process.exit(fallos ? 1 : 0)
