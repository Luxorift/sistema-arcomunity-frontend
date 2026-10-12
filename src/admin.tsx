import { useState, type FormEvent } from 'react'
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, ArrowDownToLine, ArrowRight, Banknote, CalendarDays, Check, CheckCircle2, Clock3, FileText, Filter, ImagePlus, Plus, Printer, RefreshCw, Search, ShieldCheck, Trash2, TrendingUp, UsersRound, XCircle } from 'lucide-react'
import { dinero, estadoVisible, hoy, id, mes, mesVisible, periodoAnterior, type Camara, type Configuracion, type ConceptoEgreso, type TipoCamara, type Unidad } from './model'
import { useApp } from './store'
import { optimizarImagen } from './image'
import { Badge, DateText, Empty, Modal, Money, PageHead, Simulado, Stat } from './ui'

const periodos = Array.from({ length: 12 }, (_, i) => periodoAnterior(mes(), i))
const SelectorMes = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <label className="select-wrap"><CalendarDays size={17} /><select aria-label="Seleccionar mes" value={value} onChange={e => onChange(e.target.value)}>{periodos.map(p => <option value={p} key={p}>{mesVisible(p)}</option>)}</select></label>
const nombreUnidad = (unidades: Unidad[], idUnidad: string) => unidades.find(u => u.id === idUnidad)?.codigo || 'Unidad'

export function Dashboard() {
  const { datos } = useApp(); const [periodo, setPeriodo] = useState(mes())
  const cuotas = datos.cuotas.filter(c => c.periodo === periodo)
  const pagos = datos.pagos.filter(p => p.estado.startsWith('conciliado') && datos.cuotas.some(c => c.id === p.cuotaId && c.periodo === periodo))
  const recaudado = pagos.reduce((n, p) => n + p.monto, 0)
  const egresos = datos.egresos.filter(e => e.fecha.slice(0, 7) === periodo.slice(0, 7)).reduce((n, e) => n + e.monto, 0)
  const pendientes = cuotas.filter(c => c.estado !== 'pagada'); const morosos = pendientes.filter(c => estadoVisible(c) === 'morosa')
  const auto = pagos.filter(p => p.estado === 'conciliado_auto').length
  const minutos = pagos.length ? pagos.reduce((n, p) => n + Math.max(0, (new Date(p.conciliadoEn || p.subidoEn).getTime() - new Date(p.subidoEn).getTime()) / 60000), 0) / pagos.length : 0
  const grafico = [...periodos].reverse().map(p => ({ mes: new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' }).format(new Date(`${p}T12:00:00Z`)), ingresos: datos.pagos.filter(x => x.estado.startsWith('conciliado') && datos.cuotas.some(c => c.id === x.cuotaId && c.periodo === p)).reduce((n, x) => n + x.monto, 0) }))
  return <><PageHead eyebrow="VISIÓN GENERAL" title="Resumen de la junta" description="Un panorama claro de la recaudación y las cuotas vecinales." action={<SelectorMes value={periodo} onChange={setPeriodo} />} />
    <div className="hero-card"><div><div className="hero-label"><span className="hero-pulse" /> Transparencia en tiempo real</div><h2>Una comunidad más<br /><em>organizada y segura.</em></h2><p>Controla cuotas, revisa pagos y comparte resultados con tus vecinos desde un solo lugar.</p></div><div className="hero-illustration"><div className="hero-ring ring-1" /><div className="hero-ring ring-2" /><div className="hero-house">⌂</div><div className="hero-mini"><CheckCircle2 size={18} /> Pagos claros</div></div></div>
    <div className="stats-grid four"><Stat label="Recaudado" value={dinero(recaudado)} note="Pagos conciliados del mes" icon={<TrendingUp size={20} />} tone="lime" /><Stat label="Por cobrar" value={dinero(pendientes.reduce((n, c) => n + c.monto, 0))} note={`${pendientes.length} cuotas pendientes`} icon={<Clock3 size={20} />} /><Stat label="Unidades al día" value={`${cuotas.length ? Math.round(cuotas.filter(c => c.estado === 'pagada').length / cuotas.length * 100) : 0}%`} note={`${morosos.length} morosas de ${cuotas.length}`} icon={<UsersRound size={20} />} /><Stat label="Saldo del mes" value={dinero(recaudado - egresos)} note={`Egresos: ${dinero(egresos)}`} icon={<Banknote size={20} />} /></div>
    <div className="section-grid"><div className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">EVOLUCIÓN</span><h2>Ingresos mensuales</h2></div><span className="panel-muted">Últimos 12 meses</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={grafico} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9eeec" vertical={false} /><XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#8a9b9e', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a9b9e', fontSize: 12 }} /><Tooltip formatter={(value) => dinero(Number(value))} /><Bar dataKey="ingresos" fill="#b8d77b" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      <div className="panel insight-panel"><div className="panel-heading"><div><span className="eyebrow">EFICIENCIA</span><h2>Conciliación</h2></div><ShieldCheck size={24} /></div><div className="big-metric">{pagos.length ? Math.round(auto / pagos.length * 100) : 0}<span>%</span></div><p>de pagos conciliados automáticamente</p><div className="progress-line"><span style={{ width: `${pagos.length ? auto / pagos.length * 100 : 0}%` }} /></div><div className="insight-bottom"><Clock3 size={19} /><div><strong>{minutos.toFixed(1)} min</strong><span>Tiempo promedio por pago</span></div></div></div></div>
    <div className="panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2>Unidades morosas</h2></div><span className="count-pill">{morosos.length} unidades</span></div>{morosos.length ? <div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Periodo</th><th>Vencimiento</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{morosos.map(c => <tr key={c.id}><td className="strong">{nombreUnidad(datos.unidades, c.unidadId)}</td><td>{mesVisible(c.periodo)}</td><td><DateText value={c.vencimiento} /></td><td><Money value={c.monto} /></td><td><Badge estado="morosa" /></td></tr>)}</tbody></table></div> : <Empty title="Sin morosidad" text="No hay cuotas vencidas pendientes en este periodo." />}</div>
  </>
}

export function ConfiguracionPage() {
  const { datos, configurar, guardarCamara, cambiarEstadoCamara, eliminarCamara, mostrar } = useApp()
  const [form, setForm] = useState<Configuracion>(datos.configuracion)
  const [cargando, setCargando] = useState(false)
  const [modalCamara, setModalCamara] = useState<Camara | null>(null)
  const [nombreCamara, setNombreCamara] = useState('')
  const [ubicacionCamara, setUbicacionCamara] = useState('')
  const [tipoCamara, setTipoCamara] = useState<TipoCamara>('simulada')
  const [urlCamara, setUrlCamara] = useState('')

  const submit = (e: FormEvent) => { e.preventDefault(); if (form.cuotaMensual <= 0 || !Number.isFinite(form.cuotaMensual)) return mostrar('Ingresa un monto válido.', 'error'); if (form.diaVencimiento < 1 || form.diaVencimiento > 28) return mostrar('El vencimiento debe estar entre el día 1 y el 28.', 'error'); configurar(form) }
  const qr = async (file?: File) => { if (!file) return; if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) return mostrar('El QR debe ser JPG o PNG de hasta 2 MB.', 'error'); setCargando(true); try { const yapeQr = await optimizarImagen(file, 620); setForm(f => ({ ...f, yapeQr })) } catch { mostrar('No se pudo leer la imagen.', 'error') } finally { setCargando(false) } }

  const abrirNuevaCamara = () => {
    setModalCamara({ id: '', nombre: '', ubicacion: '', tipo: 'simulada', activa: true })
    setNombreCamara('')
    setUbicacionCamara('')
    setTipoCamara('simulada')
    setUrlCamara('')
  }

  const abrirEditarCamara = (c: Camara) => {
    setModalCamara(c)
    setNombreCamara(c.nombre)
    setUbicacionCamara(c.ubicacion)
    setTipoCamara(c.tipo)
    setUrlCamara(c.url || '')
  }

  const guardarModalCamara = (e: FormEvent) => {
    e.preventDefault()
    if (!modalCamara) return
    const error = guardarCamara({
      id: modalCamara.id || id(),
      nombre: nombreCamara,
      ubicacion: ubicacionCamara,
      tipo: tipoCamara,
      url: tipoCamara === 'simulada' ? undefined : urlCamara,
      activa: modalCamara.id ? modalCamara.activa : true
    })
    if (error) mostrar(error, 'error')
    else setModalCamara(null)
  }

  return <><PageHead eyebrow="ADMINISTRACIÓN" title="Configuración" description="Define cómo y cuándo pagan los vecinos, y gestiona las cámaras comunitarias." /><form onSubmit={submit} className="settings-grid"><div className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">DATOS DE LA JUNTA</span><h2>Cuota y vencimiento</h2></div></div><div className="field-grid"><label className="field full"><span>Nombre de la junta</span><input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label><label className="field"><span>Cuota mensual (S/)</span><input required type="number" min="0.01" step="0.01" value={form.cuotaMensual} onChange={e => setForm({ ...form, cuotaMensual: Number(e.target.value) })} /></label><label className="field"><span>Día de vencimiento</span><input required type="number" min="1" max="28" value={form.diaVencimiento} onChange={e => setForm({ ...form, diaVencimiento: Number(e.target.value) })} /></label><label className="field full"><span>Código de invitación</span><input required value={form.codigoInvitacion} onChange={e => setForm({ ...form, codigoInvitacion: e.target.value.toUpperCase() })} /><small>Compártelo solo con propietarios de la junta.</small></label></div><label className="toggle-row"><div><strong>Conciliación automática</strong><small>Los pagos sin alertas se marcan como pagados.</small></div><input type="checkbox" checked={form.conciliacionAutomatica} onChange={e => setForm({ ...form, conciliacionAutomatica: e.target.checked })} /><span className="switch" /></label></div>
    <div className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">MÉTODO DE PAGO</span><h2>QR de Yape</h2></div></div><div className="qr-upload"><div className="qr-preview">{form.yapeQr ? <img src={form.yapeQr} alt="QR de Yape configurado" /> : <div className="qr-placeholder"><ImagePlus size={31} /><span>Aún no hay un QR cargado</span></div>}</div><label className="button button-secondary upload-button"><ImagePlus size={17} /> {cargando ? 'Procesando...' : 'Subir imagen QR'}<input type="file" accept="image/png,image/jpeg" onChange={e => void qr(e.target.files?.[0])} hidden /></label><small>Imagen JPG o PNG, máximo 2 MB.</small></div><label className="field"><span>Nombre del titular</span><input required value={form.yapeTitular} onChange={e => setForm({ ...form, yapeTitular: e.target.value })} placeholder="Nombre que aparece en Yape" /></label><div className="info-callout"><AlertCircle size={18} /><span>Este frontend solo muestra el QR que configures. Nunca confirma transferencias con Yape ni con un banco.</span></div></div><div className="form-actions full-row"><button className="button button-primary" type="submit"><Check size={18} /> Guardar cambios</button></div></form>

    <div className="panel" style={{ marginTop: '24px' }}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">VIDEOVIGILANCIA</span>
          <h2>Cámaras de seguridad</h2>
        </div>
        <button type="button" className="button button-primary" onClick={abrirNuevaCamara}>
          <Plus size={18} /> Nueva cámara
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cámara</th>
              <th>Ubicación</th>
              <th>Tipo</th>
              <th>URL / Origen</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {datos.camaras.map(c => (
              <tr key={c.id}>
                <td className="strong">{c.nombre}</td>
                <td>{c.ubicacion}</td>
                <td><Badge estado={c.tipo === 'simulada' ? 'activa' : 'en_revision'} /> {c.tipo === 'simulada' ? 'Simulada' : c.tipo === 'mjpeg' ? 'MJPEG (img)' : 'Embed (iframe)'}</td>
                <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.url ? <span title={c.url}>{c.url}</span> : <span className="muted">Generador canvas</span>}</td>
                <td><Badge estado={c.activa ? 'activa' : 'inactiva'} /></td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="text-button" onClick={() => abrirEditarCamara(c)}>Editar</button>
                    <button type="button" className="text-button" onClick={() => cambiarEstadoCamara(c.id, !c.activa)}>
                      {c.activa ? 'Desactivar' : 'Activar'}
                    </button>
                    <button type="button" className="text-button danger" onClick={() => { if (window.confirm(`¿Eliminar la cámara "${c.nombre}"?`)) eliminarCamara(c.id) }}>
                      <Trash2 size={15} /> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!datos.camaras.length && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px' }} className="muted">No hay cámaras configuradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {modalCamara && (
      <Modal title={modalCamara.id ? 'Editar cámara' : 'Nueva cámara'} onClose={() => setModalCamara(null)}>
        <form onSubmit={guardarModalCamara} className="form-stack">
          <label className="field">
            <span>Nombre de la cámara</span>
            <input autoFocus required value={nombreCamara} onChange={e => setNombreCamara(e.target.value)} placeholder="Ej.: Ingreso peatonal" />
          </label>
          <label className="field">
            <span>Ubicación</span>
            <input required value={ubicacionCamara} onChange={e => setUbicacionCamara(e.target.value)} placeholder="Ej.: Portón principal / Cocheras" />
          </label>
          <label className="field">
            <span>Tipo de transmisión</span>
            <select value={tipoCamara} onChange={e => setTipoCamara(e.target.value as TipoCamara)}>
              <option value="simulada">Simulada (animación canvas a ~10 fps)</option>
              <option value="mjpeg">Imagen / MJPEG por URL (etiqueta &lt;img&gt;)</option>
              <option value="embed">Embed por URL (iframe sandboxed)</option>
            </select>
          </label>
          {tipoCamara !== 'simulada' && (
            <label className="field">
              <span>URL de transmisión (debe empezar con https://)</span>
              <input required type="url" value={urlCamara} onChange={e => setUrlCamara(e.target.value)} placeholder="https://ejemplo.com/stream" />
              <small>Solo se aceptan URLs seguras HTTPS. Si el sitio bloquea embeberse (X-Frame-Options/CORS), el navegador no la mostrará.</small>
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={() => setModalCamara(null)}>Cancelar</button>
            <button className="button button-primary" type="submit"><Check size={17} /> Guardar cámara</button>
          </div>
        </form>
      </Modal>
    )}
  </>
}

export function UnidadesPage() {
  const { datos, guardarUnidad, desactivarUnidad, mostrar } = useApp(); const [buscar, setBuscar] = useState(''); const [modal, setModal] = useState<Unidad | null>(null); const [codigo, setCodigo] = useState('')
  const lista = datos.unidades.filter(u => u.codigo.toLowerCase().includes(buscar.toLowerCase()))
  const guardar = (e: FormEvent) => { e.preventDefault(); const error = guardarUnidad({ id: modal?.id || id(), codigo, activa: modal?.activa ?? true }); if (error) mostrar(error, 'error'); else setModal(null) }
  return <><PageHead eyebrow="PADRÓN VECINAL" title="Unidades" description="Administra las viviendas que participan en la junta." action={<button className="button button-primary" onClick={() => { setModal({ id: '', codigo: '', activa: true }); setCodigo('') }}><Plus size={18} /> Nueva unidad</button>} /><div className="panel"><div className="table-tools"><label className="search-box"><Search size={18} /><input placeholder="Buscar unidad..." value={buscar} onChange={e => setBuscar(e.target.value)} /></label><span className="count-pill">{datos.unidades.filter(u => u.activa).length} activas</span></div><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Propietario demo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{lista.map(u => <tr key={u.id}><td className="strong">{u.codigo}</td><td>{datos.usuarios.find(x => x.unidadId === u.id)?.nombre || <span className="muted">Sin asignar</span>}</td><td><Badge estado={u.activa ? 'activa' : 'inactiva'} /></td><td><div className="table-actions"><button className="text-button" onClick={() => { setModal(u); setCodigo(u.codigo) }}>Editar</button>{u.activa && <button className="text-button danger" onClick={() => { if (window.confirm(`¿Desactivar ${u.codigo}?`)) desactivarUnidad(u.id) }}>Desactivar</button>}</div></td></tr>)}</tbody></table></div></div>{modal && <Modal title={modal.id ? 'Editar unidad' : 'Nueva unidad'} onClose={() => setModal(null)}><form onSubmit={guardar}><label className="field"><span>Código de la unidad</span><input autoFocus required maxLength={30} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej.: Casa 31" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary"><Check size={17} /> Guardar</button></div></form></Modal>}</>
}

export function CuotasPage() {
  const { datos, generarCuotas, mostrar } = useApp(); const [periodo, setPeriodo] = useState(mes()); const [estado, setEstado] = useState('todas')
  const cuotas = datos.cuotas.filter(c => c.periodo === periodo && (estado === 'todas' || estadoVisible(c) === estado)).sort((a, b) => nombreUnidad(datos.unidades, a.unidadId).localeCompare(nombreUnidad(datos.unidades, b.unidadId)))
  return <><PageHead eyebrow="COBRANZA" title="Cuotas" description="Genera y consulta las cuotas mensuales de cada unidad." action={<button className="button button-primary" onClick={() => { const r = generarCuotas(); mostrar(`${r.creadas} cuotas creadas · ${r.existentes} ya existían.`) }}><Plus size={18} /> Generar cuotas del mes</button>} /><div className="stats-grid three"><Stat label="Cuotas del periodo" value={datos.cuotas.filter(c => c.periodo === periodo).length} icon={<FileText size={20} />} /><Stat label="Pagadas" value={datos.cuotas.filter(c => c.periodo === periodo && c.estado === 'pagada').length} icon={<CheckCircle2 size={20} />} tone="lime" /><Stat label="Por cobrar" value={dinero(datos.cuotas.filter(c => c.periodo === periodo && c.estado !== 'pagada').reduce((n, c) => n + c.monto, 0))} icon={<Clock3 size={20} />} /></div><div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /><label className="select-wrap"><Filter size={17} /><select aria-label="Filtrar estado" value={estado} onChange={e => setEstado(e.target.value)}><option value="todas">Todos los estados</option><option value="pagada">Pagadas</option><option value="pendiente">Pendientes</option><option value="morosa">Morosas</option><option value="en_revision">En revisión</option></select></label></div><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Concepto</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th>Fecha de pago</th></tr></thead><tbody>{cuotas.map(c => <tr key={c.id}><td className="strong">{nombreUnidad(datos.unidades, c.unidadId)}</td><td>Vigilancia</td><td><DateText value={c.vencimiento} /></td><td><Money value={c.monto} /></td><td><Badge estado={estadoVisible(c)} /></td><td><DateText value={c.fechaPago} /></td></tr>)}</tbody></table></div>{!cuotas.length && <Empty title="Sin cuotas" text="No hay cuotas con estos filtros." />}</div></>
}

export function ConciliacionPage() {
  const { datos, revisarPago, mostrar } = useApp(); const [seleccion, setSeleccion] = useState<string | null>(null); const [motivo, setMotivo] = useState(''); const [modo, setModo] = useState<'aprobar' | 'rechazar'>('aprobar')
  const pendientes = datos.pagos.filter(p => p.estado === 'pendiente_revision'); const elegido = pendientes.find(p => p.id === seleccion)
  const revisar = () => { if (!elegido) return; const error = revisarPago(elegido.id, modo === 'aprobar', motivo); if (error) mostrar(error, 'error'); else { setSeleccion(null); setMotivo('') } }
  return <><PageHead eyebrow="CONTROL DE PAGOS" title="Conciliación" description="Revisa los comprobantes que presentan alertas antes de aprobarlos." /><div className="stats-grid two"><Stat label="Pendientes de revisión" value={pendientes.length} note="Requieren decisión del administrador" icon={<AlertCircle size={20} />} tone="coral" /><Stat label="Conciliados automáticamente" value={datos.pagos.filter(p => p.estado === 'conciliado_auto').length} note="Historial de pagos simulados" icon={<ShieldCheck size={20} />} tone="lime" /></div><div className="panel"><div className="panel-heading"><div><span className="eyebrow">COLA DE REVISIÓN</span><h2>Pagos con alertas</h2></div><span className="count-pill">{pendientes.length} por revisar</span></div>{pendientes.length ? <div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Fecha</th><th>Monto</th><th>Operación</th><th>Alerta</th><th></th></tr></thead><tbody>{pendientes.map(p => <tr key={p.id}><td className="strong">{nombreUnidad(datos.unidades, p.unidadId)}</td><td><DateText value={p.fecha} /></td><td><Money value={p.monto} /></td><td>{p.operacion || 'Sin número'}</td><td><span className="alert-tag">{p.alertas.map(x => x.replaceAll('_', ' ')).join(', ')}</span></td><td><button className="text-button" onClick={() => { setSeleccion(p.id); setModo('aprobar') }}>Revisar <ArrowRight size={15} /></button></td></tr>)}</tbody></table></div> : <Empty title="Todo al día" text="No hay pagos esperando revisión manual." />}</div>{elegido && <Modal title="Revisar comprobante" onClose={() => setSeleccion(null)} wide><div className="review-grid"><div className="receipt-view">{elegido.comprobante ? <img src={elegido.comprobante} alt="Comprobante subido por el propietario" /> : <div className="receipt-empty"><FileText size={34} /><span>Pago de semilla sin imagen adjunta</span><small>El dato está marcado como simulado.</small></div>}</div><div className="review-details"><div className="detail-row"><span>Unidad</span><strong>{nombreUnidad(datos.unidades, elegido.unidadId)}</strong></div><div className="detail-row"><span>Monto declarado</span><strong><Money value={elegido.monto} /></strong></div><div className="detail-row"><span>Monto de la cuota</span><strong><Money value={datos.cuotas.find(c => c.id === elegido.cuotaId)?.monto || 0} /></strong></div><div className="detail-row"><span>Fecha de operación</span><strong><DateText value={elegido.fecha} /></strong></div><div className="detail-row"><span>N.º de operación</span><strong>{elegido.operacion || '—'}</strong></div><div className="detail-row"><span>OCR</span><strong>{elegido.ocrConfianza == null ? 'Ingreso manual / semilla' : `${Math.round(elegido.ocrConfianza)}%`}</strong></div><div className="alert-box"><AlertCircle size={17} /><div><strong>Alertas detectadas</strong><p>{elegido.alertas.map(a => a.replaceAll('_', ' ')).join(', ')}</p></div></div><div className="segmented"><button type="button" className={modo === 'aprobar' ? 'selected' : ''} onClick={() => setModo('aprobar')}><Check size={16} /> Aprobar</button><button type="button" className={modo === 'rechazar' ? 'selected' : ''} onClick={() => setModo('rechazar')}><XCircle size={16} /> Rechazar</button></div>{modo === 'rechazar' && <label className="field"><span>Motivo del rechazo *</span><textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Explica al propietario qué debe corregir" rows={3} /></label>}<button className={`button ${modo === 'aprobar' ? 'button-primary' : 'button-danger'} full-width`} onClick={revisar}>{modo === 'aprobar' ? 'Aprobar pago' : 'Rechazar pago'}</button></div></div></Modal>}</>
}

export function PagosPage() {
  const { datos, pagoManual, mostrar } = useApp(); const [modal, setModal] = useState(false); const [cuotaId, setCuotaId] = useState(''); const [monto, setMonto] = useState('150'); const [fecha, setFecha] = useState(hoy()); const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo'); const [operacion, setOperacion] = useState(''); const [periodo, setPeriodo] = useState(mes())
  const lista = datos.pagos.filter(p => datos.cuotas.some(c => c.id === p.cuotaId && c.periodo === periodo)).sort((a, b) => b.subidoEn.localeCompare(a.subidoEn))
  const pendientes = datos.cuotas.filter(c => c.estado === 'pendiente' && c.periodo === mes())
  const submit = (e: FormEvent) => { e.preventDefault(); const error = pagoManual({ cuotaId, monto: Number(monto), fecha, metodo, operacion }); if (error) mostrar(error, 'error'); else { setModal(false); setCuotaId(''); setOperacion('') } }
  return <><PageHead eyebrow="MOVIMIENTOS" title="Pagos" description="Consulta el historial y registra pagos recibidos fuera de la plataforma." action={<button className="button button-primary" onClick={() => setModal(true)}><Plus size={18} /> Registrar pago manual</button>} /><div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /><span className="count-pill">{lista.length} registros</span></div><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Fecha</th><th>Método</th><th>Operación</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{lista.map(p => <tr key={p.id}><td className="strong">{nombreUnidad(datos.unidades, p.unidadId)}</td><td><DateText value={p.fecha} /></td><td>{p.metodo.replaceAll('_', ' ')}</td><td>{p.operacion}</td><td><Money value={p.monto} /></td><td><Badge estado={p.estado} /></td></tr>)}</tbody></table></div></div>{modal && <Modal title="Registrar pago manual" onClose={() => setModal(false)}><form onSubmit={submit} className="form-stack"><label className="field"><span>Cuota pendiente</span><select required value={cuotaId} onChange={e => { setCuotaId(e.target.value); setMonto(String(datos.cuotas.find(c => c.id === e.target.value)?.monto || 150)) }}><option value="">Selecciona una unidad</option>{pendientes.map(c => <option key={c.id} value={c.id}>{nombreUnidad(datos.unidades, c.unidadId)} · {mesVisible(c.periodo)}</option>)}</select></label><div className="field-grid"><label className="field"><span>Monto (S/)</span><input type="number" min="0.01" step="0.01" required value={monto} onChange={e => setMonto(e.target.value)} /></label><label className="field"><span>Fecha</span><input type="date" max={hoy()} required value={fecha} onChange={e => setFecha(e.target.value)} /></label></div><label className="field"><span>Método</span><select value={metodo} onChange={e => setMetodo(e.target.value as 'efectivo' | 'transferencia')}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label><label className="field"><span>N.º de operación (opcional para efectivo)</span><input value={operacion} onChange={e => setOperacion(e.target.value)} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Registrar pago</button></div></form></Modal>}</>
}

export function EgresosPage() {
  const { datos, registrarEgreso, mostrar } = useApp(); const [modal, setModal] = useState(false); const [fecha, setFecha] = useState(hoy()); const [concepto, setConcepto] = useState<ConceptoEgreso>('pago_vigilante'); const [beneficiario, setBeneficiario] = useState(''); const [monto, setMonto] = useState(''); const [comentario, setComentario] = useState(''); const [periodo, setPeriodo] = useState(mes())
  const lista = datos.egresos.filter(e => e.fecha.slice(0, 7) === periodo.slice(0, 7))
  const submit = (e: FormEvent) => { e.preventDefault(); if (Number(monto) <= 0) return mostrar('Ingresa un monto válido.', 'error'); registrarEgreso({ fecha, concepto, beneficiario: beneficiario.trim(), monto: Number(monto), comentario: comentario.trim() }); setModal(false); setBeneficiario(''); setMonto(''); setComentario('') }
  return <><PageHead eyebrow="GASTOS DE LA JUNTA" title="Egresos" description="Registra y consulta los pagos de vigilancia y otros gastos." action={<button className="button button-primary" onClick={() => setModal(true)}><Plus size={18} /> Nuevo egreso</button>} /><div className="stats-grid two"><Stat label="Total de egresos" value={dinero(lista.reduce((n, e) => n + e.monto, 0))} note={mesVisible(periodo)} icon={<Banknote size={20} />} /><Stat label="Movimientos" value={lista.length} note="Incluye registros simulados" icon={<FileText size={20} />} /></div><div className="panel"><div className="table-tools"><SelectorMes value={periodo} onChange={setPeriodo} /></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Beneficiario</th><th>Comentario</th><th>Monto</th></tr></thead><tbody>{lista.map(e => <tr key={e.id}><td><DateText value={e.fecha} /></td><td>{e.concepto.replaceAll('_', ' ')}</td><td className="strong">{e.beneficiario}</td><td>{e.comentario || '—'}</td><td><Money value={e.monto} /></td></tr>)}</tbody></table></div></div>{modal && <Modal title="Nuevo egreso" onClose={() => setModal(false)}><form onSubmit={submit} className="form-stack"><div className="field-grid"><label className="field"><span>Fecha</span><input type="date" required max={hoy()} value={fecha} onChange={e => setFecha(e.target.value)} /></label><label className="field"><span>Monto (S/)</span><input type="number" required min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} /></label></div><label className="field"><span>Concepto</span><select value={concepto} onChange={e => setConcepto(e.target.value as ConceptoEgreso)}><option value="pago_vigilante">Pago al personal de vigilancia</option><option value="insumos">Insumos</option><option value="otros">Otros</option></select></label><label className="field"><span>Beneficiario</span><input required value={beneficiario} onChange={e => setBeneficiario(e.target.value)} placeholder="Nombre o referencia" /></label><label className="field"><span>Comentario (opcional)</span><textarea rows={3} value={comentario} onChange={e => setComentario(e.target.value)} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Guardar egreso</button></div></form></Modal>}</>
}

function exportarCsv(datos: ReturnType<typeof useApp>['datos']) {
  const encabezado = ['unidad_ref','periodo','monto','fecha_vencimiento','fecha_pago','dias_atraso','metodo_pago','pagos_atrasados_previos','moroso','es_simulado']
  const filas = datos.cuotas.slice().sort((a, b) => a.unidadId.localeCompare(b.unidadId) || a.periodo.localeCompare(b.periodo)).map(c => {
    const pago = datos.pagos.find(p => p.id === c.pagoId)
    const dias = c.fechaPago ? Math.max(0, Math.round((new Date(c.fechaPago).getTime() - new Date(c.vencimiento).getTime()) / 86400000)) : 0
    const previas = datos.cuotas.filter(x => x.unidadId === c.unidadId && x.periodo < c.periodo && x.periodo >= periodoAnterior(c.periodo, 3) && x.fechaPago && x.fechaPago > x.vencimiento).length
    return [`U${c.unidadId.replace(/\D/g, '').padStart(3, '0')}`, c.periodo, c.monto.toFixed(2), c.vencimiento, c.fechaPago || '', dias, pago?.metodo || '', previas, dias > 0 || (!c.fechaPago && c.vencimiento < hoy()) ? 1 : 0, c.esSimulado ? 1 : 0]
  })
  const csv = '\uFEFF' + [encabezado, ...filas].map(row => row.join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'arcomunity_dataset_morosidad_simulado.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportarExcel(datos: ReturnType<typeof useApp>['datos'], alTerminar?: () => void) {
  try {
    const ExcelJS = await import('exceljs')
    const WorkbookClass = ExcelJS.Workbook || (ExcelJS as unknown as { default: { Workbook: typeof ExcelJS.Workbook } }).default?.Workbook
    const wb = new WorkbookClass()
    wb.creator = 'Arcomunity S.A.C.'
    wb.created = new Date()

    // Hoja 1: Dataset
    const ws = wb.addWorksheet('Dataset', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    })

    ws.columns = [
      { header: 'Unidad', key: 'unidad', width: 14 },
      { header: 'Periodo', key: 'periodo', width: 15 },
      { header: 'Monto (S/)', key: 'monto', width: 16 },
      { header: 'Fecha de vencimiento', key: 'fecha_vencimiento', width: 24 },
      { header: 'Fecha de pago', key: 'fecha_pago', width: 18 },
      { header: 'Días de atraso', key: 'dias_atraso', width: 16 },
      { header: 'Método de pago', key: 'metodo_pago', width: 18 },
      { header: 'Atrasos previos (3 meses)', key: 'pagos_atrasados_previos', width: 28 },
      { header: 'Moroso (1 = sí)', key: 'moroso', width: 18 },
      { header: 'Simulado', key: 'es_simulado', width: 14 }
    ]

    const headerRow = ws.getRow(1)
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173942' }
    }

    const cuotasOrdenadas = datos.cuotas.slice().sort((a, b) => a.unidadId.localeCompare(b.unidadId) || a.periodo.localeCompare(b.periodo))

    cuotasOrdenadas.forEach(c => {
      const pago = datos.pagos.find(p => p.id === c.pagoId)
      const dias = c.fechaPago ? Math.max(0, Math.round((new Date(c.fechaPago).getTime() - new Date(c.vencimiento).getTime()) / 86400000)) : 0
      const previas = datos.cuotas.filter(x => x.unidadId === c.unidadId && x.periodo < c.periodo && x.periodo >= periodoAnterior(c.periodo, 3) && x.fechaPago && x.fechaPago > x.vencimiento).length
      const esMoroso = dias > 0 || (!c.fechaPago && c.vencimiento < hoy()) ? 1 : 0

      const [vy, vm, vd] = c.vencimiento.split('-').map(Number)
      const fechaVencDate = new Date(Date.UTC(vy, vm - 1, vd, 12, 0, 0))

      let fechaPagoDate: Date | null = null
      if (c.fechaPago) {
        const [py, pm, pd] = c.fechaPago.split('-').map(Number)
        fechaPagoDate = new Date(Date.UTC(py, pm - 1, pd, 12, 0, 0))
      }

      const row = ws.addRow({
        unidad: `U${c.unidadId.replace(/\D/g, '').padStart(3, '0')}`,
        periodo: c.periodo,
        monto: Number(c.monto),
        fecha_vencimiento: fechaVencDate,
        fecha_pago: fechaPagoDate,
        dias_atraso: dias,
        metodo_pago: pago?.metodo || '—',
        pagos_atrasados_previos: previas,
        moroso: esMoroso,
        es_simulado: c.esSimulado ? 1 : 0
      })

      row.getCell(3).numFmt = '#,##0.00'
      row.getCell(4).numFmt = 'dd/mm/yyyy'
      if (fechaPagoDate) row.getCell(5).numFmt = 'dd/mm/yyyy'

      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(2).alignment = { horizontal: 'center' }
      row.getCell(4).alignment = { horizontal: 'center' }
      row.getCell(5).alignment = { horizontal: 'center' }
      row.getCell(6).alignment = { horizontal: 'center' }
      row.getCell(8).alignment = { horizontal: 'center' }
      row.getCell(9).alignment = { horizontal: 'center' }
      row.getCell(10).alignment = { horizontal: 'center' }

      if (esMoroso === 1) {
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEBEB' }
          }
        })
      }
    })

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: cuotasOrdenadas.length + 1, column: 10 }
    }

    // Hoja 2: Diccionario de datos
    const wsDic = wb.addWorksheet('Diccionario de datos', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    })

    wsDic.columns = [
      { header: 'Campo', key: 'campo', width: 28 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
      { header: 'Tipo', key: 'tipo', width: 18 },
      { header: 'Ejemplo', key: 'ejemplo', width: 28 }
    ]

    const dicHeader = wsDic.getRow(1)
    dicHeader.height = 28
    dicHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    dicHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    dicHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173942' }
    }

    const diccionario = [
      { campo: 'Unidad', descripcion: 'Código anonimizado de la vivienda vecinal', tipo: 'Texto', ejemplo: 'U001' },
      { campo: 'Periodo', descripcion: 'Primer día del mes facturado (AAAA-MM-01)', tipo: 'Texto', ejemplo: '2026-10-01' },
      { campo: 'Monto (S/)', descripcion: 'Importe de la cuota mensual en soles', tipo: 'Numérico (2 decimales)', ejemplo: '150.00' },
      { campo: 'Fecha de vencimiento', descripcion: 'Fecha límite de pago de la cuota', tipo: 'Fecha (dd/mm/aaaa)', ejemplo: '10/10/2026' },
      { campo: 'Fecha de pago', descripcion: 'Fecha de cancelación efectiva (vacío si no pagó)', tipo: 'Fecha (dd/mm/aaaa)', ejemplo: '08/10/2026' },
      { campo: 'Días de atraso', descripcion: 'Días transcurridos entre vencimiento y pago', tipo: 'Entero (≥ 0)', ejemplo: '0' },
      { campo: 'Método de pago', descripcion: 'Canal de pago utilizado', tipo: 'Texto', ejemplo: 'yape_qr, yape_captura, efectivo' },
      { campo: 'Atrasos previos (3 meses)', descripcion: 'Cuotas pagadas con retraso en los 3 meses anteriores', tipo: 'Entero (≥ 0)', ejemplo: '0' },
      { campo: 'Moroso (1 = sí)', descripcion: 'Variable objetivo del modelo predictivo (APF3)', tipo: 'Binario (0 o 1)', ejemplo: '1' },
      { campo: 'Simulado', descripcion: 'Indicador de datos sintéticos de demostración', tipo: 'Binario (0 o 1)', ejemplo: '1' }
    ]

    diccionario.forEach(d => {
      const r = wsDic.addRow(d)
      r.getCell(1).font = { bold: true }
      r.getCell(3).alignment = { horizontal: 'center' }
    })

    wsDic.addRow({})
    const rNota = wsDic.addRow({
      campo: 'NOTA:',
      descripcion: 'Los datos son 100 % simulados para fines académicos de demostración. La columna «Moroso (1 = sí)» constituye la variable objetivo para el entrenamiento del modelo de clasificación en APF3.'
    })
    rNota.font = { italic: true, color: { argb: 'FF555555' } }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arcomunity_dataset_morosidad.xlsx'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    alTerminar?.()
  }
}

export function ReportesPage() {
  const { datos } = useApp(); const [periodo, setPeriodo] = useState(mes()); const [exportandoExcel, setExportandoExcel] = useState(false)
  const cuotas = datos.cuotas.filter(c => c.periodo === periodo)
  const ingresos = datos.pagos.filter(p => p.estado.startsWith('conciliado') && cuotas.some(c => c.id === p.cuotaId)).reduce((n, p) => n + p.monto, 0)
  const egresos = datos.egresos.filter(e => e.fecha.slice(0, 7) === periodo.slice(0, 7)).reduce((n, e) => n + e.monto, 0)
  return <><PageHead eyebrow="RENDICIÓN DE CUENTAS" title="Reporte mensual" description="Información lista para compartir con la junta." action={<div className="button-group"><button className="button button-secondary" onClick={() => window.print()}><Printer size={17} /> Imprimir / PDF</button><button className="button button-secondary" disabled={exportandoExcel} onClick={() => { setExportandoExcel(true); void exportarExcel(datos, () => setExportandoExcel(false)) }}><FileText size={17} /> {exportandoExcel ? 'Generando Excel...' : 'Exportar Excel (.xlsx)'}</button><button className="button button-primary" onClick={() => exportarCsv(datos)}><ArrowDownToLine size={17} /> Exportar CSV (datos)</button></div>} /><div className="report-page"><div className="report-header"><div><span className="eyebrow">ARCOMUNITY · REPORTE SIMULADO</span><h2>Resumen de {mesVisible(periodo)}</h2><p>Junta Vecinal Arcomunity — Piloto</p></div><SelectorMes value={periodo} onChange={setPeriodo} /></div><div className="stats-grid three"><Stat label="Ingresos conciliados" value={dinero(ingresos)} icon={<TrendingUp size={19} />} tone="lime" /><Stat label="Egresos" value={dinero(egresos)} icon={<Banknote size={19} />} /><Stat label="Saldo" value={dinero(ingresos - egresos)} icon={<CheckCircle2 size={19} />} /></div><div className="panel report-table"><div className="panel-heading"><div><span className="eyebrow">DETALLE</span><h2>Estado por unidad</h2></div><Simulado /></div><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Monto</th><th>Vencimiento</th><th>Estado</th><th>Fecha de pago</th></tr></thead><tbody>{cuotas.map(c => <tr key={c.id}><td className="strong">{nombreUnidad(datos.unidades, c.unidadId)}</td><td><Money value={c.monto} /></td><td><DateText value={c.vencimiento} /></td><td><Badge estado={estadoVisible(c)} /></td><td><DateText value={c.fechaPago} /></td></tr>)}</tbody></table></div></div><p className="report-foot">Este reporte usa exclusivamente datos simulados para una demostración académica. El dataset incluye las 30 unidades y 12 meses del piloto.</p></div></>
}
export function AuditoriaPage() {
  const { datos, reiniciar } = useApp(); return <><PageHead eyebrow="TRAZABILIDAD" title="Bitácora de auditoría" description="Registro de las acciones realizadas en esta demostración." action={<button className="button button-secondary" onClick={() => { if (window.confirm('¿Restablecer todos los datos simulados y cerrar la sesión?')) reiniciar() }}><RefreshCw size={17} /> Restablecer demo</button>} /><div className="panel"><div className="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{datos.auditoria.map(a => <tr key={a.id}><td>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.fecha))}</td><td className="strong">{a.usuario}</td><td><span className="audit-action">{a.accion.replaceAll('_', ' ')}</span></td><td>{a.detalle}</td></tr>)}</tbody></table></div></div></> }
