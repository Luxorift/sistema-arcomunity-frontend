// Fechas especiales del Perú para los saludos de Arcomunity.
// Configuración centralizada: para agregar o cambiar una fecha basta editar FECHAS_FIJAS o las
// reglas móviles. Las conmemoraciones no son feriados y se marcan como tales.
// Feriados nacionales (16 en 2026): D. Leg. N.º 713 (12), Ley N.º 31788 (7 de junio),
// Ley N.º 31822 (23 de julio), 6 de agosto y 9 de diciembre (aprobados por el Congreso en 2022 y
// 2021). Fuentes y fecha de verificación en docs/verificacion.md. Los días no laborables que decreta
// el Ejecutivo cada año no son feriados y no se incluyen.

export type TipoFecha = 'feriado' | 'conmemoracion'
export type FechaEspecial = { id: string; nombre: string; tipo: TipoFecha; mensaje: string; emoji?: string }

/** Fechas fijas por mes-día (MM-DD). */
export const FECHAS_FIJAS: Record<string, FechaEspecial> = {
  '01-01': { id: 'anio-nuevo', nombre: 'Año Nuevo', tipo: 'feriado', emoji: '🎉', mensaje: '¡Feliz Año Nuevo! Que este nuevo año traiga bienestar y buenos momentos a nuestra comunidad.' },
  '05-01': { id: 'dia-trabajo', nombre: 'Día del Trabajo', tipo: 'feriado', mensaje: '¡Feliz Día del Trabajo! Un saludo especial a quienes cuidan nuestra comunidad cada día, incluido el personal de vigilancia.' },
  '06-07': { id: 'dia-bandera', nombre: 'Batalla de Arica y Día de la Bandera', tipo: 'feriado', emoji: '🇵🇪', mensaje: 'Hoy honramos nuestra bandera. ¡Feliz Día de la Bandera!' },
  '06-29': { id: 'san-pedro-san-pablo', nombre: 'San Pedro y San Pablo', tipo: 'feriado', mensaje: '¡Feliz día de San Pedro y San Pablo! Un saludo a las familias de pescadores y a quienes celebran hoy.' },
  '07-23': { id: 'fuerza-aerea', nombre: 'Día de la Fuerza Aérea del Perú', tipo: 'feriado', mensaje: 'Hoy recordamos el Día de la Fuerza Aérea del Perú.' },
  '07-28': { id: 'fiestas-patrias', nombre: 'Fiestas Patrias', tipo: 'feriado', emoji: '🇵🇪', mensaje: '¡Felices Fiestas Patrias! Sigamos construyendo juntos una comunidad cada día mejor.' },
  '07-29': { id: 'fiestas-patrias', nombre: 'Fiestas Patrias', tipo: 'feriado', emoji: '🇵🇪', mensaje: '¡Felices Fiestas Patrias! Sigamos construyendo juntos una comunidad cada día mejor.' },
  '08-06': { id: 'batalla-junin', nombre: 'Batalla de Junín', tipo: 'feriado', mensaje: 'Hoy recordamos la Batalla de Junín, parte de nuestra historia.' },
  '08-30': { id: 'santa-rosa', nombre: 'Santa Rosa de Lima', tipo: 'feriado', emoji: '🌹', mensaje: '¡Feliz día de Santa Rosa de Lima! Un saludo a todas las Rosas de nuestra comunidad.' },
  '10-08': { id: 'angamos', nombre: 'Combate de Angamos', tipo: 'feriado', mensaje: 'Hoy recordamos el Combate de Angamos y a Miguel Grau.' },
  '10-31': { id: 'cancion-criolla', nombre: 'Día de la Canción Criolla', tipo: 'conmemoracion', emoji: '🎶', mensaje: '¡Feliz Día de la Canción Criolla! Que no falte la música en nuestra comunidad.' },
  '11-01': { id: 'todos-santos', nombre: 'Día de Todos los Santos', tipo: 'feriado', mensaje: 'En el Día de Todos los Santos, un saludo afectuoso a cada familia de la comunidad.' },
  '12-08': { id: 'inmaculada', nombre: 'Inmaculada Concepción', tipo: 'feriado', mensaje: 'Un saludo en el día de la Inmaculada Concepción.' },
  '12-09': { id: 'ayacucho', nombre: 'Batalla de Ayacucho', tipo: 'feriado', mensaje: 'Hoy recordamos la Batalla de Ayacucho, que selló nuestra independencia.' },
  '12-24': { id: 'nochebuena', nombre: 'Nochebuena', tipo: 'conmemoracion', emoji: '🎄', mensaje: '¡Feliz Nochebuena! Que la unión y la alegría acompañen a cada familia de nuestra comunidad.' },
  '12-25': { id: 'navidad', nombre: 'Navidad', tipo: 'feriado', emoji: '🎄', mensaje: '¡Feliz Navidad! Que la unión y la alegría acompañen a cada familia de nuestra comunidad.' },
  '12-31': { id: 'fin-anio', nombre: 'Fin de año', tipo: 'conmemoracion', emoji: '✨', mensaje: '¡Gracias por un año más de comunidad! Te deseamos un excelente cierre de año.' },
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** n-ésimo domingo de un mes (1 = primero). */
export function enesimoDomingo(anio: number, mes: number, n: number): string {
  const primero = new Date(Date.UTC(anio, mes - 1, 1, 12))
  const offset = (7 - primero.getUTCDay()) % 7
  return new Date(Date.UTC(anio, mes - 1, 1 + offset + (n - 1) * 7, 12)).toISOString().slice(0, 10)
}

/** Fechas móviles de un año. */
export function fechasMoviles(anio: number): Record<string, FechaEspecial> {
  const pascua = domingoDePascua(anio)
  return {
    [sumarDias(pascua, -3)]: { id: 'jueves-santo', nombre: 'Jueves Santo', tipo: 'feriado', mensaje: 'Te deseamos una Semana Santa en paz junto a tu familia.' },
    [sumarDias(pascua, -2)]: { id: 'viernes-santo', nombre: 'Viernes Santo', tipo: 'feriado', mensaje: 'Te deseamos una Semana Santa en paz junto a tu familia.' },
    [enesimoDomingo(anio, 5, 2)]: { id: 'dia-madre', nombre: 'Día de la Madre', tipo: 'conmemoracion', emoji: '💐', mensaje: '¡Feliz Día de la Madre a todas las mamás de nuestra comunidad!' },
    [enesimoDomingo(anio, 6, 3)]: { id: 'dia-padre', nombre: 'Día del Padre', tipo: 'conmemoracion', emoji: '👔', mensaje: '¡Feliz Día del Padre a todos los papás de nuestra comunidad!' },
  }
}

/** Fecha especial para un día (AAAA-MM-DD en America/Lima), o null. */
export function fechaEspecial(fechaIso: string): FechaEspecial | null {
  const anio = Number(fechaIso.slice(0, 4))
  return fechasMoviles(anio)[fechaIso] ?? FECHAS_FIJAS[fechaIso.slice(5, 10)] ?? null
}

/** Saludo según la hora de Lima. */
export function saludoPorHora(hora: number): string {
  if (hora >= 5 && hora < 12) return '¡Buenos días'
  if (hora >= 12 && hora < 19) return '¡Buenas tardes'
  return '¡Buenas noches'
}

/** Fecha y hora actuales en America/Lima a partir de un instante (del servidor o del navegador). */
export function partesLima(instante: Date): { fecha: string; hora: number } {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(instante)
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: 'numeric', hourCycle: 'h23' }).format(instante))
  return { fecha, hora }
}
