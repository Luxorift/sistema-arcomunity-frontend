// OCR en el navegador (Tesseract.js). Solo ayuda a completar el formulario: el servidor vuelve a
// validar todo y la lectura nunca equivale a confirmar que el dinero llegó.

export type LecturaComprobante = { monto: string; fecha: string; operacion: string; confianza: number }

/** Extrae monto, fecha (AAAA-MM-DD) y número de operación del texto de un comprobante. */
export function extraerCampos(texto: string): Omit<LecturaComprobante, 'confianza'> {
  const normal = texto.replaceAll('\n', ' ')
  const monto = normal.match(/(?:S\s*\/?\s*\/?\s*\.?\s*)(\d{1,5}(?:[.,]\d{1,2})?)|(?:monto|total|importe)\s*[:.]?\s*(?:S\s*\/\s*)?(\d{1,5}(?:[.,]\d{1,2})?)/i)
  const fecha = normal.match(/(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})/)
  const operacion = normal.match(/(?:operaci[oó]n|transacci[oó]n|n[.°º]*\s*op(?:eraci[oó]n)?)\s*[:#-]?\s*([A-Z0-9]{6,20})/i)
  const montoRaw = monto?.[1] || monto?.[2]
  return {
    monto: montoRaw ? montoRaw.replace(',', '.') : '',
    fecha: fecha ? `${fecha[3]}-${fecha[2].padStart(2, '0')}-${fecha[1].padStart(2, '0')}` : '',
    operacion: operacion?.[1] || '',
  }
}

export async function extraerDatosComprobante(archivo: File, alProgresar: (p: number) => void, limiteMs = 30000): Promise<LecturaComprobante> {
  const Tesseract = await import('tesseract.js')
  const lectura = Tesseract.recognize(archivo, 'spa', {
    logger: m => { if (m.status === 'recognizing text') alProgresar(Math.round(m.progress * 100)) },
  })
  const resultado = await Promise.race([
    lectura,
    new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo_agotado')), limiteMs)),
  ])
  return { ...extraerCampos(resultado.data.text), confianza: resultado.data.confidence }
}
