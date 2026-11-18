// Saludo cercano: hora del día (Lima), fechas especiales del Perú y un mensaje acorde a los datos
// reales del usuario. Nunca felicita a quien tiene cuotas pendientes.
import { useEffect, useState, type ReactNode } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { fechaEspecial, partesLima, saludoPorHora, type FechaEspecial } from './lib/fechas-peru'
import { estadoVisible, fechaVisible } from './model'
import { useApp } from './store'

export type ResumenVecino = { vencidas: number; pendientes: number; enRevision: number; proximoVencimiento?: string }

export function mensajeVecino(r: ResumenVecino): string {
  if (r.vencidas > 0) return r.vencidas === 1 ? 'Tienes una cuota vencida. Puedes pagarla ahora en tres pasos.' : `Tienes ${r.vencidas} cuotas vencidas. Puedes pagarlas en tres pasos.`
  if (r.enRevision > 0) return 'Recibimos tu comprobante. La administración lo está revisando.'
  if (r.pendientes > 0) return `Recuerda revisar tu próxima cuota${r.proximoVencimiento ? `: vence el ${fechaVisible(r.proximoVencimiento)}` : ''}.`
  return 'Estás al día. ¡Gracias por contribuir con tu comunidad!'
}

export function mensajeAdmin(porRevisar: number, vencidas: number): string {
  if (porRevisar > 0) return porRevisar === 1 ? 'Hay un pago esperando tu revisión.' : `Hay ${porRevisar} pagos esperando tu revisión.`
  if (vencidas > 0) return 'Conciliación al día. Revisa las cuotas vencidas para enviar recordatorios.'
  return 'Todo al día. Revisa las novedades de tu comunidad.'
}

// Instante de referencia: hora del servidor ajustada al reloj local (evita depender solo del navegador).
let desfaseServidorMs: number | null = null
async function ahoraServidor(): Promise<Date> {
  if (desfaseServidorMs === null) {
    try {
      const { data } = await supabase.rpc('servidor_ahora')
      if (data?.ahora) desfaseServidorMs = new Date(data.ahora as string).getTime() - Date.now()
    } catch { /* se usa el reloj local */ }
  }
  return new Date(Date.now() + (desfaseServidorMs ?? 0))
}

const claveCerrado = (fecha: string, id: string) => `arcomunity-saludo-${fecha}-${id}`
const leerCerrado = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const guardarCerrado = (k: string) => { try { localStorage.setItem(k, '1') } catch { /* sin almacenamiento */ } }

export function Saludo({ subtitulo, accion }: { subtitulo?: string; accion?: ReactNode }) {
  const { usuario, datos } = useApp()
  const [momento, setMomento] = useState(() => partesLima(new Date()))
  const [especial, setEspecial] = useState<FechaEspecial | null>(null)

  useEffect(() => {
    let activo = true
    ahoraServidor().then(d => {
      if (!activo) return
      const p = partesLima(d)
      setMomento(p)
      const f = fechaEspecial(p.fecha)
      setEspecial(f && !leerCerrado(claveCerrado(p.fecha, f.id)) ? f : null)
    })
    return () => { activo = false }
  }, [])

  if (!usuario) return null
  const nombre = usuario.nombre.split(' ')[0]
  let mensaje: string
  if (usuario.rol === 'admin') {
    const vencidas = datos.cuotas.filter(c => estadoVisible(c) === 'morosa' && c.periodo === `${momento.fecha.slice(0, 7)}-01`).length
    mensaje = mensajeAdmin(datos.pagos.filter(p => p.estado === 'pendiente_revision').length, vencidas)
  } else {
    const pendientes = datos.cuotas.filter(c => c.estado === 'pendiente')
    mensaje = mensajeVecino({
      vencidas: pendientes.filter(c => estadoVisible(c) === 'morosa').length,
      pendientes: pendientes.length,
      enRevision: datos.cuotas.filter(c => c.estado === 'en_revision').length,
      proximoVencimiento: pendientes.map(c => c.vencimiento).sort()[0],
    })
  }

  return <section className="greeting" aria-label="Saludo">
    <div className="greeting-row">
      <div className="greeting-text">
        {subtitulo && <span className="eyebrow">{subtitulo}</span>}
        <h1>{saludoPorHora(momento.hora)}, {nombre}!</h1>
        <p>{mensaje}</p>
      </div>
      {accion && <div className="head-action">{accion}</div>}
    </div>
    {especial && <div className={`festive festive-${especial.tipo}`} role="note">
      <span className="festive-icon" aria-hidden="true">{especial.emoji ?? <PartyPopper size={20} />}</span>
      <div><strong>{especial.nombre}</strong><p>{especial.mensaje}</p></div>
      <button type="button" className="icon-button" aria-label="Cerrar saludo" onClick={() => { guardarCerrado(claveCerrado(momento.fecha, especial.id)); setEspecial(null) }}><X size={18} /></button>
    </div>}
  </section>
}
