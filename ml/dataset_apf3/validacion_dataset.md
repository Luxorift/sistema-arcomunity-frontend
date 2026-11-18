# Validación del dataset de morosidad — APF3

Generado por `scripts/exportar-dataset-apf3.ts` el 2026-11-17 (fecha de Lima del servidor).
Fuente: base de datos Supabase de Arcomunity, junta «Junta Vecinal Arcomunity — Piloto» (simulada),
mediante la función del sistema `exportar_dataset_morosidad`. No se editó ningún valor a mano.

**Resultado: todas las validaciones pasaron.**

## Archivos

| Archivo | Contenido |
| --- | --- |
| `dataset_arcomunity_apf3.csv` | 359 filas × 11 columnas del contrato. UTF-8 con BOM, separador coma, punto decimal, fechas ISO, vacío = nulo. |
| `dataset_arcomunity_apf3.xlsx` | Los mismos datos para abrir con doble clic en Excel (hojas dataset, diccionario y particion). |
| `diccionario_datos.csv` | Significado, tipo, uso permitido en el modelo y cambios respecto del APF2. |
| `particion_temporal_referencia.csv` | Partición temporal sugerida (unidad_ref, periodo, particion). Solo referencia. |
| `validacion_dataset.md` | Este informe. |

## Volumen

- Cuotas en la base de la junta: **360** (30 unidades × 12 meses).
- Filas exportadas: **359** (cuotas con etiqueta definitiva).
- Excluidas: **1** → 2026-11, estado `en_revision` (pago enviado, esperando revisión del administrador).
- Periodos: 2025-12-01 a 2026-11-01 (12 meses consecutivos). Unidades: 30.

## Variable objetivo `moroso`

- moroso = 1: **75** (20.9 %) → 61 pagadas con atraso + 14 impagas tras vencer.
- moroso = 0: **284** (79.1 %), todas pagadas en o antes del vencimiento.
- Perfiles observados por unidad: 5 con 6 o más atrasos, 9 con 1 a 5, 16 sin atrasos.
- Cuotas que aún no vencen: si están impagas **no se exportan** (nunca reciben 0). Si ya se pagaron antes de vencer se exportan con 0, porque su etiqueta ya es definitiva (hoy hay 0: al 2026-11-17 ya venció la última cuota del dataset).

| Periodo | Filas | moroso = 1 | % | Partición |
| --- | --- | --- | --- | --- |
| 2025-12-01 | 30 | 7 | 23.3 | entrenamiento |
| 2026-01-01 | 30 | 7 | 23.3 | entrenamiento |
| 2026-02-01 | 30 | 5 | 16.7 | entrenamiento |
| 2026-03-01 | 30 | 6 | 20.0 | entrenamiento |
| 2026-04-01 | 30 | 5 | 16.7 | entrenamiento |
| 2026-05-01 | 30 | 7 | 23.3 | entrenamiento |
| 2026-06-01 | 30 | 7 | 23.3 | entrenamiento |
| 2026-07-01 | 30 | 4 | 13.3 | entrenamiento |
| 2026-08-01 | 30 | 8 | 26.7 | entrenamiento |
| 2026-09-01 | 30 | 6 | 20.0 | validacion |
| 2026-10-01 | 30 | 5 | 16.7 | prueba |
| 2026-11-01 | 29 | 8 | 27.6 | prueba |

## Partición temporal de referencia (APF2: 9 + 1 + 2 meses)

| Partición | Periodos | Filas | moroso = 1 | % |
| --- | --- | --- | --- | --- |
| entrenamiento | 2025-12-01 a 2026-08-01 | 270 | 56 | 20.7 |
| validacion | 2026-09-01 a 2026-09-01 | 30 | 6 | 20.0 |
| prueba | 2026-10-01 a 2026-11-01 | 59 | 13 | 22.0 |

Daniel puede rehacerla; esta versión solo fija los cortes del contrato para comparar resultados.

## Otras distribuciones

| metodo_pago | Filas | moroso = 1 |
| --- | --- | --- |
| (vacío: impaga) | 14 | 14 |
| efectivo | 69 | 12 |
| yape_captura | 140 | 14 |
| yape_qr | 136 | 35 |

| pagos_atrasados_previos | Filas | moroso = 1 | % moroso |
| --- | --- | --- | --- |
| 0 | 255 | 25 | 9.8 |
| 1 | 54 | 6 | 11.1 |
| 2 | 19 | 19 | 100.0 |
| 3 | 31 | 25 | 80.6 |

## Validaciones

| Validación | Resultado | Detalle |
| --- | --- | --- |
| Mismas filas que las cuotas con etiqueta definitiva | OK | 359 = 359 |
| Sin duplicados por (unidad_ref, periodo) | OK | ninguno |
| Sin nulos en monto, periodo y fecha_vencimiento; montos > 0 | OK | correcto |
| unidad_ref = seudónimo SHA-256 de la unidad (sin código ni propietario) | OK | correcto |
| fecha_pago vacía solo si la cuota está impaga | OK | correcto |
| metodo_pago vacío si y solo si fecha_pago está vacía | OK | correcto |
| dias_atraso = max(0, fecha_pago − fecha_vencimiento); 0 si impaga | OK | correcto |
| moroso recalculado coincide con el exportado | OK | correcto |
| Ninguna cuota no vencida e impaga recibe etiqueta (ni 0 ni 1) | OK | correcto |
| pagos_atrasados_previos recalculado (3 meses, solo pasado) coincide | OK | correcto |
| Cada cuota pagada tiene un pago conciliado con mismo monto, fecha y método | OK | correcto |
| Ninguna fecha de pago futura ni anterior al periodo | OK | correcto |
| es_simulado = 1 y origen = simulado en todas las filas | OK | correcto |
| Periodos = primer día del mes y vencimiento dentro del mismo mes | OK | correcto |
| 12 periodos mensuales consecutivos | OK | 2025-12-01 a 2026-11-01 |
| CSV sin correos, teléfonos, UUID, tokens, claves, n.º de operación ni códigos de unidad | OK | ninguno encontrado |

Cada columna se recalculó en este script a partir de las tablas `cuotas`, `pagos` y `unidades`,
sin reutilizar la función SQL, y se comparó con lo que exporta el sistema.

## Fuga de información

- `fecha_pago`, `dias_atraso` y `metodo_pago` describen la cuota **ya cobrada**: sirven para auditar
  y construir `moroso`, pero **no deben usarse como predictoras** (no existen antes del vencimiento).
- `pagos_atrasados_previos` se calcula con el estado de las 3 cuotas anteriores **al primer día del
  periodo**: no usa pagos posteriores. Los 3 primeros meses tienen menos historial (censura a la izquierda).
- Si se crean más variables históricas (p. ej. método de pago de la cuota anterior, tasa de atraso
  acumulada), deben usar solo periodos anteriores, ordenando por `unidad_ref` y `periodo`.
- La partición es temporal: no mezclar filas al azar entre entrenamiento y prueba.
- `unidad_ref` sirve para agrupar, no como predictor (memorizaría a cada unidad).

## Diferencias con el APF2 (investigadas, no corregidas a mano)

| Aspecto | APF2 | Este dataset | Causa |
| --- | --- | --- | --- |
| Periodos | 2025-11 a 2026-10 | 2025-12 a 2026-11 | La semilla genera 12 meses hacia atrás desde el mes en que se carga. El APF2 se midió en octubre de 2026; la base Supabase se sembró en noviembre de 2026. Mismo patrón de comportamiento, desplazado un mes. |
| Registros | 360 | 359 | El APF2 contaba todas las cuotas. El sistema excluye las que no tienen etiqueta definitiva (1: en_revision). |
| moroso = 1 | 76 (21,1 %) | 75 (20.9 %) | Con la regla del APF2 (contar como impaga la cuota con pago en revisión) los mismos datos dan **76**. Esa cuota tiene un pago con fecha de operación 2026-11-09, anterior al vencimiento, que el administrador aún no revisa: etiquetarla 1 sería probablemente incorrecto y etiquetarla 0 sería adivinar la revisión, así que el sistema la deja fuera hasta que se apruebe o rechace. |
| Impagas | 15 | 14 | La 15.ª del APF2 es la misma cuota en revisión. |
| Partición | 270 / 30 / 60 | 270 / 30 / 59 | La fila excluida pertenece al último mes (prueba). |
| unidad_ref | U001 (ejemplo) | U-xxxxxxxxxx | El sistema usa un seudónimo SHA-256 estable; no deja deducir el número de casa. |
| Columna origen | no existía | simulado | Agregada para APF3; equivale a es_simulado. |
| metodo_pago | yape_qr, yape_captura, efectivo | efectivo, yape_captura, yape_qr | El sistema también acepta plin_captura y transferencia; la semilla no los usa. |

Si la semilla se vuelve a cargar (`npm run seed:demo -- --reset`) en otro mes, los periodos se desplazan y
los seudónimos cambian (las unidades reciben ids nuevos). Para que el equipo trabaje sobre la misma
versión, usar este archivo y no regenerarlo sin avisar.

## Advertencias para el modelado

- La semilla es **determinista y basada en reglas** (5 unidades crónicas, 8 ocasionales, resto puntuales).
  Un modelo puede aprender esas reglas casi a la perfección: por ejemplo, con 2 atrasos previos la tasa
  de morosidad observada es 100.0 %. Las métricas altas no serían extrapolables a datos reales.
- Clases desbalanceadas (20.9 % positivos): reportar precisión, recall, F1 y AUC, no solo exactitud.
- `monto` es constante (S/ 150) en la semilla: no aporta información en este dataset.

## Privacidad

- Todas las filas son simuladas (`es_simulado = 1`, `origen = simulado`).
- No hay nombres, correos, teléfonos, códigos de casa, ids internos, números de operación, rutas de
  comprobantes, claves ni tokens (verificado por patrones en el CSV).

## Cómo cargarlo

```python
import pandas as pd
df = pd.read_csv("dataset_arcomunity_apf3.csv", parse_dates=["periodo", "fecha_vencimiento", "fecha_pago"])
part = pd.read_csv("particion_temporal_referencia.csv", parse_dates=["periodo"])
df = df.merge(part, on=["unidad_ref", "periodo"], how="left")
```

En Excel con configuración regional de Perú (separador ";"), abrir `dataset_arcomunity_apf3.xlsx`, o el
CSV desde **Datos → Desde texto/CSV** eligiendo delimitador coma.

Comprobado al preparar la primera versión (17/11/2026): pandas 3.1.1 lee el CSV con 11 columnas, tipos
correctos y el BOM sin afectar el nombre de `unidad_ref`; la unión con la partición es 1 a 1. En
Excel (Windows es-PE) el `.xlsx` abre 359 filas × 11 columnas; el CSV con doble clic queda en una sola
columna (por el separador regional), e importado con delimitador coma abre 11 columnas.

## Regenerar

```bash
npm run dataset:apf3
```

Necesita `VITE_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Solo lee la base.
