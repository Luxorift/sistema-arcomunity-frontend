# Contrato técnico de integración ML — riesgo de morosidad

Estado: **modelo v1 entrenado** (regresión logística, `ml/modelo_morosidad`). Se activa en la base con la
migración `20261118001200_modelo_morosidad_v1.sql`: hasta aplicarla no hay predicciones ni modelo activo.

Pregunta: *¿existe riesgo de que esta cuota se pague con atraso?* Unidad de observación: una cuota.
Momento de predicción: fecha de corte anterior al vencimiento (por defecto, hoy en America/Lima).

## Variables y fuga de información

| Campo del contrato APF2 | ¿Usar como predictor? | Motivo |
| --- | --- | --- |
| `monto`, `periodo` (mes) | Sí | Conocidos al generar la cuota. |
| `pagos_atrasados_previos` | Sí, calculado al corte | Solo cuotas previas ya vencidas antes del corte. |
| `fecha_pago`, `dias_atraso` | **No** | Definen la etiqueta. |
| `metodo_pago` de la cuota actual | **No** | No existe antes de pagar. Se usa `metodo_pago_ultimo` (pago previo). |
| `moroso` | Etiqueta | 1 = pagada con atraso o impaga tras vencer. |

## Entrada (lo que el MVP ya captura) — `ml_caracteristicas_cuotas(junta, fecha_corte, horizonte)`

```json
{
  "modelo_version": "v1",
  "fecha_corte": "2026-11-01",
  "registros": [
    {
      "cuota_id": "uuid",
      "unidad_ref": "U-3f9a1c2b7d",
      "periodo": "2026-11-01",
      "mes": 11,
      "monto": 150.0,
      "fecha_vencimiento": "2026-11-10",
      "dias_para_vencer": 9,
      "pagos_atrasados_previos": 2,
      "cuotas_previas": 11,
      "atrasos_previos_total": 4,
      "tasa_atraso_previa": 0.3636,
      "dias_atraso_promedio_previo": 3.5,
      "metodo_pago_ultimo": "yape_captura",
      "es_simulado": true
    }
  ]
}
```

`unidad_ref` es un seudónimo estable (SHA-256 del id interno); no contiene código de unidad ni
datos del propietario. El modelo final puede usar un subconjunto de estas columnas: la lista exacta
se guarda en `modelos_ml.caracteristicas`.

## Salida esperada del servicio de inferencia

```json
{
  "modelo_version": "v1",
  "umbral": 0.42,
  "predicciones": [
    {
      "cuota_id": "uuid",
      "probabilidad": 0.71,
      "prediccion": 1,
      "nivel_riesgo": "alto",
      "factores": [{ "variable": "pagos_atrasados_previos", "aporte": 0.31 }]
    }
  ]
}
```

`nivel_riesgo`: `alto` si probabilidad ≥ umbral; `medio` si ≥ umbral/2; `bajo` en otro caso (se
puede ajustar al entrenar). Se guarda en `predicciones_morosidad` junto con `entrada` (copia de las
características usadas) para trazabilidad.

## Flujo implementado (v1)

1. La administración abre **Predicción de morosidad** y pulsa «Calcular riesgo de hoy».
2. `calcular_riesgo_morosidad(junta)` (PostgreSQL, `security definer`) verifica que sea administración de la
   junta, toma las variables de `ml_caracteristicas_cuotas` con corte = hoy (solo información pasada), aplica la
   fórmula de la regresión logística con los parámetros guardados en `modelos_ml.parametros` y guarda cada
   resultado en `predicciones_morosidad` (con la entrada usada) y en la auditoría.
3. La pantalla lee `predicciones_vigentes(junta)`: cuotas aún no vencidas, ordenadas por probabilidad, con los
   factores que elevan el riesgo y la acción sugerida (priorizar recordatorio).
4. Los propietarios nunca ven su riesgo (RLS y funciones solo para administración).

La paridad SQL ↔ scikit-learn se prueba con 115 casos (diferencia < 1e-9). Desde Python, `inferencia.py` sigue
disponible para el notebook y para comparar. Un servicio externo (Edge Function o FastAPI) solo sería necesario
si en el futuro se elige un modelo no lineal; la reevaluación (`ml/modelo_morosidad/comparacion`) no lo justificó.

## Datos de entrenamiento

`exportar_dataset_morosidad(junta)` devuelve los campos del contrato APF2 más `origen`
(`real`/`simulado`). Excluye cuotas sin etiqueta definitiva (no vencidas o con pago en revisión).
El dataset oficial de APF3 lo prepara el equipo; esta función solo garantiza que lo que exporta el
MVP sea coherente con el contrato.
