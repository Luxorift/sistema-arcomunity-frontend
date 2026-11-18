import { describe, expect, it } from 'vitest'
import { extraerCampos, normalizarMonto } from './ocr'

describe('Lectura de comprobantes (texto OCR)', () => {
  it('formato Yape: fecha con mes abreviado y monto sin decimales', () => {
    const texto = '¡Yapeaste!\nS/ 150\nJunta Vecinal Ejemplo\n16 nov. 2026 | 08:41 p. m.\nNro. de operación\n03921452'
    expect(extraerCampos(texto)).toEqual({ monto: '150.00', fecha: '2026-11-16', operacion: '03921452' })
  })

  it('formato Plin: fecha numérica y código de operación', () => {
    const texto = 'Plin\nMonto enviado\nS/ 150.00\nFecha: 16/11/2026 20:41\nCódigo de operación: 987654321'
    expect(extraerCampos(texto)).toEqual({ monto: '150.00', fecha: '2026-11-16', operacion: '987654321' })
  })

  it('transferencia bancaria con N° de operación y fecha larga', () => {
    const texto = 'Constancia de transferencia\nImporte: S/. 150,00\n16 de noviembre de 2026\nN° de operación: 00451239'
    expect(extraerCampos(texto)).toEqual({ monto: '150.00', fecha: '2026-11-16', operacion: '00451239' })
  })

  it('normaliza separadores de miles y decimales', () => {
    expect(normalizarMonto('1,500.00')).toBe('1500.00')
    expect(normalizarMonto('1.500,00')).toBe('1500.00')
    expect(normalizarMonto('150,5')).toBe('150.50')
    expect(normalizarMonto('0')).toBe('')
  })

  it('devuelve campos vacíos si no hay datos legibles', () => {
    expect(extraerCampos('imagen borrosa sin datos')).toEqual({ monto: '', fecha: '', operacion: '' })
  })

  it('setiembre se reconoce como mes 09', () => {
    expect(extraerCampos('Pagaste S/ 150 el 3 set. 2026').fecha).toBe('2026-09-03')
  })
})
