-- Arcomunity · Esquema base
-- Entidades: juntas (condominios), perfiles, membresías con rol, unidades, propietarios por unidad,
-- cuotas, pagos, egresos, cámaras y auditoría. Los importes usan numeric(10,2) en soles (PEN).
-- Las restricciones compuestas (id, junta_id) garantizan que ninguna fila cruce de junta.

-- ---------------------------------------------------------------------------------------------
-- Utilidades de fecha (zona horaria oficial del negocio: America/Lima)
-- ---------------------------------------------------------------------------------------------
create or replace function public.hoy_lima()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Lima')::date $$;

comment on function public.hoy_lima() is 'Fecha actual en America/Lima según el reloj del servidor.';

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Juntas (comunidad / condominio)
-- ---------------------------------------------------------------------------------------------
create table public.juntas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 120),
  cuota_mensual numeric(10,2) not null check (cuota_mensual > 0 and cuota_mensual <= 10000),
  dia_vencimiento smallint not null default 10 check (dia_vencimiento between 1 and 28),
  yape_titular text check (yape_titular is null or char_length(yape_titular) <= 120),
  yape_qr_path text check (yape_qr_path is null or char_length(yape_qr_path) <= 300),
  conciliacion_automatica boolean not null default true,
  transparencia_detalle_unidades boolean not null default true,
  es_simulado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on column public.juntas.transparencia_detalle_unidades is
  'Si es false, el portal de transparencia solo muestra totales agregados, sin estado por unidad.';

create trigger juntas_actualizado_en before update on public.juntas
  for each row execute function public.tocar_actualizado_en();

-- El código de invitación se separa para que solo los administradores puedan leerlo.
create table public.juntas_invitacion (
  junta_id uuid primary key references public.juntas(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9-]{6,32}$'),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Perfiles (extiende auth.users) y membresías con rol por junta
-- ---------------------------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null check (char_length(btrim(nombre_completo)) between 2 and 120),
  correo text not null check (char_length(correo) <= 254),
  telefono text check (telefono is null or telefono ~ '^\d{9}$'),
  acepto_datos boolean not null default false,
  acepto_datos_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_consentimiento_con_fecha check (not acepto_datos or acepto_datos_en is not null)
);
comment on column public.perfiles.correo is
  'Copia del correo de auth.users para listados administrativos filtrables por RLS.';

create trigger perfiles_actualizado_en before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();

-- El rol nunca se toma de metadatos del usuario: solo se asigna aquí, por funciones del servidor.
create table public.miembros_junta (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null check (rol in ('admin', 'propietario')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (junta_id, perfil_id)
);
create index miembros_junta_perfil_idx on public.miembros_junta (perfil_id) where activo;

-- ---------------------------------------------------------------------------------------------
-- Unidades residenciales y su propietario vigente
-- ---------------------------------------------------------------------------------------------
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  codigo text not null check (char_length(btrim(codigo)) between 1 and 30),
  activa boolean not null default true,
  es_simulado boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (id, junta_id)
);
create unique index unidades_codigo_unico on public.unidades (junta_id, lower(btrim(codigo)));

create table public.unidad_propietarios (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null,
  unidad_id uuid not null,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  desde timestamptz not null default now(),
  hasta timestamptz,
  creado_en timestamptz not null default now(),
  foreign key (unidad_id, junta_id) references public.unidades(id, junta_id) on delete cascade,
  check (hasta is null or hasta >= desde)
);
-- Una unidad tiene a lo sumo un propietario vigente.
create unique index unidad_propietario_vigente on public.unidad_propietarios (unidad_id) where hasta is null;
create index unidad_propietarios_perfil_idx on public.unidad_propietarios (perfil_id) where hasta is null;

-- ---------------------------------------------------------------------------------------------
-- Cuotas
-- Estados guardados: pendiente | en_revision | pagada. "Morosa" es calculada (pendiente y vencida).
-- ---------------------------------------------------------------------------------------------
create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  unidad_id uuid not null,
  periodo date not null check (extract(day from periodo) = 1),
  concepto text not null default 'vigilancia' check (concepto in ('vigilancia')),
  monto numeric(10,2) not null check (monto > 0 and monto <= 10000),
  fecha_vencimiento date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_revision', 'pagada')),
  fecha_pago date,
  pago_id uuid,
  dias_atraso integer generated always as (
    case when fecha_pago is null then 0 else greatest(0, fecha_pago - fecha_vencimiento) end
  ) stored,
  es_simulado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (unidad_id, junta_id) references public.unidades(id, junta_id),
  unique (unidad_id, periodo, concepto),
  unique (id, unidad_id, junta_id),
  check (fecha_vencimiento >= periodo and fecha_vencimiento < (periodo + interval '1 month')::date),
  constraint cuotas_pagada_consistente check (
    (estado = 'pagada') = (fecha_pago is not null and pago_id is not null)
  )
);
create index cuotas_junta_periodo_idx on public.cuotas (junta_id, periodo);
create index cuotas_unidad_periodo_idx on public.cuotas (unidad_id, periodo);

create trigger cuotas_actualizado_en before update on public.cuotas
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------------------------
-- Pagos
-- pendiente_revision: pago declarado por el propietario, aún sin aprobar.
-- conciliado_auto: comprobante coherente según reglas R1–R4. NO es confirmación bancaria.
-- conciliado_manual: aprobado por el administrador (quien verifica en su app o en caja).
-- rechazado: rechazado u observado con motivo; la cuota vuelve a pendiente.
-- ---------------------------------------------------------------------------------------------
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  cuota_id uuid not null,
  unidad_id uuid not null,
  registrado_por uuid references public.perfiles(id) on delete set null,
  metodo text not null check (metodo in ('yape_qr', 'yape_captura', 'plin_captura', 'efectivo', 'transferencia')),
  monto_declarado numeric(10,2) not null check (monto_declarado > 0 and monto_declarado <= 10000),
  fecha_operacion date not null,
  numero_operacion text check (numero_operacion is null or numero_operacion ~ '^[A-Za-z0-9-]{4,30}$'),
  comprobante_path text check (comprobante_path is null or char_length(comprobante_path) <= 300),
  comprobante_sha256 text check (comprobante_sha256 is null or comprobante_sha256 ~ '^[0-9a-f]{64}$'),
  ocr_confianza numeric(5,2) check (ocr_confianza is null or ocr_confianza between 0 and 100),
  ocr_extraido jsonb,
  estado text not null check (estado in ('pendiente_revision', 'conciliado_auto', 'conciliado_manual', 'rechazado')),
  alertas text[] not null default '{}',
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500),
  nota_admin text check (nota_admin is null or char_length(nota_admin) <= 500),
  subido_en timestamptz not null default now(),
  conciliado_en timestamptz,
  revisado_por uuid references public.perfiles(id) on delete set null,
  revisado_en timestamptz,
  minutos_conciliacion numeric generated always as (
    case when conciliado_en is null then null
         else round((extract(epoch from (conciliado_en - subido_en)) / 60.0)::numeric, 2) end
  ) stored,
  es_simulado boolean not null default false,
  creado_en timestamptz not null default now(),
  foreign key (cuota_id, unidad_id, junta_id) references public.cuotas(id, unidad_id, junta_id),
  check (metodo = 'efectivo' or numero_operacion is not null),
  check (estado <> 'rechazado' or char_length(btrim(coalesce(motivo_rechazo, ''))) >= 5),
  check (estado not in ('conciliado_auto', 'conciliado_manual') or conciliado_en is not null)
);
-- Un único pago vigente (no rechazado) por cuota: evita duplicados y aprobaciones simultáneas.
create unique index pagos_vigente_por_cuota on public.pagos (cuota_id) where estado <> 'rechazado';
-- Un número de operación no puede conciliarse dos veces en la misma junta.
create unique index pagos_operacion_conciliada on public.pagos (junta_id, upper(numero_operacion))
  where estado in ('conciliado_auto', 'conciliado_manual') and numero_operacion is not null;
-- Un archivo de comprobante pertenece a un solo pago.
create unique index pagos_comprobante_unico on public.pagos (comprobante_path) where comprobante_path is not null;
create index pagos_junta_estado_idx on public.pagos (junta_id, estado);
create index pagos_operacion_idx on public.pagos (junta_id, upper(numero_operacion));
create index pagos_unidad_idx on public.pagos (unidad_id);

alter table public.cuotas
  add constraint cuotas_pago_fk foreign key (pago_id) references public.pagos(id) deferrable initially deferred;

-- ---------------------------------------------------------------------------------------------
-- Egresos (pago al personal de vigilancia y otros gastos). Se anulan, no se borran.
-- ---------------------------------------------------------------------------------------------
create table public.egresos (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  fecha date not null check (fecha >= date '2020-01-01'),
  concepto text not null check (concepto in ('pago_vigilante', 'insumos', 'otros')),
  beneficiario text not null check (char_length(btrim(beneficiario)) between 2 and 120),
  monto numeric(10,2) not null check (monto > 0 and monto <= 100000),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  registrado_por uuid references public.perfiles(id) on delete set null,
  anulado boolean not null default false,
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 500),
  anulado_en timestamptz,
  es_simulado boolean not null default false,
  creado_en timestamptz not null default now(),
  check (not anulado or (motivo_anulacion is not null and anulado_en is not null))
);
create index egresos_junta_fecha_idx on public.egresos (junta_id, fecha) where not anulado;

-- ---------------------------------------------------------------------------------------------
-- Cámaras (videovigilancia de zonas comunes; sin grabaciones)
-- ---------------------------------------------------------------------------------------------
create table public.camaras (
  id uuid primary key default gen_random_uuid(),
  junta_id uuid not null references public.juntas(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  ubicacion text not null check (char_length(btrim(ubicacion)) between 2 and 120),
  tipo text not null check (tipo in ('simulada', 'mjpeg', 'embed')),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  check (tipo = 'simulada' or url is not null)
);

-- ---------------------------------------------------------------------------------------------
-- Auditoría (solo inserción desde funciones del servidor; nadie la edita ni la borra)
-- ---------------------------------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  junta_id uuid references public.juntas(id) on delete cascade,
  actor_id uuid,
  actor_nombre text,
  accion text not null check (char_length(accion) <= 60),
  entidad text check (entidad is null or char_length(entidad) <= 40),
  entidad_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index auditoria_junta_fecha_idx on public.auditoria (junta_id, creado_en desc);

create or replace function public.bloquear_modificacion_auditoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Solo los roles de mantenimiento (purga de una junta de demostración) pueden eliminar filas.
  if tg_op = 'DELETE' and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return old;
  end if;
  raise exception 'La bitácora de auditoría no se puede modificar ni eliminar.';
end $$;

create trigger auditoria_inmutable before update or delete on public.auditoria
  for each row execute function public.bloquear_modificacion_auditoria();
