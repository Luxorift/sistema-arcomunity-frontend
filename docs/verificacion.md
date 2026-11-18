# Registro de verificaciones técnicas

Fecha: 17–18 de noviembre de 2026. Entorno: frontend local (`npm run dev`) contra el proyecto Supabase
del equipo, con la junta de demostración simulada. Todas las pruebas que modifican datos restauran la
semilla al terminar (la auditoría generada se conserva por diseño).

## Pruebas automatizadas

| Comando | Qué cubre | Resultado |
| --- | --- | --- |
| `npm test` | Reglas de negocio, OCR, fechas del Perú, mensajes y base de datos en PGlite (RLS, Storage, RPC, límite de intentos) | Todas en verde |
| `npm run test:remoto` | Supabase real: anónimo, registro, aislamiento entre propietarios y juntas, Storage, Realtime, conciliación, reversión, pago manual, métricas, transparencia, dataset, QR y auditoría | 70/70 |
| `npm run test:navegadores` | Edge (móvil) + Chrome (escritorio) con sesiones aisladas: pago, revisión en tiempo real, aprobación y actualización en el otro navegador | 10/10 |

## Recuperación de contraseña

- Supabase Auth → URL Configuration verificado por API (sin enviar correos): *Site URL*
  `https://sistema-arcomunity-frontend.vercel.app`; permitidas `…/restablecer` en Vercel y
  `http://localhost:5173/restablecer`; una URL no permitida cae en la *Site URL*.
- Flujo probado en Edge con un usuario temporal y un enlace generado por la API de administración:
  abre `/restablecer`, rechaza contraseñas cortas, guarda la nueva, la nueva funciona y la anterior no.
- **No verificado: la entrega del correo.** El servicio de correo integrado de Supabase está pensado
  para pruebas (pocos envíos por hora y, según su documentación, solo a miembros del equipo del
  proyecto). Para vecinos reales hay que configurar un SMTP propio en Supabase → Authentication → SMTP.

## OCR de comprobantes

- Motor real (Tesseract.js en el navegador) sobre imágenes con el formato de Yape, Plin y una
  constancia de transferencia generadas para la prueba (no son capturas reales).
- Hallazgo: con la segmentación por defecto Tesseract **omitía el monto grande de Yape** ("S/ 150").
  Con PSM 4 (una columna) y el nuevo lector de fechas textuales ("16 nov. 2026") los tres formatos
  devuelven monto, fecha y operación correctos con 94–95 % de confianza.
- Pendiente: probar con capturas reales (anonimizadas) de distintos celulares.

## Código de invitación

- Antes: `unidades_disponibles` permitía probar códigos sin límite (fuerza bruta).
- Ahora: máximo 10 códigos incorrectos por IP y 200 en total cada 15 minutos; IP guardada solo como
  hash y purgada a las 24 h; códigos de al menos 8 caracteres con letras y números; botón para
  generar códigos aleatorios `ARCO-XXXX-XXXX`.
- Recomendación: fuera de la demostración, reemplazar `ARCO2026` por un código generado.
- 0900 aplicada en Supabase (17/11/2026). `test:remoto` la verifica sobre una junta temporal: genera y
  guarda códigos `ARCO-XXXX-XXXX`, rechaza códigos débiles, solo el administrador de la junta puede
  generarlos y nadie lee los intentos desde la API (78/78).
- **Hallazgo tras aplicarla:** el límite por IP tomaba el primer valor de `X-Forwarded-For`, que escribe
  el cliente. Contra Supabase real, 10 fallos con una IP falsa bloquearon esa IP falsa pero no otra ni la
  real: el límite se saltaba y se podía bloquear la IP de otra persona.
- Corrección en la migración 1000: usar `CF-Connecting-IP` (Cloudflare está delante de Supabase y la fija)
  o, si falta, el último valor público de `X-Forwarded-For`. Las pruebas en PGlite fallan sin la 1000 y
  pasan con ella. `npm run test:limite` lo comprueba contra el servidor real una vez aplicada.
- Riesgo que se mantiene por diseño: el tope global de 200 fallos cada 15 minutos permite que alguien
  bloquee el registro de todos durante 15 minutos. Con códigos aleatorios de 8 caracteres adivinar es
  inviable; si ese bloqueo llega a ocurrir, conviene subir el tope o moverlo a un límite del proxy.
- 1000 aplicada en Supabase (17/11/2026). `npm run test:limite`: la base recibe `cf-connecting-ip`; tras
  10 fallos, el intento 11 se bloquea aunque cambie `X-Forwarded-For`; el servicio libera el bloqueo (6/6).

## Realtime

- `test:remoto` fallaba de forma intermitente («0 eventos»): el canal de la prueba podía unirse antes de
  que el token del administrador llegara al socket y, como anónimo, RLS no le entrega pagos. Ahora la
  prueba fija el token antes de suscribirse (4 de 4 ejecuciones seguidas en verde).
- La app recarga cuotas y pagos al volver a la pestaña o al celular, por si el socket perdió eventos en
  segundo plano (verificado en Chrome: recarga cuotas, pagos y auditoría).

## Calendario peruano

`src/lib/fechas-peru.ts` contiene 16 feriados nacionales para 2026, consistentes con:

- D. Leg. N.º 713 (12 feriados: 1 ene, Jueves y Viernes Santo, 1 may, 29 jun, 28 y 29 jul, 30 ago,
  8 oct, 1 nov, 8 dic, 25 dic).
- Ley N.º 31788 (7 de junio, Batalla de Arica y Día de la Bandera), publicada en El Peruano el
  15/06/2023.
- Ley N.º 31822 (23 de julio, Día de la Fuerza Aérea del Perú), 2023.
- 6 de agosto (Batalla de Junín) y 9 de diciembre (Batalla de Ayacucho), aprobados por el Congreso
  en 2022 y 2021 y recogidos por El Peruano (nota del 10/07/2023 sobre los cuatro nuevos feriados).

La página oficial `gob.pe/feriados` bloquea el acceso automatizado (HTTP 418), por lo que la
verificación se hizo con El Peruano (diario oficial) y el texto de las leyes citadas. Los días no
laborables que decreta cada año el Ejecutivo **no** se incluyen: no son feriados.

## Dataset de morosidad (APF3)

- `npm run dataset:apf3` exporta 359 cuotas simuladas (30 unidades, 2025-12 a 2026-11) con 75 morosas
  (20,9 %). Las 16 validaciones automáticas pasan; detalle en `ml/dataset_apf3/validacion_dataset.md`.
- Diferencia con el APF2 (360 / 76): la cuota con pago en revisión se excluye porque su etiqueta no es
  definitiva; con la regla del APF2 los mismos datos dan 76. Los periodos se desplazan un mes porque la
  semilla se cargó en noviembre.
- pandas 3.1.1 carga el CSV; Excel (es-PE) abre el `.xlsx`. El CSV con doble clic en Excel es-PE queda en
  una columna por el separador regional `;` (importarlo con delimitador coma).
- Después de `test:remoto` y `test:navegadores` el CSV regenerado es idéntico: las pruebas no alteran la semilla.

## Build de producción e interfaz

- Build solo con variables públicas: sin clave de servicio, contraseña ni JWT `service_role` en `dist/`.
- Sobre `vite preview`: `test:navegadores` 10/10 y `test:ui` sin problemas en 18 pantallas, escritorio
  (1366 px) y móvil (375 px).
- Corregido con la auditoría: en móvil no había `h1` visible en las pantallas de acceso; enlaces de acceso
  con menos de 24 px; el menú lateral cerrado proyectaba sombra en el borde y dejaba sus enlaces en el
  orden de tabulación.

## Dependencias (`npm audit`, 17/11/2026)

- Producción: `exceljs` → `uuid` (moderada, comprobación de `buf` en v3/v5/v6). `exceljs` solo llama a
  `uuidv4()` sin `buf`: no afecta. La «solución» de npm es bajar a `exceljs` 3.4.0; no se aplica.
- Desarrollo: `picomatch` ≤ 4.0.7 (ReDoS) vía `vite`/`vitest`. No hay versión 4.x corregida publicada y
  solo procesa patrones del propio proyecto; revisar cuando salga una actualización.
- Todas las dependencias declaradas se usan.
