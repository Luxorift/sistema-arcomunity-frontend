// Predicción de morosidad. Muestra solo resultados reales guardados en la base (predicciones_vigentes) por el
// modelo activo de modelos_ml (v1: regresión logística calculada en PostgreSQL, migración 1200). Si no hay
// modelo activo, la pantalla lo dice: nunca inventa probabilidades. Solo la administración la ve.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, BellRing, BrainCircuit, CalendarClock, CheckCircle2, Database, FlaskConical, MessageCircle, RefreshCw, Scale, ShieldCheck, Target } from 'lucide-react'
import { fechaVisible, mesVisible, mes, periodoAnterior } from './model'
import { supabase } from './lib/supabase'
import { useApp, type RiesgoCalculado } from './store'
import { useRpc } from './lib/usarRpc'
import { conLimite, esTiempoAgotado, REGLA_MANUAL } from './lib/limiteTiempo'
import { MOTIVO_RESPALDO, resumenRiesgo } from './lib/prediccionTextos'
import { Ayuda, Cargando, ConfirmDialog, Empty, PageHead, Stat } from './ui'

type Prediccion = {
  cuota_id: string; unidad_codigo: string; fecha_vencimiento: string; probabilidad: number | null; nivel_riesgo: 'bajo' | 'medio' | 'alto'
  factores: { variable: string; aporte: number }[]; modelo_version: string; generado_en: string
  origen: 'modelo' | 'regla_respaldo'; motivo_respaldo: string | null; ultimo_recordatorio: string | null; canal_recordatorio: string | null
}
type EstadoPrediccion = { es_demo: boolean; simular_falla_modelo: boolean; modelo_activo: string | null }
type Evaluacion = { origen: 'modelo' | 'regla_respaldo'; motivo_respaldo: string | null; probabilidad: number | null; nivel_riesgo: 'bajo' | 'medio' | 'alto'; modelo_version: string; factores: { variable: string }[] }
const CANALES = { whatsapp: 'WhatsApp', llamada: 'Llamada', presencial: 'En persona', otro: 'Otro' } as const
// Métricas de la evaluación única con el conjunto de prueba (meses 11–12 del dataset simulado), tal como están
// versionadas en modelos_ml.metricas (migraciones 1200 y 1400). La pantalla no escribe cifras a mano.
type Matriz = { verdaderos_positivos: number; falsos_negativos: number; falsos_positivos: number; verdaderos_negativos: number; cuotas: number }
type MetricasPrueba = { accuracy: number; precision: number; recall: number; f1: number; matriz?: Matriz }
type Modelo = { version: string; algoritmo: string; umbral: number; entrenado_en: string; metricas: { prueba_meses_11_12?: MetricasPrueba } }

const FACTOR: Record<string, string> = {
  atrasos_previos_total: 'Atrasos anteriores',
  tasa_atraso_previa: 'Se atrasa a menudo',
  dias_atraso_promedio_previo: 'Atrasos largos',
  pagos_atrasados_previos: 'Atrasos recientes (3 meses)',
}
const ACCION = { alto: 'Priorizar recordatorio', medio: 'Hacer seguimiento', bajo: '—' }
// Mismo estilo que el resto de la app: «84.6 %» (punto decimal de es-PE y espacio antes del signo).
const unDecimal = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const porcentaje = { format: (x: number) => `${unDecimal.format(x * 100)} %` }
const tresDecimales = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
// 24 horas («18/11/2026, 17:59»): evita «p. m.» seguido del punto final de la frase.
const fechaHora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Tarjeta de una métrica del modelo: valor, conteo que la explica y una frase sencilla. */
function KpiModelo({ titulo, valor, proporcion, detalle, explicacion, icono }: { titulo: string; valor: string; proporcion: number; detalle?: string; explicacion: string; icono: ReactNode }) {
  return <article className="kpi-modelo">
    <div className="kpi-modelo-top"><h3>{titulo}</h3><span className="kpi-modelo-icono" aria-hidden="true">{icono}</span></div>
    <strong className="kpi-modelo-valor">{valor}</strong>
    <div className="kpi-modelo-medidor" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, proporcion)) * 100}%` }} /></div>
    {detalle && <p className="kpi-modelo-detalle">{detalle}</p>}
    <p className="kpi-modelo-explicacion">{explicacion}</p>
  </article>
}

function DesempenoModelo({ modelo }: { modelo: Modelo }) {
  const m = modelo.metricas.prueba_meses_11_12
  if (!m) return null
  const x = m.matriz
  const alertas = x ? x.verdaderos_positivos + x.falsos_positivos : undefined
  const morosas = x ? x.verdaderos_positivos + x.falsos_negativos : undefined
  const aTiempo = x ? x.falsos_positivos + x.verdaderos_negativos : undefined
  return <section className="ml-seccion" aria-labelledby="ml-desempeno">
    <div className="ml-seccion-head">
      <div><span className="eyebrow">1 · Evaluación del modelo</span><h2 id="ml-desempeno">Desempeño del modelo</h2>
        <p>Resultado de su evaluación final, medida una sola vez con el conjunto de prueba{x ? `: ${x.cuotas} cuotas simuladas` : ''} de los meses 11 y 12 que el modelo no vio al entrenarse. No corresponde a las predicciones de esta pantalla ni a pagos de vecinos reales.</p></div>
      <span className="count-pill">Modelo {modelo.version} · prueba</span>
    </div>
    <div className="kpi-modelo-grid">
      <KpiModelo titulo="Recall" icono={<Target size={20} />} valor={porcentaje.format(m.recall)} proporcion={m.recall}
        detalle={x && morosas !== undefined ? `Detectó ${x.verdaderos_positivos} de ${morosas} cuotas morosas.` : undefined}
        explicacion="Capacidad para identificar cuotas que se pagarán con atraso." />
      <KpiModelo titulo="Precisión" icono={<BellRing size={20} />} valor={porcentaje.format(m.precision)} proporcion={m.precision}
        detalle={x && alertas !== undefined ? `De ${alertas} alertas, ${x.verdaderos_positivos} correspondieron a morosidad.` : undefined}
        explicacion="Proporción de alertas que identificaron correctamente un atraso." />
      <KpiModelo titulo="F1-score" icono={<Scale size={20} />} valor={tresDecimales.format(m.f1)} proporcion={m.f1}
        detalle="Equilibrio entre precisión y recall (de 0 a 1)."
        explicacion="Medida que combina la detección de morosidad con la calidad de las alertas." />
    </div>
    <Ayuda pregunta="¿Qué significan recall, precisión y F1-score?">
      <p><strong>Recall:</strong> de todas las cuotas que realmente se pagaron tarde, cuántas avisó el modelo. Es la prioridad de la junta, porque un atraso sin aviso es el error que más cuesta. La meta era al menos 80 %.</p>
      <p><strong>Precisión:</strong> de todos los avisos del modelo, cuántos eran atrasos reales. Un aviso de más solo significa un recordatorio que no hacía falta.</p>
      <p><strong>F1-score:</strong> un solo número entre 0 y 1 que junta las dos anteriores; cuanto más cerca de 1, mejor.</p>
      {x && aTiempo !== undefined && <p>No usamos la exactitud como medida principal: en la prueba {aTiempo} de {x.cuotas} cuotas se pagaron a tiempo, así que un sistema que nunca avisa acertaría {porcentaje.format(aTiempo / x.cuotas)} sin detectar ningún atraso. El modelo acertó {porcentaje.format(m.accuracy)}.</p>}
    </Ayuda>
  </section>
}
// Probabilidad para mostrar: el modelo puede dar 0,9999; no se presenta como certeza del 100 %.
const probabilidad = (n: number) => (n >= 0.995 ? '> 99 %' : n < 0.005 ? '< 1 %' : `${Math.round(n * 100)} %`)
const ORDEN_RIESGO = { alto: 2, medio: 1, bajo: 0 }

/** Falla simulada del modelo (solo junta de demostración): muestra en vivo la degradación controlada. */
function FallaSimulada({ juntaId, onCambio }: { juntaId: string; onCambio: () => void }) {
  const { rpc, mostrar } = useApp()
  const [version, setVersion] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const e = useRpc<EstadoPrediccion>('estado_prediccion', { p_junta: juntaId }, [version])
  if (!e.data?.es_demo) return null
  const activa = e.data.simular_falla_modelo
  const cambiar = async () => {
    setOcupado(true)
    const r = await rpc('simular_falla_modelo', { p_junta: juntaId, p_activa: !activa })
    setOcupado(false)
    if (!r.ok) { mostrar(r.error, 'error'); return }
    mostrar(activa ? 'Modelo restablecido. Vuelve a calcular el riesgo.' : 'Falla simulada activada: el próximo cálculo usará la regla manual de respaldo.', 'info')
    setVersion(v => v + 1); onCambio()
  }
  return <div className={`info-callout ml-prueba-fallas ${activa ? 'aviso-experimental' : 'model-note'}`} role="note"><FlaskConical size={18} aria-hidden="true" /><span>
    <strong>Prueba de fallas (solo demostración).</strong> {activa ? 'Se está simulando que el modelo no responde.' : 'Simula que el modelo no responde para ver qué hace el sistema.'}{' '}
    <button type="button" className="button button-secondary button-small" disabled={ocupado} aria-busy={ocupado} onClick={() => void cambiar()}>{activa ? 'Restablecer el modelo' : 'Simular falla del modelo'}</button>
  </span></div>
}

/** Caso escrito a mano: el modelo responde a un registro nuevo con el esquema del MVP; las entradas inválidas se rechazan. */
function ProbarCaso({ juntaId }: { juntaId: string }) {
  const { rpc } = useApp()
  const vacio = { pagos_atrasados_previos: '', atrasos_previos_total: '', tasa_atraso_previa: '', dias_atraso_promedio_previo: '' }
  const [valores, setValores] = useState(vacio)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Evaluacion | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const campos: { k: keyof typeof vacio; etiqueta: string; ayuda: string }[] = [
    { k: 'pagos_atrasados_previos', etiqueta: 'Atrasos en los últimos 3 meses', ayuda: 'De 0 a 3' },
    { k: 'atrasos_previos_total', etiqueta: 'Atrasos en todo el historial', ayuda: 'Número entero' },
    { k: 'tasa_atraso_previa', etiqueta: 'Proporción de cuotas atrasadas', ayuda: 'De 0 a 1 (0.25 = 25 %)' },
    { k: 'dias_atraso_promedio_previo', etiqueta: 'Días de atraso promedio', ayuda: 'Número ≥ 0' },
  ]
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    setResultado(null)
    if (campos.some(c => valores[c.k].trim() === '')) { setError('Completa los cuatro datos del caso.'); return }
    setError(''); setOcupado(true)
    // Números como números; un texto no numérico se envía tal cual para que el servidor lo rechace con su mensaje.
    const entrada = Object.fromEntries(campos.map(c => { const v = valores[c.k].trim().replace(',', '.'); return [c.k, v !== '' && Number.isFinite(Number(v)) ? Number(v) : v] }))
    const r = await conLimite(rpc<Evaluacion>('probar_entrada_modelo', { p_junta: juntaId, p_entrada: entrada }))
    setOcupado(false)
    if (!r.ok) { setError(r.error); return }
    setResultado(r.data)
  }
  return <section className="ml-seccion" aria-labelledby="ml-probar">
    <div className="ml-seccion-head"><div><span className="eyebrow">3 · Probar el modelo</span><h2 id="ml-probar">Probar con un caso</h2>
      <p>Escribe el historial de una unidad imaginaria para ver qué responde el modelo. Queda en el registro de predicciones como «caso manual» y no cambia ninguna cuota.</p></div></div>
    <form className="panel form-stack ml-probar" onSubmit={e => void enviar(e)} noValidate>
      <div className="field-grid">{campos.map(c => <label key={c.k} className="field"><span>{c.etiqueta}</span>
        <input inputMode="decimal" value={valores[c.k]} aria-describedby={`ayuda-${c.k}`} onChange={e => setValores(v => ({ ...v, [c.k]: e.target.value }))} />
        <small id={`ayuda-${c.k}`}>{c.ayuda}</small></label>)}</div>
      {error && <div role="alert" className="form-error">{error}</div>}
      {resultado && <div role="status" className="info-callout model-note"><CheckCircle2 size={18} aria-hidden="true" /><span>
        Riesgo <strong>{resultado.nivel_riesgo}</strong>{resultado.probabilidad !== null ? ` · probabilidad de atraso ${probabilidad(Number(resultado.probabilidad))}` : ''} · {resultado.origen === 'modelo' ? `modelo ${resultado.modelo_version}` : `regla manual de respaldo (${MOTIVO_RESPALDO[resultado.motivo_respaldo ?? ''] ?? resultado.motivo_respaldo})`}. Acción sugerida: {ACCION[resultado.nivel_riesgo]}.
      </span></div>}
      <div className="form-actions"><button className="button button-secondary" disabled={ocupado} aria-busy={ocupado}><FlaskConical size={17} aria-hidden="true" /> {ocupado ? 'Calculando…' : 'Probar caso'}</button></div>
    </form>
  </section>
}

export function PrediccionPage() {
  const { usuario, datos, rpc, mostrar } = useApp()
  const [version, setVersion] = useState(0)
  const [modelo, setModelo] = useState<Modelo | null | undefined>(undefined)
  const [calculando, setCalculando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [aRecordar, setARecordar] = useState<Prediccion | null>(null)
  const [canal, setCanal] = useState<keyof typeof CANALES>('whatsapp')
  const [nota, setNota] = useState('')
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
    const r = await conLimite(rpc<RiesgoCalculado>('calcular_riesgo_morosidad', { p_junta: usuario.juntaId }))
    setCalculando(false)
    if (!r.ok) {
      mostrar(r.error.includes(REGLA_MANUAL) ? r.error : `${r.error} ${REGLA_MANUAL}`, 'error')
      setVersion(v => v + 1)
      // Tiempo agotado: el servidor puede terminar después; la lista se vuelve a consultar sola para mostrar el estado final.
      if (esTiempoAgotado(r.error)) for (const ms of [10000, 25000]) setTimeout(() => setVersion(v => v + 1), ms)
      return r.error
    }
    mostrar(r.data.cuotas ? resumenRiesgo(r.data) : 'No hay cuotas por vencer en los próximos 31 días.', r.data.cuotas && !r.data.respaldo ? 'ok' : 'info')
    setVersion(v => v + 1)
    return null
  }
  // Si ya hay resultados de hoy, se avisa antes de reemplazarlos.
  const pedirCalculo = () => { if ((p.data ?? []).some(x => x.generado_en.slice(0, 10) === hoyIso)) setConfirmar(true); else void calcular() }
  const recordar = async () => {
    if (!aRecordar) return null
    const r = await rpc('registrar_recordatorio', { p_cuota_id: aRecordar.cuota_id, p_canal: canal, p_nota: nota.trim() || null })
    if (!r.ok) return r.error
    mostrar(`Recordatorio registrado para ${aRecordar.unidad_codigo} (${CANALES[canal]}).`)
    setVersion(v => v + 1)
    return null
  }

  const lista = [...(p.data ?? [])].sort((a, b) => ORDEN_RIESGO[b.nivel_riesgo] - ORDEN_RIESGO[a.nivel_riesgo] || Number(b.probabilidad ?? 0) - Number(a.probabilidad ?? 0))
  const respaldo = lista.filter(x => x.origen === 'regla_respaldo')
  const motivos = [...new Set(respaldo.map(x => MOTIVO_RESPALDO[x.motivo_respaldo ?? ''] ?? x.motivo_respaldo))]
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

  const bajo = lista.filter(x => x.nivel_riesgo === 'bajo').length
  const calculadoEn = lista.reduce((u, x) => (x.generado_en > u ? x.generado_en : u), '')
  return <>
    <PageHead eyebrow="Apoyo a la cobranza" title="Predicción de morosidad" description="Prioriza recordatorios antes del vencimiento según el riesgo de pago con atraso."
      action={<button className="button button-primary" disabled={calculando} aria-busy={calculando} onClick={pedirCalculo}><RefreshCw size={17} aria-hidden="true" /> {calculando ? 'Calculando…' : 'Calcular riesgo de hoy'}</button>} />
    <div className="info-callout aviso-experimental" role="note"><AlertCircle size={18} /><span>
      <strong>Sugerencia automática, decisión humana.</strong> El modelo se entrenó con datos simulados de la junta de demostración; sus probabilidades no están validadas con vecinos reales. Úsalo solo como apoyo para priorizar recordatorios. La decisión es siempre de la administración, y nunca se usa para sancionar ni para decidir sobre un vecino (Ley N.° 31814).
    </span></div>
    {usuario && <FallaSimulada juntaId={usuario.juntaId} onCambio={() => setVersion(v => v + 1)} />}
    <DesempenoModelo modelo={modelo} />

    <section className="ml-seccion" aria-labelledby="ml-actuales">
      <div className="ml-seccion-head">
        <div><span className="eyebrow">2 · Inferencia actual</span><h2 id="ml-actuales">Predicciones actuales</h2>
          <p>Riesgo estimado por el modelo para las cuotas que vencen en los próximos 31 días{calculadoEn ? `, calculado el ${fechaHora.format(new Date(calculadoEn))}` : ''}. Son probabilidades, no certezas: sirven para decidir a quién recordar primero.</p></div>
      </div>
      <Ayuda pregunta="¿Qué significa el riesgo de morosidad?">Es la probabilidad, estimada por el modelo, de que una cuota que aún no vence se pague tarde. Se calcula solo con el historial de pagos anteriores de cada unidad. <strong>Riesgo alto</strong> significa que conviene enviar un recordatorio antes del vencimiento; <strong>medio</strong>, hacer seguimiento; <strong>bajo</strong>, que la unidad suele pagar a tiempo. Es una ayuda para priorizar, no una acusación: nunca se usa para sancionar.</Ayuda>
      {respaldo.length > 0 && <div className="info-callout aviso-experimental" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>
        <strong>El modelo no respondió para {respaldo.length} {respaldo.length === 1 ? 'cuota' : 'cuotas'}</strong> porque {motivos.join('; ')}. Se aplicó la <strong>regla manual de respaldo</strong>: riesgo alto si la unidad se atrasó en los últimos 3 meses. Esas filas no tienen probabilidad. Si el problema sigue, avisa a soporte y decide con tu criterio.
      </span></div>}
      {lista.length > 0 && <div className="stats-grid four">
        <Stat label="Cuotas evaluadas" value={lista.length} note="vencen en los próximos 31 días" icon={<CalendarClock size={20} aria-hidden="true" />} />
        <Stat label="Riesgo alto" value={alto} note="priorizar recordatorio" icon={<AlertCircle size={20} aria-hidden="true" />} tone="coral" />
        <Stat label="Riesgo medio" value={medio} note="hacer seguimiento" icon={<BrainCircuit size={20} aria-hidden="true" />} />
        <Stat label="Riesgo bajo" value={bajo} note="suelen pagar a tiempo" icon={<CheckCircle2 size={20} aria-hidden="true" />} tone="lime" />
      </div>}
    <div className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Cuotas por vencer</span><h2>Riesgo de pago con atraso</h2></div><span className="count-pill">Modelo {modelo.version}</span></div>
      {lista.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento horizontal"><table><thead><tr><th>Unidad</th><th>Vence</th><th>Probabilidad de atraso</th><th>Riesgo</th><th>Por qué</th><th>Acción sugerida</th></tr></thead><tbody>
        {lista.map(x => <tr key={x.cuota_id}><td className="strong">{x.unidad_codigo}</td><td>{fechaVisible(x.fecha_vencimiento)}</td>
          <td>{x.probabilidad !== null ? probabilidad(Number(x.probabilidad)) : <span className="muted">Regla manual</span>}</td>
          <td><span className={`badge badge-riesgo-${x.nivel_riesgo}`}>{x.nivel_riesgo}</span></td>
          <td className="celda-factores">{x.origen === 'regla_respaldo' ? (x.motivo_respaldo === 'entrada_fuera_de_rango' ? 'Datos por revisar' : x.nivel_riesgo === 'alto' ? 'Se atrasó en los últimos 3 meses' : 'Sin atrasos en los últimos 3 meses') : x.factores.length ? x.factores.map(f => FACTOR[f.variable] ?? f.variable).join(' · ') : 'Sin atrasos relevantes'}</td>
          <td>{x.nivel_riesgo === 'bajo' ? ACCION.bajo
            : x.ultimo_recordatorio ? <span className="muted celda-recordado">Recordado el {fechaHora.format(new Date(x.ultimo_recordatorio))}{x.canal_recordatorio ? ` (${CANALES[x.canal_recordatorio as keyof typeof CANALES] ?? x.canal_recordatorio})` : ''}</span>
            : <button type="button" className="button button-secondary button-small" onClick={() => { setCanal('whatsapp'); setNota(''); setARecordar(x) }}><MessageCircle size={15} aria-hidden="true" /> {ACCION[x.nivel_riesgo]}</button>}</td></tr>)}
      </tbody></table></div>
        : proximas === 0
          ? <Empty title="No hay cuotas por vencer" text={`Las cuotas de este mes ya vencieron. Genera las de ${mesVisible(siguiente)} en Cuotas y luego calcula el riesgo.`} action={<Link className="button button-secondary" to="/admin/cuotas">Ir a Cuotas</Link>} />
          : <Empty title="Aún no se calculó el riesgo de hoy" text="Pulsa «Calcular riesgo de hoy» para evaluar las cuotas por vencer. Mientras tanto no se muestran indicadores para no presentar cifras vacías como resultados." />}
    </div>
    </section>
    {usuario && <ProbarCaso juntaId={usuario.juntaId} />}
    <div className="info-callout model-note"><ShieldCheck size={18} aria-hidden="true" /><span>
      <strong>{modelo.algoritmo}</strong>, versión {modelo.version}, umbral {modelo.umbral}. Las probabilidades se calculan en la base de datos con los mismos coeficientes del modelo entrenado en Python.
      Cada cálculo queda en el registro de predicciones con sus datos de entrada, el resultado, la versión del modelo y la fecha.
      Solo la administración ve estas predicciones: los propietarios no ven su riesgo.
    </span></div>
    {p.error && <Empty title="No se pudo consultar" text={p.error} />}
    {confirmar && <ConfirmDialog titulo="¿Volver a calcular el riesgo?" icono={<RefreshCw size={22} />} descripcion={`Ya hay ${lista.length} predicciones calculadas hoy. Se calcularán otra vez con el modelo ${modelo.version} y los datos actuales, y reemplazarán a las anteriores.`} advertencias={['Si nadie pagó desde el último cálculo, el resultado será el mismo.']} textoConfirmar="Calcular de nuevo" textoProcesando="Calculando…" onCerrar={() => setConfirmar(false)} onConfirmar={calcular} />}
    {aRecordar && <ConfirmDialog titulo={`¿Registrar un recordatorio para ${aRecordar.unidad_codigo}?`} icono={<MessageCircle size={22} />}
      descripcion={<>La cuota vence el <strong>{fechaVisible(aRecordar.fecha_vencimiento)}</strong> y tiene riesgo <strong>{aRecordar.nivel_riesgo}</strong>. Envía el recordatorio por tu canal habitual y regístralo aquí para no repetirlo.</>}
      advertencias={['Queda en la auditoría con tu nombre y la fecha.', 'El vecino no ve su nivel de riesgo: el mensaje debe ser un recordatorio amable, no una advertencia.']}
      textoConfirmar="Registrar recordatorio" textoProcesando="Registrando…" onCerrar={() => setARecordar(null)} onConfirmar={recordar}>
      <label className="field"><span>Canal</span>
        <select value={canal} onChange={e => setCanal(e.target.value as keyof typeof CANALES)}>{Object.entries(CANALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field"><span>Nota (opcional)</span><input maxLength={200} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej.: se envió el enlace de pago" /></label>
    </ConfirmDialog>}
  </>
}
