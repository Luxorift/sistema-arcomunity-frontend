"""Genera el diagrama de la arquitectura final de Arcomunity (PROY) en SVG y en draw.io (editable).

Uso:  python docs/arquitectura-final/generar_diagrama.py
Salida: arquitectura_final_proy.svg y arquitectura_final_proy.drawio en esta carpeta. El PNG se obtiene
del SVG (ver README de la carpeta). Una sola especificación alimenta los dos formatos, así no se desalinean.

Convención visual:
  - borde verde = publicado antes del PROY (APF2 y APF3, migraciones 0100–1400);
  - borde naranja = nuevo del PROY, publicado en v3.0.0 (main 4d64550; PR #37, #38 y #39; migración 1500);
  - gris = fuera de línea o herramientas de desarrollo.
"""
from __future__ import annotations

from html import escape
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ANCHO, ALTO = 1700, 1030

PUB = {"fill": "#FFFFFF", "stroke": "#2F6B5A", "dash": False, "texto": "#173A33"}
PROY = {"fill": "#FFF4E5", "stroke": "#D9822B", "dash": False, "texto": "#5C3A0E"}
OFF = {"fill": "#F2F4F3", "stroke": "#8A9894", "dash": False, "texto": "#3B4A47"}
NOTA = {"fill": "#F7F9F6", "stroke": "#B9C7C0", "dash": True, "texto": "#3B4A47"}

# Grupos: (id, x, y, w, h, título, estilo de fondo, borde, discontinuo)
GRUPOS = [
    ("g_usu", 10, 100, 225, 310, "Usuarios", "#EEF5F1", "#9DB8AD", False),
    ("g_front", 250, 100, 335, 600, "Frontend publicado · archivos estáticos", "#EEF5F1", "#9DB8AD", False),
    ("g_supa", 605, 60, 770, 925, "Supabase · un solo proyecto (plan gratuito)", "#E8F1F6", "#7FA7BC", False),
    ("g_pg", 628, 185, 726, 775, "PostgreSQL", "#F5FAFD", "#9CBBCC", False),
    ("g_neg", 645, 305, 690, 130, "Datos del negocio", "#FFFFFF00", "#C3D5DE", False),
    ("g_ml", 645, 448, 690, 222, "Inferencia ML dentro de la base · APF3", "#FFFFFF00", "#2F6B5A", False),
    ("g_proy", 645, 683, 690, 210, "Flujo E2E · PROY (migración 1500 · publicado en v3.0.0)", "#FFF9F0", "#D9822B", False),
    ("g_off", 1395, 60, 295, 420, "Entrenamiento del modelo (fuera de línea)", "#F2F4F3", "#8A9894", False),
    ("g_repo", 1395, 500, 295, 300, "Repositorio y entrega continua", "#F2F4F3", "#8A9894", False),
]

# Cajas: (id, x, y, w, h, [líneas], estilo)  — la primera línea va en negrita.
CAJAS = [
    ("u1", 25, 140, 195, 66, ["Administración de la junta", "navegador de escritorio"], PUB),
    ("u2", 25, 225, 195, 66, ["Propietarios", "navegador del celular"], PUB),
    ("u3", 25, 310, 195, 66, ["Docente y revisores", "cuentas de demostración"], PUB),
    ("b1", 268, 140, 145, 62, ["Vercel", "dominio principal"], PUB),
    ("b2", 423, 140, 145, 62, ["Cloudflare Workers", "dominio alternativo"], PUB),
    ("b3", 268, 222, 300, 118, ["SPA React 19 + Vite + TypeScript", "Cuotas · Pagos · Conciliación R1–R4",
                                "Egresos · Reportes · Transparencia", "Auditoría · Predicción de morosidad"], PUB),
    ("b4", 268, 360, 300, 60, ["supabase-js", "clave pública + JWT del usuario"], PUB),
    ("b5", 268, 440, 300, 60, ["Interfaz PROY", "recordatorio · probar un caso · prueba de fallas"], PROY),
    ("b6", 268, 518, 300, 60, ["Tiempo límite de 8 s", "aviso + regla manual en pantalla"], PROY),
    ("b7", 268, 598, 300, 82, ["Sin datos de negocio en el navegador", "localStorage solo guarda el tema visual",
                               "y el aviso de bienvenida cerrado"], NOTA),
    ("c1", 628, 116, 172, 60, ["Auth", "correo + contraseña · JWT"], PUB),
    ("c2", 812, 116, 172, 60, ["API REST y RPC", "PostgREST"], PUB),
    ("c3", 996, 116, 172, 60, ["Realtime", "cambios de cuotas y pagos"], PUB),
    ("c4", 1180, 116, 174, 60, ["Storage privado", "comprobantes y QR · URL firmadas"], PUB),
    ("c5", 645, 225, 335, 62, ["RLS en todas las tablas", "aislamiento por junta y unidad"], PUB),
    ("c6", 1000, 225, 335, 62, ["Funciones RPC SECURITY DEFINER", "únicas vías de escritura financiera"], PUB),
    ("c7", 660, 340, 310, 78, ["juntas · unidades · perfiles", "cuotas · pagos · egresos · cámaras",
                               "consentimiento con fecha (Ley 29733)"], PUB),
    ("c8", 990, 340, 330, 78, ["auditoria", "inmutable: no se edita ni se borra", "registra quién hizo qué y cuándo"], PUB),
    ("c10", 660, 483, 315, 62, ["ml_caracteristicas_cuotas()", "variables al corte, sin fuga de información"], PUB),
    ("c9", 1000, 483, 315, 62, ["modelos_ml", "v1: coeficientes, media, escala, umbral 0,2258"], PUB),
    ("c11", 660, 578, 315, 80, ["calcular_riesgo_morosidad()", "ml_probabilidad + ml_factores",
                                "paridad con scikit-learn (115 casos)"], PUB),
    ("c12", 1000, 578, 315, 80, ["predicciones_morosidad", "una vigente por cuota y corte",
                                 "PROY: origen modelo o respaldo"], PUB),
    ("c13", 660, 720, 315, 60, ["calcular_riesgo_periodo()", "cuotas nuevas → predicción automática"], PROY),
    ("c14", 1000, 720, 315, 60, ["ml_evaluar()", "valida entrada y salida · regla de respaldo"], PROY),
    ("c17", 660, 798, 205, 82, ["probar_entrada_modelo()", "rechaza entradas inválidas", "simular_falla_modelo() (demo)"], PROY),
    ("c16", 880, 798, 205, 82, ["recordatorios", "acción de la administración", "auditada"], PROY),
    ("c15", 1100, 798, 215, 82, ["registro_predicciones", "solo inserción · lote y demora", "conservación de 12 meses"], PROY),
    ("c18", 645, 905, 690, 44, ["pg_cron", "restauración nocturna de la demo (03:00, Lima) · purga mensual del registro (PROY)"], PUB),
    ("d1", 1415, 100, 255, 62, ["Notebook en Colab · Python 3.12", "scikit-learn 1.9.1 · random_state 42"], OFF),
    ("d2", 1415, 185, 255, 62, ["ml/modelo_morosidad", "v1: joblib + metadatos (APF3)"], OFF),
    ("d3", 1415, 270, 255, 62, ["ml/proy · PR #37", "corrección, mejora y robustez"], PROY),
    ("d4", 1415, 355, 255, 100, ["exportar_parametros.py", "coeficientes → JSON → migración SQL",
                                 "Python y PostgreSQL dan la misma", "probabilidad (< 10⁻⁹)"], OFF),
    ("e1", 1415, 540, 255, 60, ["GitHub", "main (publicado) · dev · Pull Requests"], OFF),
    ("e2", 1415, 618, 255, 60, ["Pruebas automáticas", "Vitest + PGlite · 151 aprobadas"], OFF),
    ("e3", 1415, 696, 255, 86, ["Builds automáticos", "main → producción", "Pull Request → vista previa"], OFF),
]

# Flechas: (puntos, etiqueta, posición de la etiqueta, discontinua, color)
VERDE, NARANJA, GRIS, AZUL = "#2F6B5A", "#D9822B", "#7A8885", "#3C7090"
FLECHAS = [
    ([(235, 281), (268, 281)], "HTTPS", (236, 274), False, VERDE),
    ([(340, 202), (340, 222)], "", None, False, VERDE),
    ([(495, 202), (495, 222)], "", None, False, VERDE),
    ([(418, 340), (418, 360)], "", None, False, VERDE),
    ([(568, 390), (594, 390), (594, 100), (1267, 100), (1267, 116)], "supabase-js: sesión, consultas, RPC, Realtime y archivos", (1052, 95), False, AZUL),
    ([(714, 100), (714, 116)], "", None, False, AZUL),
    ([(898, 100), (898, 116)], "", None, False, AZUL),
    ([(1082, 100), (1082, 116)], "", None, False, AZUL),
    ([(898, 176), (898, 205), (812, 205), (812, 225)], "", None, False, AZUL),
    ([(898, 205), (1167, 205), (1167, 225)], "", None, False, AZUL),
    ([(760, 545), (760, 578)], "variables", (766, 566), False, VERDE),
    ([(1157, 545), (1157, 561), (900, 561), (900, 578)], "parámetros v1", (1010, 556), False, VERDE),
    ([(975, 618), (1000, 618)], "", None, False, VERDE),
    ([(975, 750), (1000, 750)], "", None, False, NARANJA),
    ([(1157, 720), (1157, 658)], "guarda: modelo o respaldo", (1163, 695), False, NARANJA),
    ([(1315, 640), (1340, 640), (1340, 839), (1315, 839)], "disparador", (1281, 680), False, NARANJA),
    ([(1542, 162), (1542, 185)], "", None, False, GRIS),
    ([(1542, 247), (1542, 270)], "", None, False, NARANJA),
    ([(1542, 332), (1542, 355)], "", None, False, GRIS),
    ([(1415, 405), (1385, 405), (1385, 514), (1315, 514)], "migración SQL", (1322, 508), False, GRIS),
    ([(1542, 600), (1542, 618)], "", None, False, GRIS),
    ([(1542, 678), (1542, 696)], "", None, False, GRIS),
    ([(1415, 739), (1388, 739), (1388, 1000), (418, 1000), (418, 700)], "despliegue automático del frontend", (430, 994), False, GRIS),
]

LEYENDA = (10, 725, 225, 200)


def caja_svg(x, y, w, h, lineas, e, borde_ancho=1.4):
    dash = ' stroke-dasharray="6 4"' if e["dash"] else ""
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{e["fill"]}" stroke="{e["stroke"]}" stroke-width="{borde_ancho}"{dash}/>']
    n = len(lineas)
    alto_txt = 16 + 14 * (n - 1)
    y0 = y + (h - alto_txt) / 2 + 12
    for i, t in enumerate(lineas):
        peso, tam = ("700", 12.5) if i == 0 else ("400", 11)
        s.append(f'<text x="{x + w / 2}" y="{y0 + (0 if i == 0 else 3 + 14 * i)}" text-anchor="middle" font-size="{tam}" '
                 f'font-weight="{peso}" fill="{e["texto"]}">{escape(t)}</text>')
    return "\n".join(s)


def svg() -> str:
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{ANCHO}" height="{ALTO}" viewBox="0 0 {ANCHO} {ALTO}" '
           'font-family="Segoe UI, Arial, sans-serif">',
           '<defs>' + "".join(f'<marker id="m{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                              f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>' for c in (VERDE, NARANJA, GRIS, AZUL)) + '</defs>',
           f'<rect width="{ANCHO}" height="{ALTO}" fill="#FFFFFF"/>',
           '<text x="10" y="32" font-size="21" font-weight="700" fill="#173A33">Arquitectura final de Arcomunity · Proyecto Final</text>',
           '<text x="10" y="52" font-size="12" fill="#4A5D58">Estado al 27/11/2026: todo publicado en v3.0.0 (main 4d64550, '
           'migraciones 0100–1500). Borde verde: anterior al PROY. Borde naranja: nuevo del PROY.</text>']
    for _, x, y, w, h, t, fondo, borde, dash in GRUPOS:
        d = ' stroke-dasharray="8 5"' if dash else ""
        relleno = "none" if fondo.endswith("00") else fondo
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{relleno}" stroke="{borde}" stroke-width="1.4"{d}/>')
        out.append(f'<text x="{x + 12}" y="{y + 20}" font-size="12.5" font-weight="700" fill="#2A4A55">{escape(t)}</text>')
    for _, x, y, w, h, lineas, e in CAJAS:
        out.append(caja_svg(x, y, w, h, lineas, e))
    for puntos, etiqueta, pos, dash, color in FLECHAS:
        d = ' stroke-dasharray="6 4"' if dash else ""
        pts = " ".join(f"{a},{b}" for a, b in puntos)
        out.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.6"{d} marker-end="url(#m{color[1:]})"/>')
        if etiqueta:
            out.append(f'<text x="{pos[0]}" y="{pos[1]}" font-size="10.5" fill="{color}" font-style="italic">{escape(etiqueta)}</text>')
    x, y, w, h = LEYENDA
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#FFFFFF" stroke="#B9C7C0"/>')
    out.append(f'<text x="{x + 12}" y="{y + 22}" font-size="12.5" font-weight="700" fill="#173A33">Leyenda</text>')
    items = [(PUB, "Anterior al PROY", "APF2 y APF3 · migraciones 0100–1400"),
             (PROY, "Nuevo del PROY (publicado)", "v3.0.0 · PR #37–#39 · migración 1500"),
             (OFF, "Fuera de línea o herramienta", "entrenamiento, repositorio, CI")]
    for i, (e, a, b) in enumerate(items):
        yy = y + 38 + i * 50
        dash = ' stroke-dasharray="6 4"' if e["dash"] else ""
        out.append(f'<rect x="{x + 12}" y="{yy}" width="34" height="24" rx="5" fill="{e["fill"]}" stroke="{e["stroke"]}" stroke-width="1.4"{dash}/>')
        out.append(f'<text x="{x + 55}" y="{yy + 10}" font-size="11.5" font-weight="700" fill="#173A33">{a}</text>')
        out.append(f'<text x="{x + 55}" y="{yy + 24}" font-size="10" fill="#4A5D58">{b}</text>')
    out.append(f'<text x="{x + 12}" y="{y + h - 12}" font-size="10" fill="#4A5D58">Flecha naranja: flujo nuevo del PROY.</text>')
    out.append("</svg>")
    return "\n".join(out)


def drawio() -> str:
    celdas, n = [], 2

    def nid():
        nonlocal n
        n += 1
        return f"c{n}"

    for _, x, y, w, h, t, fondo, borde, dash in GRUPOS:
        relleno = "none" if fondo.endswith("00") else fondo
        celdas.append(f'<mxCell id="{nid()}" value="{escape(t)}" style="rounded=1;arcSize=4;whiteSpace=wrap;html=1;fillColor={relleno};'
                      f'strokeColor={borde};dashed={int(dash)};verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontStyle=1;'
                      f'fontSize=12;fontColor=#2A4A55;" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    for _, x, y, w, h, lineas, e in CAJAS:
        valor = escape(f"<b>{escape(lineas[0])}</b>" + "".join(f"<br>{escape(t)}" for t in lineas[1:]))
        celdas.append(f'<mxCell id="{nid()}" value="{valor}" style="rounded=1;whiteSpace=wrap;html=1;fillColor={e["fill"]};'
                      f'strokeColor={e["stroke"]};dashed={int(e["dash"])};fontSize=11;fontColor={e["texto"]};" vertex="1" parent="1">'
                      f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    for puntos, etiqueta, _, dash, color in FLECHAS:
        (x0, y0), (x1, y1), medio = puntos[0], puntos[-1], puntos[1:-1]
        wps = "".join(f'<mxPoint x="{a}" y="{b}"/>' for a, b in medio)
        celdas.append(f'<mxCell id="{nid()}" value="{escape(etiqueta)}" style="edgeStyle=none;html=1;endArrow=block;endFill=1;'
                      f'strokeColor={color};fontColor={color};fontSize=10;fontStyle=2;dashed={int(dash)};" edge="1" parent="1">'
                      f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x0}" y="{y0}" as="sourcePoint"/>'
                      f'<mxPoint x="{x1}" y="{y1}" as="targetPoint"/><Array as="points">{wps}</Array></mxGeometry></mxCell>')
    titulo = escape("<b>Arquitectura final de Arcomunity · Proyecto Final</b><br>Estado al 27/11/2026: todo publicado en v3.0.0 "
                    "(main 4d64550, migraciones 0100–1500). Borde verde: anterior al PROY. Borde naranja: nuevo del PROY.")
    celdas.append(f'<mxCell id="{nid()}" value="{titulo}" style="text;html=1;align=left;verticalAlign=top;fontSize=13;" vertex="1" parent="1">'
                  '<mxGeometry x="10" y="10" width="1200" height="46" as="geometry"/></mxCell>')
    x, y, w, h = LEYENDA
    ley = escape("<b>Leyenda</b><br>Borde verde: anterior al PROY (APF2 y APF3, migraciones 0100–1400)<br>"
                 "Borde naranja: nuevo del PROY, publicado en v3.0.0 (PR #37–#39, migración 1500)<br>Gris: fuera de línea o herramienta")
    celdas.append(f'<mxCell id="{nid()}" value="{ley}" style="rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;'
                  f'fillColor=#FFFFFF;strokeColor=#B9C7C0;fontSize=11;" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return ('<mxfile host="app.diagrams.net"><diagram name="Arquitectura final PROY" id="arquitectura-final-proy">'
            f'<mxGraphModel dx="{ANCHO}" dy="{ALTO}" grid="1" gridSize="10" page="1" pageWidth="{ANCHO}" pageHeight="{ALTO}" math="0" shadow="0">'
            '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(celdas) + '</root></mxGraphModel></diagram></mxfile>\n')


if __name__ == "__main__":
    (AQUI / "arquitectura_final_proy.svg").write_text(svg() + "\n", encoding="utf-8")
    (AQUI / "arquitectura_final_proy.drawio").write_text(drawio(), encoding="utf-8")
    print("SVG y draw.io generados en", AQUI)
