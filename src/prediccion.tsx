// Predicción de morosidad. Muestra solo resultados reales guardados en la base (predicciones_vigentes) por el
// modelo activo de modelos_ml (v1: regresión logística calculada en PostgreSQL, migración 1200). Si no hay
// modelo activo, la pantalla lo dice: nunca inventa probabilidades. Solo la administración la ve.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, BrainCircuit, CalendarClock, Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { fechaVisible, mesVisible, mes, periodoAnterior } from './model'
import { supabase } from './lib/supabase'
import { useApp } from './store'
import { useRpc } from './lib/usarRpc'
import { Ayuda, Cargando, ConfirmDialog, Empty, PageHead, Stat } from './ui'

type Prediccion = { cuota_id: string; unidad_codigo: string; fecha_vencimiento: string; probabilidad: number; nivel_riesgo: 'bajo' | 'medio' | 'alto'; factores: { variable: string; aporte: number }[]; modelo_version: string; generado_en: string }
type Modelo = { version: string; algoritmo: string; umbral: number; entrenado_en: string; metricas: { prueba_meses_11_12?: Record<string, number>; validacion_anidada_meses_5_10?: Record<string, number> } }

const FACTOR: Record<string, string> = {
  atrasos_previos_total: 'Atrasos anteriores',
  tasa_atraso_previa: 'Se atrasa a menudo',
  dias_atraso_promedio_previo: 'Atrasos largos',
  pagos_atrasados_previos: 'Atrasos recientes (3 meses)',
}
const ACCION = { alto: 'Priorizar recordatorio', medio: 'Hacer seguimiento', bajo: '—' }
const pct = (n?: number) => (n === undefined ? '—' : `${Math.round(n * 100)} %`)
// Probabilidad para mostrar: el modelo puede dar 0,9999; no se presenta como certeza del 100 %.
const probabilidad = (n: number) => (n >= 0.995 ? '> 99 %' : n < 0.005 ? '< 1 %' : `${Math.round(n * 100)} %`)

export function PrediccionPage() {
  const { usuario, datos, rpc, mostrar } = useApp()
  const [version, setVersion] = useState(0)
  const [modelo, setModelo] = useState<Modelo | null | undefined>(undefined)
  const [calculando, setCalculando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const p = useRpc<Prediccion[]>('predicciones_vigentes', usuario ? { p_junta: usuario.juntaId } : null, [version])
  const hoyIso = new Date().toISOString().slice(0, 10)
  const proximas = datos.cuotas.filter(c => c.estado === 'pendiente' && c.vencimiento >= hoyIso).length
  const siguiente = periodoAnterior(mes(), -1)

  useEffect(() => {
    let activo = true
    supabase.from('modelos_ml').select('version, algoritmo, umbral, entrenado_en, metricas').eq('activo', true).maybeSingle()
      .then(({ data, error }) => { if (activo) setModelo(error ? null : (data as Modelo | null)) })
    return () => { activo = false }
  }, [])

  const calcular = async () => {
    if (!usuario) return null
    setCalculando(true)
    const r = await rpc<{ cuotas: number; alto: number; medio: number }>('calcular_riesgo_morosidad', { p_junta: usuario.juntaId })
    setCalculando(false)
    if (!r.ok) { mostrar(r.error, 'error'); return r.error }
    mostrar(r.data.cuotas ? `Riesgo calculado para ${r.data.cuotas} cuotas: ${r.data.alto} con riesgo alto.` : 'No hay cuotas por vencer en los próximos 31 días.', r.data.cuotas ? 'ok' : 'info')
    setVersion(v => v + 1)
    return null
  }
  // Si ya hay resultados de hoy, se avisa antes de reemplazarlos.
  const pedirCalculo = () => { if ((p.data ?? []).some(x => x.generado_en.slice(0, 10) === hoyIso)) setConfirmar(true); else void calcular() }

  const lista = [...(p.data ?? [])].sort((a, b) => Number(b.probabilidad) - Number(a.probabilidad))
  const alto = lista.filter(x => x.nivel_riesgo === 'alto').length
  const medio = lista.filter(x => x.nivel_riesgo === 'medio').length

  if (modelo === undefined || (p.cargando && !p.data)) return <><PageHead eyebrow="Apoyo a la cobranza" title="Predicción de morosidad" description="Prioriza recordatorios antes del vencimiento según el riesgo de pago con atraso." /><Cargando /></>

  if (!modelo) return <>
    <PageHead eyebrow="Apoyo a la cobranza" title="Predicción de morosidad" description="Prioriza recordatorios antes del vencimiento según el riesgo de pago con atraso." />
    <div className="panel pending-feature">
      <div className="pending-feature-head"><BrainCircuit size={28} /><div><span className="eyebrow">Pendiente de conectar</span><h2>El modelo aún no está disponible</h2></div></div>
      <p>Esta función mostrará la probabilidad de que cada cuota próxima a vencer se pague con atraso. Se activará cuando el modelo esté registrado en la base. Hasta entonces no se muestran resultados para no presentar datos inventados.</p>
      <div className="feature-facts">
        <div><CalendarClock size={20} /><span><strong>{proximas}</strong> cuotas pendientes aún no vencidas que se podrían evaluar</span></div>
        <div><Database size={20} /><span>Datos de entrada listos: historial de pagos previos sin información futura</span></div>
        <div><ShieldCheck size={20} /><span>Unidades seudonimizadas; solo la administración verá los resultados</span></div>
      </div>
    </div>
  </>

  const prueba = modelo.metricas.prueba_meses_11_12
  return <>
    <PageHead eyebrow="Apoyo a la cobranza" title="Predicción de morosidad" description="Prioriza recordatorios antes del vencimiento según el riesgo de pago con atraso."
      action={<button className="button button-primary" disabled={calculando} aria-busy={calculando} onClick={pedirCalculo}><RefreshCw size={17} aria-hidden="true" /> {calculando ? 'Calculando…' : 'Calcular riesgo de hoy'}</button>} />
    <div className="info-callout aviso-experimental" role="note"><AlertCircle size={18} /><span>
      <strong>Modelo experimental (APF3).</strong> Se entrenó con datos simulados de la junta de demostración; sus probabilidades no están validadas con vecinos reales. Úsalo solo como apoyo para priorizar recordatorios, nunca para sancionar ni para decidir sobre un vecino.
    </span></div>
    <Ayuda pregunta="¿Qué significa el riesgo de morosidad?">Es la probabilidad, estimada por el modelo, de que una cuota que aún no vence se pague tarde. Se calcula solo con el historial de pagos anteriores de cada unidad. <strong>Riesgo alto</strong> significa que conviene enviar un recordatorio antes del vencimiento; <strong>bajo</strong>, que la unidad suele pagar a tiempo. Es una ayuda para priorizar, no una acusación: nunca se usa para sancionar.</Ayuda>
    <div className="stats-grid three">
      <Stat label="Cuotas evaluadas" value={lista.length} note="por vencer en los próximos 31 días" icon={<CalendarClock size={20} />} />
      <Stat label="Riesgo alto" value={alto} note="recordatorios sugeridos" icon={<AlertCircle size={20} />} tone="coral" />
      <Stat label="Riesgo medio" value={medio} note="seguimiento" icon={<BrainCircuit size={20} />} />
    </div>
    <div className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Cuotas por vencer</span><h2>Riesgo de pago con atraso</h2></div><span className="count-pill">Modelo {modelo.version}</span></div>
      {lista.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Vence</th><th>Probabilidad de atraso</th><th>Riesgo</th><th>Por qué</th><th>Acción sugerida</th></tr></thead><tbody>
        {lista.map(x => <tr key={x.cuota_id}><td className="strong">{x.unidad_codigo}</td><td>{fechaVisible(x.fecha_vencimiento)}</td><td>{probabilidad(Number(x.probabilidad))}</td>
          <td><span className={`badge badge-riesgo-${x.nivel_riesgo}`}>{x.nivel_riesgo}</span></td>
          <td className="celda-factores">{x.factores.length ? x.factores.map(f => FACTOR[f.variable] ?? f.variable).join(' · ') : 'Sin atrasos relevantes'}</td><td>{ACCION[x.nivel_riesgo]}</td></tr>)}
      </tbody></table></div>
        : proximas === 0
          ? <Empty title="No hay cuotas por vencer" text={`Las cuotas de este mes ya vencieron. Genera las de ${mesVisible(siguiente)} en Cuotas y luego calcula el riesgo.`} action={<Link className="button button-secondary" to="/admin/cuotas">Ir a Cuotas</Link>} />
          : <Empty title="Aún no se calculó el riesgo de hoy" text="Pulsa «Calcular riesgo de hoy» para evaluar las cuotas por vencer." />}
    </div>
    <div className="info-callout model-note"><ShieldCheck size={18} /><span>
      <strong>{modelo.algoritmo}</strong>, versión {modelo.version}, umbral {modelo.umbral}. En su evaluación final con datos simulados detectó {pct(prueba?.recall)} de las cuotas morosas (precision {pct(prueba?.precision)}); estas cifras no garantizan el mismo desempeño con pagos reales.
      Solo la administración ve estas predicciones: los propietarios no ven su riesgo.
    </span></div>
    {p.error && <Empty title="No se pudo consultar" text={p.error} />}
    {confirmar && <ConfirmDialog titulo="¿Volver a calcular el riesgo?" icono={<RefreshCw size={22} />} descripcion={`Ya hay ${lista.length} predicciones calculadas hoy. Se calcularán otra vez con el modelo ${modelo.version} y los datos actuales, y reemplazarán a las anteriores.`} advertencias={['Si nadie pagó desde el último cálculo, el resultado será el mismo.']} textoConfirmar="Calcular de nuevo" textoProcesando="Calculando…" onCerrar={() => setConfirmar(false)} onConfirmar={calcular} />}
  </>
}
