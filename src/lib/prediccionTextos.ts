// Textos de negocio de la predicción (PROY): qué significa el resultado y qué hacer cuando el modelo no responde.
import type { CuotasGeneradas, RiesgoCalculado } from '../store'
import { REGLA_MANUAL } from './limiteTiempo'

export const MOTIVO_RESPALDO: Record<string, string> = {
  modelo_no_disponible: 'no hay un modelo activo',
  falla_simulada: 'se está simulando una falla del modelo (demostración)',
  entrada_fuera_de_rango: 'los datos de la cuota no son coherentes y se pasó a revisión',
  salida_fuera_de_rango: 'el modelo devolvió un valor fuera de rango',
  error_modelo: 'el modelo falló al calcular',
}

/** Resumen en una frase del cálculo de riesgo, con la regla de respaldo si se usó. */
export function resumenRiesgo(r: RiesgoCalculado): string {
  if (r.aviso) return r.aviso
  if (!r.cuotas) return 'No hay cuotas por vencer que evaluar.'
  const base = `Riesgo calculado para ${r.cuotas} ${r.cuotas === 1 ? 'cuota' : 'cuotas'}: ${r.alto} alto, ${r.medio} medio y ${r.bajo} bajo.`
  if (!r.respaldo) return base
  const motivos = r.motivos_respaldo.map(m => MOTIVO_RESPALDO[m] ?? m).join('; ')
  return `${base} En ${r.respaldo} se aplicó la regla manual de respaldo porque ${motivos}.`
}

/** Aviso tras «Generar cuotas»: cuotas creadas y riesgo del periodo, o qué hacer si el riesgo no se calculó. */
export function mensajeCuotasGeneradas(d: CuotasGeneradas): { texto: string; tipo: 'ok' | 'error' | 'info' } {
  const cuotas = `Listo: ${d.creadas} cuotas creadas y ${d.existentes} ya existían.`
  if (!d.riesgo) return { texto: cuotas, tipo: 'ok' }
  if (!d.riesgo.ok) return { texto: `${cuotas} No se pudo calcular el riesgo: ${d.riesgo.error.includes(REGLA_MANUAL) ? d.riesgo.error : `${d.riesgo.error} ${REGLA_MANUAL}`}`, tipo: 'error' }
  return { texto: `${cuotas} ${resumenRiesgo(d.riesgo.data)} Revísalo en Predicción de morosidad.`, tipo: d.riesgo.data.respaldo ? 'info' : 'ok' }
}
