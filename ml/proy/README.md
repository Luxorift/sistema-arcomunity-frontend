# Modelo de morosidad · Proyecto Final (PROY)

Corrección del modelo base de APF3 (Paso 2a) y ciclo de mejora (Paso 2b) de la consigna del PROY. Los archivos de APF3
(`ml/modelo_morosidad/`) **no se modifican**: este código los importa. El dataset es el mismo de APF3, sin cambios
(359 cuotas, 100 % simuladas, `origen = simulado`).

## Cómo reproducirlo

Requisitos: Python 3.12 y `ml/modelo_morosidad/requirements.txt`. Desde la carpeta `ml/proy`:

```bash
python -m venv .venv
.venv\Scripts\activate                       # Linux/macOS: source .venv/bin/activate
pip install -r ../modelo_morosidad/requirements.txt
python coherencia.py                         # ficha de coherencia: 7 criterios (≈ 5 s)
python experimento.py                        # pruebas de fuga, evaluación anidada y decisión (≈ 35 s)
python robustez.py                           # escenario simulado de junta difusa, 30 réplicas
```

`evaluar_prueba.py` **ya se ejecutó una vez** (26/11/2026). Por diseño, se niega a correr de nuevo si existe
`resultados/prueba/`. Para auditarlo, ejecútelo sobre una copia de la carpeta sin esa subcarpeta.

**Corrida canónica:**

| Elemento | Valor |
| --- | --- |
| Sistema | Windows 11 |
| Python | 3.12.10 |
| Librerías | numpy 2.5.5, pandas 3.1.1, scikit-learn 1.9.1 |
| Huella LF del dataset | `53e1136b…` |

Cada salida guarda su entorno: `resultados/entorno_experimento.json` y `resultados/prueba/registro_ejecucion.json`.

## Orden de los commits (la regla antes que los números)

| Commit | Qué fija |
| --- | --- |
| `d658c00` | `REGLA_DE_MEJORA.md`: líneas de mejora, espacio de búsqueda, criterio de reemplazo y uso único de la prueba |
| `f542c91` | Corrección 2a: desempate determinista, entorno declarado y huella LF |
| `6974e7b` | Ficha de coherencia de los 7 criterios |
| `1fa734b`, `ff002d6` | Código del experimento |
| `c296ff1` | `decision.json` con la decisión, **antes** de evaluar la prueba |
| `e128dd9` | Script de la prueba, confirmado antes de ejecutarlo |
| `1e6983e` | Evaluación única de la prueba |

## Paso 2a · Corrección del modelo base

- **Tabla anidada con dos versiones (O2).** En el mes externo 5, la búsqueda interna de la regresión logística
  empataba exactamente (AP 0,763889) entre `class_weight = None` y `'balanced'`. GridSearchCV resolvía el empate según
  el entorno: en Windows daba F1 0,713 y en Colab 0,700. Ahora la AP se redondea a 6 decimales y gana la configuración
  más simple (`comun.elegir_determinista`).
- **Huella del dataset (O3).** `12bfe4d0…` (CRLF de Windows) y `53e1136b…` (LF de Git y Colab) son el mismo
  contenido. `.gitattributes` fija LF para los CSV de `ml/`.
- **Pipeline sin fuga.** El `StandardScaler` vive dentro del `Pipeline` y se ajusta en cada pliegue. La prueba
  contrafactual cambia el desenlace del mes 10 y deja intactas las variables de los meses 1–10
  (`resultados/pruebas_fuga.json`: 0 filas distintas).
- **Coherencia (7 criterios).** Los criterios 1 a 6 se cumplen. El criterio 7 (mezcla real + simulado) se cumple con
  limitación declarada: hay 0 registros reales porque la empresa es ficticia (`resultados/ficha_coherencia_dataset_final.md`).
- **APF3 corregido = v1 entregado.** Elige `C = 10`, sin pesos y umbral 0,2258. En la prueba, su diferencia máxima de
  probabilidad frente al `joblib` entregado es 0.

## Paso 2b · Ciclo de mejora

### Evaluación anidada (meses 5–10, 180 cuotas, 37 morosas; sin la prueba): base de la decisión

| Modelo | Recall | Precisión | F1 | FN | Recordatorios | AP | Diferencia de F1 frente a APF3 corregido (IC 95 %) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dummy (clase mayoritaria) | 0,000 | 0,000 | 0,000 | 37 | 0 | — | — |
| Regla: atraso en 3 meses previos | 0,757 | 0,475 | 0,583 | 9 | 59 | — | — |
| **APF3 corregido (v1)** | **0,973** | **0,563** | **0,713** | **1** | **64** | **0,837** | referencia |
| PROY-A · recencia | 0,865 | 0,508 | 0,640 | 5 | 63 | 0,773 | −0,073 (−0,142 a −0,014) |
| PROY-B · reajuste | 0,973 | 0,563 | 0,713 | 1 | 64 | 0,837 | 0,000 (elige la misma configuración) |
| PROY-C · recencia + reajuste | 0,865 | 0,508 | 0,640 | 5 | 63 | 0,773 | −0,073 (−0,142 a −0,014) |

**Decisión (regla registrada):** ningún candidato PROY supera a APF3 corregido fuera del empate práctico. Se conserva
**v1** como modelo servido; no se crea una versión nueva en la base.

### Prueba (meses 11–12, 59 cuotas, 13 morosas; evaluada una sola vez, después de la decisión)

| Modelo | Accuracy | Precisión | Recall | F1 | FN | FP | Recordatorios |
| --- | --- | --- | --- | --- | --- | --- | --- |
| APF3 entregado (informe APF3, referencia) | 0,847 | 0,611 | 0,846 | 0,710 | 2 | 7 | 18 |
| Dummy (clase mayoritaria) | 0,780 | 0,000 | 0,000 | 0,000 | 13 | 0 | 0 |
| Regla: atraso en 3 meses previos | 0,746 | 0,450 | 0,692 | 0,545 | 4 | 11 | 20 |
| **APF3 corregido (servido)** | **0,847** | **0,611** | **0,846** | **0,710** | **2** | **7** | **18** |
| PROY-A · recencia | 0,881 | 0,688 | 0,846 | 0,759 | 2 | 5 | 16 |
| PROY-B · reajuste | 0,847 | 0,611 | 0,846 | 0,710 | 2 | 7 | 18 |
| PROY-C · recencia + reajuste | 0,881 | 0,688 | 0,846 | 0,759 | 2 | 5 | 16 |

PROY-A obtiene un F1 mayor en la prueba (2 falsos positivos menos), pero la regla prohíbe decidir con la prueba. En la
evaluación anidada, con 3 veces más cuotas, PROY-A empeora con un intervalo que excluye el 0: deja 5 morosas sin aviso,
frente a 1. Es la misma situación del árbol en APF3 y se resuelve igual.

### Por qué no mejoró (análisis para el informe)

1. **Las variables de recencia repiten información.** `atraso_mes_anterior` y `meses_desde_ultimo_atraso` se derivan
   del mismo historial que ya resumen los atrasos de 3 meses y la tasa. Su coeficiente también sale con un signo
   contrario a la intuición (−0,35 para el atraso del mes anterior). Eso confirma que, en la semilla, las unidades
   crónicas alternan meses puntuales y tardíos.
2. **La búsqueda se vuelve inestable.** Con 6 variables, la configuración elegida cambia entre meses (`C` de 0,1 a 10,
   con y sin pesos de clase). Con 4, `C = 10` se mantiene en los 6 meses (`resultados/anidada_hiperparametros.csv`).
3. **El reajuste no tiene margen.** La grilla ampliada (`C` hasta 1000) elige `C = 10` en todos los meses. El v1 ya
   estaba en el óptimo del espacio declarado.
4. **Umbral por costo (línea d, informativo).** Con un umbral único de 0,196 sobre las predicciones anidadas, el costo
   bajaría con razones FN:FP de 2 y 5 (`resultados/sensibilidad_umbral_costo.csv`). Ese umbral se calculó con las
   mismas predicciones que mide, así que no se adopta sin datos reales.

### Robustez ante una junta de perfil difuso (O7)

Escenario simulado con la misma tasa media (≈ 21 %) y propensiones continuas: 30 réplicas en
`resultados/robustez_difuso_resumen.csv`. Solo predice: no entrena ni elige.

| Modelo | Recall medio (mín.–máx.) | F1 medio (mín.–máx.) |
| --- | --- | --- |
| v1 (APF3 corregido) | 0,439 (0,128–0,617) | 0,336 (0,111–0,466) |
| PROY-A · recencia | 0,496 (0,231–0,683) | 0,339 (0,165–0,456) |
| Regla manual | 0,587 (0,410–0,817) | 0,367 (0,241–0,540) |

Cuando los perfiles no son marcados, el v1 pierde la mitad de su recall y queda por debajo de la regla manual. La ficha
de coherencia del escenario lo detecta: los criterios 4 y 5 no se cumplen (señal casi nula). Esta es la evidencia
cuantitativa del riesgo RM1. Con datos reales, el reentrenamiento y el monitoreo del recall son obligatorios.

## Modelo servido

| Elemento | Valor |
| --- | --- |
| Versión | `v1` (sin cambios): `ml/modelo_morosidad/modelo/modelo_morosidad_v1.joblib` y sus metadatos |
| Esquemas | `esquema_entrada.json` y `esquema_salida.json` |
| Umbral | Configurable en `modelos_ml.umbral` de la versión activa en Supabase |

## Limitaciones

- **Datos reales.** El dataset no tiene registros reales; la condición 5 (30 reales) no se cumple y se declara.
- **Validez de las métricas.** Todas las métricas provienen de datos simulados y son indicativas.
- **Prueba ya observada.** Los meses 11–12 ya se habían observado en APF3 con v1.
