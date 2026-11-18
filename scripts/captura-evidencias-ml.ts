// Recorre el flujo de la demo del modelo de morosidad y guarda capturas y la tabla mostrada (Anexo C):
// Cuotas → generar el mes siguiente → Predicción de morosidad → Calcular riesgo de hoy, en escritorio y celular,
// más el intento de un propietario de abrir la pantalla. Escribe en ml/modelo_morosidad/evidencias/.
// Cambia datos de la junta demo (cuotas del mes siguiente y predicciones): al terminar, restaurar con
// `npm run demo:restaurar` (la restauración nocturna también las elimina).
// Uso: APP_URL=https://… npm run evidencias:ml   (por defecto http://localhost:5173)
import { chromium, type Page } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const DIR = 'ml/modelo_morosidad/evidencias'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync(DIR, { recursive: true })

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill('Demo2026!')
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

const nav = await chromium.launch({ executablePath: CHROME, headless: true })
try {
  const p = await (await nav.newContext({ viewport: { width: 1366, height: 860 }, locale: 'es-PE', deviceScaleFactor: 1 })).newPage()
  const errores: string[] = []
  p.on('pageerror', e => errores.push(e.message))
  await entrar(p, 'admin@arcomunity.demo')

  // 1. Cuotas del mes siguiente
  await p.goto(`${APP}/admin/cuotas`)
  const selector = p.getByLabel('Seleccionar mes').first()
  await selector.waitFor()
  const siguiente = await selector.locator('option').first().getAttribute('value')
  await selector.selectOption(siguiente!)
  if (await p.getByText('Aún no hay cuotas este mes').isVisible().catch(() => false)) {
    await p.getByRole('button', { name: /Generar cuotas/ }).click()
    await p.locator('.modal').getByRole('button', { name: 'Generar' }).click()
    await p.locator('.toast').waitFor({ timeout: 15000 })
  }
  await p.locator('table tbody tr').first().waitFor({ timeout: 15000 })
  await p.waitForTimeout(600)
  await p.screenshot({ path: `${DIR}/01_cuotas_mes_siguiente.png`, fullPage: false })
  console.log(`✓ cuotas de ${siguiente} visibles`)

  // 2. Predicción antes y después de calcular
  await p.goto(`${APP}/admin/prediccion`)
  await p.getByRole('button', { name: /Calcular riesgo de hoy/ }).waitFor({ timeout: 20000 })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${DIR}/02_prediccion_antes_de_calcular.png` })
  await p.getByRole('button', { name: /Calcular riesgo de hoy/ }).click()
  await p.locator('table tbody tr').first().waitFor({ timeout: 20000 })
  await p.waitForTimeout(600)
  await p.screenshot({ path: `${DIR}/03a_prediccion_al_calcular.png` })           // con el aviso del resultado
  await p.addStyleTag({ content: '.toast{display:none!important}' })               // solo para la captura completa
  await p.screenshot({ path: `${DIR}/03_prediccion_resultados_escritorio.png`, fullPage: true })
  const filas = await p.locator('table tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td as HTMLElement).innerText.trim())))
  const tabla = filas.map(([unidad, vence, probabilidad, riesgo, porque, accion]) => ({ unidad, vence, probabilidad, riesgo, porque, accion }))
  writeFileSync(`${DIR}/tabla_prediccion_mostrada.json`, JSON.stringify({ capturado_en: new Date().toISOString(), url: `${APP}/admin/prediccion`, filas: tabla }, null, 2))
  console.log(`✓ tabla con ${tabla.length} cuotas: ${tabla.filter(f => f.riesgo === 'alto').length} alto`)

  // 3. Celular
  const m = await (await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-PE', deviceScaleFactor: 1 })).newPage()
  await entrar(m, 'admin@arcomunity.demo')
  await m.goto(`${APP}/admin/prediccion`)
  await m.locator('table tbody tr').first().waitFor({ timeout: 20000 })
  await m.waitForTimeout(800)
  await m.screenshot({ path: `${DIR}/04_prediccion_celular.png` })

  // 4. Un propietario no accede
  const v = await (await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'es-PE', deviceScaleFactor: 1 })).newPage()
  await entrar(v, 'casa12@arcomunity.demo')
  await v.goto(`${APP}/admin/prediccion`)
  await v.waitForTimeout(2000)
  const ruta = new URL(v.url()).pathname
  await v.screenshot({ path: `${DIR}/05_propietario_sin_acceso.png` })
  console.log(`${ruta.startsWith('/admin') ? '✗' : '✓'} propietario redirigido a ${ruta}`)
  console.log(errores.length ? `✗ errores en la página: ${errores.join(' | ')}` : '✓ sin errores en la página')
} finally {
  await nav.close()
}
