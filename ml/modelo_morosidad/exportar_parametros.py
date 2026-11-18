"""Exporta los parámetros de la regresión logística para calcularla dentro de Supabase (SQL), sin servidor.

La predicción es: z = intercepto + Σ coef_i · (x_i − media_i) / escala_i ;  probabilidad = 1 / (1 + e^(−z)).
El script verifica que esa fórmula reproduce exactamente las probabilidades de scikit-learn sobre las 359
cuotas del dataset antes de escribir modelo/parametros_sql_v1.json.
Uso: python exportar_parametros.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from caracteristicas import VARIABLES_MODELO, cargar_dataset, caracteristicas_al_corte
from inferencia import cargar_modelo

AQUI = Path(__file__).parent


def main() -> None:
    m = cargar_modelo()
    pipe, meta = m["pipeline"], m["meta"]
    escalador = pipe.named_steps["preprocesamiento"].named_transformers_["num"]
    lr = pipe.named_steps["modelo"]
    if not hasattr(lr, "coef_"):
        raise SystemExit("El modelo seleccionado no es lineal: no se exportan parámetros SQL.")
    params = {
        "modelo_version": meta["modelo_version"], "umbral": meta["umbral"], "caracteristicas": VARIABLES_MODELO,
        "media": dict(zip(VARIABLES_MODELO, map(float, escalador.mean_))),
        "escala": dict(zip(VARIABLES_MODELO, map(float, escalador.scale_))),
        "coeficientes": dict(zip(VARIABLES_MODELO, map(float, lr.coef_[0]))),
        "intercepto": float(lr.intercept_[0]),
    }
    # Paridad: fórmula manual vs. scikit-learn en todo el dataset.
    X = caracteristicas_al_corte(cargar_dataset(str(AQUI.parent / "dataset_apf3" / "dataset_arcomunity_apf3.csv")))[VARIABLES_MODELO]
    z = params["intercepto"] + sum(params["coeficientes"][v] * (X[v] - params["media"][v]) / params["escala"][v] for v in VARIABLES_MODELO)
    manual = 1 / (1 + np.exp(-z))
    sk = pipe.predict_proba(X)[:, 1]
    diferencia = float(np.max(np.abs(manual - sk)))
    mismas_decisiones = bool(((manual >= params["umbral"]) == (sk >= params["umbral"])).all())
    print(f"Paridad fórmula vs. scikit-learn en {len(X)} cuotas: diferencia máxima {diferencia:.2e} · mismas decisiones: {mismas_decisiones}")
    if diferencia > 1e-9 or not mismas_decisiones:
        raise SystemExit("La fórmula no reproduce el modelo: no se exporta.")
    params["paridad"] = {"cuotas": len(X), "diferencia_maxima": diferencia}
    (AQUI / "modelo" / f"parametros_sql_{meta['modelo_version']}.json").write_text(json.dumps(params, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(params, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
