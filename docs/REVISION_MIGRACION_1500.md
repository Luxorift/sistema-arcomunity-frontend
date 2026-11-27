# Revisión técnica de la migración 1500 (PROY)

**Migración:** `supabase/migrations/20261126001500_flujo_prediccion_e2e.sql` (PR #38).
**Retorno:** `supabase/rollback/20261126001500_revertir_flujo_prediccion_e2e.sql`.
**Procedimiento de aplicación:** [GUIA_MIGRACION_1500.md](GUIA_MIGRACION_1500.md).

**Estado al 27/11/2026:** no aplicada en el Supabase de producción. Está probada en dos lugares:

- PGlite (PostgreSQL 18.6 en WebAssembly): `npm test`, 151 de 151.
- El entorno local de navegador: `npm run local:supabase` y `npm run local:web`.

## 1. Seguridad y compatibilidad

| Aspecto | Veredicto | Evidencia |
| --- | --- | --- |
| ¿Destruye datos? | No. Agrega columnas con valor por defecto, tres tablas, un índice único, funciones y una fila `regla-respaldo` inactiva | Lectura de la migración; comprobación previa de duplicados en la guía |
| Permisos | Todas las funciones nuevas usan `search_path = ''`. Se revocan a `public` y `anon`; las internas (`ml_evaluar`, `ml_calcular`, `ml_entrada_valida`, `purgar…`, `restaurar…`), también a `authenticated` | `supabase/tests/flujo-prediccion-e2e.test.ts` |
| RLS | `registro_predicciones` y `recordatorios`: solo lectura, y solo para la administración de la junta. `demo_ajustes`: sin acceso desde la API | Pruebas PGlite y navegador (el propietario ve 0 filas) |
| Inmutabilidad | La bitácora bloquea UPDATE y DELETE; solo el mantenimiento borra, para la purga de 12 meses | Prueba PGlite |
| Retrocompatibilidad | `calcular_riesgo_morosidad` mantiene su firma y sus permisos; `predicciones_vigentes` solo agrega columnas; `restaurar_demo_datos` conserva su nombre como envoltorio. Los scripts remotos siguen siendo compatibles | 75 pruebas previas aprobadas |
| Retorno | Aplicar, usar, revertir y comparar con la 1400 deja iguales las funciones, los permisos, las columnas, las restricciones, los disparadores y las políticas | `supabase/tests/retorno-migracion-1500.test.ts` |
| Secretos | Ninguno en los diffs; sin archivos `.env` ni rutas personales | Escaneo del diff |

## 2. Auditoría del tiempo límite de 8 s (27/11/2026)

El cliente deja de esperar a los 8 s, pero el servidor puede terminar el cálculo después. Las pruebas de
`supabase/tests/respuesta-tardia.test.ts` **fallaban antes de la corrección**: el problema era real.

| Verificación | Hallazgo | Corrección |
| --- | --- | --- |
| Predicciones contradictorias | Podían quedar vigentes a la vez una fila del modelo y otra de la regla para la misma cuota y corte | Índice único `predicciones_una_por_cuota_y_corte`. El último cálculo reemplaza la fila y conserva su id y el vínculo del recordatorio |
| Duplicados por reintentos | No había filas vigentes duplicadas (upsert) | Ahora lo garantiza la base. En el navegador, 3 reintentos simultáneos dejaron 30 filas, una por cuota |
| Respuesta tardía que pisa a otra | Dos cálculos de la misma junta podían ejecutarse a la vez | `pg_advisory_xact_lock` por junta: los cálculos se ejecutan de a uno y el último manda |
| Estado final en pantalla | Tras el aviso, la lista quedaba con el estado anterior y llevaba a reintentar | Recarga a los 10 y 25 s, y mensaje «no hace falta volver a pulsar». En el navegador: aviso a los 8 042 ms y 30 filas visibles a los 27 s |
| Bitácora | No distinguía los reintentos ni las respuestas tardías | Columnas `lote`, `solicitado_en` y `demora_ms`; respuesta tardía = `demora_ms > 8000` (probado con `pg_sleep(8.2)`) |

**Consulta para revisar la bitácora por lote:**

```sql
select lote, origen, count(*) as cuotas, min(solicitado_en) as solicitado, max(registrado_en) as registrado,
       max(demora_ms) > 8000 as tardio
from public.registro_predicciones where tipo = 'cuota'
group by lote, origen order by min(solicitado_en) desc;
```

## 3. Riesgos que quedan

| Id | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | La vista previa de Vercel del PR #38 usa la base de producción, que aún no tiene la 1500: ahí fallan las funciones nuevas | No usarla para la demo hasta aplicar la migración |
| R2 | `calcular_riesgo_morosidad` ya no falla si falta el modelo; aplica la regla de respaldo | Cambio deseado; ningún script dependía del error |
| R3 | El frontend anterior mostraría «< 1 %» en una fila de respaldo | Publicar el frontend nuevo justo después de la migración |
| R4 | `probar_entrada_modelo` escribe en la bitácora en cada prueba | Solo lo usa la administración; conservación de 12 meses |
| R5 | Concurrencia entre conexiones independientes | **Validada en PostgreSQL 16.16 real** (apartado 5); en Supabase solo queda la observación en uso |
| R6 | pg_cron no existe en PGlite ni en el PostgreSQL local | Verificación 4.7 de la guía, en Supabase (pendiente) |
| R7 | El retorno elimina la bitácora, los recordatorios y las predicciones de respaldo | Exportar a CSV antes (guía, apartado 6) |

No se encontraron fallas de seguridad que bloqueen la aplicación.

## 4. Validación en el navegador (entorno local, no producción)

| Caso | Resultado |
| --- | --- |
| Generar las cuotas de diciembre dispara la predicción | Pasó: 30 cuotas (12 alto, 0 medio y 18 bajo) |
| Probabilidad, «Por qué» y acción sugerida por cuota | Pasó |
| Registrar un recordatorio | Pasó: visible y auditado |
| Falla simulada → regla de respaldo, sin probabilidad | Pasó |
| Entrada inválida rechazada; caso válido de 45 % (igual a `inferencia.py`) | Pasó |
| El propietario no accede a predicciones, bitácora ni recordatorios | Pasó |
| Móvil (375 px) | Pasó, tras ajustar el margen del formulario |
| Tiempo límite (8 099 ms y 8 043 ms) y respuesta tardía con recarga sola | Pasó |

Las capturas y el video están en la carpeta del equipo (`Proyecto_Final/evidencias_proy`), fuera del repositorio,
porque son evidencias del entorno local y no de producción.

## 5. Validación en PostgreSQL 16.16 real (27/11/2026)

**Entorno:** un clúster temporal local en `localhost:55432`, independiente de cualquier base del equipo.

**Datos:** las migraciones 0100–1400 más una junta demo con predicciones del v1, que simulan la producción actual.

**Aplicación:** la migración 1500 se aplicó **exactamente** como indica la guía, con `begin` + el archivo del PR #38
+ `commit`.

| Prueba | Resultado |
| --- | --- |
| Bloques SQL de la guía (comprobaciones previas, conteos, 4.1 a 4.6) | Todos coinciden con lo esperado; 4.7 (pg_cron) no aplica en local |
| Dos conexiones simultáneas: la segunda espera el bloqueo de la junta (~3 s) | Pasó |
| Respuesta tardía (9 s) frente a un respaldo intermedio: sin contradicciones; el resultado final refleja el estado al ejecutarse; la bitácora la marca como tardía (9 042 ms) | Pasó |
| Seis solicitudes simultáneas sin bloqueos mutuos ni errores | Pasó |
| El índice único rechaza una segunda fila desde otra conexión, aun sin pasar por la función | Pasó |
| El recordatorio conserva el vínculo con la predicción vigente tras recalcular | Pasó |
| RLS y permisos: propietario y anónimo sin acceso; la administración lee pero no edita la bitácora; el disparador la protege incluso del dueño | Pasó |
| Compatibilidad con el frontend publicado: `predicciones_vigentes`, `calcular_riesgo_morosidad(p_junta)`, preparar y reiniciar la demostración | Pasó |
| Purga de 12 meses (la función) | Pasó |
| Retorno sobre una copia con datos: esquema idéntico al de la 1400 (`pg_dump`, 2 271 líneas) y la 1500 se puede volver a aplicar | Pasó |

**Total:** 23 de 23 comprobaciones de concurrencia, permisos y compatibilidad, más la guía y el retorno.

**Hallazgo de procedimiento:** al aplicar con `psql` en Windows sin `PGCLIENTENCODING=UTF8`, las tildes de los mensajes
se dañan. Ya está documentado en la guía. El SQL Editor de Supabase no tiene este problema.

Las salidas completas y los scripts están en la carpeta del equipo: `evidencias_proy/postgresql_real_2026-11-27`.
