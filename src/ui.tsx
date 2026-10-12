import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, Banknote, ClipboardList, CreditCard, FileBarChart2, Home, LayoutDashboard, LogOut, Menu, ReceiptText, Settings2, ShieldCheck, UsersRound, Video, X } from 'lucide-react'
import { dinero, fechaVisible, tituloEstado } from './model'
import { useApp } from './store'

export const Brand = ({ light = false }: { light?: boolean }) => <div className={`brand ${light ? 'brand-light' : ''}`}><div className="brand-mark"><Home size={21} strokeWidth={2.5} /></div><div><strong>arcomunity</strong><span>Cuotas vecinales</span></div></div>
export function Badge({ estado }: { estado: string }) { return <span className={`badge badge-${estado}`}>{tituloEstado(estado)}</span> }
export function Simulado() { return <span className="simulado">DATOS SIMULADOS</span> }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon"><ClipboardList size={26} /></div><h3>{title}</h3><p>{text}</p>{action}</div> }
export function Stat({ label, value, note, icon, tone = 'normal' }: { label: string; value: string | number; note?: string; icon?: ReactNode; tone?: 'normal' | 'lime' | 'coral' }) { return <div className={`stat stat-${tone}`}><div className="stat-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{note && <small>{note}</small>}</div> }
export function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="head-action">{action}</div>}</div> }
export function Money({ value }: { value: number }) { return <>{dinero(value)}</> }
export function DateText({ value }: { value?: string }) { return <>{fechaVisible(value)}</> }
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
export function AppLayout({ children }: { children: ReactNode }) {
  const { usuario, salir, aviso } = useApp(); const navigate = useNavigate(); const [open, setOpen] = useState(false)
  const admin = usuario?.rol === 'admin'

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

  const nav = admin ? [
    { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/admin/configuracion', label: 'Configuración', icon: Settings2 },
    { to: '/admin/unidades', label: 'Unidades', icon: Home },
    { to: '/admin/cuotas', label: 'Cuotas', icon: CreditCard },
    { to: '/admin/conciliacion', label: 'Conciliación', icon: ShieldCheck },
    { to: '/admin/pagos', label: 'Pagos', icon: ReceiptText },
    { to: '/admin/egresos', label: 'Egresos', icon: Banknote },
    { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart2 },
    { to: '/admin/auditoria', label: 'Auditoría', icon: Activity },
    { to: '/transparencia', label: 'Transparencia', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
  ] : [
    { to: '/mi-cuenta', label: 'Mi cuenta', icon: LayoutDashboard },
    { to: '/transparencia', label: 'Transparencia', icon: UsersRound },
    { to: '/videovigilancia', label: 'Videovigilancia', icon: Video },
  ]
  return <div className="app-shell">
    {open && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand light /><button className="sidebar-close icon-button" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      {usuario && <div className="sidebar-user-card"><div className="avatar">{usuario.nombre.slice(0, 1).toUpperCase()}</div><div><strong>{usuario.nombre}</strong><small>{admin ? 'Administrador' : 'Propietario'}</small></div></div>}
      <div className="sidebar-overline">{admin ? 'PANEL DE ADMINISTRACIÓN' : 'PORTAL DEL PROPIETARIO'}</div>
      <nav className="nav-list">{nav.map(item => <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={19} /><span>{item.label}</span>{item.label === 'Conciliación' && <span className="nav-dot" />}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="demo-note"><div className="demo-note-icon"><ShieldCheck size={17} /></div><strong>Modo demostración</strong><p>Los datos son ficticios y se guardan solo en este navegador.</p></div><button className="logout" onClick={() => { salir(); navigate('/login') }}><LogOut size={18} /> Cerrar sesión <ArrowRight size={16} /></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="menu-button icon-button" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={23} /></button><div className="topbar-left"><span className="topbar-kicker">Arcomunity</span><span className="topbar-divider" /><span className="topbar-date">Piloto universitario</span></div><div className="topbar-right"><Simulado /><div className="avatar">{usuario?.nombre.slice(0, 1).toUpperCase()}</div><div className="topbar-user"><strong>{usuario?.nombre}</strong><small>{admin ? 'Administrador' : 'Propietario'}</small></div></div></header><main className="content">{children}</main></div>
    {aviso && <div role="status" className={`toast toast-${aviso.tipo}`}>{aviso.texto}</div>}
  </div>
}
