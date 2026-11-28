# Regla del ciclo de mejora del PROY (registrada ANTES de experimentar)

**Fecha:** 26/11/2026. Este archivo se confirma en Git antes de escribir o ejecutar el código del experimento. Así, ni
la regla ni el espacio de búsqueda pueden ajustarse a los resultados (recomendación O13 del reporte de APF3).

## 1. Punto de partida

- **APF3 entregado:** regresión logística v1 (`C = 10`, sin pesos de clase, umbral 0,2258). Métricas de prueba
  publicadas:
  - recall 0,846;
  - precisión 0,611;
  - F1 0,710.

  Se usan **como referencia** y no se recalculan.
- **APF3 corregido:** mismo algoritmo y mismas cuatro variables, con dos correcciones del Paso 2a.
  - Desempate determinista en la búsqueda interna. La AP se redondea a 6 decimales. Entre configuraciones empatadas,
    gana la más simple: primero sin pesos de clase, después el `C` menor.
  - Huella del dataset calculada sobre el contenido con fin de línea LF.

## 2. Datos, partición y preprocesamiento (idénticos para todos los modelos)

- Dataset: `ml/dataset_apf3/dataset_arcomunity_apf3.csv`, sin modificar (359 cuotas simuladas).
- Partición temporal de APF3:

  | Conjunto | Meses | Cuotas |
  | --- | --- | --- |
  | Entrenamiento | 1–9 | 270 |
  | Validación | 10 | 30 |
  | Prueba | 11–12 | 59 |

- Preprocesamiento: `Pipeline` con `ColumnTransformer` y `StandardScaler`, ajustado solo con los datos de cada pliegue.
- `random_state = 42` en todo.
- Variables calculadas al día 1 del mes de la cuota, solo con cuotas anteriores. Las columnas de desenlace siguen
  prohibidas (`fecha_pago`, `dias_atraso`, `metodo_pago`, `moroso`).

## 3. Líneas de mejora y espacio de búsqueda

| Modelo | Línea de la consigna (Paso 2b) | Variables | Espacio de búsqueda |
| --- | --- | --- | --- |
| APF3 corregido | — (referencia) | Las 4 de v1 | `C` ∈ {0,01; 0,1; 1; 10}, `class_weight` ∈ {None, balanced} |
| PROY-A · recencia | (a) nuevas variables justificadas por el negocio | Las 4 de v1 + `atraso_mes_anterior` + `meses_desde_ultimo_atraso` | El mismo de APF3 |
| PROY-B · reajuste | (b) reajuste de hiperparámetros; (e) desbalance mediante `class_weight` | Las 4 de v1 | `C` ∈ {0,001; 0,01; 0,1; 1; 10; 100; 1000}, `class_weight` ∈ {None, balanced} |
| PROY-C · recencia + reajuste | (a) + (b) | Las 6 | El de PROY-B |

**Variables nuevas** (misma semántica de «cuota previa atrasada» que `caracteristicas.py`):

- `atraso_mes_anterior`: 1 si la cuota del mes inmediatamente anterior estaba atrasada al corte; 0 en otro caso, o si
  no hay cuota previa.
- `meses_desde_ultimo_atraso`: meses entre el periodo de la cuota y el periodo de la última cuota previa atrasada. Vale
  12 si no hubo atrasos previos y se limita a 12.

**Justificación de negocio.** La administración prioriza a quien se atrasó recientemente. En v1, la variable de atrasos
de los últimos 3 meses tiene coeficiente negativo (−1,87), un artefacto conocido de la semilla. Las variables de recencia
prueban si el historial reciente aporta señal sin esa contradicción.

**Umbral (igual para todos los candidatos).** Es el mayor umbral que logra recall ≥ 0,80 en las predicciones internas
fuera de muestra. La optimización del umbral por costo de errores (línea d) se reporta solo como **análisis de
sensibilidad** del modelo final, con las razones FN:FP de 2, 5 y 10. No interviene en la selección.

## 4. Protocolo de selección (sin la prueba)

1. **Evaluación anidada de origen móvil.** Es el mismo protocolo de la reevaluación de APF3 (meses externos 5 a 10;
   180 predicciones; búsqueda e umbral internos). Se aplica a:
   - las tres líneas base (dummy mayoritario, dummy estratificado y regla «atraso en 3 meses previos»);
   - APF3 corregido;
   - PROY-A, PROY-B y PROY-C.
2. **Auditoría previa.** Un modelo con F1 ≥ 0,95, o con recall = 1 y precisión = 1, se investiga antes de poder ser
   elegido.
3. **Elegibilidad.** Recall agregado ≥ 0,80 y F1 agregado mayor que el de la regla manual.
4. **Mejor candidato PROY:** el elegible de PROY-A, PROY-B o PROY-C con mayor F1 agregado. En caso de empate en F1 (a
   3 decimales), gana el que tenga menos variables y luego la búsqueda más pequeña.
5. **Criterio de reemplazo.** El mejor candidato PROY reemplaza a APF3 corregido solo si se cumplen las dos condiciones:
   - su F1 agregado es mayor;
   - el intervalo de confianza al 95 % de la diferencia de F1 excluye el 0. El intervalo se calcula con un bootstrap
     pareado de 2000 remuestreos de las 180 cuotas, con semilla 42.

   Si no se cumple, **se conserva APF3 corregido** (v1) como modelo servido. Se reportan los deltas y las causas.
6. **Validación del protocolo de APF3** (como información). Para cada modelo se reportan también:
   - el ajuste en los meses 1–9 con validación cruzada temporal;
   - el umbral fuera de muestra;
   - las métricas en el mes 10.
7. **Antes de evaluar la prueba**, la decisión se escribe en `ml/proy/resultados/decision.json` y se confirma en Git.

## 5. Uso de la prueba (meses 11–12)

- Se evalúa **una sola vez** con `evaluar_prueba.py`, después del commit de la decisión. Se evalúan:
  - las líneas base;
  - APF3 corregido;
  - PROY-A, PROY-B y PROY-C.

  Todos se entrenan con los meses 1–10 y usan su umbral interno.
- El script se niega a ejecutarse si ya existe `ml/proy/resultados/prueba/`.
- El resultado de la prueba **no cambia la decisión**.
- Se declara que los meses 11–12 ya se observaron en APF3 con v1. Por eso, la prueba no es una estimación virgen para
  v1, pero sí lo es para los modelos PROY.

## 6. Modelo servido

- Si se conserva v1, la base de datos sigue con `v1`. No se crea una versión nueva sin cambio real.
- Si un modelo PROY reemplaza a v1, se cumple todo lo siguiente:
  - se exporta con su preprocesamiento (`joblib`) y sus metadatos;
  - se generan los esquemas JSON de entrada y salida;
  - se generan los parámetros para SQL y la paridad Python ↔ SQL;
  - se activa en Supabase solo con autorización.

## 7. Robustez (observación O7)

Tanto v1 como el modelo final, ya entrenados, predicen un escenario simulado de junta «difusa». El escenario se guarda
en un archivo separado, rotulado `origen = simulado` y `escenario = difuso`, con semilla fija. Solo se usa para reportar
la sensibilidad. No entrena, no elige y no ajusta el umbral.
