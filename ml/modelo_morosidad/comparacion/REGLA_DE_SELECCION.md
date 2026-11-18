# Regla de selección de algoritmos (registrada ANTES de ejecutar la comparación)

Fecha: 18/11/2026. Este archivo se confirma en Git antes de correr `comparacion.py`, para que la regla no se
pueda ajustar a los resultados.

## Qué se compara

Mismas cuatro variables del modelo v1 (`caracteristicas.py`, sin cambios) y mismo preprocesamiento por
`Pipeline` + `ColumnTransformer` (escalado estándar para los algoritmos sensibles a la escala).

| Algoritmo (temario S13–S14 y consigna §7) | Espacio de búsqueda |
| --- | --- |
| Regresión logística (referencia, modelo v1) | `C` ∈ {0,01; 0,1; 1; 10}, `class_weight` ∈ {None, balanced} |
| SVM (`SVC`) | kernel lineal y RBF, `C` ∈ {0,1; 1; 10}, `class_weight` ∈ {None, balanced} |
| KNN | `n_neighbors` ∈ {5, 11, 21, 31}, `weights` ∈ {uniform, distance} |
| Árbol de decisión | `max_depth` ∈ {2, 3, 4, 5}, `min_samples_leaf` ∈ {5, 10, 20}, `class_weight` ∈ {None, balanced} |
| Boosting: AdaBoost (Freund y Schapire, 1997) | tocones (`max_depth = 1`), `n_estimators` ∈ {25, 50, 100, 200}, `learning_rate` ∈ {0,1; 0,5; 1} |
| Boosting: Gradient Boosting | `n_estimators` ∈ {50, 100}, `max_depth` ∈ {1, 2}, `learning_rate` ∈ {0,05; 0,1} |
| Líneas base | Dummy (mayoritaria, estratificado) y regla «atraso en los 3 meses previos» |

## Datos permitidos

- **Solo meses 1–10** (entrenamiento + validación). **Los meses 11–12 (prueba) no se usan** para nada: ni
  variables, ni hiperparámetros, ni umbrales, ni selección. Ya se consultaron una vez con el modelo v1.
- Evaluación **anidada con origen móvil**: para cada mes externo k = 5…10 se entrena con los meses < k y se
  predice el mes k (6 meses, 180 cuotas). Dentro de cada pliegue, los hiperparámetros se eligen con validación
  cruzada temporal interna (predecir cada mes j < k con los meses < j) y el **umbral** es el mayor que logra
  recall ≥ 0,80 en esas predicciones internas. Así ninguna decisión ve el mes que se evalúa.

## Regla

1. **Auditoría previa.** Un modelo con F1 ≥ 0,95 o recall = 1 y precision = 1 en la evaluación anidada se
   investiga (fuga o memorización de la semilla) antes de poder ser elegido.
2. **Elegibilidad.** (a) recall agregado ≥ 0,80 en las 180 predicciones externas; (b) F1 agregado mayor que el de
   la regla de negocio (debe aportar más que «recordar a quien se atrasó»).
3. **Criterio principal: F1 agregado** de la clase morosa. Equilibra los falsos negativos (el error más costoso)
   con los recordatorios innecesarios (precision = recordatorios útiles / recordatorios enviados). Se reportan
   también recall, precision, F2, FN, FP y recordatorios.
4. **Empate práctico.** Si el intervalo de confianza al 95 % (bootstrap pareado de 2000 remuestreos de las
   180 cuotas) de la diferencia de F1 entre el mejor y otro candidato incluye 0, se consideran empatados.
5. **Desempate, en este orden:** (i) menor brecha de sobreajuste (F1 de entrenamiento − F1 externo);
   (ii) menor variabilidad entre meses (desviación estándar del F1 por mes); (iii) explicabilidad para la
   administración (logística y árbol > SVM lineal > KNN, SVM RBF y boosting, según S14);
   (iv) integración más simple y segura en Arcomunity (logística ya reproducida en SQL con paridad exacta >
   árbol traducible a reglas SQL > modelos que requieren un servicio Python).
6. **Cambio de modelo.** Solo se reemplaza el v1 si otro candidato gana sin empate práctico (punto 4). Si gana
   un modelo que necesita infraestructura nueva, se exige además una mejora de F1 ≥ 0,05.
7. **Prueba.** Las métricas de prueba que se informan siguen siendo las del v1 (única evaluación). Si se
   recomendara otro modelo, no se presentaría su resultado en prueba como estimación independiente.
