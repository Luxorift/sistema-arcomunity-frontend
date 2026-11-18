-- Arcomunity · Modelo de riesgo de morosidad v1 dentro de la base (APF3, integración con el MVP)
-- La regresión logística elegida (ml/modelo_morosidad) se reduce a una fórmula: se guardan sus parámetros en
-- modelos_ml y PostgreSQL calcula la probabilidad de las cuotas por vencer. Sin servidor adicional ni clave de
-- servicio fuera de Supabase. La paridad con scikit-learn se prueba en supabase/tests/prediccion-ml.test.ts con
-- 115 casos generados por el pipeline exportado (ml/modelo_morosidad/modelo/paridad_sql_casos_v1.json).
--   * ml_probabilidad(parametros, entrada): fórmula logística, sin efectos secundarios.
--   * ml_factores(parametros, entrada): variables por encima del promedio que elevan el riesgo (máx. 3).
--   * calcular_riesgo_morosidad(junta, corte, horizonte): solo la administración de la junta (con la fecha de
--     hoy) o el servicio; toma las variables de ml_caracteristicas_cuotas (sin información futura), guarda en
--     predicciones_morosidad y audita.
-- Las predicciones solo las lee la administración (RLS existente); los propietarios nunca ven su riesgo.

alter table public.modelos_ml add column parametros jsonb;

create or replace function public.ml_probabilidad(p_parametros jsonb, p_entrada jsonb)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_z double precision := (p_parametros ->> 'intercepto')::double precision;
  v text;
begin
  for v in select jsonb_array_elements_text(p_parametros -> 'caracteristicas') loop
    if p_entrada ->> v is null then
      raise exception 'Falta la variable % para el modelo.', v;
    end if;
    v_z := v_z + (p_parametros -> 'coeficientes' ->> v)::double precision
      * ((p_entrada ->> v)::double precision - (p_parametros -> 'media' ->> v)::double precision)
      / (p_parametros -> 'escala' ->> v)::double precision;
  end loop;
  return 1 / (1 + exp(-v_z));
end $$;

create or replace function public.ml_factores(p_parametros jsonb, p_entrada jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('variable', t.v, 'aporte', round(t.aporte::numeric, 3)) order by t.aporte desc), '[]'::jsonb)
  from (
    select s.v, s.coef * s.x as aporte
    from (
      select c.v,
        (p_parametros -> 'coeficientes' ->> c.v)::double precision as coef,
        ((p_entrada ->> c.v)::double precision - (p_parametros -> 'media' ->> c.v)::double precision)
          / (p_parametros -> 'escala' ->> c.v)::double precision as x
      from jsonb_array_elements_text(p_parametros -> 'caracteristicas') as c(v)
    ) s
    where s.coef * s.x > 0 and s.x > 0
    order by s.coef * s.x desc
    limit 3
  ) t
$$;

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

revoke execute on function public.ml_probabilidad(jsonb, jsonb), public.ml_factores(jsonb, jsonb),
  public.calcular_riesgo_morosidad(uuid, date, integer) from public, anon;
revoke execute on function public.ml_probabilidad(jsonb, jsonb), public.ml_factores(jsonb, jsonb) from authenticated;
grant execute on function public.calcular_riesgo_morosidad(uuid, date, integer) to authenticated, service_role;

-- Registro del modelo v1 (único activo). Métricas reales del notebook; datos simulados.
insert into public.modelos_ml (version, algoritmo, umbral, caracteristicas, metricas, entrenado_en, datos_entrenamiento, activo, notas, parametros)
values (
  'v1', 'Regresión logística (scikit-learn 1.9.1, C = 10)', 0.226,
  array['pagos_atrasados_previos', 'atrasos_previos_total', 'tasa_atraso_previa', 'dias_atraso_promedio_previo'],
  '{"validacion_mes_10": {"accuracy": 0.933, "precision": 0.75, "recall": 1.0, "f1": 0.857}, "prueba_meses_11_12": {"accuracy": 0.847, "precision": 0.611, "recall": 0.846, "f1": 0.71}, "validacion_anidada_meses_5_10": {"accuracy": 0.839, "precision": 0.562, "recall": 0.973, "f1": 0.713}, "datos": "simulados (semilla determinista): resultados indicativos"}'::jsonb,
  '2026-11-18 00:00:00-05',
  'dataset_arcomunity_apf3.csv (sha256 12bfe4d0317c0996…), meses 1–10, 300 cuotas simuladas',
  true,
  'Umbral exacto en parametros.umbral (0.2258). Seleccionado por validación temporal y reevaluado frente a SVM, KNN, árbol y boosting (ml/modelo_morosidad/comparacion).',
  '{"modelo_version": "v1", "umbral": 0.2258, "caracteristicas": ["pagos_atrasados_previos", "atrasos_previos_total", "tasa_atraso_previa", "dias_atraso_promedio_previo"], "media": {"pagos_atrasados_previos": 0.49333333333333335, "atrasos_previos_total": 0.9333333333333333, "tasa_atraso_previa": 0.19085900000000003, "dias_atraso_promedio_previo": 2.873933333333333}, "escala": {"pagos_atrasados_previos": 0.9146705539275998, "atrasos_previos_total": 1.8535251699277124, "tasa_atraso_previa": 0.3381141461385489, "dias_atraso_promedio_previo": 7.181849752133654}, "coeficientes": {"pagos_atrasados_previos": -1.867253564818405, "atrasos_previos_total": 1.5045516739791496, "tasa_atraso_previa": 1.5125120342833231, "dias_atraso_promedio_previo": 0.9974120646642042}, "intercepto": -1.6609517594445344}'::jsonb
)
on conflict (version) do nothing;
