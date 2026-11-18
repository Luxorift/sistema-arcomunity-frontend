-- Arcomunity · IP confiable para el límite de intentos del código de invitación
-- Problema (comprobado contra Supabase el 17/11/2026): la migración 0900 tomaba el PRIMER valor de
-- X-Forwarded-For, que lo escribe el propio cliente. Rotando esa cabecera se saltaba el límite de
-- 10 intentos por IP y se podía bloquear la IP de otra persona.
-- Solución: usar CF-Connecting-IP (la fija Cloudflare, que está delante de Supabase, y el cliente no
-- puede falsificarla). Si no llega, usar el último valor público de X-Forwarded-For (lo agrega el
-- proxy, no el cliente). Nunca el primero.

create or replace function public.es_ip_privada(p_ip text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v inet;
begin
  begin
    v := p_ip::inet;
  exception when others then
    return true; -- un valor que no es IP no sirve para identificar al cliente
  end;
  return v << '10.0.0.0/8'::inet or v << '172.16.0.0/12'::inet or v << '192.168.0.0/16'::inet
    or v << '127.0.0.0/8'::inet or v << '100.64.0.0/10'::inet or v << '169.254.0.0/16'::inet
    or v << 'fc00::/7'::inet or v << 'fe80::/10'::inet or v = '::1'::inet;
end $$;

-- Devuelve la IP del cliente y de qué cabecera salió. Uso interno (no expuesta a la API).
create or replace function public.ip_solicitud()
returns table (ip text, fuente text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_lista text[];
  v_item text;
  i integer;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  if nullif(btrim(v_headers ->> 'cf-connecting-ip'), '') is not null then
    return query select btrim(v_headers ->> 'cf-connecting-ip'), 'cf-connecting-ip'::text;
    return;
  end if;

  v_lista := string_to_array(coalesce(v_headers ->> 'x-forwarded-for', ''), ',');
  if v_lista is not null then
    for i in reverse coalesce(array_length(v_lista, 1), 0)..1 loop
      v_item := btrim(v_lista[i]);
      if v_item <> '' and not public.es_ip_privada(v_item) then
        return query select v_item, 'x-forwarded-for (último público)'::text;
        return;
      end if;
    end loop;
  end if;

  if nullif(btrim(v_headers ->> 'x-real-ip'), '') is not null then
    return query select btrim(v_headers ->> 'x-real-ip'), 'x-real-ip'::text;
    return;
  end if;

  return query select 'desconocida'::text, 'ninguna'::text;
end $$;

create or replace function public.ip_solicitud_hash()
returns text
language sql
stable
set search_path = ''
as $$ select encode(sha256(convert_to((select s.ip from public.ip_solicitud() s), 'UTF8')), 'hex') $$;

-- Diagnóstico para el equipo técnico: qué cabecera se está usando, sin devolver ninguna IP.
create or replace function public.diagnostico_ip_solicitud()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Solo el servicio puede usar este diagnóstico.' using errcode = '42501';
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  return jsonb_build_object(
    'fuente', (select s.fuente from public.ip_solicitud() s),
    'hay_cf_connecting_ip', coalesce(v_headers ? 'cf-connecting-ip', false),
    'entradas_x_forwarded_for', coalesce(array_length(string_to_array(v_headers ->> 'x-forwarded-for', ','), 1), 0),
    'hay_x_real_ip', coalesce(v_headers ? 'x-real-ip', false)
  );
end $$;

revoke execute on function public.es_ip_privada(text), public.ip_solicitud(), public.ip_solicitud_hash(),
  public.diagnostico_ip_solicitud() from public, anon, authenticated;
grant execute on function public.diagnostico_ip_solicitud() to service_role;

-- Mantenimiento: el equipo técnico puede revisar o liberar bloqueos con la clave de servicio.
grant select, delete on public.intentos_invitacion to service_role;
