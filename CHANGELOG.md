# CHANGELOG — Arcomunity

Registro de cambios reales del sistema, desde el MVP de APF2 hasta el Proyecto Final (PROY). Cada entrada indica dónde
está hoy:

- **Publicado:** en la rama `main`, servido en Vercel y en Cloudflare Workers.
- **En `dev`:** integrado, pero sin publicar.
- **Pendiente de despliegue:** en un Pull Request abierto, todavía sin integrar.

Los datos de la aplicación y del modelo son simulados (`es_simulado = true`, `origen = simulado`). Las fechas
corresponden a la zona horaria de Lima.

| Versión | Fecha | Estado | Referencia |
| --- | --- | --- | --- |
| PROY (en preparación) | 26–27/11/2026 | Pendiente de despliegue | PR #37 y PR #38 hacia `dev` |
| APF3 · modelo v1 integrado | 18/11/2026 | Publicado | `main` en `33acc2f` (PR #28, #32 y #34) |
| 2.1.0 · cuentas de demostración protegidas | 18/11/2026 | Publicado (sustituida por APF3) | etiqueta `v2.1.0` |
| 2.0.1 · corrección del diseño móvil | 17/11/2026 | Publicado (sustituida) | etiqueta `v2.0.1` |
| 2.0.0 · Arcomunity con Supabase | 17/11/2026 | Publicado (sustituida) | etiqueta `v2.0.0` |
| 1.x · MVP de APF2 | 11–13/10/2026 | Reemplazado por 2.0.0 | PR #1 a #4 |

---

## [PROY] — Pendiente de despliegue

### PR #37 · Corrección del modelo base y ciclo de mejora (`feat/modelo-mejora-proy`)

**Agregado**

- `ml/proy/`, sin modificar los archivos de APF3:
  - Regla de mejora registrada en Git antes del experimento (`REGLA_DE_MEJORA.md`, commit `d658c00`).
  - Ficha de coherencia de los siete criterios, ejecutada en código (`coherencia.py`).
  - Pruebas contrafactuales de fuga (`resultados/pruebas_fuga.json`).
  - Evaluación anidada de APF3 corregido y de tres candidatos:
    - variables de recencia;
    - reajuste de hiperparámetros;
    - ambos combinados.
  - Decisión escrita antes de usar la prueba (`decision.json`, commit `c296ff1`).
  - Evaluación única de la prueba (`evaluar_prueba.py`).
  - Escenario simulado de junta difusa para medir la robustez (`robustez.py`).
  - Esquemas JSON de entrada y salida del modelo servido (`esquema_entrada.json`, `esquema_salida.json`).

**Corregido** (observaciones del reporte de APF3)

- **Tabla anidada con dos versiones.** El empate exacto de AP en el mes externo 5 se resolvía distinto en Windows y en
  Colab. Ahora el desempate es determinista: AP redondeada a 6 decimales y gana la configuración más simple.
- **Huella del dataset.** `12bfe4d0…` (CRLF) y `53e1136b…` (LF) son el mismo contenido. `.gitattributes` fija LF para
  los CSV de `ml/`.
- **Entorno.** Cada ejecución registra las versiones de Python y las librerías, el sistema y el commit.

**Sin cambio, por decisión registrada**

- Se conserva la regresión logística v1 (`C = 10`, umbral 0,2258) como modelo servido.
- Ningún candidato superó a APF3 corregido en la evaluación anidada.
- El F1 de 0,759 que obtuvo PROY-A en la prueba no cambia la decisión, porque la selección se fijó antes.

### PR #38 · Flujo de extremo a extremo de la predicción (`feat/flujo-e2e-prediccion`)

**Agregado**

- **Migración `20261126001500_flujo_prediccion_e2e.sql`**, que no borra datos:
  - `predicciones_morosidad` registra el origen de cada fila (`modelo` o `regla_respaldo`), el motivo del respaldo y
    quién solicitó el cálculo.
  - `registro_predicciones`: bitácora de solo inserción de cada inferencia, con conservación de 12 meses (pg_cron).
  - `calcular_riesgo_periodo`: al generar las cuotas de un periodo se dispara su predicción.
  - `recordatorios` y `registrar_recordatorio`: acción auditada de la administración sobre una alerta.
  - `probar_entrada_modelo`: un caso escrito a mano; las entradas inválidas se rechazan con un mensaje claro.
  - `simular_falla_modelo`: solo en la junta de demostración.
- **Degradación controlada:**
  - **Regla manual de respaldo:** riesgo alto si hubo un atraso en los últimos 3 meses. Se aplica cuando el modelo no
    está disponible, falla o devuelve un valor fuera de [0, 1].
  - **Entrada incoherente:** se escala a revisión humana como riesgo medio.
- **Interfaz:**
  - Aviso «Regla manual» en las filas de respaldo.
  - Botón «Registrar recordatorio».
  - Estado «Recordado el …».
  - Prueba de fallas (solo en la demo) y formulario «Probar con un caso».
  - Tiempo límite de 8 s para el modelo.
  - Aviso de transparencia: «Sugerencia automática, decisión humana» (Ley N.° 31814).
- **Retorno probado** de la migración: `supabase/rollback/` y `supabase/tests/retorno-migracion-1500.test.ts`.
- **Entorno local de pruebas para el navegador:** `npm run local:supabase` y `npm run local:web`. Usa PGlite y la
  semilla demo, sin tocar producción. Incluye una demora controlada para probar el tiempo límite.

**Cambiado**

- `calcular_riesgo_morosidad` mantiene su firma y sus permisos. Ya no falla si falta el modelo: aplica la regla de
  respaldo.
- `predicciones_vigentes` agrega las columnas de origen, motivo y último recordatorio.
- `restaurar_demo_datos` pasa a ser un envoltorio que además limpia los recordatorios y apaga la falla simulada.

**Corregido** (detectado en la prueba en el navegador)

- El formulario de caso quedaba sin margen interior en móvil.
- El texto «Recordado el …» se cortaba en la tabla.
- El caso manual enviaba texto en lugar de números.

**Corregido** (auditoría del tiempo límite de 8 s, 27/11/2026)

- Podían quedar vigentes a la vez una predicción del modelo y otra de la regla para la misma cuota y corte. Ahora un
  índice único garantiza una sola por cuota y corte, y el último cálculo la reemplaza.
- Los cálculos de una misma junta ya no se ejecutan en paralelo: un bloqueo por junta evita que una respuesta tardía
  se mezcle con otra.
- La bitácora agrega `lote`, `solicitado_en` y `demora_ms` para separar reintentos y marcar las respuestas tardías.
- Tras el aviso de 8 s, la pantalla de predicción se vuelve a consultar sola y pide no volver a pulsar.

**Pendiente de despliegue**

- Aplicar la migración 1500 en el Supabase de producción. La aplica el responsable, siguiendo
  `docs/GUIA_MIGRACION_1500.md`.
- Integrar los PR #37 y #38 en `dev` y publicar `dev` → `main`. Cada paso requiere autorización.
- Verificar en producción la purga programada (pg_cron), que no se pudo probar en PGlite.

### Pruebas del PROY

- `npm test`: 151 de 151 en la rama del PR #38 (antes, 114). Se agregaron:
  - 23 pruebas del flujo, la degradación y los permisos;
  - 6 pruebas de reintentos y respuestas tardías;
  - 1 prueba del retorno de la migración;
  - 7 pruebas unitarias de la interfaz.
- `npm run build`: correcto.
- **Navegador (entorno local):**
  - registro nuevo → predicción;
  - recordatorio;
  - falla simulada;
  - entrada inválida;
  - caso válido;
  - permisos del propietario;
  - vista móvil;
  - tiempo límite de 8 s (8 099 ms y 8 043 ms);
  - respuesta tardía con recarga sola de la lista;
  - 3 reintentos simultáneos sin filas duplicadas.

---

## [APF3] — 18/11/2026 · Publicado (`main` en `33acc2f`)

**Agregado**

- **Modelo v1** de riesgo de morosidad: regresión logística, `C = 10`, umbral 0,2258.
  - Entrenado y evaluado en `ml/modelo_morosidad/`, con el notebook reproducible en Colab.
  - Reevaluado frente a SVM, KNN, árbol y boosting con una regla registrada antes de compararlos.
- **Cálculo del riesgo en PostgreSQL** (`calcular_riesgo_morosidad`, migración 1200), con paridad frente a
  scikit-learn (115 casos, diferencia < 10⁻⁹).
- **Pantalla «Predicción de morosidad»:** desempeño del modelo, predicciones actuales, factores y acción sugerida.
  Solo la ve la administración.
- **Matriz de confusión de prueba** en los metadatos del modelo (migración 1400).
- **Herramientas de demostración en Auditoría** (migración 1300): preparar, reiniciar y diagnosticar.
- **Accesibilidad:** modo oscuro, confirmaciones accesibles y ayudas para personas mayores. Auditoría WCAG con axe-core.
- **Despliegue alternativo** en Cloudflare Workers.

**Corregido**

- Las probabilidades extremas ya no se muestran como certeza.
- Aviso de que el modelo es experimental.
- Hora del cálculo en formato de 24 horas.
- Separación de la deuda vencida y la próxima cuota en el estado de cuenta.

## [2.1.0] — 18/11/2026

**Agregado**

- Cuentas públicas de demostración protegidas en la base de datos (migración 1100).
- Restauración nocturna con pg_cron y modo demostración visible en la interfaz.

## [2.0.1] — 17/11/2026

**Corregido**

- Diseño móvil de las pantallas de acceso y del menú lateral, con prueba de regresión responsive.

## [2.0.0] — 17/11/2026 · Arcomunity con Supabase

**Cambiado** (respuesta a la brecha de persistencia del MVP de APF2)

- **Autenticación y datos:** pasan de `localStorage` a Supabase Auth y PostgreSQL.
- **Operaciones financieras:** registro, cuotas, pagos y conciliación R1–R4 pasan a funciones RPC atómicas en el
  servidor.

**Agregado**

- **Seguridad de datos:** RLS por junta y unidad en todas las tablas y auditoría inmutable.
- **Archivos:** Storage privado para comprobantes y QR, con URLs firmadas.
- **Datos en vivo:** Realtime para cuotas y pagos.
- **Invitaciones:** código de invitación seguro, con límite de intentos por IP seudonimizada.
- **Dataset y ML:** exportación del dataset de morosidad para APF3 y preparación del registro de modelos y
  predicciones, sin fuga de información.
- **Pruebas:** con PGlite, contra Supabase real y en navegadores (Chrome y Edge).

**Corregido**

- **OCR:** lectura de montos y fechas de capturas reales de Yape y Plin.
- **Accesibilidad:** pantallas de acceso y menú móvil.

## [1.x] — 11–13/10/2026 · MVP de APF2

**Agregado**

- MVP con React y Vite:
  - registro con consentimiento;
  - generación de cuotas;
  - pago con comprobante y OCR;
  - conciliación R1–R4;
  - egresos, reportes, transparencia, auditoría y videovigilancia simulada.
- Diseño responsivo, estilos de impresión y pruebas unitarias con Vitest.

**Limitación que motivó la versión 2.0.0**

- Los datos y la autorización vivían en el `localStorage` del navegador: sin persistencia entre dispositivos y con un
  rol editable desde el cliente.
