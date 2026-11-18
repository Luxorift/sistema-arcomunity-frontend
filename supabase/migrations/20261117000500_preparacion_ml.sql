-- Arcomunity · Preparación para Machine Learning (riesgo de morosidad por cuota)
-- No hay modelo entrenado todavía. Esta migración solo prepara:
--   * modelos_ml: registro de versiones exportadas (joblib) y su umbral. Vacío hasta entrenar.
--   * predicciones_morosidad: resultados reales del servicio de inferencia. Solo escribe service_role.
--   * ml_caracteristicas_cuotas(): entrada del modelo con información disponible ANTES del
--     vencimiento (sin fuga): nunca usa fecha_pago, dias_atraso ni metodo_pago de la cuota actual.
--   * exportar_dataset_morosidad(): exportación del Contrato de Datos de APF2 desde la base real.
-- Contrato detallado: docs/ml-contrato.md

create table public.modelos_ml (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (char_length(version) between 1 and 40),
  algoritmo text not null check (char_length(algoritmo) between 2 and 80),
  umbral numeric(4,3) not null check (umbral > 0 and umbral < 1),
  caracteristicas text[] not null,
  metricas jsonb not null default '{}'::jsonb,
  entrenado_en timestamptz not null,
  datos_entrenamiento text,
  activo boolean not null default false,
  notas text,
  creado_en timestamptz not null default now()
);
create unique index modelos_ml_un_activo on public.modelos_ml (activo) where activo;

create table public.predicciones_morosidad (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  modelo_id uuid not null references public.modelos_ml(id),
  fecha_corte date not null,
  probabilidad numeric(5,4) not null check (probabilidad between 0 and 1),
  prediccion smallint not null check (prediccion in (0, 1)),
  nivel_riesgo text not null check (nivel_riesgo in ('bajo', 'medio', 'alto')),
  factores jsonb not null default '[]'::jsonb,
  entrada jsonb not null,
  generado_en timestamptz not null default now(),
  unique (cuota_id, modelo_id, fecha_corte)
);
create index predicciones_junta_idx on public.predicciones_morosidad (junta_id, fecha_corte desc);

alter table public.modelos_ml enable row level security;
alter table public.predicciones_morosidad enable row level security;

revoke all on public.modelos_ml, public.predicciones_morosidad from anon, authenticated;
grant select on public.modelos_ml, public.predicciones_morosidad to authenticated;

create policy modelos_ml_leer_admins on public.modelos_ml
  for select to authenticated using (exists (select public.juntas_que_administro()));

create policy predicciones_leer_admin on public.predicciones_morosidad
  for select to authenticated using (public.es_admin_de(junta_id));

-- Identificador seudonimizado y estable de la unidad (no revela el código ni el propietario).
create or replace function public.ml_unidad_ref(p_unidad uuid)
returns text
language sql
immutable
set search_path = ''
as $$ select 'U-' || left(encode(sha256(convert_to(p_unidad::text, 'UTF8')), 'hex'), 10) $$;

-- Permite que el servicio de inferencia (service_role) o un administrador lean características.
create or replace function public.exigir_admin_o_servicio(p_junta uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;
  perform public.exigir_admin(p_junta);
end $$;

-- Historial de una unidad tal como se conocía en la fecha de corte.
-- Una cuota previa cuenta solo si ya venció antes del corte. Es atrasada si al corte seguía
-- impaga o se pagó después de su vencimiento.
create or replace function public.ml_caracteristicas_cuotas(
  p_junta uuid,
  p_fecha_corte date default null,
  p_horizonte_dias integer default 31
)
returns table (
  cuota_id uuid,
  unidad_ref text,
  periodo date,
  mes smallint,
  monto numeric,
  fecha_vencimiento date,
  dias_para_vencer integer,
  pagos_atrasados_previos integer,
  cuotas_previas integer,
  atrasos_previos_total integer,
  tasa_atraso_previa numeric,
  dias_atraso_promedio_previo numeric,
  metodo_pago_ultimo text,
  es_simulado boolean,
  fecha_corte date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_corte date := coalesce(p_fecha_corte, public.hoy_lima());
begin
  perform public.exigir_admin_o_servicio(p_junta);
  return query
  select
    c.id,
    public.ml_unidad_ref(c.unidad_id),
    c.periodo,
    extract(month from c.periodo)::smallint,
    c.monto,
    c.fecha_vencimiento,
    (c.fecha_vencimiento - v_corte)::integer,
    h.atrasos_3m,
    h.previas,
    h.atrasos_total,
    case when h.previas > 0 then round(h.atrasos_total::numeric / h.previas, 4) else 0 end,
    coalesce(h.dias_prom, 0),
    (select pg.metodo from public.pagos pg
      where pg.unidad_id = c.unidad_id and pg.estado in ('conciliado_auto', 'conciliado_manual')
        and pg.fecha_operacion < v_corte and pg.cuota_id <> c.id
      order by pg.fecha_operacion desc limit 1),
    c.es_simulado,
    v_corte
  from public.cuotas c
  cross join lateral (
    select
      count(*)::integer as previas,
      count(*) filter (where prev.atrasada)::integer as atrasos_total,
      count(*) filter (where prev.atrasada and prev.periodo >= (c.periodo - interval '3 months')::date)::integer as atrasos_3m,
      round(avg(prev.dias), 2) as dias_prom
    from (
      select p.periodo,
        (p.fecha_pago is null or p.fecha_pago > v_corte or p.fecha_pago > p.fecha_vencimiento) as atrasada,
        case when p.fecha_pago is not null and p.fecha_pago <= v_corte
             then greatest(0, p.fecha_pago - p.fecha_vencimiento)
             else greatest(0, v_corte - p.fecha_vencimiento) end as dias
      from public.cuotas p
      where p.unidad_id = c.unidad_id and p.periodo < c.periodo and p.fecha_vencimiento < v_corte
    ) prev
  ) h
  where c.junta_id = p_junta
    and c.fecha_vencimiento >= v_corte
    and c.fecha_vencimiento <= v_corte + greatest(1, least(coalesce(p_horizonte_dias, 31), 120))
    and (c.fecha_pago is null or c.fecha_pago > v_corte)
  order by c.fecha_vencimiento, public.ml_unidad_ref(c.unidad_id);
end $$;

-- Exportación del Contrato de Datos APF2 (más columna "origen" exigida por APF3).
-- Solo incluye cuotas con etiqueta determinable: pagadas o vencidas. Las cuotas aún no vencidas o
-- con pago en revisión no tienen etiqueta definitiva y se excluyen para no etiquetarlas mal.
-- pagos_atrasados_previos se calcula con corte al inicio del periodo (información previa).
create or replace function public.exportar_dataset_morosidad(p_junta uuid)
returns table (
  unidad_ref text,
  periodo date,
  monto numeric,
  fecha_vencimiento date,
  fecha_pago date,
  dias_atraso integer,
  metodo_pago text,
  pagos_atrasados_previos integer,
  moroso smallint,
  es_simulado smallint,
  origen text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
begin
  perform public.exigir_admin_o_servicio(p_junta);
  return query
  select
    public.ml_unidad_ref(c.unidad_id),
    c.periodo,
    c.monto,
    c.fecha_vencimiento,
    c.fecha_pago,
    c.dias_atraso,
    pg.metodo,
    (select count(*)::integer from public.cuotas p
      where p.unidad_id = c.unidad_id
        and p.periodo < c.periodo and p.periodo >= (c.periodo - interval '3 months')::date
        and p.fecha_vencimiento < c.periodo
        and (p.fecha_pago is null or p.fecha_pago > c.periodo or p.fecha_pago > p.fecha_vencimiento)),
    (case when c.estado = 'pagada' and c.fecha_pago > c.fecha_vencimiento then 1
          when c.estado = 'pendiente' and c.fecha_vencimiento < v_hoy then 1
          else 0 end)::smallint,
    (case when c.es_simulado then 1 else 0 end)::smallint,
    case when c.es_simulado then 'simulado' else 'real' end
  from public.cuotas c
  left join public.pagos pg on pg.id = c.pago_id
  where c.junta_id = p_junta
    and (c.estado = 'pagada' or (c.estado = 'pendiente' and c.fecha_vencimiento < v_hoy))
  order by public.ml_unidad_ref(c.unidad_id), c.periodo;
end $$;

-- Cuotas próximas a vencer con su última predicción real (vacío si no existe modelo activo).
create or replace function public.predicciones_vigentes(p_junta uuid)
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

revoke execute on function public.ml_unidad_ref(uuid), public.exigir_admin_o_servicio(uuid),
  public.ml_caracteristicas_cuotas(uuid, date, integer), public.exportar_dataset_morosidad(uuid),
  public.predicciones_vigentes(uuid)
from public, anon;
grant execute on function public.ml_caracteristicas_cuotas(uuid, date, integer),
  public.exportar_dataset_morosidad(uuid), public.predicciones_vigentes(uuid)
to authenticated, service_role;
revoke execute on function public.exigir_admin_o_servicio(uuid) from authenticated;
