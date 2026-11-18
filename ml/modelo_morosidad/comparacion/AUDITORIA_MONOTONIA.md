# Auditoría de plausibilidad: ¿más atrasos implican más riesgo?

Hallazgo durante la prueba de integración (18/11/2026). En la pantalla, Casa 12 y Casa 08, con un atraso
reciente, recibieron 3 % de probabilidad, menos que las unidades sin atrasos (7 %). Se midió con el pipeline v1:

| Historial (variables al corte) | Probabilidad v1 | Nivel |
| --- | --- | --- |
| Sin historial | 0,065 | bajo |
| 1 atraso reciente de 12 cuotas | 0,030 | bajo |
| 1 atraso antiguo de 12 cuotas | 0,194 | medio |
| 2 atrasos recientes de 12 cuotas | 0,014 | bajo |
| 3 recientes, 9 de 10 cuotas | 0,985 | alto |

**Causa.** Las cuatro variables están muy correlacionadas (0,82–0,93) y `pagos_atrasados_previos` recibe un
coeficiente negativo (−1,87). En la semilla, las unidades ocasionales se atrasan según una regla periódica
(`(mes + unidad) % 5 == 0`): después de un atraso vienen meses puntuales. El modelo aprendió ese patrón de la
simulación. Con vecinos reales sería poco plausible: un atraso reciente debería aumentar el riesgo.

**Variante monótona evaluada** (sin `pagos_atrasados_previos`; misma evaluación anidada, meses 1–10, sin prueba):

| Modelo | Recall | Precision | F1 | Morosas sin aviso | Recordatorios | AP |
| --- | --- | --- | --- | --- | --- | --- |
| v1 (4 variables) | 0,973 | 0,563 | 0,713 | 1 | 64 | 0,837 |
| Sin `pagos_atrasados_previos` (3 variables) | 0,811 | 0,423 | 0,556 | 7 | 71 | 0,780 |

La variante es monótona (sin historial 0,069 → 1 atraso 0,106 → 2 atrasos 0,160 → 9 de 10 0,940; coeficientes
positivos), pero rinde claramente peor en estos datos.

**Decisión.** Para el APF3 se mantiene el v1: es el mejor validado y su selección no cambia. Se declara que
**parte de su ventaja proviene de un artefacto de la simulación** y no se presenta como comportamiento esperable
con datos reales.

**Para PROY (con datos reales de la junta):** reentrenar, comprobar la monotonía de cada variable de historial
antes de activar el modelo y, si el patrón no se confirma, usar la variante de 3 variables (o coeficientes
restringidos a valores no negativos). Esta verificación se agrega a la lista de controles de reentrenamiento.
