# Modelo de riesgo de morosidad — APF3 (Arcomunity)

Clasificación binaria por cuota: ¿se pagará con atraso (`moroso = 1`)? La predicción se hace el **día 1 del
periodo**, antes del vencimiento (día 10), para que la administración priorice recordatorios.
Datos: `../dataset_apf3/dataset_arcomunity_apf3.csv` (359 cuotas **simuladas**, sin modificar; SHA-256
`12bfe4d0…71dfa`).

## Ejecutar y verificar

```bash
pip install -r requirements.txt
jupyter nbconvert --to notebook --execute --inplace APF3_TD_Grupo6_ML_Innovacion.ipynb   # o abrirlo y ejecutar todo
python inferencia.py ejemplo_entrada.json        # predicción sobre registros con el esquema del MVP
python exportar_parametros.py                    # parámetros para calcular el modelo en SQL (con prueba de paridad)
python evidencia_integracion.py                  # llamada real con datos de Supabase (solo lectura; requiere ../../.env.local)
```

En Google Colab: abrir el notebook desde GitHub y *Ejecutar todas*; la primera celda clona el repositorio
(rama indicada en `RAMA`) e instala `requirements.txt`. Semilla fija: 42.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `APF3_TD_Grupo6_ML_Innovacion.ipynb` | Notebook comentado por bloques, ejecutado (salidas incluidas). |
| `caracteristicas.py` | Variables al corte, sin fuga; misma semántica que `ml_caracteristicas_cuotas` en Supabase. |
| `inferencia.py` | Carga el modelo y predice uno o varios registros (valida el contrato y rechaza campos de fuga). |
| `exportar_parametros.py` | Exporta medias, escalas, coeficientes e intercepto y verifica paridad con scikit-learn. |
| `evidencia_integracion.py` | Anexo C: obtiene variables reales de Supabase y llama al modelo exportado. |
| `contrato_integracion.json`, `ejemplo_entrada.json` | Contrato JSON de entrada/salida y ejemplo. |
| `modelo/` | `modelo_morosidad_v1.joblib` (pipeline completo), metadatos `.json`, `parametros_sql_v1.json`. |
| `resultados/` | Métricas (CSV), matriz de confusión, EDA, importancia, errores, simulación **HIPOTÉTICA**, evidencia. |

## Protocolo (fijado antes de evaluar en prueba)

1. Validaciones de coherencia del CSV (14 reglas con `assert`).
2. Variables al corte: `pagos_atrasados_previos`, `atrasos_previos_total`, `tasa_atraso_previa`,
   `dias_atraso_promedio_previo`. Excluidas: `fecha_pago`, `dias_atraso`, `metodo_pago` (desenlace),
   `unidad_ref` (identificador), `monto`/`es_simulado`/`origen` (constantes), `mes`/`cuotas_previas` (reloj),
   `metodo_pago_ultimo` (en la semilla se asigna por número de unidad).
3. Pruebas de no fuga: el campo del contrato se recalcula igual; alterar el futuro no cambia el pasado; cada
   cuota no usa su propio desenlace.
4. Partición temporal 270 / 30 / 59 (meses 1–9 / 10 / 11–12). Ajuste con `GridSearchCV` y validación cruzada
   temporal dentro de entrenamiento (predecir el mes k con los meses < k, k = 5…9), métrica `average_precision`.
5. Umbral: mayor umbral con recall ≥ 0,80 en las predicciones fuera de muestra de esa validación cruzada.
6. Selección (regla previa): recall ≥ 0,80 en validación y mayor F1; empate (< 0,02) → modelo más interpretable.
7. Reentrenar con meses 1–10 y evaluar **una vez** en prueba.

## Resultados obtenidos (ejecución del 18/11/2026)

Hiperparámetros elegidos: regresión logística `C = 10`, sin pesos de clase; árbol `max_depth = 3`,
`min_samples_leaf = 10`. Umbral de la logística: **0,226**.

| Modelo | Validación recall / F1 | Prueba accuracy | Prueba precision | Prueba recall | Prueba F1 |
| --- | --- | --- | --- | --- | --- |
| Dummy (clase mayoritaria) | 0,00 / 0,00 | 0,780 | 0,000 | 0,000 | 0,000 |
| Dummy (estratificado) | 0,17 / 0,20 | 0,644 | 0,167 | 0,154 | 0,160 |
| Regla: atraso en 3 meses previos | 0,83 / 0,63 | 0,746 | 0,450 | 0,692 | 0,545 |
| **Regresión logística ★** | 1,00 / 0,857 | 0,847 | 0,611 | **0,846** | 0,710 |
| Árbol de decisión | 1,00 / 0,857 | 0,881 | 0,688 | 0,846 | 0,759 |

- Matriz de confusión en prueba (logística): VP 11, FN 2, FP 7, VN 39. Meta de recall 0,80: **cumplida** en prueba.
- La logística y el árbol empataron en validación; se eligió la logística por la regla previa (interpretabilidad).
  En prueba el árbol obtuvo mejor F1 con el mismo recall: se reporta tal cual, sin cambiar la selección.
- Control de sobreajuste (F1): entrenamiento 0,748, CV temporal 0,806, validación 0,857 (sin brecha a favor de
  entrenamiento).
- Importancia por permutación: `atrasos_previos_total` 0,37 · `tasa_atraso_previa` 0,37 ·
  `dias_atraso_promedio_previo` 0,18 · `pagos_atrasados_previos` 0,06. Las cuatro variables están muy
  correlacionadas (0,82–0,93): los coeficientes individuales no se interpretan aislados.
- Variables auditadas (AP en CV temporal): principal 0,826 · + método del último pago 0,812 · + mes y cuotas
  previas 0,810 → no aportan; se mantienen fuera.

## Auditoría de la simulación (hallazgo principal)

La semilla del MVP es determinista: 5 unidades crónicas (90 % de morosidad, 72 % de todas las morosas), 9 con
atrasos ocasionales (19 %) y 16 puntuales (0 %). El historial identifica muy bien a las crónicas; los atrasos
ocasionales siguen una regla aritmética no observable y generan los errores (2 FN de unidades ocasionales,
5 de 7 FP también ocasionales). Las métricas **describen la semilla, no a vecinos reales**: son indicativas y no
generalizables. Propuesta (no aplicada para no alterar el dataset entregado): una segunda versión de la semilla
con probabilidades por perfil y ruido calibrado con registros reales de la junta, rotulada como otra versión.

## Simulación de impacto (HIPOTÉTICA)

`resultados/simulacion_impacto_HIPOTETICA.*`. Combina lo **medido** (el modelo avisa a 11 de las 13 morosas de
prueba con 18 recordatorios) con un **supuesto no medido** de efectividad de los recordatorios (10 %, 20 %,
30 %). Con esos supuestos, las morosas esperadas bajarían de 13 a 11,9 / 10,8 / 9,7 (8,5 % / 16,9 % / 25,4 %).
Recordar a todos (59 recordatorios) daría 10 % / 20 % / 30 %, con 2,8 veces más recordatorios por morosa
evitada. **Ninguna reducción de morosidad está demostrada**: requiere un piloto real (p. ej., A/B).

## Integración con Arcomunity

| Pieza | Estado |
| --- | --- |
| Entrada: `ml_caracteristicas_cuotas` (Supabase) | Existe en producción. Coincide con el entrenamiento: 29 cuotas comparadas, 0 diferencias. |
| Modelo exportado + inferencia sobre registro nuevo | Hecho (`inferencia.py`, `ejemplo_entrada.json`). |
| Llamada real con datos del MVP | Hecho, solo lectura (`resultados/evidencia_integracion.json`: 30 cuotas, 9 en riesgo alto al 01/11/2026). |
| Guardar predicciones (`predicciones_morosidad`) y registrar el modelo (`modelos_ml`) | Pendiente. Requiere autorización: escribe en producción. |
| Pantalla «Predicción de morosidad» | Existe y lee `predicciones_vigentes`; mostrará resultados reales cuando haya un modelo activo y predicciones. |

Ruta recomendada (sin infraestructura nueva): como el modelo es una regresión logística, la predicción es una
fórmula. `modelo/parametros_sql_v1.json` reproduce scikit-learn con diferencia máxima de 3,3e-16 en las
359 cuotas, así que una función SQL en Supabase puede calcularla, guardar en `predicciones_morosidad` y alimentar
la pantalla. Alternativa: servicio Python (FastAPI) con el `.joblib`, que necesitaría un hosting adicional.

## Transparencia metodológica

- Durante una exploración inicial (antes de construir el notebook) se imprimieron métricas de prueba de modelos
  preliminares sin ajustar. Las variables, la grilla, la regla de umbral y la regla de selección ya estaban
  definidas y no se cambiaron por esos números; aun así se declara.
- Todo es simulado (`origen = simulado`); no hay datos personales (unidad seudonimizada con SHA-256).
- El dataset tiene 359 filas y no 360: se excluye la cuota con pago en revisión (ver `../dataset_apf3/validacion_dataset.md`).
