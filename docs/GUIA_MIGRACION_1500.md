# Guía para aplicar la migración 1500 en Supabase (producción)

**Migración:** `supabase/migrations/20261126001500_flujo_prediccion_e2e.sql` (PR #38).
**Retorno:** `supabase/rollback/20261126001500_revertir_flujo_prediccion_e2e.sql`.
**Quién la ejecuta:** el responsable del proyecto, desde su cuenta de Supabase. Ningún agente ni script la aplica.

**Tiempo estimado:** 20 a 30 minutos, incluidos el respaldo y las verificaciones.

> **Antes de empezar**
>
> - No compartas contraseñas ni claves en el chat. Escríbelas solo en Supabase o en tu propia terminal.
> - Aplica la migración fuera de la restauración nocturna (03:00, hora de Lima) y sin ensayos de la demostración en
>   curso.
> - La migración no borra datos. Solo agrega columnas, tablas y funciones, y redefine tres funciones existentes.

## 1. Preparación (5 min)

1. Confirma que el PR #38 está revisado. Esta migración no requiere el PR #37.
2. Abre el archivo de la migración en GitHub, dentro de la rama `feat/flujo-e2e-prediccion` del PR #38. Usa el botón
   **Raw** y deja la pestaña abierta.
3. En Supabase, abre el proyecto de Arcomunity. Vas a usar **SQL Editor** y **Table Editor**.

## 2. Respaldo (10 min)

### 2.1 Foto del estado actual (obligatoria, solo lectura)

En **SQL Editor → New query**, ejecuta esta consulta y **guarda el resultado**: copia la tabla a un archivo de texto o
toma una captura.

```sql
select 'modelos_ml' as tabla, count(*) from public.modelos_ml
union all select 'predicciones_morosidad', count(*) from public.predicciones_morosidad
union all select 'cuotas', count(*) from public.cuotas
union all select 'pagos', count(*) from public.pagos
union all select 'auditoria', count(*) from public.auditoria;

select version, activo, umbral from public.modelos_ml order by version;
```

### 2.2 Exportar datos (obligatorio)

En **Table Editor**, abre cada tabla y usa **Export → Export to CSV**:

- `predicciones_morosidad`
- `modelos_ml`
- `auditoria`

Guarda los archivos en `Proyecto_Final/respaldos/AAAA-MM-DD/`. No los subas al repositorio.

### 2.3 Respaldo completo con la CLI (opcional, recomendado)

Ejecútalo en tu propia terminal de PowerShell, dentro de la carpeta del repositorio. La CLI te pedirá la contraseña de
la base: escríbela tú.

```powershell
npx supabase link --project-ref <REFERENCIA_DEL_PROYECTO>
```

```powershell
npx supabase db dump -f respaldo_esquema_antes_1500.sql
```

```powershell
npx supabase db dump --data-only -f respaldo_datos_antes_1500.sql
```

`<REFERENCIA_DEL_PROYECTO>` es el identificador que aparece en la URL del panel de Supabase. Guarda los dos archivos
junto a los CSV y **no los subas a GitHub**: contienen datos.

## 3. Aplicar la migración (5 min)

Usa el **SQL Editor**.

> **No uses `supabase db push`** si las migraciones anteriores se aplicaron desde el editor. La CLI intentaría
> aplicar de nuevo todas las migraciones desde la 0100.

1. **SQL Editor → New query.**
2. Escribe `begin;` en la primera línea.
3. Pega **el contenido completo** del archivo de la migración, desde la pestaña Raw.
4. Escribe `commit;` en la última línea.
5. Pulsa **Run**.

**Resultado esperado:** «Success. No rows returned». Puede aparecer un aviso (NOTICE) sobre pg_cron; no es un error.

**Si aparece un error en rojo:**

1. No vuelvas a ejecutar el mismo texto.
2. Ejecuta `rollback;` en una consulta nueva.
3. Copia el mensaje y busca la causa en la tabla del apartado 5.

Como todo va dentro de `begin … commit`, un error deja la base como estaba.

## 4. Verificar (10 min)

Ejecuta cada bloque en **SQL Editor** y compara con el resultado esperado.

**4.1 Modelos.** Deben aparecer `regla-respaldo` (inactivo, umbral 0.500) y `v1` (activo, 0.226).

```sql
select version, activo, umbral from public.modelos_ml order by version;
```

**4.2 Predicciones existentes intactas.** `total` debe ser igual al conteo del paso 2.1. `respaldo` y
`sin_probabilidad` deben dar 0.

```sql
select count(*) as total,
       count(*) filter (where origen = 'regla_respaldo') as respaldo,
       count(*) filter (where probabilidad is null) as sin_probabilidad
from public.predicciones_morosidad;
```

**4.3 Funciones nuevas.** Deben aparecer 9 nombres:

- `calcular_riesgo_periodo`
- `estado_prediccion`
- `ml_calcular`
- `ml_entrada_valida`
- `ml_evaluar`
- `probar_entrada_modelo`
- `registrar_recordatorio`
- `restaurar_demo_datos_base`
- `simular_falla_modelo`

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('calcular_riesgo_periodo', 'probar_entrada_modelo', 'registrar_recordatorio', 'simular_falla_modelo',
                  'estado_prediccion', 'ml_evaluar', 'ml_entrada_valida', 'ml_calcular', 'restaurar_demo_datos_base')
order by proname;
```

**4.4 Tablas nuevas con RLS.** Deben aparecer 3 filas, todas con `relrowsecurity = true`.

```sql
select relname, relrowsecurity from pg_class
where relname in ('registro_predicciones', 'recordatorios', 'demo_ajustes') and relnamespace = 'public'::regnamespace;
```

**4.5 El modelo responde igual que en Python.** Es una consulta de solo lectura. Debe dar `origen` = `modelo`,
`probabilidad` = 0.4503 y `nivel_riesgo` = `alto`.

```sql
select public.ml_evaluar((select parametros from public.modelos_ml where version = 'v1'),
  '{"pagos_atrasados_previos": 2, "atrasos_previos_total": 5, "tasa_atraso_previa": 0.4167, "dias_atraso_promedio_previo": 4.5}'::jsonb);
```

**4.6 Respaldo ante entrada inválida.** Es una consulta de solo lectura. Debe dar `origen` = `regla_respaldo`,
`motivo_respaldo` = `entrada_fuera_de_rango` y `nivel_riesgo` = `medio`.

```sql
select public.ml_evaluar((select parametros from public.modelos_ml where version = 'v1'),
  '{"pagos_atrasados_previos": 2, "atrasos_previos_total": 5, "tasa_atraso_previa": 1.4, "dias_atraso_promedio_previo": 4.5}'::jsonb);
```

**4.7 Tareas programadas (pg_cron).** Deben aparecer `arcomunity-restaurar-demo` y
`arcomunity-purgar-registro-predicciones` (`30 8 1 * *`), ambas activas.

```sql
select jobname, schedule, active from cron.job where jobname like 'arcomunity-%';
```

**4.8 La aplicación publicada (versión anterior) sigue funcionando.**

1. Entra con `admin@arcomunity.demo`.
2. Abre Resumen, Cuotas, Conciliación y Predicción de morosidad. Ninguna pantalla debe mostrar un error.
3. Entra con `casa12@arcomunity.demo`. Debe ver su cuota por pagar y no tener acceso a Predicción.

Si todo coincide, la migración quedó bien aplicada. Avísame para el siguiente paso: integrar los PR, publicar el
frontend nuevo, grabar el video oficial y tomar las capturas de producción.

## 5. Problemas posibles

| Mensaje o síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `column "origen" of relation "predicciones_morosidad" already exists` | La migración ya se había aplicado, entera o en parte | `rollback;`. No reintentes; ejecuta la verificación 4.3 para saber qué existe |
| `function "restaurar_demo_datos_base" already exists` | Igual que la fila anterior | Igual que la fila anterior |
| `permission denied for schema cron` o un NOTICE «No se pudo programar la purga» | El proyecto no permite programar pg_cron desde el editor | No es grave: la migración sí se aplicó. La purga se programa después desde Database → Cron |
| `syntax error at or near …` en la primera línea | Se pegó solo una parte del archivo o con caracteres extra | `rollback;` y volver a copiar el archivo completo desde la vista Raw |
| La verificación 4.2 muestra un total distinto al de 2.1 | Alguien calculó el riesgo durante la migración, o falló la copia | Revisar la auditoría; si se perdieron filas, usar el retorno |
| La verificación 4.5 da otra probabilidad | Los parámetros del v1 no son los esperados | No publicar el frontend; revisar `modelos_ml.parametros` |
| La app anterior muestra «< 1 %» con riesgo alto | Hay filas de la regla de respaldo (solo ocurre si el modelo falla) | Es esperable hasta publicar el frontend del PR #38, que muestra «Regla manual» |
| Un propietario ve predicciones o la bitácora | Falla de permisos (no ocurrió en las pruebas) | **Retorno inmediato** (apartado 6) |

## 6. Cuándo usar el retorno

**Úsalo si ocurre cualquiera de estas situaciones:**

- Una verificación central falla (4.1, 4.2, 4.3, 4.4 o 4.5) y no se resuelve en unos 15 minutos.
- Un flujo anterior se rompe después de la migración: inicio de sesión, pagos, conciliación o cuotas.
- Un propietario puede ver datos de predicción o de la bitácora.

**No hace falta para:**

- Que pg_cron no haya programado la purga: se programa aparte.
- Detalles visuales de la versión anterior del frontend.

**Cómo revertir:**

1. Si el frontend nuevo ya estaba publicado, vuelve a publicar la versión anterior: la de `main` sin el PR #38.
2. Exporta a CSV `registro_predicciones` y `recordatorios`. El retorno los elimina.
3. En **SQL Editor**, pega el archivo completo
   `supabase/rollback/20261126001500_revertir_flujo_prediccion_e2e.sql`. Ya trae `begin` y `commit`. Pulsa **Run**.
4. Comprueba el retorno:
   - `select count(*) from information_schema.tables where table_name = 'registro_predicciones';` debe dar 0;
   - la verificación 4.1 ya no debe mostrar `regla-respaldo`;
   - la app anterior debe funcionar como en el paso 4.8.

El retorno está probado en PGlite. Después de aplicar, usar y revertir, el esquema queda idéntico al de la migración
1400 (`supabase/tests/retorno-migracion-1500.test.ts`).
