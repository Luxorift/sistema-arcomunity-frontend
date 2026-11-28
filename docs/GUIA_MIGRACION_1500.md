# Guía para aplicar la migración 1500 en Supabase (producción)

> **Estado: APLICADA en producción el 27/11/2026 a las 22:55, hora de Lima** (03:55 UTC del 28/11).
>
> - Se aplicó dentro de una sola transacción, después de un respaldo verificado.
> - Las validaciones del apartado 4 dieron 15 de 15.
> - El registro completo está en el apartado 8.
>
> Esta guía se conserva para volver a aplicarla en otro proyecto y para el retorno (apartado 6).

**Archivos:**

- **Migración:** `supabase/migrations/20261126001500_flujo_prediccion_e2e.sql`, del PR #38, en su **último commit**
  (incluye la corrección de la auditoría del tiempo límite).
- **Retorno:** `supabase/rollback/20261126001500_revertir_flujo_prediccion_e2e.sql`.

**Quién la ejecuta:** el responsable del proyecto, desde su cuenta de Supabase. El 27/11/2026, con su autorización expresa, la aplicó el asistente de desarrollo con la CLI de Supabase ya vinculada (apartado 8).

**Tiempo estimado:** 30 a 40 minutos, con el respaldo y todas las verificaciones.

> **Reglas**
>
> - No compartas contraseñas ni claves en el chat; escríbelas solo en Supabase o en tu propia terminal.
> - Aplica la migración fuera de la restauración nocturna (03:00, hora de Lima) y sin ensayos de la demostración en
>   curso.
> - La migración no borra datos. Agrega columnas, tres tablas, un índice único y funciones, y redefine
>   `calcular_riesgo_morosidad`, `predicciones_vigentes` y `restaurar_demo_datos`.
> - Si algo no coincide con lo esperado, **detente**: no improvises cambios en producción.

> **Validación previa (27/11/2026).** Esta guía se ejecutó completa, bloque por bloque, en un PostgreSQL 16.16 real
> con las migraciones 0100–1400 y datos de demostración. Los resultados coincidieron con todos los valores
> esperados, salvo pg_cron (4.7), que ese servidor no tiene.
>
> En ese mismo PostgreSQL, con conexiones independientes, se comprobaron 23 casos:
>
> - el bloqueo por junta y los reintentos;
> - la respuesta tardía de más de 8 s;
> - el índice único;
> - los recordatorios;
> - RLS y los permisos;
> - la compatibilidad con el frontend publicado;
> - la purga.
>
> El retorno dejó el esquema idéntico al de la 1400. Las evidencias están en la carpeta del equipo:
> `evidencias_proy/postgresql_real_2026-11-27`.
>
> **Lo que solo se puede comprobar en Supabase:** pg_cron (4.7) y el panel de la app conectado a la base real (4.8 y
> 7.2).

## Resumen del procedimiento

| Etapa | Qué se comprueba | Si falla |
| --- | --- | --- |
| 1. Comprobaciones previas | La 1500 no está aplicada, no hay duplicados que bloqueen el índice nuevo y existen pg_cron y las migraciones 1100–1400 | No aplicar; revisar la causa |
| 2. Respaldo verificable | Conteos guardados, CSV con el mismo número de filas y volcado no vacío | No aplicar sin respaldo |
| 3. Aplicación segura | Todo dentro de `begin … commit` en el SQL Editor | `rollback;`: la base queda como estaba |
| 4. Validaciones posteriores | Datos intactos, objetos nuevos, modelo, permisos y RLS, pg_cron y la app anterior | Ver la tabla de problemas o usar el retorno |
| 5. Retorno, si hace falta | Volver al esquema de la 1400 | Seguir el apartado 6 y conocer sus limitaciones |
| 6. Puertas para publicar | Cuándo integrar en `dev`, probar la vista previa y promover a `main` | Apartado 7 |

## 1. Comprobaciones previas (5 min, solo lectura)

En Supabase, abre **SQL Editor → New query** y ejecuta:

```sql
select
  to_regclass('public.registro_predicciones') is null                     as la_1500_no_esta_aplicada,
  to_regprocedure('public.preparar_demostracion(uuid)') is not null         as existe_la_1300,
  exists (select 1 from public.modelos_ml where version = 'v1' and activo)  as v1_activo,
  exists (select 1 from pg_extension where extname = 'pg_cron')             as pg_cron_instalado,
  (select count(*) from (select cuota_id, fecha_corte from public.predicciones_morosidad
                         group by 1, 2 having count(*) > 1) d)              as duplicados_cuota_corte,
  current_setting('server_version_num')::int >= 150000                      as postgres_15_o_superior;
```

**Resultado esperado:** `true`, `true`, `true`, `true`, `0` y `true`.

- Si `la_1500_no_esta_aplicada` = `false`: la migración ya se aplicó, al menos en parte. No continúes; avísame.
- Si `duplicados_cuota_corte` > 0: el índice único fallaría. No continúes; avísame con el resultado.
- Si `pg_cron_instalado` = `false`: puedes continuar, pero la purga mensual quedará sin programar (apartado 4.7).

## 2. Respaldo verificable (10 min)

### 2.1 Foto de conteos (obligatoria)

```sql
select 'modelos_ml' as tabla, count(*) from public.modelos_ml
union all select 'predicciones_morosidad', count(*) from public.predicciones_morosidad
union all select 'cuotas', count(*) from public.cuotas
union all select 'pagos', count(*) from public.pagos
union all select 'auditoria', count(*) from public.auditoria;
```

Guarda el resultado en `Proyecto_Final/respaldos/AAAA-MM-DD/conteos_antes.txt`, junto con la fecha y la hora.

### 2.2 Exportar a CSV (obligatorio)

En **Table Editor**, usa **Export → Export to CSV** en `predicciones_morosidad`, `modelos_ml` y `auditoria`.
Guárdalos en la misma carpeta.

**Para verificar el respaldo:** abre cada CSV. El número de filas de datos (sin el encabezado) debe ser igual al conteo
del paso 2.1. Si no coincide, vuelve a exportar.

### 2.3 Volcado completo con la CLI (recomendado)

En tu terminal de PowerShell, dentro del repositorio. La CLI te pedirá la contraseña de la base: escríbela tú.

```powershell
npx supabase link --project-ref <REFERENCIA_DEL_PROYECTO>
```

```powershell
npx supabase db dump -f respaldo_esquema_antes_1500.sql
```

```powershell
npx supabase db dump --data-only -f respaldo_datos_antes_1500.sql
```

**Para verificar el volcado:** los dos archivos deben pesar más de 0 KB. Además, `respaldo_esquema_antes_1500.sql`
debe contener `CREATE TABLE public.predicciones_morosidad`; puedes buscarlo con Ctrl + F. No subas estos archivos a
GitHub: contienen datos.

## 3. Aplicación segura (5 min)

Usa el **SQL Editor**.

> **No uses `supabase db push`.** Si las migraciones anteriores se aplicaron desde el editor, la CLI intentaría
> aplicarlas otra vez desde la 0100.

1. Abre el archivo de la migración en GitHub, en la rama `feat/flujo-e2e-prediccion` (PR #38), con el botón **Raw**.
2. En **SQL Editor → New query**, escribe `begin;` en la primera línea.
3. Pega el contenido **completo** del archivo.
4. Escribe `commit;` en la última línea y pulsa **Run**.

**Resultado esperado:** «Success. No rows returned». Puede aparecer un aviso (NOTICE) sobre pg_cron; no es un error.

**Si aparece un error en rojo:**

1. Ejecuta `rollback;` en una consulta nueva.
2. No vuelvas a ejecutar el mismo texto.
3. Busca el mensaje en el apartado 5.

Un error dentro de `begin … commit` deja la base exactamente como estaba.

> **Si en lugar del SQL Editor usas `psql` en Windows:**
>
> 1. Antes de conectarte, ejecuta `$env:PGCLIENTENCODING = "UTF8"`.
> 2. Aplica con `psql -v ON_ERROR_STOP=1 -1 -f archivo.sql`.
>
> Sin UTF8, las tildes de los mensajes quedan dañadas, por ejemplo «predicciÃ³n». Así ocurrió en la prueba previa.

## 4. Validaciones posteriores (15 min)

### 4.1 Datos intactos

```sql
select count(*) as total,
       count(*) filter (where origen = 'regla_respaldo') as respaldo,
       count(*) filter (where probabilidad is null) as sin_probabilidad
from public.predicciones_morosidad;
select version, activo, umbral from public.modelos_ml order by version;
```

**Esperado:**

- `total` igual al conteo de 2.1;
- `respaldo` = 0 y `sin_probabilidad` = 0;
- `regla-respaldo` inactivo (umbral 0.500) y `v1` activo (umbral 0.226).

### 4.2 Objetos nuevos

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('calcular_riesgo_periodo', 'probar_entrada_modelo', 'registrar_recordatorio', 'simular_falla_modelo',
                  'estado_prediccion', 'ml_evaluar', 'ml_entrada_valida', 'ml_calcular', 'restaurar_demo_datos_base',
                  'purgar_registro_predicciones')
order by proname;
select indexname from pg_indexes where indexname = 'predicciones_una_por_cuota_y_corte';
select column_name from information_schema.columns
where table_name = 'registro_predicciones' and column_name in ('lote', 'solicitado_en', 'demora_ms');
```

**Esperado:** 10 funciones, 1 índice y 3 columnas.

### 4.3 El modelo responde igual que en Python (solo lectura)

```sql
select public.ml_evaluar((select parametros from public.modelos_ml where version = 'v1'),
  '{"pagos_atrasados_previos": 2, "atrasos_previos_total": 5, "tasa_atraso_previa": 0.4167, "dias_atraso_promedio_previo": 4.5}'::jsonb);
select public.ml_evaluar((select parametros from public.modelos_ml where version = 'v1'),
  '{"pagos_atrasados_previos": 2, "atrasos_previos_total": 5, "tasa_atraso_previa": 1.4, "dias_atraso_promedio_previo": 4.5}'::jsonb);
```

**Esperado:**

- Primera consulta: `origen` = `modelo`, `probabilidad` = 0.4503 y `nivel_riesgo` = `alto`.
- Segunda consulta: `origen` = `regla_respaldo`, `motivo_respaldo` = `entrada_fuera_de_rango` y `nivel_riesgo` = `medio`.

### 4.4 Permisos de las funciones

```sql
select f as funcion,
       has_function_privilege('anon', f, 'execute') as anon,
       has_function_privilege('authenticated', f, 'execute') as autenticado
from unnest(array[
  'public.calcular_riesgo_periodo(uuid, date)', 'public.probar_entrada_modelo(uuid, jsonb)',
  'public.registrar_recordatorio(uuid, text, text)', 'public.simular_falla_modelo(uuid, boolean)',
  'public.estado_prediccion(uuid)', 'public.predicciones_vigentes(uuid)', 'public.calcular_riesgo_morosidad(uuid, date, integer)',
  'public.ml_evaluar(jsonb, jsonb, text)', 'public.ml_calcular(uuid, date, integer, date)',
  'public.restaurar_demo_datos(uuid)', 'public.purgar_registro_predicciones()']) as f;
```

**Esperado:**

- `anon` = `false` en las 11 funciones.
- `autenticado` = `true` en las 7 primeras, porque se usan desde la app y validan dentro que el usuario sea de la
  administración.
- `autenticado` = `false` en las 4 últimas, que son internas.

### 4.5 RLS y permisos de las tablas nuevas

```sql
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname in ('registro_predicciones', 'recordatorios', 'demo_ajustes');
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('registro_predicciones', 'recordatorios', 'demo_ajustes')
  and grantee in ('anon', 'authenticated') order by 1, 2, 3;
select tablename, policyname, cmd from pg_policies where tablename in ('registro_predicciones', 'recordatorios');
```

**Esperado:**

- RLS en `true` en las 3 tablas.
- Solo dos permisos, los dos `SELECT` para `authenticated`: uno en `recordatorios` y otro en `registro_predicciones`.
  `demo_ajustes` no tiene ningún permiso.
- Dos políticas de lectura: `recordatorios_leer_admin` y `registro_predicciones_leer_admin`.

### 4.6 La bitácora no se puede modificar

```sql
begin;
update public.registro_predicciones set nivel_riesgo = nivel_riesgo where false;
rollback;
```

**Esperado:** se ejecuta sin cambios, porque no afecta filas. La protección real se probó en PGlite: cualquier
`update` o `delete` desde la app se rechaza.

### 4.7 pg_cron

```sql
select jobname, schedule, active from cron.job where jobname like 'arcomunity-%' order by jobname;
```

**Esperado:** dos filas, ambas activas:

- `arcomunity-purgar-registro-predicciones`, con `30 8 1 * *` (día 1 de cada mes, 03:30 en Lima);
- `arcomunity-restaurar-demo`.

Si falta la purga, prográmala con esta consulta y vuelve a verificar:

```sql
select cron.schedule('arcomunity-purgar-registro-predicciones', '30 8 1 * *', $c$select public.purgar_registro_predicciones()$c$);
```

### 4.8 La aplicación publicada (versión anterior) sigue funcionando

1. Entra con `admin@arcomunity.demo` y abre Resumen, Cuotas, Conciliación y Predicción de morosidad. Ninguna debe
   mostrar un error.
2. Entra con `casa12@arcomunity.demo`. Debe ver su cuota por pagar y no tener acceso a Predicción.

**Si todo coincide, la migración quedó bien aplicada.** Mándame los resultados de 1 a 4.8, en texto o capturas, sin
contraseñas. Los revisamos juntos antes del apartado 7.

## 5. Problemas posibles

| Mensaje o síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `column "origen" … already exists` o `function … already exists` | La migración ya se había aplicado, entera o en parte | `rollback;` y repetir las comprobaciones del apartado 1 |
| `could not create unique index "predicciones_una_por_cuota_y_corte"` | Hay predicciones duplicadas por cuota y corte | `rollback;`. No borres filas a mano; avísame con el resultado de la comprobación previa |
| NOTICE «No se pudo programar la purga» o `permission denied for schema cron` | El proyecto no permite programar pg_cron desde la migración | La migración sí se aplicó. Programa la purga como en 4.7 o desde Database → Cron |
| `syntax error at or near …` | Se pegó solo una parte del archivo | `rollback;` y volver a copiar el archivo completo desde Raw |
| 4.1: el total no coincide con 2.1 | Alguien calculó el riesgo durante la ventana | Revisar la auditoría; si faltan filas, usar el retorno y restaurar los CSV |
| 4.3: otra probabilidad | Los parámetros del v1 no son los esperados | No publicar el frontend; avísame |
| 4.4 o 4.5: `anon` = `true` o permisos de escritura | Falla de permisos (no ocurrió en las pruebas) | **Retorno inmediato** |
| La app anterior muestra «< 1 %» con riesgo alto | Hay filas de respaldo (solo si el modelo falla) | Esperable hasta publicar el frontend del PR #38, que muestra «Regla manual» |

## 6. Retorno: cuándo usarlo y sus limitaciones

> **El retorno nunca se ejecuta automáticamente.** Es una decisión tuya, tomada después de leer sus consecuencias.

**Úsalo si ocurre cualquiera de estas situaciones:**

- Una validación central falla (4.1 a 4.5) y no se resuelve en unos 15 minutos.
- Un flujo anterior se rompe: inicio de sesión, pagos, conciliación o cuotas.
- Un propietario o un usuario anónimo puede leer datos de predicción, de la bitácora o de recordatorios.

**No lo uses para** una purga de pg_cron sin programar: se programa aparte.

**Pasos:**

1. Si el frontend del PR #38 ya estaba publicado, vuelve a publicar la versión anterior (la de `main` sin el PR #38).
2. Exporta a CSV `registro_predicciones` y `recordatorios`.
3. En **SQL Editor**, pega el archivo de retorno completo (ya trae `begin` y `commit`) y pulsa **Run**.
4. Comprueba:
   - `select to_regclass('public.registro_predicciones');` debe dar `null`;
   - 4.1 ya no muestra `regla-respaldo`;
   - la app anterior funciona como en 4.8.

**Consecuencias sobre los datos creados después de aplicar la 1500:**

| Dato | Qué le pasa con el retorno | ¿Se puede recuperar? |
| --- | --- | --- |
| Bitácora `registro_predicciones`, con lote y demora | Se elimina la tabla | Solo desde el CSV del paso 2 (como archivo, no vuelve a la base) |
| Recordatorios registrados | Se elimina la tabla | Solo desde el CSV |
| Predicciones de respaldo (sin probabilidad) | Se eliminan, porque el esquema anterior exige probabilidad | No. Se recalculan con «Calcular riesgo de hoy» |
| Predicciones del modelo | Se conservan, sin las columnas nuevas (origen, motivo y solicitante) | Sí: quedan en la base |
| Fila `regla-respaldo` de `modelos_ml` | Se elimina | No hace falta |
| Cuotas, pagos, egresos y auditoría | No cambian: el retorno no los toca | Sí: quedan en la base |
| Falla simulada de la demo (`demo_ajustes`) | Se elimina | No hace falta |
| Purga programada en pg_cron | Se quita | Se vuelve a programar si se reaplica la 1500 |

**Limitaciones:**

- El retorno no deshace las acciones normales hechas con la app mientras la 1500 estuvo aplicada, como generar cuotas
  o registrar pagos. Esos datos pertenecen al esquema anterior y siguen siendo válidos.
- Se probó en PGlite (`supabase/tests/retorno-migracion-1500.test.ts`) y en PostgreSQL 16.16 real. En los dos casos,
  aplicar, usar y revertir dejó el esquema idéntico al de la 1400 (comparación con `pg_dump`), y la 1500 se pudo
  volver a aplicar. No se probó en Supabase.

## 7. Cuándo integrar y publicar el frontend (puertas)

Cada puerta exige que la anterior esté cumplida y **tu autorización explícita**.

| Puerta | Condición para pasar | Qué se hace | Quién |
| --- | --- | --- | --- |
| 7.1 Integrar en `dev` | Revisión de esta guía y del respaldo (apartado 2) | Fusionar #37, luego #38 y luego #39 en `dev`. No despliega nada en producción | Claude, con tu autorización |
| 7.2 Aplicar la 1500 | Apartados 1 a 3 sin errores | Aplicación en el SQL Editor | Tú |
| 7.3 Verificar | 4.1 a 4.8 coinciden y la app publicada (anterior) funciona | Revisamos los resultados juntos | Tú y Claude |
| 7.4 Probar la vista previa de `dev` | 7.1 y 7.3 cumplidas | Abrir la vista previa de Vercel de `dev` (con tu sesión de Vercel) y recorrer el flujo nuevo: generar cuotas, predicción, recordatorio, falla simulada y entrada inválida. Usa la misma base de producción, en la junta demo, y la restauración nocturna revierte el ensayo | Tú, guiado por Claude |
| 7.5 Promover `dev` → `main` | 7.4 sin errores | PR `dev` → `main`, fusión y despliegue automático | Claude, con tu autorización |
| 7.6 Evidencias de producción | 7.5 publicado | Probar la URL pública, grabar el video oficial (`npm run grabar:demo-proy` con `APP_URL`) y tomar las capturas | Claude, con tu autorización para escribir en la junta demo |

**Por qué este orden:**

1. La migración es compatible con el frontend publicado (verificado), así que puede aplicarse antes de publicar el
   frontend nuevo.
2. La vista previa de `dev` es la primera prueba del flujo nuevo contra Supabase real, sin exponerlo todavía en la URL
   pública.
3. Si algo falla en 7.4, `main` no cambió y basta con corregir en una rama nueva.

## 8. Registro de la aplicación en producción (27/11/2026)

**Proyecto:** `arcomunity`, con PostgreSQL 17.11. Las pruebas previas se hicieron en PostgreSQL 16.16; la migración no
usa nada propio de una versión.

**Método:** `supabase db query --linked`, con la CLI ya autenticada y vinculada al proyecto. Se usa la API de gestión,
sin escribir la contraseña de la base. No se usó `supabase db push`.

| Paso | Hora (Lima) | Resultado |
| --- | --- | --- |
| 1. Comprobaciones previas | 22:51 | `true`, `true`, `true`, `true`, `0`, `true`, como se esperaba |
| 2. Respaldo verificable | 22:51 | Las 15 tablas de `public` exportadas a JSON; cada archivo tiene las mismas filas que su conteo (por ejemplo, cuotas 360, pagos 346, auditoría 381 y predicciones 0). También se guardaron funciones, políticas, permisos, índices y pg_cron. Queda fuera del repositorio porque contiene datos |
| 3. Aplicación | 22:55 | Sin errores. Un solo bloque `begin; …; commit;` aplicó la migración y la registró en `supabase_migrations.schema_migrations` (`20261126001500 flujo_prediccion_e2e`) |
| 4. Validaciones 4.1 a 4.7 | 22:56 | 15 de 15. La purga quedó programada en pg_cron con `30 8 1 * *` |
| 4.8 y pruebas funcionales | 22:59–23:02 | 27 de 27 en la base de producción, solo en la junta de demostración (ver el CHANGELOG, versión 3.0.0). La junta quedó reiniciada a su foto |
| 7.1 Integrar en `dev` | 22:54 | PR #37, #38 y #39 fusionados. 151 de 151 pruebas y build correcto |
| 7.5 Publicar | 23:04 | PR #40 `dev` → `main` (`4d64550`), etiqueta `v3.0.0`. Vercel y Cloudflare sirven el bundle nuevo |

**No se probó la interfaz publicada con sesión iniciada:** las suites con contraseña de las cuentas demo las ejecuta el
responsable. Corresponde a los pasos 7.4 y 7.6.

**Evidencias:** en la carpeta del equipo, `Proyecto_Final/evidencias_proy/produccion_2026-11-27`, con los resultados
JSON y los scripts.

