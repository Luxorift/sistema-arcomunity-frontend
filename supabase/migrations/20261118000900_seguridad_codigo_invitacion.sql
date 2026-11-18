-- Arcomunity · Seguridad del código de invitación
-- 1) Límite de intentos fallidos al consultar unidades con un código (evita adivinarlo por fuerza
--    bruta): 10 fallos por IP o 200 fallos en total cada 15 minutos.
-- 2) Fortaleza mínima: 8 a 32 caracteres con letras y números.
-- 3) Generador de códigos aleatorios para la administración.
-- La IP se guarda como hash SHA-256 (minimización de datos, Ley N.º 29733) y se purga a las 24 h.

create table public.intentos_invitacion (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  creado_en timestamptz not null default now()
);
create index intentos_invitacion_ip_idx on public.intentos_invitacion (ip_hash, creado_en desc);
create index intentos_invitacion_fecha_idx on public.intentos_invitacion (creado_en desc);
alter table public.intentos_invitacion enable row level security;
revoke all on public.intentos_invitacion from anon, authenticated;
-- Sin políticas: solo las funciones del servidor la usan.

create or replace function public.ip_solicitud_hash()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    'desconocida'
  );
  return encode(sha256(convert_to(v_ip, 'UTF8')), 'hex');
end $$;

-- Se redefine como VOLATILE para poder registrar los intentos fallidos.
create or replace function public.unidades_disponibles(p_codigo text)
returns table (unidad_id uuid, codigo text, junta_nombre text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip text := public.ip_solicitud_hash();
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if (select count(*) from public.intentos_invitacion i
      where i.ip_hash = v_ip and i.creado_en > now() - interval '15 minutes') >= 10
     or (select count(*) from public.intentos_invitacion i
      where i.creado_en > now() - interval '15 minutes') >= 200 then
    raise exception 'Demasiados intentos con códigos incorrectos. Espera 15 minutos e inténtalo de nuevo.';
  end if;

  if not exists (select 1 from public.juntas_invitacion i where i.codigo = v_codigo) then
    insert into public.intentos_invitacion (ip_hash) values (v_ip);
    delete from public.intentos_invitacion where creado_en < now() - interval '24 hours';
    return;
  end if;

  return query
  select u.id, u.codigo, j.nombre
  from public.juntas_invitacion i
  join public.juntas j on j.id = i.junta_id
  join public.unidades u on u.junta_id = i.junta_id and u.activa
  where i.codigo = v_codigo
    and not exists (
      select 1 from public.unidad_propietarios up where up.unidad_id = u.id and up.hasta is null
    )
  order by u.codigo;
end $$;

-- Fortaleza mínima del código (aplica a cualquier escritura, incluida actualizar_configuracion).
create or replace function public.validar_codigo_invitacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codigo := upper(btrim(new.codigo));
  if char_length(new.codigo) < 8 or new.codigo !~ '[A-Z]' or new.codigo !~ '[0-9]' then
    raise exception 'El código de invitación debe tener al menos 8 caracteres e incluir letras y números.';
  end if;
  return new;
end $$;

create trigger juntas_invitacion_fortaleza before insert or update of codigo on public.juntas_invitacion
  for each row execute function public.validar_codigo_invitacion();

-- Código aleatorio legible (sin 0/O ni 1/I/L), formato ARCO-XXXX-XXXX.
create or replace function public.generar_codigo_invitacion(p_junta uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_cuerpo text;
  v_codigo text;
  i integer;
begin
  perform public.exigir_admin(p_junta);
  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_cuerpo := '';
    for i in 0..7 loop
      v_cuerpo := v_cuerpo || substr(v_alfabeto, 1 + (get_byte(v_bytes, i) % char_length(v_alfabeto)), 1);
    end loop;
    v_codigo := 'ARCO-' || substr(v_cuerpo, 1, 4) || '-' || substr(v_cuerpo, 5, 4);
    exit when v_cuerpo ~ '[A-Z]' and v_cuerpo ~ '[0-9]'
      and not exists (select 1 from public.juntas_invitacion where codigo = v_codigo);
  end loop;

  insert into public.juntas_invitacion (junta_id, codigo) values (p_junta, v_codigo)
  on conflict (junta_id) do update set codigo = excluded.codigo, actualizado_en = now();
  perform public.registrar_auditoria(p_junta, 'regenerar_codigo_invitacion', 'junta', p_junta, '{}'::jsonb);
  return v_codigo;
end $$;

revoke execute on function public.ip_solicitud_hash(), public.validar_codigo_invitacion(),
  public.generar_codigo_invitacion(uuid) from public, anon;
grant execute on function public.generar_codigo_invitacion(uuid) to authenticated;
grant execute on function public.unidades_disponibles(text) to anon, authenticated;
