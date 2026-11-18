-- Arcomunity · Autorización y Row Level Security
-- Principio: el frontend no decide permisos. Cada consulta se filtra aquí según auth.uid().
-- Las escrituras sensibles no tienen políticas: solo se hacen con funciones RPC (migración 0300).

-- Objetos futuros creados por este rol no heredan permisos amplios para anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión de RLS; solo devuelven booleanos
-- o identificadores del propio usuario)
-- ---------------------------------------------------------------------------------------------
create or replace function public.es_admin_de(p_junta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros_junta m
    where m.junta_id = p_junta and m.perfil_id = (select auth.uid()) and m.rol = 'admin' and m.activo
  )
$$;

create or replace function public.es_miembro_de(p_junta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros_junta m
    where m.junta_id = p_junta and m.perfil_id = (select auth.uid()) and m.activo
  )
$$;

-- Unidades de las que el usuario es propietario vigente y con membresía activa.
create or replace function public.mis_unidades()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.unidad_id
  from public.unidad_propietarios up
  join public.miembros_junta m on m.junta_id = up.junta_id and m.perfil_id = up.perfil_id and m.activo
  where up.perfil_id = (select auth.uid()) and up.hasta is null
$$;

create or replace function public.juntas_que_administro()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.junta_id from public.miembros_junta m
  where m.perfil_id = (select auth.uid()) and m.rol = 'admin' and m.activo
$$;

-- ---------------------------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------------------------------
alter table public.juntas enable row level security;
alter table public.juntas_invitacion enable row level security;
alter table public.perfiles enable row level security;
alter table public.miembros_junta enable row level security;
alter table public.unidades enable row level security;
alter table public.unidad_propietarios enable row level security;
alter table public.cuotas enable row level security;
alter table public.pagos enable row level security;
alter table public.egresos enable row level security;
alter table public.camaras enable row level security;
alter table public.auditoria enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Privilegios: por defecto Supabase concede todo a anon/authenticated. Se retira y se concede
-- solo lectura; RLS decide qué filas.
-- ---------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.juntas, public.juntas_invitacion, public.perfiles, public.miembros_junta,
  public.unidades, public.unidad_propietarios, public.cuotas, public.pagos, public.egresos,
  public.camaras, public.auditoria
to authenticated;

-- El propietario puede corregir su nombre y teléfono; nada más.
grant update (nombre_completo, telefono) on public.perfiles to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------------------------
create policy juntas_leer_miembros on public.juntas
  for select to authenticated using (public.es_miembro_de(id));

create policy invitacion_leer_admin on public.juntas_invitacion
  for select to authenticated using (public.es_admin_de(junta_id));

create policy perfiles_leer_propio_o_admin on public.perfiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1 from public.miembros_junta m
      where m.perfil_id = perfiles.id and m.junta_id in (select public.juntas_que_administro())
    )
  );

create policy perfiles_editar_propio on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy miembros_leer_propio_o_admin on public.miembros_junta
  for select to authenticated using (
    perfil_id = (select auth.uid()) or public.es_admin_de(junta_id)
  );

-- Los códigos de unidad no son datos personales: cualquier miembro de la junta los ve.
create policy unidades_leer_miembros on public.unidades
  for select to authenticated using (public.es_miembro_de(junta_id));

create policy unidad_propietarios_leer on public.unidad_propietarios
  for select to authenticated using (
    perfil_id = (select auth.uid()) or public.es_admin_de(junta_id)
  );

create policy cuotas_leer on public.cuotas
  for select to authenticated using (
    public.es_admin_de(junta_id) or unidad_id in (select public.mis_unidades())
  );

create policy pagos_leer on public.pagos
  for select to authenticated using (
    public.es_admin_de(junta_id) or unidad_id in (select public.mis_unidades())
  );

-- Los propietarios ven egresos solo agregados en el portal de transparencia (función RPC).
create policy egresos_leer_admin on public.egresos
  for select to authenticated using (public.es_admin_de(junta_id));

create policy camaras_leer on public.camaras
  for select to authenticated using (
    public.es_admin_de(junta_id) or (activa and public.es_miembro_de(junta_id))
  );

create policy auditoria_leer_admin on public.auditoria
  for select to authenticated using (public.es_admin_de(junta_id));

-- ---------------------------------------------------------------------------------------------
-- Funciones: Postgres concede EXECUTE a PUBLIC por defecto. Se retira y se concede explícitamente.
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.es_admin_de(uuid), public.es_miembro_de(uuid),
  public.mis_unidades(), public.juntas_que_administro(), public.hoy_lima()
to authenticated;
