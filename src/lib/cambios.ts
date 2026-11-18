// Cambios sin guardar. Una pantalla con datos a medio ingresar (por ejemplo, el pago en tres pasos)
// lo declara con useAvisoCambios; la navegación interna y el cierre de sesión preguntan antes de
// salir, y el navegador avisa si se cierra o recarga la pestaña.
import { useEffect } from 'react'

let mensajeActual: string | null = null

export const cambiosSinGuardar = () => mensajeActual
export const olvidarCambios = () => { mensajeActual = null }

function alSalir(e: BeforeUnloadEvent) {
  if (!mensajeActual) return
  e.preventDefault()
  e.returnValue = ''
}

export function useAvisoCambios(activo: boolean, mensaje = 'Los datos que ingresaste se perderán.') {
  useEffect(() => {
    if (!activo) return
    mensajeActual = mensaje
    window.addEventListener('beforeunload', alSalir)
    return () => {
      if (mensajeActual === mensaje) mensajeActual = null
      window.removeEventListener('beforeunload', alSalir)
    }
  }, [activo, mensaje])
}
