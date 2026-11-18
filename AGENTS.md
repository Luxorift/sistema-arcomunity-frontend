# Instrucciones para agentes y colaboradores — Arcomunity

Arcomunity S.A.C. es una empresa modelo **ficticia autorizada por el docente** (UTP, Innovación y
Transformación Digital, Grupo 6, Caso 12: gestión transparente de cuotas de vigilancia vecinal).
No cambiar la empresa, el caso ni el problema de ingeniería. Todo dato de demostración es simulado y
debe quedar marcado como tal (`es_simulado = true`).

Estas reglas son obligatorias para frontend, backend, Supabase y la futura integración de Machine
Learning.

## 1. Ramas

| Rama | Uso |
| --- | --- |
| `main` | Versiones estables y verificadas. |
| `dev` | Desarrollo e integración. |
| `feat/nombre-descriptivo` | Nuevas funcionalidades. |
| `fix/nombre-descriptivo` | Corrección de errores. |
| `refactor/nombre-descriptivo` | Reorganizar código sin cambiar comportamiento. |
| `chore/nombre-descriptivo` | Mantenimiento, dependencias o configuración. |
| `test/nombre-descriptivo` | Incorporar o mejorar pruebas. |

- Toda rama de trabajo se crea **desde `dev`**, nunca desde `main`.
- Una rama por funcionalidad o corrección concreta. No crear ramas para cambios insignificantes.

## 2. Commits

Conventional Commits con prefijo en inglés y descripción en español:

```
feat: implementar autenticación con Supabase
fix: corregir permisos de acceso de propietarios
refactor: reorganizar componentes del panel administrativo
chore: configurar variables de entorno
test: agregar pruebas de conciliación de pagos
docs: actualizar instrucciones de instalación
```

- Cada commit es un cambio lógico y verificable. No mezclar cambios independientes.
- Nunca incluir credenciales, archivos `.env` reales ni archivos generados (`dist/`, `node_modules/`).

## 3. Integración

Flujo: `dev → feat/fix/refactor/chore/test → pruebas → integración en dev → validación → main`.

- Antes de integrar en `dev`, ejecutar `npm test` y `npm run build` sin errores.
- Preferir Pull Requests, sobre todo para autenticación, base de datos, seguridad o funciones financieras.
- Prohibido sin autorización explícita del responsable: merge hacia `main`, `force push`, borrar ramas
  importantes, publicar (push) cambios sensibles.

## 4. Buenas prácticas

- Revisar la rama activa y `git status` antes de modificar archivos.
- No sobrescribir cambios existentes sin revisarlos.
- Si hay cambios sin confirmar y hay que cambiar de rama, guardarlos primero (`git stash` o commit).
- Mantener un historial limpio y comprensible.

## 5. Seguridad y datos

- Las claves privilegiadas de Supabase (`service_role` / secret key) **nunca** van al frontend ni al
  repositorio. El frontend solo usa la clave pública (anon/publishable).
- La autorización real vive en PostgreSQL (RLS y funciones `SECURITY DEFINER`), no en el frontend.
- Operaciones financieras (pagos, conciliación, cuotas, egresos) solo mediante funciones RPC
  atómicas con validación en servidor y registro en `auditoria`.
- Los cambios de esquema se hacen con migraciones versionadas en `supabase/migrations/`. No editar
  migraciones ya aplicadas en un proyecto remoto: crear una nueva.
- Una captura de Yape/Plin no es confirmación bancaria. No inventar confirmaciones automáticas.

## 6. Machine Learning

- No mostrar predicciones ficticias como si vinieran de un modelo real.
- Las características para inferencia solo usan información disponible antes del vencimiento
  (ver `docs/ml-contrato.md`). Nunca `fecha_pago`, `dias_atraso` ni `metodo_pago` de la cuota actual.
- El dataset de entrenamiento lo prepara el equipo (Daniel); no reemplazarlo con datos inventados.

## 7. Documentos académicos

No editar informes Word, presentaciones ni entregables académicos desde este repositorio.
