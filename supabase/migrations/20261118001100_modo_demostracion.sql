-- Arcomunity · Modo demostración para cuentas públicas de prueba
-- Las cuentas @arcomunity.demo tienen contraseña publicada en el README para la exposición y la
-- revisión del docente. Esta migración impide que un visitante con esas credenciales deje la
-- demostración inutilizable o la use para mostrar contenido ajeno, y permite restaurarla:
--   * Cuentas demo (auth.users.raw_app_meta_data.demo = true): no cambian contraseña, correo,
--     teléfono ni nombre.
--   * Junta en modo demo (juntas.modo_demo): no cambia nombre, titular de Yape, QR ni código de
--     invitación; no desvincula a las cuentas demo ni desactiva sus unidades; solo cámaras simuladas
--     (sin URLs externas).
--   * guardar_estado_demo() guarda una foto de la junta; restaurar_estado_demo() la devuelve
--     (cuotas, pagos, egresos, cámaras, configuración, unidades, vínculos y cuentas demo). Se
--     ejecuta cada noche con pg_cron y bajo demanda con `npm run demo:restaurar`.
-- La auditoría no se borra al restaurar (es inmutable): se agrega un registro «restaurar_demo».

alter table public.juntas add column modo_demo boolean not null default false;

create or replace function public.es_cuenta_demo(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.raw_app_meta_data ->> 'demo' = 'true' from auth.users u where u.id = p_usuario), false)
$$;

create or replace function public.restaurando_demo()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('arcomunity.restaurando_demo', true), '') = 'on' $$;

create or replace function public.es_junta_demo(p_junta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select j.modo_demo from public.juntas j where j.id = p_junta), false) $$;

-- 1) Cuentas demo: sin cambios de credenciales ni de identidad.
create or replace function public.proteger_cuenta_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.raw_app_meta_data ->> 'demo', '') = 'true' and not public.restaurando_demo()
     and (new.encrypted_password is distinct from old.encrypted_password
          or new.email is distinct from old.email
          or coalesce(new.email_change, '') <> coalesce(old.email_change, '')
          or new.phone is distinct from old.phone) then
    raise exception 'Las cuentas de demostración no pueden cambiar su contraseña, correo ni teléfono.';
  end if;
  return new;
end $$;
create trigger proteger_cuenta_demo before update on auth.users
  for each row execute function public.proteger_cuenta_demo();

create or replace function public.proteger_perfil_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.restaurando_demo() and public.es_cuenta_demo(old.id)
     and (new.nombre_completo is distinct from old.nombre_completo or new.telefono is distinct from old.telefono) then
    raise exception 'Las cuentas de demostración no pueden cambiar su nombre ni su teléfono.';
  end if;
  return new;
end $$;
create trigger perfiles_proteger_demo before update on public.perfiles
  for each row execute function public.proteger_perfil_demo();

-- 2) Junta demo: lo que ven todos (identidad, destino del pago, acceso) no se cambia.
create or replace function public.proteger_junta_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.modo_demo and not public.restaurando_demo()
     and (new.nombre is distinct from old.nombre or new.yape_titular is distinct from old.yape_titular
          or new.yape_qr_path is distinct from old.yape_qr_path or new.modo_demo is distinct from old.modo_demo) then
    raise exception 'En la demostración no se pueden cambiar el nombre de la junta, el titular ni el QR de Yape.';
  end if;
  return new;
end $$;
create trigger juntas_proteger_demo before update on public.juntas
  for each row execute function public.proteger_junta_demo();

create or replace function public.proteger_codigo_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.codigo is distinct from old.codigo and not public.restaurando_demo() and public.es_junta_demo(old.junta_id) then
    raise exception 'En la demostración el código de invitación no se puede cambiar.';
  end if;
  return new;
end $$;
-- Se ejecuta después de juntas_invitacion_fortaleza (orden alfabético), que normaliza el código.
create trigger juntas_invitacion_proteger_demo before update of codigo on public.juntas_invitacion
  for each row execute function public.proteger_codigo_demo();

create or replace function public.proteger_vinculo_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.hasta is null and new.hasta is not null and not public.restaurando_demo()
     and public.es_junta_demo(old.junta_id) and public.es_cuenta_demo(old.perfil_id) then
    raise exception 'En la demostración no se puede desvincular a las cuentas de prueba.';
  end if;
  return new;
end $$;
create trigger unidad_propietarios_proteger_demo before update on public.unidad_propietarios
  for each row execute function public.proteger_vinculo_demo();

create or replace function public.proteger_unidad_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activa and not new.activa and not public.restaurando_demo() and public.es_junta_demo(old.junta_id)
     and exists (select 1 from public.unidad_propietarios up
                 where up.unidad_id = old.id and up.hasta is null and public.es_cuenta_demo(up.perfil_id)) then
    raise exception 'En la demostración no se puede desactivar la unidad de una cuenta de prueba.';
  end if;
  return new;
end $$;
create trigger unidades_proteger_demo before update on public.unidades
  for each row execute function public.proteger_unidad_demo();

create or replace function public.proteger_camara_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo <> 'simulada' and not public.restaurando_demo() and public.es_junta_demo(new.junta_id) then
    raise exception 'En la demostración solo se pueden usar cámaras simuladas (sin enlaces externos).';
  end if;
  return new;
end $$;
create trigger camaras_proteger_demo before insert or update on public.camaras
  for each row execute function public.proteger_camara_demo();

-- 3) Foto y restauración.
create table public.demo_estados (
  junta_id uuid primary key references public.juntas(id) on delete cascade,
  estado jsonb not null,
  guardado_en timestamptz not null default now()
);
alter table public.demo_estados enable row level security;
revoke all on public.demo_estados from anon, authenticated;

-- Solo el servicio (clave de servicio), pg_cron o una migración. Nunca un usuario de la app.
create or replace function public.exigir_servicio_o_sistema()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_rol = 'service_role' or (v_rol = '' and session_user in ('postgres', 'supabase_admin')) then
    return;
  end if;
  raise exception 'Solo el equipo técnico puede ejecutar esta operación.' using errcode = '42501';
end $$;

create or replace function public.guardar_estado_demo(p_junta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado jsonb;
begin
  perform public.exigir_servicio_o_sistema();
  if not public.es_junta_demo(p_junta) then
    raise exception 'Solo se guarda el estado de una junta en modo demostración.';
  end if;
  v_estado := jsonb_build_object(
    'junta', (select to_jsonb(j) from public.juntas j where j.id = p_junta),
    'codigo', (select i.codigo from public.juntas_invitacion i where i.junta_id = p_junta),
    'unidades', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from public.unidades u where u.junta_id = p_junta),
    'miembros', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.miembros_junta m where m.junta_id = p_junta),
    'vinculos', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.unidad_propietarios v where v.junta_id = p_junta and v.hasta is null),
    'cuotas', (select coalesce(jsonb_agg(to_jsonb(c) - 'dias_atraso'), '[]') from public.cuotas c where c.junta_id = p_junta),
    'pagos', (select coalesce(jsonb_agg(to_jsonb(pg) - 'minutos_conciliacion'), '[]') from public.pagos pg where pg.junta_id = p_junta),
    'egresos', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.egresos e where e.junta_id = p_junta),
    'camaras', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.camaras k where k.junta_id = p_junta),
    'perfiles', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre_completo', p.nombre_completo, 'telefono', p.telefono)), '[]')
                 from public.perfiles p
                 where public.es_cuenta_demo(p.id) and exists (select 1 from public.miembros_junta m where m.perfil_id = p.id and m.junta_id = p_junta)),
    'cuentas', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password, 'phone', u.phone)), '[]')
                from auth.users u
                where u.raw_app_meta_data ->> 'demo' = 'true' and exists (select 1 from public.miembros_junta m where m.perfil_id = u.id and m.junta_id = p_junta))
  );
  insert into public.demo_estados (junta_id, estado) values (p_junta, v_estado)
  on conflict (junta_id) do update set estado = excluded.estado, guardado_en = now();
  return jsonb_build_object(
    'cuotas', jsonb_array_length(v_estado -> 'cuotas'), 'pagos', jsonb_array_length(v_estado -> 'pagos'),
    'egresos', jsonb_array_length(v_estado -> 'egresos'), 'camaras', jsonb_array_length(v_estado -> 'camaras'),
    'unidades', jsonb_array_length(v_estado -> 'unidades'), 'cuentas_demo', jsonb_array_length(v_estado -> 'cuentas'));
end $$;

create or replace function public.restaurar_estado_demo(p_junta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_pagos_quitados integer;
  v_desvinculados integer;
begin
  perform public.exigir_servicio_o_sistema();
  select d.estado into e from public.demo_estados d where d.junta_id = p_junta;
  if e is null then
    raise exception 'No hay un estado guardado para esta junta.';
  end if;
  perform set_config('arcomunity.restaurando_demo', 'on', true);

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

  insert into public.auditoria (junta_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (p_junta, 'Sistema', 'restaurar_demo', 'junta', p_junta, jsonb_build_object(
    'pagos_quitados', v_pagos_quitados, 'registros_desvinculados', v_desvinculados));
  return jsonb_build_object('ok', true, 'pagos_quitados', v_pagos_quitados, 'registros_desvinculados', v_desvinculados,
    'foto_del', (select d.guardado_en from public.demo_estados d where d.junta_id = p_junta));
end $$;

-- Diagnóstico para el equipo técnico: fecha de la foto y tarea nocturna (si pg_cron existe).
create or replace function public.estado_demo(p_junta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb;
begin
  perform public.exigir_servicio_o_sistema();
  if to_regclass('cron.job') is not null then
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('nombre', jobname, 'horario', schedule, 'activa', active)), '[]')
               from cron.job where jobname = 'arcomunity-restaurar-demo'$q$ into v_cron;
  end if;
  return jsonb_build_object(
    'modo_demo', public.es_junta_demo(p_junta),
    'foto_del', (select d.guardado_en from public.demo_estados d where d.junta_id = p_junta),
    'cuentas_demo', (select count(*) from auth.users u where u.raw_app_meta_data ->> 'demo' = 'true'),
    'restauracion_nocturna', v_cron);
end $$;

revoke execute on function public.es_cuenta_demo(uuid), public.restaurando_demo(), public.es_junta_demo(uuid), public.estado_demo(uuid),
  public.exigir_servicio_o_sistema(), public.guardar_estado_demo(uuid), public.restaurar_estado_demo(uuid)
  from public, anon, authenticated;
grant execute on function public.guardar_estado_demo(uuid), public.restaurar_estado_demo(uuid), public.estado_demo(uuid) to service_role;
grant select on public.demo_estados to service_role;

-- 4) Activar el modo demostración en la junta piloto y sus cuentas, y guardar su estado actual.
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"demo": true}'::jsonb
where email like '%@arcomunity.demo';
update public.juntas set modo_demo = true where id = '7a1c0de0-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.juntas where id = '7a1c0de0-0000-4000-8000-000000000001') then
    perform public.guardar_estado_demo('7a1c0de0-0000-4000-8000-000000000001');
  end if;
end $$;

-- 5) Restauración automática cada noche (03:00 en Lima) si pg_cron está disponible.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('arcomunity-restaurar-demo', '0 8 * * *',
        $c$select public.restaurar_estado_demo('7a1c0de0-0000-4000-8000-000000000001')$c$);
    exception when others then
      raise notice 'No se pudo programar la restauración nocturna: %', sqlerrm;
    end;
  end if;
end $$;
