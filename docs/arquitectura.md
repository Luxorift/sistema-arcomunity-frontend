# Arquitectura técnica — Arcomunity

Documento técnico del repositorio (no es el informe académico).

## Diagnóstico del MVP de APF2 (punto de partida)

| Funcionalidad | Estado en APF2 | Problema |
| --- | --- | --- |
| Login y roles | Simulado | Usuarios y hash SHA-256 en `localStorage`; el rol se podía cambiar editando el navegador. |
| Registro con código e consentimiento | Simulado | Validación solo en el cliente. |
| Cuotas (generación idempotente) | Parcial | Lógica correcta, pero local. |
| Pago con comprobante + OCR | Parcial | Imagen guardada como base64 en `localStorage` (límite de ~5 MB, no privada). |
| Conciliación R1–R4 | Parcial | Reglas en el navegador; el cliente podía alterar montos y estados. |
| Aprobar / rechazar | Parcial | Sin control de concurrencia ni permisos reales. |
| Egresos, reportes, Excel/CSV | Parcial | Cifras calculadas en el cliente con datos locales. |
| Transparencia | Parcial | Filtraba en la vista; los datos completos estaban en el navegador de cada usuario. |
| Auditoría | Simulado | Editable/borrable por cualquiera. |
| Videovigilancia | Simulada (correcto) | Se mantiene como demostración; sin cámaras reales. |
| Persistencia entre dispositivos | Pendiente | Brecha señalada por el docente (Indicador 3). |
| Export del dataset | Defectuoso | Etiquetaba `moroso = 0` a cuotas aún no vencidas. |

## Decisión: opción C (Supabase como backend)

```
Navegador (React + Vite, Vercel)
   │  supabase-js con clave pública + JWT del usuario
   ▼
Supabase
   ├─ Auth (correo + contraseña)
   ├─ PostgreSQL
   │    ├─ RLS en todas las tablas (lectura filtrada por junta y unidad)
   │    ├─ Funciones RPC SECURITY DEFINER (únicas vías de escritura financiera)
   │    └─ Auditoría inmutable
   ├─ Storage privado (comprobantes, QR) con URLs firmadas
   └─ Realtime (cambios de cuotas y pagos, respetando RLS)

Futuro (APF3/PROY): Edge Function "predecir-morosidad" → servicio FastAPI (scikit-learn)
```

Motivos: sin servidor propio que mantener ni pagar (plan gratuito), autorización centralizada en la
base de datos (no se puede saltar desde el cliente), transacciones reales para operaciones
financieras, y reutilización casi total del frontend existente. Un backend Node adicional solo
duplicaría lo que RLS y las funciones ya garantizan.

Repositorio único: frontend en la raíz (Vercel no cambia), `supabase/` con migraciones y pruebas,
`scripts/` con utilidades locales y, más adelante, `ml/` con el servicio de inferencia.

## Modelo de datos

`juntas` · `juntas_invitacion` · `perfiles` (1:1 con `auth.users`) · `miembros_junta` (rol por
junta) · `unidades` · `unidad_propietarios` (propietario vigente) · `cuotas` · `pagos` · `egresos` ·
`camaras` · `auditoria` · `modelos_ml` · `predicciones_morosidad`.

Integridad:

- Claves compuestas `(id, junta_id)` y `(id, unidad_id, junta_id)`: un pago no puede apuntar a una
  cuota de otra unidad o junta.
- `UNIQUE (unidad_id, periodo, concepto)`: generación de cuotas idempotente aun con clics simultáneos.
- Índice único parcial `pagos_vigente_por_cuota`: un solo pago no rechazado por cuota.
- Índice único parcial `pagos_operacion_conciliada`: un número de operación no se concilia dos veces.
- `cuotas_pagada_consistente`: una cuota pagada siempre tiene `pago_id` y `fecha_pago`.
- `dias_atraso` y `minutos_conciliacion` son columnas generadas (no editables).
- Egresos se anulan con motivo; no se borran. La auditoría no se modifica.

## Estados de pago

| Estado | Significado |
| --- | --- |
| `pendiente_revision` | Pago declarado por el propietario; tiene alertas o la junta exige revisión manual. |
| `conciliado_auto` | El comprobante es coherente con las reglas R1–R4. **No es confirmación bancaria.** |
| `conciliado_manual` | El administrador lo aprobó tras verificar en su app o en caja. |
| `rechazado` | Rechazado u observado con motivo; la cuota vuelve a pendiente. También sirve para revertir una conciliación automática si el dinero no llegó. |

## Controles de seguridad (para documentar en la matriz normativa)

| Control | Dónde |
| --- | --- |
| Rol asignado solo en servidor (la metadata del registro se ignora para el rol) | `manejar_nuevo_usuario`, `miembros_junta` sin políticas de escritura |
| Aislamiento por junta y unidad | Políticas RLS (`20261117000200_seguridad_rls.sql`) |
| Validación de montos, fechas, estados y archivos en servidor | Funciones RPC (`20261117000300_logica_negocio.sql`) |
| Comprobantes privados, inmutables, URLs firmadas | `20261117000400_storage.sql` |
| Minimización en transparencia (solo código y estado; interruptor de detalle) | `transparencia()` |
| Consentimiento con fecha y hora (Ley N.º 29733) | `perfiles.acepto_datos_en` |
| Seudonimización para ML | `ml_unidad_ref()` |
| Trazabilidad | `auditoria` (inmutable) |
| Clave de servicio fuera del cliente | `.env.local` ignorado; solo `scripts/seed-demo.ts` la usa |

## Pruebas

- `npm test`: reglas de negocio (`src/`) y pruebas de base de datos (`supabase/tests/`).
- Las pruebas de base de datos aplican todas las migraciones sobre PGlite (Postgres 18 en WASM)
  con una emulación de `auth`/`storage` de Supabase, y verifican con identidades distintas
  (anónimo, propietarios, administradores de dos juntas, servicio) mediante consultas directas.
- Limitación: PGlite no reemplaza la prueba en el proyecto Supabase real (Auth, Storage HTTP,
  Realtime). Esas pruebas se hacen tras aplicar las migraciones al proyecto remoto.
