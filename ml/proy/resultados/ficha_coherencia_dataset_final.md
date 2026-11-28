# Ficha de coherencia · dataset_final

Generada por `ml/proy/coherencia.py` el 2026-11-27T03:33:01+00:00 (commit f542c91, Python 3.12.10, numpy 2.5.5, scikit-learn 1.9.1).

| Criterio | Veredicto |
| --- | --- |
| 1. Escala del negocio | cumple |
| 2. Rangos y unidades | cumple |
| 3. Consistencia lógica y temporal | cumple |
| 4. Relaciones plausibles | cumple |
| 5. Señal ni nula ni perfecta | cumple |
| 6. Coherencia con el Contrato de Datos | cumple |
| 7. Mezcla real + simulado | cumple con limitación declarada |

## 1. Escala del negocio

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| 30 unidades y 12 meses consecutivos | cumple | 30 unidades, 12 periodos, 359 cuotas |
| Una cuota por unidad y mes | cumple | máximo 1 por unidad y mes |
| Monto emitido por mes coherente con el piloto (S/ 3 000–6 000) | cumple | S/ 4,350 a S/ 4,500 por mes |

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
| Cuotas impagas sin método de pago | cumple | 14 impagas |
| pagos_atrasados_previos recalculado con información anterior al corte | cumple | 0 diferencias |
| Ningún pago anterior a la emisión del periodo | cumple | primer día de pago relativo al periodo: 1 |

## 4. Relaciones plausibles

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Morosidad entre 10 % y 35 % | cumple | 20.9% (75 de 359) |
| Quien se atrasó antes se atrasa más | cumple | 48.1% con atraso previo frente a 9.8% sin atraso |
| Concentración de la morosidad (se reporta) | cumple | las 5 unidades con más atrasos suman 54 de 75 (72%); perfil determinista de la semilla, ver robustez |

## 5. Señal ni nula ni perfecta

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| AP fuera de muestra (meses 5–10) mayor que la prevalencia y menor que 0,95 | cumple | AP 0.837 frente a prevalencia 0.206; sin la prueba |

## 6. Coherencia con el Contrato de Datos

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Los 10 campos del contrato presentes | cumple | 10 de 10 |
| Columna origen presente y coherente con es_simulado | cumple | origen ∈ {real, simulado} |
| unidad_ref seudónima (sin datos personales) | cumple | formato U- + 10 hexadecimales (SHA-256) |

## 7. Mezcla real + simulado

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Mínimo de 30 registros reales (condición 5) | no aplicable | 0 registros reales y 359 simulados. Arcomunity es una empresa ficticia autorizada: no existen registros reales. Limitación declarada en la tabla de trazabilidad |
| Ningún registro simulado presentado como real | cumple | todas las filas con es_simulado = 1 tienen origen = simulado |

