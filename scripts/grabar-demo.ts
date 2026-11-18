// Graba un video breve del flujo completo (plan B si falla internet en la exposición):
// propietario (Casa 12) registra un pago → la administración lo ve en tiempo real y lo aprueba →
// el propietario ve «Pagada» → reportes, auditoría y predicción de morosidad.
// MODIFICA datos de la junta de demostración (un pago) y al final la REINICIA con la herramienta de
// Auditoría y la vuelve a PREPARAR. No toca otras juntas.
// Uso: VIDEO=carpeta npm run grabar:demo     (APP_URL=… para la versión publicada)
import { chromium, type Page } from 'playwright-core'
import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DESTINO = process.env.VIDEO ?? 'video-demo'
const CLAVE = 'Demo2026!'
const TAM = { width: 1280, height: 720 }
mkdirSync(DESTINO, { recursive: true })

const pausa = (p: Page, ms = 1400) => p.waitForTimeout(ms)
async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE)
  await pausa(p, 600)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
  await pausa(p)
}

const nav = await chromium.launch({ executablePath: CHROME, headless: true })
const ctxAdmin = await nav.newContext({ viewport: TAM, locale: 'es-PE', recordVideo: { dir: DESTINO, size: TAM } })
const ctxVecina = await nav.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, locale: 'es-PE', recordVideo: { dir: DESTINO, size: { width: 412, height: 860 } } })
const admin = await ctxAdmin.newPage()
const vecina = await ctxVecina.newPage()
try {
  await entrar(admin, 'admin@arcomunity.demo')
  // Escenario listo antes de grabar el flujo.
  await admin.goto(`${APP}/admin/auditoria`)
  await admin.getByRole('button', { name: 'Preparar demostración' }).click()
  await pausa(admin)
  await admin.locator('.modal').getByRole('button', { name: 'Preparar demostración' }).click()
  await admin.getByText('Demostración preparada').waitFor({ timeout: 30000 })
  await pausa(admin, 2500)
  await admin.getByRole('button', { name: 'Entendido' }).click()
  // Revisión manual para que el pago pase por Conciliación.
  await admin.goto(`${APP}/admin/configuracion`)
  const auto = admin.getByRole('checkbox', { name: /Validación automática/ })
  if (await auto.isChecked()) {
    await admin.locator('label.toggle-row').first().click()
    await admin.getByRole('button', { name: 'Guardar cambios' }).first().click()
    await pausa(admin)
    await admin.locator('.modal').getByRole('button', { name: 'Guardar cambios' }).click()
    await pausa(admin)
  }
  await admin.goto(`${APP}/admin/conciliacion`)

  await entrar(vecina, 'casa12@arcomunity.demo')
  await vecina.getByRole('link', { name: /Pagar ahora/ }).click(); await pausa(vecina)
  await vecina.getByRole('button', { name: /Ya pagué/ }).click(); await pausa(vecina)
  await vecina.getByRole('button', { name: /comprobante de ejemplo/ }).click(); await pausa(vecina)
  await vecina.getByRole('button', { name: 'Continuar' }).click(); await pausa(vecina, 2000)
  await vecina.getByRole('button', { name: 'Enviar comprobante' }).click()
  await vecina.getByRole('heading', { name: /comprobante fue enviado|pago quedó registrado/ }).waitFor({ timeout: 30000 })
  await pausa(vecina, 2000)

  // Tiempo real: el pago aparece en Conciliación sin recargar.
  await admin.getByRole('button', { name: /Revisar pago de Casa 12/ }).waitFor({ timeout: 30000 })
  await pausa(admin)
  await admin.getByRole('button', { name: /Revisar pago de Casa 12/ }).click(); await pausa(admin, 2000)
  await admin.getByRole('button', { name: /Aprobar pago de/ }).click()
  await pausa(admin, 2000)

  await vecina.getByRole('link', { name: 'Volver a mi cuenta' }).click()
  await vecina.getByText('Pagada').first().waitFor({ timeout: 30000 })
  await pausa(vecina, 2500)

  for (const ruta of ['/admin/reportes', '/admin/auditoria', '/admin/prediccion']) {
    await admin.goto(`${APP}${ruta}`)
    await pausa(admin, 2800)
    if (ruta === '/admin/prediccion') { await admin.mouse.wheel(0, 500); await pausa(admin, 2500) }
  }
  // Volver al estado inicial y dejarlo preparado otra vez.
  await admin.goto(`${APP}/admin/auditoria`)
  await admin.getByRole('button', { name: 'Reiniciar demostración' }).click(); await pausa(admin)
  await admin.getByRole('checkbox', { name: /Entiendo/ }).check(); await pausa(admin, 800)
  await admin.locator('.modal').getByRole('button', { name: 'Reiniciar demostración' }).click()
  await admin.getByText('Demostración reiniciada').waitFor({ timeout: 30000 })
  await pausa(admin, 2500)
  await admin.getByRole('button', { name: 'Preparar demostración' }).click()
  await admin.locator('.modal').getByRole('button', { name: 'Preparar demostración' }).click()
  await admin.getByText('Demostración preparada').waitFor({ timeout: 30000 })
  await pausa(admin, 2000)
} finally {
  const rutas = [await admin.video()?.path(), await vecina.video()?.path()]
  await ctxAdmin.close(); await ctxVecina.close(); await nav.close()
  const [a, v] = rutas
  if (a) renameSync(a, join(DESTINO, 'demo_administracion_chrome.webm'))
  if (v) renameSync(v, join(DESTINO, 'demo_propietaria_casa12_celular.webm'))
}
console.log(`✓ Videos en ${DESTINO}`)
