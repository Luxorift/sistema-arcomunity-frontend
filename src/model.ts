export type Rol = 'admin' | 'propietario'
export type EstadoCuota = 'pendiente' | 'en_revision' | 'pagada'
export type EstadoPago = 'conciliado_auto' | 'pendiente_revision' | 'conciliado_manual' | 'rechazado'
export type MetodoPago = 'yape_qr' | 'yape_captura' | 'efectivo' | 'transferencia'
export type ConceptoEgreso = 'pago_vigilante' | 'insumos' | 'otros'

export interface Usuario { id: string; nombre: string; correo: string; rol: Rol; unidadId?: string; telefono?: string; claveHash: string; aceptoDatosEn?: string }
export interface Unidad { id: string; codigo: string; activa: boolean }
export interface Cuota { id: string; unidadId: string; periodo: string; monto: number; vencimiento: string; estado: EstadoCuota; fechaPago?: string; pagoId?: string; esSimulado: boolean }
export interface Pago { id: string; cuotaId: string; unidadId: string; monto: number; fecha: string; operacion: string; metodo: MetodoPago; estado: EstadoPago; alertas: string[]; comprobante?: string; comprobanteNombre?: string; ocrConfianza?: number; motivoRechazo?: string; subidoEn: string; conciliadoEn?: string; esSimulado: boolean }
export interface Egreso { id: string; fecha: string; concepto: ConceptoEgreso; beneficiario: string; monto: number; comentario?: string; esSimulado: boolean }
export interface Auditoria { id: string; fecha: string; usuario: string; accion: string; detalle: string }
export interface Configuracion { nombre: string; codigoInvitacion: string; cuotaMensual: number; diaVencimiento: number; yapeTitular: string; yapeQr?: string; conciliacionAutomatica: boolean }
export interface Datos { usuarios: Usuario[]; unidades: Unidad[]; cuotas: Cuota[]; pagos: Pago[]; egresos: Egreso[]; auditoria: Auditoria[]; configuracion: Configuracion }

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
  for (let retro = 11; retro >= 0; retro--) {
    const periodo = periodoAnterior(actual, retro)
    for (let i = 1; i <= 30; i++) {
      const cuotaId = `cuota-${periodo}-${i}`
      const vencimiento = fechaVencimiento(periodo, 10)
      const esPendienteActual = retro === 0 && (i === 12 || i % 7 === 0)
      const esRevisionActual = retro === 0 && i === 8
      const pagada = !esPendienteActual && !esRevisionActual
      const atraso = i <= 5 ? 8 + (i % 4) : i <= 13 && (retro + i) % 3 === 0 ? 4 : 0
      const diaPago = retro === 0 ? Math.min(8 + atraso, Number(hoy().slice(8, 10))) : 8 + atraso
      const fechaPago = pagada ? `${periodo.slice(0, 8)}${String(diaPago).padStart(2, '0')}` : undefined
      cuotas.push({ id: cuotaId, unidadId: `unidad-${i}`, periodo, monto: 150, vencimiento, estado: esRevisionActual ? 'en_revision' : pagada ? 'pagada' : 'pendiente', fechaPago, pagoId: pagada ? `pago-${periodo}-${i}` : undefined, esSimulado: true })
      const fechaOperacion = fechaPago || `${periodo.slice(0, 8)}${String(Math.min(9, Number(hoy().slice(8, 10)))).padStart(2, '0')}`
      if (pagada || esRevisionActual) pagos.push({ id: `pago-${periodo}-${i}`, cuotaId, unidadId: `unidad-${i}`, monto: esRevisionActual ? 140 : 150, fecha: fechaOperacion, operacion: `SIM${periodo.replaceAll('-', '')}${String(i).padStart(3, '0')}`, metodo: i % 9 === 0 ? 'efectivo' : i % 4 === 0 ? 'yape_captura' : 'yape_qr', estado: esRevisionActual ? 'pendiente_revision' : i % 9 === 0 ? 'conciliado_manual' : 'conciliado_auto', alertas: esRevisionActual ? ['monto_no_coincide'] : [], subidoEn: `${fechaOperacion}T10:00:00.000Z`, conciliadoEn: pagada ? `${fechaOperacion}T10:02:00.000Z` : undefined, esSimulado: true })
    }
    egresos.push({ id: `egreso-${periodo}`, fecha: `${periodo.slice(0, 8)}15`, concepto: 'pago_vigilante', beneficiario: 'Personal de vigilancia (demo)', monto: 2700, comentario: 'Egreso mensual simulado', esSimulado: true })
  }
  return { usuarios, unidades, cuotas, pagos, egresos, auditoria: [{ id: 'auditoria-seed', fecha: new Date().toISOString(), usuario: 'Sistema demo', accion: 'datos_simulados', detalle: 'Se cargaron 30 unidades y 12 meses de historial ficticio.' }], configuracion: { nombre: 'Junta Vecinal Arcomunity — Piloto', codigoInvitacion: 'ARCO2026', cuotaMensual: 150, diaVencimiento: 10, yapeTitular: 'Titular de ejemplo (configurar)', conciliacionAutomatica: true } }
}
