// Degradación controlada en el cliente: tiempo límite del modelo y mensajes de negocio tras generar cuotas.
import { describe, expect, it, vi } from 'vitest'
import { conLimite, REGLA_MANUAL } from './limiteTiempo'
import { mensajeCuotasGeneradas, resumenRiesgo } from './prediccionTextos'
import type { RiesgoCalculado } from '../store'

const riesgo = (x: Partial<RiesgoCalculado> = {}): RiesgoCalculado =>
  ({ cuotas: 30, alto: 12, medio: 0, bajo: 18, respaldo: 0, motivos_respaldo: [], modelo_version: 'v1', ...x })

describe('conLimite', () => {
  it('devuelve la respuesta del modelo si llega a tiempo', async () => {
    await expect(conLimite(Promise.resolve({ ok: true as const, data: 1 }), 50)).resolves.toEqual({ ok: true, data: 1 })
  })

  it('deja de esperar, lo explica y propone la regla manual si el modelo tarda', async () => {
    vi.useFakeTimers()
    const lento = new Promise<{ ok: true; data: number }>(() => {})
    const r = conLimite(lento, 8000)
    await vi.advanceTimersByTimeAsync(8000)
    await expect(r).resolves.toEqual({ ok: false, error: `El modelo tardó más de 8 segundos en responder. ${REGLA_MANUAL}` })
    vi.useRealTimers()
  })
})

describe('Mensajes de la predicción', () => {
  it('resume el riesgo calculado por el modelo', () => {
    expect(resumenRiesgo(riesgo())).toBe('Riesgo calculado para 30 cuotas: 12 alto, 0 medio y 18 bajo.')
  })

  it('explica cuándo y por qué se usó la regla de respaldo', () => {
    expect(resumenRiesgo(riesgo({ respaldo: 30, motivos_respaldo: ['falla_simulada'] })))
      .toMatch(/En 30 se aplicó la regla manual de respaldo porque se está simulando una falla del modelo/)
  })

  it('tras generar cuotas informa el riesgo del periodo', () => {
    const m = mensajeCuotasGeneradas({ periodo: '2027-01-01', creadas: 30, existentes: 0, riesgo: { ok: true, data: riesgo() } })
    expect(m).toEqual({ tipo: 'ok', texto: 'Listo: 30 cuotas creadas y 0 ya existían. Riesgo calculado para 30 cuotas: 12 alto, 0 medio y 18 bajo. Revísalo en Predicción de morosidad.' })
  })

  it('si el riesgo no se calculó, las cuotas quedan creadas y se indica la regla manual', () => {
    const m = mensajeCuotasGeneradas({ periodo: '2027-01-01', creadas: 30, existentes: 0, riesgo: { ok: false, error: 'Sin conexión con el servidor.' } })
    expect(m.tipo).toBe('error')
    expect(m.texto).toBe(`Listo: 30 cuotas creadas y 0 ya existían. No se pudo calcular el riesgo: Sin conexión con el servidor. ${REGLA_MANUAL}`)
  })

  it('si no se crearon cuotas nuevas no se recalcula el riesgo', () => {
    expect(mensajeCuotasGeneradas({ periodo: '2027-01-01', creadas: 0, existentes: 30, riesgo: null }))
      .toEqual({ tipo: 'ok', texto: 'Listo: 0 cuotas creadas y 30 ya existían.' })
  })
})
