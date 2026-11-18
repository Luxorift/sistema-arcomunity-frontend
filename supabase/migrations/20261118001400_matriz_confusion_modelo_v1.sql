-- Arcomunity · Matriz de confusión del modelo v1 en sus metadatos
-- La pantalla «Predicción de morosidad» muestra el desempeño del modelo (recall, precisión y F1 del conjunto
-- de prueba) con los conteos que los explican: «detectó 11 de 13 cuotas morosas», «de 18 alertas, 11 fueron
-- atrasos». Los conteos vienen de la evaluación única del notebook (ml/modelo_morosidad, salida
-- «VP=11 FN=2 FP=7 VN=39», 59 cuotas de los meses 11–12) y son coherentes con las métricas ya registradas
-- (recall 11/13 = 0,846; precisión 11/18 = 0,611; F1 = 0,710; exactitud 50/59 = 0,847).
-- Solo agrega información: no cambia métricas, umbral, coeficientes ni el modelo activo. Idempotente.
update public.modelos_ml
set metricas = jsonb_set(metricas, '{prueba_meses_11_12,matriz}',
  '{"verdaderos_positivos": 11, "falsos_negativos": 2, "falsos_positivos": 7, "verdaderos_negativos": 39, "cuotas": 59}'::jsonb, true)
where version = 'v1' and metricas ? 'prueba_meses_11_12';
