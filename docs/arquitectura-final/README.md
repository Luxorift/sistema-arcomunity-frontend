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

- **Borde continuo:** lo publicado hoy (`main` en `33acc2f`, migraciones 0100–1400).
- **Borde naranja discontinuo:** lo pendiente del PROY (PR #37, PR #38 y migración 1500).
- **Gris:** el entrenamiento fuera de línea y las herramientas.

Cuando se integren los PR y se aplique la migración 1500, se cambia el estilo de esas cajas a «publicado» en `CAJAS` y
se regenera.
