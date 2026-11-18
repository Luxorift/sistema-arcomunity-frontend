# Arcomunity — gestión transparente de cuotas de vigilancia vecinal

Aplicación web del proyecto universitario Arcomunity S.A.C. (empresa modelo autorizada, UTP — Innovación
y Transformación Digital, Grupo 6, Caso 12). Los vecinos pagan su cuota de vigilancia y suben el
comprobante; la administración concilia, registra egresos y rinde cuentas en un portal de transparencia.

**La junta de demostración usa datos 100 % simulados** (`es_simulado = true`).

## Acceder a Arcomunity

| Versión | Dirección |
| --- | --- |
| **Versión principal — Vercel** | <https://sistema-arcomunity-frontend.vercel.app/login> |
| **Versión alternativa — Cloudflare Workers** | <https://sistema-arcomunity-frontend.luxorift.workers.dev/login> |

Las dos direcciones publican el **mismo código** (rama `main`) y usan el **mismo backend**: el mismo proyecto
Supabase (autenticación, base de datos, comprobantes y tiempo real). Una cuenta, un pago o una aprobación hecha
en una se ve también en la otra. Cloudflare es nuestra alternativa para entrar desde redes donde Vercel puede
estar bloqueado (como ocurrió en la red de la universidad durante el APF2). Las cuentas de prueba están en
[Cuentas de demostración](#cuentas-de-demostración).

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

**Acceso:** <https://sistema-arcomunity-frontend.vercel.app/login> (alternativa:
<https://sistema-arcomunity-frontend.luxorift.workers.dev/login>)

Son cuentas reales de Supabase Auth creadas solo para la exposición, las pruebas y la revisión docente.
Pertenecen a una junta **ficticia** («Junta Vecinal Arcomunity — Piloto», 30 unidades, 12 meses de
historial simulado). No hay datos personales reales.

Contraseña de las cuatro cuentas: **`Demo2026!`** (pública y exclusiva de esta demostración).

| Rol | Correo | Contraseña | Qué permite probar |
| --- | --- | --- | --- |
| Administración | `admin@arcomunity.demo` | `Demo2026!` | Resumen con métricas, cuotas, conciliación de pagos (aprobar o rechazar con el comprobante), pagos y reversión, egresos, reportes con exportación CSV/Excel, unidades y vecinos, auditoría, transparencia, videovigilancia simulada y configuración. |
| Propietaria · Casa 12 | `casa12@arcomunity.demo` | `Demo2026!` | Una cuota vencida (noviembre, S/ 150): pago guiado en 3 pasos con el comprobante de ejemplo, lectura OCR y seguimiento del estado. Si se usa a la vez que la administración, el pago aparece en Conciliación sin recargar. |
| Propietario · Casa 08 | `casa08@arcomunity.demo` | `Demo2026!` | Pago en revisión: declaró S/ 140 por la cuota de noviembre de S/ 150, por eso la regla lo envió a Conciliación. La administración puede aprobarlo o rechazarlo con motivo; el vecino ve el resultado. |
| Propietaria · Dpto 301 | `dpto301@arcomunity.demo` | `Demo2026!` | Sin cuotas vencidas: 12 meses pagados (diciembre 2025 – noviembre 2026), mensaje de agradecimiento y diferencias frente a un perfil con deuda. |

Después de **Preparar demostración** cada unidad tiene además la cuota de diciembre, que vence el día 10: no es
deuda vencida. Casa 12 sigue con S/ 150 vencidos (su total por pagar es S/ 300), Casa 08 sigue en revisión y
Dpto 301 sigue sin cuotas vencidas. **Reiniciar demostración** vuelve al estado de la tabla.

### Cómo ingresar

1. Abre <https://sistema-arcomunity-frontend.vercel.app/login> en la computadora o el celular.
2. Pulsa un perfil en **Cuentas de demostración** (completa el correo) o escríbelo.
3. Escribe la contraseña `Demo2026!` y pulsa **Ingresar**.
4. Para comparar perfiles al mismo tiempo, usa otra ventana privada u otro navegador: cada sesión es
   independiente.

Los propietarios solo ven su unidad: si intentan abrir `/admin`, la aplicación los devuelve a *Mi cuenta*
y la base de datos (RLS) rechaza la consulta.

Para probar el registro de un vecino nuevo usa el código de invitación **`ARCO2026`** y un correo ficticio
(no requiere confirmación). El rol de administrador nunca se obtiene por registro: se asigna en la base de
datos. Las cuentas creadas así se desvinculan de la junta demo en la restauración nocturna.

### Protecciones del modo demostración

Como la contraseña es pública, la base de datos (no solo la interfaz) aplica estas reglas a la junta demo
(migración `20261118001100_modo_demostracion.sql`):

- Las cuentas demo no pueden cambiar su contraseña, correo, teléfono ni nombre.
- No se pueden cambiar el nombre de la junta, el código de invitación (`ARCO2026`), el titular ni el QR de
  Yape, ni desvincular a las cuentas demo o desactivar sus unidades.
- Solo se admiten cámaras simuladas (sin enlaces externos).
- La administración demo no tiene acceso a Supabase, a claves ni a otras juntas: todo pasa por RLS y
  funciones del servidor con auditoría.
- Ninguna clave de servicio, contraseña de PostgreSQL ni credencial administrativa real está en el
  repositorio.

Todo lo demás se puede probar (pagar, aprobar, rechazar, revertir, registrar egresos, cambiar la cuota…).

### Restaurar la demostración

Cada noche (03:00, hora de Lima) la base vuelve al estado guardado: cuotas, pagos, egresos, cámaras,
configuración, unidades, vínculos y cuentas demo. Los registros hechos con el código de invitación se
desvinculan de la junta demo. La auditoría se conserva y anota la restauración.

**Desde la web (administración):** *Auditoría → Herramientas de demostración* (migración
`20261118001300_herramientas_demostracion.sql`):

- **Preparar demostración**: genera las cuotas del mes siguiente que falten (sin duplicar), calcula el
  riesgo de morosidad con el modelo v1 dentro de PostgreSQL y comprueba los escenarios de las cuentas demo
  (Casa 12 con cuota por pagar, Casa 08 con pago en revisión, Dpto 301 al día). No inventa pagos: si un
  escenario se perdió en un ensayo, lo avisa y sugiere reiniciar. Se puede pulsar varias veces.
- **Reiniciar demostración**: vuelve a la foto guardada (misma lógica que la restauración nocturna), quita
  las predicciones y borra los comprobantes subidos en el ensayo. Pide doble confirmación.

El servidor comprueba que quien llama sea la administración de la junta **en modo demostración**
(propietarios, visitantes y otras juntas reciben «No tienes permiso»), impide dos ejecuciones a la vez y
registra cada operación en la auditoría, que nunca se borra.

El equipo técnico también puede restaurarla desde la terminal (requiere la clave de servicio en
`.env.local`, que no se publica):

```bash
npm run demo:restaurar
```

Para guardar el estado actual como nuevo punto de restauración: `npm run demo:restaurar -- --guardar`.

## Pruebas

```bash
npm test             # reglas de negocio, fechas, mensajes y base de datos (PGlite)
npm run test:remoto  # integración contra el proyecto Supabase real (requiere la semilla)
npm run build        # compilación de producción
npm run test:navegadores  # Edge (móvil) + Chrome (escritorio): pago, revisión en tiempo real y aprobación
npm run test:ui      # auditoría de solo lectura de todas las pantallas (consola, desborde, accesibilidad)
npm run test:responsive  # 8 tamaños (320 px a escritorio y horizontal) en Chrome y Edge: desbordes, recortes, menú y modales
npm run test:demo    # cuentas demo contra Supabase: roles, permisos, abusos rechazados y restauración
npm run test:acceso  # los 4 perfiles en la web pública con Chrome y Edge, escritorio y celular (como el docente)
npm run test:a11y    # WCAG 2.2 AA con axe-core: modo claro y oscuro, escritorio, celular y zoom 200 %
TEMA=oscuro npm run test:responsive  # la prueba responsive en modo oscuro (incluye 683×384 = zoom 200 %)
npm run verificar:red  # desde la red donde se expone: ¿responden la web, Supabase y el tiempo real?
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

## Despliegue (Vercel y Cloudflare Workers)

Vercel y Cloudflare Workers se publican solos desde `main` (mismo código). Cloudflare usa `wrangler.jsonc`
(construye con `npm run build`, publica `dist` y sirve las rutas internas como aplicación de una sola página).
Detalles y verificación: [docs/despliegue.md](docs/despliegue.md#despliegue-alternativo-si-la-universidad-bloquea-vercel).

1. Importa el repositorio en Vercel (framework: Vite; `vercel.json` ya reescribe las rutas a `index.html`).
2. Variables de entorno: **solo** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Agrega la URL de Vercel en Supabase → Authentication → URL Configuration.
4. Los proyectos gratuitos de Supabase se pausan tras días sin uso: ábrelo el día anterior a la demo.

Lista de comprobación previa a producción: [docs/despliegue.md](docs/despliegue.md).

## Accesibilidad y temas

- Pensada también para personas mayores: letra mínima de 12–13 px (16 px en el cuerpo), contraste AA,
  botones y campos de 44 px, ayudas breves desplegables («¿Qué significa «En revisión»?»), errores junto a
  cada campo y confirmaciones solo antes de acciones importantes (`ConfirmDialog` en `src/ui.tsx`).
- **Modo claro y oscuro** con el botón sol/luna de la barra superior (y de las pantallas de acceso). La
  primera vez sigue la preferencia del sistema; la elección se guarda solo como «claro» u «oscuro». El modo
  oscuro se genera desde la paleta con `npm run tema:oscuro` (ver `scripts/generar-tema-oscuro.ts`); los
  retoques manuales están en `src/tema-oscuro-ajustes.css`.

## Recorrido sugerido para la demostración

Guion completo (8–10 min y 3–5 min), plan B y lista previa: [docs/DEMO_APF3_COMPLETA.md](docs/DEMO_APF3_COMPLETA.md).

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
