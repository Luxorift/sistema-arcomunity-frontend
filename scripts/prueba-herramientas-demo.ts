// Herramientas de demostración contra Supabase real (migración 1300), como las usaría la web:
// permisos por rol, preparar (dos veces, sin duplicar), un ensayo con pago y comprobante, reiniciar,
// auditoría conservada y escenarios de vuelta. MODIFICA solo la junta de demostración y la deja en su
// estado inicial (reiniciada). Uso: npm run test:herramientas
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL!, ANON = process.env.VITE_SUPABASE_ANON_KEY!, SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL_SB || !ANON || !SERVICIO) { console.error('Faltan variables en .env.local'); process.exit(1) }
const JUNTA = '7a1c0de0-0000-4000-8000-000000000001'
const CLAVE = 'Demo2026!'
const op = { auth: { persistSession: false, autoRefreshToken: false } }
const sb = createClient(URL_SB, SERVICIO, op)
let fallos = 0
const ok = (c: boolean, m: string) => { if (!c) fallos++; console.log(`${c ? '✓' : '✗'} ${m}`) }

async function cliente(correo: string) {
  const c = createClient(URL_SB, ANON, op)
  const { error } = await c.auth.signInWithPassword({ email: correo, password: CLAVE })
  if (error) throw new Error(`${correo}: ${error.message}`)
  return c
}
const rpc = async <T>(c: SupabaseClient, fn: string) => { const r = await c.rpc(fn, { p_junta: JUNTA }); return r as { data: T; error: { message: string } | null } }
const contarAuditoria = async () => (await sb.from('auditoria').select('*', { count: 'exact', head: true }).eq('junta_id', JUNTA)).count ?? 0

type Prep = { periodo: string; cuotas_creadas: number; cuotas_existentes: number; predicciones: number; alto: number; medio: number; bajo: number; avisos: string[]; escenarios: { cuenta: string; ok: boolean }[] }
type Diag = { cuotas_mes_siguiente: number; predicciones_hoy: number; escenarios: { cuenta: string; ok: boolean }[]; cambios: Record<string, number> }

const admin = await cliente('admin@arcomunity.demo')
const casa12 = await cliente('casa12@arcomunity.demo')
const anon = createClient(URL_SB, ANON, op)

// 1) Permisos
for (const fn of ['preparar_demostracion', 'reiniciar_demostracion', 'diagnostico_demostracion']) {
  const a = await rpc(anon, fn)
  ok(!!a.error, `visitante sin sesión no puede ${fn} (${a.error?.message.slice(0, 50)})`)
  const p = await rpc(casa12, fn)
  ok(!!p.error && /permiso/i.test(p.error.message), `propietaria Casa 12 no puede ${fn} («${p.error?.message}»)`)
}
for (const fn of ['restaurar_demo_datos', 'escenarios_demo']) {
  const r = await rpc(admin, fn)
  ok(!!r.error, `la administración no llama directo a ${fn}`)
}

// 2) Estado de partida: se reinicia para empezar desde la foto.
const auditoria0 = await contarAuditoria()
const r0 = await rpc<{ ok: boolean }>(admin, 'reiniciar_demostracion')
ok(!r0.error && r0.data.ok, `reinicio inicial ${r0.error?.message ?? 'correcto'}`)
const d0 = (await rpc<Diag>(admin, 'diagnostico_demostracion')).data
ok(d0.escenarios.every(e => e.ok), `escenarios en la foto: ${d0.escenarios.map(e => `${e.cuenta} ${e.ok ? 'ok' : 'NO'}`).join(', ')}`)
ok(d0.cuotas_mes_siguiente === 0 && d0.predicciones_hoy === 0, `foto sin cuotas del mes siguiente ni predicciones (${d0.cuotas_mes_siguiente}, ${d0.predicciones_hoy})`)

// 3) Preparar dos veces
const p1 = await rpc<Prep>(admin, 'preparar_demostracion')
ok(!p1.error, `preparar: ${p1.error?.message ?? `${p1.data.cuotas_creadas} cuotas creadas de ${p1.data.periodo}, ${p1.data.predicciones} predicciones (alto ${p1.data.alto}, medio ${p1.data.medio}, bajo ${p1.data.bajo}), avisos ${p1.data.avisos.length}`}`)
ok(p1.data?.cuotas_creadas === 30 && p1.data?.predicciones === 30, '30 cuotas nuevas y 30 predicciones')
const vig1 = (await admin.rpc('predicciones_vigentes', { p_junta: JUNTA })).data as { cuota_id: string; probabilidad: number; nivel_riesgo: string }[]
const p2 = await rpc<Prep>(admin, 'preparar_demostracion')
ok(!p2.error && p2.data.cuotas_creadas === 0 && p2.data.cuotas_existentes === 30 && p2.data.predicciones === 30, `preparar otra vez no duplica (${p2.data?.cuotas_creadas} nuevas, ${p2.data?.cuotas_existentes} existentes)`)
const vig2 = (await admin.rpc('predicciones_vigentes', { p_junta: JUNTA })).data as typeof vig1
const firma = (v: typeof vig1) => JSON.stringify([...v].sort((a, b) => a.cuota_id.localeCompare(b.cuota_id)).map(x => [x.cuota_id, Number(x.probabilidad), x.nivel_riesgo]))
ok(vig1.length === 30 && firma(vig1) === firma(vig2), `mismas 30 probabilidades al repetir (alto ${vig2.filter(x => x.nivel_riesgo === 'alto').length}, bajo ${vig2.filter(x => x.nivel_riesgo === 'bajo').length})`)
const { count: filas } = await sb.from('predicciones_morosidad').select('*', { count: 'exact', head: true }).eq('junta_id', JUNTA)
ok(filas === 30, `30 filas de predicción en la base, sin duplicados (${filas})`)

// 4) Ensayo: Casa 12 paga la cuota vencida con un comprobante y la administración registra un egreso.
const { data: u12 } = await sb.from('unidades').select('id').eq('junta_id', JUNTA).eq('codigo', 'Casa 12').single()
const { data: cuota } = await sb.from('cuotas').select('id, monto').eq('unidad_id', u12!.id).eq('estado', 'pendiente').order('periodo').limit(1).single()
const ruta = `${JUNTA}/${u12!.id}/${crypto.randomUUID()}.jpg`
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'), c => c.charCodeAt(0))
const sub = await casa12.storage.from('comprobantes').upload(ruta, png, { contentType: 'image/jpeg' })
ok(!sub.error, `Casa 12 sube un comprobante de ensayo ${sub.error?.message ?? ''}`)
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const pago = await casa12.rpc('enviar_pago', { p_cuota_id: cuota!.id, p_metodo: 'yape_captura', p_monto: Number(cuota!.monto), p_fecha_operacion: hoy, p_numero_operacion: `ENS${Date.now() % 1e8}`, p_comprobante_path: ruta })
ok(!pago.error, `Casa 12 envía el pago (${pago.error?.message ?? (pago.data as { estado: string }).estado})`)
const eg = await admin.rpc('registrar_egreso', { p_junta: JUNTA, p_fecha: hoy, p_concepto: 'otros', p_beneficiario: 'Ensayo automático', p_monto: 10, p_comentario: null })
ok(!eg.error, 'la administración registra un egreso de ensayo')
const d1 = (await rpc<Diag>(admin, 'diagnostico_demostracion')).data
ok(d1.cambios.pagos_nuevos === 1 && d1.cambios.egresos_nuevos === 1 && d1.cambios.cuotas_nuevas === 30, `el diagnóstico ve el ensayo: ${JSON.stringify(d1.cambios)}`)

// 5) Reiniciar
const r1 = await rpc<{ ok: boolean; pagos_quitados: number; predicciones_quitadas: number; archivos: { bucket: string; nombre: string }[] }>(admin, 'reiniciar_demostracion')
ok(!r1.error && r1.data.pagos_quitados === 1 && r1.data.predicciones_quitadas === 30, `reiniciar: ${r1.error?.message ?? `${r1.data.pagos_quitados} pago quitado, ${r1.data.predicciones_quitadas} predicciones quitadas, ${r1.data.archivos.length} archivo(s) por borrar`}`)
ok(r1.data?.archivos.some(a => a.nombre === ruta), 'el comprobante del ensayo figura como sobrante')
const nombres = r1.data.archivos.filter(a => a.bucket === 'comprobantes').map(a => a.nombre)
const borrado = await admin.storage.from('comprobantes').remove(nombres)
ok(!borrado.error && (borrado.data ?? []).length === nombres.length, `la administración borra los ${nombres.length} archivo(s) del ensayo (${(borrado.data ?? []).length})`)
const { data: quedan } = await sb.storage.from('comprobantes').list(`${JUNTA}/${u12!.id}`)
ok(!(quedan ?? []).some(o => ruta.endsWith(o.name)), 'el comprobante del ensayo ya no está en Storage')
const d2 = (await rpc<Diag>(admin, 'diagnostico_demostracion')).data
ok(Object.values(d2.cambios).every(n => n === 0) && d2.escenarios.every(e => e.ok), `de vuelta al estado inicial: ${JSON.stringify(d2.cambios)}, escenarios ${d2.escenarios.every(e => e.ok) ? 'ok' : 'NO'}`)

// 6) Auditoría conservada con quién hizo cada operación
const auditoria1 = await contarAuditoria()
ok(auditoria1 > auditoria0, `la auditoría solo crece (${auditoria0} → ${auditoria1})`)
const { data: ult } = await sb.from('auditoria').select('accion, actor_nombre').eq('junta_id', JUNTA).in('accion', ['preparar_demo', 'reiniciar_demo']).order('id', { ascending: false }).limit(4)
ok((ult ?? []).some(a => a.accion === 'reiniciar_demo' && a.actor_nombre !== 'Sistema') && (ult ?? []).some(a => a.accion === 'preparar_demo'), `registros: ${(ult ?? []).map(a => `${a.accion} (${a.actor_nombre})`).join(', ')}`)

// 7) La restauración nocturna sigue programada y las cuentas demo entran.
const e = (await sb.rpc('estado_demo', { p_junta: JUNTA })).data as { restauracion_nocturna: { horario: string; activa: boolean }[] }
ok(e.restauracion_nocturna?.[0]?.horario === '0 8 * * *' && e.restauracion_nocturna[0].activa, 'restauración nocturna 03:00 Lima activa')
const rs = await sb.rpc('restaurar_estado_demo', { p_junta: JUNTA })
ok(!rs.error, `la restauración del servicio (la de pg_cron) funciona ${rs.error?.message ?? ''}`)
await Promise.all([admin, casa12].map(c => c.auth.signOut()))
console.log(`\nResultado: ${fallos ? `${fallos} fallo(s)` : 'todo correcto'}`)
process.exit(fallos ? 1 : 0)
