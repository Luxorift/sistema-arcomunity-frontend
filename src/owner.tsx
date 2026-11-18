import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Camera, CheckCircle2, Clock3, Copy, CreditCard, Home, ImageUp, LockKeyhole, ReceiptText, ScanText, ShieldCheck, Sparkles, UploadCloud, Wallet, XCircle } from 'lucide-react'
import { dinero, estadoVisible, fechaVisible, hoy, mes, mesVisible, periodoAnterior, type Camara } from './model'
import { useApp, type OcrExtraido, type PagoEntrada, type ResultadoPago } from './store'
import { useRpc } from './lib/usarRpc'
import { dataUrlABlob, optimizarImagen } from './image'
import { extraerDatosComprobante } from './lib/ocr'
import { Badge, Cargando, Empty, PageHead, Simulado, Stat } from './ui'
import { Saludo } from './saludo'

const periodos = Array.from({ length: 12 }, (_, i) => periodoAnterior(mes(), i))
const textoAlertaVecino: Record<string, string> = {
  monto_no_coincide: 'El monto no coincide con tu cuota.',
  operacion_duplicada: 'Ese número de operación ya se registró antes.',
  fecha_fuera_de_periodo: 'La fecha de la operación es anterior al periodo de la cuota.',
  datos_incompletos: 'La lectura automática de la imagen no fue confiable.',
  comprobante_repetido: 'Esa imagen ya se usó en otro pago.',
  revision_manual_configurada: 'La junta revisa todos los pagos manualmente.',
}
const metodoVisible: Record<string, string> = { yape_qr: 'Yape', yape_captura: 'Yape', plin_captura: 'Plin', efectivo: 'Efectivo', transferencia: 'Transferencia' }

// ---------------------------------------------------------------------------------------------
// Videovigilancia (cámaras simuladas para la demostración; sin grabación)
// ---------------------------------------------------------------------------------------------
function SimuladaCanvas({ camara }: { camara: Camara }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let animId = 0
    let ultimo = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let barrido = 0
    const dibujar = (t: number) => {
      animId = requestAnimationFrame(dibujar)
      if (t - ultimo < (reducirMovimiento ? 1000 : 100)) return
      ultimo = t
      const w = canvas.width, h = canvas.height
      ctx.fillStyle = '#0b1619'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#183136'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      ctx.fillStyle = '#1c393f'
      if (/ingreso|puerta|peatonal/i.test(`${camara.nombre} ${camara.ubicacion}`)) {
        ctx.fillRect(w * 0.25, h * 0.35, w * 0.5, h * 0.65); ctx.fillStyle = '#284e56'; ctx.fillRect(w * 0.35, h * 0.45, w * 0.3, h * 0.55)
      } else {
        ctx.beginPath(); ctx.moveTo(w * 0.1, h); ctx.lineTo(w * 0.4, h * 0.4); ctx.lineTo(w * 0.6, h * 0.4); ctx.lineTo(w * 0.9, h); ctx.fill()
      }
      if (!reducirMovimiento) { barrido = (barrido + 3) % h; ctx.fillStyle = 'rgba(215, 235, 150, 0.05)'; ctx.fillRect(0, barrido, w, 6) }
      ctx.fillStyle = '#bce2a4'; ctx.font = 'bold 12px monospace'
      ctx.fillText(`CAM: ${camara.nombre.toUpperCase()}`, 30, 40); ctx.fillText(`LOC: ${camara.ubicacion.toUpperCase()}`, 30, 58)
      const ahora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium' }).format(new Date())
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px monospace'; ctx.fillText(ahora, w - 200, 40)
      ctx.fillStyle = '#efab80'; ctx.font = 'bold 10px monospace'; ctx.fillText('SIMULACIÓN · SIN GRABACIÓN', w - 200, 58)
    }
    animId = requestAnimationFrame(dibujar)
    return () => cancelAnimationFrame(animId)
  }, [camara])
  return <canvas ref={canvasRef} width={640} height={360} role="img" aria-label={`Transmisión simulada de ${camara.nombre}`} />
}

export function VideovigilanciaPage() {
  const { datos, registrarVistaCamaras } = useApp()
  const activas = datos.camaras.filter(c => c.activa)
  const registrado = useRef(false)
  useEffect(() => {
    if (registrado.current) return
    registrado.current = true
    registrarVistaCamaras(`Panel de videovigilancia (${activas.length} cámaras activas)`)
  }, [activas.length, registrarVistaCamaras])

  return <>
    <PageHead eyebrow="Seguridad" title="Videovigilancia comunitaria" description="Vista de demostración con cámaras simuladas de zonas comunes." />
    <div className="notice"><ShieldCheck size={20} /><div><strong>Solo zonas comunes · sin grabaciones</strong><p>Las imágenes se usan únicamente para la seguridad de áreas comunes (Ley N.º 29733). Cada acceso queda registrado en la auditoría.</p></div></div>
    {activas.length ? <div className="cameras-grid">{activas.map(cam => <div key={cam.id} className="camera-card">
      <div className="camera-card-head"><div><h2>{cam.nombre}</h2><small>{cam.ubicacion}</small></div><span className="camera-type">{cam.tipo === 'simulada' ? 'Simulada' : 'URL externa'}</span></div>
      <div className="camera-feed">{cam.tipo === 'simulada' && <span className="camera-live-badge"><span className="camera-live-dot" /> SIMULADO</span>}
        {cam.tipo === 'simulada' && <SimuladaCanvas camara={cam} />}
        {cam.tipo === 'mjpeg' && <img src={cam.url} alt={`Transmisión de ${cam.nombre}`} referrerPolicy="no-referrer" onError={e => { (e.target as HTMLElement).style.display = 'none' }} />}
        {cam.tipo === 'embed' && <iframe src={cam.url} title={cam.nombre} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" loading="lazy" />}
      </div></div>)}</div>
      : <Empty title="Sin cámaras activas" text="La administración aún no habilitó cámaras." />}
  </>
}

// ---------------------------------------------------------------------------------------------
// Mi cuenta
// ---------------------------------------------------------------------------------------------
export function MiCuenta() {
  const { datos, usuario, datosListos } = useApp()
  const cuotas = [...datos.cuotas].sort((a, b) => b.periodo.localeCompare(a.periodo))
  const porPagar = cuotas.filter(c => c.estado === 'pendiente')
  const vencidas = porPagar.filter(c => estadoVisible(c) === 'morosa')
  const enRevision = cuotas.filter(c => c.estado === 'en_revision')
  const rechazos = datos.pagos.filter(p => p.estado === 'rechazado' && porPagar.some(c => c.id === p.cuotaId))
  const ultimoRechazo = rechazos.sort((a, b) => (b.revisadoEn ?? '').localeCompare(a.revisadoEn ?? ''))[0]
  const proxima = [...porPagar].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0]
  const deuda = porPagar.reduce((n, c) => n + c.monto, 0)

  if (!datosListos) return <Cargando texto="Cargando tu estado de cuenta…" />
  return <>
    <Saludo subtitulo={`${usuario?.unidadCodigo ?? 'Sin unidad'} · ${datos.configuracion.nombre}`} />
    {ultimoRechazo && <div className="notice notice-danger" role="alert"><XCircle size={20} /><div><strong>La junta observó tu pago</strong><p>{ultimoRechazo.motivoRechazo}. Puedes volver a enviarlo desde la cuota.</p></div></div>}

    <div className={`status-hero ${vencidas.length ? 'status-hero-alert' : porPagar.length ? 'status-hero-pending' : 'status-hero-ok'}`}>
      <div className="status-hero-icon">{vencidas.length ? <AlertCircle size={28} /> : porPagar.length ? <Clock3 size={28} /> : <CheckCircle2 size={28} />}</div>
      <div className="status-hero-text">
        <span>{vencidas.length ? (vencidas.length === 1 ? 'Tienes una cuota vencida' : `Tienes ${vencidas.length} cuotas vencidas`) : porPagar.length ? 'Cuota por pagar' : 'Estás al día'}</span>
        <strong>{porPagar.length ? dinero(deuda) : '¡Gracias por contribuir!'}</strong>
        <p>{proxima ? (proxima.vencimiento < hoy() ? `Venció el ${fechaVisible(proxima.vencimiento)}. Págala cuanto antes.` : `${porPagar.length === 1 ? 'Vence' : 'La próxima vence'} el ${fechaVisible(proxima.vencimiento)}.`) : enRevision.length ? 'Tu último pago está en revisión.' : 'No tienes cuotas pendientes.'}</p>
      </div>
      {proxima && <Link className="button button-primary" to={`/pagar/${proxima.id}`}>Pagar ahora <ArrowRight size={17} /></Link>}
    </div>

    <div className="stats-grid three">
      <Stat label="Cuota mensual" value={dinero(datos.configuracion.cuotaMensual)} note={`Vence el día ${datos.configuracion.diaVencimiento} de cada mes`} icon={<CreditCard size={20} />} tone="lime" />
      <Stat label="En revisión" value={enRevision.length} note="Comprobantes enviados" icon={<Clock3 size={20} />} />
      <Stat label="Pagadas" value={cuotas.filter(c => c.estado === 'pagada').length} note="Últimos 12 meses" icon={<CheckCircle2 size={20} />} />
    </div>

    <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Tus cuotas</span><h2>Estado de cuenta</h2></div><Simulado /></div>
      {cuotas.length ? <div className="owner-quotas">{cuotas.map(c => <div className="owner-quota" key={c.id}>
        <div className="quota-calendar"><span>{mesVisible(c.periodo).split(' ')[0].slice(0, 3)}</span><small>{c.periodo.slice(0, 4)}</small></div>
        <div className="quota-main"><strong>Vigilancia · {mesVisible(c.periodo)}</strong><span>Vence: {fechaVisible(c.vencimiento)}{c.fechaPago ? ` · Pagada: ${fechaVisible(c.fechaPago)}` : ''}</span></div>
        <div className="quota-amount"><strong>{dinero(c.monto)}</strong><Badge estado={estadoVisible(c)} /></div>
        {c.estado === 'pendiente' && <Link className="button button-primary" to={`/pagar/${c.id}`}>Pagar <ArrowRight size={17} /></Link>}
      </div>)}</div> : <Empty title="Sin cuotas todavía" text="La administración aún no generó tus cuotas." />}
    </div>

    <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Historial</span><h2>Mis pagos enviados</h2></div><ReceiptText size={22} /></div>
      {datos.pagos.length ? <div className="table-wrap"><table><thead><tr><th>Cuota</th><th>Fecha</th><th>Medio</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{datos.pagos.map(p => { const c = datos.cuotas.find(x => x.id === p.cuotaId); return <tr key={p.id}><td className="strong">{c ? mesVisible(c.periodo) : '—'}</td><td>{fechaVisible(p.fecha)}</td><td>{metodoVisible[p.metodo] ?? p.metodo}</td><td>{dinero(p.monto)}</td><td><Badge estado={p.estado} />{p.motivoRechazo && <small className="cell-note">{p.motivoRechazo}</small>}</td></tr> })}</tbody></table></div>
        : <Empty title="Aún no enviaste pagos" text="Cuando pagues una cuota, verás aquí su estado." />}
    </div>
  </>
}

// ---------------------------------------------------------------------------------------------
// Pago guiado en 3 pasos (mejora de usabilidad identificada en APF2: H3 = 73 %)
// ---------------------------------------------------------------------------------------------
function comprobanteEjemplo(monto: number, operacion: string): string {
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 440
  const c = canvas.getContext('2d')!
  c.fillStyle = '#fbfcfa'; c.fillRect(0, 0, 600, 440)
  c.fillStyle = '#173942'; c.font = 'bold 30px Arial'; c.fillText('COMPROBANTE DE MUESTRA', 32, 65)
  c.font = '19px Arial'; c.fillText('SIMULADO · NO ES UN PAGO REAL', 32, 104)
  c.fillStyle = '#d8e6d9'; c.fillRect(32, 135, 536, 2)
  c.fillStyle = '#173942'; c.font = '24px Arial'
  c.fillText(`Monto: S/ ${monto.toFixed(2)}`, 32, 202); c.fillText(`Fecha: ${fechaVisible(hoy())}`, 32, 253); c.fillText(`Operación: ${operacion}`, 32, 304)
  c.font = '16px Arial'; c.fillText('Imagen generada para la demostración.', 32, 385)
  return canvas.toDataURL('image/jpeg', 0.8)
}

function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  const pasos = ['Paga', 'Sube la captura', 'Confirma']
  return <ol className="stepper" aria-label="Pasos para informar tu pago">{pasos.map((p, i) => <li key={p} className={i + 1 < actual ? 'done' : i + 1 === actual ? 'current' : ''} aria-current={i + 1 === actual ? 'step' : undefined}><span>{i + 1 < actual ? <CheckCircle2 size={16} /> : i + 1}</span>{p}</li>)}</ol>
}

export function PagarPage() {
  const { cuotaId } = useParams()
  const { datos, enviarPago, mostrar, datosListos } = useApp()
  const cuota = datos.cuotas.find(c => c.id === cuotaId)
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [imagen, setImagen] = useState('')
  const [nombreImagen, setNombreImagen] = useState('')
  const [form, setForm] = useState({ monto: '', fecha: '', operacion: '', metodo: 'yape_captura' as PagoEntrada['metodo'] })
  const [confianza, setConfianza] = useState<number | undefined>()
  const [ocrExtraido, setOcrExtraido] = useState<OcrExtraido | undefined>()
  const [progreso, setProgreso] = useState(0)
  const [leyendo, setLeyendo] = useState(false)
  const [avisoOcr, setAvisoOcr] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<ResultadoPago | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => { topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [paso, resultado])

  if (!cuota) return !datosListos ? <Cargando /> : <Empty title="Cuota no encontrada" text="Esta cuota no existe o no pertenece a tu unidad." action={<Link className="button button-primary" to="/mi-cuenta">Volver a mi cuenta</Link>} />

  if (resultado) {
    const ok = resultado.estado === 'conciliado_auto'
    return <div ref={topRef} className="payment-result">
      <div className={`result-icon ${ok ? 'result-ok' : 'result-review'}`}>{ok ? <CheckCircle2 size={44} /> : <Clock3 size={44} />}</div>
      <h1>{ok ? '¡Gracias! Tu pago quedó registrado' : 'Recibimos tu comprobante'}</h1>
      <p>{ok ? `Tu cuota de ${mesVisible(cuota.periodo)} figura como pagada. Los datos coinciden con las reglas de la junta; la administración puede verificarlo en su app.` : 'La administración lo revisará pronto. Te avisaremos aquí si necesita algo más.'}</p>
      {!ok && resultado.alertas.length > 0 && <div className="alert-box"><AlertCircle size={17} /><div><strong>Por qué pasa a revisión</strong><ul>{resultado.alertas.map(a => <li key={a}>{textoAlertaVecino[a] ?? a}</li>)}</ul></div></div>}
      <Link className="button button-primary" to="/mi-cuenta">Volver a mi cuenta</Link>
    </div>
  }

  if (cuota.estado !== 'pendiente') return <><div className="back-line"><Link to="/mi-cuenta"><ArrowLeft size={17} /> Volver a mi cuenta</Link></div><Empty title={cuota.estado === 'pagada' ? 'Esta cuota ya está pagada' : 'Esta cuota tiene un pago en revisión'} text="No necesitas enviar otro comprobante." action={<Link className="button button-primary" to="/mi-cuenta">Volver</Link>} /></>

  const cargarArchivo = async (file?: File) => {
    if (!file) return
    setError(''); setAvisoOcr('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Formato no permitido. Sube una imagen JPG, PNG o WEBP (no PDF).')
    if (file.size > 5 * 1024 * 1024) return setError('La imagen pesa más de 5 MB. Toma una captura de pantalla en lugar de una foto.')
    try {
      setImagen(await optimizarImagen(file, 1200)); setNombreImagen(file.name)
    } catch { return setError('No pudimos abrir la imagen. Intenta con otra captura.') }
    setConfianza(undefined); setOcrExtraido(undefined)
    if (!navigator.onLine) { setAvisoOcr('Sin internet no podemos leer la imagen automáticamente. Escribe los datos en el siguiente paso.'); return }
    setLeyendo(true); setProgreso(0)
    try {
      const r = await extraerDatosComprobante(file, setProgreso)
      setConfianza(r.confianza)
      const hay = Boolean(r.monto || r.fecha || r.operacion)
      setOcrExtraido(hay ? { monto: r.monto || undefined, fecha: r.fecha || undefined, operacion: r.operacion || undefined } : undefined)
      setForm(f => ({ ...f, monto: r.monto || f.monto, fecha: r.fecha || f.fecha, operacion: r.operacion || f.operacion }))
      setAvisoOcr(hay ? 'Leímos algunos datos de tu captura. Revísalos en el siguiente paso.' : 'No pudimos leer la imagen. Escribe los datos en el siguiente paso.')
    } catch {
      setAvisoOcr('No pudimos leer la imagen automáticamente. Escribe los datos en el siguiente paso.')
    } finally { setLeyendo(false) }
  }
  const usarEjemplo = () => {
    const op = `DEMO${Date.now().toString().slice(-8)}`
    setImagen(comprobanteEjemplo(cuota.monto, op)); setNombreImagen('comprobante_ejemplo_simulado.jpg')
    setForm(f => ({ ...f, monto: cuota.monto.toFixed(2), fecha: hoy(), operacion: op })); setConfianza(undefined); setOcrExtraido(undefined)
    setAvisoOcr('Cargamos un comprobante de ejemplo (simulado). Revisa los datos en el siguiente paso.')
  }
  const montoDistinto = form.monto !== '' && Math.round(Number(form.monto) * 100) !== Math.round(cuota.monto * 100)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    if (!imagen) { setPaso(2); return setError('Adjunta la captura de tu pago.') }
    if (!/^\d+(\.\d{1,2})?$/.test(form.monto) || Number(form.monto) <= 0) return setError('Ingresa el monto pagado (por ejemplo 150 o 150.00).')
    if (!form.fecha) return setError('Indica la fecha de la operación.')
    if (form.fecha > hoy()) return setError('La fecha no puede ser futura.')
    if (!/^[A-Za-z0-9-]{4,30}$/.test(form.operacion.trim())) return setError('Escribe el número de operación tal como aparece en la captura (4 a 30 letras o números).')
    setEnviando(true)
    try {
      const r = await enviarPago({ cuotaId: cuota.id, metodo: form.metodo, monto: Number(form.monto), fecha: form.fecha, operacion: form.operacion.trim(), archivo: await dataUrlABlob(imagen), ocrConfianza: confianza, ocrExtraido })
      if (r.ok) setResultado(r.data)
      else { setError(r.error); mostrar(r.error, 'error') }
    } finally { setEnviando(false) }
  }

  return <div ref={topRef}>
    <div className="back-line"><Link to="/mi-cuenta"><ArrowLeft size={17} /> Volver a mi cuenta</Link></div>
    <PageHead eyebrow="Pago de cuota" title={`Cuota de ${mesVisible(cuota.periodo)}`} description={`${dinero(cuota.monto)} · vence el ${fechaVisible(cuota.vencimiento)}`} />
    <Pasos actual={paso} />

    {paso === 1 && <div className="panel payment-card">
      <div className="step-heading"><span>1</span><div><h2>Paga desde tu app</h2><p>Abre Yape o Plin, escanea el QR y paga el monto exacto.</p></div></div>
      <div className="payment-amount"><span>Monto a pagar</span><strong>{dinero(cuota.monto)}</strong>
        <button type="button" className="text-button" onClick={() => { void navigator.clipboard?.writeText(cuota.monto.toFixed(2)); mostrar('Monto copiado.', 'info') }}><Copy size={15} /> Copiar monto</button></div>
      <div className="pay-qr">{datos.configuracion.yapeQr ? <img src={datos.configuracion.yapeQr} alt="Código QR de Yape de la junta" /> : <div className="qr-placeholder"><Camera size={30} /><span>La junta aún no cargó su QR. Pide el número a la administración.</span></div>}</div>
      {datos.configuracion.yapeTitular && <div className="holder-line"><ShieldCheck size={17} /><span>Titular: <strong>{datos.configuracion.yapeTitular}</strong></span></div>}
      <ul className="tips"><li>Paga exactamente {dinero(cuota.monto)} para que se valide más rápido.</li><li>Al terminar, toma una captura de pantalla donde se vean el monto, la fecha y el número de operación.</li></ul>
      <button type="button" className="button button-primary full-width" onClick={() => setPaso(2)}>Ya pagué, continuar <ArrowRight size={18} /></button>
    </div>}

    {paso === 2 && <div className="panel payment-card">
      <div className="step-heading"><span>2</span><div><h2>Sube la captura de tu pago</h2><p>Puedes tomar una foto o elegirla de tu galería.</p></div></div>
      <label className={`dropzone ${imagen ? 'dropzone-filled' : ''}`}>
        {imagen ? <img src={imagen} alt="Vista previa del comprobante" className="receipt-preview" /> : <><UploadCloud size={34} /><strong>Toca aquí para elegir la captura</strong><span>JPG, PNG o WEBP · hasta 5 MB</span></>}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void cargarArchivo(e.target.files?.[0])} hidden />
      </label>
      {imagen && <p className="file-line"><CheckCircle2 size={16} /> {nombreImagen} · <label className="text-button">Cambiar imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void cargarArchivo(e.target.files?.[0])} hidden /></label></p>}
      {leyendo && <div className="ocr-progress" role="status"><div><ScanText size={18} /> Leyendo tu captura… <strong>{progreso}%</strong></div><div className="progress-line"><span style={{ width: `${progreso}%` }} /></div></div>}
      {avisoOcr && !leyendo && <div className="info-callout"><ScanText size={18} /><span>{avisoOcr}</span></div>}
      {error && <div role="alert" className="form-error">{error}</div>}
      <div className="step-actions"><button type="button" className="button button-secondary" onClick={() => setPaso(1)}><ArrowLeft size={17} /> Atrás</button><button type="button" className="button button-primary" disabled={!imagen || leyendo} onClick={() => { setError(''); setPaso(3) }}>Continuar <ArrowRight size={18} /></button></div>
      <button type="button" className="text-button sample-link" onClick={usarEjemplo}><Sparkles size={16} /> Probar con un comprobante de ejemplo (demostración)</button>
    </div>}

    {paso === 3 && <form className="panel payment-card" onSubmit={e => void submit(e)}>
      <div className="step-heading"><span>3</span><div><h2>Confirma los datos</h2><p>Compáralos con tu captura y corrige si hace falta.</p></div></div>
      {imagen && <img src={imagen} alt="Tu comprobante" className="receipt-thumb" />}
      <label className="field"><span>¿Con qué pagaste?</span><select value={form.metodo} onChange={e => setForm({ ...form, metodo: e.target.value as PagoEntrada['metodo'] })}><option value="yape_captura">Yape</option><option value="plin_captura">Plin</option><option value="transferencia">Transferencia bancaria</option></select></label>
      <div className="field-grid">
        <label className="field"><span>Monto pagado (S/)</span><input inputMode="decimal" required value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value.replace(',', '.') })} placeholder={cuota.monto.toFixed(2)} />{montoDistinto && <small className="text-warning">Es distinto a tu cuota ({dinero(cuota.monto)}). Se enviará a revisión.</small>}</label>
        <label className="field"><span>Fecha de la operación</span><input type="date" required max={hoy()} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></label>
      </div>
      <label className="field"><span>Número de operación</span><input required autoComplete="off" value={form.operacion} onChange={e => setForm({ ...form, operacion: e.target.value.replace(/\s/g, '') })} placeholder="Aparece en tu captura, p. ej. 12345678" /><small>En Yape figura como «N.º de operación».</small></label>
      <div className="info-callout"><LockKeyhole size={18} /><span>Tu captura se guarda de forma privada. Solo tú y la administración pueden verla.</span></div>
      {error && <div role="alert" className="form-error">{error}</div>}
      <div className="step-actions"><button type="button" className="button button-secondary" onClick={() => setPaso(2)}><ArrowLeft size={17} /> Atrás</button><button className="button button-primary" disabled={enviando}><ImageUp size={18} /> {enviando ? 'Enviando…' : 'Enviar comprobante'}</button></div>
    </form>}
  </div>
}

// ---------------------------------------------------------------------------------------------
// Portal de transparencia (datos agregados desde el servidor, sin nombres ni comprobantes)
// ---------------------------------------------------------------------------------------------
type Transparencia = {
  junta_nombre: string; recaudado: number; egresos: number; saldo: number; egresos_por_concepto: Record<string, number>
  cuotas_total: number; cuotas_pagadas: number; detalle_habilitado: boolean
  unidades: { codigo: string; estado: string; fecha_pago: string | null; es_mia: boolean }[]
}
const conceptoVisible: Record<string, string> = { pago_vigilante: 'Personal de vigilancia', insumos: 'Insumos', otros: 'Otros' }

export function TransparenciaPage() {
  const { usuario } = useApp()
  const [periodo, setPeriodo] = useState(mes())
  const t = useRpc<Transparencia>('transparencia', usuario ? { p_junta: usuario.juntaId, p_periodo: periodo } : null)
  const d = t.data
  const pct = d && d.cuotas_total ? Math.round(d.cuotas_pagadas / d.cuotas_total * 100) : 0
  return <>
    <PageHead eyebrow="Cuentas claras" title="Así van las cuentas de la comunidad" description="Cuánto se recaudó, en qué se gastó y cuántas unidades están al día." action={<label className="select-wrap"><Clock3 size={17} /><select aria-label="Seleccionar mes" value={periodo} onChange={e => setPeriodo(e.target.value)}>{periodos.map(p => <option value={p} key={p}>{mesVisible(p)}</option>)}</select></label>} />
    <div className="transparency-banner"><div className="transparency-badge"><LockKeyhole size={19} /></div><div><strong>Información compartida con responsabilidad</strong><p>Mostramos totales y, si la junta lo permite, el estado por código de unidad. Nunca nombres, montos individuales ni comprobantes.</p></div></div>
    {t.error && <div className="notice notice-danger" role="alert"><AlertCircle size={19} /><span>{t.error}</span></div>}
    {!d ? <Cargando /> : <>
      <div className="stats-grid four">
        <Stat label="Recaudado" value={dinero(Number(d.recaudado))} icon={<Wallet size={20} />} tone="lime" />
        <Stat label="Unidades al día" value={`${pct}%`} note={`${d.cuotas_pagadas} de ${d.cuotas_total} cuotas pagadas`} icon={<CheckCircle2 size={20} />} />
        <Stat label="Gastos" value={dinero(Number(d.egresos))} note={Object.entries(d.egresos_por_concepto).map(([k, v]) => `${conceptoVisible[k] ?? k}: ${dinero(Number(v))}`).join(' · ') || 'Sin gastos registrados'} icon={<CreditCard size={20} />} />
        <Stat label="Saldo del mes" value={dinero(Number(d.saldo))} icon={<ShieldCheck size={20} />} />
      </div>
      {d.detalle_habilitado ? <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Estado de la comunidad</span><h2>Pagos por unidad</h2></div><Simulado /></div>
        {d.unidades.length ? <div className="unit-grid">{d.unidades.map(u => <div key={u.codigo} className={`unit-chip unit-${u.estado} ${u.es_mia ? 'unit-mine' : ''}`}><strong>{u.codigo}{u.es_mia && <span className="my-unit">Mi unidad</span>}</strong><Badge estado={u.estado} /></div>)}</div>
          : <Empty title="Sin cuotas este mes" text="Aún no se generaron cuotas para este periodo." />}
      </div> : <div className="notice"><Home size={19} /><div><strong>La junta muestra solo totales</strong><p>El detalle por unidad está desactivado para proteger la privacidad de los vecinos.</p></div></div>}
    </>}
  </>
}

