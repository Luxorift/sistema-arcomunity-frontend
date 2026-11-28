// Graba el video del flujo de extremo a extremo del Proyecto Final (unos 2–3 minutos):
// 1) la administración genera las cuotas del mes siguiente → 2) el modelo v1 calcula su riesgo en la base →
// 3) la administración registra un recordatorio → 4) falla simulada: regla manual de respaldo →
// 5) entrada inválida rechazada y caso válido → 6) trazabilidad en Auditoría.
//
// Por defecto graba el ENTORNO LOCAL DE PRUEBAS (npm run local:supabase + npm run local:web) y cada escena muestra
// el rótulo «Entorno local de pruebas · no es producción». Para el video de la versión publicada, usar
// APP_URL=https://… SOLO después de aplicar la migración 1500 y con autorización: la grabación crea cuotas y un
// recordatorio en la junta de demostración (la restauración nocturna los revierte).
// Uso: VIDEO=carpeta node scripts/grabar-demo-proy.ts
import { chromium, type Page } from 'playwright-core'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const APP = process.env.APP_URL ?? 'http://localhost:5174'
const LOCAL = /localhost|127\.0\.0\.1/.test(APP)
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DESTINO = process.env.VIDEO ?? 'video-demo-proy'
const CLAVE = 'Demo2026!'
const TAM = { width: 1280, height: 720 }
mkdirSync(join(DESTINO, 'pasos'), { recursive: true })

let paso = 0
const foto = (p: Page, nombre: string) => p.screenshot({ path: join(DESTINO, 'pasos', `${String(++paso).padStart(2, '0')}_${nombre}.png`) })
const RITMO = Number(process.env.RITMO ?? 1.4)   // >1 da más tiempo para leer los subtítulos
const pausa = (p: Page, ms = 1500) => p.waitForTimeout(ms * RITMO)

// Rótulo fijo (entorno) y subtítulo de cada escena, dibujados en la página: quedan dentro del video.
const ROTULO = LOCAL ? 'Entorno local de pruebas · no es producción' : 'Versión publicada'
async function subtitulo(p: Page, texto: string) {
  await p.evaluate(([t, r]) => {
    const asegurar = (id: string, css: string) => {
      let n = document.getElementById(id)
      if (!n) { n = document.createElement('div'); n.id = id; n.setAttribute('style', css); document.body.appendChild(n) }
      return n
    }
    asegurar('demo-rotulo', 'position:fixed;top:10px;right:10px;z-index:99999;background:#D9822B;color:#fff;font:700 13px Segoe UI,Arial;padding:6px 12px;border-radius:8px;box-shadow:0 2px 8px #0004').textContent = r
    const s = asegurar('demo-subtitulo', 'position:fixed;left:18px;bottom:18px;z-index:99999;background:#173A33EE;color:#fff;font:600 17px Segoe UI,Arial;padding:10px 18px;border-radius:10px;max-width:58%;text-align:left')
    s.textContent = t
  }, [texto, ROTULO])
}

async function entrar(p: Page, correo: string) {
  await p.goto(`${APP}/login`)
  await p.getByPlaceholder('tu@correo.com').fill(correo)
  await p.getByPlaceholder('Ingresa tu contraseña').fill(CLAVE)
  await p.getByRole('button', { name: 'Ingresar' }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
}
const toast = (p: Page) => p.locator('.toast').last()

const nav = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await nav.newContext({ viewport: TAM, locale: 'es-PE' })
const p = await ctx.newPage()
// Video: cuadros del screencast de Chrome (CDP) codificados con el ffmpeg que instala Playwright (VP8/WebM).
const cuadros: { t: number; jpg: Buffer }[] = []
const cdp = await ctx.newCDPSession(p)
cdp.on('Page.screencastFrame', f => { cuadros.push({ t: f.metadata.timestamp ?? Date.now() / 1000, jpg: Buffer.from(f.data, 'base64') }); void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) })
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: TAM.width, maxHeight: TAM.height, everyNthFrame: 1 })
try {
  await entrar(p, 'admin@arcomunity.demo')
  await subtitulo(p, 'Arcomunity · flujo de extremo a extremo de la predicción de morosidad (modelo v1)')
  await pausa(p, 3500)

  // 1) Registro nuevo: cuotas del mes siguiente.
  await p.goto(`${APP}/admin/cuotas`)
  await p.locator('main select').first().waitFor()
  const siguiente = await p.locator('main select').first().locator('option').first().getAttribute('value')
  await p.locator('main select').first().selectOption(siguiente!)
  await subtitulo(p, '1 · La administración genera las cuotas del mes siguiente (registro nuevo)')
  await pausa(p, 2500)
  await p.getByRole('button', { name: 'Generar cuotas' }).first().click()
  await pausa(p, 1800)
  await p.locator('.modal').getByRole('button', { name: 'Generar cuotas' }).click()
  await toast(p).waitFor({ timeout: 20000 })
  await subtitulo(p, '2 · Al crearse las cuotas, la base calcula su riesgo con el modelo v1 y lo resume en el aviso')
  await pausa(p, 6000)
  await foto(p, 'cuotas_generadas_y_riesgo')

  // 2) Resultado explicado en la pantalla de predicción.
  await p.goto(`${APP}/admin/prediccion`)
  await p.locator('#ml-actuales').waitFor()
  await p.locator('#ml-actuales').scrollIntoViewIfNeeded()
  await subtitulo(p, 'Riesgo alto, medio o bajo por cuota, con la probabilidad y el porqué en lenguaje de negocio')
  await pausa(p, 3000)
  await p.mouse.wheel(0, 420)
  await pausa(p, 4000)
  await foto(p, 'predicciones_con_porque')

  // 3) Acción de la administración.
  await subtitulo(p, '3 · La administración actúa: registra el recordatorio enviado (queda auditado)')
  await p.getByRole('button', { name: 'Priorizar recordatorio' }).first().click()
  await pausa(p, 2000)
  await p.locator('.modal input').fill('Recordatorio amable por WhatsApp')
  await pausa(p, 1500)
  await p.locator('.modal').getByRole('button', { name: 'Registrar recordatorio' }).click()
  await toast(p).waitFor({ timeout: 15000 })
  await pausa(p, 4000)
  await foto(p, 'recordatorio_registrado')

  // 4) Degradación controlada.
  await p.evaluate(() => window.scrollTo(0, 0))
  await subtitulo(p, '4 · ¿Y si el modelo no responde? Simulamos una falla (solo en la junta de demostración)')
  await pausa(p, 2500)
  await p.getByRole('button', { name: 'Simular falla del modelo' }).click()
  await pausa(p, 2500)
  await p.getByRole('button', { name: 'Calcular riesgo de hoy' }).click()
  await pausa(p, 1500)
  await p.locator('.modal').getByRole('button', { name: 'Calcular de nuevo' }).click()
  await toast(p).waitFor({ timeout: 20000 })
  await p.getByText('El modelo no respondió para').scrollIntoViewIfNeeded()
  await subtitulo(p, 'Se aplica la regla manual de respaldo: sin probabilidad inventada y con el motivo a la vista')
  await pausa(p, 6000)
  await foto(p, 'regla_manual_de_respaldo')
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.getByRole('button', { name: 'Restablecer el modelo' }).click()
  await pausa(p, 2000)

  // 5) Entrada inválida y caso válido.
  const caso = p.locator('#ml-probar').locator('xpath=ancestor::section[1]')
  await caso.scrollIntoViewIfNeeded()
  await subtitulo(p, '5 · Una entrada inválida se rechaza con un mensaje claro')
  const campos = caso.locator('input')
  for (const [i, v] of ['2', '5', '1.4', '4.5'].entries()) { await campos.nth(i).fill(v); await pausa(p, 400) }
  await caso.getByRole('button', { name: 'Probar caso' }).click()
  await caso.locator('.form-error').waitFor()
  await pausa(p, 4500)
  await foto(p, 'entrada_invalida')
  await campos.nth(2).fill('0.4167')
  await subtitulo(p, 'Con datos válidos, el modelo responde: riesgo y acción sugerida')
  await caso.getByRole('button', { name: 'Probar caso' }).click()
  await caso.locator('[role="status"]').waitFor()
  await pausa(p, 5000)
  await foto(p, 'caso_valido')

  // 6) Trazabilidad.
  await p.goto(`${APP}/admin/auditoria`)
  await pausa(p, 1500)
  await subtitulo(p, '6 · Trazabilidad: cada cálculo, falla simulada y recordatorio queda en la auditoría')
  await pausa(p, 6000)
  await foto(p, 'auditoria')
  await subtitulo(p, 'Fin · las predicciones también quedan en registro_predicciones con entrada, versión y fecha')
  await pausa(p, 3500)
} finally {
  await cdp.send('Page.stopScreencast').catch(() => undefined)
  await ctx.close()
  await nav.close()
}

// Secuencia a 12 cuadros por segundo: en cada instante se repite el último cuadro recibido.
function buscarFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  const base = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
  const dir = existsSync(base) ? readdirSync(base).filter(d => d.startsWith('ffmpeg-')).sort().pop() : undefined
  return dir ? join(base, dir, 'ffmpeg-win64.exe') : 'ffmpeg'
}
const FPS = 25   // ritmo de entrada por defecto de image2pipe
const salida = join(DESTINO, `demo_proy_${LOCAL ? 'entorno_local' : 'publicada'}.webm`)
// Mismos argumentos que usa Playwright para su propio video (compatibles con su ffmpeg reducido).
const ff = spawn(buscarFfmpeg(), ['-loglevel', 'error', '-f', 'image2pipe', '-avioflags', 'direct', '-fpsprobesize', '0', '-probesize', '32',
  '-analyzeduration', '0', '-c:v', 'mjpeg', '-i', 'pipe:0', '-y', '-an', '-r', String(FPS), '-c:v', 'vp8', '-qmin', '0', '-qmax', '50',
  '-crf', '8', '-deadline', 'realtime', '-speed', '8', '-b:v', '1500k', salida], { stdio: ['pipe', 'inherit', 'inherit'] })
let i = 0
for (let t = cuadros[0].t; t <= cuadros[cuadros.length - 1].t; t += 1 / FPS) {
  while (i + 1 < cuadros.length && cuadros[i + 1].t <= t) i++
  if (!ff.stdin.write(cuadros[i].jpg)) await new Promise(ok => ff.stdin.once('drain', ok))
}
ff.stdin.end()
await new Promise((ok, mal) => ff.on('close', c => (c === 0 ? ok(null) : mal(new Error(`ffmpeg terminó con código ${c}`)))))
console.log(`Listo: ${salida} (${Math.round(cuadros[cuadros.length - 1].t - cuadros[0].t)} s) y ${paso} capturas en ${DESTINO}`)
