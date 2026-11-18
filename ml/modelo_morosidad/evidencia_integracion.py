"""Evidencia de integración con el MVP (Anexo C): llamada real al modelo exportado con datos de Supabase.

1. Pide a Supabase las características de las cuotas con `ml_caracteristicas_cuotas` (la misma función que
   usará la integración final), con una fecha de corte anterior al vencimiento.
2. Aplica el modelo exportado (inferencia.py) y muestra el resultado en el formato del contrato.
3. Verifica que las variables calculadas por la base coinciden con las que se usaron para entrenar
   (caracteristicas.py sobre el CSV): misma definición en entrenamiento y en producción.

Solo lectura: no escribe en `predicciones_morosidad` ni modifica datos. Requiere en el .env.local del
proyecto (nunca en el repositorio) VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
Uso: python evidencia_integracion.py [--corte 2026-11-01]
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from caracteristicas import VARIABLES_MODELO, cargar_dataset, caracteristicas_al_corte
from inferencia import cargar_modelo, predecir_lote

AQUI = Path(__file__).parent
JUNTA_DEMO = "7a1c0de0-0000-4000-8000-000000000001"


def leer_env(ruta: Path) -> dict:
    env = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def rpc(url: str, clave: str, funcion: str, cuerpo: dict) -> list[dict]:
    req = urllib.request.Request(f"{url}/rest/v1/rpc/{funcion}", data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corte", default="2026-11-01", help="fecha de corte (antes del vencimiento del día 10)")
    args = ap.parse_args()
    env = leer_env(AQUI.parents[1] / ".env.local")
    registros = rpc(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], "ml_caracteristicas_cuotas",
                    {"p_junta": JUNTA_DEMO, "p_fecha_corte": args.corte, "p_horizonte_dias": 31})
    print(f"Supabase devolvió {len(registros)} cuotas por vencer al {args.corte} (ml_caracteristicas_cuotas)")

    modelo = cargar_modelo()
    salida = predecir_lote(modelo, registros)
    for r, p in zip(registros, salida["predicciones"]):
        p["unidad_ref"] = r["unidad_ref"]

    # Misma definición en entrenamiento y producción: comparar con caracteristicas.py sobre el CSV.
    df = cargar_dataset(str(AQUI.parent / "dataset_apf3" / "dataset_arcomunity_apf3.csv"))
    X = caracteristicas_al_corte(df)
    del_csv = pd.concat([df[["unidad_ref", "periodo"]], X[VARIABLES_MODELO]], axis=1)
    del_csv = del_csv[del_csv["periodo"] == pd.Timestamp(args.corte)].set_index("unidad_ref")
    diferencias = []
    for r in registros:
        if r["unidad_ref"] in del_csv.index:
            for v in VARIABLES_MODELO:
                if abs(float(r[v]) - float(del_csv.loc[r["unidad_ref"], v])) > 0.01:
                    diferencias.append({"unidad_ref": r["unidad_ref"], "variable": v, "supabase": r[v], "csv": float(del_csv.loc[r["unidad_ref"], v])})
    comparadas = sum(r["unidad_ref"] in del_csv.index for r in registros)
    print(f"Variables Supabase vs. entrenamiento: {comparadas} cuotas comparadas, {len(diferencias)} diferencias")

    altos = sorted(salida["predicciones"], key=lambda p: -p["probabilidad"])
    print(f"Cuotas en riesgo alto: {sum(p['nivel_riesgo'] == 'alto' for p in altos)} de {len(altos)}")
    for p in altos[:5]:
        print(f"  {p['unidad_ref']}  prob {p['probabilidad']:.3f}  {p['nivel_riesgo']}  factores {[f['variable'] for f in p['factores']]}")

    evidencia = {
        "generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fuente": "Supabase · rpc ml_caracteristicas_cuotas (junta de demostración, datos simulados)",
        "fecha_corte": args.corte, "cuotas": len(registros),
        "ejemplo_entrada": registros[0] if registros else None,
        "salida": salida,
        "consistencia_con_entrenamiento": {"comparadas": comparadas, "diferencias": diferencias},
        "escritura_en_base": "ninguna (solo lectura)",
    }
    destino = AQUI / "resultados" / "evidencia_integracion.json"
    destino.write_text(json.dumps(evidencia, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Evidencia guardada en {destino.relative_to(AQUI)}")


if __name__ == "__main__":
    main()
