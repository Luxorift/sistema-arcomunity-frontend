-- Arcomunity · RETORNO de la migración 20261126001500_flujo_prediccion_e2e.sql
-- No es una migración: está fuera de supabase/migrations/ para que nunca se aplique sola. Ejecutarla solo si hay que
-- revertir la 1500, en el editor SQL de Supabase, con la aplicación anterior (sin la interfaz de la 1500) publicada.
--
-- ANTES DE EJECUTAR (pérdida de datos controlada):
--   1) Exportar a CSV public.registro_predicciones y public.recordatorios. Este script elimina esas dos tablas.
--   2) Las predicciones calculadas con la regla de respaldo se eliminan: la tabla vuelve a exigir probabilidad.
-- Deja la base exactamente como después de la migración 1400 (funciones de las migraciones 0500, 1200 y 1300).
-- Probado en PGlite: supabase/tests/retorno-migracion-1500.test.ts (aplicar → revertir → volver a aplicar).

begin;

-- 0) Purga programada del registro.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('arcomunity-purgar-registro-predicciones');
  end if;
exception when others then
  raise notice 'No había purga programada: %', sqlerrm;
end $$;

-- 1) Restauración de la demostración: vuelve la función original con su nombre.
drop function public.restaurar_demo_datos(uuid);
alter function public.restaurar_demo_datos_base(uuid) rename to restaurar_demo_datos;

-- 2) Funciones nuevas expuestas a la API.
drop function public.calcular_riesgo_periodo(uuid, date);
drop function public.probar_entrada_modelo(uuid, jsonb);
drop function public.registrar_recordatorio(uuid, text, text);
drop function public.simular_falla_modelo(uuid, boolean);
drop function public.estado_prediccion(uuid);
drop function public.purgar_registro_predicciones();

-- 3) predicciones_vigentes de la migración 0500.
drop function public.predicciones_vigentes(uuid);
create function public.predicciones_vigentes(p_junta uuid)
returns table (
  cuota_id uuid, unidad_codigo text, periodo date, fecha_vencimiento date, probabilidad numeric,
  nivel_riesgo text, factores jsonb, modelo_version text, generado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin(p_junta);
  return query
  select distinct on (pr.cuota_id)
    pr.cuota_id, u.codigo, c.periodo, c.fecha_vencimiento, pr.probabilidad, pr.nivel_riesgo, pr.factores,
    m.version, pr.generado_en
  from public.predicciones_morosidad pr
  join public.modelos_ml m on m.id = pr.modelo_id and m.activo
  join public.cuotas c on c.id = pr.cuota_id and c.estado <> 'pagada'
  join public.unidades u on u.id = c.unidad_id
  where pr.junta_id = p_junta and c.fecha_vencimiento >= public.hoy_lima()
  order by pr.cuota_id, pr.generado_en desc;
end $$;
revoke execute on function public.predicciones_vigentes(uuid) from public, anon;
grant execute on function public.predicciones_vigentes(uuid) to authenticated, service_role;

-- 4) calcular_riesgo_morosidad de la migración 1200 (misma firma; conserva sus permisos).
create or replace function public.calcular_riesgo_morosidad(
  p_junta uuid,
  p_fecha_corte date default null,
  p_horizonte_dias integer default 31
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
  v_corte date := coalesce(p_fecha_corte, v_hoy);
  v_modelo public.modelos_ml;
  v_umbral double precision;
  r record;
  v_entrada jsonb;
  v_p double precision;
  v_nivel text;
  n integer := 0;
  n_alto integer := 0;
  n_medio integer := 0;
begin
  perform public.exigir_admin_o_servicio(p_junta);
  if v_corte <> v_hoy and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'El riesgo se calcula con la fecha de hoy.';
  end if;
  select * into v_modelo from public.modelos_ml where activo;
  if not found or v_modelo.parametros is null then
    raise exception 'No hay un modelo de predicción activo.';
  end if;
  v_umbral := (v_modelo.parametros ->> 'umbral')::double precision;

  for r in select * from public.ml_caracteristicas_cuotas(p_junta, v_corte, p_horizonte_dias) loop
    v_entrada := jsonb_build_object(
      'pagos_atrasados_previos', r.pagos_atrasados_previos, 'atrasos_previos_total', r.atrasos_previos_total,
      'tasa_atraso_previa', r.tasa_atraso_previa, 'dias_atraso_promedio_previo', r.dias_atraso_promedio_previo,
      'cuotas_previas', r.cuotas_previas, 'dias_para_vencer', r.dias_para_vencer, 'periodo', r.periodo);
    v_p := public.ml_probabilidad(v_modelo.parametros, v_entrada);
    v_nivel := case when v_p >= v_umbral then 'alto' when v_p >= v_umbral / 2 then 'medio' else 'bajo' end;
    insert into public.predicciones_morosidad (junta_id, cuota_id, modelo_id, fecha_corte, probabilidad, prediccion,
      nivel_riesgo, factores, entrada)
    values (p_junta, r.cuota_id, v_modelo.id, v_corte, round(v_p::numeric, 4), (v_p >= v_umbral)::integer, v_nivel,
      public.ml_factores(v_modelo.parametros, v_entrada), v_entrada)
    on conflict (cuota_id, modelo_id, fecha_corte) do update set
      probabilidad = excluded.probabilidad, prediccion = excluded.prediccion, nivel_riesgo = excluded.nivel_riesgo,
      factores = excluded.factores, entrada = excluded.entrada, generado_en = now();
    n := n + 1;
    if v_nivel = 'alto' then n_alto := n_alto + 1; elsif v_nivel = 'medio' then n_medio := n_medio + 1; end if;
  end loop;

  perform public.registrar_auditoria(p_junta, 'calcular_riesgo_morosidad', 'junta', p_junta, jsonb_build_object(
    'modelo', v_modelo.version, 'fecha_corte', v_corte, 'cuotas', n, 'riesgo_alto', n_alto));
  return jsonb_build_object('modelo_version', v_modelo.version, 'umbral', v_umbral, 'fecha_corte', v_corte,
    'cuotas', n, 'alto', n_alto, 'medio', n_medio, 'bajo', n - n_alto - n_medio);
end $$;

-- 5) Funciones internas de evaluación.
drop function public.ml_calcular(uuid, date, integer, date);
drop function public.ml_evaluar(jsonb, jsonb, text);
drop function public.ml_entrada_valida(jsonb);

-- 6) Bitácora, recordatorios y ajustes de demostración.
drop trigger predicciones_al_registro on public.predicciones_morosidad;
drop function public.copiar_prediccion_al_registro();
drop table public.recordatorios;
drop table public.demo_ajustes;
drop table public.registro_predicciones;
drop function public.bloquear_modificacion_registro_predicciones();

-- 7) Predicciones de respaldo, columnas nuevas y versión «regla-respaldo».
delete from public.predicciones_morosidad where origen = 'regla_respaldo';
alter table public.predicciones_morosidad drop constraint predicciones_probabilidad_segun_origen;
alter table public.predicciones_morosidad alter column probabilidad set not null;
alter table public.predicciones_morosidad drop column origen, drop column motivo_respaldo, drop column solicitado_por;
delete from public.modelos_ml where version = 'regla-respaldo';

commit;
