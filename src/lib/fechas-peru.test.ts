import { describe, expect, it } from 'vitest'
import { domingoDePascua, enesimoDomingo, fechaEspecial, partesLima, saludoPorHora } from './fechas-peru'

describe('Fechas especiales del Perú', () => {
  it('calcula Semana Santa', () => {
    expect(domingoDePascua(2026)).toBe('2026-04-05')
    expect(domingoDePascua(2027)).toBe('2027-03-28')
    expect(fechaEspecial('2026-04-02')?.id).toBe('jueves-santo')
    expect(fechaEspecial('2026-04-03')?.id).toBe('viernes-santo')
  })

  it('calcula Día de la Madre y del Padre (conmemoraciones, no feriados)', () => {
    expect(enesimoDomingo(2026, 5, 2)).toBe('2026-05-10')
    expect(enesimoDomingo(2026, 6, 3)).toBe('2026-06-21')
    expect(fechaEspecial('2026-05-10')).toMatchObject({ id: 'dia-madre', tipo: 'conmemoracion' })
  })

  it('reconoce feriados fijos y días sin fecha especial', () => {
    expect(fechaEspecial('2026-07-28')).toMatchObject({ id: 'fiestas-patrias', tipo: 'feriado' })
    expect(fechaEspecial('2026-07-29')?.id).toBe('fiestas-patrias')
    expect(fechaEspecial('2026-01-01')?.mensaje).toMatch(/Feliz Año Nuevo/)
    expect(fechaEspecial('2026-12-25')?.mensaje).toMatch(/Feliz Navidad/)
    expect(fechaEspecial('2026-11-17')).toBeNull()
  })

  it('cuenta 16 feriados nacionales en 2026', () => {
    let n = 0
    for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
      if (fechaEspecial(d.toISOString().slice(0, 10))?.tipo === 'feriado') n++
    }
    expect(n).toBe(16)
  })

  it('usa la hora de Lima, no la del navegador', () => {
    // 2026-01-01T04:30Z es todavía 31/12 a las 23:30 en Lima (UTC-5).
    expect(partesLima(new Date('2026-01-01T04:30:00Z'))).toEqual({ fecha: '2025-12-31', hora: 23 })
    expect(saludoPorHora(8)).toBe('¡Buenos días')
    expect(saludoPorHora(15)).toBe('¡Buenas tardes')
    expect(saludoPorHora(23)).toBe('¡Buenas noches')
  })
})
