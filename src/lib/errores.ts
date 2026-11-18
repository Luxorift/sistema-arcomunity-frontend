// Traduce errores de Supabase a mensajes claros para el usuario, sin exponer detalles internos.
type ErrorLike = { code?: string; message?: string; status?: number; name?: string } | null | undefined

const RED = 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.'
const GENERICO = 'No se pudo completar la acción. Inténtalo de nuevo en unos segundos.'

export function mensajeError(error: unknown, contexto?: 'login' | 'registro' | 'archivo'): string {
  const e = error as ErrorLike
  const msg = e?.message ?? ''

  if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return RED

  // Errores de negocio lanzados por nuestras funciones (SQLSTATE P0001): mensaje ya pensado para el usuario.
  if (e?.code === 'P0001' && msg) return msg

  if (e?.code === '42501') return 'No tienes permiso para realizar esta acción.'
  if (e?.code === '23505') return 'Ese registro ya existe.'
  if (e?.code === 'PGRST301' || /JWT expired/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.'

  if (contexto === 'login' || /Invalid login credentials/i.test(msg)) {
    if (/Email not confirmed/i.test(msg)) return 'Confirma tu correo con el enlace que te enviamos antes de ingresar.'
    if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  }
  if (/User already registered|already been registered/i.test(msg)) return 'Este correo ya está registrado.'
  if (/Database error updating user|cuentas de demostración no pueden/i.test(msg)) {
    return 'Las cuentas de demostración no pueden cambiar su contraseña, correo ni teléfono.'
  }
  if (/Database error saving new user/i.test(msg)) {
    return 'No pudimos completar el registro. Verifica el código de invitación y que la unidad siga disponible.'
  }
  if (/Password should be at least|weak.?password/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/rate limit|over_email_send_rate_limit|too many/i.test(msg)) {
    return 'Hubo demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
  }
  if (/Unable to validate email|invalid.*email/i.test(msg)) return 'Ingresa un correo válido.'

  if (contexto === 'archivo') {
    if (/maximum allowed size|Payload too large/i.test(msg)) return 'La imagen supera el tamaño permitido.'
    if (/mime type|not supported/i.test(msg)) return 'Formato no permitido. Usa una imagen JPG, PNG o WEBP.'
    if (/row-level security/i.test(msg)) return 'No tienes permiso para subir este archivo.'
  }

  if (import.meta.env.DEV) console.error('[Arcomunity] error no mapeado', e?.code, msg)
  return GENERICO
}
