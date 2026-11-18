# Evidencias para el informe APF3 (secciones 3, 4.1, 4.2, 5 y Anexo C)

Capturas definitivas tomadas el 18/11/2026 en la versión publicada (https://sistema-arcomunity-frontend.vercel.app, `main` 024b4d7) con la base Supabase del MVP (junta de demostración, datos simulados). Pantalla = PostgreSQL en 30/30 filas; PostgreSQL = Python en 30/30 cuotas.
Regenerar capturas: `npm run evidencias:ml` (luego `npm run demo:restaurar`).

**Distinción obligatoria:** las métricas de **validación** (meses 1–10) y las de **prueba** (meses 11–12, una sola
evaluación del modelo v1) no se mezclan.

| Sección | Evidencia | Archivo |
| --- | --- | --- |
| 3.1–3.2 | Comparación de 7 algoritmos + líneas base (validación anidada, 180 cuotas) | `../comparacion/metricas_validacion_anidada.csv`, `../comparacion/comparacion_algoritmos.png`, `../comparacion/RESULTADOS.md` |
| 3.2 | Regla de selección registrada antes de comparar (commit `076fde7`) | `../comparacion/REGLA_DE_SELECCION.md`, `../comparacion/aplicacion_de_la_regla.csv` |
| 3.3 | Hiperparámetros elegidos por pliegue | `../comparacion/hiperparametros_por_pliegue.csv` |
| 3.4 | Estabilidad por mes, sensibilidad y auditoría de monotonía | `../comparacion/estabilidad_por_mes.png`, `../comparacion/AUDITORIA_MONOTONIA.md` |
| 3.5 | Modelo exportado, metadatos y parámetros SQL (paridad 115 casos) | `../modelo/` |
| 4.1 | Métricas de **prueba** y matriz de confusión | `../resultados/metricas_prueba.csv`, `../resultados/matriz_confusion_prueba.png` |
| 4.2 | Casos mal clasificados con hipótesis | `../resultados/errores_prueba.csv` |
| 5.1 | Contrato JSON de entrada y salida | `../contrato_integracion.json`, `../ejemplo_entrada.json` |
| 5.2 | Llamadas reales: Python con datos de Supabase y PostgreSQL vs. Python (30/30) | `../resultados/evidencia_integracion.json` (corte 01/11), `../resultados/evidencia_integracion_corte_2026-11-18.json` |
| 5.2 | Pantalla vs. base de datos (30/30 filas) | `tabla_prediccion_mostrada.json` |
| Anexo C | Capturas del flujo | `01_cuotas_mes_siguiente.png`, `02_prediccion_antes_de_calcular.png`, `03a_prediccion_al_calcular.png`, `03_prediccion_resultados_escritorio.png`, `04_prediccion_celular.png`, `05_propietario_sin_acceso.png` |

**Sobre PostgreSQL:** la base de datos **no ejecuta el archivo joblib**. Reproduce matemáticamente el modelo
entrenado en Python: aplica la misma fórmula de la regresión logística (escalado, coeficientes e intercepto
exportados). La equivalencia se prueba con 115 casos (diferencia < 1e-9) y con las llamadas reales (30/30).
