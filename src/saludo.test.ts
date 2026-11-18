import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('./store', () => ({ useApp: vi.fn() }))

const { mensajeAdmin, mensajeVecino } = await import('./saludo')

describe('Mensajes comunitarios según los datos reales', () => {
  it('nunca felicita a un vecino con cuotas pendientes o vencidas', () => {
    expect(mensajeVecino({ vencidas: 1, pendientes: 1, enRevision: 0 })).toMatch(/vencida/)
    expect(mensajeVecino({ vencidas: 0, pendientes: 1, enRevision: 0, proximoVencimiento: '2026-12-10' })).toBe('Recuerda revisar tu próxima cuota: vence el 10/12/2026.')
    for (const r of [{ vencidas: 2, pendientes: 2, enRevision: 0 }, { vencidas: 0, pendientes: 1, enRevision: 0 }, { vencidas: 0, pendientes: 0, enRevision: 1 }]) {
      expect(mensajeVecino(r)).not.toMatch(/Gracias|al día/)
    }
  })

  it('agradece solo cuando el vecino está al día', () => {
    expect(mensajeVecino({ vencidas: 0, pendientes: 0, enRevision: 0 })).toMatch(/Estás al día/)
  })

  it('orienta al administrador según pagos por revisar', () => {
    expect(mensajeAdmin(3, 0)).toBe('Hay 3 pagos esperando tu revisión.')
    expect(mensajeAdmin(1, 5)).toBe('Hay un pago esperando tu revisión.')
    expect(mensajeAdmin(0, 2)).toMatch(/cuotas vencidas/)
    expect(mensajeAdmin(0, 0)).toMatch(/Todo al día/)
  })
})
