// Pruebas de integración contra el proyecto Supabase real (Auth, PostgREST, RLS, Storage, Realtime).
// Uso: npm run test:remoto   (requiere la semilla de demostración cargada)
// Crea un propietario de prueba, una junta temporal y archivos de prueba; al final los elimina y
// devuelve la cuota usada a su estado inicial. La auditoría generada se conserva (es inmutable).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_SB = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL_SB || !ANON || !SERVICIO) { console.error('Faltan variables en .env.local'); process.exit(1) }

const JUNTA = '7a1c0de0-0000-4000-8000-000000000001'
const CLAVE_DEMO = 'Demo2026!'
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(URL_SB, SERVICIO, opciones)
const nuevo = () => createClient(URL_SB, ANON, opciones)

let ok = 0
const fallos: string[] = []
function check(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) } else { fallos.push(nombre); console.log(`  ✗ ${nombre} ${detalle}`) }
}
const seccion = (t: string) => console.log(`\n${t}`)
async function sesion(correo: string, clave = CLAVE_DEMO) {
  const c = nuevo()
  const { error } = await c.auth.signInWithPassword({ email: correo, password: clave })
  if (error) throw new Error(`No se pudo iniciar sesión como ${correo}: ${error.message}`)
  return c
}
const jpg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...crypto.getRandomValues(new Uint8Array(64)), 0xff, 0xd9])], { type: 'image/jpeg' })
const hoyLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const periodo = `${hoyLima.slice(0, 7)}-01`

// Estado a limpiar
const limpieza = { usuarios: [] as string[], juntas: [] as string[], archivos: [] as string[], pagos: [] as string[], cuotaRestaurar: null as null | { id: string }, qr: '' as string, qrAnterior: null as string | null }

async function main() {
  // --- Preparación: unidad libre con cuota pendiente del mes ----------------------------------
  const { data: libres } = await nuevo().rpc('unidades_disponibles', { p_codigo: 'ARCO2026' })
  const { data: pendientes } = await admin.from('cuotas').select('id, unidad_id, monto').eq('junta_id', JUNTA).eq('periodo', periodo).eq('estado', 'pendiente')
  const objetivo = (libres as { unidad_id: string; codigo: string }[]).find(u => pendientes?.some(c => c.unidad_id === u.unidad_id))
  if (!objetivo) throw new Error('No hay una unidad libre con cuota pendiente este mes. Recarga la semilla.')
  const cuota = pendientes!.find(c => c.unidad_id === objetivo.unidad_id)!
  limpieza.cuotaRestaurar = { id: cuota.id }
  console.log(`Unidad de prueba: ${objetivo.codigo} · cuota ${periodo} · S/ ${cuota.monto}`)

  seccion('1. Visitante sin sesión')
  const anon = nuevo()
  for (const t of ['juntas', 'cuotas', 'pagos', 'perfiles', 'egresos', 'auditoria', 'juntas_invitacion']) {
    const r = await anon.from(t).select('*').limit(1)
    check(`no lee ${t}`, r.error?.code === '42501', r.error?.message ?? 'devolvió datos')
  }
  check('obtiene hora del servidor (America/Lima)', (await anon.rpc('servidor_ahora')).data?.hoy_lima === hoyLima)
  check('código falso no revela unidades', ((await anon.rpc('unidades_disponibles', { p_codigo: 'FALSO123' })).data ?? []).length === 0)
  check('código válido lista unidades libres', ((await anon.rpc('unidades_disponibles', { p_codigo: 'arco2026' })).data ?? []).length === (libres as unknown[]).length)
  check('no sube comprobantes', !!(await anon.storage.from('comprobantes').upload(`${JUNTA}/${objetivo.unidad_id}/x.jpg`, jpg())).error)
  check('no ejecuta funciones de administración', (await anon.rpc('generar_cuotas', { p_junta: JUNTA })).error?.code === '42501')

  seccion('2. Registro de propietario')
  const correoPrueba = `prueba.${Date.now()}@arcomunity.test`
  const reg = nuevo()
  const malo = await reg.auth.signUp({ email: `malo.${Date.now()}@arcomunity.test`, password: 'Prueba2026!', options: { data: { nombre_completo: 'X', codigo_invitacion: 'FALSO123', unidad_id: objetivo.unidad_id, acepto_datos: 'true' } } })
  check('rechaza código inválido', !!malo.error)
  const sinConsentimiento = await reg.auth.signUp({ email: `sc.${Date.now()}@arcomunity.test`, password: 'Prueba2026!', options: { data: { nombre_completo: 'X', codigo_invitacion: 'ARCO2026', unidad_id: objetivo.unidad_id, acepto_datos: 'false' } } })
  check('rechaza registro sin consentimiento', !!sinConsentimiento.error)
  const r = await reg.auth.signUp({ email: correoPrueba, password: 'Prueba2026!', options: { data: { nombre_completo: 'Vecina de Prueba', codigo_invitacion: 'ARCO2026', unidad_id: objetivo.unidad_id, acepto_datos: 'true', rol: 'admin' } } })
  if (r.data.user) limpieza.usuarios.push(r.data.user.id)
  check('registra con código y unidad libre', !r.error && !!r.data.user, r.error?.message)
  if (!r.data.session) throw new Error('Supabase exige confirmar el correo: desactiva "Confirm email" para estas pruebas.')
  const prop = reg
  const ctx = (await prop.rpc('mi_contexto')).data as { membresias: { rol: string; unidades: { id: string }[] }[] }
  check('el rol pedido en metadata se ignora (queda propietario)', ctx.membresias.length === 1 && ctx.membresias[0].rol === 'propietario')
  check('queda vinculado a su unidad', ctx.membresias[0].unidades[0]?.id === objetivo.unidad_id)
  const otro = await nuevo().auth.signUp({ email: `dup.${Date.now()}@arcomunity.test`, password: 'Prueba2026!', options: { data: { nombre_completo: 'Duplicado', codigo_invitacion: 'ARCO2026', unidad_id: objetivo.unidad_id, acepto_datos: 'true' } } })
  if (otro.data.user) limpieza.usuarios.push(otro.data.user.id)
  check('no permite dos propietarios para la misma unidad', !!otro.error)

  seccion('3. Aislamiento del propietario (RLS)')
  const misCuotas = (await prop.from('cuotas').select('unidad_id')).data ?? []
  check('solo ve cuotas de su unidad', misCuotas.length > 0 && misCuotas.every(c => c.unidad_id === objetivo.unidad_id), `${misCuotas.length} filas`)
  check('no ve egresos', ((await prop.from('egresos').select('id')).data ?? []).length === 0)
  check('no ve auditoría', ((await prop.from('auditoria').select('id')).data ?? []).length === 0)
  check('no ve el código de invitación', ((await prop.from('juntas_invitacion').select('codigo')).data ?? []).length === 0)
  check('no ve perfiles de otros vecinos', ((await prop.from('perfiles').select('id')).data ?? []).length === 1)
  check('no modifica cuotas directamente', (await prop.from('cuotas').update({ estado: 'pagada' }).eq('id', cuota.id)).error?.code === '42501')
  check('no genera cuotas', /permiso/i.test((await prop.rpc('generar_cuotas', { p_junta: JUNTA })).error?.message ?? ''))
  check('no puede subir a la carpeta de otra unidad', !!(await prop.storage.from('comprobantes').upload(`${JUNTA}/${(libres as { unidad_id: string }[]).find(u => u.unidad_id !== objetivo.unidad_id)!.unidad_id}/x.jpg`, jpg())).error)

  seccion('4. Pago declarado, Realtime y conciliación')
  const adminA = await sesion('admin@arcomunity.demo')
  let eventos = 0
  const canal = adminA.channel('prueba-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'pagos', filter: `junta_id=eq.${JUNTA}` }, () => { eventos++ })
  await new Promise<void>(res => canal.subscribe(s => { if (s === 'SUBSCRIBED') res() }))
  // El servidor de Realtime tarda un instante en activar la suscripción tras SUBSCRIBED.
  await new Promise(res => setTimeout(res, 2000))

  const path1 = `${JUNTA}/${objetivo.unidad_id}/${crypto.randomUUID()}.jpg`
  const sub1 = await prop.storage.from('comprobantes').upload(path1, jpg(), { contentType: 'image/jpeg' })
  limpieza.archivos.push(path1)
  check('sube comprobante a su carpeta privada', !sub1.error, sub1.error?.message)
  const op1 = `T${Date.now().toString().slice(-9)}`
  const p1 = await prop.rpc('enviar_pago', { p_cuota_id: cuota.id, p_metodo: 'yape_captura', p_monto: Number(cuota.monto) - 10, p_fecha_operacion: hoyLima, p_numero_operacion: op1, p_comprobante_path: path1 })
  const pago1 = p1.data as { pago_id: string; estado: string; alertas: string[] }
  if (pago1?.pago_id) limpieza.pagos.push(pago1.pago_id)
  check('monto distinto pasa a revisión con alerta R1', pago1?.estado === 'pendiente_revision' && pago1.alertas.includes('monto_no_coincide'), p1.error?.message)
  check('no permite enviar otro pago mientras está en revisión', /revisión/.test((await prop.rpc('enviar_pago', { p_cuota_id: cuota.id, p_metodo: 'yape_captura', p_monto: 150, p_fecha_operacion: hoyLima, p_numero_operacion: 'OTRA1234', p_comprobante_path: path1 })).error?.message ?? ''))
  for (let t = 0; t < 30 && eventos === 0; t++) await new Promise(res => setTimeout(res, 500))
  check('el administrador recibe el cambio en tiempo real', eventos > 0, `${eventos} eventos`)
  await adminA.removeChannel(canal)

  const vecino08 = await sesion('casa08@arcomunity.demo')
  check('otro propietario no ve ese pago', ((await vecino08.from('pagos').select('id').eq('id', pago1.pago_id)).data ?? []).length === 0)
  check('otro propietario no abre ese comprobante', !!(await vecino08.storage.from('comprobantes').createSignedUrl(path1, 60)).error)
  const url = await adminA.storage.from('comprobantes').createSignedUrl(path1, 60)
  check('el administrador abre el comprobante con URL firmada', !!url.data?.signedUrl, url.error?.message)
  if (url.data?.signedUrl) check('la URL firmada descarga la imagen', (await fetch(url.data.signedUrl)).ok)

  check('rechazar sin motivo falla', /motivo/.test((await adminA.rpc('revisar_pago', { p_pago_id: pago1.pago_id, p_decision: 'rechazar', p_motivo: '' })).error?.message ?? ''))
  check('rechaza con motivo', !(await adminA.rpc('revisar_pago', { p_pago_id: pago1.pago_id, p_decision: 'rechazar', p_motivo: 'El monto no coincide con la cuota' })).error)
  check('la cuota vuelve a pendiente', (await prop.from('cuotas').select('estado').eq('id', cuota.id).single()).data?.estado === 'pendiente')
  check('el propietario ve el motivo', (await prop.from('pagos').select('motivo_rechazo').eq('id', pago1.pago_id).single()).data?.motivo_rechazo === 'El monto no coincide con la cuota')

  const path2 = `${JUNTA}/${objetivo.unidad_id}/${crypto.randomUUID()}.jpg`
  await prop.storage.from('comprobantes').upload(path2, jpg(), { contentType: 'image/jpeg' })
  limpieza.archivos.push(path2)
  const p2 = await prop.rpc('enviar_pago', { p_cuota_id: cuota.id, p_metodo: 'plin_captura', p_monto: Number(cuota.monto), p_fecha_operacion: hoyLima, p_numero_operacion: `T${Date.now().toString().slice(-9)}`, p_comprobante_path: path2, p_ocr_confianza: 91 })
  const pago2 = p2.data as { pago_id: string; estado: string }
  if (pago2?.pago_id) limpieza.pagos.push(pago2.pago_id)
  check('pago correcto se valida por reglas y la cuota queda pagada', pago2?.estado === 'conciliado_auto' && (await prop.from('cuotas').select('estado').eq('id', cuota.id).single()).data?.estado === 'pagada', p2.error?.message)
  check('reutilizar el mismo comprobante falla', !!(await prop.rpc('enviar_pago', { p_cuota_id: cuota.id, p_metodo: 'yape_captura', p_monto: 150, p_fecha_operacion: hoyLima, p_numero_operacion: 'X12345678', p_comprobante_path: path2 })).error)

  check('el administrador revierte la validación automática', !(await adminA.rpc('revisar_pago', { p_pago_id: pago2.pago_id, p_decision: 'rechazar', p_motivo: 'No figura en la app de Yape' })).error)
  const manual = await adminA.rpc('registrar_pago_manual', { p_cuota_id: cuota.id, p_metodo: 'efectivo', p_monto: Number(cuota.monto), p_fecha_operacion: hoyLima, p_nota: 'Prueba de integración' })
  const pago3 = manual.data as { pago_id: string }
  if (pago3?.pago_id) limpieza.pagos.push(pago3.pago_id)
  check('registra pago manual en efectivo', !manual.error && (await adminA.from('cuotas').select('estado').eq('id', cuota.id).single()).data?.estado === 'pagada', manual.error?.message)

  seccion('5. Cuotas, métricas, reportes y transparencia')
  const gen = (await adminA.rpc('generar_cuotas', { p_junta: JUNTA })).data as { creadas: number; existentes: number }
  check('generar cuotas del mes es idempotente', gen?.creadas === 0 && gen.existentes === 30, JSON.stringify(gen))
  const met = (await adminA.rpc('metricas_periodo', { p_junta: JUNTA, p_periodo: periodo })).data as Record<string, number>
  const { data: cuotasMes } = await admin.from('cuotas').select('id, estado').eq('junta_id', JUNTA).eq('periodo', periodo)
  const { data: pagosMes } = await admin.from('pagos').select('monto_declarado, estado, cuota_id').in('cuota_id', (cuotasMes ?? []).map(c => c.id)).in('estado', ['conciliado_auto', 'conciliado_manual'])
  const suma = (pagosMes ?? []).reduce((n, p) => n + Number(p.monto_declarado), 0)
  check('recaudado coincide con la suma de pagos conciliados', Number(met.recaudado) === suma, `${met.recaudado} vs ${suma}`)
  check('cuotas pagadas coinciden con la base', met.cuotas_pagadas === (cuotasMes ?? []).filter(c => c.estado === 'pagada').length)
  const serie = (await adminA.rpc('serie_mensual', { p_junta: JUNTA, p_meses: 12 })).data as unknown[]
  check('serie mensual de 12 meses', serie?.length === 12)
  const tr = (await prop.rpc('transparencia', { p_junta: JUNTA, p_periodo: periodo })).data as { unidades: Record<string, unknown>[]; recaudado: number }
  check('transparencia: totales iguales a los del administrador', Number(tr.recaudado) === Number(met.recaudado))
  check('transparencia: sin nombres, correos ni montos individuales', tr.unidades.length === 30 && Object.keys(tr.unidades[0]).sort().join() === 'codigo,es_mia,estado,fecha_pago' && !/Vecina demo|Vecino demo|Vecina de Prueba|Administración demo|@/.test(JSON.stringify(tr.unidades)))
  check('transparencia: marca solo la unidad propia', tr.unidades.filter(u => u.es_mia).length === 1)
  const ds = (await adminA.rpc('exportar_dataset_morosidad', { p_junta: JUNTA })).data as Record<string, unknown>[]
  check('dataset: columnas del contrato APF2 + origen', Object.keys(ds[0]).join() === 'unidad_ref,periodo,monto,fecha_vencimiento,fecha_pago,dias_atraso,metodo_pago,pagos_atrasados_previos,moroso,es_simulado,origen')
  check('dataset: seudónimos, sin códigos de unidad', ds.every(f => /^U-[0-9a-f]{10}$/.test(String(f.unidad_ref))))
  check('dataset: todas las filas rotuladas como simuladas', ds.every(f => f.origen === 'simulado'))
  check('dataset: excluye cuotas sin etiqueta definitiva', ds.every(f => !(f.fecha_pago === null && f.moroso === 0)))
  console.log(`    (dataset: ${ds.length} filas, ${ds.filter(f => f.moroso === 1).length} morosas)`)
  check('propietario no exporta el dataset', !!(await prop.rpc('exportar_dataset_morosidad', { p_junta: JUNTA })).error)
  const feats = (await adminA.rpc('ml_caracteristicas_cuotas', { p_junta: JUNTA, p_fecha_corte: periodo })).data as Record<string, unknown>[]
  check('características ML sin fecha_pago, dias_atraso ni método actual', feats.length > 0 && !('fecha_pago' in feats[0]) && !('dias_atraso' in feats[0]) && !('metodo_pago' in feats[0]))
  check('sin predicciones ficticias', ((await adminA.rpc('predicciones_vigentes', { p_junta: JUNTA })).data as unknown[]).length === 0)

  seccion('6. Aislamiento entre juntas')
  const juntaB = crypto.randomUUID()
  limpieza.juntas.push(juntaB)
  await admin.from('juntas').insert({ id: juntaB, nombre: 'Junta temporal de pruebas', cuota_mensual: 99, es_simulado: true })
  const ub = await admin.auth.admin.createUser({ email: `adminb.${Date.now()}@arcomunity.test`, password: 'Prueba2026!', email_confirm: true, user_metadata: { nombre_completo: 'Admin B' } })
  limpieza.usuarios.push(ub.data.user!.id)
  await admin.from('miembros_junta').insert({ junta_id: juntaB, perfil_id: ub.data.user!.id, rol: 'admin' })
  const adminB = await sesion(ub.data.user!.email!, 'Prueba2026!')
  check('admin B no ve cuotas de la junta A', ((await adminB.from('cuotas').select('id').eq('junta_id', JUNTA)).data ?? []).length === 0)
  check('admin B no ve perfiles de la junta A', ((await adminB.from('perfiles').select('id')).data ?? []).length === 1)
  check('admin B no genera cuotas en la junta A', !!(await adminB.rpc('generar_cuotas', { p_junta: JUNTA })).error)
  check('admin B no abre comprobantes de la junta A', !!(await adminB.storage.from('comprobantes').createSignedUrl(path1, 60)).error)
  check('admin A no ve la junta B', ((await adminA.from('juntas').select('id').eq('id', juntaB)).data ?? []).length === 0)

  seccion('6b. Código de invitación (migración 0900)')
  const genB = await adminB.rpc('generar_codigo_invitacion', { p_junta: juntaB })
  const codigoB = String(genB.data ?? '')
  check('el administrador genera un código ARCO-XXXX-XXXX con letras y números', /^ARCO-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(codigoB) && /\d/.test(codigoB.slice(5)) && /[A-Z]/.test(codigoB.slice(5)), genB.error?.message ?? codigoB)
  check('el código generado queda guardado en su junta', (await admin.from('juntas_invitacion').select('codigo').eq('junta_id', juntaB).single()).data?.codigo === codigoB)
  check('el código generado funciona en el registro', !(await nuevo().rpc('unidades_disponibles', { p_codigo: codigoB.toLowerCase() })).error)
  check('otro administrador no cambia el código de la junta B', !!(await adminA.rpc('generar_codigo_invitacion', { p_junta: juntaB })).error)
  check('un visitante no genera códigos', (await nuevo().rpc('generar_codigo_invitacion', { p_junta: juntaB })).error?.code === '42501')
  check('rechaza códigos débiles (solo letras o muy cortos)', !!(await admin.from('juntas_invitacion').update({ codigo: 'SOLOLETRAS' }).eq('junta_id', juntaB)).error && !!(await admin.from('juntas_invitacion').update({ codigo: 'AB12' }).eq('junta_id', juntaB)).error)
  check('nadie lee los intentos fallidos desde la API', !!(await nuevo().from('intentos_invitacion').select('id').limit(1)).error)
  check('el código de la demostración sigue intacto', (await admin.from('juntas_invitacion').select('codigo').eq('junta_id', JUNTA).single()).data?.codigo === 'ARCO2026')

  seccion('7. QR de Yape en Storage privado')
  const qrPath = `${JUNTA}/qr-prueba-${crypto.randomUUID()}.jpg`
  check('el propietario no puede subir el QR', !!(await prop.storage.from('junta-archivos').upload(qrPath, jpg(), { contentType: 'image/jpeg' })).error)
  const subeQr = await adminA.storage.from('junta-archivos').upload(qrPath, jpg(), { contentType: 'image/jpeg' })
  limpieza.qr = qrPath
  check('el administrador sube el QR', !subeQr.error, subeQr.error?.message)
  const { data: juntaAntes } = await admin.from('juntas').select('yape_qr_path').eq('id', JUNTA).single()
  limpieza.qrAnterior = juntaAntes?.yape_qr_path ?? null
  check('registra el QR en la configuración', !(await adminA.rpc('actualizar_qr_yape', { p_junta: JUNTA, p_path: qrPath })).error)
  check('rechaza una ruta de QR inexistente', !!(await adminA.rpc('actualizar_qr_yape', { p_junta: JUNTA, p_path: `${JUNTA}/no-existe.jpg` })).error)
  check('el propietario ve el QR con URL firmada', !!(await prop.storage.from('junta-archivos').createSignedUrl(qrPath, 60)).data?.signedUrl)
  check('el admin de otra junta no ve el QR', !!(await adminB.storage.from('junta-archivos').createSignedUrl(qrPath, 60)).error)
  check('un visitante no ve el QR', !!(await nuevo().storage.from('junta-archivos').createSignedUrl(qrPath, 60)).error)

  seccion('8. Auditoría')
  const acciones = ((await adminA.from('auditoria').select('accion').eq('junta_id', JUNTA).order('creado_en', { ascending: false }).limit(30)).data ?? []).map(a => a.accion)
  check('registra registro, pagos, rechazo, reversión y pago manual', ['registro_propietario', 'pago_en_revision', 'rechazar_pago', 'pago_conciliado_auto', 'revertir_pago', 'pago_manual'].every(a => acciones.includes(a)), acciones.join(','))
  check('el administrador no puede borrar la auditoría', (await adminA.from('auditoria').delete().eq('junta_id', JUNTA)).error?.code === '42501')
}

async function limpiar() {
  seccion('Limpieza')
  if (limpieza.cuotaRestaurar) await admin.from('cuotas').update({ estado: 'pendiente', fecha_pago: null, pago_id: null }).eq('id', limpieza.cuotaRestaurar.id)
  if (limpieza.pagos.length) await admin.from('pagos').delete().in('id', limpieza.pagos)
  if (limpieza.archivos.length) await admin.storage.from('comprobantes').remove(limpieza.archivos)
  if (limpieza.qr) { await admin.from('juntas').update({ yape_qr_path: limpieza.qrAnterior }).eq('id', JUNTA); await admin.storage.from('junta-archivos').remove([limpieza.qr]) }
  for (const id of limpieza.juntas) await admin.from('juntas').delete().eq('id', id)
  for (const id of limpieza.usuarios) await admin.auth.admin.deleteUser(id)
  console.log(`  cuota restaurada, ${limpieza.pagos.length} pagos, ${limpieza.archivos.length} archivos, ${limpieza.juntas.length} junta y ${limpieza.usuarios.length} usuarios de prueba eliminados`)
}

try {
  await main()
} catch (e) {
  fallos.push(`excepción: ${(e as Error).message}`)
  console.error(e)
} finally {
  await limpiar()
  console.log(`\nResultado: ${ok} correctas, ${fallos.length} fallidas`)
  if (fallos.length) { console.log(fallos.map(f => ` - ${f}`).join('\n')); process.exitCode = 1 }
}
