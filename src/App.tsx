import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { AppProvider, useApp } from './store'
import { configuracionFaltante } from './lib/supabase'
import { AppLayout, Brand, Cargando, Simulado } from './ui'

const Admin = {
  Dashboard: lazy(() => import('./admin').then(m => ({ default: m.Dashboard }))),
  Configuracion: lazy(() => import('./admin').then(m => ({ default: m.ConfiguracionPage }))),
  Unidades: lazy(() => import('./admin').then(m => ({ default: m.UnidadesPage }))),
  Cuotas: lazy(() => import('./admin').then(m => ({ default: m.CuotasPage }))),
  Conciliacion: lazy(() => import('./admin').then(m => ({ default: m.ConciliacionPage }))),
  Pagos: lazy(() => import('./admin').then(m => ({ default: m.PagosPage }))),
  Egresos: lazy(() => import('./admin').then(m => ({ default: m.EgresosPage }))),
  Reportes: lazy(() => import('./admin').then(m => ({ default: m.ReportesPage }))),
  Auditoria: lazy(() => import('./admin').then(m => ({ default: m.AuditoriaPage }))),
  Prediccion: lazy(() => import('./prediccion').then(m => ({ default: m.PrediccionPage }))),
}
const Owner = {
  MiCuenta: lazy(() => import('./owner').then(m => ({ default: m.MiCuenta }))),
  Pagar: lazy(() => import('./owner').then(m => ({ default: m.PagarPage }))),
  Transparencia: lazy(() => import('./owner').then(m => ({ default: m.TransparenciaPage }))),
  Videovigilancia: lazy(() => import('./owner').then(m => ({ default: m.VideovigilanciaPage }))),
}

const CUENTAS_DEMO = [
  { correo: 'admin@arcomunity.demo', titulo: 'Administración', nota: 'Panel completo', inicial: 'A' },
  { correo: 'casa12@arcomunity.demo', titulo: 'Propietaria · Casa 12', nota: 'Cuota pendiente', inicial: '12' },
  { correo: 'casa08@arcomunity.demo', titulo: 'Propietario · Casa 08', nota: 'Pago en revisión', inicial: '08' },
]

function AuthShell({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return <div className="auth-shell">
    <div className="auth-aside"><div className="auth-aside-inner"><Brand light />
      <div className="auth-copy">
        <div className="auth-pill"><Sparkles size={16} /> GESTIÓN VECINAL MÁS SIMPLE</div>
        <p className="auth-lema">La tranquilidad<br />empieza con <em>cuentas claras.</em></p>
        <p>Paga tu cuota de vigilancia, sube tu comprobante y mira cómo se usa el dinero de tu comunidad.</p>
        <div className="auth-features">
          <div><span><CheckCircle2 size={18} /></span> Pagos organizados</div>
          <div><span><ShieldCheck size={18} /></span> Datos protegidos</div>
          <div><span><UsersRound size={18} /></span> Cuentas claras para todos</div>
        </div>
      </div>
      <div className="auth-aside-foot">Arcomunity · Proyecto universitario UTP · Datos de demostración simulados</div>
    </div></div>
    <div className="auth-main"><div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-form-wrap"><div className="auth-top"><Simulado />{pie}</div>{children}</div>
    </div>
  </div>
}

function CampoClave({ value, onChange, placeholder, autoComplete, minLength }: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; minLength?: number }) {
  const [ver, setVer] = useState(false)
  return <div className="input-icon"><LockKeyhole size={19} />
    <input type={ver ? 'text' : 'password'} required minLength={minLength} autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div>
}

function Login() {
  const { entrar } = useApp()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setCargando(true)
    const err = await entrar(correo, clave)
    setCargando(false)
    if (err) setError(err)
  }
  return <AuthShell pie={<span>¿Nuevo en Arcomunity? <Link to="/registro">Regístrate</Link></span>}>
    <div className="auth-heading"><span className="eyebrow">Bienvenido de nuevo</span><h1>Inicia sesión</h1><p>Ingresa para ver tus cuotas y las cuentas de tu comunidad.</p></div>
    <form className="form-stack auth-form" onSubmit={e => void submit(e)}>
      <label className="field"><span>Correo electrónico</span><div className="input-icon"><Mail size={19} /><input type="email" required autoComplete="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="tu@correo.com" /></div></label>
      <label className="field"><span>Contraseña</span><CampoClave value={clave} onChange={setClave} placeholder="Ingresa tu contraseña" autoComplete="current-password" /></label>
      {error && <div role="alert" className="form-error">{error}</div>}
      <button className="button button-primary auth-submit" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'} <ArrowRight size={19} /></button>
      <Link className="text-link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
    </form>
    <div className="demo-accounts">
      <div className="demo-accounts-head"><Sparkles size={18} /><strong>Cuentas de demostración</strong></div>
      <p>Elige un perfil para completar el correo. La contraseña está en el README del proyecto.</p>
      <div className="demo-options">{CUENTAS_DEMO.map(c => <button type="button" key={c.correo} onClick={() => setCorreo(c.correo)}><span className="demo-avatar">{c.inicial}</span><span><strong>{c.titulo}</strong><small>{c.nota}</small></span><ArrowRight size={16} /></button>)}</div>
    </div>
  </AuthShell>
}

function Registro() {
  const { registrar, unidadesDisponibles } = useApp()
  const navigate = useNavigate()
  const [f, setF] = useState({ nombre: '', correo: '', clave: '', telefono: '', codigo: '', unidadId: '' })
  const [consentimiento, setConsentimiento] = useState(false)
  const [unidades, setUnidades] = useState<{ id: string; codigo: string; junta: string }[] | null>(null)
  const [validando, setValidando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }))

  const validarCodigo = async () => {
    setError(''); setUnidades(null); set('unidadId')('')
    if (f.codigo.trim().length < 6) return setError('Ingresa el código que te entregó la junta (mínimo 6 caracteres).')
    setValidando(true)
    const r = await unidadesDisponibles(f.codigo)
    setValidando(false)
    if (!r.ok) return setError(r.error)
    if (!r.data.length) return setError('El código no es válido o ya no hay unidades libres. Consulta con la junta.')
    setUnidades(r.data)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    if (!unidades) return setError('Primero valida el código de la junta.')
    if (!f.unidadId) return setError('Selecciona tu unidad.')
    if (f.clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (f.telefono && !/^\d{9}$/.test(f.telefono)) return setError('El teléfono debe tener 9 dígitos.')
    if (!consentimiento) return setError('Debes aceptar el tratamiento de datos para registrarte.')
    setCargando(true)
    const r = await registrar({ ...f, consentimiento })
    setCargando(false)
    if (!r.ok) return setError(r.error)
    if (r.data.requiereConfirmacion) setConfirmar(true)
    else navigate('/mi-cuenta')
  }

  if (confirmar) return <AuthShell pie={<span><Link to="/login">Ir a iniciar sesión</Link></span>}>
    <div className="auth-heading"><span className="eyebrow">Casi listo</span><h1>Revisa tu correo</h1><p>Te enviamos un enlace a <strong>{f.correo}</strong>. Ábrelo para activar tu cuenta y luego inicia sesión.</p></div>
  </AuthShell>

  return <AuthShell pie={<span>¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></span>}>
    <div className="auth-heading"><span className="eyebrow">Únete a tu comunidad</span><h1>Crea tu cuenta</h1><p>Necesitas el código que te dio la junta vecinal.</p></div>
    <form className="form-stack auth-form" onSubmit={e => void submit(e)}>
      <div className="field"><span>1. Código de la junta</span>
        <div className="inline-field">
          <input required value={f.codigo} onChange={e => { set('codigo')(e.target.value.toUpperCase()); setUnidades(null) }} placeholder="Ej.: ARCO2026" aria-label="Código de la junta" />
          <button type="button" className="button button-secondary" onClick={() => void validarCodigo()} disabled={validando}>{validando ? 'Validando…' : 'Validar'}</button>
        </div>
      </div>
      {unidades && <>
        <p className="form-hint ok-hint"><CheckCircle2 size={16} /> Código válido · {unidades[0].junta}</p>
        <label className="field"><span>2. Tu unidad</span><select required value={f.unidadId} onChange={e => set('unidadId')(e.target.value)}><option value="">Selecciona tu unidad</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.codigo}</option>)}</select></label>
        <div className="field-grid">
          <label className="field"><span>Nombre completo</span><input required autoComplete="name" value={f.nombre} onChange={e => set('nombre')(e.target.value)} placeholder="Tu nombre" /></label>
          <label className="field"><span>Teléfono (opcional)</span><input inputMode="numeric" autoComplete="tel" maxLength={9} value={f.telefono} onChange={e => set('telefono')(e.target.value.replace(/\D/g, ''))} placeholder="9 dígitos" /></label>
        </div>
        <div className="field-grid">
          <label className="field"><span>Correo electrónico</span><input type="email" required autoComplete="email" value={f.correo} onChange={e => set('correo')(e.target.value)} placeholder="tu@correo.com" /></label>
          <label className="field"><span>Contraseña</span><CampoClave value={f.clave} onChange={set('clave')} placeholder="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} /></label>
        </div>
        <label className="consent"><input type="checkbox" checked={consentimiento} onChange={e => setConsentimiento(e.target.checked)} /><span>Acepto que la junta trate mis datos (nombre, correo, teléfono y pagos) solo para gestionar cuotas, conciliar pagos y rendir cuentas a la comunidad, según la Ley N.º 29733. Mi nombre no se muestra a otros vecinos.</span></label>
      </>}
      {error && <div role="alert" className="form-error">{error}</div>}
      {unidades && <button className="button button-primary auth-submit" disabled={cargando}>{cargando ? 'Creando cuenta…' : 'Crear cuenta'} <ArrowRight size={19} /></button>}
    </form>
  </AuthShell>
}

function Recuperar() {
  const { recuperarClave } = useApp()
  const [correo, setCorreo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setCargando(true)
    const err = await recuperarClave(correo)
    setCargando(false)
    if (err) setError(err); else setEnviado(true)
  }
  return <AuthShell pie={<span><Link to="/login">Volver a iniciar sesión</Link></span>}>
    <div className="auth-heading"><span className="eyebrow">Recuperar acceso</span><h1>¿Olvidaste tu contraseña?</h1><p>Te enviaremos un enlace para crear una nueva.</p></div>
    {enviado
      ? <div className="notice"><Mail size={19} /><div><strong>Revisa tu correo</strong><p>Si {correo} está registrado, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.</p></div></div>
      : <form className="form-stack auth-form" onSubmit={e => void submit(e)}>
        <label className="field"><span>Correo electrónico</span><div className="input-icon"><Mail size={19} /><input type="email" required autoComplete="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="tu@correo.com" /></div></label>
        {error && <div role="alert" className="form-error">{error}</div>}
        <button className="button button-primary auth-submit" disabled={cargando}>{cargando ? 'Enviando…' : 'Enviar enlace'} <ArrowRight size={19} /></button>
      </form>}
  </AuthShell>
}

function Restablecer() {
  const { cambiarClave, estado, mostrar } = useApp()
  const navigate = useNavigate()
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  if (estado === 'sin_sesion') return <AuthShell pie={<span><Link to="/recuperar">Pedir otro enlace</Link></span>}>
    <div className="auth-heading"><span className="eyebrow">Enlace no válido</span><h1>El enlace expiró</h1><p>Pide un nuevo enlace de recuperación.</p></div>
  </AuthShell>
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setCargando(true)
    const err = await cambiarClave(clave)
    setCargando(false)
    if (err) return setError(err)
    mostrar('Contraseña actualizada.')
    navigate('/')
  }
  return <AuthShell>
    <div className="auth-heading"><span className="eyebrow">Nueva contraseña</span><h1>Crea tu nueva contraseña</h1></div>
    <form className="form-stack auth-form" onSubmit={e => void submit(e)}>
      <label className="field"><span>Nueva contraseña</span><CampoClave value={clave} onChange={setClave} placeholder="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} /></label>
      {error && <div role="alert" className="form-error">{error}</div>}
      <button className="button button-primary auth-submit" disabled={cargando}><KeyRound size={18} /> {cargando ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  </AuthShell>
}

function SinMembresia() {
  const { salir } = useApp()
  return <AuthShell>
    <div className="auth-heading"><span className="eyebrow">Cuenta sin junta</span><h1>Tu cuenta no está vinculada</h1><p>Tu usuario existe, pero no pertenece a ninguna junta activa. Pide a la administración que revise tu unidad.</p></div>
    <button className="button button-secondary" onClick={() => void salir()}>Cerrar sesión</button>
  </AuthShell>
}

function ConfiguracionFaltante() {
  return <AuthShell>
    <div className="auth-heading"><span className="eyebrow">Configuración</span><h1>Falta conectar Supabase</h1><p>Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env.local</code> (o en Vercel) y vuelve a iniciar la aplicación.</p></div>
  </AuthShell>
}

const inicio = (rol?: string) => (rol === 'admin' ? '/admin' : '/mi-cuenta')

function Protegida({ children, rol }: { children: ReactNode; rol?: 'admin' | 'propietario' }) {
  const { usuario, estado } = useApp()
  if (estado === 'cargando') return <Cargando pantalla />
  if (estado === 'sin_membresia') return <SinMembresia />
  if (!usuario) return <Navigate to="/login" replace />
  if (rol && usuario.rol !== rol) return <Navigate to={inicio(usuario.rol)} replace />
  return <AppLayout><Suspense fallback={<Cargando />}>{children}</Suspense></AppLayout>
}

function Publica({ children }: { children: ReactNode }) {
  const { usuario, estado } = useApp()
  if (estado === 'cargando') return <Cargando pantalla />
  if (usuario) return <Navigate to={inicio(usuario.rol)} replace />
  if (estado === 'sin_membresia') return <SinMembresia />
  return <>{children}</>
}

function AppRoutes() {
  const { usuario, estado } = useApp()
  useEffect(() => { document.documentElement.lang = 'es-PE' }, [])
  return <Routes>
    <Route path="/login" element={<Publica><Login /></Publica>} />
    <Route path="/registro" element={<Publica><Registro /></Publica>} />
    <Route path="/recuperar" element={<Publica><Recuperar /></Publica>} />
    <Route path="/restablecer" element={estado === 'cargando' ? <Cargando pantalla /> : <Restablecer />} />
    <Route path="/mi-cuenta" element={<Protegida rol="propietario"><Owner.MiCuenta /></Protegida>} />
    <Route path="/pagar/:cuotaId" element={<Protegida rol="propietario"><Owner.Pagar /></Protegida>} />
    <Route path="/transparencia" element={<Protegida><Owner.Transparencia /></Protegida>} />
    <Route path="/videovigilancia" element={<Protegida><Owner.Videovigilancia /></Protegida>} />
    <Route path="/admin" element={<Protegida rol="admin"><Admin.Dashboard /></Protegida>} />
    <Route path="/admin/configuracion" element={<Protegida rol="admin"><Admin.Configuracion /></Protegida>} />
    <Route path="/admin/unidades" element={<Protegida rol="admin"><Admin.Unidades /></Protegida>} />
    <Route path="/admin/cuotas" element={<Protegida rol="admin"><Admin.Cuotas /></Protegida>} />
    <Route path="/admin/conciliacion" element={<Protegida rol="admin"><Admin.Conciliacion /></Protegida>} />
    <Route path="/admin/pagos" element={<Protegida rol="admin"><Admin.Pagos /></Protegida>} />
    <Route path="/admin/egresos" element={<Protegida rol="admin"><Admin.Egresos /></Protegida>} />
    <Route path="/admin/reportes" element={<Protegida rol="admin"><Admin.Reportes /></Protegida>} />
    <Route path="/admin/auditoria" element={<Protegida rol="admin"><Admin.Auditoria /></Protegida>} />
    <Route path="/admin/prediccion" element={<Protegida rol="admin"><Admin.Prediccion /></Protegida>} />
    <Route path="*" element={estado === 'cargando' ? <Cargando pantalla /> : <Navigate to={usuario ? inicio(usuario.rol) : '/login'} replace />} />
  </Routes>
}

export default function App() {
  if (configuracionFaltante) return <ConfiguracionFaltante />
  return <AppProvider><AppRoutes /></AppProvider>
}
