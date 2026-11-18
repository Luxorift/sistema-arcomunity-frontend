# Reevaluación de algoritmos — resultados y decisión

Regla registrada antes de ejecutar: [`REGLA_DE_SELECCION.md`](REGLA_DE_SELECCION.md) (commit `076fde7`).
Reproducir: `python comparacion.py` (≈ 1 min, semilla 42) o la sección 13 del notebook.

**Datos usados:** solo meses 1–10 (300 cuotas). Evaluación anidada con origen móvil: cada mes 5–10 se predice
con un modelo entrenado en los meses anteriores, con hiperparámetros y umbral elegidos dentro de esos meses
(180 predicciones externas, 37 morosas). **La prueba (meses 11–12) no se usó.** Estas cifras son evidencia de
validación, no una nueva prueba.

## Métricas de validación anidada (180 cuotas, meses 5–10)

| Modelo | Recall | Precision | F1 | FN | FP | Recordatorios | AP | Desv. F1 por mes | Brecha (F1 ent. − ext.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dummy (clase mayoritaria) | 0,000 | 0,000 | 0,000 | 37 | 0 | 0 | — | — | — |
| Dummy (estratificado) | 0,135 | 0,172 | 0,152 | 32 | 24 | 29 | — | — | — |
| Regla: atraso en 3 meses previos | 0,757 | 0,475 | 0,583 | 9 | 31 | 59 | — | 0,034 | — |
| **Regresión logística (v1)** | **0,973** | 0,562 | 0,713 | **1** | 28 | 64 | 0,837 | 0,202 | −0,068 |
| SVM lineal | 0,973 | 0,424 | 0,590 | 1 | 49 | 85 | 0,832 | 0,248 | 0,025 |
| SVM RBF | 0,892 | 0,611 | **0,725** | 4 | 21 | 54 | 0,881 | 0,127 | −0,029 |
| KNN | 0,865 | 0,356 | 0,504 | 5 | 58 | 90 | 0,851 | 0,201 | 0,103 |
| Árbol de decisión | 0,784 | 0,527 | 0,630 | 8 | 26 | 55 | 0,737 | 0,202 | 0,047 |
| AdaBoost | 0,757 | 0,538 | 0,629 | 9 | 24 | 52 | 0,765 | 0,153 | 0,032 |
| Gradient Boosting | 0,784 | 0,483 | 0,598 | 8 | 31 | 60 | 0,775 | 0,217 | 0,075 |

Hiperparámetros elegidos dentro de cada pliegue (`hiperparametros_por_pliegue.csv`): logística `C = 10` en los
6 pliegues (igual que el v1); SVM RBF `C = 1`; árbol profundidad 2–3 con hojas de 5; AdaBoost 100–200 tocones.
Ningún modelo se acerca a métricas perfectas (no se activó la auditoría del punto 1).

## Aplicación de la regla

1. **Elegibles** (recall ≥ 0,80 y F1 > regla de negocio 0,583): SVM RBF, regresión logística y SVM lineal.
   Árbol, AdaBoost y Gradient Boosting quedan fuera por recall < 0,80; KNN por F1 menor que la regla.
2. **Mejor F1:** SVM RBF (0,725).
3. **Empate práctico** (bootstrap pareado, 2000 remuestreos): logística −0,012 (IC 95 % −0,087 a +0,111) →
   empatada. SVM lineal queda descartada (IC 0,037 a 0,235).
4. **Desempate:** (i) brecha de sobreajuste: logística −0,068 frente a −0,029 → **gana la logística**. Para la
   transparencia: (ii) la variabilidad entre meses favorecería a SVM RBF (0,127 frente a 0,202); (iii) la
   explicabilidad y (iv) la integración favorecen a la logística.
5. **Cambio de modelo:** no corresponde. El candidato con mejor F1 empata con el v1 y además requeriría un
   servicio Python (sin probabilidad calibrada en `SVC`).

**Recomendación: conservar la regresión logística v1** (pipeline, umbral 0,226 y métricas de prueba ya
reportadas, sin cambios).

## Por qué es la mejor opción para Arcomunity

- **Costo del error:** deja 1 cuota morosa sin aviso en seis meses de validación frente a 4 de SVM RBF y 8–9 de
  árbol y boosting. El falso negativo es el error más costoso (S13: «omitir un moroso cuesta más que una falsa
  alarma»).
- **Recordatorios:** 64 en seis meses (≈ 10,7 al mes para 30 unidades) frente a 54 de SVM RBF; la diferencia
  (≈ 1,7 al mes) es el precio de no dejar morosas sin aviso.
- **Explicabilidad:** cada predicción se descompone en aportes de variables del historial (S14: el comité debe
  poder revisar la alerta). SVM RBF, KNN y boosting no ofrecen esa lectura directa.
- **Integración segura:** la fórmula ya se reproduce en PostgreSQL con diferencia máxima de 3,3e-16; no hace
  falta un servidor nuevo ni exponer otro servicio con la clave de la base.

## Ventajas y limitaciones observadas

| Algoritmo | Ventajas en este caso | Limitaciones en este caso |
| --- | --- | --- |
| Regresión logística | Mayor recall, coeficientes y aportes explicables, SQL exacto, hiperparámetros estables. | Variables muy correlacionadas (no leer coeficientes aislados); umbral sensible con poco historial. |
| SVM RBF | Mejor ordenamiento del riesgo (AP 0,881) y F1 más estable entre meses. | 3 morosas más sin aviso; sin probabilidad calibrada; explicabilidad media y servicio Python. |
| SVM lineal | Recall alto. | Muchos falsos positivos (85 recordatorios). |
| KNN | Simple de explicar como «se parece a…». | 90 recordatorios; muchas cuotas idénticas (sin historial) generan empates de distancia. |
| Árbol de decisión | Reglas legibles. | Recall 0,78 fuera de muestra; su buen resultado en un solo mes no se sostiene. |
| AdaBoost / Gradient Boosting | Combinan reglas débiles. | No mejoran al árbol con 300 filas; menor explicabilidad y mayor riesgo de sobreajuste (S14). |

## Sensibilidad y riesgo de arranque en frío

En el primer mes externo (entrenado con solo 4 meses) el umbral de la logística quedó por debajo de la
probabilidad de una cuota sin historial y se marcaron 23 cuotas (16 de unidades puntuales). Sin ese mes (meses
6–10, descriptivo, no cambia la regla): logística recall 0,969, precision 0,756, F1 0,849 con 41 recordatorios;
árbol F1 0,794; SVM RBF F1 0,734. **Riesgo para producción:** en una junta nueva se requiere un historial
mínimo (al menos 6 meses) antes de activar el modelo, y revisar el umbral al reentrenar.

## Límites de esta evidencia

- Datos 100 % simulados con reglas deterministas (ver README): las diferencias describen la semilla.
- 37 morosas en la validación anidada: intervalos amplios; la decisión se apoya en la regla, no en décimas de F1.
- La prueba ya se había consultado; por eso esta comparación no la usa y el v1 conserva su única evaluación.
