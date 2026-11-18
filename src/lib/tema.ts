// Tema claro u oscuro. Solo se guarda la preferencia visual en localStorage (nunca datos de la junta ni
// sesiones). Si la persona no eligió, se sigue la preferencia del sistema operativo. El atributo
// data-theme se fija antes de pintar con un script en index.html para evitar parpadeos.
import { useSyncExternalStore } from 'react'

export type Tema = 'claro' | 'oscuro'
const CLAVE = 'arcomunity-tema'
const COLOR_BARRA: Record<Tema, string> = { claro: '#132d35', oscuro: '#0d1d22' }
const oyentes = new Set<() => void>()

export function temaGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE)
    return v === 'claro' || v === 'oscuro' ? v : null
  } catch { return null }
}

const consultaOscuro = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)
export const temaSistema = (): Tema => (consultaOscuro()?.matches ? 'oscuro' : 'claro')
export const temaActual = (): Tema => (document.documentElement.dataset.theme === 'dark' ? 'oscuro' : 'claro')

function aplicar(t: Tema, animar: boolean) {
  const html = document.documentElement
  const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (animar && !reducir) {
    html.classList.add('tema-cambiando')
    window.setTimeout(() => html.classList.remove('tema-cambiando'), 350)
  }
  html.dataset.theme = t === 'oscuro' ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[t])
  oyentes.forEach(f => f())
}

export function cambiarTema(t: Tema) {
  try { localStorage.setItem(CLAVE, t) } catch { /* sin almacenamiento: el cambio vale para esta visita */ }
  aplicar(t, true)
}

// Si la persona nunca eligió, el tema acompaña los cambios del sistema (p. ej. modo nocturno automático).
consultaOscuro()?.addEventListener?.('change', () => { if (!temaGuardado()) aplicar(temaSistema(), true) })

function suscribir(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

export function useTema(): Tema {
  return useSyncExternalStore(suscribir, temaActual, () => 'claro')
}
