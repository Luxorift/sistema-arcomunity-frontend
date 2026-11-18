// Prueba contra Supabase real de la predicción de morosidad (migración 1200): flujo de la administración con
// cuotas futuras, permisos y aislamiento de propietarios. Genera las cuotas del mes siguiente en la junta demo,
// calcula el riesgo y al final restaura la demostración (restaurar_estado_demo) y borra las predicciones de
// prueba, para no alterar los datos de referencia.
// Uso: npm run test:prediccion   (requiere VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const servicio = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY!, opciones)
const JUNTA = '7a1c0de0-0000-4000-8000-000000000001'

let ok = 0, fallos = 0
const check = (n: string, c: boolean, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { fallos++; console.log(`  ✗ ${n} ${d}`) } }
async function sesion(correo: string): Promise<SupabaseClient> {
  const c = createClient(URL_SB, ANON, opciones)
  const { error } = await c.auth.signInWithPassword({ email: correo, password: 'Demo2026!' })
  if (error) throw new Error(`${correo}: ${error.message}`)
  return c
}

const hoy = ((await createClient(URL_SB, ANON, opciones).rpc('servidor_ahora')).data as { hoy_lima: string }).hoy_lima
const [a, m] = hoy.split('-').map(Number)
const siguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
const admin = await sesion('admin@arcomunity.demo')
const casa12 = await sesion('casa12@arcomunity.demo')
const dpto301 = await sesion('dpto301@arcomunity.demo')
const anonimo = createClient(URL_SB, ANON, opciones)

try {
  console.log(`\n1. Modelo activo (hoy ${hoy})`)
  const { data: modelo } = await admin.from('modelos_ml').select('version, umbral').eq('activo', true).maybeSingle()
  check('la administración ve el modelo activo v1', modelo?.version === 'v1', JSON.stringify(modelo))
  check('un propietario no ve el registro del modelo', ((await casa12.from('modelos_ml').select('version')).data ?? []).length === 0)

  console.log(`\n2. Flujo de la administración con cuotas de ${siguiente}`)
  const gen = await admin.rpc('generar_cuotas', { p_junta: JUNTA, p_periodo: siguiente })
  check('genera las cuotas del mes siguiente', !gen.error, gen.error?.message)
  const calc = await admin.rpc('calcular_riesgo_morosidad', { p_junta: JUNTA })
  const r = calc.data as { cuotas: number; alto: number; medio: number; bajo: number; modelo_version: string }
  console.log('   resumen:', JSON.stringify(r))
  check('calcula el riesgo de las 30 cuotas por vencer', !calc.error && r.cuotas === 30, calc.error?.message)
  const vig = await admin.rpc('predicciones_vigentes', { p_junta: JUNTA })
  const lista = (vig.data ?? []) as { probabilidad: number; nivel_riesgo: string; factores: unknown[]; modelo_version: string; fecha_vencimiento: string }[]
  check('predicciones_vigentes devuelve las 30, del modelo v1, por vencer', lista.length === 30 && lista.every(p => p.modelo_version === 'v1' && p.fecha_vencimiento >= hoy))
  check('probabilidades válidas y niveles coherentes con el umbral', lista.every(p => p.probabilidad >= 0 && p.probabilidad <= 1 && (p.nivel_riesgo === 'alto') === (p.probabilidad >= 0.2258 - 1e-4)))
  check('el número de riesgos altos coincide con el resumen', lista.filter(p => p.nivel_riesgo === 'alto').length === r.alto)
  const segunda = await admin.rpc('calcular_riesgo_morosidad', { p_junta: JUNTA })
  const { count } = await servicio.from('predicciones_morosidad').select('id', { count: 'exact', head: true }).eq('junta_id', JUNTA).eq('fecha_corte', hoy)
  check('recalcular el mismo día no duplica predicciones', !segunda.error && count === 30, String(count))
  check('la administración no puede usar una fecha de corte pasada', /fecha de hoy/.test((await admin.rpc('calcular_riesgo_morosidad', { p_junta: JUNTA, p_fecha_corte: '2026-11-01' })).error?.message ?? ''))
  const { data: aud } = await servicio.from('auditoria').select('accion, detalle').eq('junta_id', JUNTA).eq('accion', 'calcular_riesgo_morosidad').order('creado_en', { ascending: false }).limit(1)
  check('el cálculo queda en la auditoría', aud?.[0]?.detalle?.modelo === 'v1')

  console.log('\n3. Aislamiento de propietarios y visitantes')
  for (const [nombre, c] of [['casa12', casa12], ['dpto301', dpto301]] as const) {
    check(`${nombre} no calcula riesgo`, /permiso/i.test((await c.rpc('calcular_riesgo_morosidad', { p_junta: JUNTA })).error?.message ?? ''))
    check(`${nombre} no lee predicciones (ni la suya)`, ((await c.from('predicciones_morosidad').select('id')).data ?? []).length === 0)
    check(`${nombre} no consulta predicciones_vigentes`, !!(await c.rpc('predicciones_vigentes', { p_junta: JUNTA })).error)
  }
  check('un visitante no calcula riesgo', !!(await anonimo.rpc('calcular_riesgo_morosidad', { p_junta: JUNTA })).error)
  check('un visitante no lee predicciones', ((await anonimo.from('predicciones_morosidad').select('id')).data ?? []).length === 0)
  check('las funciones internas no se exponen', !!(await admin.rpc('ml_probabilidad', { p_parametros: {}, p_entrada: {} })).error)
} finally {
  const res = await servicio.rpc('restaurar_estado_demo', { p_junta: JUNTA })
  await servicio.from('predicciones_morosidad').delete().eq('junta_id', JUNTA)
  const { count: cuotasSig } = await servicio.from('cuotas').select('id', { count: 'exact', head: true }).eq('junta_id', JUNTA).eq('periodo', siguiente)
  const { count: preds } = await servicio.from('predicciones_morosidad').select('id', { count: 'exact', head: true }).eq('junta_id', JUNTA)
  check('limpieza: demo restaurada, sin cuotas de prueba ni predicciones', !res.error && cuotasSig === 0 && preds === 0, res.error?.message)
}
console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas`)
process.exit(fallos ? 1 : 0)
