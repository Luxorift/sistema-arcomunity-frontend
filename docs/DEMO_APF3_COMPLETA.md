# Demostración APF3 completa — Arcomunity (jueves 19/11/2026)

Guion para exponer Arcomunity de principio a fin ante el docente: una versión **principal (8–10 min)**,
una **reducida (3–5 min)**, el **plan B** y la **lista previa** de 10–15 minutos antes de entrar.

Todo es una junta **ficticia** con datos simulados («Junta Vecinal Arcomunity — Piloto», 30 unidades).

| Qué | Dónde |
| --- | --- |
| Web principal | <https://sistema-arcomunity-frontend.vercel.app> |
| Web alternativa (si la universidad bloquea Vercel) | <https://sistema-arcomunity-frontend.luxorift.workers.dev> (Cloudflare Workers, mismo Supabase) |
| App local (misma base) | `npm run dev` → <http://localhost:5173> |
| Cuentas | `admin@arcomunity.demo`, `casa12@arcomunity.demo`, `casa08@arcomunity.demo`, `dpto301@arcomunity.demo` — contraseña `Demo2026!` |
| Herramientas de demostración | Administración → **Auditoría** → «Herramientas de demostración» |

**Dos navegadores independientes:** propietario en **Edge** (o ventana privada) y administración en
**Chrome**. Cada sesión es independiente; así se ve el tiempo real.

---

## Lista previa (10–15 minutos antes)

| # | Comprobación | Cómo | Esperado | Si falla |
| --- | --- | --- | --- | --- |
| 1 | Internet | Abrir cualquier página | Carga | Datos del celular (hotspot) |
| 2 | Acceso al dominio | Abrir la web principal | Pantalla «Inicia sesión» | Web alternativa → app local |
| 3 | Supabase y tiempo real | `npm run verificar:red` en la laptop, **desde la red de la universidad** | Todas las líneas con ✓ | Si falla Supabase: hotspot (ninguna web funciona sin Supabase) |
| 4 | Login | Entrar como `admin@arcomunity.demo` en Chrome | Resumen con métricas | Esperar 20 s (Supabase despierta) y reintentar |
| 5 | Escenario preparado | Auditoría → **Preparar demostración** → confirmar | Resumen: 30 cuotas de diciembre, 30 predicciones, tres escenarios «listo» | Si un escenario «ya no se cumple»: **Reiniciar demostración** y volver a preparar |
| 6 | Cuotas futuras | Cuotas → diciembre de 2026 | 30 cuotas pendientes | Repetir el paso 5 |
| 7 | Predicciones | Predicción de morosidad | 30 cuotas; riesgo alto y bajo con «Por qué» | Pulsar «Calcular riesgo de hoy» |
| 8 | Cuentas demo | Entrar como `casa12` en Edge | «Tienes una cuota vencida» (noviembre) | Reiniciar demostración |
| 9 | Comprobante de prueba | En el pago, botón «Probar con un comprobante de ejemplo» | Aparece la imagen simulada | Usar cualquier captura de la carpeta del plan B |
| 10 | Revisión manual (opcional, recomendado) | Configuración → desactivar «Validación automática por reglas» → Guardar → confirmar | El pago de Casa 12 irá a Conciliación | Si se deja activada, el pago se valida solo (también se puede mostrar) |
| 11 | Tema | Botón sol/luna arriba a la derecha | Cambia todo a modo claro u oscuro | Usar el modo claro (más probado en proyector) |
| 12 | Notebook | Abrir `ml/modelo_morosidad/APF3_TD_Grupo6_ML_Innovacion.ipynb` (salidas guardadas) | Gráficos visibles sin ejecutar | Mostrar `comparacion/RESULTADOS.md` |
| 13 | Capturas y video | `ml/modelo_morosidad/evidencias/` y la carpeta `Demo_APF3_plan_B` (junto al repositorio: capturas claro/oscuro y video) | Imágenes y video reales | — |
| 14 | Plan B listo | Terminal en `sistema-arcomunity-frontend` con `npm run dev` probado | <http://localhost:5173> abre | — |

Proyector: zoom del navegador al **125 %** si el aula es grande (la app funciona bien hasta 200 %).

---

## Demostración principal (8–10 minutos)

| Min | Bloque | Página y cuenta | Qué pulsar | Resultado esperado | Qué decir (breve) | Si falla |
| --- | --- | --- | --- | --- | --- | --- |
| 0:00 | 1. El problema | Login (sin entrar) | — | Pantalla de acceso | Las juntas cobran la cuota de vigilancia con cuadernos y capturas por WhatsApp: no se sabe quién pagó, se pierden comprobantes y la rendición de cuentas genera desconfianza. Arcomunity centraliza cuotas, comprobantes, conciliación y transparencia. | Mostrar captura del login |
| 0:45 | 2. Acceso administrativo | Chrome · `admin@arcomunity.demo` | «Administración» en Cuentas de demostración → contraseña → **Ingresar** | Resumen: recaudado, por cobrar, % al día, gráfico de 12 meses | El rol lo define el servidor (no el navegador). Cada consulta pasa por seguridad a nivel de fila (RLS): un vecino nunca ve datos de otro. | Reintentar; si no, app local |
| 1:30 | 3. Navegación y facilidad de uso | Admin | Recorrer el menú; abrir una ayuda «¿Qué es la conciliación?»; pulsar el botón sol/luna | Ayuda desplegable; cambio de tema sin perder la pantalla | Pensado para personas mayores: letra grande, botones de 44 px, ayudas breves, confirmaciones antes de acciones importantes, modo claro y oscuro. | Seguir sin el cambio de tema |
| 2:15 | 4. Registro de pago (propietario) | Edge · `casa12@arcomunity.demo` | **Pagar ahora** → «Ya pagué, continuar» → «Probar con un comprobante de ejemplo» → **Continuar** → revisar datos → **Enviar comprobante** | «Tu comprobante fue enviado correctamente» (en revisión) o «¡Gracias! Tu pago quedó registrado» (si la validación automática está activa) | Tres pasos guiados. La captura se guarda en almacenamiento privado. El OCR lee monto, fecha y operación; la persona siempre puede corregir. Los errores aparecen junto a cada campo. | Mostrar el pago pendiente que ya tiene **Casa 08** |
| 3:45 | 5. Conciliación en tiempo real | Chrome · admin | Mirar **Conciliación** (el contador sube sin recargar) → **Revisar** Casa 12 → **Aprobar pago de S/ 150.00** | La fila desaparece de la cola; en Edge, Casa 12 pasa a «Pagada» sin recargar | Conciliar = comparar lo declarado con lo que llegó a la cuenta. Las reglas validan solas los pagos sin alertas; los dudosos llegan aquí con el motivo. Al rechazar, el vecino ve el motivo. | Recargar la página (F5); o aprobar/rechazar el de Casa 08 |
| 5:00 | 6. Reportes | Admin · **Reportes** | Mes noviembre de 2026; «Imprimir / PDF» (solo mostrar) | Casa 12 «Pagada»; ingresos, egresos y saldo calculados en el servidor | Rendición de cuentas lista para la asamblea. **Transparencia** muestra a los vecinos los totales sin nombres. | Mostrar captura |
| 5:45 | 7. Auditoría | Admin · **Auditoría** | Buscar «aprobar» | Registro «aprobar pago» con persona, hora y detalle | Bitácora escrita por el servidor; nadie puede editarla ni borrarla (ni siquiera la administración). | — |
| 6:30 | 8. Predicción de morosidad | Admin · **Predicción de morosidad** | Leer el aviso de modelo experimental; señalar una fila «alto» y su «Por qué» | 30 cuotas de diciembre; riesgo alto y bajo; acción sugerida «Priorizar recordatorio» | El modelo estima, **antes del vencimiento**, qué cuotas podrían pagarse tarde, para priorizar recordatorios. Se calcula en PostgreSQL con los parámetros del modelo entrenado en Python (no ejecuta el archivo joblib). | Mostrar `evidencias/03_prediccion_resultados_escritorio.png` |
| 7:30 | 9. Interpretación del ML | Misma pantalla + notebook | Ayuda «¿Qué significa el riesgo de morosidad?»; abrir el notebook en la matriz de confusión | — | Regresión logística elegida con una regla registrada antes de comparar 7 algoritmos (empate práctico con SVM RBF; menos morosas sin aviso y explicable). En prueba: recall 0,846 (11 de 13 morosas avisadas), precision 0,611. Datos simulados: cifras indicativas, nunca para sancionar. | Mostrar `comparacion/RESULTADOS.md` |
| 8:45 | 10. Reinicio del escenario | Admin · **Auditoría** | **Reiniciar demostración** → leer el aviso → marcar «Entiendo…» → **Reiniciar demostración** | Mensaje con los pagos y archivos del ensayo quitados; la bitácora conserva todo y agrega «reiniciar demo» | Cualquier error del ensayo se corrige en un clic. Solo la administración puede hacerlo, lo valida el servidor y solo afecta a la junta ficticia. Cada noche (03:00) se restaura sola. | `npm run demo:restaurar` desde la laptop |

Al terminar, si habrá otra exposición: **Preparar demostración** otra vez.

---

## Demostración reducida (3–5 minutos)

| # | Página y cuenta | Qué pulsar | Qué decir |
| --- | --- | --- | --- |
| 1 | Chrome · admin · Resumen | — | Problema y solución en una frase; métricas calculadas en el servidor. |
| 2 | Edge · `casa12` | Pagar ahora → comprobante de ejemplo → Continuar → Enviar | Pago guiado en 3 pasos para personas mayores. |
| 3 | Chrome · Conciliación | Revisar → Aprobar | Llega en tiempo real; el vecino ve «Pagada» al instante. |
| 4 | Chrome · Predicción de morosidad | Señalar riesgo alto y «Por qué» | ML para priorizar recordatorios, calculado en la base; modelo experimental. |
| 5 | Chrome · Auditoría | Mostrar el registro y las Herramientas de demostración | Trazabilidad inmutable y reinicio seguro del escenario. |

---

## Plan B

| Situación | Qué hacer |
| --- | --- |
| La universidad bloquea `vercel.app` | Abrir <https://sistema-arcomunity-frontend.luxorift.workers.dev/login> (mismo código y misma base). |
| Ninguna web abre, pero Supabase responde (`npm run verificar:red`) | **App local:** en `sistema-arcomunity-frontend`, `npm run dev` → <http://localhost:5173>. Misma base y mismas cuentas. |
| Supabase no responde | Compartir datos del celular a la laptop (hotspot) y repetir. Si tampoco: plan sin internet. |
| Sin internet | 1) **Capturas reales:** carpeta `Demo_APF3_plan_B/capturas` junto al repositorio (claro y oscuro, escritorio y celular) y `ml/modelo_morosidad/evidencias/` (flujo del modelo). 2) **Notebook ejecutado:** `ml/modelo_morosidad/APF3_TD_Grupo6_ML_Innovacion.ipynb` con salidas guardadas. 3) **Inferencia offline en Python:** `cd ml/modelo_morosidad` y `python inferencia.py ejemplo_entrada.json` (probabilidad, riesgo y factores de 3 cuotas). 4) **Evidencias:** `resultados/evidencia_integracion.json` (Python = PostgreSQL 30/30) y `evidencias/tabla_prediccion_mostrada.json` (pantalla = base 30/30). 5) **Video breve** del flujo: `Demo_APF3_plan_B/video` (administración en Chrome y propietaria en celular). Se regenera con `VIDEO=carpeta npm run grabar:demo`. |
| El escenario quedó desordenado | Auditoría → Reiniciar demostración → Preparar demostración. Sin acceso web: `npm run demo:restaurar`. |
| El tiempo real no llega | Recargar la página (F5): los datos se leen de la base; al volver a la pestaña también se recargan. |

---

## Preguntas probables

- **¿Por qué el reinicio no necesita otra contraseña?** Es una junta ficticia con credenciales públicas
  para la exposición. El servidor exige el rol de administración de **esa** junta y que esté en modo
  demostración; propietarios, visitantes y otras juntas reciben «No tienes permiso».
- **¿Se borra la auditoría al reiniciar?** No. Es inmutable; el reinicio agrega su propio registro.
- **¿La predicción es real?** Sí: la calcula PostgreSQL con el modelo v1 (paridad con scikit-learn
  < 1e-9). Pero se entrenó con datos **simulados**: por eso la pantalla advierte que es experimental.
- **¿Una captura de Yape confirma el pago?** No. Arcomunity no se conecta con bancos: la administración
  verifica en su app antes de aprobar.
