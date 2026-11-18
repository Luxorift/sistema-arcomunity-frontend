// OCR en el navegador (Tesseract.js). Solo ayuda a completar el formulario: el servidor vuelve a
// validar todo y la lectura nunca equivale a confirmar que el dinero llegó.

export type LecturaComprobante = { monto: string; fecha: string; operacion: string; confianza: number }

const MESES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12',
}

/** Normaliza un importe leído: "150", "150,00", "1,500.00", "1.500,00" → "150.00" / "1500.00". */
export function normalizarMonto(crudo: string): string {
  let t = crudo.replace(/\s/g, '')
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replaceAll(',', '')
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replaceAll('.', '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n.toFixed(2) : ''
}

function leerFecha(texto: string): string {
  const numerica = texto.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/)
  if (numerica) return `${numerica[3]}-${numerica[2].padStart(2, '0')}-${numerica[1].padStart(2, '0')}`
  // "16 nov. 2026", "16 Nov 2026", "16 de noviembre de 2026", "16 setiembre 2026"
  const textual = texto.match(/\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-záéíóú]*\.?\s*(?:de\s+|del\s+)?(20\d{2})\b/i)
  if (textual) return `${textual[3]}-${MESES[textual[2].toLowerCase()]}-${textual[1].padStart(2, '0')}`
  return ''
}

function leerMonto(texto: string): string {
  const conEtiqueta = texto.match(/(?:monto|importe|total|pagaste|yapeaste)[^\d]{0,12}(?:S\s*\/\s*\.?\s*)?(\d[\d.,]*)/i)
  const conMoneda = texto.match(/S\s*\/\s*\.?\s*(\d[\d.,]*)/i)
  for (const m of [conEtiqueta, conMoneda]) {
    const valor = m ? normalizarMonto(m[1].replace(/[.,]$/, '')) : ''
    if (valor) return valor
  }
  return ''
}

function leerOperacion(texto: string): string {
  const m = texto.match(/(?:n(?:ro|ú?m(?:ero)?)?\.?\s*[°º]?\s*(?:de\s+)?operaci[oó]n|c[oó]d(?:igo)?\.?\s*(?:de\s+)?operaci[oó]n|operaci[oó]n|transacci[oó]n)\s*(?:n[°º.]?\s*)?[:#-]?\s*([A-Z0-9]{4,20})/i)
  return m?.[1] ?? ''
}

/** Extrae monto, fecha (AAAA-MM-DD) y número de operación del texto de un comprobante. */
export function extraerCampos(texto: string): Omit<LecturaComprobante, 'confianza'> {
  const normal = texto.replace(/\s+/g, ' ')
  return { monto: leerMonto(normal), fecha: leerFecha(normal), operacion: leerOperacion(normal) }
}

export async function extraerDatosComprobante(archivo: File, alProgresar: (p: number) => void, limiteMs = 30000): Promise<LecturaComprobante> {
  const Tesseract = await import('tesseract.js')
  const worker = await Tesseract.createWorker('spa', undefined, {
    logger: m => { if (m.status === 'recognizing text') alProgresar(Math.round(m.progress * 100)) },
  })
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    // PSM 4 = una columna con textos de distinto tamaño (capturas de Yape/Plin). Con el modo por
    // defecto Tesseract omitía el monto grande de Yape ("S/ 150").
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_COLUMN })
    const resultado = await Promise.race([
      worker.recognize(archivo),
      new Promise<never>((_, rechazar) => { temporizador = setTimeout(() => rechazar(new Error('tiempo_agotado')), limiteMs) }),
    ])
    return { ...extraerCampos(resultado.data.text), confianza: resultado.data.confidence }
  } finally {
    clearTimeout(temporizador)
    void worker.terminate()
  }
}
