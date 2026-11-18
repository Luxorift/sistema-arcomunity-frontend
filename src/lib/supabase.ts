import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Solo variables públicas. La clave de servicio nunca debe tener prefijo VITE_.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clavePublica = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configuracionFaltante = !url || !clavePublica

if (clavePublica && /service_role|sb_secret_/.test(clavePublica)) {
  // Defensa: una clave secreta en el navegador saltaría RLS. Se bloquea el arranque.
  throw new Error('VITE_SUPABASE_ANON_KEY contiene una clave secreta. Usa la clave anon/publishable.')
}

export const supabase: SupabaseClient = configuracionFaltante
  ? (null as unknown as SupabaseClient)
  : createClient(url!, clavePublica!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

export const BUCKET_COMPROBANTES = 'comprobantes'
export const BUCKET_JUNTA = 'junta-archivos'
