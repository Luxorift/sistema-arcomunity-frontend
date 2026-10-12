import { describe, it, expect } from 'vitest'
import {
  calcularDiasAtraso,
  calcularMinutosConciliacion,
  calcularCuotasFaltantes,
  evaluarReglasConciliacion,
  validarRegistro,
  type Cuota,
  type Unidad,
  type Pago
} from './model'

describe('Reglas de conciliación (R1–R4)', () => {
  const cuotaBase: Pick<Cuota, 'monto' | 'periodo'> = {
    monto: 150,
    periodo: '2026-10-01'
  }

  it('R1: detecta monto_no_coincide cuando el monto difiere de la cuota', () => {
    const alertas = evaluarReglasConciliacion(
      { monto: 140, fecha: '2026-10-10', operacion: 'OP-001', comprobante: 'data:img' },
      cuotaBase,
      []
    )
    expect(alertas).toContain('monto_no_coincide')
  })

  it('R1: acepta pago con monto exacto sin generar alerta de monto', () => {
    const alertas = evaluarReglasConciliacion(
      { monto: 150, fecha: '2026-10-10', operacion: 'OP-001', comprobante: 'data:img' },
      cuotaBase,
      []
    )
    expect(alertas).not.toContain('monto_no_coincide')
  })

  it('R2: detecta operacion_duplicada si la operación ya existe en pago no rechazado', () => {
    const pagosPrevios: Pick<Pago, 'operacion' | 'estado'>[] = [
      { operacion: 'OP-999', estado: 'conciliado_auto' }
    ]
    const alertas = evaluarReglasConciliacion(
      { monto: 150, fecha: '2026-10-10', operacion: 'OP-999', comprobante: 'data:img' },
      cuotaBase,
      pagosPrevios
    )
    expect(alertas).toContain('operacion_duplicada')
  })

  it('R2: permite reutilizar operación si el pago anterior fue rechazado', () => {
    const pagosPrevios: Pick<Pago, 'operacion' | 'estado'>[] = [
      { operacion: 'OP-RECHAZADA', estado: 'rechazado' }
    ]
    const alertas = evaluarReglasConciliacion(
      { monto: 150, fecha: '2026-10-10', operacion: 'OP-RECHAZADA', comprobante: 'data:img' },
      cuotaBase,
      pagosPrevios
    )
    expect(alertas).not.toContain('operacion_duplicada')
  })

  it('R3: detecta fecha_fuera_de_periodo si es anterior a 5 días antes del inicio del periodo', () => {
    const alertas = evaluarReglasConciliacion(
      { monto: 150, fecha: '2026-09-20', operacion: 'OP-002', comprobante: 'data:img' },
      cuotaBase,
      []
    )
    expect(alertas).toContain('fecha_fuera_de_periodo')
  })

  it('R3: detecta fecha_fuera_de_periodo si la fecha es futura respecto a hoy', () => {
    const alertas = evaluarReglasConciliacion(
      { monto: 150, fecha: '2026-10-25', operacion: 'OP-002', comprobante: 'data:img' },
      cuotaBase,
      [],
      '2026-10-11' // simular hoy = 11/10
    )
    expect(alertas).toContain('fecha_fuera_de_periodo')
  })

  describe('R4: Calidad del dato y nivel de confianza OCR (4 casos)', () => {
    it('Caso 1 (confianza baja sin corregir): ocrConfianza < 60 y valores idénticos genera datos_incompletos', () => {
      const alertas = evaluarReglasConciliacion(
        {
          monto: 150,
          fecha: '2026-10-10',
          operacion: 'OP-OCR-100',
          comprobante: 'data:img',
          ocrConfianza: 45,
          ocrExtraido: { monto: '150', fecha: '2026-10-10', operacion: 'OP-OCR-100' }
        },
        cuotaBase,
        []
      )
      expect(alertas).toContain('datos_incompletos')
    })

    it('Caso 2 (confianza baja corregida): ocrConfianza < 60 pero propietario corrigió un campo NO genera datos_incompletos', () => {
      const alertas = evaluarReglasConciliacion(
        {
          monto: 150,
          fecha: '2026-10-10',
          operacion: 'OP-CORREGIDA',
          comprobante: 'data:img',
          ocrConfianza: 45,
          ocrExtraido: { monto: '150', fecha: '2026-10-10', operacion: 'OP-OCR-ERRONEA' }
        },
        cuotaBase,
        []
      )
      expect(alertas).not.toContain('datos_incompletos')
    })

    it('Caso 3 (confianza alta): ocrConfianza >= 60 no genera alerta aunque no se haya corregido', () => {
      const alertas = evaluarReglasConciliacion(
        {
          monto: 150,
          fecha: '2026-10-10',
          operacion: 'OP-ALTA',
          comprobante: 'data:img',
          ocrConfianza: 85,
          ocrExtraido: { monto: '150', fecha: '2026-10-10', operacion: 'OP-ALTA' }
        },
        cuotaBase,
        []
      )
      expect(alertas).not.toContain('datos_incompletos')
    })

    it('Caso 4 (ingreso manual): sin datos extraídos por OCR no se considera "sin corregir" y no genera alerta', () => {
      const alertas = evaluarReglasConciliacion(
        {
          monto: 150,
          fecha: '2026-10-10',
          operacion: 'OP-MANUAL',
          comprobante: 'data:img',
          ocrConfianza: undefined,
          ocrExtraido: undefined
        },
        cuotaBase,
        []
      )
      expect(alertas).not.toContain('datos_incompletos')
    })

    it('R4: genera datos_incompletos si falta comprobante, fecha u operación', () => {
      const sinComprobante = evaluarReglasConciliacion(
        { monto: 150, fecha: '2026-10-10', operacion: 'OP-001', comprobante: '' },
        cuotaBase,
        []
      )
      expect(sinComprobante).toContain('datos_incompletos')

      const sinOperacion = evaluarReglasConciliacion(
        { monto: 150, fecha: '2026-10-10', operacion: '   ', comprobante: 'data:img' },
        cuotaBase,
        []
      )
      expect(sinOperacion).toContain('datos_incompletos')
    })
  })
})

describe('Generación de cuotas idempotente', () => {
  const unidades: Unidad[] = [
    { id: 'u1', codigo: 'Casa 01', activa: true },
    { id: 'u2', codigo: 'Casa 02', activa: true },
    { id: 'u3', codigo: 'Casa 03', activa: false } // inactiva no debe recibir cuota
  ]

  it('genera cuotas solo para unidades activas que no tengan cuota en el periodo', () => {
    const primera = calcularCuotasFaltantes(unidades, [], '2026-10-01', 150, 10)
    expect(primera.cuotasNuevas).toHaveLength(2)
    expect(primera.existentes).toBe(0)
    expect(primera.cuotasNuevas.map(c => c.unidadId)).toEqual(['u1', 'u2'])
    expect(primera.cuotasNuevas[0].monto).toBe(150)
    expect(primera.cuotasNuevas[0].vencimiento).toBe('2026-10-10')
  })

  it('es idempotente: ejecutarlo dos veces con el mismo periodo no duplica cuotas', () => {
    const primera = calcularCuotasFaltantes(unidades, [], '2026-10-01', 150, 10)
    const segunda = calcularCuotasFaltantes(unidades, primera.cuotasNuevas, '2026-10-01', 150, 10)

    expect(segunda.cuotasNuevas).toHaveLength(0)
    expect(segunda.existentes).toBe(2)
  })
})

describe('Cálculo de métricas: días de atraso y minutos de conciliación', () => {
  it('calcularDiasAtraso retorna 0 para pagos puntuales o anticipados', () => {
    expect(calcularDiasAtraso('2026-10-10', '2026-10-10')).toBe(0)
    expect(calcularDiasAtraso('2026-10-08', '2026-10-10')).toBe(0)
  })

  it('calcularDiasAtraso retorna la cantidad de días transcurridos tras el vencimiento', () => {
    expect(calcularDiasAtraso('2026-10-15', '2026-10-10')).toBe(5)
    expect(calcularDiasAtraso('2026-10-20', '2026-10-10')).toBe(10)
  })

  it('calcularDiasAtraso retorna 0 si no hay fecha de pago', () => {
    expect(calcularDiasAtraso(undefined, '2026-10-10')).toBe(0)
  })

  it('calcularMinutosConciliacion calcula los minutos transcurridos entre subida y conciliación', () => {
    const subido = '2026-10-10T10:00:00.000Z'
    const conciliado = '2026-10-10T10:05:30.000Z'
    const minutos = calcularMinutosConciliacion(subido, conciliado)
    expect(minutos).toBeCloseTo(5.5, 1)
  })

  it('calcularMinutosConciliacion retorna 0 si el pago no ha sido conciliado', () => {
    const subido = '2026-10-10T10:00:00.000Z'
    expect(calcularMinutosConciliacion(subido, undefined)).toBe(0)
  })
})

describe('Validación de registro de propietarios', () => {
  const datosContexto = {
    configuracion: { codigoInvitacion: 'ARCO2026' },
    usuarios: [
      { correo: 'existente@arcomunity.demo', unidadId: 'u-ocupada' }
    ],
    unidades: [
      { id: 'u-libre', activa: true },
      { id: 'u-ocupada', activa: true },
      { id: 'u-inactiva', activa: false }
    ]
  }

  const baseValida = {
    nombre: 'Vecino Prueba',
    correo: 'nuevo@arcomunity.demo',
    clave: 'Segura2026!',
    codigo: 'ARCO2026',
    unidadId: 'u-libre',
    consentimiento: true
  }

  it('acepta registro válido', () => {
    expect(validarRegistro(baseValida, datosContexto)).toBeNull()
  })

  it('rechaza registro sin consentimiento', () => {
    const error = validarRegistro({ ...baseValida, consentimiento: false }, datosContexto)
    expect(error).toBe('Debes aceptar el tratamiento de datos para registrarte.')
  })

  it('rechaza contraseña de menos de 8 caracteres', () => {
    const error = validarRegistro({ ...baseValida, clave: '1234567' }, datosContexto)
    expect(error).toBe('La contraseña debe tener al menos 8 caracteres.')
  })

  it('rechaza código de junta inválido', () => {
    const error = validarRegistro({ ...baseValida, codigo: 'ERRONEO' }, datosContexto)
    expect(error).toBe('El código de invitación no es válido.')
  })

  it('rechaza correo duplicado', () => {
    const error = validarRegistro({ ...baseValida, correo: 'existente@arcomunity.demo' }, datosContexto)
    expect(error).toBe('Este correo ya está registrado.')
  })

  it('rechaza unidad ya asignada/ocupada', () => {
    const error = validarRegistro({ ...baseValida, unidadId: 'u-ocupada' }, datosContexto)
    expect(error).toBe('Esta unidad ya tiene un propietario asignado.')
  })

  it('rechaza unidad inactiva', () => {
    const error = validarRegistro({ ...baseValida, unidadId: 'u-inactiva' }, datosContexto)
    expect(error).toBe('Selecciona una unidad disponible.')
  })
})
