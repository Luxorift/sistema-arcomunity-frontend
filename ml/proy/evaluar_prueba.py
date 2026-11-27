"""Evaluación ÚNICA en la prueba (meses 11–12) de los modelos de la regla de mejora. Ver REGLA_DE_MEJORA.md, sección 5.

- Lee la configuración fijada en resultados/decision.json (confirmada en Git antes de ejecutar este script).
- Entrena cada modelo con los meses 1–10 y evalúa los meses 11–12 una sola vez.
- Se niega a ejecutarse si resultados/prueba/ ya existe.
- El resultado no cambia la decisión.
"""
from __future__ import annotations

import json
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier

from comun import CANDIDATOS, ML, RESULTADOS, SEMILLA, VARIABLES_MODELO, cargar, entorno, guardar_json, pipeline
from comparacion import metricas

SALIDA = RESULTADOS / "prueba"


def main() -> None:
    if SALIDA.exists():
        sys.exit(f"La prueba ya se evaluó ({SALIDA}). No se vuelve a ejecutar.")
    decision = json.loads((RESULTADOS / "decision.json").read_text(encoding="utf-8"))
    np.random.seed(SEMILLA)
    env = entorno()
    _, X, y, mes = cargar()
    ev, pru = mes < 10, mes >= 10
    assert int(pru.sum()) == 59 and int(y[pru].sum()) == 13

    filas, predicciones = [], {}
    v1_meta = json.loads((ML / "modelo_morosidad" / "modelo" / "modelo_morosidad_v1.json").read_text(encoding="utf-8"))
    filas.append({"modelo": "APF3 entregado (referencia, informe APF3)", "fuente": "modelo_morosidad_v1.json",
                  **{k: v1_meta["metricas_prueba"][k] for k in ("accuracy", "precision", "recall", "f1")}})
    for nombre, pred in {
        "Dummy (clase mayoritaria)": DummyClassifier(strategy="most_frequent").fit(X[ev], y[ev]).predict(X[pru]),
        "Dummy (estratificado)": DummyClassifier(strategy="stratified", random_state=SEMILLA).fit(X[ev], y[ev]).predict(X[pru]),
        "Regla: atraso en 3 meses previos": (X.loc[pru, "pagos_atrasados_previos"] >= 1).astype(int).values,
    }.items():
        filas.append({"modelo": nombre, "fuente": "línea base", **metricas(y[pru], pred)})
    for nombre, (variables, _) in CANDIDATOS.items():
        cfg = decision["configuracion_final"][nombre]
        modelo = pipeline(variables).set_params(modelo__C=cfg["C"], modelo__class_weight=cfg["class_weight"]).fit(X.loc[ev, variables], y[ev])
        s = modelo.predict_proba(X.loc[pru, variables])[:, 1]
        predicciones[nombre] = (modelo, s)
        filas.append({"modelo": nombre + (" (servido)" if nombre == decision["modelo_servido"] else ""),
                      "fuente": f"pipeline PROY · C={cfg['C']} · class_weight={cfg['class_weight']} · umbral={cfg['umbral']:.4f}",
                      **metricas(y[pru], (s >= cfg["umbral"]).astype(int), s)})
    tabla = pd.DataFrame(filas)

    # APF3 corregido frente al joblib entregado: ¿es el mismo modelo?
    v1 = joblib.load(ML / "modelo_morosidad" / "modelo" / "modelo_morosidad_v1.joblib")
    dif = float(np.max(np.abs(v1.predict_proba(X.loc[pru, VARIABLES_MODELO])[:, 1] - predicciones["APF3 corregido"][1])))

    SALIDA.mkdir(parents=True)
    tabla.round(4).to_csv(SALIDA / "metricas_prueba.csv", index=False)
    guardar_json({"entorno": env, "decision_leida": {k: decision[k] for k in ("modelo_servido", "reemplaza_a_apf3_corregido", "motivo")},
                  "max_dif_probabilidad_apf3_corregido_vs_joblib_v1": dif,
                  "nota": "Los meses 11–12 ya se observaron en APF3 con v1; para los modelos PROY es su primera evaluación."},
                 SALIDA / "registro_ejecucion.json")
    pd.set_option("display.width", 220)
    print(tabla[["modelo", "accuracy", "precision", "recall", "f1", "fn", "fp", "recordatorios"]].round(3).to_string(index=False))
    print(f"Diferencia máxima APF3 corregido vs joblib v1: {dif:.2e}")


if __name__ == "__main__":
    main()
