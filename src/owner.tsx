import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Camera, CheckCircle2, Clock3, CreditCard, FileImage, Home, ImageUp, LockKeyhole, ScanText, ShieldCheck, Sparkles, UploadCloud, Wallet, XCircle } from 'lucide-react'
import { dinero, estadoVisible, fechaVisible, hoy, mes, mesVisible, periodoAnterior, type Camara, type Cuota } from './model'
import { useApp } from './store'
import { optimizarImagen } from './image'
import { Badge, Empty, PageHead, Simulado, Stat } from './ui'

const periodos = Array.from({ length: 12 }, (_, i) => periodoAnterior(mes(), i))

function SimuladaCanvas({ camara }: { camara: Camara }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let animId: number
    let lastTime = 0
    const fps = 10
    const interval = 1000 / fps

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let scanlineOffset = 0

    const render = (currentTime: number) => {
      animId = requestAnimationFrame(render)
      if (currentTime - lastTime < interval) return
      lastTime = currentTime

      const w = canvas.width
      const h = canvas.height

      // Fondo oscuro de cámara de vigilancia
      ctx.fillStyle = '#0b1619'
      ctx.fillRect(0, 0, w, h)

      // Cuadrícula sutil
      ctx.strokeStyle = '#183136'
      ctx.lineWidth = 1
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      // Geometría representativa según ubicación
      ctx.fillStyle = '#1c393f'
      if (camara.nombre.toLowerCase().includes('ingreso') || camara.ubicacion.toLowerCase().includes('peatonal')) {
        // Silueta de portón / arco de entrada
        ctx.fillRect(w * 0.25, h * 0.35, w * 0.5, h * 0.65)
        ctx.fillStyle = '#284e56'
        ctx.fillRect(w * 0.35, h * 0.45, w * 0.3, h * 0.55)
      } else {
        // Silueta de cocheras / carriles
        ctx.beginPath()
        ctx.moveTo(w * 0.1, h)
        ctx.lineTo(w * 0.4, h * 0.4)
        ctx.lineTo(w * 0.6, h * 0.4)
        ctx.lineTo(w * 0.9, h)
        ctx.fill()
      }

      // Efecto scanline móvil
      scanlineOffset = (scanlineOffset + 3) % h
      ctx.fillStyle = 'rgba(215, 235, 150, 0.04)'
      ctx.fillRect(0, scanlineOffset, w, 6)

      // Ruido digital sutil
      for (let n = 0; n < 30; n++) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
      }

      // Mira central / retícula
      ctx.strokeStyle = '#6e9b88'
      ctx.lineWidth = 1.5
      const cx = w / 2
      const cy = h / 2
      ctx.beginPath()
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy)
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15)
      ctx.stroke()

      // Esquinas de visor
      const cs = 18
      ctx.beginPath()
      // Superior izq
      ctx.moveTo(25, 25 + cs); ctx.lineTo(25, 25); ctx.lineTo(25 + cs, 25)
      // Superior der
      ctx.moveTo(w - 25 - cs, 25); ctx.lineTo(w - 25, 25); ctx.lineTo(w - 25, 25 + cs)
      // Inferior izq
      ctx.moveTo(25, h - 25 - cs); ctx.lineTo(25, h - 25); ctx.lineTo(25 + cs, h - 25)
      // Inferior der
      ctx.moveTo(w - 25 - cs, h - 25); ctx.lineTo(w - 25, h - 25); ctx.lineTo(w - 25, h - 25 - cs)
      ctx.stroke()

      // Textos OSD (On-Screen Display)
      ctx.fillStyle = '#bce2a4'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`CAM: ${camara.nombre.toUpperCase()}`, 35, 45)
      ctx.fillText(`LOC: ${camara.ubicacion.toUpperCase()}`, 35, 62)

      // Reloj con fecha y hora actual en vivo
      const ahora = new Date()
      const horaStr = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(ahora)
      const fechaStr = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(ahora)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 13px monospace'
      ctx.fillText(`${fechaStr} ${horaStr}`, w - 190, 45)

      ctx.fillStyle = '#efab80'
      ctx.font = 'bold 10px monospace'
      ctx.fillText('10 FPS · MODO DEMO', w - 150, 62)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [camara])

  return <canvas ref={canvasRef} width={640} height={360} aria-label={`Transmisión de ${camara.nombre}`} />
}

export function VideovigilanciaPage() {
  const { datos, registrarAuditoria } = useApp()
  const activas = datos.camaras.filter(c => c.activa)
  const auditadoRef = useRef(false)

  useEffect(() => {
    if (!auditadoRef.current) {
      registrarAuditoria('ver_camara', `Acceso a panel de videovigilancia (${activas.length} cámaras activas)`)
      auditadoRef.current = true
    }
  }, [activas.length, registrarAuditoria])

  const seleccionarCamara = (c: Camara) => {
    registrarAuditoria('ver_camara', `Enfoque en cámara ${c.nombre} (${c.tipo})`)
  }

  return (
    <>
      <PageHead
        eyebrow="SEGURIDAD Y CONTROL"
        title="Videovigilancia comunitaria"
        description="Vista de demostración con cámaras simuladas"
      />

      <div className="notice" style={{ alignItems: 'center' }}>
        <ShieldCheck size={20} style={{ flexShrink: 0 }} />
        <div>
          <strong>Finalidad de seguridad vecinal (Ley N.º 29733)</strong>
          <p>Las imágenes se usan solo para la seguridad de las zonas comunes (Ley N.º 29733). El sistema no almacena grabaciones en esta versión académica del MVP.</p>
        </div>
      </div>

      {activas.length ? (
        <div className="cameras-grid">
          {activas.map(cam => (
            <div key={cam.id} className="camera-card" onClick={() => seleccionarCamara(cam)}>
              <div className="camera-card-head">
                <div>
                  <h2>{cam.nombre}</h2>
                  <small>{cam.ubicacion}</small>
                </div>
                <Badge estado={cam.tipo === 'simulada' ? 'activa' : 'en_revision'} />
              </div>
              <div className="camera-feed">
                <span className="camera-live-badge">
                  <span className="camera-live-dot" /> SIMULADO
                </span>
                {cam.tipo === 'simulada' && <SimuladaCanvas camara={cam} />}
                {cam.tipo === 'mjpeg' && (
                  <img
                    src={cam.url}
                    alt={`Transmisión en vivo de ${cam.nombre}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                )}
                {cam.tipo === 'embed' && (
                  <iframe
                    src={cam.url}
                    title={cam.nombre}
                    sandbox="allow-scripts allow-same-origin"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="camera-card-foot">
                <span>Tipo: <strong>{cam.tipo === 'simulada' ? 'TRANSMISIÓN SIMULADA' : cam.tipo === 'mjpeg' ? 'MJPEG / Stream URL' : 'Embed externo'}</strong></span>
                <span>Resolución: <strong>720p</strong></span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Sin cámaras activas"
          text="El administrador no ha habilitado ninguna cámara en la configuración."
        />
      )}
    </>
  )
}
export function MiCuenta() {
  const { datos, usuario } = useApp(); const cuotas = datos.cuotas.filter(c => c.unidadId === usuario?.unidadId).sort((a, b) => b.periodo.localeCompare(a.periodo))
  const unidad = datos.unidades.find(u => u.id === usuario?.unidadId)
  const actuales = cuotas.filter(c => c.periodo === mes())
  const ultimaRechazo = datos.pagos.find(p => p.unidadId === usuario?.unidadId && p.estado === 'rechazado')
  return <><PageHead eyebrow="MI ESPACIO" title={`Hola, ${usuario?.nombre.split(' ')[0]}`} description="Consulta tus cuotas y mantente al día con tu comunidad." /><div className="owner-welcome"><div className="owner-welcome-icon"><Home size={27} /></div><div><span>MI UNIDAD</span><h2>{unidad?.codigo || 'Sin unidad'}</h2><p>Junta Vecinal Arcomunity — Piloto</p></div><div className="owner-welcome-decor">⌂</div></div><div className="stats-grid three"><Stat label="Cuota mensual" value={dinero(datos.configuracion.cuotaMensual)} note={`Vence el día ${datos.configuracion.diaVencimiento}`} icon={<CreditCard size={20} />} tone="lime" /><Stat label="Cuotas pagadas" value={cuotas.filter(c => c.estado === 'pagada').length} note="En el historial" icon={<CheckCircle2 size={20} />} /><Stat label="Por atender" value={actuales.filter(c => c.estado !== 'pagada').length} note="En el mes actual" icon={<Clock3 size={20} />} /></div>{ultimaRechazo && <div className="notice notice-danger"><XCircle size={20} /><div><strong>Un pago fue rechazado</strong><p>{ultimaRechazo.motivoRechazo}. Puedes subir un nuevo comprobante desde tu cuota.</p></div></div>}<div className="panel"><div className="panel-heading"><div><span className="eyebrow">TU HISTORIAL</span><h2>Estado de cuenta</h2></div><Simulado /></div>{cuotas.length ? <div className="owner-quotas">{cuotas.map(c => <div className="owner-quota" key={c.id}><div className="quota-calendar"><span>{c.periodo.slice(5, 7)}</span><small>{c.periodo.slice(0, 4)}</small></div><div className="quota-main"><strong>Cuota de vigilancia · {mesVisible(c.periodo)}</strong><span>Vencimiento: {fechaVisible(c.vencimiento)}</span></div><div className="quota-amount"><strong>{dinero(c.monto)}</strong><Badge estado={estadoVisible(c)} /></div>{c.estado === 'pendiente' && <Link className="button button-primary" to={`/pagar/${c.id}`}>Pagar <ArrowRight size={17} /></Link>}</div>)}</div> : <Empty title="Sin cuotas" text="El administrador aún no ha generado tus cuotas." />}</div></>
}

function extraerTexto(texto: string) {
  const normal = texto.replaceAll('\n', ' ')
  const monto = normal.match(/(?:S\s*\/?\s*\/?\s*\.?\s*)([\d,.]+)|(?:monto|total|importe)\s*[:.]?\s*(?:S\s*\/\s*)?([\d,.]+)/i)
  const fecha = normal.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/)
  const operacion = normal.match(/(?:operaci[oó]n|transacci[oó]n|n[.°ºo]*\s*op(?:eraci[oó]n)?)\s*[:#-]?\s*([A-Z0-9]{6,20})/i)
  const montoRaw = monto?.[1] || monto?.[2]
  return { monto: montoRaw ? montoRaw.replace(',', '.') : '', fecha: fecha ? `${fecha[3]}-${fecha[2].padStart(2, '0')}-${fecha[1].padStart(2, '0')}` : '', operacion: operacion?.[1] || '' }
}
function imagenMuestra(): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 440; const c = canvas.getContext('2d')!
  c.fillStyle = '#fbfcfa'; c.fillRect(0, 0, 600, 440); c.fillStyle = '#173942'; c.font = 'bold 30px Arial'; c.fillText('COMPROBANTE DE MUESTRA', 32, 65); c.font = '19px Arial'; c.fillText('SIMULADO · NO ES UN PAGO REAL', 32, 104); c.fillStyle = '#d8e6d9'; c.fillRect(32, 135, 536, 2); c.fillStyle = '#173942'; c.font = '24px Arial'; c.fillText('Monto: S/ 150.00', 32, 202); c.fillText(`Fecha: ${fechaVisible(hoy())}`, 32, 253); c.fillText(`Operación: DEMO${Date.now().toString().slice(-9)}`, 32, 304); c.font = '16px Arial'; c.fillText('Imagen generada para probar el frontend.', 32, 385)
  return Promise.resolve(canvas.toDataURL('image/jpeg', .8))
}
export function PagarPage() {
  const { cuotaId } = useParams(); const navigate = useNavigate(); const { datos, usuario, enviarPago, mostrar } = useApp()
  const cuota = datos.cuotas.find(c => c.id === cuotaId && c.unidadId === usuario?.unidadId)
  const [imagen, setImagen] = useState<string>(''); const [nombreImagen, setNombreImagen] = useState(''); const [monto, setMonto] = useState(''); const [fecha, setFecha] = useState(''); const [operacion, setOperacion] = useState(''); const [confianza, setConfianza] = useState<number | undefined>(); const [ocrExtraido, setOcrExtraido] = useState<{ monto?: string; fecha?: string; operacion?: string } | undefined>(); const [progreso, setProgreso] = useState(0); const [leyendo, setLeyendo] = useState(false); const [errorOcr, setErrorOcr] = useState('')
  if (!cuota) return <Empty title="Cuota no encontrada" text="No tienes acceso a esta cuota o ya no existe." action={<Link className="button button-primary" to="/mi-cuenta">Volver a mi cuenta</Link>} />
  const cargarArchivo = async (file?: File) => {
    if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return mostrar('Sube una imagen JPG, PNG o WEBP de hasta 5 MB.', 'error')
    try { setErrorOcr(''); setImagen(await optimizarImagen(file)); setNombreImagen(file.name)
      if (!navigator.onLine) { const m = 'Sin conexión a internet. El OCR necesita internet para descargar el modelo de lectura. Ingresa los datos manualmente.'; setConfianza(undefined); setOcrExtraido(undefined); setErrorOcr(m); mostrar(m, 'error'); return }
      setLeyendo(true); setProgreso(0)
      const Tesseract = await import('tesseract.js')
      const lectura = Tesseract.recognize(file, 'spa', { logger: m => { if (m.status === 'recognizing text') setProgreso(Math.round(m.progress * 100)) } })
      const result = await Promise.race([lectura, new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo_agotado')), 30000))])
      const parsed = extraerTexto(result.data.text); setConfianza(result.data.confidence)
      const hayDatos = Boolean(parsed.monto || parsed.fecha || parsed.operacion)
      setOcrExtraido(hayDatos ? { monto: parsed.monto || undefined, fecha: parsed.fecha || undefined, operacion: parsed.operacion || undefined } : undefined)
      if (parsed.monto) setMonto(parsed.monto); if (parsed.fecha) setFecha(parsed.fecha); if (parsed.operacion) setOperacion(parsed.operacion)
      mostrar(hayDatos ? 'Lectura completada. Revisa y corrige los datos.' : 'No pudimos leer la imagen. Ingresa los datos manualmente.', hayDatos ? 'ok' : 'info')
    } catch { const m = navigator.onLine ? 'No pudimos leer la imagen. Ingresa los datos manualmente.' : 'Se perdió la conexión a internet y el OCR no pudo leer la imagen. Ingresa los datos manualmente.'; setConfianza(undefined); setOcrExtraido(undefined); setErrorOcr(m); mostrar(m, 'error') } finally { setLeyendo(false); setProgreso(100) }
  }
  const cargarEjemplo = async () => { const muestra = await imagenMuestra(); setImagen(muestra); setNombreImagen('comprobante_simulado.jpg'); setMonto(String(cuota.monto)); setFecha(hoy()); setOperacion(`DEMO${Date.now().toString().slice(-9)}`); setConfianza(100); setOcrExtraido(undefined); mostrar('Ejemplo simulado cargado. Revisa los campos antes de enviar.', 'info') }
  const cargarEjemploBajaConfianza = async () => { const muestra = await imagenMuestra(); const op = `DEMO${Date.now().toString().slice(-9)}`; setImagen(muestra); setNombreImagen('comprobante_baja_confianza.jpg'); setMonto(String(cuota.monto)); setFecha(hoy()); setOperacion(op); setConfianza(45); setOcrExtraido({ monto: String(cuota.monto), fecha: hoy(), operacion: op }); mostrar('Ejemplo con OCR de baja confianza (45%) cargado para pruebas.', 'info') }
  const submit = (e: FormEvent) => { e.preventDefault(); if (!imagen) return mostrar('Adjunta una imagen del comprobante.', 'error'); if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) return mostrar('Ingresa un monto válido.', 'error'); if (!fecha || fecha > hoy()) return mostrar('La fecha no puede ser futura.', 'error'); if (!operacion.trim()) return mostrar('Completa el número de operación.', 'error'); const error = enviarPago({ cuotaId: cuota.id, monto: Number(monto), fecha, operacion, metodo: 'yape_captura', comprobante: imagen, comprobanteNombre: nombreImagen, ocrConfianza: confianza, ocrExtraido }); if (error) mostrar(error, 'error'); else navigate('/mi-cuenta') }
  const inhabilitado = cuota.estado !== 'pendiente'
  return <><div className="back-line"><Link to="/mi-cuenta"><ArrowLeft size={17} /> Volver a mi cuenta</Link></div><PageHead eyebrow="PAGO DE CUOTA" title={`Pagar ${mesVisible(cuota.periodo)}`} description="Sigue los pasos para informar tu pago a la junta." /><div className="payment-grid"><div className="payment-main"><div className="panel payment-card"><div className="step-heading"><span>01</span><div><h2>Realiza tu pago</h2><p>Escanea el QR desde Yape y confirma el monto.</p></div></div><div className="payment-amount"><span>Total a pagar</span><strong>{dinero(cuota.monto)}</strong><small>Vence el {fechaVisible(cuota.vencimiento)}</small></div><div className="pay-qr">{datos.configuracion.yapeQr ? <img src={datos.configuracion.yapeQr} alt="QR de Yape de la junta" /> : <div className="qr-placeholder"><Camera size={30} /><span>El administrador aún no ha configurado el QR.</span></div>}</div><div className="holder-line"><ShieldCheck size={17} /><span>Titular: <strong>{datos.configuracion.yapeTitular}</strong></span></div><div className="info-callout"><AlertCircle size={18} /><span>El pago se realiza fuera de esta web. La demo no conecta con Yape ni verifica dinero recibido.</span></div></div></div><div className="panel payment-card"><div className="step-heading"><span>02</span><div><h2>Sube tu comprobante</h2><p>Extraeremos los datos para que puedas revisarlos.</p></div></div>{inhabilitado ? <div className="notice"><AlertCircle size={19} /><span>Esta cuota está {estadoVisible(cuota).replace('_', ' ')}. No se puede subir otro comprobante ahora.</span></div> : <form onSubmit={submit} className="form-stack"><label className="dropzone"><UploadCloud size={31} /><strong>{nombreImagen || 'Toca para seleccionar una imagen'}</strong><span>JPG, PNG o WEBP · cámara o galería</span><input type="file" accept="image/*,image/png,image/jpeg,image/webp" onChange={e => void cargarArchivo(e.target.files?.[0])} hidden /></label><div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}><button type="button" className="text-button sample-link" onClick={() => void cargarEjemplo()}><Sparkles size={17} /> Cargar comprobante de ejemplo simulado</button><button type="button" className="text-button sample-link" onClick={() => void cargarEjemploBajaConfianza()}><ScanText size={17} /> Cargar ejemplo OCR baja confianza (45%)</button></div>{imagen && <div className="uploaded-file"><FileImage size={19} /><span>{nombreImagen}</span><CheckCircle2 size={17} /></div>}{errorOcr && <div role="alert" className="form-error">{errorOcr}</div>}{leyendo && <div className="ocr-progress"><div><ScanText size={18} /> Leyendo imagen... <strong>{progreso}%</strong></div><div className="progress-line"><span style={{ width: `${progreso}%` }} /></div></div>}<div className="form-divider" /><p className="form-hint">Confirma o corrige estos datos antes de enviar. Si el OCR falla, escríbelos manualmente.</p><div className="field-grid"><label className="field"><span>Monto pagado (S/)</span><input type="number" inputMode="decimal" required min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="150.00" /></label><label className="field"><span>Fecha de operación</span><input type="date" required max={hoy()} value={fecha} onChange={e => setFecha(e.target.value)} /></label></div><label className="field"><span>N.º de operación</span><input inputMode="numeric" required value={operacion} onChange={e => setOperacion(e.target.value)} placeholder="Ej.: 123456789" /></label><button className="button button-primary full-width" disabled={leyendo}><ImageUp size={18} /> Enviar comprobante</button></form>}</div></div></>
}

export function TransparenciaPage() {
  const { datos, usuario } = useApp(); const [periodo, setPeriodo] = useState(mes())
  // Esta pantalla se alimenta solo de la información pública por unidad; no renderiza perfiles ni comprobantes.
  const cuotas: Pick<Cuota, 'id' | 'unidadId' | 'periodo' | 'estado' | 'fechaPago' | 'vencimiento'>[] = datos.cuotas.filter(c => c.periodo === periodo).map(c => ({ id: c.id, unidadId: c.unidadId, periodo: c.periodo, estado: c.estado, fechaPago: c.fechaPago, vencimiento: c.vencimiento }))
  const recaudado = datos.pagos.filter(p => p.estado.startsWith('conciliado') && datos.cuotas.some(c => c.id === p.cuotaId && c.periodo === periodo)).reduce((n, p) => n + p.monto, 0)
  const egresos = datos.egresos.filter(e => e.fecha.slice(0, 7) === periodo.slice(0, 7)).reduce((n, e) => n + e.monto, 0)
  const pagadas = cuotas.filter(c => c.estado === 'pagada').length
  return <><PageHead eyebrow="CUENTAS CLARAS" title="Portal de transparencia" description="Así marcha la recaudación de nuestra comunidad, sin exponer datos personales." action={<label className="select-wrap"><CalendarDaysIcon /><select aria-label="Seleccionar mes" value={periodo} onChange={e => setPeriodo(e.target.value)}>{periodos.map(p => <option value={p} key={p}>{mesVisible(p)}</option>)}</select></label>} /><div className="transparency-banner"><div className="transparency-badge"><LockKeyhole size={19} /></div><div><strong>Información compartida con responsabilidad</strong><p>Se muestran códigos de unidad y estados de pago. Los nombres y comprobantes permanecen privados.</p></div></div><div className="stats-grid four"><Stat label="Recaudado" value={dinero(recaudado)} icon={<Wallet size={20} />} tone="lime" /><Stat label="Unidades al día" value={`${cuotas.length ? Math.round(pagadas / cuotas.length * 100) : 0}%`} note={`${pagadas} de ${cuotas.length} cuotas pagadas`} icon={<CheckCircle2 size={20} />} /><Stat label="Egresos" value={dinero(egresos)} icon={<CreditCard size={20} />} /><Stat label="Saldo" value={dinero(recaudado - egresos)} icon={<ShieldCheck size={20} />} /></div><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ESTADO DE LA COMUNIDAD</span><h2>Pagos por unidad</h2></div><Simulado /></div><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Periodo</th><th>Estado</th><th>Fecha de pago</th></tr></thead><tbody>{cuotas.map(c => { const propia = c.unidadId === usuario?.unidadId; return <tr key={c.id} className={propia ? 'own-row' : ''}><td className="strong">{datos.unidades.find(u => u.id === c.unidadId)?.codigo}{propia && <span className="my-unit">Mi unidad</span>}</td><td>{mesVisible(c.periodo)}</td><td><Badge estado={estadoVisible(c as Cuota)} /></td><td>{fechaVisible(c.fechaPago)}</td></tr> })}</tbody></table></div></div></>
}
function CalendarDaysIcon() { return <Clock3 size={17} /> }
