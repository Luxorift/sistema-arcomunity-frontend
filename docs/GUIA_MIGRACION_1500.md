# Guía para aplicar la migración 1500 en Supabase (producción)

**Archivos:**

- **Migración:** `supabase/migrations/20261126001500_flujo_prediccion_e2e.sql`, del PR #38, en su **último commit**
  (incluye la corrección de la auditoría del tiempo límite).
- **Retorno:** `supabase/rollback/20261126001500_revertir_flujo_prediccion_e2e.sql`.

**Quién la ejecuta:** el responsable del proyecto, desde su cuenta de Supabase. Ningún agente ni script la aplica.

**Tiempo estimado:** 30 a 40 minutos, con el respaldo y todas las verificaciones.

> **Reglas**
>
> - No compartas contraseñas ni claves en el chat; escríbelas solo en Supabase o en tu propia terminal.
> - Aplica la migración fuera de la restauración nocturna (03:00, hora de Lima) y sin ensayos de la demostración en
>   curso.
> - La migración no borra datos. Agrega columnas, tres tablas, un índice único y funciones, y redefine
>   `calcular_riesgo_morosidad`, `predicciones_vigentes` y `restaurar_demo_datos`.
> - Si algo no coincide con lo esperado, **detente**: no improvises cambios en producción.

## Resumen del procedimiento

| Etapa | Qué se comprueba | Si falla |
| --- | --- | --- |
| 1. Comprobaciones previas | La 1500 no está aplicada, no hay duplicados que bloqueen el índice nuevo y existen pg_cron y las migraciones 1100–1400 | No aplicar; revisar la causa |
| 2. Respaldo verificable | Conteos guardados, CSV con el mismo número de filas y volcado no vacío | No aplicar sin respaldo |
| 3. Aplicación segura | Todo dentro de `begin … commit` en el SQL Editor | `rollback;`: la base queda como estaba |
| 4. Validaciones posteriores | Datos intactos, objetos nuevos, modelo, permisos y RLS, pg_cron y la app anterior | Ver la tabla de problemas o usar el retorno |
| 5. Retorno, si hace falta | Volver al esquema de la 1400 | Seguir el apartado 6 y conocer sus limitaciones |

## 1. Comprobaciones previas (5 min, solo lectura)

En Supabase, abre **SQL Editor → New query** y ejecuta:

```sql
select
  to_regclass('public.registro_predicciones') is null                     as la_1500_no_esta_aplicada,
  to_regprocedure('public.preparar_demostracion(uuid)') is not null         as existe_la_1300,
  exists (select 1 from public.modelos_ml where version = 'v1' and activo)  as v1_activo,
  exists (select 1 from pg_extension where extname = 'pg_cron')             as pg_cron_instalado,
  (select count(*) from (select cuota_id, fecha_corte from public.predicciones_morosidad
                         group by 1, 2 having count(*) > 1) d)              as duplicados_cuota_corte;
```

**Resultado esperado:** `true`, `true`, `true`, `true` y `0`.

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

**Si todo coincide, la migración quedó bien aplicada.** Avísame con los resultados para el siguiente paso: integrar los
PR, publicar el frontend nuevo, grabar el video oficial y tomar las capturas de producción.

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

**Limitaciones del retorno:**

- **Elimina la bitácora y los recordatorios.** Solo quedan los CSV del paso 2.
- **Elimina las predicciones de respaldo** (las que no tienen probabilidad), porque el esquema anterior exige una
  probabilidad. Las del modelo se conservan.
- **No deshace las acciones normales hechas con la app mientras la 1500 estuvo aplicada:** cuotas generadas, pagos y
  otras. Esos datos pertenecen al esquema anterior y siguen siendo válidos.
- **Quita la purga programada de pg_cron.** La restauración nocturna de la demo no cambia.
- **Probado solo en PGlite**, que no reproduce pg_cron ni la concurrencia: aplicar, usar y revertir deja el esquema
  idéntico al de la 1400 (`supabase/tests/retorno-migracion-1500.test.ts`).
