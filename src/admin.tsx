import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, ArrowDownToLine, ArrowRight, Banknote, CalendarCheck, CalendarDays, Check, CheckCircle2, Clock3, ExternalLink, FileText, Filter, ImagePlus, Plus, Printer, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, TrendingUp, UserMinus, UsersRound, XCircle } from 'lucide-react'
import { dinero, estadoVisible, fechaVisible, hoy, mes, mesVisible, periodoAnterior, type Camara, type ConceptoEgreso, type Configuracion, type Pago, type TipoCamara, type Unidad } from './model'
import { useApp, type CamaraEdicion } from './store'
import { useRpc } from './lib/usarRpc'
import { mensajeCuotasGeneradas } from './lib/prediccionTextos'
import { optimizarImagen, dataUrlABlob } from './image'
import { Ayuda, Badge, Cargando, ConfirmDialog, DateText, Empty, Modal, Money, PageHead, Simulado, Stat } from './ui'
import { useTema } from './lib/tema'
import { useAvisoCambios } from './lib/cambios'
import type { PreparacionDemo } from './store'
import { Saludo } from './saludo'

// Mes siguiente (para generar cuotas por adelantado) y los 12 anteriores.
const periodos = Array.from({ length: 13 }, (_, i) => periodoAnterior(mes(), i - 1))
const SelectorMes = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <label className="select-wrap"><CalendarDays size={17} /><select aria-label="Seleccionar mes" value={value} onChange={e => onChange(e.target.value)}>{periodos.map(p => <option value={p} key={p}>{mesVisible(p)}</option>)}</select></label>
const nombreUnidad = (unidades: Unidad[], idUnidad: string) => unidades.find(u => u.id === idUnidad)?.codigo || 'Unidad'
const textoAlerta: Record<string, string> = {
  monto_no_coincide: 'Monto distinto a la cuota',
  operacion_duplicada: 'N.º de operación repetido',
  fecha_fuera_de_periodo: 'Fecha fuera del periodo',
  datos_incompletos: 'Lectura OCR poco confiable sin corregir',
  comprobante_repetido: 'Imagen ya usada en otro pago',
  revision_manual_configurada: 'Revisión manual activada',
}
const metodoVisible: Record<string, string> = { yape_qr: 'Yape (QR)', yape_captura: 'Yape', plin_captura: 'Plin', efectivo: 'Efectivo', transferencia: 'Transferencia' }

type Metricas = {
  cuotas_total: number; cuotas_pagadas: number; cuotas_en_revision: number; cuotas_pendientes: number; cuotas_morosas: number
  monto_por_cobrar: number; recaudado: number; egresos: number; saldo: number; pagos_conciliados: number; pagos_auto: number
  minutos_promedio: number; pagos_en_revision: number
}

// ---------------------------------------------------------------------------------------------
export function Dashboard() {
  const { datos, usuario } = useApp()
  const oscuro = useTema() === 'oscuro'
  const colores = oscuro ? { rejilla: '#2c4549', texto: '#b4c6c2', ingresos: '#a6d47a', egresos: '#f0a882' } : { rejilla: '#e9eeec', texto: '#4f6668', ingresos: '#8fbf5a', egresos: '#e8a27c' }
  const [periodo, setPeriodo] = useState(mes())
  const m = useRpc<Metricas>('metricas_periodo', usuario ? { p_junta: usuario.juntaId, p_periodo: periodo } : null)
  const serie = useRpc<{ periodo: string; recaudado: number; egresos: number }[]>('serie_mensual', usuario ? { p_junta: usuario.juntaId, p_meses: 12 } : null)
  const morosas = datos.cuotas.filter(c => c.periodo === periodo && estadoVisible(c) === 'morosa')
  const met = m.data
  const grafico = (serie.data ?? []).map(s => ({ mes: new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' }).format(new Date(`${s.periodo}T12:00:00Z`)), ingresos: Number(s.recaudado), egresos: Number(s.egresos) }))
  const pctAlDia = met && met.cuotas_total ? Math.round(met.cuotas_pagadas / met.cuotas_total * 100) : 0
  const pctAuto = met && met.pagos_conciliados ? Math.round(met.pagos_auto / met.pagos_conciliados * 100) : 0

  return <>
    <Saludo subtitulo={datos.configuracion.nombre} accion={<SelectorMes value={periodo} onChange={setPeriodo} />} />
    {m.error && <div className="notice notice-danger" role="alert"><AlertCircle size={19} /><span>{m.error}</span></div>}
    {!met ? <Cargando texto="Calculando indicadores…" /> : <>
      {met.pagos_en_revision > 0 && <Link className="notice notice-action" to="/admin/conciliacion"><ShieldCheck size={20} /><div><strong>Ir a Conciliación</strong><p>Mira el comprobante, verifica en tu app y aprueba o rechaza con un clic.</p></div><ArrowRight size={18} /></Link>}
      <div className="stats-grid four">
        <Stat label="Recaudado" value={dinero(Number(met.recaudado))} note="Pagos validados o aprobados" icon={<TrendingUp size={20} />} tone="lime" />
        <Stat label="Por cobrar" value={dinero(Number(met.monto_por_cobrar))} note={`${met.cuotas_total - met.cuotas_pagadas} cuotas sin pagar`} icon={<Clock3 size={20} />} />
        <Stat label="Unidades al día" value={`${pctAlDia}%`} note={`${met.cuotas_morosas} vencidas de ${met.cuotas_total}`} icon={<UsersRound size={20} />} tone={met.cuotas_morosas ? 'coral' : 'normal'} />
        <Stat label="Saldo del mes" value={dinero(Number(met.saldo))} note={`Egresos: ${dinero(Number(met.egresos))}`} icon={<Banknote size={20} />} />
      </div>
      <div className="section-grid">
        <div className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">Evolución</span><h2>Ingresos y egresos</h2></div><span className="panel-muted chart-leyenda"><span className="leyenda-ingresos">Ingresos</span><span className="leyenda-egresos">Egresos</span><span>Últimos 12 meses</span></span></div>
          <div className="chart-wrap" role="img" aria-label="Gráfico de ingresos y egresos de los últimos 12 meses">{serie.data ? <ResponsiveContainer width="100%" height="100%"><BarChart data={grafico} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke={colores.rejilla} vertical={false} /><XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: colores.texto, fontSize: 13 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: colores.texto, fontSize: 13 }} /><Tooltip contentStyle={oscuro ? { background: '#16292e', border: '1px solid #2c4549', color: '#e6efec' } : undefined} cursor={{ fill: oscuro ? '#ffffff10' : '#17383e0d' }} formatter={(value, name) => [dinero(Number(value)), name === 'ingresos' ? 'Ingresos' : 'Egresos']} /><Bar dataKey="ingresos" fill={colores.ingresos} radius={[5, 5, 0, 0]} /><Bar dataKey="egresos" fill={colores.egresos} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <Cargando />}</div>
        </div>
        <div className="panel insight-panel"><div className="panel-heading"><div><span className="eyebrow">Eficiencia</span><h2>Conciliación</h2></div><ShieldCheck size={24} /></div>
          <div className="big-metric">{pctAuto}<span>%</span></div><p>de los pagos del mes se validaron con las reglas sin revisión manual</p>
          <div className="progress-line"><span style={{ width: `${pctAuto}%` }} /></div>
          <div className="insight-bottom"><Clock3 size={19} /><div><strong>{Number(met.minutos_promedio).toFixed(1)} min</strong><span>Tiempo promedio hasta conciliar</span></div></div>
        </div>
      </div>
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Seguimiento</span><h2>Cuotas vencidas sin pagar</h2></div><span className="count-pill">{morosas.length} unidades</span></div>
        {morosas.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Propietario</th><th>Vencimiento</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{morosas.map(c => { const u = datos.unidades.find(x => x.id === c.unidadId); return <tr key={c.id}><td className="strong">{u?.codigo}</td><td>{u?.propietario?.nombre ?? <span className="muted">Sin registrar</span>}</td><td><DateText value={c.vencimiento} /></td><td><Money value={c.monto} /></td><td><Badge estado="morosa" /></td></tr> })}</tbody></table></div>
          : <Empty title="Sin cuotas vencidas" text="Ninguna unidad tiene cuotas vencidas en este periodo." />}
      </div>
    </>}
  </>
}

// ---------------------------------------------------------------------------------------------
export function ConfiguracionPage() {
  const { datosListos, datos } = useApp()
  // El formulario se crea cuando la configuración ya llegó del servidor (evita enviar valores vacíos).
  if (!datosListos) return <Cargando texto="Cargando configuración…" />
  return <ConfiguracionFormulario inicial={datos.configuracion} />
}

function ConfiguracionFormulario({ inicial }: { inicial: Configuracion }) {
  const { datos, configurar, subirQr, guardarCamara, eliminarCamara, mostrar } = useApp()
  const [form, setForm] = useState<Configuracion>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [subiendoQr, setSubiendoQr] = useState(false)
  const [generando, setGenerando] = useState(false)
  const { rpc, usuario, recargar } = useApp()
  const demo = !!inicial.modoDemo
  const generarCodigo = async () => {
    if (!usuario) return null
    setGenerando(true)
    const r = await rpc<string>('generar_codigo_invitacion', { p_junta: usuario.juntaId })
    setGenerando(false)
    if (!r.ok) return r.error
    setForm(f => ({ ...f, codigoInvitacion: r.data }))
    mostrar(`Nuevo código: ${r.data}. El anterior ya no funciona.`)
    await recargar()
    return null
  }
  const [modalCamara, setModalCamara] = useState<CamaraEdicion | null>(null)
  const [camaraOriginal, setCamaraOriginal] = useState('')
  const [borrar, setBorrar] = useState<Camara | null>(null)
  const [confirmarCambios, setConfirmarCambios] = useState<string[] | null>(null)
  const [confirmarCodigo, setConfirmarCodigo] = useState(false)
  const [errores, setErrores] = useState<{ cuota?: string; dia?: string }>({})
  const base = datos.configuracion
  const sucio = form.nombre !== base.nombre || form.cuotaMensual !== base.cuotaMensual || form.diaVencimiento !== base.diaVencimiento || form.yapeTitular !== base.yapeTitular
    || form.conciliacionAutomatica !== base.conciliacionAutomatica || (form.transparenciaDetalle ?? true) !== (base.transparenciaDetalle ?? true) || form.codigoInvitacion !== base.codigoInvitacion
  useAvisoCambios(sucio, 'Cambiaste la configuración y aún no la guardaste.')

  const guardar = async () => {
    setGuardando(true)
    const err = await configurar(form)
    setGuardando(false)
    return err
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err: typeof errores = {}
    if (!Number.isFinite(form.cuotaMensual) || form.cuotaMensual <= 0) err.cuota = 'Ingresa un monto mayor que 0, por ejemplo 150.'
    if (!Number.isInteger(form.diaVencimiento) || form.diaVencimiento < 1 || form.diaVencimiento > 28) err.dia = 'Elige un día entre el 1 y el 28.'
    setErrores(err)
    if (err.cuota || err.dia) { document.getElementById(err.cuota ? 'cfg-cuota' : 'cfg-dia')?.focus(); return }
    // Cambios con efecto en el dinero o en la validación de pagos: se confirman antes de guardar.
    const importantes: string[] = []
    if (form.cuotaMensual !== base.cuotaMensual) importantes.push(`La cuota mensual pasará de ${dinero(base.cuotaMensual)} a ${dinero(form.cuotaMensual)}. Se aplica a las cuotas que generes desde ahora; las ya generadas no cambian.`)
    if (form.diaVencimiento !== base.diaVencimiento) importantes.push(`El vencimiento pasará del día ${base.diaVencimiento} al día ${form.diaVencimiento} de cada mes (para las próximas cuotas).`)
    if (form.conciliacionAutomatica !== base.conciliacionAutomatica) importantes.push(form.conciliacionAutomatica ? 'Los comprobantes sin alertas marcarán la cuota como pagada sin tu revisión.' : 'Todos los comprobantes pasarán a tu revisión manual en Conciliación.')
    if (form.codigoInvitacion !== base.codigoInvitacion) importantes.push('El código de invitación anterior dejará de funcionar para nuevos registros.')
    if (importantes.length) { setConfirmarCambios(importantes); return }
    await guardar()
  }
  const qr = async (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) return mostrar('El QR debe ser una imagen JPG o PNG de hasta 2 MB.', 'error')
    setSubiendoQr(true)
    try { await subirQr(await dataUrlABlob(await optimizarImagen(file, 620))) } catch { mostrar('No se pudo leer la imagen.', 'error') } finally { setSubiendoQr(false) }
  }
  const guardarModal = async (e: FormEvent) => {
    e.preventDefault()
    if (modalCamara && !(await guardarCamara(modalCamara))) setModalCamara(null)
  }

  return <>
    <PageHead eyebrow="Administración" title="Configuración" description="Cuánto y cuándo pagan los vecinos, cómo se concilia y qué ve la comunidad." />
    {demo && <div className="info-callout demo-callout" role="note"><AlertCircle size={18} /><span><strong>Modo demostración.</strong> Puedes cambiar la cuota, el vencimiento y las opciones. El nombre de la junta, el código de invitación, el titular y el QR de Yape están bloqueados para que la demostración funcione para todos. Los cambios se restauran cada noche.</span></div>}
    <form onSubmit={e => void submit(e)} className="settings-grid">
      <div className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">Datos de la junta</span><h2>Cuota y vencimiento</h2></div></div>
        <div className="field-grid">
          <label className="field full"><span>Nombre de la junta</span><input required value={form.nombre} disabled={demo} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
          <label className="field"><span>Cuota mensual (S/)</span><input id="cfg-cuota" required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.cuotaMensual} aria-invalid={!!errores.cuota} aria-describedby="cfg-cuota-ayuda" onChange={e => setForm({ ...form, cuotaMensual: Number(e.target.value) })} />{errores.cuota ? <small id="cfg-cuota-ayuda" className="field-error">{errores.cuota}</small> : <small id="cfg-cuota-ayuda">Se aplica a las cuotas que generes desde ahora.</small>}</label>
          <label className="field"><span>Día de vencimiento</span><input id="cfg-dia" required type="number" min="1" max="28" inputMode="numeric" value={form.diaVencimiento} aria-invalid={!!errores.dia} aria-describedby="cfg-dia-ayuda" onChange={e => setForm({ ...form, diaVencimiento: Number(e.target.value) })} />{errores.dia ? <small id="cfg-dia-ayuda" className="field-error">{errores.dia}</small> : <small id="cfg-dia-ayuda">Entre el 1 y el 28 de cada mes.</small>}</label>
          <div className="field full"><label htmlFor="codigo-invitacion"><span className="field-label">Código de invitación</span></label><div className="inline-field"><input id="codigo-invitacion" required minLength={8} maxLength={32} value={form.codigoInvitacion} disabled={demo} onChange={e => setForm({ ...form, codigoInvitacion: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} /><button type="button" className="button button-secondary" disabled={generando || demo} onClick={() => setConfirmarCodigo(true)}><RefreshCw size={16} /> {generando ? 'Generando…' : 'Generar código seguro'}</button></div><small>Mínimo 8 caracteres con letras y números. Compártelo solo con propietarios; si se filtró, genera uno nuevo (el anterior deja de funcionar).</small></div>
        </div>
        <label className="toggle-row"><div><strong>Validación automática por reglas</strong><small>Los comprobantes sin alertas marcan la cuota como pagada. No equivale a confirmación bancaria: puedes revertirlos en Pagos.</small></div><input type="checkbox" checked={form.conciliacionAutomatica} onChange={e => setForm({ ...form, conciliacionAutomatica: e.target.checked })} /><span className="switch" /></label>
        <label className="toggle-row"><div><strong>Mostrar estado por unidad en Transparencia</strong><small>Si lo desactivas, los vecinos solo ven totales de la comunidad.</small></div><input type="checkbox" checked={form.transparenciaDetalle ?? true} onChange={e => setForm({ ...form, transparenciaDetalle: e.target.checked })} /><span className="switch" /></label>
      </div>
      <div className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">Método de pago</span><h2>QR de Yape</h2></div></div>
        <div className="qr-upload"><div className="qr-preview">{datos.configuracion.yapeQr ? <img src={datos.configuracion.yapeQr} alt="QR de Yape configurado" /> : <div className="qr-placeholder"><ImagePlus size={31} /><span>Aún no hay un QR cargado</span></div>}</div>
          <label className={`button button-secondary upload-button${demo ? ' is-disabled' : ''}`} aria-disabled={demo || undefined}><ImagePlus size={17} /> {subiendoQr ? 'Subiendo…' : 'Subir imagen QR'}<input type="file" accept="image/png,image/jpeg" onChange={e => void qr(e.target.files?.[0])} hidden disabled={subiendoQr || demo} /></label><small>JPG o PNG, máximo 2 MB. Se guarda en almacenamiento privado.</small></div>
        <label className="field"><span>Nombre del titular</span><input value={form.yapeTitular} disabled={demo} onChange={e => setForm({ ...form, yapeTitular: e.target.value })} placeholder="Nombre que aparece en Yape" /></label>
        <div className="info-callout"><AlertCircle size={18} /><span>Arcomunity no se conecta con Yape ni con bancos. Verifica en tu app los pagos dudosos antes de aprobarlos.</span></div>
      </div>
      <div className="form-actions full-row"><button className="button button-primary" type="submit" disabled={guardando}><Check size={18} /> {guardando ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>

    <div className="panel section-gap">
      <div className="panel-heading"><div><span className="eyebrow">Videovigilancia</span><h2>Cámaras de zonas comunes</h2></div>
        <button type="button" className="button button-primary" onClick={() => { const c: CamaraEdicion = { id: null, nombre: '', ubicacion: '', tipo: 'simulada', activa: true }; setCamaraOriginal(JSON.stringify(c)); setModalCamara(c) }}><Plus size={18} /> Nueva cámara</button></div>
      {datos.camaras.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Cámara</th><th>Ubicación</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {datos.camaras.map(c => <tr key={c.id}><td className="strong">{c.nombre}</td><td>{c.ubicacion}</td><td>{c.tipo === 'simulada' ? 'Simulada' : c.tipo === 'mjpeg' ? 'Imagen / MJPEG' : 'Embed'}</td><td><Badge estado={c.activa ? 'activa' : 'inactiva'} /></td>
          <td><div className="table-actions"><button type="button" className="text-button" onClick={() => { setCamaraOriginal(JSON.stringify({ ...c })); setModalCamara({ ...c }) }}>Editar</button><button type="button" className="text-button" onClick={() => void guardarCamara({ ...c, activa: !c.activa })}>{c.activa ? 'Desactivar' : 'Activar'}</button><button type="button" className="text-button danger" onClick={() => setBorrar(c)}><Trash2 size={15} /> Eliminar</button></div></td></tr>)}
      </tbody></table></div> : <Empty title="Sin cámaras" text="Agrega una cámara simulada o una URL HTTPS de transmisión." />}
    </div>

    {modalCamara && <Modal title={modalCamara.id ? 'Editar cámara' : 'Nueva cámara'} onClose={() => setModalCamara(null)} confirmarCierre={JSON.stringify(modalCamara) !== camaraOriginal}>
      <form onSubmit={e => void guardarModal(e)} className="form-stack">
        <label className="field"><span>Nombre</span><input autoFocus required value={modalCamara.nombre} onChange={e => setModalCamara({ ...modalCamara, nombre: e.target.value })} placeholder="Ej.: Ingreso peatonal" /></label>
        <label className="field"><span>Ubicación</span><input required value={modalCamara.ubicacion} onChange={e => setModalCamara({ ...modalCamara, ubicacion: e.target.value })} placeholder="Ej.: Portón principal" /></label>
        <label className="field"><span>Tipo de transmisión</span><select value={modalCamara.tipo} onChange={e => setModalCamara({ ...modalCamara, tipo: e.target.value as TipoCamara })}><option value="simulada">Simulada (demostración)</option>{!demo && <><option value="mjpeg">Imagen / MJPEG por URL</option><option value="embed">Embed por URL (iframe aislado)</option></>}</select>{demo && <small>En la demostración solo se usan cámaras simuladas.</small>}</label>
        {modalCamara.tipo !== 'simulada' && <label className="field"><span>URL de transmisión (https://)</span><input required type="url" pattern="https://.*" value={modalCamara.url ?? ''} onChange={e => setModalCamara({ ...modalCamara, url: e.target.value })} placeholder="https://ejemplo.com/stream" /><small>Si el sitio bloquea ser embebido, el navegador no lo mostrará.</small></label>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModalCamara(null)}>Cancelar</button><button className="button button-primary" type="submit"><Check size={17} /> Guardar cámara</button></div>
      </form>
    </Modal>}
    {borrar && <ConfirmDialog tipo="peligro" titulo="¿Eliminar esta cámara?" descripcion={<>La cámara <strong>{borrar.nombre}</strong> dejará de mostrarse a los vecinos. Quedará registrado en la auditoría.</>} textoConfirmar="Eliminar cámara" textoProcesando="Eliminando…" onCerrar={() => setBorrar(null)} onConfirmar={() => eliminarCamara(borrar.id)} />}
    {confirmarCambios && <ConfirmDialog tipo="aviso" titulo="¿Guardar estos cambios?" descripcion="Revisa lo que cambiará en la junta:" advertencias={confirmarCambios} textoConfirmar="Guardar cambios" textoProcesando="Guardando…" onCerrar={() => setConfirmarCambios(null)} onConfirmar={guardar} />}
    {confirmarCodigo && <ConfirmDialog tipo="aviso" titulo="¿Generar un código nuevo?" descripcion="El código actual dejará de funcionar. Los vecinos que aún no se registran necesitarán el nuevo código; las cuentas ya creadas no se ven afectadas." textoConfirmar="Generar código nuevo" textoProcesando="Generando…" onCerrar={() => setConfirmarCodigo(false)} onConfirmar={generarCodigo} />}
  </>
}

// ---------------------------------------------------------------------------------------------
export function UnidadesPage() {
  const { datos, guardarUnidad, cambiarEstadoUnidad, desvincularPropietario } = useApp()
  const [buscar, setBuscar] = useState('')
  const [modal, setModal] = useState<{ id: string | null; codigo: string } | null>(null)
  const [confirmar, setConfirmar] = useState<{ tipo: 'desactivar' | 'desvincular'; unidad: Unidad } | null>(null)
  const q = buscar.trim().toLowerCase()
  const lista = datos.unidades.filter(u => !q || u.codigo.toLowerCase().includes(q) || u.propietario?.nombre.toLowerCase().includes(q) || u.propietario?.correo.toLowerCase().includes(q))
  const guardar = async (e: FormEvent) => { e.preventDefault(); if (modal && !(await guardarUnidad(modal.id, modal.codigo))) setModal(null) }
  const libres = datos.unidades.filter(u => u.activa && !u.propietario).length

  return <>
    <PageHead eyebrow="Padrón vecinal" title="Unidades y vecinos" description="Viviendas de la junta y su propietario registrado." action={<button className="button button-primary" onClick={() => setModal({ id: null, codigo: '' })}><Plus size={18} /> Nueva unidad</button>} />
    <div className="info-callout section-gap-bottom"><UsersRound size={18} /><span>Los propietarios se registran solos con el código <strong>{datos.configuracion.codigoInvitacion || '—'}</strong> y eligen su unidad. Hay {libres} unidades activas sin propietario.</span></div>
    <div className="panel"><div className="table-tools"><label className="search-box"><Search size={18} /><input aria-label="Buscar unidad o vecino" placeholder="Buscar unidad, nombre o correo…" value={buscar} onChange={e => setBuscar(e.target.value)} /></label><span className="count-pill">{datos.unidades.filter(u => u.activa).length} activas</span></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Propietario</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {lista.map(u => <tr key={u.id}><td className="strong">{u.codigo}</td><td>{u.propietario?.nombre ?? <span className="muted">Sin asignar</span>}</td><td>{u.propietario ? <span className="muted">{u.propietario.correo}{u.propietario.telefono ? ` · ${u.propietario.telefono}` : ''}</span> : '—'}</td><td><Badge estado={u.activa ? 'activa' : 'inactiva'} /></td>
          <td><div className="table-actions"><button className="text-button" onClick={() => setModal({ id: u.id, codigo: u.codigo })}>Editar</button>
            {u.propietario && <button className="text-button" onClick={() => setConfirmar({ tipo: 'desvincular', unidad: u })}><UserMinus size={15} /> Desvincular</button>}
            {u.activa ? <button className="text-button danger" onClick={() => setConfirmar({ tipo: 'desactivar', unidad: u })}>Desactivar</button> : <button className="text-button" onClick={() => void cambiarEstadoUnidad(u.id, true)}>Activar</button>}</div></td></tr>)}
      </tbody></table></div>
      {!lista.length && <Empty title="Sin resultados" text="Ninguna unidad coincide con la búsqueda." />}
    </div>
    {modal && <Modal title={modal.id ? 'Editar unidad' : 'Nueva unidad'} onClose={() => setModal(null)} confirmarCierre={modal.codigo !== (datos.unidades.find(u => u.id === modal.id)?.codigo ?? '')}><form onSubmit={e => void guardar(e)} className="form-stack"><label className="field"><span>Código de la unidad</span><input autoFocus required maxLength={30} value={modal.codigo} onChange={e => setModal({ ...modal, codigo: e.target.value })} placeholder="Ej.: Casa 31" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary"><Check size={17} /> Guardar</button></div></form></Modal>}
    {confirmar?.tipo === 'desactivar' && <ConfirmDialog tipo="peligro" titulo={`¿Desactivar ${confirmar.unidad.codigo}?`} descripcion="Ya no se generarán cuotas nuevas para esta unidad. Su historial se conserva y puedes activarla otra vez cuando quieras." textoConfirmar="Desactivar unidad" textoProcesando="Desactivando…" onCerrar={() => setConfirmar(null)} onConfirmar={() => cambiarEstadoUnidad(confirmar.unidad.id, false)} />}
    {confirmar?.tipo === 'desvincular' && <ConfirmDialog tipo="peligro" titulo="¿Desvincular al propietario?" descripcion={<><strong>{confirmar.unidad.propietario?.nombre}</strong> dejará de tener acceso a <strong>{confirmar.unidad.codigo}</strong>. Úsalo cuando la vivienda cambie de dueño.</>} advertencias={['El historial de pagos de la unidad se conserva.', 'La persona no podrá volver a entrar a esta unidad sin registrarse de nuevo con el código de la junta.']} textoConfirmar="Desvincular propietario" textoProcesando="Desvinculando…" onCerrar={() => setConfirmar(null)} onConfirmar={() => desvincularPropietario(confirmar.unidad.id)} />}
  </>
}

// ---------------------------------------------------------------------------------------------
export function CuotasPage() {
  const { datos, generarCuotas, mostrar } = useApp()
  const [periodo, setPeriodo] = useState(mes())
  const [estado, setEstado] = useState('todas')
  const [generar, setGenerar] = useState(false)
  const delPeriodo = datos.cuotas.filter(c => c.periodo === periodo)
  const cuotas = delPeriodo.filter(c => estado === 'todas' || estadoVisible(c) === estado).sort((a, b) => nombreUnidad(datos.unidades, a.unidadId).localeCompare(nombreUnidad(datos.unidades, b.unidadId), 'es', { numeric: true }))
  const activas = datos.unidades.filter(u => u.activa).length
  return <>
    <PageHead eyebrow="Cobranza" title="Cuotas" description="Genera y consulta las cuotas mensuales de cada unidad." action={<button className="button button-primary" onClick={() => setGenerar(true)}><Plus size={18} /> Generar cuotas</button>} />
    <div className="stats-grid three"><Stat label="Cuotas del periodo" value={delPeriodo.length} note={`${activas} unidades activas`} icon={<FileText size={20} />} /><Stat label="Pagadas" value={delPeriodo.filter(c => c.estado === 'pagada').length} icon={<CheckCircle2 size={20} />} tone="lime" /><Stat label="Por cobrar" value={dinero(delPeriodo.filter(c => c.estado !== 'pagada').reduce((n, c) => n + c.monto, 0))} icon={<Clock3 size={20} />} /></div>
    <div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /><label className="select-wrap"><Filter size={17} /><select aria-label="Filtrar por estado" value={estado} onChange={e => setEstado(e.target.value)}><option value="todas">Todos los estados</option><option value="pagada">Pagadas</option><option value="pendiente">Pendientes</option><option value="morosa">Vencidas</option><option value="en_revision">En revisión</option></select></label></div>
      {cuotas.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th>Fecha de pago</th><th>Atraso</th></tr></thead><tbody>{cuotas.map(c => <tr key={c.id}><td className="strong">{nombreUnidad(datos.unidades, c.unidadId)}</td><td><DateText value={c.vencimiento} /></td><td><Money value={c.monto} /></td><td><Badge estado={estadoVisible(c)} /></td><td><DateText value={c.fechaPago} /></td><td>{c.diasAtraso ? `${c.diasAtraso} días` : '—'}</td></tr>)}</tbody></table></div>
        : <Empty title={delPeriodo.length ? 'Sin cuotas con este filtro' : 'Aún no hay cuotas este mes'} text={delPeriodo.length ? 'Prueba con otro estado.' : 'Pulsa «Generar cuotas» para crear una cuota por cada unidad activa.'} />}
    </div>
    {generar && <ConfirmDialog titulo={`¿Generar las cuotas de ${mesVisible(periodo)}?`} icono={<CalendarCheck size={22} />} descripcion={<>Se creará una cuota de <strong>{dinero(datos.configuracion.cuotaMensual)}</strong> por cada unidad activa ({activas}), con vencimiento el día {datos.configuracion.diaVencimiento}.</>} advertencias={['Las cuotas que ya existan no se duplican.', 'Los vecinos verán la nueva cuota en su cuenta.']} textoConfirmar="Generar cuotas" textoProcesando="Generando…" onCerrar={() => setGenerar(false)} onConfirmar={async () => { const r = await generarCuotas(periodo); if (!r.ok) return r.error; const m = mensajeCuotasGeneradas(r.data); mostrar(m.texto, m.tipo); return null }} />}
  </>
}

// ---------------------------------------------------------------------------------------------
function VisorComprobante({ pago }: { pago: Pago }) {
  const { urlComprobante } = useApp()
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  if (!pago.comprobantePath) return <div className="receipt-empty"><FileText size={34} /><span>Sin imagen adjunta</span><small>{pago.esSimulado ? 'Pago de la semilla de demostración.' : 'Pago registrado manualmente.'}</small></div>
  if (!url) return <div className="receipt-empty"><FileText size={34} /><button type="button" className="button button-secondary" disabled={cargando} onClick={async () => { setCargando(true); setUrl(await urlComprobante(pago.comprobantePath!)); setCargando(false) }}>{cargando ? 'Abriendo…' : 'Ver comprobante'}</button><small>Enlace privado válido por 5 minutos.</small></div>
  return <a href={url} target="_blank" rel="noreferrer" className="receipt-link"><img src={url} alt="Comprobante subido por el propietario" /><span><ExternalLink size={14} /> Abrir en tamaño completo</span></a>
}

export function ConciliacionPage() {
  const { datos, revisarPago } = useApp()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [modo, setModo] = useState<'aprobar' | 'rechazar'>('aprobar')
  const [ocupado, setOcupado] = useState(false)
  const pendientes = datos.pagos.filter(p => p.estado === 'pendiente_revision').sort((a, b) => a.subidoEn.localeCompare(b.subidoEn))
  const elegido = pendientes.find(p => p.id === seleccion)
  const cuota = elegido && datos.cuotas.find(c => c.id === elegido.cuotaId)
  const [errorMotivo, setErrorMotivo] = useState('')
  const revisar = async () => {
    if (!elegido) return
    if (modo === 'rechazar' && motivo.trim().length < 5) { setErrorMotivo('Escribe el motivo para que el vecino sepa qué corregir (al menos 5 letras).'); document.getElementById('motivo-revision')?.focus(); return }
    setErrorMotivo('')
    setOcupado(true)
    const err = await revisarPago(elegido.id, modo, motivo)
    setOcupado(false)
    if (!err) { setSeleccion(null); setMotivo('') }
  }
  return <>
    <PageHead eyebrow="Control de pagos" title="Conciliación" description="Pagos declarados que necesitan tu decisión. Verifica en tu app de Yape/Plin antes de aprobar." />
    <Ayuda pregunta="¿Qué es la conciliación?">Es comparar lo que el vecino dice que pagó con lo que realmente llegó a la cuenta de la junta. Abre el comprobante, búscalo en tu app de Yape o Plin y luego apruébalo o recházalo indicando el motivo. El vecino verá tu decisión al instante.</Ayuda>
    <div className="stats-grid two"><Stat label="Por revisar" value={pendientes.length} note="Se actualiza en tiempo real" icon={<AlertCircle size={20} />} tone={pendientes.length ? 'coral' : 'normal'} /><Stat label="Validados por reglas este mes" value={datos.pagos.filter(p => p.estado === 'conciliado_auto' && p.fecha.slice(0, 7) === mes().slice(0, 7)).length} note="Puedes revertirlos desde Pagos" icon={<ShieldCheck size={20} />} tone="lime" /></div>
    <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Cola de revisión</span><h2>Pagos con alertas</h2></div><span className="count-pill">{pendientes.length} por revisar</span></div>
      {pendientes.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Recibido</th><th>Monto</th><th>Operación</th><th>Motivo de revisión</th><th></th></tr></thead><tbody>{pendientes.map(p => <tr key={p.id}><td className="strong">{nombreUnidad(datos.unidades, p.unidadId)}</td><td><DateText value={p.subidoEn.slice(0, 10)} /></td><td><Money value={p.monto} /></td><td>{p.operacion || '—'}</td><td><div className="tag-list">{p.alertas.map(a => <span key={a} className="alert-tag">{textoAlerta[a] ?? a}</span>)}</div></td><td><button className="button button-secondary button-small" onClick={() => { setSeleccion(p.id); setModo('aprobar'); setMotivo(''); setErrorMotivo('') }} aria-label={`Revisar pago de ${nombreUnidad(datos.unidades, p.unidadId)}`}>Revisar <ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>
        : <Empty title="Todo al día" text="No hay pagos esperando revisión." />}
    </div>
    {elegido && <Modal title={`Revisar pago · ${nombreUnidad(datos.unidades, elegido.unidadId)}`} onClose={() => setSeleccion(null)} wide bloquearCierre={ocupado} confirmarCierre={motivo.trim().length > 0}>
      <div className="review-grid"><div className="receipt-view"><VisorComprobante pago={elegido} /></div>
        <div className="review-details">
          <div className="detail-row"><span>Monto declarado</span><strong className={cuota && cuota.monto !== elegido.monto ? 'text-danger' : ''}><Money value={elegido.monto} /></strong></div>
          <div className="detail-row"><span>Monto de la cuota</span><strong><Money value={cuota?.monto ?? 0} /></strong></div>
          <div className="detail-row"><span>Periodo</span><strong>{cuota ? mesVisible(cuota.periodo) : '—'}</strong></div>
          <div className="detail-row"><span>Fecha de operación</span><strong><DateText value={elegido.fecha} /></strong></div>
          <div className="detail-row"><span>N.º de operación</span><strong>{elegido.operacion || '—'}</strong></div>
          <div className="detail-row"><span>Medio</span><strong>{metodoVisible[elegido.metodo] ?? elegido.metodo}</strong></div>
          <div className="detail-row"><span>Lectura OCR</span><strong>{elegido.ocrConfianza == null ? 'Ingreso manual' : `${Math.round(elegido.ocrConfianza)} % de confianza`}</strong></div>
          <div className="alert-box"><AlertCircle size={17} /><div><strong>Por qué está en revisión</strong><div className="tag-list">{elegido.alertas.map(a => <span key={a} className="alert-tag">{textoAlerta[a] ?? a}</span>)}</div></div></div>
          <div className="segmented" role="radiogroup" aria-label="Decisión"><button type="button" role="radio" aria-checked={modo === 'aprobar'} className={modo === 'aprobar' ? 'selected' : ''} onClick={() => setModo('aprobar')}><Check size={16} /> Aprobar</button><button type="button" role="radio" aria-checked={modo === 'rechazar'} className={modo === 'rechazar' ? 'selected' : ''} onClick={() => setModo('rechazar')}><XCircle size={16} /> Rechazar u observar</button></div>
          <label className="field"><span>{modo === 'rechazar' ? 'Motivo (lo verá el propietario) *' : 'Nota interna (opcional)'}</span><textarea id="motivo-revision" value={motivo} onChange={e => { setMotivo(e.target.value); setErrorMotivo('') }} aria-invalid={!!errorMotivo} aria-describedby={errorMotivo ? 'motivo-error' : undefined} placeholder={modo === 'rechazar' ? 'Ej.: El monto no coincide; sube el comprobante completo.' : 'Ej.: Verificado en la app de Yape.'} rows={3} maxLength={500} />{errorMotivo && <small id="motivo-error" className="field-error">{errorMotivo}</small>}</label>
          <p className="decision-nota">{modo === 'aprobar' ? `La cuota de ${cuota ? mesVisible(cuota.periodo) : 'este mes'} quedará como pagada y el vecino lo verá al instante.` : 'La cuota vuelve a quedar pendiente y el vecino verá tu motivo para enviar un nuevo comprobante.'}</p>
          <button className={`button ${modo === 'aprobar' ? 'button-primary' : 'button-danger'} full-width`} disabled={ocupado} aria-busy={ocupado} onClick={() => void revisar()}>{ocupado ? 'Guardando…' : modo === 'aprobar' ? `Aprobar pago de ${dinero(elegido.monto)}` : 'Rechazar pago'}</button>
        </div></div>
    </Modal>}
  </>
}

// ---------------------------------------------------------------------------------------------
export function PagosPage() {
  const { datos, pagoManual, revisarPago } = useApp()
  const [periodo, setPeriodo] = useState(mes())
  const [modal, setModal] = useState(false)
  const [f, setF] = useState({ cuotaId: '', monto: '', fecha: hoy(), metodo: 'efectivo' as 'efectivo' | 'transferencia' | 'yape_qr', operacion: '', nota: '' })
  const [revertir, setRevertir] = useState<Pago | null>(null)
  const [motivo, setMotivo] = useState('')
  const cuotasPeriodo = new Set(datos.cuotas.filter(c => c.periodo === periodo).map(c => c.id))
  const lista = datos.pagos.filter(p => cuotasPeriodo.has(p.cuotaId)).sort((a, b) => b.subidoEn.localeCompare(a.subidoEn))
  const pendientes = datos.cuotas.filter(c => c.estado === 'pendiente').sort((a, b) => b.periodo.localeCompare(a.periodo) || nombreUnidad(datos.unidades, a.unidadId).localeCompare(nombreUnidad(datos.unidades, b.unidadId), 'es', { numeric: true }))
  const cuotaElegida = datos.cuotas.find(c => c.id === f.cuotaId)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err = await pagoManual({ cuotaId: f.cuotaId, metodo: f.metodo, monto: Number(f.monto), fecha: f.fecha, operacion: f.operacion, nota: f.nota })
    if (!err) { setModal(false); setF({ ...f, cuotaId: '', operacion: '', nota: '' }) }
  }
  return <>
    <PageHead eyebrow="Movimientos" title="Pagos" description="Historial de pagos y registro de pagos recibidos fuera de la app (efectivo o transferencia)." action={<button className="button button-primary" onClick={() => setModal(true)}><Plus size={18} /> Registrar pago manual</button>} />
    <div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /><span className="count-pill">{lista.length} registros</span></div>
      {lista.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Fecha</th><th>Medio</th><th>Operación</th><th>Monto</th><th>Estado</th><th></th></tr></thead><tbody>{lista.map(p => <tr key={p.id}><td className="strong">{nombreUnidad(datos.unidades, p.unidadId)}</td><td><DateText value={p.fecha} /></td><td>{metodoVisible[p.metodo] ?? p.metodo}</td><td>{p.operacion || '—'}</td><td><Money value={p.monto} /></td><td><Badge estado={p.estado} />{p.motivoRechazo && <small className="cell-note">{p.motivoRechazo}</small>}</td><td>{(p.estado === 'conciliado_auto' || p.estado === 'conciliado_manual') && <button className="text-button danger" onClick={() => { setRevertir(p); setMotivo('') }}>Revertir</button>}</td></tr>)}</tbody></table></div>
        : <Empty title="Sin pagos en este periodo" text="Cuando los vecinos paguen, sus comprobantes aparecerán aquí." />}
    </div>
    {modal && <Modal title="Registrar pago manual" onClose={() => setModal(false)} confirmarCierre={!!(f.cuotaId || f.operacion || f.nota)}><form onSubmit={e => void submit(e)} className="form-stack">
      <label className="field"><span>Cuota pendiente</span><select required value={f.cuotaId} onChange={e => { const c = datos.cuotas.find(x => x.id === e.target.value); setF({ ...f, cuotaId: e.target.value, monto: c ? c.monto.toFixed(2) : '' }) }}><option value="">Selecciona unidad y mes</option>{pendientes.map(c => <option key={c.id} value={c.id}>{nombreUnidad(datos.unidades, c.unidadId)} · {mesVisible(c.periodo)}</option>)}</select></label>
      <div className="field-grid"><label className="field"><span>Monto (S/)</span><input type="number" min="0.01" step="0.01" required value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />{cuotaElegida && Number(f.monto) !== cuotaElegida.monto && f.monto && <small className="text-warning">Distinto a la cuota ({dinero(cuotaElegida.monto)}). Quedará anotado.</small>}</label><label className="field"><span>Fecha</span><input type="date" max={hoy()} required value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label></div>
      <label className="field"><span>Medio</span><select value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value as typeof f.metodo })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="yape_qr">Yape (verificado en mi app)</option></select></label>
      <label className="field"><span>N.º de operación {f.metodo === 'efectivo' ? '(opcional)' : ''}</span><input required={f.metodo !== 'efectivo'} value={f.operacion} onChange={e => setF({ ...f, operacion: e.target.value })} /></label>
      <label className="field"><span>Nota (opcional)</span><input maxLength={500} value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} placeholder="Ej.: Pagó en caja el sábado" /></label>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Registrar pago</button></div>
    </form></Modal>}
    {revertir && <ConfirmDialog tipo="peligro" titulo="¿Revertir este pago?" descripcion={<>La cuota de <strong>{nombreUnidad(datos.unidades, revertir.unidadId)}</strong> volverá a quedar pendiente y el propietario verá el motivo. Úsalo si el dinero no llegó a la cuenta de la junta.</>} advertencias={[`Monto del pago: ${dinero(revertir.monto)}.`, 'La operación queda registrada en la auditoría.']} deshabilitado={motivo.trim().length < 5} textoConfirmar="Revertir pago" textoProcesando="Revirtiendo…" onCerrar={() => setRevertir(null)} onConfirmar={() => revisarPago(revertir.id, 'rechazar', motivo)}>
      <label className="field"><span>Motivo (lo verá el propietario) *</span><textarea rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: No figura en la app de Yape." /><small>Escribe al menos 5 letras.</small></label>
    </ConfirmDialog>}
  </>
}

// ---------------------------------------------------------------------------------------------
const conceptoVisible: Record<ConceptoEgreso, string> = { pago_vigilante: 'Pago al personal de vigilancia', insumos: 'Insumos', otros: 'Otros' }

export function EgresosPage() {
  const { datos, registrarEgreso, anularEgreso } = useApp()
  const [periodo, setPeriodo] = useState(mes())
  const [modal, setModal] = useState(false)
  const [f, setF] = useState({ fecha: hoy(), concepto: 'pago_vigilante' as ConceptoEgreso, beneficiario: '', monto: '', comentario: '' })
  const [anular, setAnular] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const lista = datos.egresos.filter(e => e.fecha.slice(0, 7) === periodo.slice(0, 7))
  const vigentes = lista.filter(e => !e.anulado)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err = await registrarEgreso({ ...f, monto: Number(f.monto) })
    if (!err) { setModal(false); setF({ ...f, beneficiario: '', monto: '', comentario: '' }) }
  }
  return <>
    <PageHead eyebrow="Gastos de la junta" title="Egresos" description="Pagos al personal de vigilancia y otros gastos. Los vecinos ven los totales en Transparencia." action={<button className="button button-primary" onClick={() => setModal(true)}><Plus size={18} /> Nuevo egreso</button>} />
    <div className="stats-grid two"><Stat label="Total del mes" value={dinero(vigentes.reduce((n, e) => n + e.monto, 0))} note={mesVisible(periodo)} icon={<Banknote size={20} />} /><Stat label="Movimientos" value={vigentes.length} note={lista.length !== vigentes.length ? `${lista.length - vigentes.length} anulados` : 'Sin anulaciones'} icon={<FileText size={20} />} /></div>
    <div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /></div>
      {lista.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Beneficiario</th><th>Comentario</th><th>Monto</th><th></th></tr></thead><tbody>{lista.map(e => <tr key={e.id} className={e.anulado ? 'row-muted' : ''}><td><DateText value={e.fecha} /></td><td>{conceptoVisible[e.concepto]}</td><td className="strong">{e.beneficiario}</td><td>{e.anulado ? <span className="text-danger">Anulado: {e.motivoAnulacion}</span> : e.comentario || '—'}</td><td><Money value={e.monto} /></td><td>{!e.anulado && <button className="text-button danger" onClick={() => { setAnular(e.id); setMotivo('') }}>Anular</button>}</td></tr>)}</tbody></table></div>
        : <Empty title="Sin egresos este mes" text="Registra el pago al personal de vigilancia para que el saldo sea real." />}
    </div>
    {modal && <Modal title="Nuevo egreso" onClose={() => setModal(false)} confirmarCierre={!!(f.beneficiario || f.monto || f.comentario)}><form onSubmit={e => void submit(e)} className="form-stack">
      <div className="field-grid"><label className="field"><span>Fecha</span><input type="date" required max={hoy()} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label><label className="field"><span>Monto (S/)</span><input type="number" required min="0.01" step="0.01" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></label></div>
      <label className="field"><span>Concepto</span><select value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value as ConceptoEgreso })}>{Object.entries(conceptoVisible).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field"><span>Beneficiario</span><input required minLength={2} maxLength={120} value={f.beneficiario} onChange={e => setF({ ...f, beneficiario: e.target.value })} placeholder="Empresa o referencia" /></label>
      <label className="field"><span>Comentario (opcional)</span><textarea rows={3} maxLength={500} value={f.comentario} onChange={e => setF({ ...f, comentario: e.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Guardar egreso</button></div>
    </form></Modal>}
    {anular && <ConfirmDialog tipo="peligro" titulo="¿Anular este egreso?" descripcion="El egreso dejará de contar en el saldo, pero seguirá visible como anulado y en la auditoría." deshabilitado={motivo.trim().length < 5} textoConfirmar="Anular egreso" textoProcesando="Anulando…" onCerrar={() => setAnular(null)} onConfirmar={() => anularEgreso(anular, motivo)}>
      <label className="field"><span>Motivo *</span><textarea rows={2} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: Monto digitado por error." /><small>Escribe al menos 5 letras.</small></label>
    </ConfirmDialog>}
  </>
}

// ---------------------------------------------------------------------------------------------
type FilaDataset = { unidad_ref: string; periodo: string; monto: number; fecha_vencimiento: string; fecha_pago: string | null; dias_atraso: number; metodo_pago: string | null; pagos_atrasados_previos: number; moroso: number; es_simulado: number; origen: string }
const COLUMNAS: (keyof FilaDataset)[] = ['unidad_ref', 'periodo', 'monto', 'fecha_vencimiento', 'fecha_pago', 'dias_atraso', 'metodo_pago', 'pagos_atrasados_previos', 'moroso', 'es_simulado', 'origen']

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvCelda = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }

async function exportarExcel(filas: FilaDataset[]) {
  const ExcelJS = await import('exceljs')
  const WorkbookClass = ExcelJS.Workbook || (ExcelJS as unknown as { default: { Workbook: typeof ExcelJS.Workbook } }).default?.Workbook
  const wb = new WorkbookClass()
  wb.creator = 'Arcomunity'
  wb.created = new Date()
  const encabezado = (ws: import('exceljs').Worksheet) => { const r = ws.getRow(1); r.height = 28; r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173942' } } }
  const ws = wb.addWorksheet('Dataset', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Unidad (seudónimo)', key: 'unidad_ref', width: 18 }, { header: 'Periodo', key: 'periodo', width: 13 }, { header: 'Monto (S/)', key: 'monto', width: 12 },
    { header: 'Vencimiento', key: 'fecha_vencimiento', width: 14 }, { header: 'Fecha de pago', key: 'fecha_pago', width: 14 }, { header: 'Días de atraso', key: 'dias_atraso', width: 14 },
    { header: 'Método de pago', key: 'metodo_pago', width: 16 }, { header: 'Atrasos previos (3 meses)', key: 'pagos_atrasados_previos', width: 22 }, { header: 'Moroso (1 = sí)', key: 'moroso', width: 14 },
    { header: 'Simulado', key: 'es_simulado', width: 10 }, { header: 'Origen', key: 'origen', width: 11 },
  ]
  encabezado(ws)
  const fecha = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`) : null)
  for (const f of filas) {
    const row = ws.addRow({ ...f, monto: Number(f.monto), fecha_vencimiento: fecha(f.fecha_vencimiento), fecha_pago: fecha(f.fecha_pago), metodo_pago: f.metodo_pago ?? '—' })
    row.getCell(3).numFmt = '#,##0.00'; row.getCell(4).numFmt = 'dd/mm/yyyy'; row.getCell(5).numFmt = 'dd/mm/yyyy'
    if (f.moroso === 1) row.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEB' } } })
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: filas.length + 1, column: COLUMNAS.length } }
  const dic = wb.addWorksheet('Diccionario de datos')
  dic.columns = [{ header: 'Campo', key: 'c', width: 26 }, { header: 'Descripción', key: 'd', width: 70 }, { header: 'Tipo', key: 't', width: 18 }]
  encabezado(dic)
  ;[
    ['unidad_ref', 'Seudónimo estable de la unidad (no revela código ni propietario).', 'Texto'],
    ['periodo', 'Primer día del mes facturado.', 'Fecha'],
    ['monto', 'Importe de la cuota en soles.', 'Numérico'],
    ['fecha_vencimiento', 'Fecha límite de pago.', 'Fecha'],
    ['fecha_pago', 'Fecha de la operación del pago conciliado (vacía si no pagó). No usar como predictor.', 'Fecha'],
    ['dias_atraso', 'Días entre vencimiento y pago. Define la etiqueta: no usar como predictor.', 'Entero ≥ 0'],
    ['metodo_pago', 'Medio del pago de esa cuota. No existe antes de pagar: no usar como predictor.', 'Texto'],
    ['pagos_atrasados_previos', 'Cuotas atrasadas en los 3 meses anteriores, conocidas al inicio del periodo.', 'Entero ≥ 0'],
    ['moroso', 'Variable objetivo: 1 si se pagó con atraso o sigue impaga tras vencer.', '0 / 1'],
    ['es_simulado', 'Indicador de dato ficticio.', '0 / 1'],
    ['origen', 'real o simulado (exigido en APF3).', 'Texto'],
  ].forEach(([c, d, t]) => dic.addRow({ c, d, t }))
  dic.addRow({})
  dic.addRow({ c: 'NOTA', d: 'Solo incluye cuotas con etiqueta definitiva (pagadas o vencidas). Exportado desde la base de datos de Arcomunity.' })
  const buffer = await wb.xlsx.writeBuffer()
  descargar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `arcomunity_dataset_morosidad_${hoy()}.xlsx`)
}

export function ReportesPage() {
  const { datos, usuario, rpc, mostrar } = useApp()
  const [periodo, setPeriodo] = useState(mes())
  const [exportando, setExportando] = useState<'' | 'csv' | 'xlsx'>('')
  const m = useRpc<Metricas>('metricas_periodo', usuario ? { p_junta: usuario.juntaId, p_periodo: periodo } : null)
  const cuotas = useMemo(() => datos.cuotas.filter(c => c.periodo === periodo).sort((a, b) => nombreUnidad(datos.unidades, a.unidadId).localeCompare(nombreUnidad(datos.unidades, b.unidadId), 'es', { numeric: true })), [datos, periodo])
  const egresos = datos.egresos.filter(e => !e.anulado && e.fecha.slice(0, 7) === periodo.slice(0, 7))

  const exportar = async (tipo: 'csv' | 'xlsx') => {
    if (!usuario) return
    setExportando(tipo)
    try {
      const r = await rpc<FilaDataset[]>('exportar_dataset_morosidad', { p_junta: usuario.juntaId })
      if (!r.ok) return mostrar(r.error, 'error')
      if (!r.data.length) return mostrar('Aún no hay cuotas con etiqueta definitiva para exportar.', 'info')
      if (tipo === 'csv') {
        const csv = '﻿' + [COLUMNAS.join(','), ...r.data.map(f => COLUMNAS.map(c => csvCelda(f[c])).join(','))].join('\r\n')
        descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `arcomunity_dataset_morosidad_${hoy()}.csv`)
      } else await exportarExcel(r.data)
      mostrar(`Exportadas ${r.data.length} cuotas desde la base de datos.`)
    } catch {
      mostrar('No se pudo generar el archivo.', 'error')
    } finally {
      setExportando('')
    }
  }

  return <>
    <PageHead eyebrow="Rendición de cuentas" title="Reporte mensual" description="Cifras calculadas en el servidor, listas para compartir con la junta." action={<div className="button-group"><button className="button button-secondary" onClick={() => window.print()}><Printer size={17} /> Imprimir / PDF</button><button className="button button-secondary" disabled={!!exportando} onClick={() => void exportar('xlsx')}><FileText size={17} /> {exportando === 'xlsx' ? 'Generando…' : 'Dataset Excel'}</button><button className="button button-primary" disabled={!!exportando} onClick={() => void exportar('csv')}><ArrowDownToLine size={17} /> {exportando === 'csv' ? 'Generando…' : 'Dataset CSV'}</button></div>} />
    <div className="report-page">
      <div className="report-header"><div><span className="eyebrow">Arcomunity · reporte</span><h2>Resumen de {mesVisible(periodo)}</h2><p>{datos.configuracion.nombre}</p></div><SelectorMes value={periodo} onChange={setPeriodo} /></div>
      {!m.data ? <Cargando /> : <div className="stats-grid three"><Stat label="Ingresos conciliados" value={dinero(Number(m.data.recaudado))} icon={<TrendingUp size={19} />} tone="lime" /><Stat label="Egresos" value={dinero(Number(m.data.egresos))} icon={<Banknote size={19} />} /><Stat label="Saldo" value={dinero(Number(m.data.saldo))} icon={<CheckCircle2 size={19} />} /></div>}
      <div className="panel report-table"><div className="panel-heading"><div><span className="eyebrow">Detalle</span><h2>Estado por unidad</h2></div><Simulado /></div>
        {cuotas.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Monto</th><th>Vencimiento</th><th>Estado</th><th>Fecha de pago</th></tr></thead><tbody>{cuotas.map(c => <tr key={c.id}><td className="strong">{nombreUnidad(datos.unidades, c.unidadId)}</td><td><Money value={c.monto} /></td><td><DateText value={c.vencimiento} /></td><td><Badge estado={estadoVisible(c)} /></td><td><DateText value={c.fechaPago} /></td></tr>)}</tbody></table></div> : <Empty title="Sin cuotas" text="No hay cuotas generadas para este mes." />}
      </div>
      {egresos.length > 0 && <div className="panel report-table"><div className="panel-heading"><div><span className="eyebrow">Egresos</span><h2>Gastos del mes</h2></div></div><div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Beneficiario</th><th>Monto</th></tr></thead><tbody>{egresos.map(e => <tr key={e.id}><td><DateText value={e.fecha} /></td><td>{conceptoVisible[e.concepto]}</td><td>{e.beneficiario}</td><td><Money value={e.monto} /></td></tr>)}</tbody></table></div></div>}
      <p className="report-foot">Cifras obtenidas de la base de datos de Arcomunity. La junta de demostración usa datos simulados. El dataset exportado usa seudónimos de unidad y solo incluye cuotas con etiqueta definitiva.</p>
    </div>
  </>
}

// ---------------------------------------------------------------------------------------------
export function AuditoriaPage() {
  const { datos } = useApp()
  const [buscar, setBuscar] = useState('')
  const q = buscar.trim().toLowerCase()
  const lista = datos.auditoria.filter(a => !q || a.accion.includes(q.replaceAll(' ', '_')) || a.usuario.toLowerCase().includes(q) || a.detalle.toLowerCase().includes(q))
  const formato = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
  return <>
    <PageHead eyebrow="Trazabilidad" title="Bitácora de auditoría" description="Acciones registradas por el servidor. Nadie puede editarlas ni borrarlas." />
    <Ayuda pregunta="¿Para qué sirve la auditoría?">Es el registro de quién hizo qué y cuándo: pagos aprobados o rechazados, cuotas generadas, cambios de configuración y más. Lo escribe el servidor y no se puede modificar, así la junta puede rendir cuentas con confianza.</Ayuda>
    {datos.configuracion.modoDemo && <HerramientasDemo />}
    <div className="panel"><div className="table-tools"><label className="search-box"><Search size={18} /><input aria-label="Buscar en la bitácora" placeholder="Buscar acción, persona o detalle…" value={buscar} onChange={e => setBuscar(e.target.value)} /></label><span className="count-pill">Últimas {datos.auditoria.length}</span></div>
      {lista.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Fecha y hora</th><th>Persona</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{lista.map(a => <tr key={a.id}><td>{formato.format(new Date(a.fecha))}</td><td className="strong">{a.usuario}</td><td><span className="audit-action">{a.accion.replaceAll('_', ' ')}</span></td><td className="audit-detail">{a.detalle || '—'}</td></tr>)}</tbody></table></div> : <Empty title="Sin registros" text="No hay acciones que coincidan." />}
    </div>
  </>
}

// ---------------------------------------------------------------------------------------------
// Herramientas de demostración (solo la junta en modo demostración). El servidor comprueba que quien
// llama sea su administración; ocultar el panel no es la medida de seguridad.
type Diagnostico = {
  foto_del: string | null; periodo_siguiente: string; unidades_activas: number; cuotas_mes_siguiente: number; predicciones_hoy: number
  modelo_activo: string | null; ultimo_reinicio: string | null; ultima_preparacion: string | null
  cambios: { pagos_nuevos: number; pagos_revisados: number; egresos_nuevos: number; cuotas_nuevas: number }
  escenarios: PreparacionDemo['escenarios']
}
const ESPERA: Record<string, string> = { cuota_por_pagar: 'cuota por pagar', pago_en_revision: 'pago en revisión', al_dia: 'pagos al día' }
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function cambiosEnsayo(c: Diagnostico['cambios']) {
  return [
    c.pagos_nuevos && plural(c.pagos_nuevos, 'pago registrado', 'pagos registrados'),
    c.pagos_revisados && plural(c.pagos_revisados, 'pago aprobado o rechazado', 'pagos aprobados o rechazados'),
    c.egresos_nuevos && plural(c.egresos_nuevos, 'egreso nuevo', 'egresos nuevos'),
    c.cuotas_nuevas && plural(c.cuotas_nuevas, 'cuota generada', 'cuotas generadas'),
  ].filter(Boolean) as string[]
}

function HerramientasDemo() {
  const { usuario, prepararDemo, reiniciarDemo, mostrar } = useApp()
  const [version, setVersion] = useState(0)
  const d = useRpc<Diagnostico>('diagnostico_demostracion', usuario ? { p_junta: usuario.juntaId } : null, [version])
  const [accion, setAccion] = useState<'' | 'preparar' | 'reiniciar'>('')
  const [resumen, setResumen] = useState<PreparacionDemo | null>(null)
  const formato = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })
  const diag = d.data
  const cambios = diag ? cambiosEnsayo(diag.cambios) : []
  const mesSig = diag ? mesVisible(diag.periodo_siguiente) : 'el mes siguiente'

  const preparar = async () => {
    const r = await prepararDemo()
    if (!r.ok) return r.error
    setVersion(v => v + 1)
    setResumen(r.data)
    return null
  }
  const reiniciar = async () => {
    const r = await reiniciarDemo()
    if (!r.ok) return r.error
    setVersion(v => v + 1)
    const x = r.data
    mostrar(`Demostración reiniciada: ${plural(x.pagosQuitados, 'pago del ensayo quitado', 'pagos del ensayo quitados')} y ${plural(x.archivosBorrados, 'archivo eliminado', 'archivos eliminados')}.${x.archivosPendientes ? ` ${x.archivosPendientes} archivo(s) no se pudieron borrar.` : ''}`)
    return null
  }

  return <section className="panel demo-tools" aria-labelledby="demo-tools-titulo">
    <div className="demo-tools-head"><span className="demo-tools-icono" aria-hidden="true"><RotateCcw size={22} /></span>
      <div><h2 id="demo-tools-titulo">Herramientas de demostración</h2><p>Prepara o restablece el escenario de pruebas de Arcomunity. Solo afecta a esta junta de demostración.</p></div></div>
    {d.error ? <div className="notice notice-danger" role="alert"><AlertCircle size={19} /><span>{d.error}</span></div>
      : !diag ? <Cargando texto="Revisando el escenario…" /> : <div className="demo-estado">
        <div className="demo-estado-fila"><span>Cuotas de {mesSig}</span><strong>{diag.cuotas_mes_siguiente} de {diag.unidades_activas}</strong></div>
        <div className="demo-estado-fila"><span>Predicciones de hoy (modelo {diag.modelo_activo ?? '—'})</span><strong>{diag.predicciones_hoy}</strong></div>
        <ul className="demo-escenarios" aria-label="Escenarios de las cuentas de prueba">{diag.escenarios.map(e => <li key={e.cuenta} className={e.ok ? 'ok' : 'falta'}>
          {e.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
          <span><strong>{e.cuenta}</strong> · {ESPERA[e.espera]}{e.ok ? '' : ' (ya no se cumple)'}</span></li>)}</ul>
        <p className="demo-estado-nota">{cambios.length ? `Cambios de este ensayo: ${cambios.join(', ')}.` : 'Sin cambios desde el estado inicial.'}{diag.ultimo_reinicio ? ` Último reinicio: ${formato.format(new Date(diag.ultimo_reinicio))}.` : ''}</p>
      </div>}
    <div className="demo-tools-acciones">
      <button type="button" className="button button-secondary" onClick={() => setAccion('preparar')} disabled={!diag}><CalendarCheck size={18} aria-hidden="true" /> Preparar demostración</button>
      <button type="button" className="button button-danger-outline" onClick={() => setAccion('reiniciar')} disabled={!diag}><RotateCcw size={18} aria-hidden="true" /> Reiniciar demostración</button>
    </div>
    <p className="demo-tools-pie">Disponible solo para la administración. El servidor comprueba el permiso, registra cada operación en esta bitácora y nunca toca otras comunidades. Además, la demostración se restaura sola cada noche a las 03:00 (hora de Lima).</p>

    {accion === 'preparar' && diag && <ConfirmDialog titulo="¿Preparar la demostración APF3?" icono={<CalendarCheck size={22} />}
      descripcion="Se dejará listo el escenario para la exposición:"
      advertencias={[
        diag.cuotas_mes_siguiente >= diag.unidades_activas ? `Las ${diag.cuotas_mes_siguiente} cuotas de ${mesSig} ya existen: no se duplican.` : `Se generarán las cuotas de ${mesSig} que falten (${diag.unidades_activas - diag.cuotas_mes_siguiente}).`,
        diag.predicciones_hoy ? `Se volverá a calcular el riesgo de hoy con el modelo ${diag.modelo_activo}; reemplaza las ${diag.predicciones_hoy} predicciones de hoy.` : `Se calculará el riesgo de pago con atraso con el modelo ${diag.modelo_activo ?? 'activo'}, dentro de la base de datos.`,
        'Se comprobarán las cuentas de prueba (Casa 12, Casa 08 y Dpto. 301). No se inventan pagos.',
        ...(cambios.length ? [<><strong>Hay un ensayo en curso</strong> ({cambios.join(', ')}). Preparar no lo borra; para empezar desde cero usa «Reiniciar demostración».</>] : []),
      ]}
      textoConfirmar="Preparar demostración" textoProcesando="Preparando…" onCerrar={() => setAccion('')} onConfirmar={preparar} />}

    {accion === 'reiniciar' && <ConfirmDialog tipo="peligro" titulo="¿Reiniciar la demostración?"
      descripcion="Se restaurarán los datos de prueba al estado inicial. Los cambios realizados durante esta demostración se perderán."
      advertencias={[
        ...(cambios.length ? [`Se perderán: ${cambios.join(', ')}.`] : []),
        'También se quitan las predicciones calculadas y los comprobantes subidos en el ensayo.',
        'La bitácora de auditoría y las demás comunidades no se modifican.',
      ]}
      confirmacionExtra="Entiendo que se perderán los cambios de esta demostración."
      textoConfirmar="Reiniciar demostración" textoProcesando="Reiniciando…" onCerrar={() => setAccion('')} onConfirmar={reiniciar} />}

    {resumen && <Modal title="Demostración preparada" icono={<CheckCircle2 size={22} />} onClose={() => setResumen(null)}>
      <div className="form-stack" role="status">
        <div className="detail-row"><span>Cuotas de {mesVisible(resumen.periodo)}</span><strong>{resumen.cuotas_creadas} nuevas · {resumen.cuotas_existentes} ya existían</strong></div>
        <div className="detail-row"><span>Predicciones (modelo {resumen.modelo}, corte {fechaVisible(resumen.fecha_corte)})</span><strong>{resumen.predicciones}</strong></div>
        <div className="detail-row"><span>Riesgo alto · medio · bajo</span><strong>{resumen.alto} · {resumen.medio} · {resumen.bajo}</strong></div>
        <ul className="demo-escenarios">{resumen.escenarios.map(e => <li key={e.cuenta} className={e.ok ? 'ok' : 'falta'}>{e.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}<span><strong>{e.cuenta}</strong> · {ESPERA[e.espera]}{e.ok ? ': listo' : ' (ya no se cumple)'}</span></li>)}</ul>
        {resumen.avisos.length > 0 && <div className="alert-box"><AlertCircle size={17} aria-hidden="true" /><div><strong>Revisa antes de exponer</strong><ul>{resumen.avisos.map(a => <li key={a}>{a}</li>)}</ul></div></div>}
        <div className="modal-actions"><Link className="button button-secondary" to="/admin/prediccion" onClick={() => setResumen(null)}>Ver predicciones</Link><button type="button" className="button button-primary" onClick={() => setResumen(null)}>Entendido</button></div>
      </div>
    </Modal>}
  </section>
}
