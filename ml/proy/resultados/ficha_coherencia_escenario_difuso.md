# Ficha de coherencia · escenario_difuso

Generada por `ml/proy/coherencia.py` el 2026-11-27T03:39:12+00:00 (commit 1e6983e, Python 3.12.10, numpy 2.5.5, scikit-learn 1.9.1).

| Criterio | Veredicto |
| --- | --- |
| 1. Escala del negocio | cumple |
| 2. Rangos y unidades | cumple |
| 3. Consistencia lógica y temporal | cumple |
| 4. Relaciones plausibles | no cumple |
| 5. Señal ni nula ni perfecta | no cumple |
| 6. Coherencia con el Contrato de Datos | cumple |
| 7. Mezcla real + simulado | cumple con limitación declarada |

## 1. Escala del negocio

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| 30 unidades y 12 meses consecutivos | cumple | 30 unidades, 12 periodos, 360 cuotas |
| Una cuota por unidad y mes | cumple | máximo 1 por unidad y mes |
| Monto emitido por mes coherente con el piloto (S/ 3 000–6 000) | cumple | S/ 4,500 a S/ 4,500 por mes |

## 2. Rangos y unidades

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Monto en soles > 0 con 2 decimales | cumple | monto entre 150.00 y 150.00 |
| dias_atraso entero ≥ 0 | cumple | 0 a 15 días |
| pagos_atrasados_previos entre 0 y 3 | cumple | valores [0, 1, 2, 3] |
| moroso y es_simulado binarios | cumple | moroso [0, 1], es_simulado [1] |
| Periodo el día 1 y vencimiento el día 10 del mismo mes | cumple | periodo AAAA-MM-01 y vencimiento AAAA-MM-10 |
| Método de pago dentro del catálogo | cumple | métodos ['efectivo', 'yape_captura', 'yape_qr'] |

## 3. Consistencia lógica y temporal

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| dias_atraso = max(0, fecha_pago − vencimiento) | cumple | 0 diferencias |
| moroso = pagó tarde o sigue impaga | cumple | 0 diferencias |
| Cuotas impagas sin método de pago | cumple | 6 impagas |
| pagos_atrasados_previos recalculado con información anterior al corte | cumple | 0 diferencias |
| Ningún pago anterior a la emisión del periodo | cumple | primer día de pago relativo al periodo: 0 |

## 4. Relaciones plausibles

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Morosidad entre 10 % y 35 % | cumple | 24.2% (87 de 360) |
| Quien se atrasó antes se atrasa más | no cumple | 23.8% con atraso previo frente a 24.5% sin atraso |
| Concentración de la morosidad (se reporta) | cumple | las 5 unidades con más atrasos suman 25 de 87 (29%); perfil determinista de la semilla, ver robustez |

## 5. Señal ni nula ni perfecta

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| AP fuera de muestra (meses 5–10) mayor que la prevalencia y menor que 0,95 | no cumple | AP 0.228 frente a prevalencia 0.244; sin la prueba |

## 6. Coherencia con el Contrato de Datos

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Los 10 campos del contrato presentes | cumple | 10 de 10 |
| Columna origen presente y coherente con es_simulado | cumple | origen ∈ {real, simulado} |
| unidad_ref seudónima (sin datos personales) | cumple | formato U- + 10 hexadecimales (SHA-256) |

## 7. Mezcla real + simulado

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Mínimo de 30 registros reales (condición 5) | no aplicable | 0 registros reales y 360 simulados. Arcomunity es una empresa ficticia autorizada: no existen registros reales. Limitación declarada en la tabla de trazabilidad |
| Ningún registro simulado presentado como real | cumple | todas las filas con es_simulado = 1 tienen origen = simulado |

