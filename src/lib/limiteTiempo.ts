// Tiempo límite para llamadas al modelo (degradación controlada, PROY). Si la base no responde a tiempo, la
// pantalla deja de esperar, lo explica y muestra la regla manual. El cálculo puede terminar igual en el servidor:
// al recargar se verán sus resultados, que quedan en la bitácora de predicciones.
import type { Resultado } from '../store'

export const LIMITE_MODELO_MS = 8000
export const REGLA_MANUAL = 'Mientras tanto, aplica la regla manual: recuerda primero a quien se atrasó en los últimos 3 meses.'
// El servidor puede terminar después: se avisa para que nadie reintente sin necesidad (la base procesa los cálculos de
// una junta de a uno, así que un reintento solo espera su turno y vuelve a calcular).
export const RESULTADO_TARDIO = 'Si el servidor termina el cálculo, el resultado aparecerá solo en Predicción de morosidad; no hace falta volver a pulsar.'
const PREFIJO_TARDANZA = 'El modelo tardó más de'
/** true si el error es el tiempo límite del cliente (no un rechazo del servidor). */
export const esTiempoAgotado = (error: string) => error.startsWith(PREFIJO_TARDANZA)

export async function conLimite<T>(promesa: Promise<Resultado<T>>, ms = LIMITE_MODELO_MS): Promise<Resultado<T>> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const espera = new Promise<Resultado<T>>(resolver => {
    temporizador = setTimeout(() => resolver({ ok: false, error: `${PREFIJO_TARDANZA} ${Math.round(ms / 1000)} segundos en responder. ${RESULTADO_TARDIO} ${REGLA_MANUAL}` }), ms)
  })
  try {
    return await Promise.race([promesa, espera])
  } finally {
    clearTimeout(temporizador)
  }
}
