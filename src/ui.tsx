import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, Banknote, BrainCircuit, ClipboardList, CreditCard, FileBarChart2, Home, LayoutDashboard, LoaderCircle, LogOut, Menu, ReceiptText, Settings2, ShieldCheck, UsersRound, Video, X } from 'lucide-react'
import { dinero, fechaVisible, tituloEstado } from './model'
import { useApp } from './store'

export const Brand = ({ light = false }: { light?: boolean }) => <div className={`brand ${light ? 'brand-light' : ''}`}><div className="brand-mark"><Home size={21} strokeWidth={2.5} /></div><div><strong>arcomunity</strong><span>Cuotas vecinales</span></div></div>
export function Badge({ estado }: { estado: string }) { return <span className={`badge badge-${estado}`}>{tituloEstado(estado)}</span> }
export function Simulado() { return <span className="simulado" title="La junta de demostración usa datos ficticios">DATOS SIMULADOS</span> }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon"><ClipboardList size={26} /></div><h3>{title}</h3><p>{text}</p>{action}</div> }
export function Stat({ label, value, note, icon, tone = 'normal' }: { label: string; value: string | number; note?: string; icon?: ReactNode; tone?: 'normal' | 'lime' | 'coral' }) { return <div className={`stat stat-${tone}`}><div className="stat-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{note && <small>{note}</small>}</div> }
export function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="head-action">{action}</div>}</div> }
export function Money({ value }: { value: number }) { return <>{dinero(value)}</> }
export function DateText({ value }: { value?: string }) { return <>{fechaVisible(value)}</> }

export function Cargando({ pantalla = false, texto = 'Cargando…' }: { pantalla?: boolean; texto?: string }) {
  return <div className={pantalla ? 'loading-screen' : 'loading-inline'} role="status" aria-live="polite"><LoaderCircle className="spin" size={pantalla ? 30 : 22} /><span>{texto}</span></div>
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div><div className="modal-content">{children}</div></div></div>
}

/** Confirmación accesible para acciones importantes (reemplaza window.confirm). */
export function Confirmar({ titulo, texto, confirmar, peligro = false, onConfirmar, onCancelar, children }: { titulo: string; texto: ReactNode; confirmar: string; peligro?: boolean; onConfirmar: () => void | Promise<void>; onCancelar: () => void; children?: ReactNode }) {
  const [ocupado, setOcupado] = useState(false)
  return <Modal title={titulo} onClose={onCancelar}>
    <div className="form-stack"><p className="confirm-text">{texto}</p>{children}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancelar}>Cancelar</button>
        <button type="button" className={`button ${peligro ? 'button-danger' : 'button-primary'}`} disabled={ocupado} onClick={async () => { setOcupado(true); try { await onConfirmar() } finally { setOcupado(false) } }}>{ocupado ? 'Procesando…' : confirmar}</button></div>
    </div>
  </Modal>
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { usuario, salir, aviso, datos } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
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

  const nav: { to: string; label: string; icon: typeof Home; end?: boolean; contador?: number; etiqueta?: string }[] = admin ? [
    { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/admin/conciliacion', label: 'Conciliación', icon: ShieldCheck, contador: enRevision },
    { to: '/admin/cuotas', label: 'Cuotas', icon: CreditCard },
    { to: '/admin/pagos', label: 'Pagos', icon: ReceiptText },
    { to: '/admin/egresos', label: 'Egresos', icon: Banknote },
    { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart2 },
    { to: '/admin/unidades', label: 'Unidades y vecinos', icon: Home },
    { to: '/admin/prediccion', label: 'Predicción de morosidad', icon: BrainCircuit, etiqueta: 'Pronto' },
    { to: '/transparencia', label: 'Transparencia', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
    { to: '/admin/auditoria', label: 'Auditoría', icon: Activity },
    { to: '/admin/configuracion', label: 'Configuración', icon: Settings2 },
  ] : [
    { to: '/mi-cuenta', label: 'Mi cuenta', icon: LayoutDashboard },
    { to: '/transparencia', label: 'Cuentas de la comunidad', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
  ]
  const cerrarSesion = async () => { await salir(); navigate('/login') }
  const inicial = usuario?.nombre.slice(0, 1).toUpperCase()
  return <div className="app-shell">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    {open && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand light /><button className="sidebar-close icon-button" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      {usuario && <div className="sidebar-user-card"><div className="avatar">{inicial}</div><div><strong>{usuario.nombre}</strong><small>{admin ? 'Administración' : usuario.unidadCodigo ?? 'Propietario'}</small></div></div>}
      <div className="sidebar-overline">{admin ? 'PANEL DE ADMINISTRACIÓN' : 'PORTAL DEL VECINO'}</div>
      <nav className="nav-list" aria-label="Navegación principal">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={19} /><span>{item.label}</span>{!!item.contador && <span className="nav-count" aria-label={`${item.contador} por revisar`}>{item.contador}</span>}{item.etiqueta && <span className="nav-tag">{item.etiqueta}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="demo-note"><div className="demo-note-icon"><ShieldCheck size={17} /></div><strong>{usuario?.juntaNombre}</strong><p>{datos.configuracion.modoDemo ? 'Demostración pública con datos ficticios: los cambios se restauran cada noche.' : 'Los datos se guardan de forma segura y se comparten entre tus dispositivos.'}</p></div><button className="logout" onClick={() => void cerrarSesion()}><LogOut size={18} /> Cerrar sesión <ArrowRight size={16} /></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="menu-button icon-button" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={23} /></button><div className="topbar-left"><span className="topbar-kicker">Arcomunity</span><span className="topbar-divider" /><span className="topbar-date">{usuario?.juntaNombre}</span></div><div className="topbar-right"><Simulado /><div className="avatar">{inicial}</div><div className="topbar-user"><strong>{usuario?.nombre}</strong><small>{admin ? 'Administración' : usuario?.unidadCodigo ?? 'Propietario'}</small></div></div></header><main className="content" id="contenido" tabIndex={-1}>{children}</main></div>
    {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`toast toast-${aviso.tipo}`}>{aviso.texto}</div>}
  </div>
}
