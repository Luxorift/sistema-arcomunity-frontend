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

1. **Migración 0900 aplicada** en Supabase (`supabase db push`). Sin ella el límite de intentos del
   código de invitación no existe en el servidor y el botón «Generar código seguro» falla.
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

## Volver atrás

En Vercel → *Deployments*, elegir el despliegue de producción anterior → *Instant Rollback*. En Git,
revertir el *merge* en `main` con un nuevo commit (nunca `push --force`).
