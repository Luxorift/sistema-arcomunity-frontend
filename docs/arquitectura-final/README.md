# Arquitectura final (Proyecto Final)

| Archivo | Uso |
| --- | --- |
| `arquitectura_final_proy.png` | Figura para el informe y la presentación (3400 × 2060 px) |
| `arquitectura_final_proy.svg` | Versión vectorial; se amplía sin perder nitidez |
| `arquitectura_final_proy.drawio` | Versión editable en <https://app.diagrams.net> (Archivo → Abrir desde → Dispositivo) |
| `generar_diagrama.py` | Única fuente del diagrama: genera el SVG y el `.drawio` a partir de la misma especificación |

**Cómo regenerar:**

1. Ejecutar `python docs/arquitectura-final/generar_diagrama.py`.
2. Para el PNG, abrir el SVG en un navegador y capturarlo a 2×, o exportarlo desde draw.io.

**Convención:**

Estado al 27/11/2026: todo el diagrama está publicado en la versión `v3.0.0` (`main` en `4d64550`, migraciones
0100–1500 aplicadas en Supabase).

- **Borde verde:** lo que ya existía antes del PROY (APF2 y APF3, migraciones 0100–1400).
- **Borde naranja:** lo nuevo del PROY, publicado en `v3.0.0` (PR #37, #38 y #39, migración 1500).
- **Gris:** el entrenamiento fuera de línea y las herramientas.

Hasta el 27/11/2026, antes de publicar, lo nuevo del PROY se dibujaba con borde naranja discontinuo («pendiente»).
