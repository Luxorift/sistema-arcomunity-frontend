> **ADENDA DE PRECEDENCIA (prevalece sobre el resto del documento)**
>
> 1. **Stack real del proyecto:** Vite + React con persistencia local (localStorage/IndexedDB). **No migrar** a Next.js, Supabase ni Vercel por ahora. Donde el documento mencione Supabase, RLS, Auth o Storage (secciones 3, 8.8, 10 y 12), léelo como referencia para una migración futura. Para eso, todo acceso a datos debe pasar por una capa de repositorios.
> 2. **Videovigilancia (US14):** pasa de *Could / Pendiente* a **Should / Implementado en versión mínima**: página de cámaras con transmisión simulada o URL configurable, acceso por rol y registro en auditoría. Las cámaras IP reales por RTSP quedan pendientes (requieren un gateway).
> 3. **Seguridad:** el control de acceso por rol es del lado del frontend. No afirmar en ningún texto de la interfaz ni de la documentación que existe RLS, cifrado en servidor ni almacenamiento privado.
> 4. **Métricas:** los indicadores de los datos semilla son simulados; deben calcularse a partir de los datos, no estar escritos a mano.
> 5. **Despliegue:** hosting estático (Vercel o Netlify) con reescritura a `index.html`.

---

**ESPECIFICACIÓN TÉCNICA Y FUNCIONAL**

**MVP 1 — Plataforma de gestión transparente de cuotas de vigilancia vecinal**

Proyecto: **Arcomunity S.A.C.** (empresa modelo) — Caso 12 del pool: gestión transparente de cuotas de vigilancia vecinal con conciliación de pagos.

Curso: Innovación y Transformación Digital (UTP) — Entregable APF2, MVP funcional y desplegado.

Versión del documento: 1.0 — octubre de 2026.

**0. Instrucciones de trabajo para el asistente de desarrollo**

Este documento es la especificación completa del producto a construir. Léelo entero antes de escribir código y trabájalo según estas reglas:

- **Rol:** actúa como desarrollador full-stack senior. El resultado debe ser una aplicación web **funcional, desplegada y con URL pública**, no maquetas ni pantallas estáticas.

- **Trabajo por fases:** sigue las fases de la sección 15, una por mensaje. Al terminar cada fase entrega el **código completo de cada archivo**, indicando su ruta. No uses «…», «resto igual» ni fragmentos omitidos.

- **Supuestos:** si algo es ambiguo, elige la opción más simple que cumpla con lo pedido y anótala en una lista de «Supuestos y limitaciones». No inventes requisitos nuevos.

- **Prioridad:** primero el flujo principal de extremo a extremo (registrar cuota → pagar con comprobante → conciliar → ver en dashboard y portal). Después, lo secundario.

- **Idioma y formato:** interfaz 100 % en español (Perú), montos en soles con el formato «S/ 150.00», fechas dd/mm/aaaa, zona horaria America/Lima. Nombres de tablas y campos en español, snake_case, tal como aparecen en la sección 8.

- **Datos:** todo dato de prueba es **simulado** y debe quedar marcado como tal. No uses datos personales reales.

- **Usuario no necesariamente técnico:** explica con pasos exactos y comandos copiables cómo crear las cuentas (GitHub, Supabase, Vercel), configurar variables de entorno y desplegar.

- **Calidad:** TypeScript estricto, validación de entradas en servidor, manejo de errores con mensajes claros al usuario y sin exponer claves secretas en el cliente.

**1. Contexto y objetivo del MVP**

**1.1 Contexto**

Arcomunity S.A.C. es una MiPYME modelo de administración de condominios en Lima. Las juntas vecinales que administra cobran la cuota de vigilancia por Yape o Plin; el administrador revisa las capturas de pago una por una, las registra a mano y no existe un reporte transparente de recaudación, morosidad ni de pagos al personal de vigilancia. Esto produce demoras, errores de registro y desconfianza entre propietarios.

**1.2 Problema de ingeniería (heredado del APF1)**

Falta de un sistema digital de registro, conciliación y visualización de pagos para registrar el 100 % de los pagos de la cuota de vigilancia y reducir en 80 % el tiempo de conciliación, que permita garantizar transparencia en la recaudación para los propietarios de Arcomunity.

**1.3 Objetivo medible del MVP**

*«Para el administrador de la junta vecinal y los propietarios de Arcomunity, el MVP permitirá registrar pagos de la cuota de vigilancia con comprobante, conciliarlos mediante reglas automáticas y visualizar el estado de los pagos con transparencia, con el propósito de registrar el 100 % de los pagos y reducir en 80 % el tiempo de conciliación, medido mediante el porcentaje de pagos registrados y los minutos de conciliación por pago.»*

**1.4 Indicadores que el sistema debe poder calcular**

| **Indicador**                      | **Definición exacta**                                                                           | **Fuente de datos** |
|------------------------------------|-------------------------------------------------------------------------------------------------|---------------------|
| % de pagos registrados             | Pagos informados con comprobante o registro manual ÷ cuotas marcadas como pagadas en el periodo | pagos, cuotas       |
| Minutos de conciliación por pago   | conciliado_en − subido_en (promedio del periodo, en minutos)                                    | pagos               |
| % de conciliación automática       | Pagos con estado conciliado_auto ÷ total de pagos del periodo                                   | pagos               |
| % de vecinos al día vs. morosos    | Cuotas pagadas ÷ cuotas generadas; morosa = pendiente con fecha de vencimiento vencida          | cuotas              |
| Recaudado, egresos y saldo del mes | Suma de pagos conciliados; suma de egresos; diferencia                                          | pagos, egresos      |

**2. Alcance del MVP 1**

**2.1 Dentro del alcance (debe quedar implementado)**

- Autenticación con roles (administrador y propietario) y consentimiento de tratamiento de datos.

- Configuración de la junta: monto de la cuota, día de vencimiento y **QR de Yape** (imagen subida, puede ser el QR de un Yape personal) con nombre del titular.

- Padrón de unidades y propietarios; generación mensual de cuotas.

- Pago por parte del propietario: ve el QR, paga desde su app, sube la captura; el sistema extrae monto, fecha y número de operación con OCR.

- Conciliación automática por reglas, cola de revisión manual con aprobar/rechazar, y registro manual de pagos (efectivo).

- Registro de egresos (pago al personal de vigilancia).

- Dashboard del administrador, portal de transparencia para propietarios, reporte mensual y exportación del dataset en CSV.

- Bitácora de auditoría y datos simulados de 12 meses (seed).

**2.2 Fuera del alcance (queda «Pendiente para APF3» o PROY)**

- Integración real con APIs de Yape/Plin o con bancos (en el MVP la conciliación valida la coherencia del comprobante; no consulta al banco).

- Notificaciones automáticas por WhatsApp.

- Transmisión de video en vivo de cámaras IP (RTSP). Opcional si sobra tiempo: una página que muestre una URL de video embebible configurada por el administrador.

- Modelo de Machine Learning de morosidad y detección de anomalías (APF3).

- Control de turnos del personal de vigilancia y multi-junta completo (el esquema ya incluye junta_id para escalar).

**3. Stack tecnológico**

El pool del curso presenta las tecnologías como ejemplo; no son obligatorias. Se elige un stack que **minimiza el riesgo de la demo en vivo**: un solo repositorio, un solo despliegue, base de datos real y sin costo en plan gratuito.

| **Componente**                          | **Elección**                                                                                      | **Motivo**                                                                     |
|-----------------------------------------|---------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Frontend y backend                      | Next.js (App Router) + TypeScript + Tailwind CSS. API con Route Handlers/Server Actions (Node.js) | React/Next.js y Node.js figuran en el pool. Un solo proyecto desplegable.      |
| Base de datos, autenticación y archivos | Supabase: PostgreSQL, Auth (correo + contraseña), Storage privado y políticas RLS                 | PostgreSQL real, roles y almacenamiento de comprobantes sin montar servidores. |
| OCR                                     | Tesseract.js ejecutado en el navegador (idioma «spa»), con ingreso manual como respaldo           | Gratuito, sin servidor y compatible con Vercel.                                |
| Gráficos y validación                   | Recharts; zod para validar entradas (cliente y servidor)                                          | Librerías estándar y ligeras.                                                  |
| Despliegue                              | Vercel (aplicación) + Supabase (datos); código en GitHub                                          | URL pública sin contraseñas complejas y despliegue automático.                 |
| Pagos                                   | QR estático de Yape (imagen) + captura del comprobante                                            | Suficiente para el MVP; la API real queda para etapas posteriores.             |

**Nota de arquitectura:** la arquitectura del APF1 mencionaba FastAPI y Render. En el MVP se actualiza a Next.js (Node.js) + Supabase para evitar los arranques en frío y los límites de la base gratuita de Render durante la demo. Python (pandas y scikit-learn) se reserva para el piloto de ML del APF3, que consumirá el CSV exportado por el sistema.

**Costo del MVP:** S/ 0 en planes gratuitos. Verificar en las páginas oficiales los límites vigentes del plan gratuito de Vercel y Supabase antes de redactar la viabilidad económica.

**4. Roles y permisos**

| **Acción**                                                    | **Administrador** | **Propietario**                           |
|---------------------------------------------------------------|-------------------|-------------------------------------------|
| Configurar junta, cuota y QR de Yape                          | Sí                | No                                        |
| Crear/editar unidades y propietarios                          | Sí                | No                                        |
| Generar cuotas del mes                                        | Sí                | No                                        |
| Ver su estado de cuenta y pagar su cuota                      | Sí (todas)        | Solo su unidad                            |
| Ver comprobantes de pago                                      | Todos             | Solo los suyos                            |
| Conciliar, aprobar o rechazar pagos; registrar pagos manuales | Sí                | No                                        |
| Registrar egresos                                             | Sí                | No                                        |
| Dashboard completo, auditoría y exportar CSV                  | Sí                | No                                        |
| Portal de transparencia (estado por unidad, ingresos/egresos) | Sí                | Sí (sin nombres ni comprobantes de otros) |

El rol **administrador no se registra públicamente**: se crea con el seed. Los propietarios se registran con el código de invitación de la junta.

**5. Product Backlog (historias de usuario)**

La columna «Estado en MVP» vincula el backlog con la URL desplegada (Implementado / Pendiente para APF3). Todas las historias «Must» y «Should» deben quedar implementadas.

| **ID** | **Historia de usuario**                                                                                                                                       | **Criterios de aceptación**                                                                 | **MoSCoW**    | **Estado en MVP**   |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|---------------|---------------------|
| US01   | Como administrador, quiero configurar la cuota, el vencimiento y el QR de Yape para que los vecinos sepan cuánto y cómo pagar.                                | Guarda monto \> 0, día 1–28 y QR (jpg/png ≤ 2 MB); el QR se muestra en la pantalla de pago. | Must          | Implementado        |
| US02   | Como administrador, quiero registrar unidades y propietarios para tener el padrón de cuotas.                                                                  | Alta, edición y baja lógica de unidades; código de unidad único por junta.                  | Must          | Implementado        |
| US03   | Como propietario, quiero registrarme e iniciar sesión aceptando el tratamiento de mis datos para acceder de forma segura.                                     | No se registra sin consentimiento; el consentimiento queda con fecha y hora.                | Must          | Implementado        |
| US04   | Como administrador, quiero generar las cuotas del mes de todas las unidades en un clic para no hacerlo a mano.                                                | Es idempotente: ejecutarlo dos veces no duplica cuotas; muestra cuántas creó.               | Must          | Implementado        |
| US05   | Como propietario, quiero ver mi estado de cuenta y el QR de pago para pagar mi cuota.                                                                         | Lista cuotas con estado (pagada, en revisión, pendiente, morosa) y botón «Pagar».           | Must          | Implementado        |
| US06   | Como propietario, quiero subir la captura de mi pago y que se extraigan monto, fecha y n.º de operación para no digitarlos.                                   | OCR precarga los campos; el propietario puede corregirlos; si el OCR falla, ingresa manual. | Must          | Implementado        |
| US07   | Como administrador, quiero que el sistema concilie automáticamente con reglas y solo me muestre los casos con alertas para reducir mi tiempo de conciliación. | Aplica las reglas R1–R4 (sección 6.2); registra minutos de conciliación.                    | Must          | Implementado        |
| US08   | Como administrador, quiero aprobar o rechazar pagos en revisión con motivo para controlar los casos dudosos.                                                  | Rechazo exige motivo; ambas acciones actualizan la cuota y la auditoría.                    | Must          | Implementado        |
| US09   | Como administrador, quiero registrar pagos en efectivo o sin captura para que el 100 % de los pagos quede registrado.                                         | Crea pago conciliado manual y marca la cuota como pagada.                                   | Should        | Implementado        |
| US10   | Como administrador, quiero un dashboard con recaudado, pendiente, % al día vs. morosos y lista de morosos para dar seguimiento.                               | Cifras coinciden con los datos; filtro por mes.                                             | Must          | Implementado        |
| US11   | Como propietario, quiero un portal de transparencia con el estado de pagos por unidad y los ingresos/egresos del mes para confiar en el manejo del dinero.    | No muestra nombres completos ni comprobantes de otros; resalta mi unidad.                   | Must          | Implementado        |
| US12   | Como administrador, quiero registrar egresos (pago al personal de vigilancia) para que el reporte muestre ingresos y egresos.                                 | Egreso con fecha, concepto, beneficiario y monto; se refleja en saldo y transparencia.      | Should        | Implementado        |
| US13   | Como administrador, quiero exportar el reporte mensual y el dataset en CSV para rendir cuentas y preparar el análisis de datos.                               | Reporte imprimible/PDF y CSV con las columnas de la sección 11.                             | Should        | Implementado        |
| US14   | Como propietario, quiero ver la cámara de la zona común para supervisar la seguridad.                                                                         | Streaming RTSP en vivo con acceso por rol.                                                  | Could         | Pendiente para APF3 |
| US15   | Como propietario, quiero recibir recordatorios de pago por WhatsApp para no atrasarme.                                                                        | Plantillas de WhatsApp Business.                                                            | Won't (MVP 1) | Pendiente para APF3 |
| US16   | Como administrador, quiero alertas tempranas de morosidad por vecino para actuar antes del vencimiento.                                                       | Modelo de clasificación con scikit-learn sobre el dataset exportado.                        | Won't (MVP 1) | Pendiente para APF3 |

**6. Flujos del sistema**

**6.1 Flujo principal (el que se mostrará en la demo)**

1.  El **administrador** inicia sesión, revisa la configuración (cuota S/ 150, QR de Yape) y pulsa **«Generar cuotas del mes»**.

2.  El **propietario** inicia sesión, ve su cuota pendiente y pulsa **«Pagar»**: ve el monto y el QR de Yape.

3.  Paga desde su app, vuelve y **sube la captura**. El navegador ejecuta el OCR y precarga monto, fecha y n.º de operación.

4.  El propietario confirma los datos y envía. El servidor valida, guarda el comprobante y **aplica las reglas de conciliación**.

5.  Si pasa todas las reglas, el pago queda **conciliado automáticamente** y la cuota **pagada**. Si no, queda **en revisión** con alertas.

6.  El administrador abre **Conciliación**, ve solo los pagos con alertas, revisa el comprobante y **aprueba o rechaza**.

7.  El **dashboard** y el **portal de transparencia** reflejan el cambio al instante (recaudado, % al día, morosos).

**6.2 Reglas de conciliación (se ejecutan en el servidor, nunca solo en el cliente)**

| **Regla**           | **Condición**                                                                                                               | **Si no se cumple**             |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| R1 Monto            | monto_declarado es igual al monto de la cuota                                                                               | Alerta «monto_no_coincide»      |
| R2 Operación única  | numero_operacion no existe en otro pago de la junta                                                                         | Alerta «operacion_duplicada»    |
| R3 Fecha            | fecha_operacion no es futura y no es anterior al primer día del periodo menos 5 días                                        | Alerta «fecha_fuera_de_periodo» |
| R4 Calidad del dato | monto, fecha y n.º de operación presentes y comprobante adjunto (OCR confianza ≥ 60 o campos corregidos por el propietario) | Alerta «datos_incompletos»      |

- **Sin alertas** → estado del pago «conciliado_auto»; cuota «pagada»; se guardan fecha_pago y dias_atraso.

- **Con alguna alerta** → estado «pendiente_revision»; cuota «en_revision»; las alertas se guardan en el campo alertas.

- Parámetro de la junta **conciliacion_automatica** (verdadero por defecto): si es falso, todo pago pasa a revisión manual.

- Limitación a declarar: la conciliación valida coherencia del comprobante contra la cuota; no consulta al banco. El administrador puede verificar en su app de Yape al revisar los casos con alertas.

**6.3 Estados**

| **Entidad** | **Estados y transiciones**                                                                                                                                                                                                                                         |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| cuota       | pendiente → en_revision (al enviarse un pago con alertas) → pagada \| pendiente. pendiente → pagada (conciliado_auto, pago manual). «Morosa» no se guarda: es una condición calculada (pendiente y fecha_vencimiento \< hoy) expuesta en la vista v_cuotas_estado. |
| pago        | pendiente_revision → conciliado_manual \| rechazado. Nuevo pago → conciliado_auto \| pendiente_revision. Pago manual → conciliado_manual.                                                                                                                          |
| rechazo     | Al rechazar, la cuota vuelve a «pendiente» y el propietario ve el motivo y puede volver a enviar un pago.                                                                                                                                                          |

**6.4 Flujos secundarios**

1.  **Registro de propietario:** /registro → nombre completo, correo, contraseña, teléfono (opcional), código de junta, unidad disponible, casilla obligatoria de consentimiento (Ley N.º 29733) → crea usuario, perfil y asigna la unidad → /mi-cuenta.

2.  **Pago manual:** /admin/pagos → «Registrar pago manual» → elige unidad y cuota, método (efectivo/transferencia), monto, fecha → estado conciliado_manual, cuota pagada, auditoría.

3.  **Egreso:** /admin/egresos → fecha, concepto (pago_vigilante, insumos, otros), beneficiario, monto, comentario → se refleja en dashboard y transparencia.

4.  **Reporte mensual:** /admin/reportes → selecciona mes → vista imprimible (ingresos, egresos, saldo, lista de unidades con estado) y botón «Exportar CSV» del dataset.

5.  **Auditoría:** cada creación, aprobación, rechazo, pago manual, egreso y generación de cuotas inserta un registro en auditoria con usuario, acción y detalle.

**7. Pantallas**

| **Ruta**             | **Rol**     | **Contenido y comportamiento**                                                                                                                          |
|----------------------|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| /login               | Público     | Correo y contraseña; mensajes de error claros; redirige según rol.                                                                                      |
| /registro            | Público     | Formulario del flujo 6.4 con consentimiento obligatorio.                                                                                                |
| /mi-cuenta           | Propietario | Datos de su unidad, cuotas con estado, historial de pagos y motivo si hubo rechazo.                                                                     |
| /pagar/\[cuotaId\]   | Propietario | Monto, QR de Yape, titular, instrucciones, carga de captura, barra de progreso del OCR, formulario editable y resultado.                                |
| /transparencia       | Ambos       | Selector de mes; tarjetas de total recaudado, % de unidades al día, egresos y saldo; tabla por unidad con estado y fecha de pago.                       |
| /admin               | Admin       | Dashboard: recaudado, pendiente, % al día vs. morosos, minutos promedio de conciliación, % conciliación automática, gráfico mensual y lista de morosos. |
| /admin/configuracion | Admin       | Cuota, día de vencimiento, titular y QR de Yape, interruptor de conciliación automática, código de invitación.                                          |
| /admin/unidades      | Admin       | Listado, alta, edición y baja lógica de unidades; propietario asignado.                                                                                 |
| /admin/cuotas        | Admin       | Botón «Generar cuotas del mes» y listado de cuotas con filtros.                                                                                         |
| /admin/conciliacion  | Admin       | Cola de pagos con alertas, comprobante (URL firmada), datos extraídos, aprobar/rechazar con motivo.                                                     |
| /admin/pagos         | Admin       | Historial de pagos y registro de pago manual.                                                                                                           |
| /admin/egresos       | Admin       | Registro y listado de egresos.                                                                                                                          |
| /admin/reportes      | Admin       | Reporte mensual imprimible y exportación CSV.                                                                                                           |
| /admin/auditoria     | Admin       | Bitácora de acciones (solo lectura).                                                                                                                    |

**Requisitos de interfaz:** diseño responsive con prioridad en celular (los vecinos pagan desde el teléfono), letra legible (mínimo 16 px en texto principal), botones grandes, lenguaje sencillo, estados de carga y mensajes de éxito/error visibles. La navegación del administrador y la del propietario son distintas y están protegidas por rol.

**8. Modelo de datos (PostgreSQL / Supabase)**

Entregar un **script SQL completo** (tablas, restricciones, índices, vistas, políticas RLS y datos semilla). Todas las tablas llevan creado_en (timestamptz, por defecto now()). Claves primarias uuid con gen_random_uuid().

**8.1 juntas**

| **Campo**               | **Tipo**      | **Regla**                           |
|-------------------------|---------------|-------------------------------------|
| id                      | uuid PK       |                                     |
| nombre                  | text          | Obligatorio                         |
| codigo_invitacion       | text          | Único; usado en el registro         |
| cuota_mensual           | numeric(10,2) | \> 0                                |
| dia_vencimiento         | int           | Entre 1 y 28                        |
| yape_titular            | text          | Nombre mostrado junto al QR         |
| yape_qr_path            | text          | Ruta de la imagen del QR en Storage |
| conciliacion_automatica | boolean       | Por defecto true                    |

**8.2 perfiles (extiende auth.users)**

| **Campo**       | **Tipo**     | **Regla**                         |
|-----------------|--------------|-----------------------------------|
| id              | uuid PK/FK   | Igual a auth.users.id             |
| junta_id        | uuid FK      | Referencia a juntas               |
| nombre_completo | text         | Obligatorio                       |
| correo          | text         | Obligatorio                       |
| telefono        | text         | Opcional; 9 dígitos si se ingresa |
| rol             | text         | Check: 'admin' o 'propietario'    |
| unidad_id       | uuid FK null | Unidad del propietario            |
| acepto_datos    | boolean      | Obligatorio true en el registro   |
| acepto_datos_en | timestamptz  | Fecha y hora del consentimiento   |
| activo          | boolean      | Por defecto true                  |

**8.3 unidades**

| **Campo** | **Tipo** | **Regla**                                    |
|-----------|----------|----------------------------------------------|
| id        | uuid PK  |                                              |
| junta_id  | uuid FK  |                                              |
| codigo    | text     | Ej.: «Casa 12» o «Dpto 301»; único por junta |
| activa    | boolean  | Baja lógica                                  |

**8.4 cuotas**

| **Campo**         | **Tipo**      | **Regla**                                             |
|-------------------|---------------|-------------------------------------------------------|
| id                | uuid PK       |                                                       |
| junta_id          | uuid FK       |                                                       |
| unidad_id         | uuid FK       |                                                       |
| periodo           | date          | Primer día del mes                                    |
| concepto          | text          | Por defecto 'Vigilancia'                              |
| monto             | numeric(10,2) | \> 0                                                  |
| fecha_vencimiento | date          | Calculada con dia_vencimiento                         |
| estado            | text          | Check: 'pendiente', 'en_revision', 'pagada'           |
| fecha_pago        | date null     | Fecha de la operación al conciliar                    |
| dias_atraso       | int           | max(0, fecha_pago − fecha_vencimiento); por defecto 0 |
| pago_id           | uuid FK null  | Pago que la canceló                                   |
| es_simulado       | boolean       | true para datos del seed                              |
| restricción       |               | UNIQUE (unidad_id, periodo, concepto)                 |

**8.5 pagos**

| **Campo**            | **Tipo**            | **Regla**                                                                        |
|----------------------|---------------------|----------------------------------------------------------------------------------|
| id                   | uuid PK             |                                                                                  |
| junta_id             | uuid FK             |                                                                                  |
| cuota_id             | uuid FK             |                                                                                  |
| unidad_id            | uuid FK             |                                                                                  |
| registrado_por       | uuid FK             | Perfil que subió o registró el pago                                              |
| metodo               | text                | Check: 'yape_qr', 'yape_captura', 'efectivo', 'transferencia'                    |
| monto_declarado      | numeric(10,2)       | \> 0                                                                             |
| monto_ocr            | numeric(10,2) null  | Lo que leyó el OCR                                                               |
| fecha_operacion      | date                | No futura                                                                        |
| numero_operacion     | text null           | Obligatorio salvo efectivo                                                       |
| comprobante_path     | text null           | Ruta en bucket privado «comprobantes»                                            |
| ocr_confianza        | numeric null        | 0–100                                                                            |
| estado               | text                | Check: 'conciliado_auto', 'pendiente_revision', 'conciliado_manual', 'rechazado' |
| alertas              | text\[\]            | Lista de alertas de las reglas R1–R4                                             |
| motivo_rechazo       | text null           | Obligatorio si estado = rechazado                                                |
| subido_en            | timestamptz         | Por defecto now()                                                                |
| conciliado_en        | timestamptz null    | Momento de la conciliación                                                       |
| conciliado_por       | uuid FK null        | Null si fue automática                                                           |
| minutos_conciliacion | numeric (calculado) | (conciliado_en − subido_en) en minutos                                           |
| es_simulado          | boolean             | true para datos del seed                                                         |

**8.6 egresos**

| **Campo**      | **Tipo**      | **Regla**                                   |
|----------------|---------------|---------------------------------------------|
| id             | uuid PK       |                                             |
| junta_id       | uuid FK       |                                             |
| fecha          | date          |                                             |
| concepto       | text          | Check: 'pago_vigilante', 'insumos', 'otros' |
| beneficiario   | text          |                                             |
| monto          | numeric(10,2) | \> 0                                        |
| comentario     | text null     |                                             |
| registrado_por | uuid FK       |                                             |
| es_simulado    | boolean       |                                             |

**8.7 auditoria**

| **Campo**            | **Tipo**    | **Regla**                                                                       |
|----------------------|-------------|---------------------------------------------------------------------------------|
| id                   | uuid PK     |                                                                                 |
| junta_id             | uuid FK     |                                                                                 |
| usuario_id           | uuid FK     |                                                                                 |
| accion               | text        | Ej.: generar_cuotas, aprobar_pago, rechazar_pago, pago_manual, registrar_egreso |
| entidad / entidad_id | text / uuid | Objeto afectado                                                                 |
| detalle              | jsonb       | Datos relevantes de la acción                                                   |

**8.8 Vistas, índices y seguridad**

- **v_cuotas_estado:** cuotas con estado_visible = pagada \| en_revision \| pendiente \| morosa (morosa si pendiente y fecha_vencimiento \< hoy en America/Lima).

- **v_transparencia:** por unidad y periodo, solo código de unidad, estado visible y fecha de pago (sin nombres, montos de operación ni comprobantes). Es la única fuente del portal para propietarios.

- **v_dataset_morosidad:** vista de exportación descrita en la sección 11.

- Índices en (junta_id, periodo), (unidad_id, periodo) y en numero_operacion.

- **RLS activado en todas las tablas:** el propietario solo lee sus perfiles, cuotas y pagos; el administrador accede a los de su junta; v_transparencia es legible por ambos roles. El bucket «comprobantes» es privado y se accede con URLs firmadas de corta duración.

**9. Validaciones y manejo de errores**

Toda validación se implementa con zod en el cliente (experiencia de usuario) y se **repite en el servidor** (seguridad). Los mensajes se muestran junto al campo y en español.

| **Situación**              | **Regla**                                     | **Mensaje al usuario**                                                   |
|----------------------------|-----------------------------------------------|--------------------------------------------------------------------------|
| Formulario vacío           | Campos obligatorios sin completar             | Completa este campo.                                                     |
| Correo inválido o repetido | Formato válido; único en la plataforma        | Ingresa un correo válido. / Este correo ya está registrado.              |
| Contraseña débil           | Mínimo 8 caracteres                           | La contraseña debe tener al menos 8 caracteres.                          |
| Sin consentimiento         | acepto_datos obligatorio                      | Debes aceptar el tratamiento de datos para registrarte.                  |
| Credenciales incorrectas   | Sin revelar qué dato falló                    | Correo o contraseña incorrectos.                                         |
| Archivo inválido           | Solo jpg, png o webp; máximo 5 MB             | Sube una imagen JPG, PNG o WEBP de hasta 5 MB.                           |
| Monto inválido             | Numérico, mayor que 0, hasta 2 decimales      | Ingresa un monto válido.                                                 |
| Fecha futura               | fecha_operacion ≤ hoy                         | La fecha no puede ser futura.                                            |
| OCR sin resultado          | No se extrajo ningún campo                    | No pudimos leer la imagen. Ingresa los datos manualmente.                |
| Operación duplicada        | Regla R2                                      | Este número de operación ya fue registrado. Tu pago pasará a revisión.   |
| Rechazo sin motivo         | motivo_rechazo obligatorio                    | Escribe el motivo del rechazo.                                           |
| Cuota ya pagada            | No permite un nuevo pago si estado = pagada   | Esta cuota ya está pagada.                                               |
| Error de red o servidor    | Reintento sin perder los datos del formulario | No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo. |
| Acceso sin permiso         | Ruta o dato de otro rol                       | Redirección a la pantalla correspondiente o mensaje «No tienes acceso».  |

**10. Seguridad y cumplimiento normativo**

El MVP debe evidenciar la protección de datos personales (Ley N.º 29733). Cada fila de la tabla será una captura o enlace de evidencia en el informe.

| **Requisito de la norma (principio)**                                              | **Funcionalidad del MVP que lo resuelve**                                                                        | **Evidencia a capturar**                          |
|------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|---------------------------------------------------|
| Consentimiento del titular de los datos                                            | Casilla obligatoria en el registro con texto de política de privacidad; se guarda acepto_datos y acepto_datos_en | Pantalla de registro y campo en la base de datos  |
| Finalidad                                                                          | Texto en el registro que declara el uso: gestión de cuotas, conciliación y transparencia de la junta             | Pantalla de registro                              |
| Proporcionalidad (datos mínimos)                                                   | El portal de transparencia no muestra nombres, teléfonos ni comprobantes; solo código de unidad y estado         | Pantalla /transparencia                           |
| Seguridad                                                                          | Roles, RLS, bucket privado con URLs firmadas, claves secretas solo en el servidor, HTTPS y bitácora de auditoría | Prueba de acceso denegado y pantalla de auditoría |
| Trazabilidad de pagos al personal de vigilancia (Ley N.º 28879 y D. Leg. N.º 1213) | Registro de egresos con concepto, beneficiario y fecha, visible en el reporte mensual                            | Pantalla /admin/egresos y reporte mensual         |

- Contraseñas gestionadas por Supabase Auth (nunca en texto plano). Variables de entorno en Vercel; **SUPABASE_SERVICE_ROLE_KEY solo en el servidor**, jamás en código del cliente ni en el repositorio.

- Rutas protegidas mediante middleware según rol; las comprobaciones de permisos se hacen también en el servidor y con RLS.

- Datos de demostración 100 % simulados y marcados con es_simulado = true.

**11. Datos para el piloto de ML (APF3) — contrato de datos preliminar**

| **Elemento**       | **Definición**                                                                                                                                                                                        |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Variable objetivo  | moroso (binaria): 1 si la cuota se pagó con dias_atraso \> 0 o sigue impaga después del vencimiento; 0 si se pagó a tiempo.                                                                           |
| Campos del dataset | unidad_ref (código anonimizado), periodo, monto, fecha_vencimiento, fecha_pago, dias_atraso, metodo_pago, pagos_atrasados_previos (conteo de atrasos en los 3 meses anteriores), moroso, es_simulado. |
| Fuente             | Tablas cuotas y pagos del propio sistema, exportadas desde la vista v_dataset_morosidad.                                                                                                              |
| Volumen esperado   | Seed: 30 unidades × 12 meses = 360 registros, que crecen con el uso real del MVP.                                                                                                                     |
| Calidad y limpieza | Sin nulos en monto, periodo y fecha_vencimiento; fecha_pago nula solo si la cuota está impaga; sin duplicados por (unidad, periodo); montos \> 0; moroso derivado solo de datos registrados.          |
| Partición sugerida | Partición temporal: entrenamiento con los 9 primeros meses, validación con el mes 10 y prueba con los meses 11–12, para evitar fuga de información.                                                   |

**11.1 Datos semilla (seed) simulados**

- 1 junta («Junta Vecinal Arcomunity — Piloto»), cuota S/ 150, vencimiento el día 10, **30 unidades** y **12 meses** de historial retroactivo.

- Comportamiento simulado: 5 unidades morosas crónicas, 8 con atrasos ocasionales y el resto puntuales; aproximadamente 20 % de las cuotas con atraso. Métodos de pago variados (yape_qr, yape_captura, efectivo).

- Egresos mensuales de vigilancia coherentes con la recaudación.

- Cuentas de demostración: 1 administrador y 3 propietarios, con credenciales listadas en el README. Todo marcado con es_simulado = true.

- Botón «Exportar CSV» en /admin/reportes con las columnas indicadas y un ejemplo no sensible de 10 filas incluido en la documentación.

**12. Despliegue**

1.  Crear el proyecto en Supabase; ejecutar el script SQL; crear el bucket privado «comprobantes» y el bucket de la imagen del QR.

2.  Crear el repositorio en GitHub con el código y un README.

3.  Importar el repositorio en Vercel y configurar las variables de entorno: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (solo servidor).

4.  Ejecutar el seed y comprobar el flujo principal en la URL pública (formato \*.vercel.app).

5.  Dejar las credenciales de demostración en el README. Entrar a la aplicación el día previo a la sustentación: los proyectos gratuitos pueden pausarse por inactividad (verificar la política vigente de Supabase).

**13. Pruebas funcionales**

El implementador debe ejecutar cada caso en la URL desplegada y completar las columnas «Pasó/No pasó» y «Evidencia y corrección aplicada» (captura y, si falló, qué se corrigió).

| **ID** | **Flujo**     | **Caso de prueba**                                            | **Resultado esperado**                             | **Pasó / No pasó** | **Evidencia y corrección** |
|--------|---------------|---------------------------------------------------------------|----------------------------------------------------|--------------------|----------------------------|
| T01    | Acceso        | Inicio de sesión del administrador con credenciales correctas | Ingresa a /admin                                   |                    |                            |
| T02    | Acceso        | Contraseña incorrecta                                         | Mensaje de error; no ingresa                       |                    |                            |
| T03    | Registro      | Registro sin marcar el consentimiento                         | Bloquea el envío con mensaje                       |                    |                            |
| T04    | Registro      | Correo ya registrado                                          | Mensaje de correo repetido                         |                    |                            |
| T05    | Cuotas        | Generar cuotas del mes dos veces                              | No se duplican; informa creadas y existentes       |                    |                            |
| T06    | Pago          | Enviar el formulario de pago vacío                            | Errores por campo                                  |                    |                            |
| T07    | Pago          | Subir un PDF o una imagen mayor a 5 MB                        | Rechaza el archivo con mensaje                     |                    |                            |
| T08    | Pago          | Pago con monto correcto y operación nueva                     | Estado conciliado_auto; cuota pagada               |                    |                            |
| T09    | Pago          | Pago con monto distinto de la cuota                           | pendiente_revision con alerta de monto             |                    |                            |
| T10    | Pago          | Repetir un número de operación                                | pendiente_revision con alerta de duplicado         |                    |                            |
| T11    | OCR           | Imagen sin texto legible                                      | Permite ingreso manual de los datos                |                    |                            |
| T12    | Pago          | Simular error de red al enviar                                | Mensaje de error; el formulario conserva los datos |                    |                            |
| T13    | Conciliación  | Administrador aprueba un pago en revisión                     | Cuota pagada; registro en auditoría                |                    |                            |
| T14    | Conciliación  | Rechazar sin escribir motivo                                  | Bloquea la acción con mensaje                      |                    |                            |
| T15    | Seguridad     | Propietario abre la ruta /admin                               | Redirigido o «No tienes acceso»                    |                    |                            |
| T16    | Seguridad     | Propietario intenta ver el comprobante de otro                | Acceso denegado                                    |                    |                            |
| T17    | Transparencia | Revisar /transparencia como propietario                       | No muestra nombres ni comprobantes                 |                    |                            |
| T18    | Dashboard     | Comparar totales con los datos del seed                       | Las cifras coinciden                               |                    |                            |
| T19    | Exportación   | Exportar CSV del dataset                                      | Contiene las columnas de la sección 11             |                    |                            |

**14. Guion de demostración en vivo (4 minutos)**

1.  (0:30) Abrir la URL pública; iniciar sesión como administrador; mostrar configuración con el QR de Yape y generar las cuotas del mes.

2.  (1:00) Cambiar a la sesión de un propietario; mostrar su cuota pendiente y la pantalla de pago con el QR.

3.  (1:00) Subir una captura de pago; mostrar el OCR llenando monto, fecha y n.º de operación; enviar y mostrar el estado «conciliado».

4.  (0:45) Enviar un segundo pago con monto distinto; mostrar que cae en revisión; volver al administrador, abrir Conciliación y aprobarlo.

5.  (0:45) Mostrar el dashboard actualizado (recaudado, % al día, morosos, minutos de conciliación) y el portal de transparencia.

**15. Fases de construcción y entregables**

| **Fase** | **Contenido**                                                                  | **Entregable de la fase**                                           |
|----------|--------------------------------------------------------------------------------|---------------------------------------------------------------------|
| F0       | Plan: confirmar stack, estructura de carpetas y lista de supuestos             | Árbol de carpetas y supuestos                                       |
| F1       | Base de datos: tablas, restricciones, vistas, RLS y seed                       | Script SQL completo y script de seed                                |
| F2       | Autenticación, roles, middleware, layout, configuración y unidades (US01–US03) | Código completo de los módulos                                      |
| F3       | Cuotas, flujo de pago, OCR y conciliación automática (US04–US07)               | Código completo y pruebas T05–T12                                   |
| F4       | Revisión del administrador, pago manual y egresos (US08, US09, US12)           | Código completo y pruebas T13–T14                                   |
| F5       | Dashboard, transparencia, reporte mensual y exportación CSV (US10, US11, US13) | Código completo y pruebas T17–T19                                   |
| F6       | Validaciones, seguridad y ejecución de todas las pruebas                       | Tabla de la sección 13 completa, con correcciones                   |
| F7       | Despliegue y documentación                                                     | URL pública, README, credenciales de demo y anexos de la sección 16 |

**16. Entregables finales y criterios de aceptación**

**16.1 Cumplimiento del requisito técnico mínimo del APF2**

| **Componente** | **Mínimo exigible**                       | **Cómo lo cumple este MVP**                             |
|----------------|-------------------------------------------|---------------------------------------------------------|
| Interfaz       | Pantallas funcionales del flujo principal | Pantallas de la sección 7, accesibles por URL pública   |
| Lógica         | Procesamiento real de la acción principal | OCR + reglas de conciliación R1–R4 en el servidor       |
| Persistencia   | Guardar y consultar los datos del flujo   | PostgreSQL en Supabase y Storage para comprobantes      |
| Validaciones   | Errores y entradas inválidas              | Sección 9 y pruebas T02–T07, T11, T12, T14              |
| Despliegue     | URL pública sin contraseñas complejas     | Vercel + credenciales de demostración en el README      |
| Datos APF3     | Estructura inicial del dataset            | Sección 11, vista v_dataset_morosidad y exportación CSV |

**16.2 Lista de entregables**

- URL pública funcionando y credenciales de demostración (administrador y propietarios).

- Repositorio con el código, README con pasos de instalación y despliegue.

- Script SQL y script de seed.

- Diccionario de datos detallado (a partir de la sección 8) y ejemplo no sensible del dataset (10 filas).

- Diagrama de arquitectura del sistema (bloques: navegador, Next.js en Vercel, Supabase, OCR en el navegador) y diagrama del flujo principal.

- Tabla de pruebas funcionales completa (sección 13) con evidencia.

- Lista de supuestos y limitaciones conocidas (por ejemplo, la conciliación no consulta al banco).

**16.3 Definición de «terminado»**

- El flujo principal de la sección 6.1 funciona de principio a fin en la URL pública, sin intervención técnica.

- Las historias US01–US13 están implementadas y verificadas; US14–US16 figuran como pendientes.

- Las 19 pruebas están ejecutadas y documentadas; los fallos detectados tienen su corrección registrada.

- No hay claves secretas en el repositorio ni en el cliente, y las políticas RLS impiden el acceso cruzado entre propietarios.
