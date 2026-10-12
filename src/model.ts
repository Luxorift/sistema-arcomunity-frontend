export type Rol = 'admin' | 'propietario'
export type EstadoCuota = 'pendiente' | 'en_revision' | 'pagada'
export type EstadoPago = 'conciliado_auto' | 'pendiente_revision' | 'conciliado_manual' | 'rechazado'
export type MetodoPago = 'yape_qr' | 'yape_captura' | 'efectivo' | 'transferencia'
export type ConceptoEgreso = 'pago_vigilante' | 'insumos' | 'otros'
export type TipoCamara = 'simulada' | 'mjpeg' | 'embed'

export interface Usuario { id: string; nombre: string; correo: string; rol: Rol; unidadId?: string; telefono?: string; claveHash: string; aceptoDatosEn?: string }
export interface Unidad { id: string; codigo: string; activa: boolean }
export interface Camara { id: string; nombre: string; ubicacion: string; tipo: TipoCamara; url?: string; activa: boolean }
export interface Cuota { id: string; unidadId: string; periodo: string; monto: number; vencimiento: string; estado: EstadoCuota; fechaPago?: string; pagoId?: string; esSimulado: boolean }
export interface Pago { id: string; cuotaId: string; unidadId: string; monto: number; fecha: string; operacion: string; metodo: MetodoPago; estado: EstadoPago; alertas: string[]; comprobante?: string; comprobanteNombre?: string; ocrConfianza?: number; motivoRechazo?: string; subidoEn: string; conciliadoEn?: string; esSimulado: boolean }
export interface Egreso { id: string; fecha: string; concepto: ConceptoEgreso; beneficiario: string; monto: number; comentario?: string; esSimulado: boolean }
export interface Auditoria { id: string; fecha: string; usuario: string; accion: string; detalle: string }
export interface Configuracion { nombre: string; codigoInvitacion: string; cuotaMensual: number; diaVencimiento: number; yapeTitular: string; yapeQr?: string; conciliacionAutomatica: boolean }
export interface Datos { usuarios: Usuario[]; unidades: Unidad[]; camaras: Camara[]; cuotas: Cuota[]; pagos: Pago[]; egresos: Egreso[]; auditoria: Auditoria[]; configuracion: Configuracion }

export const id = () => crypto.randomUUID()
export const mes = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(date) + '-01'
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const periodoAnterior = (periodo: string, resta: number) => { const [a, m] = periodo.split('-').map(Number); return new Date(Date.UTC(a, m - 1 - resta, 1)).toISOString().slice(0, 10) }
export const fechaVisible = (fecha?: string) => fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}` : '—'
export const mesVisible = (fecha: string) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha.slice(0, 10)}T12:00:00Z`))
export const dinero = (n: number) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const estadoVisible = (cuota: Cuota) => cuota.estado === 'pendiente' && cuota.vencimiento < hoy() ? 'morosa' : cuota.estado
export const tituloEstado = (estado: string) => ({ pagada: 'Pagada', pendiente: 'Pendiente', en_revision: 'En revisión', morosa: 'Morosa', conciliado_auto: 'Conciliado auto', conciliado_manual: 'Conciliado manual', pendiente_revision: 'En revisión', rechazado: 'Rechazado' }[estado] || estado)
export const fechaVencimiento = (periodo: string, dia: number) => `${periodo.slice(0, 8)}${String(dia).padStart(2, '0')}`
export const hash = async (texto: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))).map(n => n.toString(16).padStart(2, '0')).join('')

// Toda la semilla es ficticia y se marca en la interfaz como simulada.
export function crearDatos(): Datos {
  const actual = mes()
  const unidades: Unidad[] = Array.from({ length: 30 }, (_, i) => ({ id: `unidad-${i + 1}`, codigo: i < 20 ? `Casa ${String(i + 1).padStart(2, '0')}` : `Dpto ${i + 281}`, activa: true }))
  const usuarios: Usuario[] = [
    { id: 'admin-demo', nombre: 'Administración demo', correo: 'admin@arcomunity.demo', rol: 'admin', claveHash: 'demo' },
    { id: 'prop-12', nombre: 'Vecina demo 12', correo: 'casa12@arcomunity.demo', rol: 'propietario', unidadId: 'unidad-12', claveHash: 'demo' },
    { id: 'prop-08', nombre: 'Vecino demo 08', correo: 'casa08@arcomunity.demo', rol: 'propietario', unidadId: 'unidad-8', claveHash: 'demo' },
    { id: 'prop-21', nombre: 'Vecina demo 301', correo: 'dpto301@arcomunity.demo', rol: 'propietario', unidadId: 'unidad-21', claveHash: 'demo' },
  ]
  const cuotas: Cuota[] = []
  const pagos: Pago[] = []
  const egresos: Egreso[] = []
  const cronicos = new Set([3, 7, 14, 20, 27])
  const ocasionales = new Set([2, 5, 9, 13, 17, 22, 25, 29])
  const impagasHistoricas: Record<number, number> = { 1: 3, 3: 20, 5: 7, 7: 14, 9: 27, 11: 3 }
  const hoyDia = Number(hoy().slice(8, 10))

  for (let retro = 11; retro >= 0; retro--) {
    const periodo = periodoAnterior(actual, retro)
    const esActual = retro === 0
    for (let i = 1; i <= 30; i++) {
      const cuotaId = `cuota-${periodo}-${i}`
      const vencimiento = fechaVencimiento(periodo, 10)
      const esPendienteActual = esActual && (i === 12 || cronicos.has(i) || i === 17 || i === 25)
      const esRevisionActual = esActual && i === 8
      let pagada = !esPendienteActual && !esRevisionActual
      let diaPago = 10

      if (esActual) {
        if (pagada) {
          diaPago = 4 + ((i * 3) % 7) // Dias 4 al 10 en mes actual (previo o al vencimiento)
        }
      } else {
        if (cronicos.has(i)) {
          if (impagasHistoricas[retro] === i) {
            pagada = false
          } else if ((retro + i) % 7 === 0) {
            diaPago = 10
          } else {
            diaPago = 12 + ((i * 2 + retro) % 14) // Dias 12 al 25 (con atraso)
          }
        } else if (ocasionales.has(i)) {
          if ((retro + i) % 5 === 0) {
            diaPago = 11 + ((i + retro) % 8) // Dias 11 al 18 (atraso ocasional)
          } else {
            diaPago = 3 + ((i * 2 + retro) % 8) // Dias 3 al 10 (puntual)
          }
        } else {
          diaPago = 2 + ((i + retro) % 9) // Dias 2 al 10 (puntual)
        }
      }

      const diaLimitado = Math.min(diaPago, esActual ? hoyDia : 28)
      const fechaPago = pagada ? `${periodo.slice(0, 8)}${String(diaLimitado).padStart(2, '0')}` : undefined
      cuotas.push({ id: cuotaId, unidadId: `unidad-${i}`, periodo, monto: 150, vencimiento, estado: esRevisionActual ? 'en_revision' : pagada ? 'pagada' : 'pendiente', fechaPago, pagoId: pagada ? `pago-${periodo}-${i}` : undefined, esSimulado: true })

      if (pagada || esRevisionActual) {
        const fechaOperacion = fechaPago || `${periodo.slice(0, 8)}${String(Math.min(9, hoyDia)).padStart(2, '0')}`
        const metodo: MetodoPago = i % 5 === 0 ? 'efectivo' : i % 2 === 0 ? 'yape_captura' : 'yape_qr'
        pagos.push({
          id: `pago-${periodo}-${i}`,
          cuotaId,
          unidadId: `unidad-${i}`,
          monto: esRevisionActual ? 140 : 150,
          fecha: fechaOperacion,
          operacion: metodo === 'efectivo' ? `MAN-${periodo.replaceAll('-', '')}${String(i).padStart(3, '0')}` : `SIM${periodo.replaceAll('-', '')}${String(i).padStart(3, '0')}`,
          metodo,
          estado: esRevisionActual ? 'pendiente_revision' : metodo === 'efectivo' ? 'conciliado_manual' : 'conciliado_auto',
          alertas: esRevisionActual ? ['monto_no_coincide'] : [],
          subidoEn: `${fechaOperacion}T10:00:00.000Z`,
          conciliadoEn: pagada ? `${fechaOperacion}T10:02:00.000Z` : undefined,
          esSimulado: true
        })
      }
    }
    const diaEgreso = esActual ? Math.min(10, hoyDia) : 15
    const fechaEgreso = `${periodo.slice(0, 8)}${String(diaEgreso).padStart(2, '0')}`
    egresos.push({ id: `egreso-${periodo}`, fecha: fechaEgreso, concepto: 'pago_vigilante', beneficiario: 'Personal de vigilancia (demo)', monto: 2700, comentario: 'Egreso mensual simulado', esSimulado: true })
  }
  const camaras: Camara[] = [
    { id: 'camara-1', nombre: 'Ingreso principal', ubicacion: 'Puerta peatonal y vehicular', tipo: 'simulada', activa: true },
    { id: 'camara-2', nombre: 'Estacionamiento', ubicacion: 'Zona de cocheras y rampa', tipo: 'simulada', activa: true }
  ]
  return { usuarios, unidades, camaras, cuotas, pagos, egresos, auditoria: [{ id: 'auditoria-seed', fecha: new Date().toISOString(), usuario: 'Sistema demo', accion: 'datos_simulados', detalle: 'Se cargaron 30 unidades y 12 meses de historial ficticio con morosidad realista.' }], configuracion: { nombre: 'Junta Vecinal Arcomunity — Piloto', codigoInvitacion: 'ARCO2026', cuotaMensual: 150, diaVencimiento: 10, yapeTitular: 'Titular de ejemplo (configurar)', conciliacionAutomatica: true } }
}

export function calcularDiasAtraso(fechaPago?: string, fechaVencimiento?: string): number {
  if (!fechaPago || !fechaVencimiento) return 0
  return Math.max(0, Math.round((new Date(fechaPago).getTime() - new Date(fechaVencimiento).getTime()) / 86400000))
}

export function calcularMinutosConciliacion(subidoEn: string, conciliadoEn?: string): number {
  if (!conciliadoEn) return 0
  return Math.max(0, (new Date(conciliadoEn).getTime() - new Date(subidoEn).getTime()) / 60000)
}

export interface OcrExtraidoModel {
  monto?: number | string
  fecha?: string
  operacion?: string
}

export interface EntradaEvaluacionPago {
  cuotaId?: string
  monto: number
  fecha: string
  operacion: string
  metodo?: MetodoPago
  comprobante?: string
  ocrConfianza?: number
  ocrExtraido?: OcrExtraidoModel
}

export function evaluarReglasConciliacion(
  entrada: EntradaEvaluacionPago,
  cuota: Pick<Cuota, 'monto' | 'periodo'>,
  pagosExistentes: Pick<Pago, 'operacion' | 'estado'>[],
  fechaHoy = hoy()
): string[] {
  const alertas: string[] = []

  // R1: Monto exacto de la cuota
  if (Math.round(entrada.monto * 100) !== Math.round(cuota.monto * 100)) {
    alertas.push('monto_no_coincide')
  }

  // R2: Operación única (no repetida en pagos no rechazados)
  if (entrada.operacion && pagosExistentes.some(p => p.operacion.toLowerCase() === entrada.operacion.trim().toLowerCase() && p.estado !== 'rechazado')) {
    alertas.push('operacion_duplicada')
  }

  // R3: Fecha dentro del periodo (primer día del periodo - 5 días hasta hoy)
  const limite = new Date(`${cuota.periodo}T12:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() - 5)
  if (entrada.fecha < limite.toISOString().slice(0, 10) || entrada.fecha > fechaHoy) {
    alertas.push('fecha_fuera_de_periodo')
  }

  // R4: Calidad del dato y nivel de confianza OCR
  const hayValoresOcr = Boolean(
    entrada.ocrExtraido && (
      (entrada.ocrExtraido.monto != null && entrada.ocrExtraido.monto !== '') ||
      Boolean(entrada.ocrExtraido.fecha) ||
      Boolean(entrada.ocrExtraido.operacion)
    )
  )
  let ocrSinCorregir = false
  if (entrada.ocrConfianza != null && entrada.ocrConfianza < 60 && hayValoresOcr && entrada.ocrExtraido) {
    const ex = entrada.ocrExtraido
    const montoCorregido = ex.monto != null && ex.monto !== '' ? Math.round(Number(ex.monto) * 100) !== Math.round(entrada.monto * 100) : false
    const fechaCorregida = Boolean(ex.fecha && ex.fecha !== entrada.fecha)
    const operacionCorregida = Boolean(ex.operacion && ex.operacion.trim().toLowerCase() !== entrada.operacion.trim().toLowerCase())
    if (!montoCorregido && !fechaCorregida && !operacionCorregida) {
      ocrSinCorregir = true
    }
  }
  if (!entrada.operacion.trim() || !entrada.fecha || !entrada.comprobante || ocrSinCorregir) {
    alertas.push('datos_incompletos')
  }

  return alertas
}

export function calcularCuotasFaltantes(
  unidades: Unidad[],
  cuotas: Cuota[],
  periodo: string,
  cuotaMensual: number,
  diaVencimiento: number
): { faltantes: Unidad[]; cuotasNuevas: Cuota[]; existentes: number } {
  const activas = unidades.filter(u => u.activa)
  const faltantes = activas.filter(u => !cuotas.some(c => c.unidadId === u.id && c.periodo === periodo))
  const vencimiento = fechaVencimiento(periodo, diaVencimiento)
  const cuotasNuevas: Cuota[] = faltantes.map(u => ({
    id: id(),
    unidadId: u.id,
    periodo,
    monto: cuotaMensual,
    vencimiento,
    estado: 'pendiente' as const,
    esSimulado: true
  }))
  return {
    faltantes,
    cuotasNuevas,
    existentes: activas.length - faltantes.length
  }
}

export interface EntradaRegistro {
  nombre: string
  correo: string
  clave: string
  telefono?: string
  unidadId: string
  codigo: string
  consentimiento: boolean
}

export function validarRegistro(
  entrada: EntradaRegistro,
  datos: { configuracion: Pick<Configuracion, 'codigoInvitacion'>; usuarios: Pick<Usuario, 'correo' | 'unidadId'>[]; unidades: Pick<Unidad, 'id' | 'activa'>[] }
): string | null {
  if (!entrada.consentimiento) return 'Debes aceptar el tratamiento de datos para registrarte.'
  if (entrada.clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (entrada.codigo.trim().toUpperCase() !== datos.configuracion.codigoInvitacion.toUpperCase()) return 'El código de invitación no es válido.'
  if (datos.usuarios.some(u => u.correo.toLowerCase() === entrada.correo.trim().toLowerCase())) return 'Este correo ya está registrado.'
  if (datos.usuarios.some(u => u.unidadId === entrada.unidadId)) return 'Esta unidad ya tiene un propietario asignado.'
  if (!datos.unidades.some(u => u.id === entrada.unidadId && u.activa)) return 'Selecciona una unidad disponible.'
  return null
}
