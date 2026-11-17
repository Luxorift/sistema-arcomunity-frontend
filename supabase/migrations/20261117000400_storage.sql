-- Arcomunity · Almacenamiento privado
-- Bucket "comprobantes": capturas de pago. Ruta obligatoria: {junta_id}/{unidad_id}/{archivo}.
--   * Sube solo el propietario vigente de esa unidad.
--   * Lee el propietario de la unidad o el administrador de la junta (URLs firmadas temporales).
--   * Nadie actualiza ni borra desde la API: los comprobantes son evidencia inmutable.
-- Bucket "junta-archivos": QR de Yape de la junta. Ruta: {junta_id}/{archivo}.
--   * Lee cualquier miembro de la junta; escribe solo el administrador.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('junta-archivos', 'junta-archivos', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Convierte un segmento de ruta en uuid sin lanzar error si el texto no es válido.
create or replace function public.uuid_seguro(p_texto text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_texto ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then p_texto::uuid end
$$;

create or replace function public.puede_subir_comprobante(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select array_length(string_to_array(p_nombre, '/'), 1) = 3
     and split_part(p_nombre, '/', 3) ~ '^[A-Za-z0-9._-]{1,100}$'
     and exists (
       select 1 from public.unidades u
       where u.id = public.uuid_seguro(split_part(p_nombre, '/', 2))
         and u.junta_id = public.uuid_seguro(split_part(p_nombre, '/', 1))
         and u.id in (select public.mis_unidades())
     )
$$;

create or replace function public.puede_ver_comprobante(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin_de(public.uuid_seguro(split_part(p_nombre, '/', 1)))
      or public.uuid_seguro(split_part(p_nombre, '/', 2)) in (select public.mis_unidades())
$$;

revoke execute on function public.uuid_seguro(text), public.puede_subir_comprobante(text),
  public.puede_ver_comprobante(text) from public, anon;
grant execute on function public.uuid_seguro(text), public.puede_subir_comprobante(text),
  public.puede_ver_comprobante(text) to authenticated;

create policy comprobantes_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.puede_subir_comprobante(name));

create policy comprobantes_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and public.puede_ver_comprobante(name));

create policy junta_archivos_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'junta-archivos' and public.es_miembro_de(public.uuid_seguro(split_part(name, '/', 1))));

create policy junta_archivos_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'junta-archivos' and public.es_admin_de(public.uuid_seguro(split_part(name, '/', 1))));

create policy junta_archivos_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'junta-archivos' and public.es_admin_de(public.uuid_seguro(split_part(name, '/', 1))))
  with check (bucket_id = 'junta-archivos' and public.es_admin_de(public.uuid_seguro(split_part(name, '/', 1))));

create policy junta_archivos_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'junta-archivos' and public.es_admin_de(public.uuid_seguro(split_part(name, '/', 1))));

-- Registrar el QR subido en la configuración de la junta.
create or replace function public.actualizar_qr_yape(p_junta uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin(p_junta);
  if p_path is not null and (
       split_part(p_path, '/', 1) <> p_junta::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'junta-archivos' and o.name = p_path)
     ) then
    raise exception 'No encontramos la imagen del QR. Vuelve a subirla.';
  end if;
  update public.juntas set yape_qr_path = p_path where id = p_junta;
  perform public.registrar_auditoria(p_junta, 'actualizar_qr_yape', 'junta', p_junta,
    jsonb_build_object('con_qr', p_path is not null));
end $$;

revoke execute on function public.actualizar_qr_yape(uuid, text) from public, anon;
grant execute on function public.actualizar_qr_yape(uuid, text) to authenticated;
