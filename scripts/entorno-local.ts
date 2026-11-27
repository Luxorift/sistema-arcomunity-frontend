// Entorno de PRUEBAS 100 % local: una base PostgreSQL en memoria (PGlite) con TODAS las migraciones del repositorio
// (incluida la más reciente) y la junta de demostración cargada con la misma semilla del MVP (crearDatos), más una
// API mínima compatible con supabase-js (autenticación por contraseña, consultas REST y RPC) en http://localhost:54321.
//
// Para qué: probar en el navegador una migración nueva sin tocar el Supabase de producción ni sus datos compartidos.
// Qué NO es: un Supabase completo. No hay Realtime, Storage ni correo; las consultas REST admiten solo los filtros
// que usa la aplicación (eq, gte, is, order, limit y el embebido perfiles(...)). La autorización es la real:
// cada petición se ejecuta con el rol `authenticated` y las claims del usuario, así que RLS y exigir_admin aplican.
//
// Uso:
//   1) node scripts/entorno-local.ts                       (deja la API en http://localhost:54321)
//   2) .env.pruebas.local con VITE_SUPABASE_URL=http://localhost:54321 y VITE_SUPABASE_ANON_KEY=clave-local-de-pruebas
//   3) npx vite --mode pruebas --port 5174
// Cuentas: las de la semilla de demostración (src/model.ts), con la contraseña documentada en el README.
// Los datos viven en memoria: se pierden al cerrar el proceso.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { crearBaseDePrueba } from '../supabase/tests/db.ts'
import { crearDatos } from '../src/model.ts'

const PUERTO = Number(process.env.PUERTO_LOCAL ?? 54321)
const JUNTA_ID = '7a1c0de0-0000-4000-8000-000000000001'
const CODIGO_INVITACION = 'ARCO2026'
const CLAVE_DEMO = 'Demo2026!'          // misma clave de la semilla de demostración (scripts/seed-demo.ts)
const EMBEBIDOS: Record<string, string> = { perfiles: 'perfil_id' }
// Formato JSON igual al de PostgREST: fechas «AAAA-MM-DD» (no objetos Date) y numeric como número.
const COMO_POSTGREST = { parsers: { 1082: (v: string) => v, 1700: (v: string) => Number(v) } }

// ------------------------------------------------------------------------------------------------- base y semilla
const db: PGlite = await crearBaseDePrueba()
const semilla = crearDatos()
// Identificadores deterministas (derivados de la semilla): la sesión del navegador sigue válida tras reiniciar.
const idDe = (local: string) => {
  const h = createHash('sha1').update(`arcomunity-local:${local}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const cfg = semilla.configuracion
await db.query(`insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, yape_titular, conciliacion_automatica, es_simulado)
  values ($1, $2, $3, $4, $5, $6, true)`, [JUNTA_ID, cfg.nombre, cfg.cuotaMensual, cfg.diaVencimiento, cfg.yapeTitular, cfg.conciliacionAutomatica])
await db.query('insert into public.juntas_invitacion (junta_id, codigo) values ($1, $2)', [JUNTA_ID, CODIGO_INVITACION])
for (const u of semilla.unidades) {
  await db.query('insert into public.unidades (id, junta_id, codigo, activa, es_simulado) values ($1, $2, $3, $4, true)', [idDe(u.id), JUNTA_ID, u.codigo, u.activa])
}
for (const c of semilla.usuarios) {
  const meta: Record<string, string> = { nombre_completo: c.nombre, acepto_datos: 'true' }
  if (c.rol === 'propietario' && c.unidadId) Object.assign(meta, { codigo_invitacion: CODIGO_INVITACION, unidad_id: idDe(c.unidadId) })
  const id = idDe(`usuario:${c.correo.toLowerCase()}`)
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values ($1, $2, 'local', '{"demo": true}', $3)`,
    [id, c.correo.toLowerCase(), JSON.stringify(meta)])
  if (c.rol === 'admin') await db.query(`insert into public.miembros_junta (junta_id, perfil_id, rol) values ($1, $2, 'admin')`, [JUNTA_ID, id])
}
for (const c of semilla.cuotas) {
  await db.query(`insert into public.cuotas (id, junta_id, unidad_id, periodo, monto, fecha_vencimiento, estado, es_simulado)
    values ($1, $2, $3, $4, $5, $6, $7, true)`, [idDe(c.id), JUNTA_ID, idDe(c.unidadId), c.periodo, c.monto, c.vencimiento, c.estado === 'en_revision' ? 'en_revision' : 'pendiente'])
}
for (const p of semilla.pagos) {
  await db.query(`insert into public.pagos (id, junta_id, cuota_id, unidad_id, metodo, monto_declarado, fecha_operacion, numero_operacion, estado,
      alertas, subido_en, conciliado_en, es_simulado) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
  [idDe(p.id), JUNTA_ID, idDe(p.cuotaId), idDe(p.unidadId), p.metodo, p.monto, p.fecha, p.operacion, p.estado, p.alertas, p.subidoEn, p.conciliadoEn ?? null])
}
for (const c of semilla.cuotas.filter(x => x.estado === 'pagada')) {
  await db.query(`update public.cuotas set estado = 'pagada', fecha_pago = $2, pago_id = $3 where id = $1`, [idDe(c.id), c.fechaPago, idDe(c.pagoId!)])
}
for (const e of semilla.egresos) {
  await db.query(`insert into public.egresos (junta_id, fecha, concepto, beneficiario, monto, comentario, es_simulado) values ($1, $2, $3, $4, $5, $6, true)`,
    [JUNTA_ID, e.fecha, e.concepto, e.beneficiario, e.monto, e.comentario])
}
for (const c of semilla.camaras) {
  await db.query('insert into public.camaras (junta_id, nombre, ubicacion, tipo, url, activa) values ($1, $2, $3, $4, $5, $6)',
    [JUNTA_ID, c.nombre, c.ubicacion, c.tipo, c.url ?? null, c.activa])
}
await db.query(`update public.juntas set modo_demo = true where id = $1`, [JUNTA_ID])
await db.query('select public.guardar_estado_demo($1)', [JUNTA_ID])
const resumen = (await db.query<{ c: number; p: number }>(`select (select count(*)::int from public.cuotas) as c, (select count(*)::int from public.pagos) as p`)).rows[0]

// ------------------------------------------------------------------------------------------------- identidad
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
// Token autocontenido (solo pruebas locales): el usuario se lee del propio token, así sobrevive a un reinicio.
const cerrados = new Set<string>()
function idDeToken(token?: string) {
  if (!token || cerrados.has(token) || !token.endsWith('.local')) return undefined
  try { return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub?: string }).sub } catch { return undefined }
}
async function usuarioPorId(id: string) {
  const r = (await db.query<{ id: string; email: string; raw_app_meta_data: unknown; raw_user_meta_data: unknown; created_at: string }>(
    'select id, email, raw_app_meta_data, raw_user_meta_data, created_at from auth.users where id = $1', [id])).rows[0]
  return r && { id: r.id, aud: 'authenticated', role: 'authenticated', email: r.email, app_metadata: r.raw_app_meta_data,
    user_metadata: r.raw_user_meta_data, created_at: r.created_at, email_confirmed_at: r.created_at }
}
async function sesionPara(id: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp })}.local`
  const refresh = `${id}.${randomUUID()}`
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: await usuarioPorId(id) }
}

// Una sola conexión: las peticiones se ejecutan en fila para que el rol y las claims no se mezclen.
let cola: Promise<unknown> = Promise.resolve()
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn)
  cola = r.catch(() => undefined)
  return r
}
async function comoUsuario<T>(token: string | undefined, fn: () => Promise<T>) {
  return enFila(async () => {
    const id = idDeToken(token)
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(id ? { sub: id, role: 'authenticated' } : { role: 'anon' })])
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`)
    try { return await fn() } finally { await db.exec('reset role') }
  })
}

// ------------------------------------------------------------------------------------------------- REST mínima
const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`Identificador no admitido: ${s}`), { code: 'PGRST100' }); return `"${s}"` }

async function consultar(tabla: string, q: URLSearchParams) {
  const columnas: string[] = []
  for (const parte of (q.get('select') ?? '*').split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean)) {
    const emb = /^([a-z_]+)\(([^)]*)\)$/.exec(parte)
    if (emb) {
      const fk = EMBEBIDOS[emb[1]]
      if (!fk) throw new Error(`Embebido no admitido: ${emb[1]}`)
      const cols = emb[2].split(',').map(s => ident(s.trim())).join(', ')
      columnas.push(`(select to_jsonb(e) from (select ${cols} from public.${ident(emb[1])} x where x.id = t.${ident(fk)}) e) as ${ident(emb[1])}`)
    } else columnas.push(parte === '*' ? 't.*' : `t.${ident(parte)}`)
  }
  const donde: string[] = [], params: unknown[] = []
  let orden = '', limite = '', desde = ''
  for (const [k, v] of q) {
    if (k === 'select') continue
    if (k === 'offset') { desde = ` offset ${Number.parseInt(v, 10)}`; continue }
    if (k === 'order') { orden = ' order by ' + v.split(',').map(o => { const [c, d] = o.split('.'); return `t.${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}` }).join(', '); continue }
    if (k === 'limit') { limite = ` limit ${Number.parseInt(v, 10)}`; continue }
    const [op, ...resto] = v.split('.'); const valor = resto.join('.')
    if (op === 'is') { donde.push(`t.${ident(k)} is ${valor === 'null' ? 'null' : valor === 'true' ? 'true' : 'false'}`); continue }
    const sql = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '<>' }[op]
    if (!sql) throw new Error(`Operador no admitido: ${op}`)
    params.push(valor); donde.push(`t.${ident(k)}::text ${sql} $${params.length}`)
  }
  const texto = `select ${columnas.join(', ')} from public.${ident(tabla)} t${donde.length ? ' where ' + donde.join(' and ') : ''}${orden}${limite}${desde}`
  return (await db.query(texto, params, COMO_POSTGREST)).rows
}

async function llamar(fn: string, args: Record<string, unknown>) {
  const meta = (await db.query<{ retset: boolean; args: string[] | null; tipos: string[] }>(
    `select p.proretset as retset, p.proargnames as args, array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])).rows[0]
  if (!meta) throw Object.assign(new Error(`No existe la función public.${fn}`), { code: 'PGRST202' })
  const nombres = Object.keys(args)
  const tipo = (k: string) => meta.tipos[(meta.args ?? []).indexOf(k)] ?? 'text'
  const lista = nombres.map((k, i) => `${ident(k)} => $${i + 1}::${tipo(k)}`).join(', ')
  const valores = nombres.map(k => { const v = args[k]; return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v) })
  if (meta.retset) return (await db.query(`select * from public.${ident(fn)}(${lista})`, valores, COMO_POSTGREST)).rows
  return (await db.query<{ r: unknown }>(`select to_jsonb(public.${ident(fn)}(${lista})) as r`, valores)).rows[0]?.r ?? null
}

// ------------------------------------------------------------------------------------------------- servidor
let retraso: { ms: number; funciones: string[] } = { ms: 0, funciones: [] }
function responder(res: ServerResponse, estado: number, cuerpo?: unknown) {
  res.writeHead(estado, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' })
  res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo))
}
const leerCuerpo = (req: IncomingMessage) => new Promise<Record<string, unknown>>(ok => {
  let s = ''; req.on('data', d => { s += d }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}) } catch { ok({}) } })
})

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PUERTO}`)
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const t0 = Date.now()
  try {
    if (req.method === 'OPTIONS') return responder(res, 204)
    if (url.pathname === '/auth/v1/token') {
      const b = await leerCuerpo(req)
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const id = String(b.refresh_token ?? '').split('.')[0] || undefined
        return id ? responder(res, 200, await enFila(() => sesionPara(id))) : responder(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
      }
      const fila = await enFila(async () => (await db.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [String(b.email ?? '')])).rows[0])
      if (!fila || b.password !== CLAVE_DEMO) return responder(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' })
      return responder(res, 200, await enFila(() => sesionPara(fila.id)))
    }
    if (url.pathname === '/auth/v1/user') {
      const id = idDeToken(token)
      return id ? responder(res, 200, await enFila(() => usuarioPorId(id))) : responder(res, 401, { msg: 'no autenticado' })
    }
    if (url.pathname === '/auth/v1/logout') { if (token) cerrados.add(token); return responder(res, 204) }
    if (url.pathname.startsWith('/auth/v1/')) return responder(res, 200, {})
    // Solo pruebas: demora controlada de algunas RPC para comprobar el tiempo límite del cliente (8 s).
    // POST /__pruebas/retraso {"ms": 12000, "funciones": ["calcular_riesgo_morosidad"]}  ·  {"ms": 0} lo quita.
    if (url.pathname === '/__pruebas/retraso' && req.method === 'POST') {
      const b = await leerCuerpo(req)
      retraso = { ms: Math.max(0, Math.min(60000, Number(b.ms) || 0)), funciones: Array.isArray(b.funciones) ? b.funciones.map(String) : [] }
      console.log(`${new Date().toISOString()} retraso de prueba: ${retraso.ms} ms en ${retraso.funciones.join(', ') || '(ninguna)'}`)
      return responder(res, 200, retraso)
    }
    const rpc = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(url.pathname)
    if (rpc && req.method === 'POST') {
      const args = await leerCuerpo(req)
      if (retraso.ms && retraso.funciones.includes(rpc[1])) await new Promise(ok => setTimeout(ok, retraso.ms))
      const r = await comoUsuario(token, () => llamar(rpc[1], args))
      console.log(`${new Date().toISOString()} rpc ${rpc[1]} ${Date.now() - t0} ms`)
      return responder(res, 200, r)
    }
    const tabla = /^\/rest\/v1\/([a-z_0-9]+)$/.exec(url.pathname)
    if (tabla && req.method === 'GET') {
      const filas = await comoUsuario(token, () => consultar(tabla[1], url.searchParams))
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
        if (filas.length !== 1) return responder(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${filas.length} rows`, hint: null })
        return responder(res, 200, filas[0])
      }
      return responder(res, 200, filas)
    }
    return responder(res, 404, { message: `No disponible en el entorno local: ${req.method} ${url.pathname}` })
  } catch (e) {
    const err = e as { message: string; code?: string }
    console.log(`${new Date().toISOString()} error ${url.pathname}: ${err.message}`)
    return responder(res, 400, { code: err.code ?? 'P0001', message: err.message, details: null, hint: null })
  }
}).listen(PUERTO, () => {
  console.log(`Entorno local listo en http://localhost:${PUERTO} · ${resumen.c} cuotas y ${resumen.p} pagos simulados · junta demo ${JUNTA_ID}`)
  console.log(`Cuentas: ${semilla.usuarios.map(u => `${u.correo} (${u.rol})`).join(', ')}`)
})
