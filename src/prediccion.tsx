// Predicción de morosidad. Pendiente de conectar: no hay modelo entrenado ni predicciones reales.
// La pantalla solo muestra resultados que existan en la base (predicciones_vigentes) para un
// modelo activo registrado en modelos_ml. Nunca inventa probabilidades.
import { BrainCircuit, CalendarClock, Database, ShieldCheck } from 'lucide-react'
import { dinero, fechaVisible } from './model'
import { useApp } from './store'
import { useRpc } from './lib/usarRpc'
import { Cargando, Empty, PageHead } from './ui'

type Prediccion = { cuota_id: string; unidad_codigo: string; fecha_vencimiento: string; probabilidad: number; nivel_riesgo: 'bajo' | 'medio' | 'alto'; factores: { variable: string; aporte: number }[]; modelo_version: string; generado_en: string }

export function PrediccionPage() {
  const { usuario, datos } = useApp()
  const p = useRpc<Prediccion[]>('predicciones_vigentes', usuario ? { p_junta: usuario.juntaId } : null)
  const proximas = datos.cuotas.filter(c => c.estado === 'pendiente' && c.vencimiento >= new Date().toISOString().slice(0, 10)).length

  return <>
    <PageHead eyebrow="APOYO A LA COBRANZA" title="Predicción de morosidad" description="Prioriza recordatorios antes del vencimiento según el riesgo de pago con atraso." />
    {p.cargando ? <Cargando /> : p.data && p.data.length > 0 ? <div className="panel"><div className="table-wrap"><table><thead><tr><th>Unidad</th><th>Vence</th><th>Probabilidad de atraso</th><th>Riesgo</th><th>Modelo</th></tr></thead><tbody>
      {p.data.map(x => <tr key={x.cuota_id}><td className="strong">{x.unidad_codigo}</td><td>{fechaVisible(x.fecha_vencimiento)}</td><td>{Math.round(Number(x.probabilidad) * 100)} %</td><td><span className={`badge badge-riesgo-${x.nivel_riesgo}`}>{x.nivel_riesgo}</span></td><td>{x.modelo_version}</td></tr>)}
    </tbody></table></div></div>
      : <div className="panel pending-feature">
        <div className="pending-feature-head"><BrainCircuit size={28} /><div><span className="eyebrow">PENDIENTE DE CONECTAR</span><h2>El modelo aún no está disponible</h2></div></div>
        <p>Esta función mostrará la probabilidad de que cada cuota próxima a vencer se pague con atraso. Se activará cuando el equipo entrene y registre el modelo con el dataset del proyecto. Hasta entonces no se muestran resultados para no presentar datos inventados.</p>
        <div className="feature-facts">
          <div><CalendarClock size={20} /><span><strong>{proximas}</strong> cuotas pendientes aún no vencidas que se podrían evaluar</span></div>
          <div><Database size={20} /><span>Datos de entrada listos: historial de pagos previos sin información futura</span></div>
          <div><ShieldCheck size={20} /><span>Unidades seudonimizadas; solo la administración verá los resultados</span></div>
        </div>
        <p className="muted">Cuota de referencia: {dinero(datos.configuracion.cuotaMensual)}. Contrato técnico: <code>docs/ml-contrato.md</code>.</p>
      </div>}
    {p.error && <Empty title="No se pudo consultar" text={p.error} />}
  </>
}
