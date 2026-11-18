// Genera src/tema-oscuro.css a partir de src/styles.css. No invierte colores: convierte cada color a
// OKLCH y lo adapta según su papel en la regla (fondo, borde o texto), conservando el tono de la marca.
//   * Superficies claras (blancos, verdes y cremas suaves) → superficies oscuras con el mismo matiz.
//   * Acentos con color (lima, coral, verdes medios) y superficies de marca ya oscuras → se mantienen.
//   * Texto oscuro → texto claro; si el fondo de la regla se mantiene (p. ej. lima), el texto también.
// Uso: node scripts/generar-tema-oscuro.ts   (vuelve a ejecutarlo si cambias colores en styles.css).
// Los retoques hechos a mano van en src/tema-oscuro-ajustes.css (se carga después).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { type Declaration, type Rule } from 'postcss'

const raiz = join(import.meta.dirname, '..')
const entrada = readFileSync(join(raiz, 'src', 'styles.css'), 'utf8')

// --- Color: hex ↔ OKLCH ------------------------------------------------------------------------
type Lch = { L: number; C: number; h: number; a: number }
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function aOklch(hex: string): Lch {
  let h = hex.slice(1)
  if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('')
  const [r, g, b] = [0, 2, 4].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255))
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A), a }
}

function aRgb({ L, C, h }: Lch) {
  const A = C * Math.cos(h), B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

function aHex(c: Lch): string {
  let x = { ...c }
  // Reduce el croma hasta que el color exista en sRGB.
  for (let i = 0; i < 40 && aRgb(x).some(v => v < -0.0005 || v > 1.0005); i++) x = { ...x, C: x.C * 0.92 }
  const hex = aRgb(x).map(v => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('')
  return `#${hex}${c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : ''}`
}

// --- Papel de cada color -------------------------------------------------------------------------
const esAcento = (c: Lch) => c.C >= 0.075 || c.L < 0.8  // lima, coral, verdes medios, superficies oscuras
const FONDO_PAGINA = /^(:root|body|\.loading-screen|\.auth-shell)$/

function superficie(c: Lch, selector: string): Lch {
  // Fondo de página y tarjetas: petróleo muy oscuro (matiz de la marca), las tarjetas un poco más claras.
  if (FONDO_PAGINA.test(selector)) return { ...c, L: 0.19, C: 0.014, h: 3.6 }
  const hover = /:hover|:focus/.test(selector) ? 0.035 : 0
  if (c.L >= 0.995) return { ...c, L: 0.245 + hover, C: 0.014, h: 3.6 }
  return { ...c, L: 0.3 - (c.L - 0.8) * 0.35 + hover, C: Math.min(c.C * 1.1, 0.04) }
}
const borde = (c: Lch): Lch => (c.L >= 0.8 ? { ...c, L: 0.36 - (c.L - 0.8) * 0.3, C: Math.min(c.C, 0.03) } : c)
// Texto neutro (petróleo, grises) → casi blanco cálido; texto con color (verde, coral) conserva su tono.
const texto = (c: Lch): Lch => (c.L <= 0.7 ? { ...c, L: 0.94 - (c.L - 0.25) * 0.5, C: c.C < 0.06 ? Math.min(c.C, 0.018) : Math.min(c.C, 0.13) } : c)

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const PROPS_COLOR = /^(color|fill|stroke|caret-color|accent-color|text-decoration-color)$/
const PROPS_FONDO = /^background(-color|-image)?$/
const PROPS_BORDE = /^(border(-top|-right|-bottom|-left)?(-color)?|outline(-color)?|column-rule)$/

function fondoSeMantiene(regla: Rule) {
  let se = false
  regla.walkDecls(PROPS_FONDO, d => {
    const v = d.value.replace(/\bwhite\b/g, '#ffffff')
    const colores = v.match(HEX) ?? []
    if (colores.length && colores.every(h => esAcento(aOklch(h)))) se = true
  })
  return se
}

function transformar(d: Declaration, regla: Rule): string | null {
  const valor = d.value.replace(/\bwhite\b/g, '#ffffff')
  if (!HEX.test(valor)) return null
  HEX.lastIndex = 0
  const prop = d.prop
  const sel = regla.selector
  const mantenerTexto = fondoSeMantiene(regla)
  const nuevo = valor.replace(HEX, h => {
    const c = aOklch(h)
    // Variables de la capa APF3 (--tinta, --fondo, --borde…): según su nombre.
    if (prop.startsWith('--')) {
      if (/fondo/.test(prop)) return aHex({ ...c, L: 0.19, C: 0.014, h: 3.6 })
      if (/borde/.test(prop)) return aHex(borde(c))
      if (/claro/.test(prop)) return aHex(superficie(c, sel))
      return aHex(texto(c))
    }
    if (PROPS_FONDO.test(prop)) return esAcento(c) ? h : aHex(superficie(c, sel))
    if (PROPS_BORDE.test(prop)) return aHex(borde(c))
    if (prop === 'box-shadow') return c.L >= 0.8 && c.a > 0.15 ? aHex(borde(c)) : h
    if (PROPS_COLOR.test(prop)) return mantenerTexto ? h : aHex(texto(c))
    return h
  })
  return nuevo === valor ? null : nuevo
}

const prefijo = (s: string) => s.split(',').map(x => {
  x = x.trim()
  if (x.startsWith(':root')) return x.replace(':root', ':root[data-theme="dark"]')
  if (x.startsWith('html')) return x.replace('html', ':root[data-theme="dark"]')
  return `:root[data-theme="dark"] ${x}`
}).join(',')

// --- Recorrido -----------------------------------------------------------------------------------
const salida = postcss.root()
const base = postcss.parse(entrada)
let n = 0
base.walkRules(regla => {
  const padre = regla.parent
  if (padre?.type === 'atrule' && /keyframes/.test((padre as postcss.AtRule).name)) return
  if (padre?.type === 'atrule' && (padre as postcss.AtRule).params.includes('print')) return
  const nuevas: Declaration[] = []
  regla.each(nodo => {
    if (nodo.type !== 'decl') return
    const v = transformar(nodo, regla)
    if (v) nuevas.push(postcss.decl({ prop: nodo.prop, value: v, important: nodo.important }))
  })
  if (!nuevas.length) return
  n += nuevas.length
  const copia = postcss.rule({ selector: prefijo(regla.selector) })
  nuevas.forEach(d => copia.append(d))
  if (padre?.type === 'atrule') {
    const at = padre as postcss.AtRule
    let destino = salida.nodes.find(x => x.type === 'atrule' && x.params === at.params && x === salida.last) as postcss.AtRule | undefined
    if (!destino) { destino = postcss.atRule({ name: at.name, params: at.params }); salida.append(destino) }
    destino.append(copia)
  } else salida.append(copia)
})

const css = `/* GENERADO por scripts/generar-tema-oscuro.ts a partir de src/styles.css: no editar a mano.\n   Retoques del modo oscuro: src/tema-oscuro-ajustes.css. */\n@media screen {\n:root[data-theme="dark"]{color-scheme:dark}\n${salida.toString()}\n}\n`
writeFileSync(join(raiz, 'src', 'tema-oscuro.css'), css)
console.log(`✓ src/tema-oscuro.css: ${n} declaraciones adaptadas`)
