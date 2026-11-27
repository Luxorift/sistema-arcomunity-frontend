"""Robustez ante una junta de perfil difuso (observación O7 del reporte de APF3). Ver REGLA_DE_MEJORA.md, sección 7.

En la semilla del MVP, 5 unidades crónicas concentran el 72 % de la morosidad. Aquí se simula una junta con la misma
tasa media (~21 %), pero con la propensión de cada unidad tomada de una distribución continua Beta(2; 7,57), sin
perfiles fijos. El escenario:
- es 100 % simulado y está rotulado (`origen = simulado`, `escenario = difuso`, `semilla`);
- se guarda aparte (ml/proy/datos/) y no modifica el dataset de APF3;
- NO entrena, NO elige modelos y NO ajusta umbrales: los modelos ya entrenados con APF3 (meses 1–10) solo predicen.

Se generan 30 réplicas (semillas 42 a 71); se guarda el CSV de la réplica 42 y el resumen de todas.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from comun import CANDIDATOS, RESULTADOS, AQUI, VARIABLES_PROY, cargar, caracteristicas_al_corte, pipeline, variables_recencia
from comparacion import metricas

TASA_OBJETIVO = 0.209
ALFA, BETA = 2.0, 2.0 * (1 - TASA_OBJETIVO) / TASA_OBJETIVO      # media = 0,209
P_IMPAGA = 14 / 75                                                 # proporción de morosas impagas en APF3
METODOS = ["yape_qr", "yape_captura", "efectivo"]
PERIODOS = pd.date_range("2025-12-01", periods=12, freq="MS")


def generar(semilla: int) -> pd.DataFrame:
    rng = np.random.default_rng(semilla)
    propension = rng.beta(ALFA, BETA, size=30)
    filas = []
    for u in range(30):
        ref = "U-" + hashlib.sha256(f"difuso-{semilla}-{u}".encode()).hexdigest()[:10]
        for p in PERIODOS:
            venc = p + pd.Timedelta(days=9)
            if rng.random() < propension[u]:
                if rng.random() < P_IMPAGA and p >= PERIODOS[-3]:          # impagas solo en los últimos meses
                    pago, metodo = pd.NaT, None
                else:
                    pago, metodo = venc + pd.Timedelta(days=int(rng.integers(1, 16))), METODOS[int(rng.integers(0, 3))]
            else:
                pago, metodo = p + pd.Timedelta(days=int(rng.integers(0, 10))), METODOS[int(rng.integers(0, 3))]
            moroso = int(pd.isna(pago) or pago > venc)
            dias = 0 if pd.isna(pago) else max(0, (pago - venc).days)
            filas.append({"unidad_ref": ref, "periodo": p, "monto": 150.0, "fecha_vencimiento": venc, "fecha_pago": pago,
                          "dias_atraso": dias, "metodo_pago": metodo, "moroso": moroso, "es_simulado": 1,
                          "origen": "simulado", "escenario": "difuso", "semilla": semilla})
    df = pd.DataFrame(filas).sort_values(["periodo", "unidad_ref"]).reset_index(drop=True)
    df["pagos_atrasados_previos"] = caracteristicas_al_corte(df)["pagos_atrasados_previos"].values
    return df


def main() -> None:
    _, X, y, mes = cargar()
    ev = mes < 10
    cfg = json.loads((RESULTADOS / "decision.json").read_text(encoding="utf-8"))["configuracion_final"]
    modelos = {n: (v, pipeline(v).set_params(modelo__C=cfg[n]["C"], modelo__class_weight=cfg[n]["class_weight"]).fit(X.loc[ev, v], y[ev]),
                   cfg[n]["umbral"]) for n, (v, _) in CANDIDATOS.items() if n in ("APF3 corregido", "PROY-A · recencia")}
    filas = []
    for semilla in range(42, 72):
        df = generar(semilla)
        if semilla == 42:
            (AQUI / "datos").mkdir(exist_ok=True)
            df.drop(columns=[]).to_csv(AQUI / "datos" / "escenario_difuso_semilla42.csv", index=False, date_format="%Y-%m-%d",
                                       lineterminator="\n", encoding="utf-8-sig")
        Xd = pd.concat([caracteristicas_al_corte(df), variables_recencia(df)], axis=1)[VARIABLES_PROY]
        sel = df["periodo"] >= PERIODOS[3]                                 # meses con al menos 3 de historial
        yd = df.loc[sel, "moroso"].values
        concentr = df.groupby("unidad_ref")["moroso"].sum().sort_values(ascending=False)
        base = {"semilla": semilla, "tasa_morosidad": yd.mean(), "concentracion_top5": concentr.head(5).sum() / concentr.sum()}
        filas.append({**base, "modelo": "Regla: atraso en 3 meses previos",
                      **metricas(yd, (Xd.loc[sel, "pagos_atrasados_previos"] >= 1).astype(int).values)})
        for n, (v, m, u) in modelos.items():
            s = m.predict_proba(Xd.loc[sel, v])[:, 1]
            filas.append({**base, "modelo": n, **metricas(yd, (s >= u).astype(int), s)})
    r = pd.DataFrame(filas)
    r.to_csv(RESULTADOS / "robustez_difuso_replicas.csv", index=False, lineterminator="\n")
    resumen = r.groupby("modelo")[["recall", "precision", "f1", "avg_precision", "tasa_morosidad", "concentracion_top5"]].agg(["mean", "min", "max"]).round(3)
    resumen.to_csv(RESULTADOS / "robustez_difuso_resumen.csv", lineterminator="\n")
    pd.set_option("display.width", 250)
    print(resumen.to_string())


if __name__ == "__main__":
    main()
