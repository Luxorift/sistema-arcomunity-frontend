import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertCircle, AlertTriangle, ArrowRight, Banknote, BrainCircuit, ClipboardList, CreditCard, FileBarChart2, HelpCircle, Home, LayoutDashboard, LoaderCircle, LogOut, Menu, Moon, ReceiptText, Settings2, ShieldCheck, Sun, UsersRound, Video, X } from 'lucide-react'
import { dinero, fechaVisible, tituloEstado } from './model'
import { useApp } from './store'
import { cambiarTema, useTema } from './lib/tema'
import { cambiosSinGuardar, olvidarCambios } from './lib/cambios'

export const Brand = ({ light = false }: { light?: boolean }) => <div className={`brand ${light ? 'brand-light' : ''}`}><div className="brand-mark"><Home size={21} strokeWidth={2.5} /></div><div><strong>arcomunity</strong><span>Cuotas vecinales</span></div></div>
export function Badge({ estado }: { estado: string }) { return <span className={`badge badge-${estado}`}>{tituloEstado(estado)}</span> }
export function Simulado() { return <span className="simulado" title="La junta de demostración usa datos ficticios">DATOS SIMULADOS</span> }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon"><ClipboardList size={26} /></div><h3>{title}</h3><p>{text}</p>{action}</div> }
export function Stat({ label, value, note, icon, tone = 'normal' }: { label: string; value: string | number; note?: string; icon?: ReactNode; tone?: 'normal' | 'lime' | 'coral' }) { return <div className={`stat stat-${tone}`}><div className="stat-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{note && <small>{note}</small>}</div> }
export function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="head-action">{action}</div>}</div> }
export function Money({ value }: { value: number }) { return <>{dinero(value)}</> }
export function DateText({ value }: { value?: string }) { return <>{fechaVisible(value)}</> }

export function Cargando({ pantalla = false, texto = 'Cargando…' }: { pantalla?: boolean; texto?: string }) {
  return <div className={pantalla ? 'loading-screen' : 'loading-inline'} role="status" aria-live="polite"><LoaderCircle className="spin" size={pantalla ? 30 : 22} aria-hidden="true" /><span>{texto}</span></div>
}

/** Ayuda breve y desplegable («¿Qué significa…?»). Usa <details>: funciona con teclado y lectores de pantalla. */
export function Ayuda({ pregunta, children }: { pregunta: string; children: ReactNode }) {
  return <details className="ayuda"><summary><HelpCircle size={18} aria-hidden="true" /><span>{pregunta}</span></summary><div className="ayuda-texto">{children}</div></details>
}

/** Botón circular sol/luna. Vive en la barra superior o en la cabecera de acceso: nunca flota sobre el contenido. */
export function BotonTema() {
  const tema = useTema()
  const oscuro = tema === 'oscuro'
  return <button type="button" className="tema-bola" aria-label="Modo oscuro" aria-pressed={oscuro}
    title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={() => cambiarTema(oscuro ? 'claro' : 'oscuro')}>
    <span className="tema-bola-icono tema-sol" aria-hidden="true"><Sun size={19} /></span>
    <span className="tema-bola-icono tema-luna" aria-hidden="true"><Moon size={18} /></span>
  </button>
}

// --- Ventanas modales ------------------------------------------------------------------------------
// Se dibujan fuera de #root (portal). Mientras hay una abierta, el resto de la aplicación queda inerte
// (sin clics, foco ni lectura por lectores de pantalla); el foco queda atrapado dentro y vuelve al
// botón que la abrió al cerrarla.
let abiertas = 0
const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

type ModalProps = {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  /** Icono junto al título. */
  icono?: ReactNode
  tono?: 'normal' | 'peligro' | 'aviso'
  /** Id del texto que describe la ventana (aria-describedby). */
  descripcionId?: string
  /** Mientras es true no se cierra con Escape, el fondo ni la X (p. ej. durante una operación). */
  bloquearCierre?: boolean
  /** Si hay datos sin guardar, se pregunta antes de cerrar. */
  confirmarCierre?: boolean
}

export function Modal({ title, children, onClose, wide = false, icono, tono = 'normal', descripcionId, bloquearCierre = false, confirmarCierre = false }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const [preguntar, setPreguntar] = useState(false)
  const estado = useRef({ bloquearCierre, confirmarCierre, onClose })
  estado.current = { bloquearCierre, confirmarCierre, onClose }

  const intentarCerrar = useCallback(() => {
    const s = estado.current
    if (s.bloquearCierre) return
    if (s.confirmarCierre) { setPreguntar(true); return }
    s.onClose()
  }, [])

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const raiz = document.getElementById('root')
    abiertas++
    if (raiz) raiz.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialogo = ref.current
    const inicial = dialogo?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      ?? dialogo?.querySelector<HTMLElement>('.modal-content input:not([type="checkbox"]):not([disabled]), .modal-content select, .modal-content textarea')
      ?? dialogo
    inicial?.focus({ preventScroll: true })
    return () => {
      abiertas--
      if (raiz && abiertas === 0) raiz.inert = false
      document.body.style.overflow = overflow
      if (previo?.isConnected) previo.focus({ preventScroll: true })
    }
  }, [])

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (preguntar) setPreguntar(false); else intentarCerrar(); return }
    if (e.key !== 'Tab' || !ref.current) return
    const lista = [...ref.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter(el => el.offsetParent !== null || el === document.activeElement)
    if (!lista.length) { e.preventDefault(); return }
    const primero = lista[0], ultimo = lista[lista.length - 1]
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === ref.current)) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }
  const alTocarFondo = (e: MouseEvent) => { if (e.target === e.currentTarget) intentarCerrar() }

  return createPortal(<div className="modal-backdrop" onMouseDown={alTocarFondo}>
    <div ref={ref} className={`modal modal-${tono} ${wide ? 'modal-wide' : ''}`} role={tono === 'peligro' ? 'alertdialog' : 'dialog'} aria-modal="true"
      aria-labelledby={idTitulo} aria-describedby={descripcionId} tabIndex={-1} onKeyDown={alTeclear}>
      <div className="modal-head">
        <h2 id={idTitulo}>{icono && <span className={`modal-icono modal-icono-${tono}`} aria-hidden="true">{icono}</span>}{title}</h2>
        <button type="button" className="icon-button modal-close" onClick={intentarCerrar} disabled={bloquearCierre} aria-label="Cerrar ventana"><X size={20} /></button>
      </div>
      {preguntar
        ? <div className="modal-content salir-sin-guardar" role="alert">
          <p className="confirm-text"><strong>Tienes cambios sin guardar.</strong> Si sales ahora, se perderán.</p>
          <div className="modal-actions"><button type="button" className="button button-secondary" data-autofocus onClick={() => setPreguntar(false)}>Seguir editando</button>
            <button type="button" className="button button-danger" onClick={() => { setPreguntar(false); estado.current.onClose() }}>Salir sin guardar</button></div>
        </div>
        : <div className="modal-content">{children}</div>}
    </div>
  </div>, document.body)
}

export type ConfirmDialogProps = {
  titulo: string
  descripcion: ReactNode
  /** Texto del botón principal, p. ej. «Eliminar cámara». */
  textoConfirmar: string
  textoCancelar?: string
  textoProcesando?: string
  tipo?: 'normal' | 'peligro' | 'aviso'
  icono?: ReactNode
  /** Puntos que la persona debe tener en cuenta antes de confirmar. */
  advertencias?: ReactNode[]
  /** Segunda confirmación: casilla que hay que marcar antes de poder confirmar. */
  confirmacionExtra?: string
  /** Deshabilita el botón principal (p. ej. falta un motivo obligatorio). */
  deshabilitado?: boolean
  /** Devuelve un texto de error para mostrarlo en la ventana; si no hay error, la ventana se cierra. */
  onConfirmar: () => Promise<string | null | void> | string | null | void
  onCerrar: () => void
  children?: ReactNode
}

/** Confirmación reutilizable para acciones importantes. Evita envíos duplicados y muestra errores reales. */
export function ConfirmDialog({ titulo, descripcion, textoConfirmar, textoCancelar = 'Cancelar', textoProcesando = 'Procesando…', tipo = 'normal', icono, advertencias, confirmacionExtra, deshabilitado = false, onConfirmar, onCerrar, children }: ConfirmDialogProps) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [marcado, setMarcado] = useState(false)
  const enCurso = useRef(false)
  const idDesc = useId()
  const icon = icono ?? (tipo === 'peligro' ? <AlertTriangle size={22} /> : tipo === 'aviso' ? <AlertCircle size={22} /> : null)

  const confirmar = async () => {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true); setError('')
    try {
      const r = await onConfirmar()
      if (typeof r === 'string' && r) { setError(r); return }
      onCerrar()
    } catch {
      setError('No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  return <Modal title={titulo} onClose={onCerrar} icono={icon} tono={tipo} descripcionId={idDesc} bloquearCierre={ocupado}>
    <div className="form-stack">
      <div id={idDesc} className="confirm-text">{descripcion}</div>
      {advertencias && advertencias.length > 0 && <ul className="confirm-avisos">{advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>}
      {children}
      {confirmacionExtra && <label className="confirm-check"><input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} disabled={ocupado} /><span>{confirmacionExtra}</span></label>}
      {error && <div role="alert" className="form-error">{error}</div>}
      {ocupado && <p className="confirm-espera" role="status">{textoProcesando} No cierres esta ventana.</p>}
      <div className="modal-actions">
        <button type="button" className="button button-secondary" onClick={onCerrar} disabled={ocupado} data-autofocus={tipo === 'peligro' ? true : undefined}>{textoCancelar}</button>
        <button type="button" className={`button ${tipo === 'peligro' ? 'button-danger' : 'button-primary'}`} aria-busy={ocupado}
          disabled={ocupado || deshabilitado || (!!confirmacionExtra && !marcado)} onClick={() => void confirmar()}>
          {ocupado && <LoaderCircle className="spin" size={17} aria-hidden="true" />}{ocupado ? textoProcesando : textoConfirmar}
        </button>
      </div>
    </div>
  </Modal>
}

/** Aviso emergente. Fuera de #root para que se anuncie aunque haya una ventana modal abierta. */
function Toast({ aviso, onCerrar }: { aviso: { tipo: 'ok' | 'error' | 'info'; texto: string }; onCerrar: () => void }) {
  return createPortal(<div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`toast toast-${aviso.tipo}`}>
    <span>{aviso.texto}</span><button type="button" className="toast-cerrar" onClick={onCerrar} aria-label="Cerrar aviso"><X size={18} /></button>
  </div>, document.body)
}

const TITULOS: Record<string, string> = {
  '/admin': 'Resumen', '/admin/conciliacion': 'Conciliación', '/admin/cuotas': 'Cuotas', '/admin/pagos': 'Pagos', '/admin/egresos': 'Egresos',
  '/admin/reportes': 'Reportes', '/admin/unidades': 'Unidades y vecinos', '/admin/prediccion': 'Predicción de morosidad', '/transparencia': 'Transparencia',
  '/videovigilancia': 'Videovigilancia', '/admin/auditoria': 'Auditoría', '/admin/configuracion': 'Configuración', '/mi-cuenta': 'Mi cuenta',
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { usuario, salir, aviso, datos, cerrarAviso } = useApp()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [salida, setSalida] = useState<{ destino: string | null; mensaje: string } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const primeraVez = useRef(true)
  const admin = usuario?.rol === 'admin'
  const enRevision = datos.pagos.filter(p => p.estado === 'pendiente_revision').length

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const prev = document.body.style.overflow
    if (open) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Orientación: título de la pestaña según la sección y, al cambiar de sección, el foco pasa al
  // contenido (los lectores de pantalla anuncian la nueva página).
  useEffect(() => {
    const titulo = TITULOS[pathname] ?? (pathname.startsWith('/pagar') ? 'Pagar cuota' : 'Arcomunity')
    document.title = `${titulo} · Arcomunity`
    if (primeraVez.current) { primeraVez.current = false; return }
    window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  // Si hay datos sin guardar, se pregunta antes de seguir un enlace interno o cerrar sesión.
  const alHacerClic = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const destino = a?.getAttribute('href')
    if (!a || !destino?.startsWith('/') || a.target === '_blank' || e.ctrlKey || e.metaKey) return
    const mensaje = cambiosSinGuardar()
    if (!mensaje || destino === pathname) return
    e.preventDefault(); e.stopPropagation()
    setOpen(false)
    setSalida({ destino, mensaje })
  }
  const cerrarSesion = async () => { olvidarCambios(); await salir(); navigate('/login') }
  const pedirCerrarSesion = () => {
    const mensaje = cambiosSinGuardar()
    if (mensaje) { setOpen(false); setSalida({ destino: null, mensaje }) } else void cerrarSesion()
  }

  const nav: { to: string; label: string; icon: typeof Home; end?: boolean; contador?: number }[] = admin ? [
    { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/admin/conciliacion', label: 'Conciliación', icon: ShieldCheck, contador: enRevision },
    { to: '/admin/cuotas', label: 'Cuotas', icon: CreditCard },
    { to: '/admin/pagos', label: 'Pagos', icon: ReceiptText },
    { to: '/admin/egresos', label: 'Egresos', icon: Banknote },
    { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart2 },
    { to: '/admin/unidades', label: 'Unidades y vecinos', icon: Home },
    { to: '/admin/prediccion', label: 'Predicción de morosidad', icon: BrainCircuit },
    { to: '/transparencia', label: 'Transparencia', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
    { to: '/admin/auditoria', label: 'Auditoría', icon: Activity },
    { to: '/admin/configuracion', label: 'Configuración', icon: Settings2 },
  ] : [
    { to: '/mi-cuenta', label: 'Mi cuenta', icon: LayoutDashboard },
    { to: '/transparencia', label: 'Cuentas de la comunidad', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
  ]
  const inicial = usuario?.nombre.slice(0, 1).toUpperCase()
  return <div className="app-shell" onClickCapture={alHacerClic}>
    <a className="skip-link" href="#contenido" onClick={e => { e.preventDefault(); mainRef.current?.focus() }}>Saltar al contenido</a>
    {open && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Menú">
      <div className="sidebar-brand"><Brand light /><button className="sidebar-close icon-button" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      {usuario && <div className="sidebar-user-card"><div className="avatar" aria-hidden="true">{inicial}</div><div><strong>{usuario.nombre}</strong><small>{admin ? 'Administración' : usuario.unidadCodigo ?? 'Propietario'}</small></div></div>}
      <div className="sidebar-overline">{admin ? 'PANEL DE ADMINISTRACIÓN' : 'PORTAL DEL VECINO'}</div>
      <nav className="nav-list" aria-label="Navegación principal">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span>{!!item.contador && <span className="nav-count" aria-label={`${item.contador} por revisar`}>{item.contador}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="demo-note"><div className="demo-note-icon"><ShieldCheck size={17} aria-hidden="true" /></div><strong>{usuario?.juntaNombre}</strong><p>{datos.configuracion.modoDemo ? 'Demostración pública con datos ficticios: los cambios se restauran cada noche.' : 'Los datos se guardan de forma segura y se comparten entre tus dispositivos.'}</p></div><button className="logout" onClick={pedirCerrarSesion}><LogOut size={18} aria-hidden="true" /> Cerrar sesión <ArrowRight size={16} aria-hidden="true" /></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="menu-button icon-button" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}><Menu size={23} /></button><div className="topbar-left"><span className="topbar-kicker">Arcomunity</span><span className="topbar-divider" /><span className="topbar-date">{usuario?.juntaNombre}</span></div><div className="topbar-right"><Simulado /><BotonTema /><div className="avatar" aria-hidden="true">{inicial}</div><div className="topbar-user"><strong>{usuario?.nombre}</strong><small>{admin ? 'Administración' : usuario?.unidadCodigo ?? 'Propietario'}</small></div></div></header><main ref={mainRef} className="content" id="contenido" tabIndex={-1}>{children}</main></div>
    {aviso && <Toast aviso={aviso} onCerrar={cerrarAviso} />}
    {salida && <ConfirmDialog tipo="aviso" titulo={salida.destino ? '¿Salir sin terminar?' : '¿Cerrar sesión sin terminar?'} descripcion={salida.mensaje}
      textoConfirmar={salida.destino ? 'Salir de esta pantalla' : 'Cerrar sesión'} textoCancelar="Seguir aquí" onCerrar={() => setSalida(null)}
      onConfirmar={async () => { const s = salida; olvidarCambios(); if (s.destino) navigate(s.destino); else await cerrarSesion() }} />}
  </div>
}
