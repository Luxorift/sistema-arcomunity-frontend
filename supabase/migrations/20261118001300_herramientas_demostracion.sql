-- Arcomunity · Herramientas de demostración en Auditoría (preparar y reiniciar desde la web)
-- La administración de la junta en modo demostración puede, desde Auditoría:
--   * preparar_demostracion(): genera las cuotas del mes siguiente si faltan, calcula el riesgo de
--     morosidad con el modelo activo (v1, PostgreSQL) y comprueba los escenarios de las cuentas demo
--     (Casa 12 con cuota por pagar, Casa 08 con pago en revisión, Dpto 301 al día). No inventa pagos:
--     si un escenario se perdió en un ensayo, lo avisa y sugiere reiniciar.
--   * reiniciar_demostracion(): devuelve la junta a la foto guardada (migración 1100), quita las
--     predicciones y lista los archivos subidos en el ensayo para que el navegador los borre.
--   * diagnostico_demostracion(): qué cambió desde la foto, para advertir antes de actuar.
-- Reglas: la autorización se comprueba aquí (exigir_admin + junta en modo demo), nunca solo en la
-- interfaz; propietarios, visitantes y juntas reales quedan fuera. La auditoría no se borra: cada
-- operación agrega su registro con el nombre de quien la ejecutó. Un candado por junta evita dos
-- ejecuciones a la vez. La restauración nocturna (pg_cron, 03:00 de Lima) sigue igual y usa la misma
-- lógica, sin copiarla.

-- 1) La restauración pasa a una función interna única. restaurar_estado_demo (servicio y pg_cron) y
--    reiniciar_demostracion (administración) la llaman.
create or replace function public.restaurar_demo_datos(p_junta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_pagos_quitados integer;
  v_desvinculados integer;
  v_predicciones integer;
begin
  if not public.es_junta_demo(p_junta) then
    raise exception 'Solo se puede restaurar la junta de demostración.';
  end if;
  select d.estado into e from public.demo_estados d where d.junta_id = p_junta;
  if e is null then
    raise exception 'No hay un estado guardado para esta junta.';
  end if;
  perform set_config('arcomunity.restaurando_demo', 'on', true);

  -- Predicciones del ensayo (la foto no tiene: se calculan con «Preparar demostración»).
  delete from public.predicciones_morosidad where junta_id = p_junta;
  get diagnostics v_predicciones = row_count;

  -- Configuración y código.
  update public.juntas j set
    nombre = r.nombre, cuota_mensual = r.cuota_mensual, dia_vencimiento = r.dia_vencimiento,
    yape_titular = r.yape_titular, yape_qr_path = r.yape_qr_path,
    conciliacion_automatica = r.conciliacion_automatica,
    transparencia_detalle_unidades = r.transparencia_detalle_unidades, modo_demo = true
  from jsonb_populate_record(null::public.juntas, e -> 'junta') r
  where j.id = p_junta;
  insert into public.juntas_invitacion (junta_id, codigo) values (p_junta, e ->> 'codigo')
  on conflict (junta_id) do update set codigo = excluded.codigo, actualizado_en = now();

  -- Pagos: se quitan todos y se reponen los de la foto (la FK cuota→pago es diferida).
  select count(*) into v_pagos_quitados from public.pagos pg
  where pg.junta_id = p_junta and pg.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'pagos') x);
  update public.cuotas set pago_id = null, fecha_pago = null,
    estado = case when estado = 'pagada' then 'pendiente' else estado end
  where junta_id = p_junta;
  delete from public.pagos where junta_id = p_junta;
  delete from public.cuotas where junta_id = p_junta
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'cuotas') x);

  -- Unidades (las nuevas se eliminan con sus vínculos).
  delete from public.unidades where junta_id = p_junta
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'unidades') x);
  insert into public.unidades (id, junta_id, codigo, activa, es_simulado, creado_en)
  select r.id, r.junta_id, r.codigo, r.activa, r.es_simulado, r.creado_en
  from jsonb_populate_recordset(null::public.unidades, e -> 'unidades') r
  on conflict (id) do update set codigo = excluded.codigo, activa = excluded.activa;

  -- Vínculos y membresías: los registros hechos durante la demostración se desvinculan
  -- (la cuenta no se borra); los de la foto se reponen.
  update public.unidad_propietarios set hasta = now()
  where junta_id = p_junta and hasta is null
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'vinculos') x);
  get diagnostics v_desvinculados = row_count;
  insert into public.unidad_propietarios (id, junta_id, unidad_id, perfil_id, desde, hasta, creado_en)
  select r.id, r.junta_id, r.unidad_id, r.perfil_id, r.desde, null, r.creado_en
  from jsonb_populate_recordset(null::public.unidad_propietarios, e -> 'vinculos') r
  where exists (select 1 from public.perfiles p where p.id = r.perfil_id)
  on conflict (id) do update set hasta = null;
  update public.miembros_junta set activo = false
  where junta_id = p_junta and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'miembros') x);
  insert into public.miembros_junta (id, junta_id, perfil_id, rol, activo, creado_en)
  select r.id, r.junta_id, r.perfil_id, r.rol, r.activo, r.creado_en
  from jsonb_populate_recordset(null::public.miembros_junta, e -> 'miembros') r
  where exists (select 1 from public.perfiles p where p.id = r.perfil_id)
  on conflict (id) do update set rol = excluded.rol, activo = excluded.activo;

  -- Cuotas y pagos de la foto.
  insert into public.cuotas (id, junta_id, unidad_id, periodo, concepto, monto, fecha_vencimiento, estado,
    fecha_pago, pago_id, es_simulado, creado_en, actualizado_en)
  select r.id, r.junta_id, r.unidad_id, r.periodo, r.concepto, r.monto, r.fecha_vencimiento, r.estado,
    r.fecha_pago, r.pago_id, r.es_simulado, r.creado_en, r.actualizado_en
  from jsonb_populate_recordset(null::public.cuotas, e -> 'cuotas') r
  on conflict (id) do update set periodo = excluded.periodo, monto = excluded.monto,
    fecha_vencimiento = excluded.fecha_vencimiento, estado = excluded.estado, fecha_pago = excluded.fecha_pago,
    pago_id = excluded.pago_id, actualizado_en = excluded.actualizado_en;
  insert into public.pagos (id, junta_id, cuota_id, unidad_id, registrado_por, metodo, monto_declarado,
    fecha_operacion, numero_operacion, comprobante_path, comprobante_sha256, ocr_confianza, ocr_extraido,
    estado, alertas, motivo_rechazo, nota_admin, subido_en, conciliado_en, revisado_por, revisado_en,
    es_simulado, creado_en)
  select r.id, r.junta_id, r.cuota_id, r.unidad_id,
    (select p.id from public.perfiles p where p.id = r.registrado_por), r.metodo, r.monto_declarado,
    r.fecha_operacion, r.numero_operacion, r.comprobante_path, r.comprobante_sha256, r.ocr_confianza, r.ocr_extraido,
    r.estado, r.alertas, r.motivo_rechazo, r.nota_admin, r.subido_en, r.conciliado_en,
    (select p.id from public.perfiles p where p.id = r.revisado_por), r.revisado_en, r.es_simulado, r.creado_en
  from jsonb_populate_recordset(null::public.pagos, e -> 'pagos') r;

  -- Egresos y cámaras.
  delete from public.egresos where junta_id = p_junta
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'egresos') x);
  insert into public.egresos (id, junta_id, fecha, concepto, beneficiario, monto, comentario, registrado_por,
    anulado, motivo_anulacion, anulado_en, es_simulado, creado_en)
  select r.id, r.junta_id, r.fecha, r.concepto, r.beneficiario, r.monto, r.comentario,
    (select p.id from public.perfiles p where p.id = r.registrado_por), r.anulado, r.motivo_anulacion,
    r.anulado_en, r.es_simulado, r.creado_en
  from jsonb_populate_recordset(null::public.egresos, e -> 'egresos') r
  on conflict (id) do update set fecha = excluded.fecha, concepto = excluded.concepto,
    beneficiario = excluded.beneficiario, monto = excluded.monto, comentario = excluded.comentario,
    anulado = excluded.anulado, motivo_anulacion = excluded.motivo_anulacion, anulado_en = excluded.anulado_en;
  delete from public.camaras where junta_id = p_junta
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(e -> 'camaras') x);
  insert into public.camaras (id, junta_id, nombre, ubicacion, tipo, url, activa, creado_en)
  select r.id, r.junta_id, r.nombre, r.ubicacion, r.tipo, r.url, r.activa, r.creado_en
  from jsonb_populate_recordset(null::public.camaras, e -> 'camaras') r
  on conflict (id) do update set nombre = excluded.nombre, ubicacion = excluded.ubicacion, tipo = excluded.tipo,
    url = excluded.url, activa = excluded.activa;

  -- Cuentas demo: nombre, teléfono, correo y contraseña de la foto (se guarda el hash, no la clave).
  update public.perfiles p set nombre_completo = r.nombre_completo, telefono = r.telefono
  from jsonb_to_recordset(e -> 'perfiles') as r(id uuid, nombre_completo text, telefono text)
  where p.id = r.id;
  update auth.users u set encrypted_password = r.encrypted_password, email = r.email, phone = r.phone, email_change = ''
  from jsonb_to_recordset(e -> 'cuentas') as r(id uuid, email text, encrypted_password text, phone text)
  where u.id = r.id and (u.encrypted_password is distinct from r.encrypted_password or u.email is distinct from r.email
    or u.phone is distinct from r.phone or coalesce(u.email_change, '') <> '');

  perform set_config('arcomunity.restaurando_demo', '', true);
  return jsonb_build_object('pagos_quitados', v_pagos_quitados, 'registros_desvinculados', v_desvinculados,
    'predicciones_quitadas', v_predicciones,
    'foto_del', (select d.guardado_en from public.demo_estados d where d.junta_id = p_junta));
end $$;

-- Un solo proceso a la vez por junta (preparar, reiniciar o la restauración nocturna).
create or replace function public.tomar_candado_demo(p_junta uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('arcomunity-demo:' || p_junta::text, 0)) then
    raise exception 'Ya se está preparando o reiniciando la demostración. Espera unos segundos y vuelve a intentarlo.';
  end if;
end $$;

-- Mismo nombre y resultado que en la migración 1100 (lo usan pg_cron y `npm run demo:restaurar`).
create or replace function public.restaurar_estado_demo(p_junta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.exigir_servicio_o_sistema();
  perform public.tomar_candado_demo(p_junta);
  v := public.restaurar_demo_datos(p_junta);
  insert into public.auditoria (junta_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (p_junta, 'Sistema', 'restaurar_demo', 'junta', p_junta, v - 'foto_del');
  return jsonb_build_object('ok', true) || v;
end $$;

-- 2) Escenarios de las cuentas demo (se comprueban, no se fabrican).
create or replace function public.escenarios_demo(p_junta uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with esperado(orden, correo, cuenta, espera) as (
    values (1, 'casa12@arcomunity.demo', 'Casa 12', 'cuota_por_pagar'),
           (2, 'casa08@arcomunity.demo', 'Casa 08', 'pago_en_revision'),
           (3, 'dpto301@arcomunity.demo', 'Dpto. 301', 'al_dia')
  ),
  datos as (
    select e.orden, e.cuenta, e.espera, u.codigo as unidad,
      (select count(*) from public.cuotas c where c.unidad_id = u.id and c.estado = 'pendiente'
         and c.fecha_vencimiento < public.hoy_lima()) as vencidas,
      (select count(*) from public.cuotas c where c.unidad_id = u.id and c.estado = 'pendiente'
         and c.fecha_vencimiento >= public.hoy_lima()) as por_vencer,
      (select count(*) from public.pagos pg where pg.unidad_id = u.id and pg.estado = 'pendiente_revision') as en_revision
    from esperado e
    left join auth.users au on au.email = e.correo and au.raw_app_meta_data ->> 'demo' = 'true'
    left join public.unidad_propietarios up on up.perfil_id = au.id and up.junta_id = p_junta and up.hasta is null
    left join public.unidades u on u.id = up.unidad_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cuenta', d.cuenta, 'unidad', d.unidad, 'espera', d.espera,
    'vencidas', coalesce(d.vencidas, 0), 'por_vencer', coalesce(d.por_vencer, 0), 'en_revision', coalesce(d.en_revision, 0),
    'ok', case
      when d.unidad is null then false
      when d.espera = 'cuota_por_pagar' then d.vencidas + d.por_vencer > 0
      when d.espera = 'pago_en_revision' then d.en_revision > 0
      else d.vencidas = 0 end
  ) order by d.orden), '[]'::jsonb)
  from datos d
$$;

-- Qué cambió desde la foto (para advertir antes de preparar o reiniciar).
create or replace function public.diagnostico_demostracion(p_junta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_hoy date := public.hoy_lima();
  v_siguiente date := (date_trunc('month', public.hoy_lima()) + interval '1 month')::date;
begin
  perform public.exigir_admin(p_junta);
  if not public.es_junta_demo(p_junta) then
    raise exception 'Las herramientas de demostración solo están disponibles en la junta de demostración.';
  end if;
  select d.estado into e from public.demo_estados d where d.junta_id = p_junta;
  return jsonb_build_object(
    'foto_del', (select d.guardado_en from public.demo_estados d where d.junta_id = p_junta),
    'periodo_siguiente', v_siguiente,
    'unidades_activas', (select count(*) from public.unidades u where u.junta_id = p_junta and u.activa),
    'cuotas_mes_siguiente', (select count(*) from public.cuotas c where c.junta_id = p_junta and c.periodo = v_siguiente),
    'predicciones_hoy', (select count(*) from public.predicciones_morosidad pr where pr.junta_id = p_junta and pr.fecha_corte = v_hoy),
    'modelo_activo', (select m.version from public.modelos_ml m where m.activo),
    'cambios', jsonb_build_object(
      'pagos_nuevos', (select count(*) from public.pagos pg where pg.junta_id = p_junta
        and pg.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(e -> 'pagos', '[]')) x)),
      'pagos_revisados', (select count(*) from public.pagos pg join jsonb_array_elements(coalesce(e -> 'pagos', '[]')) x
        on (x ->> 'id')::uuid = pg.id where pg.junta_id = p_junta and pg.estado <> x ->> 'estado'),
      'egresos_nuevos', (select count(*) from public.egresos eg where eg.junta_id = p_junta
        and eg.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(e -> 'egresos', '[]')) x)),
      'cuotas_nuevas', (select count(*) from public.cuotas c where c.junta_id = p_junta
        and c.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(e -> 'cuotas', '[]')) x))),
    'escenarios', public.escenarios_demo(p_junta),
    'ultimo_reinicio', (select max(a.creado_en) from public.auditoria a where a.junta_id = p_junta
      and a.accion in ('reiniciar_demo', 'restaurar_demo')),
    'ultima_preparacion', (select max(a.creado_en) from public.auditoria a where a.junta_id = p_junta and a.accion = 'preparar_demo'));
end $$;

-- 3) Preparar la demostración APF3 (idempotente: se puede pulsar varias veces).
create or replace function public.preparar_demostracion(p_junta uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_siguiente date := (date_trunc('month', public.hoy_lima()) + interval '1 month')::date;
  v_cuotas jsonb;
  v_riesgo jsonb;
  v_escenarios jsonb;
  v_avisos text[] := '{}';
  v_resumen jsonb;
  x jsonb;
begin
  perform public.exigir_admin(p_junta);
  if not public.es_junta_demo(p_junta) then
    raise exception 'Las herramientas de demostración solo están disponibles en la junta de demostración.';
  end if;
  perform public.tomar_candado_demo(p_junta);

  -- Cuotas del mes siguiente (generar_cuotas no duplica: UNIQUE unidad + periodo + concepto).
  v_cuotas := public.generar_cuotas(p_junta, v_siguiente);
  -- Riesgo con el modelo activo, calculado en PostgreSQL con la fecha de hoy.
  v_riesgo := public.calcular_riesgo_morosidad(p_junta);

  v_escenarios := public.escenarios_demo(p_junta);
  for x in select * from jsonb_array_elements(v_escenarios) loop
    if not (x ->> 'ok')::boolean then
      v_avisos := v_avisos || case x ->> 'espera'
        when 'pago_en_revision' then format('%s ya no tiene un pago en revisión (se revisó en un ensayo). Usa «Reiniciar demostración» para recuperarlo.', x ->> 'cuenta')
        when 'cuota_por_pagar' then format('%s no tiene cuotas por pagar. Usa «Reiniciar demostración» para recuperarla.', x ->> 'cuenta')
        else format('%s tiene cuotas vencidas: ya no se muestra al día. Usa «Reiniciar demostración».', x ->> 'cuenta') end;
    end if;
  end loop;

  v_resumen := jsonb_build_object(
    'periodo', v_siguiente, 'cuotas_creadas', v_cuotas -> 'creadas', 'cuotas_existentes', v_cuotas -> 'existentes',
    'modelo', v_riesgo -> 'modelo_version', 'fecha_corte', v_riesgo -> 'fecha_corte',
    'predicciones', v_riesgo -> 'cuotas', 'alto', v_riesgo -> 'alto', 'medio', v_riesgo -> 'medio', 'bajo', v_riesgo -> 'bajo',
    'escenarios', v_escenarios, 'avisos', to_jsonb(v_avisos));
  perform public.registrar_auditoria(p_junta, 'preparar_demo', 'junta', p_junta, v_resumen - 'escenarios');
  return v_resumen;
end $$;

-- 4) Reiniciar la demostración desde la web.
create or replace function public.reiniciar_demostracion(p_junta uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_archivos jsonb := '[]'::jsonb;
begin
  perform public.exigir_admin(p_junta);
  if not public.es_junta_demo(p_junta) then
    raise exception 'Las herramientas de demostración solo están disponibles en la junta de demostración.';
  end if;
  perform public.tomar_candado_demo(p_junta);
  v := public.restaurar_demo_datos(p_junta);

  -- Archivos del ensayo que ya no usa ningún pago ni la configuración. La base no borra archivos de
  -- Storage: los devuelve y el navegador los borra con la política storage_borrar_archivo_demo.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'nombre', o.name)), '[]'::jsonb) into v_archivos
    from storage.objects o
    where o.bucket_id in ('comprobantes', 'junta-archivos') and o.name like p_junta::text || '/%'
      and public.es_archivo_demo_sobrante(o.bucket_id, o.name);
  exception when others then
    v_archivos := '[]'::jsonb;
  end;

  perform public.registrar_auditoria(p_junta, 'reiniciar_demo', 'junta', p_junta,
    (v - 'foto_del') || jsonb_build_object('archivos_por_borrar', jsonb_array_length(v_archivos)));
  return jsonb_build_object('ok', true, 'archivos', v_archivos) || v;
end $$;

-- 5) Archivos del ensayo: la administración de la junta demo puede borrar los que nadie usa.
create or replace function public.es_archivo_demo_sobrante(p_bucket text, p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_junta_demo(public.uuid_seguro(split_part(p_nombre, '/', 1)))
     and not exists (select 1 from public.pagos pg where pg.comprobante_path = p_nombre)
     and not exists (select 1 from public.juntas j where j.yape_qr_path = p_nombre)
     and not exists (select 1 from public.demo_estados d, jsonb_array_elements(d.estado -> 'pagos') x
                     where x ->> 'comprobante_path' = p_nombre)
     and not exists (select 1 from public.demo_estados d where d.estado -> 'junta' ->> 'yape_qr_path' = p_nombre)
$$;

create or replace function public.puede_borrar_archivo_demo(p_bucket text, p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_bucket in ('comprobantes', 'junta-archivos')
     and public.es_admin_de(public.uuid_seguro(split_part(p_nombre, '/', 1)))
     and public.es_archivo_demo_sobrante(p_bucket, p_nombre)
$$;

create policy comprobantes_borrar_demo on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes' and public.puede_borrar_archivo_demo(bucket_id, name));

revoke execute on function public.restaurar_demo_datos(uuid), public.tomar_candado_demo(uuid), public.escenarios_demo(uuid),
  public.es_archivo_demo_sobrante(text, text)
  from public, anon, authenticated;
revoke execute on function public.preparar_demostracion(uuid), public.reiniciar_demostracion(uuid),
  public.diagnostico_demostracion(uuid), public.puede_borrar_archivo_demo(text, text) from public, anon;
grant execute on function public.preparar_demostracion(uuid), public.reiniciar_demostracion(uuid),
  public.diagnostico_demostracion(uuid), public.puede_borrar_archivo_demo(text, text) to authenticated;
