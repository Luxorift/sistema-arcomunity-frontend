-- Arcomunity · Corrige servidor_ahora() para visitantes sin sesión
-- servidor_ahora() se usa en la pantalla de acceso (saludos y fechas especiales con la hora del
-- servidor). Llama a hoy_lima(), que no tenía permiso de ejecución para anon. Ambas funciones solo
-- devuelven la fecha/hora actual: no exponen datos.
grant execute on function public.hoy_lima() to anon;
