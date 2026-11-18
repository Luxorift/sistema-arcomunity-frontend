-- Arcomunity · Permisos explícitos para service_role
-- El proyecto se creó con "Automatically expose new tables" desactivado: las tablas nuevas no
-- heredan permisos para los roles de la API. service_role (solo scripts del equipo técnico y el
-- futuro servicio de inferencia; nunca el navegador) necesita acceso para la semilla de demostración
-- y para escribir predicciones. anon y authenticated mantienen los permisos mínimos ya definidos.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function
  public.ml_caracteristicas_cuotas(uuid, date, integer),
  public.exportar_dataset_morosidad(uuid),
  public.servidor_ahora()
to service_role;

-- Los roles de la API necesitan USAGE sobre el esquema para llamar funciones y leer con RLS.
grant usage on schema public to anon, authenticated;
