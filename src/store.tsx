// Estado de la aplicación respaldado por Supabase.
// - La sesión viene de Supabase Auth; el rol y la junta, de la función mi_contexto() (servidor).
// - Las lecturas pasan por RLS: cada usuario recibe solo lo que puede ver.
// - Las escrituras financieras usan funciones RPC atómicas; el cliente nunca fija montos ni estados.
// - Realtime refresca cuotas y pagos cuando otro dispositivo los modifica.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BUCKET_COMPROBANTES, BUCKET_JUNTA, supabase } from './lib/supabase'
import { mensajeError } from './lib/errores'
import type { Auditoria, Camara, ConceptoEgreso, Configuracion, Cuota, Egreso, MetodoPago, Pago, Rol, TipoCamara, Unidad } from './model'

export type Usuario = {
  id: string
  nombre: string
  correo: string
  telefono?: string
  rol: Rol
  juntaId: string
  juntaNombre: string
  unidadId?: string
  unidadCodigo?: string
}

export type CamaraEdicion = Omit<Camara, 'id'> & { id: string | null }

export type Datos = {
  unidades: Unidad[]
  cuotas: Cuota[]
  pagos: Pago[]
  egresos: Egreso[]
  auditoria: Auditoria[]
  camaras: Camara[]
  configuracion: Configuracion
}

export type EstadoSesion = 'cargando' | 'sin_sesion' | 'sin_membresia' | 'listo'
type Aviso = { tipo: 'ok' | 'error' | 'info'; texto: string } | null
export type OcrExtraido = { monto?: string; fecha?: string; operacion?: string }
export type PagoEntrada = {
  cuotaId: string
  metodo: Extract<MetodoPago, 'yape_captura' | 'plin_captura' | 'transferencia'>
  monto: number
  fecha: string
  operacion: string
  archivo: Blob
  ocrConfianza?: number
  ocrExtraido?: OcrExtraido
}
export type ResultadoPago = { estado: Pago['estado']; alertas: string[] }
export type Resultado<T = null> = { ok: true; data: T } | { ok: false; error: string }
export type EscenarioDemo = { cuenta: string; unidad: string | null; espera: 'cuota_por_pagar' | 'pago_en_revision' | 'al_dia'; ok: boolean; vencidas: number; por_vencer: number; en_revision: number }
export type PreparacionDemo = { periodo: string; cuotas_creadas: number; cuotas_existentes: number; modelo: string; fecha_corte: string; predicciones: number; alto: number; medio: number; bajo: number; escenarios: EscenarioDemo[]; avisos: string[] }
export type ReinicioDemo = { pagosQuitados: number; prediccionesQuitadas: number; desvinculados: number; archivosBorrados: number; archivosPendientes: number }

const configuracionVacia: Configuracion = {
  nombre: '', codigoInvitacion: '', cuotaMensual: 0, diaVencimiento: 10, yapeTitular: '', conciliacionAutomatica: true, transparenciaDetalle: true,
}
const datosVacios: Datos = { unidades: [], cuotas: [], pagos: [], egresos: [], auditoria: [], camaras: [], configuracion: configuracionVacia }

// --- Mapeo de filas de la base a los tipos de la interfaz -------------------------------------
type Fila = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const str = (v: unknown) => (v == null ? undefined : String(v))

const aCuota = (r: Fila): Cuota => ({
  id: String(r.id), unidadId: String(r.unidad_id), periodo: String(r.periodo), monto: num(r.monto),
  vencimiento: String(r.fecha_vencimiento), estado: r.estado as Cuota['estado'], fechaPago: str(r.fecha_pago),
  pagoId: str(r.pago_id), diasAtraso: num(r.dias_atraso), esSimulado: Boolean(r.es_simulado),
})
const aPago = (r: Fila): Pago => ({
  id: String(r.id), cuotaId: String(r.cuota_id), unidadId: String(r.unidad_id), monto: num(r.monto_declarado),
  fecha: String(r.fecha_operacion), operacion: str(r.numero_operacion) ?? '', metodo: r.metodo as MetodoPago,
  estado: r.estado as Pago['estado'], alertas: (r.alertas as string[]) ?? [], comprobantePath: str(r.comprobante_path),
  ocrConfianza: r.ocr_confianza == null ? undefined : num(r.ocr_confianza), motivoRechazo: str(r.motivo_rechazo),
  notaAdmin: str(r.nota_admin), subidoEn: String(r.subido_en), conciliadoEn: str(r.conciliado_en),
  revisadoEn: str(r.revisado_en), esSimulado: Boolean(r.es_simulado),
})
const aEgreso = (r: Fila): Egreso => ({
  id: String(r.id), fecha: String(r.fecha), concepto: r.concepto as ConceptoEgreso, beneficiario: String(r.beneficiario),
  monto: num(r.monto), comentario: str(r.comentario), anulado: Boolean(r.anulado), motivoAnulacion: str(r.motivo_anulacion),
  esSimulado: Boolean(r.es_simulado),
})
const aCamara = (r: Fila): Camara => ({
  id: String(r.id), nombre: String(r.nombre), ubicacion: String(r.ubicacion), tipo: r.tipo as TipoCamara,
  url: str(r.url), activa: Boolean(r.activa),
})
const ETIQUETAS: Record<string, string> = {
  monto: 'Monto', monto_declarado: 'Monto declarado', monto_cuota: 'Monto de la cuota', periodo: 'Periodo', metodo: 'Medio',
  motivo: 'Motivo', estado_anterior: 'Estado anterior', alertas: 'Alertas', creadas: 'Creadas', existentes: 'Ya existían',
  unidad: 'Unidad', codigo: 'Código', nombre: 'Nombre', tipo: 'Tipo', activa: 'Activa', concepto: 'Concepto', fecha: 'Fecha',
  detalle: 'Detalle', con_qr: 'Con QR', consentimiento_ley_29733: 'Consentimiento Ley 29733', cuota_mensual: 'Cuota mensual',
  dia_vencimiento: 'Día de vencimiento', conciliacion_automatica: 'Validación automática', transparencia_detalle_unidades: 'Detalle en transparencia',
  unidades: 'Unidades', cuotas: 'Cuotas', nota: 'Nota',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const valorLegible = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (Array.isArray(v)) return v.map(valorLegible).join(', ')
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return 'antes' in o ? `${valorLegible(o.antes)} → ${valorLegible(o.despues)}` : JSON.stringify(o)
  }
  return String(v).replaceAll('_', ' ')
}
// Detalle de auditoría legible: oculta identificadores internos y traduce los campos.
const textoDetalle = (d: unknown) => {
  if (!d || typeof d !== 'object') return ''
  return Object.entries(d as Record<string, unknown>)
    .filter(([k, v]) => v !== null && v !== '' && !k.endsWith('_id') && !(typeof v === 'string' && UUID.test(v)) && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${ETIQUETAS[k] ?? k.replaceAll('_', ' ')}: ${valorLegible(v)}`)
    .join(' · ')
}
const aAuditoria = (r: Fila): Auditoria => ({
  id: String(r.id), fecha: String(r.creado_en), usuario: str(r.actor_nombre) ?? 'Sistema', accion: String(r.accion),
  detalle: textoDetalle(r.detalle),
})

const haceMeses = (meses: number) => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

// PostgREST devuelve como máximo 1000 filas por solicitud: se pagina.
async function todas(consulta: (desde: number, hasta: number) => PromiseLike<{ data: Fila[] | null; error: unknown }>) {
  const salida: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw error
    salida.push(...(data ?? []))
    if (!data || data.length < 1000) return salida
  }
}

async function sha256Hex(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// --- Contexto ----------------------------------------------------------------------------------
type Contexto = {
  estado: EstadoSesion
  usuario: Usuario | null
  datos: Datos
  cargandoDatos: boolean
  /** true cuando los datos de la junta ya se cargaron al menos una vez para el usuario actual */
  datosListos: boolean
  aviso: Aviso
  mostrar: (texto: string, tipo?: 'ok' | 'error' | 'info') => void
  cerrarAviso: () => void
  recargar: () => Promise<void>
  entrar: (correo: string, clave: string) => Promise<string | null>
  salir: () => Promise<void>
  registrar: (e: { nombre: string; correo: string; clave: string; telefono?: string; codigo: string; unidadId: string; consentimiento: boolean }) => Promise<Resultado<{ requiereConfirmacion: boolean }>>
  unidadesDisponibles: (codigo: string) => Promise<Resultado<{ id: string; codigo: string; junta: string }[]>>
  recuperarClave: (correo: string) => Promise<string | null>
  cambiarClave: (clave: string) => Promise<string | null>
  configurar: (c: Configuracion) => Promise<string | null>
  subirQr: (archivo: Blob) => Promise<string | null>
  guardarUnidad: (unidadId: string | null, codigo: string) => Promise<string | null>
  cambiarEstadoUnidad: (unidadId: string, activa: boolean) => Promise<string | null>
  desvincularPropietario: (unidadId: string) => Promise<string | null>
  guardarCamara: (c: CamaraEdicion) => Promise<string | null>
  eliminarCamara: (camaraId: string) => Promise<string | null>
  registrarVistaCamaras: (detalle: string) => void
  generarCuotas: (periodo?: string) => Promise<Resultado<{ creadas: number; existentes: number }>>
  enviarPago: (entrada: PagoEntrada) => Promise<Resultado<ResultadoPago>>
  revisarPago: (pagoId: string, decision: 'aprobar' | 'rechazar', motivo?: string) => Promise<string | null>
  pagoManual: (e: { cuotaId: string; metodo: 'efectivo' | 'transferencia' | 'yape_qr'; monto: number; fecha: string; operacion?: string; nota?: string }) => Promise<string | null>
  registrarEgreso: (e: { fecha: string; concepto: ConceptoEgreso; beneficiario: string; monto: number; comentario?: string }) => Promise<string | null>
  anularEgreso: (egresoId: string, motivo: string) => Promise<string | null>
  urlComprobante: (path: string) => Promise<string | null>
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<Resultado<T>>
  prepararDemo: () => Promise<Resultado<PreparacionDemo>>
  reiniciarDemo: () => Promise<Resultado<ReinicioDemo>>
}

const Ctx = createContext<Contexto | null>(null)
export const useApp = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Falta el proveedor')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const [estado, setEstado] = useState<EstadoSesion>('cargando')
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [datos, setDatos] = useState<Datos>(datosVacios)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [datosListos, setDatosListos] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const usuarioRef = useRef<Usuario | null>(null)
  usuarioRef.current = usuario

  const mostrar = useCallback((texto: string, tipo: 'ok' | 'error' | 'info' = 'ok') => setAviso({ texto, tipo }), [])
  const cerrarAviso = useCallback(() => setAviso(null), [])
  // Tiempo suficiente para leer con calma; los errores duran más y se pueden cerrar con la X.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), aviso.tipo === 'error' ? 15000 : 8000)
    return () => clearTimeout(t)
  }, [aviso])

  // Limpia el almacenamiento local del MVP anterior: ya no es fuente de verdad (datos simulados).
  useEffect(() => {
    try { localStorage.removeItem('arcomunity-frontend-v1'); sessionStorage.removeItem('arcomunity-sesion-v1') } catch { /* sin acceso */ }
  }, [])

  // Sesión de Supabase Auth.
  useEffect(() => {
    let activo = true
    supabase.auth.getSession().then(({ data }) => { if (activo) setSesion(data.session) })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => { activo = false; data.subscription.unsubscribe() }
  }, [])

  // Contexto de rol desde el servidor. Solo cuando cambia el usuario autenticado (no en cada
  // refresco de token).
  const uid = sesion === undefined ? undefined : sesion?.user.id ?? null
  useEffect(() => {
    if (uid === undefined) return
    if (uid === null) { setUsuario(null); setDatos(datosVacios); setDatosListos(false); setEstado('sin_sesion'); return }
    let activo = true
    setEstado('cargando')
    ;(async () => {
      const { data, error } = await supabase.rpc('mi_contexto')
      if (!activo) return
      if (error || !data) { setUsuario(null); setEstado('sin_membresia'); if (error) mostrar(mensajeError(error), 'error'); return }
      const ctx = data as { perfil: Fila | null; membresias: { junta_id: string; junta_nombre: string; rol: Rol; unidades: { id: string; codigo: string }[] }[] }
      const m = ctx.membresias.find(x => x.rol === 'admin') ?? ctx.membresias[0]
      if (!m || !ctx.perfil) { setUsuario(null); setEstado('sin_membresia'); return }
      setUsuario({
        id: String(ctx.perfil.id), nombre: String(ctx.perfil.nombre_completo), correo: String(ctx.perfil.correo),
        telefono: str(ctx.perfil.telefono), rol: m.rol, juntaId: m.junta_id, juntaNombre: m.junta_nombre,
        unidadId: m.unidades[0]?.id, unidadCodigo: m.unidades[0]?.codigo,
      })
      setEstado('listo')
    })()
    return () => { activo = false }
  }, [uid, mostrar])

  const cargarCuotasYPagos = useCallback(async (u: Usuario) => {
    const desde = haceMeses(14)
    const cuotas = await todas((a, b) => {
      let q = supabase.from('cuotas').select('*').eq('junta_id', u.juntaId).gte('periodo', desde)
      if (u.rol === 'propietario') q = q.eq('unidad_id', u.unidadId ?? '00000000-0000-0000-0000-000000000000')
      return q.order('periodo', { ascending: false }).range(a, b)
    })
    const pagos = await todas((a, b) => {
      let q = supabase.from('pagos').select('*').eq('junta_id', u.juntaId).gte('fecha_operacion', haceMeses(15))
      if (u.rol === 'propietario') q = q.eq('unidad_id', u.unidadId ?? '00000000-0000-0000-0000-000000000000')
      return q.order('subido_en', { ascending: false }).range(a, b)
    })
    return { cuotas: cuotas.map(aCuota), pagos: pagos.map(aPago) }
  }, [])

  const cargarTodo = useCallback(async (u: Usuario) => {
    setCargandoDatos(true)
    try {
      const esAdmin = u.rol === 'admin'
      const [junta, invitacion, unidades, propietarios, camaras, egresos, auditoria, cp] = await Promise.all([
        supabase.from('juntas').select('*').eq('id', u.juntaId).single(),
        esAdmin ? supabase.from('juntas_invitacion').select('codigo').eq('junta_id', u.juntaId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('unidades').select('id, codigo, activa').eq('junta_id', u.juntaId).order('codigo'),
        esAdmin
          ? supabase.from('unidad_propietarios').select('unidad_id, perfiles(id, nombre_completo, correo, telefono)').eq('junta_id', u.juntaId).is('hasta', null)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('camaras').select('*').eq('junta_id', u.juntaId).order('creado_en'),
        esAdmin ? supabase.from('egresos').select('*').eq('junta_id', u.juntaId).gte('fecha', haceMeses(14)).order('fecha', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        esAdmin ? supabase.from('auditoria').select('*').eq('junta_id', u.juntaId).order('creado_en', { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
        cargarCuotasYPagos(u),
      ])
      for (const r of [junta, invitacion, unidades, propietarios, camaras, egresos, auditoria]) if (r.error) throw r.error
      const j = junta.data as Fila
      let yapeQr: string | undefined
      if (j.yape_qr_path) {
        const { data } = await supabase.storage.from(BUCKET_JUNTA).createSignedUrl(String(j.yape_qr_path), 3600)
        yapeQr = data?.signedUrl
      }
      const duenos = new Map<string, Unidad['propietario']>()
      for (const p of (propietarios.data ?? []) as unknown as { unidad_id: string; perfiles: Fila | null }[]) {
        if (p.perfiles) duenos.set(p.unidad_id, { id: String(p.perfiles.id), nombre: String(p.perfiles.nombre_completo), correo: String(p.perfiles.correo), telefono: str(p.perfiles.telefono) })
      }
      setDatos({
        configuracion: {
          nombre: String(j.nombre), codigoInvitacion: str((invitacion.data as Fila | null)?.codigo) ?? '', cuotaMensual: num(j.cuota_mensual),
          diaVencimiento: num(j.dia_vencimiento), yapeTitular: str(j.yape_titular) ?? '', yapeQr, yapeQrPath: str(j.yape_qr_path),
          conciliacionAutomatica: Boolean(j.conciliacion_automatica), transparenciaDetalle: Boolean(j.transparencia_detalle_unidades),
          modoDemo: Boolean(j.modo_demo),
        },
        unidades: ((unidades.data ?? []) as Fila[]).map(r => ({ id: String(r.id), codigo: String(r.codigo), activa: Boolean(r.activa), propietario: duenos.get(String(r.id)) })),
        camaras: ((camaras.data ?? []) as Fila[]).map(aCamara),
        egresos: ((egresos.data ?? []) as Fila[]).map(aEgreso),
        auditoria: ((auditoria.data ?? []) as Fila[]).map(aAuditoria),
        cuotas: cp.cuotas,
        pagos: cp.pagos,
      })
      setDatosListos(true)
    } catch (error) {
      mostrar(mensajeError(error), 'error')
    } finally {
      setCargandoDatos(false)
    }
  }, [cargarCuotasYPagos, mostrar])

  useEffect(() => { if (usuario) void cargarTodo(usuario) }, [usuario, cargarTodo])

  // Tiempo real: otro dispositivo registra o revisa un pago → se refrescan cuotas y pagos.
  useEffect(() => {
    if (!usuario) return
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const refrescar = () => {
      clearTimeout(temporizador)
      temporizador = setTimeout(async () => {
        const u = usuarioRef.current
        if (!u) return
        try {
          const cp = await cargarCuotasYPagos(u)
          let auditoria: Auditoria[] | undefined
          if (u.rol === 'admin') {
            const { data } = await supabase.from('auditoria').select('*').eq('junta_id', u.juntaId).order('creado_en', { ascending: false }).limit(300)
            auditoria = ((data ?? []) as Fila[]).map(aAuditoria)
          }
          setDatos(d => ({ ...d, ...cp, ...(auditoria ? { auditoria } : {}) }))
        } catch { /* se reintenta en el siguiente evento */ }
      }, 700)
    }
    const canal = supabase.channel(`junta-${usuario.juntaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos', filter: `junta_id=eq.${usuario.juntaId}` }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuotas', filter: `junta_id=eq.${usuario.juntaId}` }, refrescar)
      .subscribe()
    // Si el celular o la pestaña estuvieron en segundo plano, el socket pudo perder eventos: al volver
    // se recargan cuotas y pagos.
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearTimeout(temporizador); document.removeEventListener('visibilitychange', alVolver); void supabase.removeChannel(canal) }
  }, [usuario, cargarCuotasYPagos])

  const recargar = useCallback(async () => { if (usuarioRef.current) await cargarTodo(usuarioRef.current) }, [cargarTodo])

  const rpc = useCallback(async <T,>(fn: string, args?: Record<string, unknown>): Promise<Resultado<T>> => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: mensajeError(error) }
    return { ok: true, data: data as T }
  }, [])

  // Ejecuta una acción de escritura, muestra el resultado y recarga.
  const accion = useCallback(async (fn: string, args: Record<string, unknown>, exito: string): Promise<string | null> => {
    const r = await rpc(fn, args)
    if (!r.ok) { mostrar(r.error, 'error'); return r.error }
    mostrar(exito)
    await recargar()
    return null
  }, [rpc, mostrar, recargar])

  const valor = useMemo<Contexto>(() => {
    const junta = () => usuarioRef.current?.juntaId ?? ''
    return {
      estado, usuario, datos, cargandoDatos, datosListos, aviso, mostrar, cerrarAviso, recargar, rpc,

      entrar: async (correo, clave) => {
        const { error } = await supabase.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: clave })
        return error ? mensajeError(error, 'login') : null
      },
      salir: async () => {
        await supabase.auth.signOut()
        setSesion(null)
      },
      unidadesDisponibles: async codigo => {
        const r = await rpc<{ unidad_id: string; codigo: string; junta_nombre: string }[]>('unidades_disponibles', { p_codigo: codigo })
        return r.ok ? { ok: true, data: r.data.map(u => ({ id: u.unidad_id, codigo: u.codigo, junta: u.junta_nombre })) } : r
      },
      registrar: async e => {
        const libres = await rpc<{ unidad_id: string }[]>('unidades_disponibles', { p_codigo: e.codigo })
        if (!libres.ok) return libres
        if (!libres.data.length) return { ok: false, error: 'El código de invitación no es válido.' }
        if (!libres.data.some(u => u.unidad_id === e.unidadId)) return { ok: false, error: 'Esa unidad ya no está disponible. Elige otra.' }
        const { data, error } = await supabase.auth.signUp({
          email: e.correo.trim().toLowerCase(),
          password: e.clave,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nombre_completo: e.nombre.trim(), telefono: e.telefono?.trim() || '', codigo_invitacion: e.codigo.trim().toUpperCase(), unidad_id: e.unidadId, acepto_datos: e.consentimiento ? 'true' : 'false' },
          },
        })
        if (error) return { ok: false, error: mensajeError(error, 'registro') }
        // Con confirmación de correo activa Supabase no devuelve sesión (y oculta si el correo ya existía).
        return { ok: true, data: { requiereConfirmacion: !data.session } }
      },
      recuperarClave: async correo => {
        const { error } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), { redirectTo: `${window.location.origin}/restablecer` })
        return error ? mensajeError(error) : null
      },
      cambiarClave: async clave => {
        if (clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
        const { error } = await supabase.auth.updateUser({ password: clave })
        return error ? mensajeError(error) : null
      },

      configurar: c => accion('actualizar_configuracion', {
        p_junta: junta(), p_nombre: c.nombre, p_cuota_mensual: c.cuotaMensual, p_dia_vencimiento: c.diaVencimiento,
        p_yape_titular: c.yapeTitular, p_conciliacion_automatica: c.conciliacionAutomatica,
        p_transparencia_detalle_unidades: c.transparenciaDetalle ?? true, p_codigo_invitacion: c.codigoInvitacion,
      }, 'Configuración guardada.'),
      subirQr: async archivo => {
        const path = `${junta()}/qr-${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from(BUCKET_JUNTA).upload(path, archivo, { contentType: 'image/jpeg', upsert: false })
        if (error) { const m = mensajeError(error, 'archivo'); mostrar(m, 'error'); return m }
        return accion('actualizar_qr_yape', { p_junta: junta(), p_path: path }, 'QR de Yape actualizado.')
      },
      guardarUnidad: (unidadId, codigo) => accion('guardar_unidad', { p_junta: junta(), p_unidad_id: unidadId, p_codigo: codigo }, 'Unidad guardada.'),
      cambiarEstadoUnidad: (unidadId, activa) => accion('cambiar_estado_unidad', { p_unidad_id: unidadId, p_activa: activa }, activa ? 'Unidad activada.' : 'Unidad desactivada.'),
      desvincularPropietario: unidadId => accion('desvincular_propietario', { p_unidad_id: unidadId }, 'Propietario desvinculado de la unidad.'),
      guardarCamara: c => accion('guardar_camara', {
        p_junta: junta(), p_camara_id: c.id, p_nombre: c.nombre, p_ubicacion: c.ubicacion, p_tipo: c.tipo, p_url: c.url ?? null, p_activa: c.activa,
      }, 'Cámara guardada.'),
      eliminarCamara: camaraId => accion('eliminar_camara', { p_camara_id: camaraId }, 'Cámara eliminada.'),
      registrarVistaCamaras: detalle => { void supabase.rpc('registrar_vista_camaras', { p_junta: junta(), p_detalle: detalle }) },

      generarCuotas: async periodo => {
        const r = await rpc<{ creadas: number; existentes: number }>('generar_cuotas', { p_junta: junta(), p_periodo: periodo ?? null })
        if (!r.ok) { mostrar(r.error, 'error'); return r }
        await recargar()
        return r
      },
      enviarPago: async e => {
        const u = usuarioRef.current
        if (!u?.unidadId) return { ok: false, error: 'Tu cuenta no tiene una unidad asignada.' }
        let sha: string | null = null
        try { sha = await sha256Hex(e.archivo) } catch { sha = null }
        const path = `${u.juntaId}/${u.unidadId}/${crypto.randomUUID()}.jpg`
        const subida = await supabase.storage.from(BUCKET_COMPROBANTES).upload(path, e.archivo, { contentType: 'image/jpeg', upsert: false })
        if (subida.error) return { ok: false, error: mensajeError(subida.error, 'archivo') }
        const r = await rpc<{ estado: Pago['estado']; alertas: string[] }>('enviar_pago', {
          p_cuota_id: e.cuotaId, p_metodo: e.metodo, p_monto: e.monto, p_fecha_operacion: e.fecha, p_numero_operacion: e.operacion,
          p_comprobante_path: path, p_comprobante_sha256: sha, p_ocr_confianza: e.ocrConfianza ?? null, p_ocr_extraido: e.ocrExtraido ?? null,
        })
        if (r.ok) await recargar()
        return r
      },
      revisarPago: (pagoId, decision, motivo) => accion('revisar_pago', { p_pago_id: pagoId, p_decision: decision, p_motivo: motivo ?? null },
        decision === 'aprobar' ? 'Pago aprobado y cuota actualizada.' : 'Pago rechazado. El propietario verá el motivo.'),
      pagoManual: e => accion('registrar_pago_manual', {
        p_cuota_id: e.cuotaId, p_metodo: e.metodo, p_monto: e.monto, p_fecha_operacion: e.fecha, p_numero_operacion: e.operacion || null, p_nota: e.nota || null,
      }, 'Pago manual registrado.'),
      registrarEgreso: e => accion('registrar_egreso', {
        p_junta: junta(), p_fecha: e.fecha, p_concepto: e.concepto, p_beneficiario: e.beneficiario, p_monto: e.monto, p_comentario: e.comentario || null,
      }, 'Egreso registrado.'),
      anularEgreso: (egresoId, motivo) => accion('anular_egreso', { p_egreso_id: egresoId, p_motivo: motivo }, 'Egreso anulado.'),
      // Herramientas de demostración (Auditoría). El servidor valida que sea la administración de la
      // junta en modo demostración; aquí solo se borran los archivos que el servidor declaró sobrantes.
      prepararDemo: async () => {
        const r = await rpc<PreparacionDemo>('preparar_demostracion', { p_junta: junta() })
        if (r.ok) await recargar()
        return r
      },
      reiniciarDemo: async () => {
        const r = await rpc<{ pagos_quitados: number; predicciones_quitadas: number; registros_desvinculados: number; archivos: { bucket: string; nombre: string }[] }>('reiniciar_demostracion', { p_junta: junta() })
        if (!r.ok) return r
        let borrados = 0, pendientes = 0
        for (const bucket of [BUCKET_COMPROBANTES, BUCKET_JUNTA]) {
          const nombres = r.data.archivos.filter(a => a.bucket === bucket).map(a => a.nombre)
          if (!nombres.length) continue
          const { data, error } = await supabase.storage.from(bucket).remove(nombres)
          const n = error ? 0 : (data ?? []).length
          borrados += n; pendientes += nombres.length - n
        }
        await recargar()
        return { ok: true, data: { pagosQuitados: r.data.pagos_quitados, prediccionesQuitadas: r.data.predicciones_quitadas, desvinculados: r.data.registros_desvinculados, archivosBorrados: borrados, archivosPendientes: pendientes } }
      },
      urlComprobante: async path => {
        const { data, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrl(path, 300)
        if (error) { mostrar(mensajeError(error, 'archivo'), 'error'); return null }
        return data.signedUrl
      },
    }
  }, [estado, usuario, datos, cargandoDatos, datosListos, aviso, mostrar, cerrarAviso, recargar, rpc, accion])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
