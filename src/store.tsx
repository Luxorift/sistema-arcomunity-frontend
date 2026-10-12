import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { crearDatos, fechaVencimiento, hash, hoy, id, mes, type Camara, type Configuracion, type Datos, type Egreso, type MetodoPago, type Pago, type Unidad, type Usuario } from './model'

const STORAGE = 'arcomunity-frontend-v1'
const SESSION = 'arcomunity-sesion-v1'
const initial = (): Datos => {
  try {
    const saved = localStorage.getItem(STORAGE)
    if (!saved) return crearDatos()
    const parsed = JSON.parse(saved) as Datos
    if (!parsed.camaras) parsed.camaras = crearDatos().camaras
    return parsed
  } catch {
    return crearDatos()
  }
}
type Aviso = { tipo: 'ok' | 'error' | 'info'; texto: string } | null
type PagoEntrada = { cuotaId: string; monto: number; fecha: string; operacion: string; metodo: MetodoPago; comprobante?: string; comprobanteNombre?: string; ocrConfianza?: number }
type Contexto = {
  datos: Datos; usuario: Usuario | null; aviso: Aviso; mostrar: (texto: string, tipo?: 'ok' | 'error' | 'info') => void;
  entrar: (correo: string, clave: string) => Promise<boolean>; salir: () => void;
  registrar: (entrada: { nombre: string; correo: string; clave: string; telefono?: string; unidadId: string; codigo: string; consentimiento: boolean }) => Promise<string | null>;
  configurar: (config: Configuracion) => void; guardarUnidad: (unidad: Unidad) => string | null; desactivarUnidad: (unidadId: string) => void;
  guardarCamara: (camara: Camara) => string | null; cambiarEstadoCamara: (camaraId: string, activa: boolean) => void; eliminarCamara: (camaraId: string) => void;
  generarCuotas: () => { creadas: number; existentes: number }; enviarPago: (entrada: PagoEntrada) => string | null;
  revisarPago: (pagoId: string, aprobar: boolean, motivo?: string) => string | null; pagoManual: (entrada: Omit<PagoEntrada, 'comprobante' | 'comprobanteNombre' | 'ocrConfianza'>) => string | null;
  registrarEgreso: (egreso: Omit<Egreso, 'id' | 'esSimulado'>) => void; registrarAuditoria: (accion: string, detalle: string) => void; reiniciar: () => void;
}
const Ctx = createContext<Contexto | null>(null)
export const useApp = () => { const ctx = useContext(Ctx); if (!ctx) throw new Error('Falta el proveedor'); return ctx }

export function AppProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(initial)
  const [usuarioId, setUsuarioId] = useState<string | null>(() => sessionStorage.getItem(SESSION))
  const [aviso, setAviso] = useState<Aviso>(null)
  const usuario = useMemo(() => datos.usuarios.find(u => u.id === usuarioId) || null, [datos.usuarios, usuarioId])
  const mostrar = (texto: string, tipo: 'ok' | 'error' | 'info' = 'ok') => setAviso({ texto, tipo })
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(datos)) } catch { setAviso({ tipo: 'error', texto: 'El navegador no pudo guardar los datos locales. Usa imágenes más pequeñas o libera espacio.' }) } }, [datos])
  useEffect(() => { if (aviso) { const timer = setTimeout(() => setAviso(null), 6500); return () => clearTimeout(timer) } }, [aviso])
  const auditar = (d: Datos, accion: string, detalle: string) => [{ id: id(), fecha: new Date().toISOString(), usuario: usuario?.nombre || 'Sistema demo', accion, detalle }, ...d.auditoria]
  const entrar = async (correo: string, clave: string) => {
    const found = datos.usuarios.find(u => u.correo.toLowerCase() === correo.trim().toLowerCase())
    if (!found || !(found.claveHash === 'demo' ? clave === 'Demo2026!' : await hash(clave) === found.claveHash)) { mostrar('Correo o contraseña incorrectos.', 'error'); return false }
    sessionStorage.setItem(SESSION, found.id); setUsuarioId(found.id); mostrar(`Bienvenido, ${found.nombre}.`); return true
  }
  const salir = () => { sessionStorage.removeItem(SESSION); setUsuarioId(null) }
  const registrar: Contexto['registrar'] = async entrada => {
    if (!entrada.consentimiento) return 'Debes aceptar el tratamiento de datos para registrarte.'
    if (entrada.codigo.trim().toUpperCase() !== datos.configuracion.codigoInvitacion.toUpperCase()) return 'El código de invitación no es válido.'
    if (datos.usuarios.some(u => u.correo.toLowerCase() === entrada.correo.trim().toLowerCase())) return 'Este correo ya está registrado.'
    if (datos.usuarios.some(u => u.unidadId === entrada.unidadId)) return 'Esta unidad ya tiene un propietario asignado.'
    if (!datos.unidades.some(u => u.id === entrada.unidadId && u.activa)) return 'Selecciona una unidad disponible.'
    const nuevo: Usuario = { id: id(), nombre: entrada.nombre.trim(), correo: entrada.correo.trim().toLowerCase(), rol: 'propietario', unidadId: entrada.unidadId, telefono: entrada.telefono?.trim() || undefined, claveHash: await hash(entrada.clave), aceptoDatosEn: new Date().toISOString() }
    setDatos(d => ({ ...d, usuarios: [...d.usuarios, nuevo], auditoria: [{ id: id(), fecha: new Date().toISOString(), usuario: nuevo.nombre, accion: 'registro_propietario', detalle: `Unidad ${d.unidades.find(u => u.id === nuevo.unidadId)?.codigo}` }, ...d.auditoria] }))
    sessionStorage.setItem(SESSION, nuevo.id); setUsuarioId(nuevo.id); mostrar('Registro de demostración completado.'); return null
  }
  const configurar = (configuracion: Configuracion) => { setDatos(d => ({ ...d, configuracion, auditoria: auditar(d, 'actualizar_configuracion', 'Se actualizó la configuración de la junta.') })); mostrar('Configuración guardada.') }
  const guardarUnidad = (unidad: Unidad) => {
    if (datos.unidades.some(u => u.codigo.trim().toLowerCase() === unidad.codigo.trim().toLowerCase() && u.id !== unidad.id)) return 'Ya existe una unidad con ese código.'
    setDatos(d => ({ ...d, unidades: d.unidades.some(u => u.id === unidad.id) ? d.unidades.map(u => u.id === unidad.id ? { ...unidad, codigo: unidad.codigo.trim() } : u) : [...d.unidades, { ...unidad, codigo: unidad.codigo.trim() }], auditoria: auditar(d, 'guardar_unidad', unidad.codigo.trim()) })); mostrar('Unidad guardada.'); return null
  }
  const desactivarUnidad = (unidadId: string) => { setDatos(d => ({ ...d, unidades: d.unidades.map(u => u.id === unidadId ? { ...u, activa: false } : u), auditoria: auditar(d, 'desactivar_unidad', d.unidades.find(u => u.id === unidadId)?.codigo || unidadId) })); mostrar('Unidad desactivada.') }
  const guardarCamara = (camara: Camara) => {
    if (!camara.nombre.trim()) return 'El nombre de la cámara es obligatorio.'
    if (!camara.ubicacion.trim()) return 'La ubicación es obligatoria.'
    if (camara.tipo !== 'simulada') {
      if (!camara.url?.trim()) return 'Ingresa una URL para este tipo de cámara.'
      try {
        const u = new URL(camara.url.trim())
        if (u.protocol !== 'https:') return 'Solo se permiten URLs con protocolo https://.'
      } catch {
        return 'Ingresa una URL válida que comience con https://.'
      }
    }
    const limpia = { ...camara, nombre: camara.nombre.trim(), ubicacion: camara.ubicacion.trim(), url: camara.tipo === 'simulada' ? undefined : camara.url?.trim() }
    setDatos(d => ({
      ...d,
      camaras: d.camaras.some(c => c.id === limpia.id) ? d.camaras.map(c => c.id === limpia.id ? limpia : c) : [...d.camaras, limpia],
      auditoria: auditar(d, 'guardar_camara', `${limpia.nombre} (${limpia.ubicacion})`)
    }))
    mostrar('Cámara guardada.')
    return null
  }
  const cambiarEstadoCamara = (camaraId: string, activa: boolean) => {
    setDatos(d => ({
      ...d,
      camaras: d.camaras.map(c => c.id === camaraId ? { ...c, activa } : c),
      auditoria: auditar(d, activa ? 'activar_camara' : 'desactivar_camara', d.camaras.find(c => c.id === camaraId)?.nombre || camaraId)
    }))
    mostrar(activa ? 'Cámara activada.' : 'Cámara desactivada.')
  }
  const eliminarCamara = (camaraId: string) => {
    const cam = datos.camaras.find(c => c.id === camaraId)
    setDatos(d => ({
      ...d,
      camaras: d.camaras.filter(c => c.id !== camaraId),
      auditoria: auditar(d, 'eliminar_camara', cam?.nombre || camaraId)
    }))
    mostrar('Cámara eliminada.')
  }
  const registrarAuditoria = (accion: string, detalle: string) => {
    setDatos(d => ({ ...d, auditoria: auditar(d, accion, detalle) }))
  }
  const generarCuotas = () => {
    const periodo = mes(); const activas = datos.unidades.filter(u => u.activa); const faltantes = activas.filter(u => !datos.cuotas.some(c => c.unidadId === u.id && c.periodo === periodo));
    setDatos(d => ({ ...d, cuotas: [...d.cuotas, ...faltantes.map(u => ({ id: id(), unidadId: u.id, periodo, monto: d.configuracion.cuotaMensual, vencimiento: fechaVencimiento(periodo, d.configuracion.diaVencimiento), estado: 'pendiente' as const, esSimulado: true }))], auditoria: auditar(d, 'generar_cuotas', `${faltantes.length} creadas, ${activas.length - faltantes.length} existentes (${periodo}).`) }))
    return { creadas: faltantes.length, existentes: activas.length - faltantes.length }
  }
  const enviarPago = (entrada: PagoEntrada) => {
    const cuota = datos.cuotas.find(c => c.id === entrada.cuotaId)
    if (!cuota) return 'No se encontró la cuota.'
    if (cuota.estado === 'pagada') return 'Esta cuota ya está pagada.'
    if (cuota.estado === 'en_revision') return 'Esta cuota ya tiene un pago en revisión.'
    if (usuario?.rol === 'propietario' && usuario.unidadId !== cuota.unidadId) return 'No tienes acceso a esta cuota.'
    if (!entrada.comprobante) return 'Adjunta una imagen del comprobante.'
    if (!Number.isFinite(entrada.monto) || entrada.monto <= 0) return 'Ingresa un monto válido.'
    if (!entrada.fecha || entrada.fecha > hoy()) return 'La fecha no puede ser futura.'
    const alertas: string[] = []
    if (Math.round(entrada.monto * 100) !== Math.round(cuota.monto * 100)) alertas.push('monto_no_coincide')
    if (entrada.operacion && datos.pagos.some(p => p.operacion.toLowerCase() === entrada.operacion.trim().toLowerCase() && p.estado !== 'rechazado')) alertas.push('operacion_duplicada')
    const limite = new Date(`${cuota.periodo}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() - 5)
    if (entrada.fecha < limite.toISOString().slice(0, 10) || entrada.fecha > hoy()) alertas.push('fecha_fuera_de_periodo')
    if (!entrada.operacion.trim() || !entrada.fecha || !entrada.comprobante) alertas.push('datos_incompletos')
    if (!datos.configuracion.conciliacionAutomatica) alertas.push('revision_manual_configurada')
    const nuevo: Pago = { id: id(), cuotaId: cuota.id, unidadId: cuota.unidadId, monto: entrada.monto, fecha: entrada.fecha, operacion: entrada.operacion.trim(), metodo: entrada.metodo, estado: alertas.length ? 'pendiente_revision' : 'conciliado_auto', alertas, comprobante: entrada.comprobante, comprobanteNombre: entrada.comprobanteNombre, ocrConfianza: entrada.ocrConfianza, subidoEn: new Date().toISOString(), conciliadoEn: alertas.length ? undefined : new Date().toISOString(), esSimulado: true }
    setDatos(d => ({ ...d, pagos: [nuevo, ...d.pagos], cuotas: d.cuotas.map(c => c.id === cuota.id ? { ...c, estado: alertas.length ? 'en_revision' : 'pagada', fechaPago: alertas.length ? undefined : nuevo.fecha, pagoId: alertas.length ? undefined : nuevo.id } : c), auditoria: auditar(d, alertas.length ? 'pago_en_revision' : 'pago_conciliado_auto', `${cuota.id}: ${alertas.length ? alertas.join(', ') : 'sin alertas'}`) }))
    mostrar(alertas.length ? 'Comprobante recibido. El pago pasó a revisión.' : 'Pago conciliado automáticamente.'); return null
  }
  const revisarPago = (pagoId: string, aprobar: boolean, motivo = '') => {
    const pago = datos.pagos.find(p => p.id === pagoId)
    if (!pago || pago.estado !== 'pendiente_revision') return 'Este pago ya fue revisado.'
    if (!aprobar && !motivo.trim()) return 'Escribe el motivo del rechazo.'
    setDatos(d => ({ ...d, pagos: d.pagos.map(p => p.id === pagoId ? { ...p, estado: aprobar ? 'conciliado_manual' : 'rechazado', motivoRechazo: aprobar ? undefined : motivo.trim(), conciliadoEn: new Date().toISOString() } : p), cuotas: d.cuotas.map(c => c.id === pago.cuotaId ? { ...c, estado: aprobar ? 'pagada' : 'pendiente', fechaPago: aprobar ? pago.fecha : undefined, pagoId: aprobar ? pago.id : undefined } : c), auditoria: auditar(d, aprobar ? 'aprobar_pago' : 'rechazar_pago', `${pagoId}${aprobar ? '' : `: ${motivo.trim()}`}`) }))
    mostrar(aprobar ? 'Pago aprobado y cuota actualizada.' : 'Pago rechazado. El propietario puede intentarlo de nuevo.'); return null
  }
  const pagoManual = (entrada: Omit<PagoEntrada, 'comprobante' | 'comprobanteNombre' | 'ocrConfianza'>) => {
    const cuota = datos.cuotas.find(c => c.id === entrada.cuotaId)
    if (!cuota || cuota.estado !== 'pendiente') return 'Selecciona una cuota pendiente.'
    if (!Number.isFinite(entrada.monto) || entrada.monto <= 0) return 'Ingresa un monto válido.'
    if (!entrada.fecha || entrada.fecha > hoy()) return 'La fecha no puede ser futura.'
    const nuevo: Pago = { id: id(), cuotaId: cuota.id, unidadId: cuota.unidadId, monto: entrada.monto, fecha: entrada.fecha, operacion: entrada.operacion.trim() || `MAN-${Date.now()}`, metodo: entrada.metodo, estado: 'conciliado_manual', alertas: [], subidoEn: new Date().toISOString(), conciliadoEn: new Date().toISOString(), esSimulado: true }
    setDatos(d => ({ ...d, pagos: [nuevo, ...d.pagos], cuotas: d.cuotas.map(c => c.id === cuota.id ? { ...c, estado: 'pagada', fechaPago: nuevo.fecha, pagoId: nuevo.id } : c), auditoria: auditar(d, 'pago_manual', `${cuota.id}: ${nuevo.metodo}`) })); mostrar('Pago manual registrado.'); return null
  }
  const registrarEgreso = (egreso: Omit<Egreso, 'id' | 'esSimulado'>) => { setDatos(d => ({ ...d, egresos: [{ ...egreso, id: id(), esSimulado: true }, ...d.egresos], auditoria: auditar(d, 'registrar_egreso', `${egreso.concepto}: ${egreso.monto}`) })); mostrar('Egreso registrado.') }
  const reiniciar = () => { setDatos(crearDatos()); salir(); mostrar('Datos de demostración restablecidos.', 'info') }
  return <Ctx.Provider value={{ datos, usuario, aviso, mostrar, entrar, salir, registrar, configurar, guardarUnidad, desactivarUnidad, guardarCamara, cambiarEstadoCamara, eliminarCamara, generarCuotas, enviarPago, revisarPago, pagoManual, registrarEgreso, registrarAuditoria, reiniciar }}>{children}</Ctx.Provider>
}

