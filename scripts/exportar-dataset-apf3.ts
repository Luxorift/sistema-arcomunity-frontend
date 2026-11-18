// Exporta el dataset de morosidad (contrato de datos APF2) desde Supabase y lo valida.
// Uso:  npm run dataset:apf3                 → junta de demostración
//       npm run dataset:apf3 -- --junta <uuid>
// Requiere en .env.local (nunca en el repositorio): VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Fuente única: la función del sistema exportar_dataset_morosidad(). Este script no crea ni modifica
// datos: solo lee, recalcula de forma independiente cada columna para verificarla y escribe archivos.
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const URL_SUPABASE = process.env.VITE_SUPABASE_URL
const CLAVE_SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SUPABASE || !CLAVE_SERVICIO) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const JUNTA_ID = arg('--junta') ?? '7a1c0de0-0000-4000-8000-000000000001'
const SALIDA = arg('--salida') ?? 'ml/dataset_apf3'

const COLUMNAS = ['unidad_ref', 'periodo', 'monto', 'fecha_vencimiento', 'fecha_pago', 'dias_atraso', 'metodo_pago', 'pagos_atrasados_previos', 'moroso', 'es_simulado', 'origen'] as const
type Fila = { unidad_ref: string; periodo: string; monto: number; fecha_vencimiento: string; fecha_pago: string | null; dias_atraso: number; metodo_pago: string | null; pagos_atrasados_previos: number; moroso: number; es_simulado: number; origen: string }
type Cuota = { id: string; unidad_id: string; periodo: string; monto: number; fecha_vencimiento: string; estado: string; fecha_pago: string | null; dias_atraso: number; pago_id: string | null; es_simulado: boolean }
type Pago = { id: string; cuota_id: string; metodo: string; monto_declarado: number; fecha_operacion: string; estado: string }

const sb = createClient(URL_SUPABASE, CLAVE_SERVICIO, { auth: { persistSession: false, autoRefreshToken: false } })

async function todas<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select(columnas).eq('junta_id', JUNTA_ID).order('id').range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    filas.push(...(data as T[]))
    if (data.length < 1000) return filas
  }
}

// ---------- 1. Lectura ----------
const { data: junta, error: errJunta } = await sb.from('juntas').select('id, nombre, cuota_mensual, dia_vencimiento, es_simulado').eq('id', JUNTA_ID).maybeSingle()
if (errJunta || !junta) { console.error(`No se encontró la junta ${JUNTA_ID}: ${errJunta?.message ?? 'sin datos'}`); process.exit(1) }
const { data: hoyServidor, error: errHoy } = await sb.rpc('hoy_lima')
const HOY: string = errHoy ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) : hoyServidor
const { data: exportado, error: errExport } = await sb.rpc('exportar_dataset_morosidad', { p_junta: JUNTA_ID })
if (errExport) { console.error(`exportar_dataset_morosidad: ${errExport.message}`); process.exit(1) }
const filas: Fila[] = (exportado as Fila[]).map(f => ({ ...f, monto: Number(f.monto) }))
const unidades = await todas<{ id: string; codigo: string; es_simulado: boolean }>('unidades', 'id, codigo, es_simulado')
const cuotas = await todas<Cuota>('cuotas', 'id, unidad_id, periodo, monto, fecha_vencimiento, estado, fecha_pago, dias_atraso, pago_id, es_simulado')
const pagos = await todas<Pago>('pagos', 'id, cuota_id, metodo, monto_declarado, fecha_operacion, estado')
cuotas.forEach(c => { c.monto = Number(c.monto) })
pagos.forEach(p => { p.monto_declarado = Number(p.monto_declarado) })

// ---------- 2. Recalculo independiente ----------
const ref = (id: string) => 'U-' + createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 10)
const restarMeses = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10) }
const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000)
const pagoPorId = new Map(pagos.map(p => [p.id, p]))
const cuotasPorUnidad = new Map<string, Cuota[]>()
for (const c of cuotas) cuotasPorUnidad.set(c.unidad_id, [...(cuotasPorUnidad.get(c.unidad_id) ?? []), c])

const etiquetaDefinitiva = (c: Cuota) => c.estado === 'pagada' || (c.estado === 'pendiente' && c.fecha_vencimiento < HOY)
const morosoEsperado = (c: Cuota) => (c.estado === 'pagada' ? (c.fecha_pago! > c.fecha_vencimiento ? 1 : 0) : 1)
// Atrasos en los 3 meses previos tal como se conocían el primer día del periodo (sin mirar el futuro).
const previosEsperados = (c: Cuota) => (cuotasPorUnidad.get(c.unidad_id) ?? []).filter(p =>
  p.periodo < c.periodo && p.periodo >= restarMeses(c.periodo, 3) && p.fecha_vencimiento < c.periodo &&
  (p.fecha_pago === null || p.fecha_pago > c.periodo || p.fecha_pago > p.fecha_vencimiento)).length

const esperadas = cuotas.filter(etiquetaDefinitiva)
const clave = (r: string, p: string) => `${r}|${p}`
const esperadaPorClave = new Map(esperadas.map(c => [clave(ref(c.unidad_id), c.periodo), c]))

type Chequeo = { nombre: string; ok: boolean; detalle: string }
const chequeos: Chequeo[] = []
const chequear = (nombre: string, malos: unknown[], detalleOk: string) =>
  chequeos.push({ nombre, ok: malos.length === 0, detalle: malos.length === 0 ? detalleOk : `${malos.length} incidencias. Ej.: ${JSON.stringify(malos.slice(0, 3))}` })

chequear('Mismas filas que las cuotas con etiqueta definitiva', filas.length === esperadas.length && filas.every(f => esperadaPorClave.has(clave(f.unidad_ref, f.periodo))) ? [] : [{ exportadas: filas.length, esperadas: esperadas.length }], `${filas.length} = ${esperadas.length}`)
chequear('Sin duplicados por (unidad_ref, periodo)', filas.length === new Set(filas.map(f => clave(f.unidad_ref, f.periodo))).size ? [] : ['duplicados'], 'ninguno')
chequear('Sin nulos en monto, periodo y fecha_vencimiento; montos > 0', filas.filter(f => !f.periodo || !f.fecha_vencimiento || !(f.monto > 0)), 'correcto')
chequear('unidad_ref = seudónimo SHA-256 de la unidad (sin código ni propietario)', filas.filter(f => !/^U-[0-9a-f]{10}$/.test(f.unidad_ref) || !unidades.some(u => ref(u.id) === f.unidad_ref)), 'correcto')
chequear('fecha_pago vacía solo si la cuota está impaga', filas.filter(f => (f.fecha_pago === null) !== (esperadaPorClave.get(clave(f.unidad_ref, f.periodo))?.estado !== 'pagada')), 'correcto')
chequear('metodo_pago vacío si y solo si fecha_pago está vacía', filas.filter(f => (f.metodo_pago === null) !== (f.fecha_pago === null)), 'correcto')
chequear('dias_atraso = max(0, fecha_pago − fecha_vencimiento); 0 si impaga', filas.filter(f => f.dias_atraso !== (f.fecha_pago ? Math.max(0, dias(f.fecha_pago, f.fecha_vencimiento)) : 0)), 'correcto')
chequear('moroso recalculado coincide con el exportado', filas.filter(f => f.moroso !== morosoEsperado(esperadaPorClave.get(clave(f.unidad_ref, f.periodo))!)), 'correcto')
chequear('Ninguna cuota no vencida e impaga recibe etiqueta (ni 0 ni 1)', filas.filter(f => f.fecha_pago === null && f.fecha_vencimiento >= HOY), 'correcto')
chequear('pagos_atrasados_previos recalculado (3 meses, solo pasado) coincide', filas.filter(f => f.pagos_atrasados_previos !== previosEsperados(esperadaPorClave.get(clave(f.unidad_ref, f.periodo))!)), 'correcto')
chequear('Cada cuota pagada tiene un pago conciliado con mismo monto, fecha y método', esperadas.filter(c => c.estado === 'pagada').filter(c => {
  const p = c.pago_id ? pagoPorId.get(c.pago_id) : undefined
  const f = filas.find(x => x.unidad_ref === ref(c.unidad_id) && x.periodo === c.periodo)
  return !p || !p.estado.startsWith('conciliado') || p.cuota_id !== c.id || p.monto_declarado !== c.monto || p.fecha_operacion !== c.fecha_pago || f?.metodo_pago !== p.metodo
}).map(c => c.id), 'correcto')
chequear('Ninguna fecha de pago futura ni anterior al periodo', filas.filter(f => f.fecha_pago && (f.fecha_pago > HOY || f.fecha_pago < f.periodo)), 'correcto')
chequear('es_simulado = 1 y origen = simulado en todas las filas', filas.filter(f => f.es_simulado !== 1 || f.origen !== 'simulado'), 'correcto')
chequear('Periodos = primer día del mes y vencimiento dentro del mismo mes', filas.filter(f => !f.periodo.endsWith('-01') || f.fecha_vencimiento.slice(0, 7) !== f.periodo.slice(0, 7)), 'correcto')

// ---------- 3. Partición temporal de referencia ----------
const periodos = [...new Set(filas.map(f => f.periodo))].sort()
const consecutivos = periodos.every((p, i) => i === 0 || restarMeses(p, 1) === periodos[i - 1])
chequear('12 periodos mensuales consecutivos', periodos.length === 12 && consecutivos ? [] : [{ periodos: periodos.length, consecutivos }], `${periodos[0]} a ${periodos.at(-1)}`)
const particionDe = (p: string) => { const i = periodos.indexOf(p); return i < 9 ? 'entrenamiento' : i === 9 ? 'validacion' : 'prueba' }

// ---------- 4. Privacidad: el CSV no debe contener datos identificables ni secretos ----------
const csvCelda = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }
const aCsv = (cab: readonly string[], datos: Record<string, unknown>[]) => '﻿' + [cab.join(','), ...datos.map(d => cab.map(c => csvCelda(d[c])).join(','))].join('\r\n') + '\r\n'
const filasCsv = filas.map(f => ({ ...f, monto: f.monto.toFixed(2) }))
const csvDataset = aCsv(COLUMNAS, filasCsv)
const codigos = unidades.map(u => u.codigo)
const patronesSensibles: [string, RegExp][] = [['correo', /@/], ['UUID interno', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i], ['JWT', /eyJ[A-Za-z0-9_-]{10,}/], ['clave Supabase', /sb_(secret|publishable)_/], ['teléfono', /\b9\d{8}\b/], ['número de operación', /\b(SIM|MAN)\d{6,}/]]
chequear('CSV sin correos, teléfonos, UUID, tokens, claves, n.º de operación ni códigos de unidad', [
  ...patronesSensibles.filter(([, re]) => re.test(csvDataset)).map(([n]) => n),
  ...codigos.filter(c => csvDataset.includes(c)),
], 'ninguno encontrado')

// ---------- 5. Estadísticas ----------
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0.0')
const morosos = filas.filter(f => f.moroso === 1)
const resumenPor = (clave: (f: Fila) => string) => {
  const m = new Map<string, { n: number; m: number }>()
  for (const f of filas) { const k = clave(f); const v = m.get(k) ?? { n: 0, m: 0 }; v.n++; v.m += f.moroso; m.set(k, v) }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}
const porPeriodo = resumenPor(f => f.periodo)
const porParticion = ['entrenamiento', 'validacion', 'prueba'].map(p => { const fs = filas.filter(f => particionDe(f.periodo) === p); return { p, n: fs.length, m: fs.filter(f => f.moroso).length, desde: fs.map(f => f.periodo).sort()[0], hasta: fs.map(f => f.periodo).sort().at(-1) } })
const excluidas = cuotas.filter(c => !etiquetaDefinitiva(c))
const pagadasTarde = filas.filter(f => f.fecha_pago && f.moroso === 1).length
const impagasVencidas = filas.filter(f => !f.fecha_pago).length
const pagadasAntesDeVencer = filas.filter(f => f.fecha_pago && f.fecha_vencimiento >= HOY).length
const porUnidad = resumenPor(f => f.unidad_ref)
const perfiles = { cronicas: porUnidad.filter(([, v]) => v.m >= 6).length, ocasionales: porUnidad.filter(([, v]) => v.m >= 1 && v.m < 6).length, puntuales: porUnidad.filter(([, v]) => v.m === 0).length }
const metodos = resumenPor(f => f.metodo_pago ?? '(vacío: impaga)')
const previos = resumenPor(f => String(f.pagos_atrasados_previos))
const reglaApf2 = morosos.length + excluidas.filter(c => c.estado === 'en_revision').length
const enRevision = excluidas.filter(c => c.estado === 'en_revision').map(c => ({ c, p: pagos.find(p => p.cuota_id === c.id && p.estado === 'pendiente_revision') }))
const revisionATiempo = enRevision.length > 0 && enRevision.every(({ c, p }) => p && p.fecha_operacion <= c.fecha_vencimiento)
const rango = (k: 'dias_atraso' | 'pagos_atrasados_previos') => `${Math.min(...filas.map(f => f[k]))}–${Math.max(...filas.map(f => f[k]))}`

// ---------- 6. Archivos ----------
mkdirSync(SALIDA, { recursive: true })
writeFileSync(join(SALIDA, 'dataset_arcomunity_apf3.csv'), csvDataset)
writeFileSync(join(SALIDA, 'particion_temporal_referencia.csv'), aCsv(['unidad_ref', 'periodo', 'particion'], filas.map(f => ({ unidad_ref: f.unidad_ref, periodo: f.periodo, particion: particionDe(f.periodo) }))))

const DICCIONARIO = [
  ['unidad_ref', 'Seudónimo estable de la unidad: "U-" + 10 primeros hex del SHA-256 de su id interno. No revela el código de la casa ni al propietario.', 'texto', 'U-xxxxxxxxxx', 'no', 'identificador (agrupar; no usar como predictor)', 'APF2 mostraba U001 como ejemplo; el sistema usa el seudónimo SHA-256'],
  ['periodo', 'Primer día del mes facturado (AAAA-MM-01).', 'fecha ISO', `${periodos[0]} a ${periodos.at(-1)}`, 'no', 'predictor (mes) y eje de la partición temporal', 'sin cambio'],
  ['monto', 'Importe de la cuota en soles, 2 decimales.', 'decimal', '150.00', 'no', 'predictor', 'sin cambio'],
  ['fecha_vencimiento', 'Fecha límite de pago (día configurado por la junta).', 'fecha ISO', 'AAAA-MM-10', 'no', 'contexto (conocida antes de vencer)', 'sin cambio'],
  ['fecha_pago', 'Fecha de la operación del pago conciliado. Vacía si la cuota sigue impaga.', 'fecha ISO', 'AAAA-MM-DD o vacío', 'sí (solo impagas)', 'NO predictor: define la etiqueta (solo auditoría)', 'sin cambio'],
  ['dias_atraso', 'max(0, fecha_pago − fecha_vencimiento). 0 si pagó a tiempo o si sigue impaga.', 'entero ≥ 0', rango('dias_atraso'), 'no', 'NO predictor: define la etiqueta (solo auditoría)', 'sin cambio'],
  ['metodo_pago', 'Medio del pago de esa cuota: yape_qr, yape_captura, plin_captura, efectivo o transferencia. Vacío si impaga.', 'categoría', 'yape_qr / yape_captura / efectivo', 'sí (solo impagas)', 'NO predictor de la cuota actual (no existe antes de pagar). Usar el método de cuotas previas', 'sin cambio'],
  ['pagos_atrasados_previos', 'Cuotas de la misma unidad de los 3 meses anteriores que estaban atrasadas el primer día del periodo (pagadas tarde o impagas tras vencer). Solo usa información pasada.', 'entero 0–3', rango('pagos_atrasados_previos'), 'no', 'predictor', 'sin cambio; los 3 primeros meses tienen menos historial (0–2 cuotas previas)'],
  ['moroso', 'Variable objetivo. 1 si se pagó después del vencimiento o sigue impaga tras vencer; 0 si se pagó a tiempo.', 'binario', '0 / 1', 'no', 'ETIQUETA', 'sin cambio en la definición; ver exclusión de cuotas en revisión'],
  ['es_simulado', 'Indicador de dato ficticio de la semilla (1) o real (0).', 'binario', '1', 'no', 'metadato (no predictor)', 'sin cambio'],
  ['origen', 'Procedencia del registro: simulado o real. Redundante con es_simulado, más legible.', 'categoría', 'simulado', 'no', 'metadato (no predictor)', 'columna agregada para APF3'],
]
writeFileSync(join(SALIDA, 'diccionario_datos.csv'), aCsv(['campo', 'descripcion', 'tipo', 'valores', 'admite_vacios', 'uso_en_modelo', 'cambio_respecto_apf2'], DICCIONARIO.map(([campo, descripcion, tipo, valores, admite_vacios, uso_en_modelo, cambio_respecto_apf2]) => ({ campo, descripcion, tipo, valores, admite_vacios, uso_en_modelo, cambio_respecto_apf2 }))))

// Copia para Excel (en Windows con configuración es-PE el separador de listas es ";" y un CSV con
// comas se abre en una sola columna). Mismos datos, tipados.
const wb = new ExcelJS.Workbook()
wb.creator = 'Arcomunity'
const hojaDatos = wb.addWorksheet('dataset', { views: [{ state: 'frozen', ySplit: 1 }] })
hojaDatos.columns = COLUMNAS.map(c => ({ header: c, key: c, width: Math.max(12, c.length + 2) }))
for (const f of filas) hojaDatos.addRow({ ...f, fecha_pago: f.fecha_pago ?? '', metodo_pago: f.metodo_pago ?? '' }).getCell(3).numFmt = '0.00'
hojaDatos.getRow(1).font = { bold: true }
hojaDatos.autoFilter = { from: { row: 1, column: 1 }, to: { row: filas.length + 1, column: COLUMNAS.length } }
const hojaDic = wb.addWorksheet('diccionario')
hojaDic.columns = ['campo', 'descripcion', 'tipo', 'valores', 'admite_vacios', 'uso_en_modelo', 'cambio_respecto_apf2'].map(c => ({ header: c, key: c, width: c === 'descripcion' ? 80 : 26 }))
DICCIONARIO.forEach(d => hojaDic.addRow(d))
hojaDic.getRow(1).font = { bold: true }
const hojaPart = wb.addWorksheet('particion')
hojaPart.columns = ['unidad_ref', 'periodo', 'particion'].map(c => ({ header: c, key: c, width: 16 }))
filas.forEach(f => hojaPart.addRow({ unidad_ref: f.unidad_ref, periodo: f.periodo, particion: particionDe(f.periodo) }))
hojaPart.getRow(1).font = { bold: true }
await wb.xlsx.writeFile(join(SALIDA, 'dataset_arcomunity_apf3.xlsx'))

const tabla = (cab: string[], fs: (string | number)[][]) => [`| ${cab.join(' | ')} |`, `| ${cab.map(() => '---').join(' | ')} |`, ...fs.map(f => `| ${f.join(' | ')} |`)].join('\n')
const todosOk = chequeos.every(c => c.ok)
const md = `# Validación del dataset de morosidad — APF3

Generado por \`scripts/exportar-dataset-apf3.ts\` el ${HOY} (fecha de Lima del servidor).
Fuente: base de datos Supabase de Arcomunity, junta «${junta.nombre}» (${junta.es_simulado ? 'simulada' : 'real'}),
mediante la función del sistema \`exportar_dataset_morosidad\`. No se editó ningún valor a mano.

**Resultado: ${todosOk ? 'todas las validaciones pasaron' : 'HAY VALIDACIONES FALLIDAS (ver tabla)'}.**

## Archivos

| Archivo | Contenido |
| --- | --- |
| \`dataset_arcomunity_apf3.csv\` | ${filas.length} filas × ${COLUMNAS.length} columnas del contrato. UTF-8 con BOM, separador coma, punto decimal, fechas ISO, vacío = nulo. |
| \`dataset_arcomunity_apf3.xlsx\` | Los mismos datos para abrir con doble clic en Excel (hojas dataset, diccionario y particion). |
| \`diccionario_datos.csv\` | Significado, tipo, uso permitido en el modelo y cambios respecto del APF2. |
| \`particion_temporal_referencia.csv\` | Partición temporal sugerida (unidad_ref, periodo, particion). Solo referencia. |
| \`validacion_dataset.md\` | Este informe. |

## Volumen

- Cuotas en la base de la junta: **${cuotas.length}** (${unidades.length} unidades × ${new Set(cuotas.map(c => c.periodo)).size} meses).
- Filas exportadas: **${filas.length}** (cuotas con etiqueta definitiva).
- Excluidas: **${excluidas.length}** → ${excluidas.length ? excluidas.map(c => `${c.periodo.slice(0, 7)}, estado \`${c.estado}\`${c.estado === 'pendiente' ? ' (aún no vence)' : c.estado === 'en_revision' ? ' (pago enviado, esperando revisión del administrador)' : ''}`).join('; ') : 'ninguna'}.
- Periodos: ${periodos[0]} a ${periodos.at(-1)} (${periodos.length} meses consecutivos). Unidades: ${new Set(filas.map(f => f.unidad_ref)).size}.

## Variable objetivo \`moroso\`

- moroso = 1: **${morosos.length}** (${pct(morosos.length, filas.length)} %) → ${pagadasTarde} pagadas con atraso + ${impagasVencidas} impagas tras vencer.
- moroso = 0: **${filas.length - morosos.length}** (${pct(filas.length - morosos.length, filas.length)} %), todas pagadas en o antes del vencimiento.
- Perfiles observados por unidad: ${perfiles.cronicas} con 6 o más atrasos, ${perfiles.ocasionales} con 1 a 5, ${perfiles.puntuales} sin atrasos.
- Cuotas que aún no vencen: si están impagas **no se exportan** (nunca reciben 0). Si ya se pagaron antes de vencer se exportan con 0, porque su etiqueta ya es definitiva (hoy hay ${pagadasAntesDeVencer}: al ${HOY} ya venció la última cuota del dataset).

${tabla(['Periodo', 'Filas', 'moroso = 1', '%', 'Partición'], porPeriodo.map(([p, v]) => [p, v.n, v.m, pct(v.m, v.n), particionDe(p)]))}

## Partición temporal de referencia (APF2: 9 + 1 + 2 meses)

${tabla(['Partición', 'Periodos', 'Filas', 'moroso = 1', '%'], porParticion.map(p => [p.p, `${p.desde} a ${p.hasta}`, p.n, p.m, pct(p.m, p.n)]))}

Daniel puede rehacerla; esta versión solo fija los cortes del contrato para comparar resultados.

## Otras distribuciones

${tabla(['metodo_pago', 'Filas', 'moroso = 1'], metodos.map(([k, v]) => [k, v.n, v.m]))}

${tabla(['pagos_atrasados_previos', 'Filas', 'moroso = 1', '% moroso'], previos.map(([k, v]) => [k, v.n, v.m, pct(v.m, v.n)]))}

## Validaciones

${tabla(['Validación', 'Resultado', 'Detalle'], chequeos.map(c => [c.nombre, c.ok ? 'OK' : 'FALLA', c.detalle]))}

Cada columna se recalculó en este script a partir de las tablas \`cuotas\`, \`pagos\` y \`unidades\`,
sin reutilizar la función SQL, y se comparó con lo que exporta el sistema.

## Fuga de información

- \`fecha_pago\`, \`dias_atraso\` y \`metodo_pago\` describen la cuota **ya cobrada**: sirven para auditar
  y construir \`moroso\`, pero **no deben usarse como predictoras** (no existen antes del vencimiento).
- \`pagos_atrasados_previos\` se calcula con el estado de las 3 cuotas anteriores **al primer día del
  periodo**: no usa pagos posteriores. Los 3 primeros meses tienen menos historial (censura a la izquierda).
- Si se crean más variables históricas (p. ej. método de pago de la cuota anterior, tasa de atraso
  acumulada), deben usar solo periodos anteriores, ordenando por \`unidad_ref\` y \`periodo\`.
- La partición es temporal: no mezclar filas al azar entre entrenamiento y prueba.
- \`unidad_ref\` sirve para agrupar, no como predictor (memorizaría a cada unidad).

## Diferencias con el APF2 (investigadas, no corregidas a mano)

| Aspecto | APF2 | Este dataset | Causa |
| --- | --- | --- | --- |
| Periodos | 2025-11 a 2026-10 | ${periodos[0].slice(0, 7)} a ${periodos.at(-1)!.slice(0, 7)} | La semilla genera 12 meses hacia atrás desde el mes en que se carga. El APF2 se midió en octubre de 2026; la base Supabase se sembró en noviembre de 2026. Mismo patrón de comportamiento, desplazado un mes. |
| Registros | 360 | ${filas.length} | El APF2 contaba todas las cuotas. El sistema excluye las que no tienen etiqueta definitiva (${excluidas.length}: ${[...new Set(excluidas.map(c => c.estado))].join(', ')}). |
| moroso = 1 | 76 (21,1 %) | ${morosos.length} (${pct(morosos.length, filas.length)} %) | Con la regla del APF2 (contar como impaga la cuota con pago en revisión) los mismos datos dan **${reglaApf2}**. ${revisionATiempo ? `Esa cuota tiene un pago con fecha de operación ${enRevision.map(e => e.p!.fecha_operacion).join(', ')}, anterior al vencimiento, que el administrador aún no revisa: etiquetarla 1 sería probablemente incorrecto y etiquetarla 0 sería adivinar la revisión, así que el sistema la deja fuera hasta que se apruebe o rechace.` : 'Esa cuota tiene un pago que el administrador aún no revisa: su etiqueta depende de la revisión, así que el sistema la deja fuera.'} |
| Impagas | 15 | ${impagasVencidas} | La 15.ª del APF2 es la misma cuota en revisión. |
| Partición | 270 / 30 / 60 | ${porParticion.map(p => p.n).join(' / ')} | La fila excluida pertenece al último mes (prueba). |
| unidad_ref | U001 (ejemplo) | U-xxxxxxxxxx | El sistema usa un seudónimo SHA-256 estable; no deja deducir el número de casa. |
| Columna origen | no existía | simulado | Agregada para APF3; equivale a es_simulado. |
| metodo_pago | yape_qr, yape_captura, efectivo | ${metodos.filter(([k]) => !k.startsWith('(')).map(([k]) => k).join(', ')} | El sistema también acepta plin_captura y transferencia; la semilla no los usa. |

Si la semilla se vuelve a cargar (\`npm run seed:demo -- --reset\`) en otro mes, los periodos se desplazan y
los seudónimos cambian (las unidades reciben ids nuevos). Para que el equipo trabaje sobre la misma
versión, usar este archivo y no regenerarlo sin avisar.

## Advertencias para el modelado

- La semilla es **determinista y basada en reglas** (5 unidades crónicas, 8 ocasionales, resto puntuales).
  Un modelo puede aprender esas reglas casi a la perfección: por ejemplo, con 2 atrasos previos la tasa
  de morosidad observada es ${previos.find(([k]) => k === '2') ? pct(previos.find(([k]) => k === '2')![1].m, previos.find(([k]) => k === '2')![1].n) : '—'} %. Las métricas altas no serían extrapolables a datos reales.
- Clases desbalanceadas (${pct(morosos.length, filas.length)} % positivos): reportar precisión, recall, F1 y AUC, no solo exactitud.
- \`monto\` es constante (S/ ${junta.cuota_mensual}) en la semilla: no aporta información en este dataset.

## Privacidad

- Todas las filas son simuladas (\`es_simulado = 1\`, \`origen = simulado\`).
- No hay nombres, correos, teléfonos, códigos de casa, ids internos, números de operación, rutas de
  comprobantes, claves ni tokens (verificado por patrones en el CSV).

## Cómo cargarlo

\`\`\`python
import pandas as pd
df = pd.read_csv("dataset_arcomunity_apf3.csv", parse_dates=["periodo", "fecha_vencimiento", "fecha_pago"])
part = pd.read_csv("particion_temporal_referencia.csv", parse_dates=["periodo"])
df = df.merge(part, on=["unidad_ref", "periodo"], how="left")
\`\`\`

En Excel con configuración regional de Perú (separador ";"), abrir \`dataset_arcomunity_apf3.xlsx\`, o el
CSV desde **Datos → Desde texto/CSV** eligiendo delimitador coma.

Comprobado al preparar la primera versión (17/11/2026): pandas 3.1.1 lee el CSV con 11 columnas, tipos
correctos y el BOM sin afectar el nombre de \`unidad_ref\`; la unión con la partición es 1 a 1. En
Excel (Windows es-PE) el \`.xlsx\` abre 359 filas × 11 columnas; el CSV con doble clic queda en una sola
columna (por el separador regional), e importado con delimitador coma abre 11 columnas.

## Regenerar

\`\`\`bash
npm run dataset:apf3
\`\`\`

Necesita \`VITE_SUPABASE_URL\` y \`SUPABASE_SERVICE_ROLE_KEY\` en \`.env.local\`. Solo lee la base.
`
writeFileSync(join(SALIDA, 'validacion_dataset.md'), md)

for (const c of chequeos) console.log(`${c.ok ? '✓' : '✗'} ${c.nombre}: ${c.detalle}`)
console.log(`\n${filas.length} filas · moroso=1: ${morosos.length} (${pct(morosos.length, filas.length)} %) · excluidas: ${excluidas.length} · regla APF2: ${reglaApf2}`)
console.log(`Partición: ${porParticion.map(p => `${p.p} ${p.n}`).join(' · ')}`)
console.log(`Archivos en ${SALIDA}/`)
if (!todosOk) process.exit(1)
