# Demostración del modelo en la sustentación (≈ 4 minutos de los 12)

Cuenta: `admin@arcomunity.demo` / `Demo2026!` (datos simulados). URL: https://sistema-arcomunity-frontend.vercel.app

## Antes de entrar (10 min antes)

1. Abrir la URL e iniciar sesión como administración (despierta Supabase si estuvo inactivo).
2. Ir a **Cuotas**, elegir **diciembre de 2026** y comprobar que diga «Aún no hay cuotas este mes» (la restauración
   nocturna las borra). Si ya existen, no pasa nada.
3. Tener abiertas en pestañas: el notebook (Colab o local), `comparacion/RESULTADOS.md` y las capturas de
   `evidencias/` (plan B).

## Guion

| # | Pregunta que responde | Qué mostrar | Qué decir (resumen) |
| --- | --- | --- | --- |
| 1 | ¿Qué predecimos? | Pantalla «Predicción de morosidad» | Si una cuota de vigilancia se pagará con atraso, **antes** de su vencimiento, para priorizar recordatorios. |
| 2 | ¿Con qué datos? | Notebook, bloques 2–3 | 359 cuotas simuladas del MVP (30 unidades, 12 meses, 75 morosas). Variables del historial al día 1 del mes; sin fecha de pago, días de atraso ni método de la cuota actual (fuga). |
| 3 | ¿Qué algoritmos comparamos? | `comparacion_algoritmos.png` | Logística, SVM lineal y RBF, KNN, árbol, AdaBoost y Gradient Boosting, contra Dummy y una regla de negocio, con una regla fijada antes de comparar y sin usar la prueba. |
| 4 | ¿Por qué regresión logística? | Tabla 3.1 | Empata con SVM RBF en F1 (0,713 vs. 0,725, diferencia no significativa), pero deja 1 morosa sin aviso frente a 4, es explicable y se reproduce exactamente en la base de datos. |
| 5 | ¿Qué significan las métricas? | Matriz de confusión (prueba) | De 13 morosas de prueba avisa de 11 (recall 0,846 ≥ meta 0,80) con 18 recordatorios; 7 de esos 18 no eran necesarios (precision 0,611). La exactitud sola engaña: el Dummy acierta 78 % sin detectar ninguna. |
| 6 | ¿Cómo funciona en Arcomunity? | **En vivo:** Cuotas → diciembre → *Generar cuotas* → *Generar* → Predicción de morosidad → *Calcular riesgo de hoy* | La base calcula las variables sin información futura, aplica la misma fórmula del modelo de Python (no ejecuta el joblib; paridad < 1e-9) y guarda el resultado; solo la administración lo ve. Resultado esperado: 30 cuotas, 12 en riesgo alto. |

Límite que conviene decir antes de que lo pregunten: los datos son simulados con reglas fijas; las métricas son
indicativas y el modelo se reentrenará con pagos reales (incluida la verificación de que más atrasos impliquen más
riesgo, ver `comparacion/AUDITORIA_MONOTONIA.md`).

## Plan B (si la web o Supabase fallan)

1. **App local contra la misma base:** en `sistema-arcomunity-frontend`, `npm run dev` y abrir http://localhost:5173
   (necesita `.env.local`).
2. **Sin internet:** mostrar las capturas reales de `evidencias/` (01 → 05) y la tabla `tabla_prediccion_mostrada.json`.
3. **Inferencia en Python, sin base de datos:**
   ```bash
   cd ml/modelo_morosidad
   python inferencia.py ejemplo_entrada.json
   ```
   Devuelve probabilidad, nivel de riesgo y factores para tres cuotas de ejemplo (bajo, bajo y alto).
4. **Notebook ya ejecutado:** abrir `APF3_TD_Grupo6_ML_Innovacion.ipynb` con sus salidas guardadas (no requiere ejecutar).

Después de la sustentación: `npm run demo:restaurar` (o esperar la restauración nocturna de las 03:00).
