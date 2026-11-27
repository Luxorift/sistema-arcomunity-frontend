-- Arcomunity · Flujo de extremo a extremo de la predicción de morosidad (Proyecto Final, Paso 3)
-- Qué agrega, sin borrar datos ni cambiar el modelo v1:
--   1) Origen de cada predicción: «modelo» o «regla_respaldo» (degradación controlada), con su motivo.
--   2) registro_predicciones: bitácora de solo inserción con entrada, salida, probabilidad, versión, origen,
--      usuario y fecha de CADA cálculo (el recálculo actualiza predicciones_morosidad, pero el registro conserva
--      la historia para reproducir cualquier resultado de la demostración). Conservación: 12 meses.
--   3) Validación de la entrada y de la salida del modelo. Si la entrada viola el dominio (negativos, tasa > 1,
--      atrasos de 3 meses > 3 o mayores que el total), el caso se escala a revisión humana (riesgo medio). Si el
--      modelo no está disponible, falla o devuelve un valor fuera de [0, 1], se aplica la regla manual que usaba la
--      administración: riesgo alto si hubo un atraso en los 3 meses previos.
--   4) calcular_riesgo_periodo: el registro nuevo (cuotas generadas) dispara la predicción de ese periodo.
--   5) recordatorios + registrar_recordatorio: la acción de la administración sobre una alerta, auditada.
--   6) probar_entrada_modelo: la administración prueba el modelo con un caso escrito a mano; las entradas
--      inválidas se rechazan con un mensaje claro.
--   7) simular_falla_modelo: solo en la junta de demostración, para mostrar en vivo la degradación controlada.
--   8) Solicitudes repetidas o tardías (el cliente deja de esperar a los 8 s, pero el servidor termina): un cálculo a
--      la vez por junta (bloqueo transaccional), una sola predicción vigente por cuota y corte (el último cálculo
--      reemplaza al anterior, sea del modelo o de la regla) y una bitácora con lote, inicio de la solicitud y demora
--      para distinguir cálculos normales, respaldos, reintentos y respuestas tardías (demora > 8000 ms).
-- Reglas que se mantienen: solo la administración de la junta ve y calcula predicciones (RLS + exigir_admin);
-- los propietarios nunca ven su riesgo; el modelo solo sugiere y la decisión es humana (Ley N.° 31814).

-- ---------------------------------------------------------------------------------------------
-- 1) Origen de la predicción y regla manual de respaldo
-- ---------------------------------------------------------------------------------------------
alter table public.predicciones_morosidad
  add column origen text not null default 'modelo' check (origen in ('modelo', 'regla_respaldo')),
  add column motivo_respaldo text check (motivo_respaldo is null or motivo_respaldo in
    ('modelo_no_disponible', 'falla_simulada', 'entrada_fuera_de_rango', 'salida_fuera_de_rango', 'error_modelo')),
  add column solicitado_por uuid;
alter table public.predicciones_morosidad alter column probabilidad drop not null;
alter table public.predicciones_morosidad add constraint predicciones_probabilidad_segun_origen
  check ((origen = 'modelo') = (probabilidad is not null) and (origen = 'modelo') = (motivo_respaldo is null));
-- Una sola predicción vigente por cuota y corte: el modelo y la regla de respaldo nunca conviven como resultados
-- contradictorios. El último cálculo reemplaza la fila (conserva su id y el vínculo de los recordatorios); la historia
-- completa queda en registro_predicciones. Antes de esta migración solo existía el modelo v1, así que no hay duplicados.
create unique index predicciones_una_por_cuota_y_corte on public.predicciones_morosidad (cuota_id, fecha_corte);

-- La regla de respaldo se registra como una versión inactiva, para que cada fila tenga su «modelo».
-- Métricas: evaluación única de la prueba del PROY (ml/proy/resultados/prueba/metricas_prueba.csv).
insert into public.modelos_ml (version, algoritmo, umbral, caracteristicas, metricas, entrenado_en, datos_entrenamiento, activo, notas)
values ('regla-respaldo', 'Regla manual: atraso en los 3 meses previos', 0.5, array['pagos_atrasados_previos'],
  '{"prueba_meses_11_12": {"accuracy": 0.746, "precision": 0.45, "recall": 0.692, "f1": 0.545}, "datos": "simulados"}'::jsonb,
  '2026-11-26 00:00:00-05', 'No se entrena: regla de negocio de la administración', false,
  'Se usa solo cuando el modelo activo no responde o la entrada o salida están fuera de rango. El umbral no se usa.')
on conflict (version) do nothing;

-- Dominio válido de la entrada (esquema ml/proy/esquema_entrada.json).
create or replace function public.ml_entrada_valida(p_entrada jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_3m double precision; v_total double precision; v_tasa double precision; v_dias double precision;
begin
  v_3m := (p_entrada ->> 'pagos_atrasados_previos')::double precision;
  v_total := (p_entrada ->> 'atrasos_previos_total')::double precision;
  v_tasa := (p_entrada ->> 'tasa_atraso_previa')::double precision;
  v_dias := (p_entrada ->> 'dias_atraso_promedio_previo')::double precision;
  return v_3m is not null and v_total is not null and v_tasa is not null and v_dias is not null
    and v_3m between 0 and 3 and v_3m = trunc(v_3m) and v_total >= v_3m and v_total = trunc(v_total)
    and v_tasa between 0 and 1 and v_dias between 0 and 3650;
exception when others then
  return false;   -- texto no numérico u otro formato incorrecto
end $$;

-- Evalúa un caso: modelo si todo está en rango; si no, regla de respaldo o escalamiento. Nunca lanza error.
create or replace function public.ml_evaluar(p_parametros jsonb, p_entrada jsonb, p_motivo_forzado text default null)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_motivo text := p_motivo_forzado;
  v_p double precision;
  v_umbral double precision;
  v_3m double precision;
begin
  if v_motivo is null and p_parametros is null then v_motivo := 'modelo_no_disponible'; end if;
  if v_motivo is null and not public.ml_entrada_valida(p_entrada) then v_motivo := 'entrada_fuera_de_rango'; end if;
  if v_motivo is null then
    begin
      v_p := public.ml_probabilidad(p_parametros, p_entrada);
      v_umbral := (p_parametros ->> 'umbral')::double precision;
    exception when others then
      v_motivo := 'error_modelo';
    end;
  end if;
  if v_motivo is null and (v_p is null or v_p = 'NaN'::double precision or v_p < 0 or v_p > 1
                           or v_umbral is null or v_umbral <= 0 or v_umbral >= 1) then
    v_motivo := 'salida_fuera_de_rango';
  end if;
  if v_motivo is null then
    return jsonb_build_object('origen', 'modelo', 'motivo_respaldo', null, 'probabilidad', round(v_p::numeric, 4),
      'prediccion', (v_p >= v_umbral)::integer, 'umbral', v_umbral,
      'nivel_riesgo', case when v_p >= v_umbral then 'alto' when v_p >= v_umbral / 2 then 'medio' else 'bajo' end,
      'factores', public.ml_factores(p_parametros, p_entrada));
  end if;
  if v_motivo = 'entrada_fuera_de_rango' then
    -- Datos incoherentes: no se adivina; se escala a revisión de la administración.
    return jsonb_build_object('origen', 'regla_respaldo', 'motivo_respaldo', v_motivo, 'probabilidad', null,
      'prediccion', 0, 'umbral', null, 'nivel_riesgo', 'medio', 'factores', '[]'::jsonb);
  end if;
  begin
    v_3m := (p_entrada ->> 'pagos_atrasados_previos')::double precision;
  exception when others then
    v_3m := null;
  end;
  return jsonb_build_object('origen', 'regla_respaldo', 'motivo_respaldo', v_motivo, 'probabilidad', null,
    'prediccion', (coalesce(v_3m, 0) >= 1)::integer, 'umbral', null,
    'nivel_riesgo', case when coalesce(v_3m, 0) >= 1 then 'alto' else 'bajo' end,
    'factores', case when coalesce(v_3m, 0) >= 1
      then jsonb_build_array(jsonb_build_object('variable', 'pagos_atrasados_previos', 'aporte', 0)) else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2) Bitácora de predicciones (solo inserción)
-- ---------------------------------------------------------------------------------------------
create table public.registro_predicciones (
  id bigint generated always as identity primary key,
  junta_id uuid not null references public.juntas(id) on delete cascade,
  tipo text not null check (tipo in ('cuota', 'caso_manual')),
  prediccion_id uuid,                       -- sin FK: la historia sobrevive al recálculo y a la restauración demo
  cuota_id uuid,
  unidad_ref text,
  periodo date,
  modelo_version text not null,
  origen text not null check (origen in ('modelo', 'regla_respaldo')),
  motivo_respaldo text,
  entrada jsonb not null,
  probabilidad numeric(5,4),
  prediccion smallint not null check (prediccion in (0, 1)),
  nivel_riesgo text not null check (nivel_riesgo in ('bajo', 'medio', 'alto')),
  umbral double precision,
  factores jsonb not null default '[]'::jsonb,
  fecha_corte date,
  solicitado_por uuid,
  lote uuid not null,                       -- un lote por cálculo: agrupa sus filas y separa reintentos
  solicitado_en timestamptz not null,       -- inicio de la solicitud (transacción)
  registrado_en timestamptz not null default clock_timestamp(),
  demora_ms integer not null                -- registrado_en − solicitado_en; > 8000 = respuesta tardía (el cliente ya no esperaba)
);
create index registro_predicciones_junta_idx on public.registro_predicciones (junta_id, registrado_en desc);
create index registro_predicciones_lote_idx on public.registro_predicciones (lote);
alter table public.registro_predicciones enable row level security;
revoke all on public.registro_predicciones from anon, authenticated;
grant select on public.registro_predicciones to authenticated;
create policy registro_predicciones_leer_admin on public.registro_predicciones
  for select to authenticated using (public.es_admin_de(junta_id));

create or replace function public.bloquear_modificacion_registro_predicciones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Solo la purga de conservación (12 meses) o el mantenimiento pueden eliminar filas.
  if tg_op = 'DELETE' and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return old;
  end if;
  raise exception 'El registro de predicciones no se puede modificar ni eliminar.';
end $$;
create trigger registro_predicciones_inmutable before update or delete on public.registro_predicciones
  for each row execute function public.bloquear_modificacion_registro_predicciones();

create or replace function public.copiar_prediccion_al_registro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registro_predicciones (junta_id, tipo, prediccion_id, cuota_id, unidad_ref, periodo, modelo_version,
    origen, motivo_respaldo, entrada, probabilidad, prediccion, nivel_riesgo, umbral, factores, fecha_corte, solicitado_por,
    lote, solicitado_en, demora_ms)
  select new.junta_id, 'cuota', new.id, new.cuota_id, public.ml_unidad_ref(c.unidad_id), c.periodo, m.version,
    new.origen, new.motivo_respaldo, new.entrada, new.probabilidad, new.prediccion, new.nivel_riesgo,
    case when new.origen = 'modelo' then (m.parametros ->> 'umbral')::double precision end,
    new.factores, new.fecha_corte, new.solicitado_por,
    -- ml_calcular fija el lote de la transacción; una escritura directa (mantenimiento) recibe un lote propio.
    coalesce(nullif(current_setting('arcomunity.lote_prediccion', true), '')::uuid, gen_random_uuid()),
    now(), round(extract(epoch from clock_timestamp() - now()) * 1000)::integer
  from public.modelos_ml m left join public.cuotas c on c.id = new.cuota_id
  where m.id = new.modelo_id;
  return new;
end $$;
create trigger predicciones_al_registro after insert or update on public.predicciones_morosidad
  for each row execute function public.copiar_prediccion_al_registro();

create or replace function public.purgar_registro_predicciones()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.registro_predicciones where registrado_en < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3) Interruptor de falla simulada (solo junta de demostración)
-- ---------------------------------------------------------------------------------------------
create table public.demo_ajustes (
  junta_id uuid primary key references public.juntas(id) on delete cascade,
  simular_falla_modelo boolean not null default false,
  actualizado_en timestamptz not null default now()
);
alter table public.demo_ajustes enable row level security;
revoke all on public.demo_ajustes from anon, authenticated;

create or replace function public.simular_falla_modelo(p_junta uuid, p_activa boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin(p_junta);
  if not public.es_junta_demo(p_junta) then
    raise exception 'La falla simulada solo está disponible en la junta de demostración.';
  end if;
  insert into public.demo_ajustes (junta_id, simular_falla_modelo) values (p_junta, coalesce(p_activa, false))
  on conflict (junta_id) do update set simular_falla_modelo = excluded.simular_falla_modelo, actualizado_en = now();
  perform public.registrar_auditoria(p_junta, 'simular_falla_modelo', 'junta', p_junta,
    jsonb_build_object('activa', coalesce(p_activa, false)));
  return jsonb_build_object('simular_falla_modelo', coalesce(p_activa, false));
end $$;

create or replace function public.estado_prediccion(p_junta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin(p_junta);
  return jsonb_build_object(
    'es_demo', public.es_junta_demo(p_junta),
    'simular_falla_modelo', coalesce((select a.simular_falla_modelo from public.demo_ajustes a where a.junta_id = p_junta), false),
    'modelo_activo', (select m.version from public.modelos_ml m where m.activo and m.parametros is not null));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4) Cálculo común: modelo con validación, respaldo y registro
-- ---------------------------------------------------------------------------------------------
create or replace function public.ml_calcular(p_junta uuid, p_corte date, p_horizonte_dias integer, p_periodo date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := clock_timestamp();
  v_modelo public.modelos_ml;
  v_respaldo uuid := (select m.id from public.modelos_ml m where m.version = 'regla-respaldo');
  v_forzado text;
  r record;
  v_entrada jsonb;
  v_res jsonb;
  n integer := 0; n_alto integer := 0; n_medio integer := 0; n_respaldo integer := 0;
  v_motivos text[] := '{}';
  v_lote uuid := gen_random_uuid();
begin
  -- Un cálculo a la vez por junta: los reintentos esperan su turno, nunca se mezclan, y el último en ejecutarse define
  -- la predicción vigente. El bloqueo se libera al terminar la transacción.
  perform pg_advisory_xact_lock(hashtextextended('arcomunity.ml_calcular:' || p_junta::text, 0));
  perform set_config('arcomunity.lote_prediccion', v_lote::text, true);
  select * into v_modelo from public.modelos_ml where activo;
  if not found or v_modelo.parametros is null then
    v_forzado := 'modelo_no_disponible';
  elsif coalesce((select a.simular_falla_modelo from public.demo_ajustes a where a.junta_id = p_junta), false)
        and public.es_junta_demo(p_junta) then
    v_forzado := 'falla_simulada';
  end if;

  for r in select * from public.ml_caracteristicas_cuotas(p_junta, p_corte, p_horizonte_dias) loop
    if p_periodo is not null and r.periodo <> p_periodo then continue; end if;
    v_entrada := jsonb_build_object(
      'pagos_atrasados_previos', r.pagos_atrasados_previos, 'atrasos_previos_total', r.atrasos_previos_total,
      'tasa_atraso_previa', r.tasa_atraso_previa, 'dias_atraso_promedio_previo', r.dias_atraso_promedio_previo,
      'cuotas_previas', r.cuotas_previas, 'dias_para_vencer', r.dias_para_vencer, 'periodo', r.periodo);
    v_res := public.ml_evaluar(case when v_forzado is null then v_modelo.parametros end, v_entrada, v_forzado);
    insert into public.predicciones_morosidad (junta_id, cuota_id, modelo_id, fecha_corte, probabilidad, prediccion,
      nivel_riesgo, factores, entrada, origen, motivo_respaldo, solicitado_por)
    values (p_junta, r.cuota_id, case when v_res ->> 'origen' = 'modelo' then v_modelo.id else v_respaldo end, p_corte,
      (v_res ->> 'probabilidad')::numeric, (v_res ->> 'prediccion')::smallint, v_res ->> 'nivel_riesgo', v_res -> 'factores',
      v_entrada, v_res ->> 'origen', v_res ->> 'motivo_respaldo', auth.uid())
    on conflict (cuota_id, fecha_corte) do update set
      modelo_id = excluded.modelo_id, probabilidad = excluded.probabilidad, prediccion = excluded.prediccion,
      nivel_riesgo = excluded.nivel_riesgo, factores = excluded.factores, entrada = excluded.entrada, origen = excluded.origen,
      motivo_respaldo = excluded.motivo_respaldo, solicitado_por = excluded.solicitado_por, generado_en = clock_timestamp();
    n := n + 1;
    if v_res ->> 'nivel_riesgo' = 'alto' then n_alto := n_alto + 1; elsif v_res ->> 'nivel_riesgo' = 'medio' then n_medio := n_medio + 1; end if;
    if v_res ->> 'origen' = 'regla_respaldo' then
      n_respaldo := n_respaldo + 1;
      if not (v_res ->> 'motivo_respaldo' = any (v_motivos)) then v_motivos := v_motivos || (v_res ->> 'motivo_respaldo'); end if;
    end if;
  end loop;

  return jsonb_build_object('modelo_version', case when v_forzado is null then v_modelo.version else 'regla-respaldo' end,
    'umbral', case when v_forzado is null then (v_modelo.parametros ->> 'umbral')::double precision end,
    'fecha_corte', p_corte, 'periodo', p_periodo, 'cuotas', n, 'alto', n_alto, 'medio', n_medio,
    'bajo', n - n_alto - n_medio, 'respaldo', n_respaldo, 'motivos_respaldo', to_jsonb(v_motivos),
    'lote', v_lote, 'duracion_ms', round(extract(epoch from clock_timestamp() - v_inicio) * 1000));
end $$;

-- calcular_riesgo_morosidad: misma firma y permisos de la migración 1200; ahora no falla si el modelo no responde.
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
  v jsonb;
begin
  perform public.exigir_admin_o_servicio(p_junta);
  if v_corte <> v_hoy and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'El riesgo se calcula con la fecha de hoy.';
  end if;
  v := public.ml_calcular(p_junta, v_corte, p_horizonte_dias, null);
  perform public.registrar_auditoria(p_junta, 'calcular_riesgo_morosidad', 'junta', p_junta, jsonb_build_object(
    'modelo', v ->> 'modelo_version', 'fecha_corte', v_corte, 'cuotas', v -> 'cuotas', 'riesgo_alto', v -> 'alto',
    'respaldo', v -> 'respaldo', 'motivos_respaldo', v -> 'motivos_respaldo', 'duracion_ms', v -> 'duracion_ms'));
  return v;
end $$;

-- Registro nuevo → predicción: riesgo de las cuotas de un periodo recién generado, con la fecha de hoy.
create or replace function public.calcular_riesgo_periodo(p_junta uuid, p_periodo date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
  v_venc date;
  v jsonb;
begin
  perform public.exigir_admin(p_junta);
  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.';
  end if;
  select max(c.fecha_vencimiento) into v_venc from public.cuotas c where c.junta_id = p_junta and c.periodo = p_periodo;
  if v_venc is null then
    raise exception 'No hay cuotas generadas para ese periodo.';
  end if;
  if v_venc < v_hoy then
    return jsonb_build_object('periodo', p_periodo, 'cuotas', 0, 'alto', 0, 'medio', 0, 'bajo', 0, 'respaldo', 0,
      'motivos_respaldo', '[]'::jsonb, 'aviso', 'Las cuotas de ese periodo ya vencieron: no se predice lo que ya ocurrió.');
  end if;
  v := public.ml_calcular(p_junta, v_hoy, greatest(1, v_venc - v_hoy), p_periodo);
  perform public.registrar_auditoria(p_junta, 'calcular_riesgo_periodo', 'junta', p_junta, jsonb_build_object(
    'periodo', p_periodo, 'modelo', v ->> 'modelo_version', 'cuotas', v -> 'cuotas', 'riesgo_alto', v -> 'alto',
    'respaldo', v -> 'respaldo', 'duracion_ms', v -> 'duracion_ms'));
  return v;
end $$;

-- Caso escrito a mano por la administración: entradas inválidas se rechazan con un mensaje claro.
create or replace function public.probar_entrada_modelo(p_junta uuid, p_entrada jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_modelo public.modelos_ml;
  v_forzado text;
  v_res jsonb;
  k text;
  v_num double precision;
begin
  perform public.exigir_admin(p_junta);
  if p_entrada is null or jsonb_typeof(p_entrada) <> 'object' then
    raise exception 'Escribe los datos del caso.';
  end if;
  foreach k in array array['pagos_atrasados_previos', 'atrasos_previos_total', 'tasa_atraso_previa', 'dias_atraso_promedio_previo'] loop
    if p_entrada ->> k is null or btrim(p_entrada ->> k) = '' then
      raise exception 'Falta el dato «%».', k;
    end if;
    begin
      v_num := (p_entrada ->> k)::double precision;
    exception when others then
      raise exception 'El dato «%» debe ser un número.', k;
    end;
    if v_num < 0 then raise exception 'El dato «%» no puede ser negativo.', k; end if;
  end loop;
  if (p_entrada ->> 'pagos_atrasados_previos')::double precision > 3 then
    raise exception 'Los atrasos de los últimos 3 meses van de 0 a 3.';
  end if;
  if (p_entrada ->> 'atrasos_previos_total')::double precision < (p_entrada ->> 'pagos_atrasados_previos')::double precision then
    raise exception 'Los atrasos totales no pueden ser menos que los de los últimos 3 meses.';
  end if;
  if (p_entrada ->> 'tasa_atraso_previa')::double precision > 1 then
    raise exception 'La proporción de cuotas atrasadas va de 0 a 1 (por ejemplo, 0.25 = 25 %%).';
  end if;
  if not public.ml_entrada_valida(p_entrada) then
    raise exception 'Los datos del caso no son coherentes: revisa que los atrasos sean números enteros.';
  end if;

  select * into v_modelo from public.modelos_ml where activo;
  if not found or v_modelo.parametros is null then
    v_forzado := 'modelo_no_disponible';
  elsif coalesce((select a.simular_falla_modelo from public.demo_ajustes a where a.junta_id = p_junta), false) then
    v_forzado := 'falla_simulada';
  end if;
  v_res := public.ml_evaluar(case when v_forzado is null then v_modelo.parametros end, p_entrada, v_forzado);
  insert into public.registro_predicciones (junta_id, tipo, modelo_version, origen, motivo_respaldo, entrada, probabilidad,
    prediccion, nivel_riesgo, umbral, factores, fecha_corte, solicitado_por, lote, solicitado_en, demora_ms)
  values (p_junta, 'caso_manual', case when v_res ->> 'origen' = 'modelo' then v_modelo.version else 'regla-respaldo' end,
    v_res ->> 'origen', v_res ->> 'motivo_respaldo', p_entrada, (v_res ->> 'probabilidad')::numeric,
    (v_res ->> 'prediccion')::smallint, v_res ->> 'nivel_riesgo', (v_res ->> 'umbral')::double precision, v_res -> 'factores',
    public.hoy_lima(), auth.uid(), gen_random_uuid(), now(), round(extract(epoch from clock_timestamp() - now()) * 1000)::integer);
  return v_res || jsonb_build_object('modelo_version', case when v_res ->> 'origen' = 'modelo' then v_modelo.version else 'regla-respaldo' end);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5) Recordatorios: la acción de la administración sobre una alerta
-- ---------------------------------------------------------------------------------------------
create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  prediccion_id uuid references public.predicciones_morosidad(id) on delete set null,
  canal text not null check (canal in ('whatsapp', 'llamada', 'presencial', 'otro')),
  nota text check (nota is null or char_length(nota) <= 200),
  registrado_por uuid,
  creado_en timestamptz not null default now()
);
create index recordatorios_cuota_idx on public.recordatorios (cuota_id, creado_en desc);
alter table public.recordatorios enable row level security;
revoke all on public.recordatorios from anon, authenticated;
grant select on public.recordatorios to authenticated;
create policy recordatorios_leer_admin on public.recordatorios
  for select to authenticated using (public.es_admin_de(junta_id));

create or replace function public.registrar_recordatorio(p_cuota_id uuid, p_canal text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cuotas;
  v_pred uuid;
  v_id uuid;
begin
  select * into c from public.cuotas where id = p_cuota_id;
  if not found then
    raise exception 'La cuota no existe.';
  end if;
  perform public.exigir_admin(c.junta_id);
  if p_canal is null or p_canal not in ('whatsapp', 'llamada', 'presencial', 'otro') then
    raise exception 'Elige el canal del recordatorio: WhatsApp, llamada, presencial u otro.';
  end if;
  if p_nota is not null and char_length(p_nota) > 200 then
    raise exception 'La nota admite hasta 200 caracteres.';
  end if;
  if c.estado = 'pagada' then
    raise exception 'Esta cuota ya está pagada: no necesita recordatorio.';
  end if;
  select pr.id into v_pred from public.predicciones_morosidad pr where pr.cuota_id = p_cuota_id order by pr.generado_en desc limit 1;
  insert into public.recordatorios (junta_id, cuota_id, prediccion_id, canal, nota, registrado_por)
  values (c.junta_id, p_cuota_id, v_pred, p_canal, nullif(btrim(p_nota), ''), auth.uid())
  returning id into v_id;
  perform public.registrar_auditoria(c.junta_id, 'registrar_recordatorio', 'cuota', p_cuota_id,
    jsonb_build_object('canal', p_canal, 'prediccion_id', v_pred));
  return jsonb_build_object('id', v_id, 'cuota_id', p_cuota_id, 'canal', p_canal);
end $$;

-- predicciones_vigentes: agrega origen, motivo y último recordatorio (la firma de salida cambia).
drop function if exists public.predicciones_vigentes(uuid);
create function public.predicciones_vigentes(p_junta uuid)
returns table (
  cuota_id uuid, unidad_codigo text, periodo date, fecha_vencimiento date, probabilidad numeric,
  nivel_riesgo text, factores jsonb, modelo_version text, generado_en timestamptz,
  origen text, motivo_respaldo text, ultimo_recordatorio timestamptz, canal_recordatorio text
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
    m.version, pr.generado_en, pr.origen, pr.motivo_respaldo, rc.creado_en, rc.canal
  from public.predicciones_morosidad pr
  join public.modelos_ml m on m.id = pr.modelo_id and (m.activo or m.version = 'regla-respaldo')
  join public.cuotas c on c.id = pr.cuota_id and c.estado <> 'pagada'
  join public.unidades u on u.id = c.unidad_id
  left join lateral (select r.creado_en, r.canal from public.recordatorios r where r.cuota_id = pr.cuota_id
                     order by r.creado_en desc limit 1) rc on true
  where pr.junta_id = p_junta and c.fecha_vencimiento >= public.hoy_lima()
  order by pr.cuota_id, pr.generado_en desc;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6) La restauración de la demostración también limpia recordatorios y apaga la falla simulada
-- ---------------------------------------------------------------------------------------------
alter function public.restaurar_demo_datos(uuid) rename to restaurar_demo_datos_base;
create function public.restaurar_demo_datos(p_junta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recordatorios integer;
begin
  if not public.es_junta_demo(p_junta) then
    raise exception 'Solo se puede restaurar la junta de demostración.';
  end if;
  delete from public.recordatorios where junta_id = p_junta;
  get diagnostics v_recordatorios = row_count;
  delete from public.demo_ajustes where junta_id = p_junta;
  return public.restaurar_demo_datos_base(p_junta) || jsonb_build_object('recordatorios_quitados', v_recordatorios);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7) Permisos
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.ml_entrada_valida(jsonb), public.ml_evaluar(jsonb, jsonb, text),
  public.ml_calcular(uuid, date, integer, date), public.copiar_prediccion_al_registro(),
  public.bloquear_modificacion_registro_predicciones(), public.purgar_registro_predicciones(),
  public.restaurar_demo_datos(uuid), public.restaurar_demo_datos_base(uuid),
  public.simular_falla_modelo(uuid, boolean), public.estado_prediccion(uuid), public.calcular_riesgo_periodo(uuid, date),
  public.probar_entrada_modelo(uuid, jsonb), public.registrar_recordatorio(uuid, text, text),
  public.predicciones_vigentes(uuid)
from public, anon;
revoke execute on function public.ml_entrada_valida(jsonb), public.ml_evaluar(jsonb, jsonb, text),
  public.ml_calcular(uuid, date, integer, date), public.purgar_registro_predicciones(),
  public.restaurar_demo_datos(uuid), public.restaurar_demo_datos_base(uuid)
from authenticated;
grant execute on function public.simular_falla_modelo(uuid, boolean), public.estado_prediccion(uuid),
  public.calcular_riesgo_periodo(uuid, date), public.probar_entrada_modelo(uuid, jsonb),
  public.registrar_recordatorio(uuid, text, text), public.predicciones_vigentes(uuid)
to authenticated, service_role;

-- Conservación del registro de predicciones: 12 meses (Ley N.° 29733, principio de proporcionalidad).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('arcomunity-purgar-registro-predicciones', '30 8 1 * *',
        $c$select public.purgar_registro_predicciones()$c$);
    exception when others then
      raise notice 'No se pudo programar la purga del registro de predicciones: %', sqlerrm;
    end;
  end if;
end $$;
