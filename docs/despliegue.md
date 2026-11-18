# Despliegue en Vercel — lista de comprobación

## Cómo está configurado

- Vercel está conectado al repositorio de GitHub.
- **Producción** se publica solo desde `main` (`https://sistema-arcomunity-frontend.vercel.app`).
- Cada push a otra rama (`dev`, `feat/…`, `fix/…`) crea una **vista previa** con URL propia. Las
  vistas previas están protegidas con *Vercel Authentication*: solo las abre quien inicia sesión en
  Vercel con acceso al proyecto.
- `vercel.json` reescribe todas las rutas a `index.html` (aplicación de una sola página).
- El frontend solo necesita dos variables públicas: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
  (clave *publishable*). Si faltan, la aplicación muestra la pantalla «Falta conectar Supabase» en lugar
  de fallar.

Publicar en producción = integrar `dev` en `main` (Pull Request). Requiere autorización del responsable.

## Antes de integrar `dev` en `main`

1. **Migraciones 0900 y 1000** (aplicadas y verificadas el 17/11/2026) en Supabase (`supabase db push`). La 1000 hace
   que el límite de intentos del código de invitación use una IP que el cliente no puede falsificar.
   Después: `npm run test:remoto` y `npm run test:limite`.
2. **Variables en Vercel** → *Settings → Environment Variables*: `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` para *Production* (y *Preview* si se quieren probar las vistas previas).
   Nunca `SUPABASE_SERVICE_ROLE_KEY` ni otra clave secreta.
3. **Supabase Auth → URL Configuration**: *Site URL* = URL de producción; *Redirect URLs* incluye
   `https://sistema-arcomunity-frontend.vercel.app/restablecer`. Opcional para vistas previas:
   `https://sistema-arcomunity-frontend-*-luxorift.vercel.app/**` (si no se agrega, los enlaces de
   recuperación pedidos desde una vista previa llevan a producción).
4. **Correo**: el SMTP integrado de Supabase es solo para pruebas. Para vecinos reales, configurar un SMTP
   propio en Supabase → Authentication → SMTP.
5. **Código de invitación**: fuera de la demostración, reemplazar `ARCO2026` con «Generar código seguro».
6. Revisar la vista previa de `dev` con las cuentas de demostración en escritorio y celular.

Al publicar, la nueva versión borra del navegador los datos locales del MVP anterior
(`arcomunity-frontend-v1` en `localStorage`): desde entonces todo vive en Supabase.

## Verificado localmente sobre el build de producción

Build hecho solo con las dos variables públicas y servido con `vite preview`:

| Comprobación | Resultado |
| --- | --- |
| `npm run build` sin `.env.local` (solo variables públicas) | Correcto, sin *sourcemaps* |
| Clave de servicio, contraseña de la base o JWT `service_role` en `dist/` | No aparecen |
| `npm run test:navegadores` (Edge móvil + Chrome escritorio, tiempo real) | 10/10 |
| `npm run test:ui` (18 pantallas × escritorio y móvil, accesos por rol) | 0 problemas |
| `npm run test:remoto` (RLS, Storage, Realtime, RPC contra Supabase) | 70/70 |
| Rutas profundas (`/admin/reportes`) servidas como SPA | 200 |

## Despliegue alternativo (si la universidad bloquea Vercel)

En el APF2 la red de la universidad bloqueó `*.vercel.app`. La alternativa es publicar **el mismo código**
(rama `main`) en un segundo servicio gratuito, conectado al **mismo Supabase**. Vercel sigue siendo la
dirección principal.

| Opción | Dirección | Costo | Rutas internas | Recomendación |
| --- | --- | --- | --- | --- |
| **Cloudflare Workers** (ya conectado al repositorio: check «Workers Builds») | `https://sistema-arcomunity-frontend.luxorift.workers.dev` | Gratis | `wrangler.jsonc` → `not_found_handling: single-page-application` | Primera opción: red de Cloudflare, rara vez bloqueada |
| **Netlify** | `https://<nombre>.netlify.app` | Gratis (300 min de build/mes) | `netlify.toml` (`/* → /index.html 200`) | Segunda opción |
| Dominio propio | `https://arcomunity.pe`, etc. | **De pago** | — | No se contrata (regla del proyecto) |

El repositorio ya trae lo necesario: `wrangler.jsonc` (Cloudflare: `npm run build`, publica `dist`, rutas
internas a `index.html`) y `netlify.toml` (lo mismo para Netlify). Vercel ignora ambos archivos.
Comprobado con `npx wrangler deploy --dry-run` (no publica).

### Pasos (requieren la cuenta del responsable; no se publicó nada todavía)

1. **Cloudflare Workers:** el Worker `sistema-arcomunity-frontend` ya está conectado a GitHub. En *Settings →
   Build*: rama de producción `main`, comando de despliegue `npx wrangler deploy` (el build lo hace
   `wrangler.jsonc`). **Netlify** (alternativa): *Add new site → Import an existing project* → mismo
   repositorio (lee `netlify.toml`).
2. Variables **de build** (Cloudflare: *Settings → Build → Variables and secrets*; Netlify: *Environment
   variables*): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave pública, la misma de Vercel). Sin
   ellas la web abre «Falta conectar Supabase». **Nunca** `SUPABASE_SERVICE_ROLE_KEY`.
3. Supabase → *Authentication → URL Configuration → Redirect URLs*: agregar
   `https://sistema-arcomunity-frontend.luxorift.workers.dev/**` (o `.netlify.app/**`). Sin esto, los enlaces de recuperación de
   contraseña y de confirmación de correo pedidos desde la dirección alternativa vuelven a Vercel.
   *Site URL* sigue siendo Vercel.
4. Comprobar: `ALTERNATIVAS=https://sistema-arcomunity-frontend.luxorift.workers.dev npm run verificar:red` (sitio, ruta interna
   `/admin/prediccion`, código de la app, Supabase Auth/API/Storage y Realtime), y luego entrar con las
   cuentas demo, registrar un pago, conciliarlo y abrir Predicción de morosidad en escritorio y celular.
5. **En la universidad**, antes de exponer: volver a correr `npm run verificar:red` con la dirección
   alternativa. Que funcione en casa no garantiza que la red de la universidad la permita.

### Conectividad necesaria hacia Supabase

La app (en cualquier dirección) necesita llegar a `https://<ref>.supabase.co` por HTTPS (inicio de sesión,
datos, comprobantes) y por WebSocket seguro (`wss://`, tiempo real). Si la red bloquea `supabase.co`,
**ninguna** dirección alternativa funciona: usar los datos del celular o el plan sin internet de
[DEMO_APF3_COMPLETA.md](DEMO_APF3_COMPLETA.md#plan-b). Si solo falla el WebSocket, la app sigue
funcionando y los cambios aparecen al recargar.

## Volver atrás

En Vercel → *Deployments*, elegir el despliegue de producción anterior → *Instant Rollback*. En Git,
revertir el *merge* en `main` con un nuevo commit (nunca `push --force`).
