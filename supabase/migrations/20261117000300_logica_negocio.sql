-- Arcomunity · Lógica de negocio del lado del servidor
-- Todas las funciones RPC:
--   * se ejecutan como SECURITY DEFINER con search_path vacío;
--   * verifican auth.uid() y el rol en la junta antes de actuar;
--   * bloquean filas (FOR UPDATE) para evitar carreras;
--   * calculan los importes desde la base de datos, nunca desde el cliente;
--   * registran la acción en public.auditoria.
-- Los errores de negocio usan SQLSTATE P0001 con un mensaje en español apto para el usuario.

-- ---------------------------------------------------------------------------------------------
-- Auditoría interna
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_auditoria(
  p_junta uuid, p_accion text, p_entidad text, p_entidad_id uuid, p_detalle jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.auditoria (junta_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (
    p_junta, v_uid,
    coalesce((select p.nombre_completo from public.perfiles p where p.id = v_uid), 'Sistema'),
    p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb)
  );
end $$;

create or replace function public.exigir_admin(p_junta uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.';
  end if;
  if p_junta is null or not public.es_admin_de(p_junta) then
    raise exception 'No tienes permiso para realizar esta acción.';
  end if;
  return v_uid;
end $$;

create or replace function public.validar_monto(p_monto numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_monto is null or p_monto <= 0 or p_monto > 10000 or p_monto <> round(p_monto, 2) then
    raise exception 'Ingresa un monto válido (mayor que 0 y con hasta 2 decimales).';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Hora del servidor (saludos, fechas de referencia). Disponible sin sesión.
-- ---------------------------------------------------------------------------------------------
create or replace function public.servidor_ahora()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ahora', now(),
    'hoy_lima', public.hoy_lima(),
    'zona_horaria', 'America/Lima'
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Contexto del usuario autenticado: perfil, juntas, rol y unidades.
-- ---------------------------------------------------------------------------------------------
create or replace function public.mi_contexto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  return jsonb_build_object(
    'perfil', (
      select jsonb_build_object('id', p.id, 'nombre_completo', p.nombre_completo, 'correo', p.correo,
        'telefono', p.telefono, 'acepto_datos_en', p.acepto_datos_en)
      from public.perfiles p where p.id = v_uid
    ),
    'membresias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'junta_id', m.junta_id, 'junta_nombre', j.nombre, 'rol', m.rol,
        'unidades', coalesce((
          select jsonb_agg(jsonb_build_object('id', u.id, 'codigo', u.codigo) order by u.codigo)
          from public.unidad_propietarios up
          join public.unidades u on u.id = up.unidad_id
          where up.perfil_id = v_uid and up.junta_id = m.junta_id and up.hasta is null
        ), '[]'::jsonb)
      ) order by m.rol, j.nombre)
      from public.miembros_junta m
      join public.juntas j on j.id = m.junta_id
      where m.perfil_id = v_uid and m.activo
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Registro de propietarios
-- 1) El formulario consulta las unidades libres solo si el código de invitación es válido.
-- 2) supabase.auth.signUp envía los datos en metadata; el disparador valida todo de nuevo.
-- El rol siempre es 'propietario'. Cualquier campo "rol" en metadata se ignora.
-- ---------------------------------------------------------------------------------------------
create or replace function public.unidades_disponibles(p_codigo text)
returns table (unidad_id uuid, codigo text, junta_nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.codigo, j.nombre
  from public.juntas_invitacion i
  join public.juntas j on j.id = i.junta_id
  join public.unidades u on u.junta_id = i.junta_id and u.activa
  where i.codigo = upper(btrim(coalesce(p_codigo, '')))
    and not exists (
      select 1 from public.unidad_propietarios up where up.unidad_id = u.id and up.hasta is null
    )
  order by u.codigo
$$;

create or replace function public.manejar_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nombre text := left(btrim(coalesce(nullif(v_meta ->> 'nombre_completo', ''), split_part(new.email, '@', 1))), 120);
  v_codigo text := upper(btrim(coalesce(v_meta ->> 'codigo_invitacion', '')));
  v_tel text := nullif(btrim(coalesce(v_meta ->> 'telefono', '')), '');
  v_acepto boolean := coalesce(v_meta ->> 'acepto_datos', '') = 'true';
  v_junta uuid;
  v_unidad uuid;
begin
  if v_codigo = '' then
    -- Cuenta creada por el equipo técnico (seed o panel de Supabase): solo perfil, sin rol.
    insert into public.perfiles (id, nombre_completo, correo, acepto_datos, acepto_datos_en)
    values (new.id, v_nombre, coalesce(new.email, ''), v_acepto, case when v_acepto then now() end);
    return new;
  end if;

  if not v_acepto then
    raise exception 'Debes aceptar el tratamiento de datos para registrarte.';
  end if;
  if char_length(v_nombre) < 2 then
    raise exception 'Ingresa tu nombre completo.';
  end if;
  if v_tel is not null and v_tel !~ '^\d{9}$' then
    raise exception 'El teléfono debe tener 9 dígitos.';
  end if;

  select i.junta_id into v_junta from public.juntas_invitacion i where i.codigo = v_codigo;
  if v_junta is null then
    raise exception 'El código de invitación no es válido.';
  end if;

  if coalesce(v_meta ->> 'unidad_id', '') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'Selecciona una unidad disponible.';
  end if;
  v_unidad := (v_meta ->> 'unidad_id')::uuid;

  perform 1 from public.unidades u where u.id = v_unidad and u.junta_id = v_junta and u.activa for update;
  if not found then
    raise exception 'Selecciona una unidad disponible.';
  end if;
  if exists (select 1 from public.unidad_propietarios up where up.unidad_id = v_unidad and up.hasta is null) then
    raise exception 'Esta unidad ya tiene un propietario asignado.';
  end if;

  insert into public.perfiles (id, nombre_completo, correo, telefono, acepto_datos, acepto_datos_en)
  values (new.id, v_nombre, coalesce(new.email, ''), v_tel, true, now());
  insert into public.miembros_junta (junta_id, perfil_id, rol) values (v_junta, new.id, 'propietario');
  insert into public.unidad_propietarios (junta_id, unidad_id, perfil_id) values (v_junta, v_unidad, new.id);

  insert into public.auditoria (junta_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (v_junta, new.id, v_nombre, 'registro_propietario', 'unidad', v_unidad,
    jsonb_build_object('unidad', (select u.codigo from public.unidades u where u.id = v_unidad),
                       'consentimiento_ley_29733', true));
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.manejar_nuevo_usuario();

create or replace function public.sincronizar_correo_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfiles set correo = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger al_cambiar_correo after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sincronizar_correo_perfil();

-- ---------------------------------------------------------------------------------------------
-- Configuración de la junta
-- ---------------------------------------------------------------------------------------------
create or replace function public.actualizar_configuracion(
  p_junta uuid,
  p_nombre text,
  p_cuota_mensual numeric,
  p_dia_vencimiento integer,
  p_yape_titular text,
  p_conciliacion_automatica boolean,
  p_transparencia_detalle_unidades boolean,
  p_codigo_invitacion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.juntas;
  v_codigo text := upper(btrim(coalesce(p_codigo_invitacion, '')));
begin
  perform public.exigir_admin(p_junta);
  select * into v_antes from public.juntas where id = p_junta for update;

  if char_length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre de la junta debe tener al menos 3 caracteres.';
  end if;
  perform public.validar_monto(p_cuota_mensual);
  if p_dia_vencimiento is null or p_dia_vencimiento not between 1 and 28 then
    raise exception 'El vencimiento debe estar entre el día 1 y el 28.';
  end if;
  if v_codigo !~ '^[A-Z0-9-]{6,32}$' then
    raise exception 'El código de invitación debe tener entre 6 y 32 letras, números o guiones.';
  end if;
  if exists (select 1 from public.juntas_invitacion i where i.codigo = v_codigo and i.junta_id <> p_junta) then
    raise exception 'Ese código de invitación ya está en uso. Elige otro.';
  end if;

  update public.juntas set
    nombre = btrim(p_nombre),
    cuota_mensual = p_cuota_mensual,
    dia_vencimiento = p_dia_vencimiento,
    yape_titular = nullif(btrim(coalesce(p_yape_titular, '')), ''),
    conciliacion_automatica = coalesce(p_conciliacion_automatica, true),
    transparencia_detalle_unidades = coalesce(p_transparencia_detalle_unidades, true)
  where id = p_junta;

  insert into public.juntas_invitacion (junta_id, codigo) values (p_junta, v_codigo)
  on conflict (junta_id) do update set codigo = excluded.codigo, actualizado_en = now();

  perform public.registrar_auditoria(p_junta, 'actualizar_configuracion', 'junta', p_junta, jsonb_build_object(
    'cuota_mensual', jsonb_build_object('antes', v_antes.cuota_mensual, 'despues', p_cuota_mensual),
    'dia_vencimiento', jsonb_build_object('antes', v_antes.dia_vencimiento, 'despues', p_dia_vencimiento),
    'conciliacion_automatica', jsonb_build_object('antes', v_antes.conciliacion_automatica, 'despues', p_conciliacion_automatica),
    'transparencia_detalle_unidades', p_transparencia_detalle_unidades
  ));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Unidades y propietarios
-- ---------------------------------------------------------------------------------------------
create or replace function public.guardar_unidad(p_junta uuid, p_unidad_id uuid, p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_id uuid;
begin
  perform public.exigir_admin(p_junta);
  if char_length(v_codigo) not between 1 and 30 then
    raise exception 'El código de la unidad debe tener entre 1 y 30 caracteres.';
  end if;
  begin
    if p_unidad_id is null then
      insert into public.unidades (junta_id, codigo) values (p_junta, v_codigo) returning id into v_id;
    else
      update public.unidades set codigo = v_codigo
      where id = p_unidad_id and junta_id = p_junta returning id into v_id;
      if v_id is null then
        raise exception 'No encontramos esa unidad.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe una unidad con ese código.';
  end;
  perform public.registrar_auditoria(p_junta, case when p_unidad_id is null then 'crear_unidad' else 'editar_unidad' end,
    'unidad', v_id, jsonb_build_object('codigo', v_codigo));
  return v_id;
end $$;

create or replace function public.cambiar_estado_unidad(p_unidad_id uuid, p_activa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidad public.unidades;
begin
  select * into v_unidad from public.unidades where id = p_unidad_id for update;
  if not found then
    raise exception 'No encontramos esa unidad.';
  end if;
  perform public.exigir_admin(v_unidad.junta_id);
  update public.unidades set activa = coalesce(p_activa, false) where id = p_unidad_id;
  perform public.registrar_auditoria(v_unidad.junta_id, case when p_activa then 'activar_unidad' else 'desactivar_unidad' end,
    'unidad', p_unidad_id, jsonb_build_object('codigo', v_unidad.codigo));
end $$;

create or replace function public.desvincular_propietario(p_unidad_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.unidad_propietarios;
begin
  select * into v_vinculo from public.unidad_propietarios
  where unidad_id = p_unidad_id and hasta is null for update;
  if not found then
    raise exception 'Esta unidad no tiene un propietario asignado.';
  end if;
  perform public.exigir_admin(v_vinculo.junta_id);

  update public.unidad_propietarios set hasta = now() where id = v_vinculo.id;
  -- Sin otras unidades vigentes en la junta, la membresía queda inactiva (pierde acceso).
  if not exists (
    select 1 from public.unidad_propietarios up
    where up.perfil_id = v_vinculo.perfil_id and up.junta_id = v_vinculo.junta_id and up.hasta is null
  ) then
    update public.miembros_junta set activo = false
    where perfil_id = v_vinculo.perfil_id and junta_id = v_vinculo.junta_id and rol = 'propietario';
  end if;
  perform public.registrar_auditoria(v_vinculo.junta_id, 'desvincular_propietario', 'unidad', p_unidad_id,
    jsonb_build_object('unidad', (select codigo from public.unidades where id = p_unidad_id)));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cuotas (idempotente: la restricción UNIQUE (unidad_id, periodo, concepto) evita duplicados
-- incluso si dos administradores pulsan a la vez)
-- ---------------------------------------------------------------------------------------------
create or replace function public.generar_cuotas(p_junta uuid, p_periodo date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
  v_mes_actual date := date_trunc('month', v_hoy)::date;
  v_periodo date := coalesce(p_periodo, v_mes_actual);
  v_junta public.juntas;
  v_creadas integer;
  v_total integer;
begin
  perform public.exigir_admin(p_junta);
  if extract(day from v_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.';
  end if;
  if v_periodo > (v_mes_actual + interval '1 month')::date or v_periodo < (v_mes_actual - interval '12 months')::date then
    raise exception 'Solo puedes generar cuotas del mes siguiente, del actual o de los 12 meses anteriores.';
  end if;

  select * into v_junta from public.juntas where id = p_junta for share;

  insert into public.cuotas (junta_id, unidad_id, periodo, monto, fecha_vencimiento, es_simulado)
  select p_junta, u.id, v_periodo, v_junta.cuota_mensual, v_periodo + (v_junta.dia_vencimiento - 1), v_junta.es_simulado
  from public.unidades u
  where u.junta_id = p_junta and u.activa
  on conflict (unidad_id, periodo, concepto) do nothing;
  get diagnostics v_creadas = row_count;

  select count(*) into v_total from public.cuotas c where c.junta_id = p_junta and c.periodo = v_periodo;

  perform public.registrar_auditoria(p_junta, 'generar_cuotas', 'cuota', null, jsonb_build_object(
    'periodo', v_periodo, 'creadas', v_creadas, 'existentes', v_total - v_creadas, 'monto', v_junta.cuota_mensual));
  return jsonb_build_object('periodo', v_periodo, 'creadas', v_creadas, 'existentes', v_total - v_creadas);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Pago declarado por el propietario con comprobante (reglas R1–R4 del APF2 en el servidor)
-- ---------------------------------------------------------------------------------------------
create or replace function public.enviar_pago(
  p_cuota_id uuid,
  p_metodo text,
  p_monto numeric,
  p_fecha_operacion date,
  p_numero_operacion text,
  p_comprobante_path text,
  p_comprobante_sha256 text default null,
  p_ocr_confianza numeric default null,
  p_ocr_extraido jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_lima();
  v_cuota public.cuotas;
  v_junta public.juntas;
  v_op text := upper(btrim(coalesce(p_numero_operacion, '')));
  v_alertas text[] := '{}';
  v_estado text;
  v_pago_id uuid;
  v_ex jsonb := coalesce(p_ocr_extraido, '{}'::jsonb);
  v_ex_monto text := nullif(btrim(coalesce(v_ex ->> 'monto', '')), '');
  v_ex_fecha text := nullif(btrim(coalesce(v_ex ->> 'fecha', '')), '');
  v_ex_op text := nullif(upper(btrim(coalesce(v_ex ->> 'operacion', ''))), '');
  v_corregido boolean;
  v_restriccion text;
begin
  if v_uid is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.';
  end if;

  select * into v_cuota from public.cuotas where id = p_cuota_id for update;
  if not found or v_cuota.unidad_id not in (select public.mis_unidades()) then
    raise exception 'No encontramos esta cuota o no tienes acceso a ella.';
  end if;
  if v_cuota.estado = 'pagada' then
    raise exception 'Esta cuota ya está pagada.';
  end if;
  if v_cuota.estado = 'en_revision' then
    raise exception 'Esta cuota ya tiene un pago en revisión.';
  end if;

  if p_metodo not in ('yape_captura', 'plin_captura', 'transferencia') then
    raise exception 'Selecciona cómo realizaste el pago.';
  end if;
  perform public.validar_monto(p_monto);
  if p_fecha_operacion is null then
    raise exception 'Indica la fecha de la operación.';
  end if;
  if p_fecha_operacion > v_hoy then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_fecha_operacion < v_hoy - 400 then
    raise exception 'La fecha de la operación es demasiado antigua.';
  end if;
  if v_op !~ '^[A-Z0-9-]{4,30}$' then
    raise exception 'Ingresa el número de operación (4 a 30 letras o números).';
  end if;
  if coalesce(p_comprobante_sha256, '') <> '' and p_comprobante_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'No pudimos verificar el archivo del comprobante. Vuelve a adjuntarlo.';
  end if;
  if p_ocr_confianza is not null and p_ocr_confianza not between 0 and 100 then
    raise exception 'Dato de lectura OCR no válido.';
  end if;
  if octet_length(v_ex::text) > 2000 then
    raise exception 'Dato de lectura OCR no válido.';
  end if;

  -- El comprobante debe existir en el bucket privado, en la carpeta de la unidad y ser del usuario.
  if coalesce(p_comprobante_path, '') = '' then
    raise exception 'Adjunta la imagen del comprobante.';
  end if;
  if split_part(p_comprobante_path, '/', 1) <> v_cuota.junta_id::text
     or split_part(p_comprobante_path, '/', 2) <> v_cuota.unidad_id::text
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'comprobantes' and o.name = p_comprobante_path and o.owner_id = v_uid::text
     ) then
    raise exception 'No encontramos el comprobante adjunto. Vuelve a subir la imagen.';
  end if;
  if exists (select 1 from public.pagos p where p.comprobante_path = p_comprobante_path) then
    raise exception 'Este comprobante ya fue usado en otro pago.';
  end if;

  select * into v_junta from public.juntas where id = v_cuota.junta_id;

  -- R1: monto exacto de la cuota (el monto de referencia viene de la base de datos).
  if p_monto <> v_cuota.monto then
    v_alertas := array_append(v_alertas, 'monto_no_coincide');
  end if;
  -- R2: número de operación no usado en otro pago vigente de la junta.
  if exists (
    select 1 from public.pagos p
    where p.junta_id = v_cuota.junta_id and upper(p.numero_operacion) = v_op and p.estado <> 'rechazado'
  ) then
    v_alertas := array_append(v_alertas, 'operacion_duplicada');
  end if;
  -- R3: fecha desde 5 días antes del inicio del periodo hasta hoy.
  if p_fecha_operacion < v_cuota.periodo - 5 then
    v_alertas := array_append(v_alertas, 'fecha_fuera_de_periodo');
  end if;
  -- R4: calidad del dato. OCR con confianza < 60 cuyos valores el propietario no revisó/corrigió.
  if p_ocr_confianza is not null and p_ocr_confianza < 60
     and (v_ex_monto is not null or v_ex_fecha is not null or v_ex_op is not null) then
    v_corregido :=
      (v_ex_monto is not null and (v_ex_monto !~ '^\d+(\.\d+)?$' or round(v_ex_monto::numeric, 2) <> p_monto))
      or (v_ex_fecha is not null and v_ex_fecha <> p_fecha_operacion::text)
      or (v_ex_op is not null and v_ex_op <> v_op);
    if not v_corregido then
      v_alertas := array_append(v_alertas, 'datos_incompletos');
    end if;
  end if;
  -- Alerta adicional: misma imagen ya usada en otro pago vigente.
  if coalesce(p_comprobante_sha256, '') <> '' and exists (
    select 1 from public.pagos p
    where p.junta_id = v_cuota.junta_id and p.comprobante_sha256 = p_comprobante_sha256 and p.estado <> 'rechazado'
  ) then
    v_alertas := array_append(v_alertas, 'comprobante_repetido');
  end if;
  if not v_junta.conciliacion_automatica then
    v_alertas := array_append(v_alertas, 'revision_manual_configurada');
  end if;

  v_estado := case when cardinality(v_alertas) = 0 then 'conciliado_auto' else 'pendiente_revision' end;

  begin
    insert into public.pagos (
      junta_id, cuota_id, unidad_id, registrado_por, metodo, monto_declarado, fecha_operacion,
      numero_operacion, comprobante_path, comprobante_sha256, ocr_confianza, ocr_extraido,
      estado, alertas, conciliado_en, es_simulado
    ) values (
      v_cuota.junta_id, v_cuota.id, v_cuota.unidad_id, v_uid, p_metodo, p_monto, p_fecha_operacion,
      v_op, p_comprobante_path, nullif(p_comprobante_sha256, ''), p_ocr_confianza, p_ocr_extraido,
      v_estado, v_alertas, case when v_estado = 'conciliado_auto' then now() end, v_cuota.es_simulado
    ) returning id into v_pago_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'pagos_operacion_conciliada' then
      raise exception 'Este número de operación ya fue registrado en otro pago.';
    end if;
    raise exception 'Esta cuota ya tiene un pago registrado.';
  end;

  update public.cuotas set
    estado = case when v_estado = 'conciliado_auto' then 'pagada' else 'en_revision' end,
    fecha_pago = case when v_estado = 'conciliado_auto' then p_fecha_operacion end,
    pago_id = case when v_estado = 'conciliado_auto' then v_pago_id end
  where id = v_cuota.id;

  perform public.registrar_auditoria(v_cuota.junta_id,
    case when v_estado = 'conciliado_auto' then 'pago_conciliado_auto' else 'pago_en_revision' end,
    'pago', v_pago_id, jsonb_build_object('cuota_id', v_cuota.id, 'periodo', v_cuota.periodo,
      'monto', p_monto, 'alertas', to_jsonb(v_alertas)));

  return jsonb_build_object('pago_id', v_pago_id, 'estado', v_estado, 'alertas', to_jsonb(v_alertas));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Revisión del administrador: aprobar, rechazar u observar (también revierte una conciliación
-- automática cuando el administrador comprueba que el dinero no llegó).
-- ---------------------------------------------------------------------------------------------
create or replace function public.revisar_pago(p_pago_id uuid, p_decision text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_pago public.pagos;
  v_cuota public.cuotas;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_accion text;
begin
  select * into v_pago from public.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'No encontramos este pago.';
  end if;
  v_uid := public.exigir_admin(v_pago.junta_id);
  select * into v_cuota from public.cuotas where id = v_pago.cuota_id for update;

  if p_decision = 'aprobar' then
    if v_pago.estado <> 'pendiente_revision' then
      raise exception 'Este pago ya fue revisado.';
    end if;
    begin
      update public.pagos set estado = 'conciliado_manual', conciliado_en = now(), revisado_por = v_uid,
        revisado_en = now(), nota_admin = nullif(v_motivo, '')
      where id = v_pago.id;
    exception when unique_violation then
      raise exception 'Ese número de operación ya está conciliado en otro pago. Rechaza este pago o revisa el duplicado.';
    end;
    update public.cuotas set estado = 'pagada', fecha_pago = v_pago.fecha_operacion, pago_id = v_pago.id
    where id = v_cuota.id;
    v_accion := 'aprobar_pago';
  elsif p_decision = 'rechazar' then
    if char_length(v_motivo) < 5 then
      raise exception 'Escribe el motivo del rechazo (mínimo 5 caracteres).';
    end if;
    if v_pago.estado = 'rechazado' then
      raise exception 'Este pago ya fue rechazado.';
    end if;
    update public.pagos set estado = 'rechazado', motivo_rechazo = left(v_motivo, 500), revisado_por = v_uid,
      revisado_en = now()
    where id = v_pago.id;
    if v_cuota.pago_id = v_pago.id or v_cuota.estado = 'en_revision' then
      update public.cuotas set estado = 'pendiente', fecha_pago = null, pago_id = null where id = v_cuota.id;
    end if;
    v_accion := case when v_pago.estado = 'pendiente_revision' then 'rechazar_pago' else 'revertir_pago' end;
  else
    raise exception 'Decisión no válida.';
  end if;

  perform public.registrar_auditoria(v_pago.junta_id, v_accion, 'pago', v_pago.id, jsonb_build_object(
    'cuota_id', v_cuota.id, 'estado_anterior', v_pago.estado, 'motivo', nullif(v_motivo, ''),
    'monto_declarado', v_pago.monto_declarado, 'monto_cuota', v_cuota.monto));
  return jsonb_build_object('pago_id', v_pago.id, 'accion', v_accion);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Pago manual (efectivo, transferencia o Yape verificado por el administrador)
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_pago_manual(
  p_cuota_id uuid,
  p_metodo text,
  p_monto numeric,
  p_fecha_operacion date,
  p_numero_operacion text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_cuota public.cuotas;
  v_op text := nullif(upper(btrim(coalesce(p_numero_operacion, ''))), '');
  v_alertas text[] := '{}';
  v_pago_id uuid;
begin
  select * into v_cuota from public.cuotas where id = p_cuota_id for update;
  if not found then
    raise exception 'No encontramos esta cuota.';
  end if;
  v_uid := public.exigir_admin(v_cuota.junta_id);

  if v_cuota.estado = 'pagada' then
    raise exception 'Esta cuota ya está pagada.';
  end if;
  if v_cuota.estado = 'en_revision' then
    raise exception 'Esta cuota tiene un pago en revisión. Resuélvelo en Conciliación.';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'yape_qr') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  perform public.validar_monto(p_monto);
  if p_fecha_operacion is null or p_fecha_operacion > public.hoy_lima() then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_metodo <> 'efectivo' and (v_op is null or v_op !~ '^[A-Z0-9-]{4,30}$') then
    raise exception 'Ingresa el número de operación (4 a 30 letras o números).';
  end if;
  if v_op is not null and v_op !~ '^[A-Z0-9-]{4,30}$' then
    raise exception 'El número de operación debe tener de 4 a 30 letras o números.';
  end if;
  if p_monto <> v_cuota.monto then
    v_alertas := array_append(v_alertas, 'monto_no_coincide');
  end if;

  begin
    insert into public.pagos (
      junta_id, cuota_id, unidad_id, registrado_por, metodo, monto_declarado, fecha_operacion,
      numero_operacion, estado, alertas, conciliado_en, revisado_por, revisado_en, nota_admin, es_simulado
    ) values (
      v_cuota.junta_id, v_cuota.id, v_cuota.unidad_id, v_uid, p_metodo, p_monto, p_fecha_operacion,
      v_op, 'conciliado_manual', v_alertas, now(), v_uid, now(), nullif(left(btrim(coalesce(p_nota, '')), 500), ''),
      v_cuota.es_simulado
    ) returning id into v_pago_id;
  exception when unique_violation then
    raise exception 'Ese número de operación ya fue registrado en otro pago.';
  end;

  update public.cuotas set estado = 'pagada', fecha_pago = p_fecha_operacion, pago_id = v_pago_id
  where id = v_cuota.id;

  perform public.registrar_auditoria(v_cuota.junta_id, 'pago_manual', 'pago', v_pago_id, jsonb_build_object(
    'cuota_id', v_cuota.id, 'periodo', v_cuota.periodo, 'metodo', p_metodo, 'monto', p_monto,
    'alertas', to_jsonb(v_alertas)));
  return jsonb_build_object('pago_id', v_pago_id, 'estado', 'conciliado_manual', 'alertas', to_jsonb(v_alertas));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Egresos
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_egreso(
  p_junta uuid, p_fecha date, p_concepto text, p_beneficiario text, p_monto numeric, p_comentario text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.exigir_admin(p_junta);
  v_id uuid;
begin
  if p_fecha is null or p_fecha > public.hoy_lima() then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_fecha < public.hoy_lima() - 400 then
    raise exception 'La fecha del egreso es demasiado antigua.';
  end if;
  if p_concepto not in ('pago_vigilante', 'insumos', 'otros') then
    raise exception 'Selecciona un concepto válido.';
  end if;
  if char_length(btrim(coalesce(p_beneficiario, ''))) < 2 then
    raise exception 'Indica el beneficiario del egreso.';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000 or p_monto <> round(p_monto, 2) then
    raise exception 'Ingresa un monto válido (mayor que 0 y con hasta 2 decimales).';
  end if;

  insert into public.egresos (junta_id, fecha, concepto, beneficiario, monto, comentario, registrado_por, es_simulado)
  values (p_junta, p_fecha, p_concepto, left(btrim(p_beneficiario), 120), p_monto,
    nullif(left(btrim(coalesce(p_comentario, '')), 500), ''), v_uid,
    (select j.es_simulado from public.juntas j where j.id = p_junta))
  returning id into v_id;

  perform public.registrar_auditoria(p_junta, 'registrar_egreso', 'egreso', v_id, jsonb_build_object(
    'concepto', p_concepto, 'monto', p_monto, 'fecha', p_fecha));
  return v_id;
end $$;

create or replace function public.anular_egreso(p_egreso_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egreso public.egresos;
begin
  select * into v_egreso from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No encontramos ese egreso.';
  end if;
  perform public.exigir_admin(v_egreso.junta_id);
  if v_egreso.anulado then
    raise exception 'Este egreso ya fue anulado.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).';
  end if;
  update public.egresos set anulado = true, motivo_anulacion = left(btrim(p_motivo), 500), anulado_en = now()
  where id = p_egreso_id;
  perform public.registrar_auditoria(v_egreso.junta_id, 'anular_egreso', 'egreso', p_egreso_id, jsonb_build_object(
    'monto', v_egreso.monto, 'motivo', btrim(p_motivo)));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cámaras
-- ---------------------------------------------------------------------------------------------
create or replace function public.guardar_camara(
  p_junta uuid, p_camara_id uuid, p_nombre text, p_ubicacion text, p_tipo text, p_url text, p_activa boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform public.exigir_admin(p_junta);
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre de la cámara es obligatorio.';
  end if;
  if char_length(btrim(coalesce(p_ubicacion, ''))) < 2 then
    raise exception 'La ubicación es obligatoria.';
  end if;
  if p_tipo not in ('simulada', 'mjpeg', 'embed') then
    raise exception 'Tipo de cámara no válido.';
  end if;
  if p_tipo = 'simulada' then
    v_url := null;
  elsif v_url is null or v_url !~ '^https://[^\s]+$' then
    raise exception 'Ingresa una URL válida que comience con https://.';
  end if;

  if p_camara_id is null then
    insert into public.camaras (junta_id, nombre, ubicacion, tipo, url, activa)
    values (p_junta, btrim(p_nombre), btrim(p_ubicacion), p_tipo, v_url, coalesce(p_activa, true))
    returning id into v_id;
  else
    update public.camaras set nombre = btrim(p_nombre), ubicacion = btrim(p_ubicacion), tipo = p_tipo,
      url = v_url, activa = coalesce(p_activa, true)
    where id = p_camara_id and junta_id = p_junta returning id into v_id;
    if v_id is null then
      raise exception 'No encontramos esa cámara.';
    end if;
  end if;
  perform public.registrar_auditoria(p_junta, 'guardar_camara', 'camara', v_id, jsonb_build_object(
    'nombre', btrim(p_nombre), 'tipo', p_tipo, 'activa', coalesce(p_activa, true)));
  return v_id;
end $$;

create or replace function public.eliminar_camara(p_camara_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camara public.camaras;
begin
  select * into v_camara from public.camaras where id = p_camara_id for update;
  if not found then
    raise exception 'No encontramos esa cámara.';
  end if;
  perform public.exigir_admin(v_camara.junta_id);
  delete from public.camaras where id = p_camara_id;
  perform public.registrar_auditoria(v_camara.junta_id, 'eliminar_camara', 'camara', p_camara_id,
    jsonb_build_object('nombre', v_camara.nombre));
end $$;

create or replace function public.registrar_vista_camaras(p_junta uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.es_miembro_de(p_junta) then
    raise exception 'No tienes acceso a esta junta.';
  end if;
  perform public.registrar_auditoria(p_junta, 'ver_camara', 'camara', null,
    jsonb_build_object('detalle', left(coalesce(p_detalle, ''), 160)));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Métricas y reportes (calculados en el servidor a partir de los registros)
-- ---------------------------------------------------------------------------------------------
create or replace function public.metricas_periodo(p_junta uuid, p_periodo date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_res jsonb;
begin
  perform public.exigir_admin(p_junta);
  with c as (
    select * from public.cuotas where junta_id = p_junta and periodo = v_periodo
  ), p as (
    select pg.* from public.pagos pg join c on c.id = pg.cuota_id
    where pg.estado in ('conciliado_auto', 'conciliado_manual')
  ), e as (
    select coalesce(sum(monto), 0) as total from public.egresos
    where junta_id = p_junta and not anulado and date_trunc('month', fecha)::date = v_periodo
  )
  select jsonb_build_object(
    'periodo', v_periodo,
    'cuotas_total', (select count(*) from c),
    'cuotas_pagadas', (select count(*) from c where estado = 'pagada'),
    'cuotas_en_revision', (select count(*) from c where estado = 'en_revision'),
    'cuotas_pendientes', (select count(*) from c where estado = 'pendiente'),
    'cuotas_morosas', (select count(*) from c where estado = 'pendiente' and fecha_vencimiento < v_hoy),
    'monto_por_cobrar', (select coalesce(sum(monto), 0) from c where estado <> 'pagada'),
    'recaudado', (select coalesce(sum(monto_declarado), 0) from p),
    'egresos', (select total from e),
    'saldo', (select coalesce(sum(monto_declarado), 0) from p) - (select total from e),
    'pagos_conciliados', (select count(*) from p),
    'pagos_auto', (select count(*) from p where estado = 'conciliado_auto'),
    'minutos_promedio', (select coalesce(round(avg(minutos_conciliacion), 2), 0) from p),
    'pagos_en_revision', (select count(*) from public.pagos where junta_id = p_junta and estado = 'pendiente_revision')
  ) into v_res;
  return v_res;
end $$;

create or replace function public.serie_mensual(p_junta uuid, p_meses integer default 12)
returns table (periodo date, recaudado numeric, egresos numeric, cuotas_total bigint, cuotas_pagadas bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fin date := date_trunc('month', public.hoy_lima())::date;
begin
  perform public.exigir_admin(p_junta);
  return query
  with meses as (
    select (v_fin - make_interval(months => g))::date as periodo
    from generate_series(0, least(greatest(coalesce(p_meses, 12), 1), 36) - 1) g
  )
  select m.periodo,
    coalesce((select sum(pg.monto_declarado) from public.pagos pg join public.cuotas c on c.id = pg.cuota_id
              where c.junta_id = p_junta and c.periodo = m.periodo
                and pg.estado in ('conciliado_auto', 'conciliado_manual')), 0),
    coalesce((select sum(e.monto) from public.egresos e where e.junta_id = p_junta and not e.anulado
              and date_trunc('month', e.fecha)::date = m.periodo), 0),
    (select count(*) from public.cuotas c where c.junta_id = p_junta and c.periodo = m.periodo),
    (select count(*) from public.cuotas c where c.junta_id = p_junta and c.periodo = m.periodo and c.estado = 'pagada')
  from meses m
  order by m.periodo;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Portal de transparencia: totales para todos los miembros; detalle por unidad (solo código y
-- estado, sin nombres, montos individuales ni comprobantes) si la junta lo habilita.
-- ---------------------------------------------------------------------------------------------
create or replace function public.transparencia(p_junta uuid, p_periodo date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_lima();
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_junta public.juntas;
  v_res jsonb;
begin
  if auth.uid() is null or not public.es_miembro_de(p_junta) then
    raise exception 'No tienes acceso a esta junta.';
  end if;
  select * into v_junta from public.juntas where id = p_junta;

  with c as (
    select * from public.cuotas where junta_id = p_junta and periodo = v_periodo
  ), rec as (
    select coalesce(sum(pg.monto_declarado), 0) as total
    from public.pagos pg join c on c.id = pg.cuota_id
    where pg.estado in ('conciliado_auto', 'conciliado_manual')
  ), eg as (
    select concepto, sum(monto) as total from public.egresos
    where junta_id = p_junta and not anulado and date_trunc('month', fecha)::date = v_periodo
    group by concepto
  )
  select jsonb_build_object(
    'junta_nombre', v_junta.nombre,
    'periodo', v_periodo,
    'recaudado', (select total from rec),
    'egresos', (select coalesce(sum(total), 0) from eg),
    'saldo', (select total from rec) - (select coalesce(sum(total), 0) from eg),
    'egresos_por_concepto', coalesce((select jsonb_object_agg(concepto, total) from eg), '{}'::jsonb),
    'cuotas_total', (select count(*) from c),
    'cuotas_pagadas', (select count(*) from c where estado = 'pagada'),
    'detalle_habilitado', v_junta.transparencia_detalle_unidades,
    'unidades', case when v_junta.transparencia_detalle_unidades or public.es_admin_de(p_junta) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', u.codigo,
        'estado', case when c.estado = 'pendiente' and c.fecha_vencimiento < v_hoy then 'morosa' else c.estado end,
        'fecha_pago', c.fecha_pago,
        'es_mia', c.unidad_id in (select public.mis_unidades())
      ) order by u.codigo)
      from c join public.unidades u on u.id = c.unidad_id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.servidor_ahora() to anon, authenticated;
grant execute on function public.unidades_disponibles(text) to anon, authenticated;

grant execute on function
  public.mi_contexto(),
  public.actualizar_configuracion(uuid, text, numeric, integer, text, boolean, boolean, text),
  public.guardar_unidad(uuid, uuid, text),
  public.cambiar_estado_unidad(uuid, boolean),
  public.desvincular_propietario(uuid),
  public.generar_cuotas(uuid, date),
  public.enviar_pago(uuid, text, numeric, date, text, text, text, numeric, jsonb),
  public.revisar_pago(uuid, text, text),
  public.registrar_pago_manual(uuid, text, numeric, date, text, text),
  public.registrar_egreso(uuid, date, text, text, numeric, text),
  public.anular_egreso(uuid, text),
  public.guardar_camara(uuid, uuid, text, text, text, text, boolean),
  public.eliminar_camara(uuid),
  public.registrar_vista_camaras(uuid, text),
  public.metricas_periodo(uuid, date),
  public.serie_mensual(uuid, integer),
  public.transparencia(uuid, date)
to authenticated;

-- Funciones internas: sin acceso desde la API.
revoke execute on function public.registrar_auditoria(uuid, text, text, uuid, jsonb) from authenticated;
revoke execute on function public.exigir_admin(uuid) from authenticated;
revoke execute on function public.manejar_nuevo_usuario() from authenticated;
revoke execute on function public.sincronizar_correo_perfil() from authenticated;
