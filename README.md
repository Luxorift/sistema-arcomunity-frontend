# Arcomunity — frontend del MVP

Interfaz en **React + TypeScript + Vite** para el proyecto universitario de gestión de cuotas de vigilancia vecinal. Está lista para mostrar y probar en un navegador. **Todos los datos son ficticios.**

## Abrir el proyecto

Necesitas Node.js 20.19 o superior y npm. En una terminal, entra a esta carpeta y ejecuta:

```bash
npm install
npm run dev
```

Abre la dirección que muestre la terminal, normalmente `http://localhost:5173`. Para generar la versión estática:

```bash
npm run build
```

El resultado queda en `dist/`. Si recibes la carpeta comprimida, descomprímela antes de ejecutar los comandos. `node_modules/` no se incluye porque npm lo instala automáticamente.

## Cuentas de demostración

Contraseña de todas las cuentas: **`Demo2026!`**. También puedes pulsar un perfil en la pantalla de acceso para completar los campos.

| Rol | Correo | Qué muestra |
| --- | --- | --- |
| Administrador | `admin@arcomunity.demo` | Panel, configuración, cuotas, conciliación y reportes |
| Propietario | `casa12@arcomunity.demo` | Cuota pendiente para probar el pago |
| Propietario | `casa08@arcomunity.demo` | Cuota con pago en revisión |
| Propietario | `dpto301@arcomunity.demo` | Otra cuenta de propietario |

El código de invitación del registro es **`ARCO2026`**. Se puede cambiar desde Configuración.

## Recorrido sugerido para la presentación

1. Entra como administrador y revisa **Configuración**. Puedes subir una imagen de QR JPG o PNG de hasta 2 MB. El proyecto no trae un QR de cobro real.
2. En **Cuotas**, pulsa **Generar cuotas del mes**. Si ya existen, informa cuántas había y no las duplica.
3. Cierra sesión y entra como `casa12@arcomunity.demo`.
4. Pulsa **Pagar** en la cuota actual. Sube una captura propia de prueba o pulsa **Cargar comprobante de ejemplo simulado**. Comprueba y envía los campos.
5. Revisa **Transparencia**. Solo se muestran códigos de unidad, estados y fechas de pago.
6. Entra como administrador y abre **Conciliación**. La semilla incluye un pago de Casa 08 con monto distinto que puedes aprobar o rechazar. Si rechazas, el motivo es obligatorio.
7. Visita **Reportes** para imprimir el resumen, exportar el libro en Excel (`.xlsx`) para presentación o descargar el CSV para análisis.

### Opciones de exportación en Reportes

En la pantalla **/admin/reportes** se dispone de tres acciones de salida:

- **Imprimir / PDF:** abre el diálogo de impresión del navegador para generar una vista lista para compartir o archivar.
- **Exportar Excel (.xlsx):** genera directamente en el cliente el archivo `arcomunity_dataset_morosidad.xlsx` con dos hojas formateadas:
  - **Dataset:** las 360 cuotas del piloto con encabezados claros en español, fechas reales (formato `dd/mm/aaaa`), montos numéricos, autofiltro activado, encabezado inmovilizado y filas con `Moroso = 1` resaltadas en rojo claro. Pensado para **presentación ejecutiva y lectura en Microsoft Excel 2016+** sin problemas de delimitadores regionales.
  - **Diccionario de datos:** tabla explicativa con cada campo, su descripción funcional, tipo de dato, ejemplo y notas del piloto.
- **Exportar CSV (datos):** descarga `arcomunity_dataset_morosidad_simulado.csv` con codificación UTF-8 con BOM, delimitador por comas (`,`) y nombres de columna técnicos (`unidad_ref`, `periodo`, `dias_atraso`, `moroso`, etc.). Destinado a **análisis de datos y entrenamiento del modelo de Machine Learning en Python/pandas (APF3)**.

En **Auditoría → Restablecer demo** puedes recuperar el estado inicial.

## Pantallas incluidas

- Acceso y registro con consentimiento obligatorio.
- Portal del propietario, pago con comprobante y OCR en el navegador, con ingreso manual como respaldo.
- Videovigilancia comunitaria mínima (`/videovigilancia`) para administrador y propietarios, con transmisión simulada en canvas a ~10 fps, soporte para feeds MJPEG y embeds seguros (iframe sandboxed), control de acceso por rol y auditoría de visualización.
- Dashboard del administrador, configuración (incluye gestión de cámaras), padrón de unidades, cuotas, conciliación, pagos manuales, egresos, reportes, Excel/CSV y auditoría.
- Portal de transparencia sin nombres ni comprobantes de otros vecinos.
- Diseño adaptable a celular.

La semilla contiene **30 unidades y 12 meses de cuotas**, egresos, 2 cámaras simuladas activas y pagos ficticios. Los cambios quedan guardados en el almacenamiento local del navegador (`localStorage`); la sesión se mantiene en `sessionStorage`.

## Alcance y limitaciones

Esta entrega es **solo frontend**. El inicio de sesión, permisos, conciliación y bitácora se simulan en el navegador para la demostración. El código de la cuenta registrada se almacena como un hash de prueba en `localStorage`; esto **no equivale a autenticación segura**. No hay servidor, base de datos compartida, API de Yape/Plin, verificación bancaria, almacenamiento privado de comprobantes ni despliegue público. Los cambios de un navegador no aparecen en otro.

**Videovigilancia y cámaras IP:**
- Los navegadores web estándar no reproducen transmisiones RTSP de forma nativa por restricciones de protocolo. Para integrar cámaras IP reales en producción se requiere un gateway de retransmisión intermedia (como MediaMTX o go2rtc) que convierta RTSP a WebRTC, HLS o WebSockets; esta arquitectura queda pendiente para el APF3.
- En este MVP 1 se implementa la versión mínima funcional: cámaras simuladas interactivas mediante canvas con reloj y telemetría en tiempo real, soporte de feeds MJPEG por URL y embeds por URL mediante iframes con sandbox (`allow-scripts allow-same-origin`). Las URLs externas requieren HTTPS obligatorio y pueden fallar si el sitio de origen bloquea ser embebido mediante cabeceras `X-Frame-Options` o políticas CORS.
- No se realiza almacenamiento de video ni grabaciones. Conforme a la Ley N.º 29733, las imágenes se destinan exclusivamente a la supervisión de seguridad en áreas comunes.

El OCR usa Tesseract.js en el navegador y puede requerir conexión a internet para descargar el modelo de idioma español. Si no logra leer una captura, los datos se pueden ingresar manualmente. El botón de comprobante de ejemplo carga información simulada para presentar el flujo sin usar un pago real.

Para convertir esta demo en un producto real, habría que conectar un backend con autenticación, validaciones y permisos en el servidor, base de datos, almacenamiento privado de imágenes y reglas de conciliación del lado servidor. Nunca se debe usar la lógica de esta demo como validación de pagos reales.

## Estructura

```text
src/
  App.tsx       Rutas, acceso y registro
  admin.tsx     Pantallas del administrador
  owner.tsx     Portal del propietario, pago y transparencia
  model.ts      Tipos, formatos y semilla ficticia
  store.tsx     Estado y acciones de la demo
  image.ts      Reducción de tamaño de imágenes
  ui.tsx        Componentes visuales compartidos
  styles.css    Estilos y adaptación móvil
```
