// Tiempo límite para llamadas al modelo (degradación controlada, PROY). Si la base no responde a tiempo, la
// pantalla deja de esperar, lo explica y muestra la regla manual. El cálculo puede terminar igual en el servidor:
// al recargar se verán sus resultados, que quedan en la bitácora de predicciones.
import type { Resultado } from '../store'

export const LIMITE_MODELO_MS = 8000
export const REGLA_MANUAL = 'Mientras tanto, aplica la regla manual: recuerda primero a quien se atrasó en los últimos 3 meses.'

export async function conLimite<T>(promesa: Promise<Resultado<T>>, ms = LIMITE_MODELO_MS): Promise<Resultado<T>> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const espera = new Promise<Resultado<T>>(resolver => {
    temporizador = setTimeout(() => resolver({ ok: false, error: `El modelo tardó más de ${Math.round(ms / 1000)} segundos en responder. ${REGLA_MANUAL}` }), ms)
  })
  try {
    return await Promise.race([promesa, espera])
  } finally {
    clearTimeout(temporizador)
  }
}
