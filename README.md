# Arcomunity — gestión transparente de cuotas de vigilancia vecinal

Aplicación web del proyecto universitario Arcomunity S.A.C. (empresa modelo autorizada, UTP — Innovación
y Transformación Digital, Grupo 6, Caso 12). Los vecinos pagan su cuota de vigilancia y suben el
comprobante; la administración concilia, registra egresos y rinde cuentas en un portal de transparencia.

**La junta de demostración usa datos 100 % simulados** (`es_simulado = true`).

## Arquitectura

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite (Vercel) |
| Autenticación | Supabase Auth (correo y contraseña) |
| Base de datos | PostgreSQL de Supabase con Row Level Security en todas las tablas |
| Lógica sensible | Funciones RPC `SECURITY DEFINER` (pagos, conciliación, cuotas, egresos, métricas) |
| Archivos | Supabase Storage privado (comprobantes y QR) con URLs firmadas temporales |
| Tiempo real | Supabase Realtime (cuotas y pagos) |
| OCR | Tesseract.js en el navegador (solo ayuda a llenar el formulario) |

Detalle, decisiones y controles de seguridad: [docs/arquitectura.md](docs/arquitectura.md).
Preparación para Machine Learning: [docs/ml-contrato.md](docs/ml-contrato.md).

```text
src/                     Frontend (pantallas, store, cliente Supabase)
  lib/                   Cliente Supabase, errores, OCR, fechas especiales del Perú
supabase/migrations/     Esquema, RLS, funciones, Storage, Realtime (versionadas)
supabase/tests/          Pruebas de base de datos con PGlite (sin Docker)
scripts/seed-demo.ts     Carga de la junta de demostración
scripts/pruebas-integracion.ts  Pruebas contra el proyecto Supabase real
```

## Requisitos

- Node.js 20.19 o superior (probado con 24) y npm.
- Supabase CLI (`npm i -g supabase`) para aplicar migraciones.
- Un proyecto Supabase (plan gratuito).

## Puesta en marcha

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` como `.env.local` y completa los valores de **Project Settings → API Keys**:

   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave anon/publishable): las usa el navegador.
   - `SUPABASE_SERVICE_ROLE_KEY` (secret key): **solo** para la semilla y las pruebas locales. Nunca la
     pongas en Vercel ni en una variable `VITE_`. `.env.local` está en `.gitignore`.

3. En Supabase → Authentication:

   - Sign In / Providers → Email: para la demo, desactiva *Confirm email* (el correo gratuito envía muy
     pocos mensajes por hora). Si lo activas, el registro pide confirmar el correo.
   - URL Configuration: *Site URL* con la URL pública y `http://localhost:5173` en *Redirect URLs*
     (necesario para recuperar la contraseña).

4. Vincula el proyecto y aplica las migraciones (pide la contraseña de la base de datos):

   ```bash
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase db push
   ```

5. Carga la junta de demostración (30 unidades, 12 meses, 4 cuentas):

   ```bash
   npm run seed:demo
   ```

   `npm run seed:demo -- --reset` la borra y la vuelve a crear (borra también lo registrado en ella).

6. Inicia el frontend:

   ```bash
   npm run dev
   ```

   Abre `http://localhost:5173`.

## Cuentas de demostración

Contraseña de todas: **`Demo2026!`** (cuentas ficticias de la junta simulada).

| Rol | Correo | Escenario |
| --- | --- | --- |
| Administración | `admin@arcomunity.demo` | Panel completo |
| Propietaria · Casa 12 | `casa12@arcomunity.demo` | Cuota del mes pendiente |
| Propietario · Casa 08 | `casa08@arcomunity.demo` | Pago en revisión |
| Propietaria · Dpto 301 | `dpto301@arcomunity.demo` | Propietaria al día |

Código de invitación para registrar nuevos propietarios: **`ARCO2026`** (editable en Configuración).
El rol de administrador nunca se obtiene por registro: se asigna en la base de datos.

## Pruebas

```bash
npm test             # reglas de negocio, fechas, mensajes y base de datos (PGlite)
npm run test:remoto  # integración contra el proyecto Supabase real (requiere la semilla)
npm run build        # compilación de producción
npm run test:navegadores  # Edge (móvil) + Chrome (escritorio): pago, revisión en tiempo real y aprobación
npm run test:ui      # auditoría de solo lectura de todas las pantallas (consola, desborde, accesibilidad)
npm run test:responsive  # 8 tamaños (320 px a escritorio y horizontal) en Chrome y Edge: desbordes, recortes, menú y modales
```

`test:navegadores` y `test:ui` usan el frontend en `http://localhost:5173` (`npm run dev`). Para probar el
build de producción: `npm run build`, `npx vite preview --port 4173` y antepone `APP_URL=http://localhost:4173`.

- `npm test` aplica todas las migraciones en PGlite (Postgres en WebAssembly) y prueba RLS, Storage y
  funciones con identidades distintas (anónimo, propietarios, administradores de dos juntas, servicio).
- `npm run test:remoto` usa Auth, PostgREST, Storage y Realtime reales; crea usuarios y una junta
  temporales y los elimina al terminar.

## Dataset de morosidad (APF3)

```bash
npm run dataset:apf3   # exporta y valida el dataset desde Supabase (solo lectura)
```

Genera en `ml/dataset_apf3/` el CSV del contrato de datos, una copia `.xlsx`, el diccionario de datos,
una partición temporal de referencia y `validacion_dataset.md`. Ver ese informe antes de usar el dataset.

## Despliegue (Vercel)

1. Importa el repositorio en Vercel (framework: Vite; `vercel.json` ya reescribe las rutas a `index.html`).
2. Variables de entorno: **solo** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Agrega la URL de Vercel en Supabase → Authentication → URL Configuration.
4. Los proyectos gratuitos de Supabase se pausan tras días sin uso: ábrelo el día anterior a la demo.

Lista de comprobación previa a producción: [docs/despliegue.md](docs/despliegue.md).

## Recorrido sugerido para la demostración

1. Entra como administración: el saludo y el resumen muestran recaudación, cuotas vencidas y pagos por revisar.
2. En otra ventana (o en el celular) entra como `casa12@arcomunity.demo` y paga en 3 pasos
   (puedes usar el comprobante de ejemplo simulado).
3. Vuelve a la administración: el pago aparece sin recargar. Ábrelo en Conciliación, mira el comprobante
   privado y apruébalo o recházalo con motivo.
4. Revisa Transparencia (sin nombres ni comprobantes), Reportes (CSV/Excel desde la base) y Auditoría.

## Alcance y limitaciones

- Arcomunity **no** se conecta con Yape, Plin ni bancos. "Validado por reglas" significa que el comprobante
  es coherente (R1–R4), no que el dinero llegó; la administración puede revertirlo.
- El OCR corre en el navegador y puede requerir internet para descargar el modelo de idioma.
- Videovigilancia: cámaras simuladas; sin grabaciones ni cámaras reales.
- Predicción de morosidad: preparada pero **sin modelo**; la pantalla no muestra resultados inventados.
- Si una subida de comprobante tiene éxito y el envío del pago falla, el archivo queda en Storage sin
  usarse (no se borra desde el navegador por diseño: los comprobantes son inmutables).
