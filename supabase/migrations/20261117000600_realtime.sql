-- Arcomunity · Actualización en tiempo real
-- Supabase Realtime respeta RLS: cada usuario solo recibe cambios de filas que puede leer.
-- Permite que el administrador vea al instante un pago enviado desde otro dispositivo.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cuotas, public.pagos;
  end if;
end $$;
