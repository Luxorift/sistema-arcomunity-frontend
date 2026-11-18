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
