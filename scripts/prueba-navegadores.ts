// Prueba de extremo a extremo en dos navegadores reales distintos (Edge y Chrome instalados en el
// sistema) con perfiles aislados, contra el frontend local y el Supabase real.
//   Edge   → propietaria Casa 12 paga S/ 140 (monto distinto) con el comprobante de ejemplo.
//   Chrome → administración ve el pago en tiempo real y lo aprueba desde la interfaz.
//   Edge   → la propietaria ve su cuota pagada sin recargar.
// Al final se restaura la cuota de la semilla. Requiere `npm run dev` y la semilla cargada.
// Uso: npm run test:navegadores
import { chromium, type Page } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CLAVE_DEMO = 'Demo2026!'
const servicio = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

let ok = 0
const fallos: string[] = []
const check = (n: string, c: boolean, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { fallos.push(n); console.log(`  ✗ ${n} ${d}`) } }

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE_DEMO)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}

const edge = await chromium.launch({ executablePath: EDGE, headless: true })
const chrome = await chromium.launch({ executablePath: CHROME, headless: true })
let cuotaId = ''
try {
  const vecina = await (await edge.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE' })).newPage()
  const admin = await (await chrome.newContext({ viewport: { width: 1366, height: 860 }, locale: 'es-PE' })).newPage()
  console.log(`Edge ${edge.version()} · Chrome ${chrome.version()}`)

  console.log('\n1. Sesiones independientes')
  await entrar(admin, 'admin@arcomunity.demo')
  check('Chrome: administración entra al panel', admin.url().endsWith('/admin'))
  await entrar(vecina, 'casa12@arcomunity.demo')
  check('Edge: la propietaria entra a su cuenta', vecina.url().endsWith('/mi-cuenta'))
  check('las sesiones no se mezclan', (await admin.locator('.topbar-user strong').innerText()).includes('Administración'))

  await admin.goto(`${APP}/admin/conciliacion`)
  await admin.locator('.nav-count').waitFor({ timeout: 15000 }).catch(() => {})
  const antes = Number(await admin.locator('.nav-count').innerText().catch(() => '0'))

  console.log('\n2. Pago desde Edge (móvil)')
  await vecina.getByRole('link', { name: /Pagar ahora/ }).click()
  cuotaId = vecina.url().split('/pagar/')[1]
  await vecina.getByRole('button', { name: /Ya pagué/ }).click()
  await vecina.getByRole('button', { name: /comprobante de ejemplo/ }).click()
  await vecina.getByRole('button', { name: 'Continuar' }).click()
  await vecina.getByPlaceholder('150.00').fill('140')
  check('Edge: avisa que el monto es distinto antes de enviar', await vecina.getByText(/Es distinto a tu cuota/).isVisible())
  await vecina.getByRole('button', { name: /Enviar comprobante/ }).click()
  await vecina.getByText('Tu comprobante fue enviado correctamente').waitFor({ timeout: 20000 })
  check('Edge: el pago queda en revisión y explica el motivo', await vecina.getByText('El monto no coincide con tu cuota.').isVisible())

  console.log('\n3. Revisión en Chrome (tiempo real, sin recargar)')
  await admin.waitForFunction(n => Number(document.querySelector('.nav-count')?.textContent ?? 0) > n, antes, { timeout: 15000 })
  check('Chrome: el contador de Conciliación sube sin recargar', true)
  const fila = admin.locator('tbody tr', { hasText: 'Casa 12' })
  await fila.waitFor({ timeout: 10000 })
  await fila.getByRole('button', { name: /Revisar/ }).click()
  await admin.getByRole('button', { name: 'Ver comprobante' }).click()
  await admin.locator('.receipt-link img').waitFor({ timeout: 10000 })
  check('Chrome: abre el comprobante con URL firmada', (await admin.locator('.receipt-link img').getAttribute('src'))!.includes('/object/sign/comprobantes/'))
  await admin.getByPlaceholder(/Verificado en la app/).fill('Diferencia autorizada por la junta (prueba)')
  await admin.getByRole('button', { name: /Aprobar pago de/ }).click()
  await admin.getByText('Pago aprobado y cuota actualizada.').waitFor({ timeout: 15000 })
  check('Chrome: aprueba el pago desde la interfaz', true)

  console.log('\n4. Edge recibe el cambio')
  await vecina.getByRole('link', { name: 'Volver a mi cuenta' }).click()
  await vecina.getByText('Estás al día').first().waitFor({ timeout: 15000 })
  check('Edge: la propietaria ve que está al día', true)
  check('Edge: el saludo agradece solo ahora que no hay pendientes', await vecina.getByText(/Gracias por contribuir/).first().isVisible())
} catch (e) {
  fallos.push(`excepción: ${(e as Error).message.split('\n')[0]}`)
  console.error(e)
} finally {
  await edge.close(); await chrome.close()
  if (cuotaId) {
    const { data: pagos } = await servicio.from('pagos').select('id, comprobante_path').eq('cuota_id', cuotaId).like('numero_operacion', 'DEMO%')
    await servicio.from('cuotas').update({ estado: 'pendiente', fecha_pago: null, pago_id: null }).eq('id', cuotaId)
    if (pagos?.length) {
      await servicio.from('pagos').delete().in('id', pagos.map(p => p.id))
      await servicio.storage.from('comprobantes').remove(pagos.map(p => p.comprobante_path).filter(Boolean) as string[])
    }
    console.log(`\nLimpieza: cuota de Casa 12 restaurada, ${pagos?.length ?? 0} pago(s) de prueba eliminados`)
  }
  console.log(`Resultado: ${ok} correctas, ${fallos.length} fallidas`)
  if (fallos.length) { console.log(fallos.map(f => ` - ${f}`).join('\n')); process.exitCode = 1 }
}
