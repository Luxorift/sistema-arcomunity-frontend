"""Comparación de algoritmos del temario (S13–S14) con evaluación anidada de origen móvil.

Aplica la regla registrada en comparacion/REGLA_DE_SELECCION.md. Usa SOLO los meses 1–10: la prueba
(meses 11–12) se descarta antes de calcular nada.

Para cada mes externo k = 5…10: se entrena con los meses < k, se eligen hiperparámetros con validación cruzada
temporal interna (predecir cada mes j < k con los meses < j) y el umbral con esas predicciones internas
(mayor umbral con recall ≥ 0,80); luego se predice el mes k. Resultado: 180 predicciones externas por modelo.

Uso: python comparacion.py   (escribe en comparacion/)
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import AdaBoostClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, confusion_matrix, f1_score, fbeta_score,
                             precision_score, recall_score)
from sklearn.model_selection import GridSearchCV
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from caracteristicas import VARIABLES_MODELO, cargar_dataset, caracteristicas_al_corte

SEMILLA = 42
META_RECALL = 0.80
AQUI = Path(__file__).parent
SALIDA = AQUI / "comparacion"
MESES_PERMITIDOS = 10           # meses 1–10; 11–12 son la prueba y no se usan
MESES_EXTERNOS = range(4, 10)   # índices 0-based → meses 5…10

# Explicabilidad e integración (regla, desempate iii y iv): menor = mejor.
EXPLICABILIDAD = {"Regresión logística": 1, "Árbol de decisión": 1, "SVM lineal": 2, "KNN": 3, "SVM RBF": 3,
                  "AdaBoost": 3, "Gradient Boosting": 3}
INTEGRACION = {"Regresión logística": "SQL ya implementado (paridad exacta)", "Árbol de decisión": "traducible a reglas SQL",
               "SVM lineal": "fórmula lineal en SQL (sin probabilidad calibrada)", "KNN": "servicio Python (guarda datos de entrenamiento)",
               "SVM RBF": "servicio Python", "AdaBoost": "servicio Python", "Gradient Boosting": "servicio Python"}
COSTO_INTEGRACION = {"Regresión logística": 1, "Árbol de decisión": 2, "SVM lineal": 2, "KNN": 3, "SVM RBF": 3,
                     "AdaBoost": 3, "Gradient Boosting": 3}


def pipe(modelo, escalar: bool) -> Pipeline:
    pre = ColumnTransformer([("num", StandardScaler() if escalar else "passthrough", VARIABLES_MODELO)])
    return Pipeline([("preprocesamiento", pre), ("modelo", modelo)])


def candidatos() -> dict:
    return {
        "Regresión logística": (pipe(LogisticRegression(max_iter=2000, random_state=SEMILLA), True),
                                {"modelo__C": [0.01, 0.1, 1, 10], "modelo__class_weight": [None, "balanced"]}),
        "SVM lineal": (pipe(SVC(kernel="linear", random_state=SEMILLA), True),
                       {"modelo__C": [0.1, 1, 10], "modelo__class_weight": [None, "balanced"]}),
        "SVM RBF": (pipe(SVC(kernel="rbf", gamma="scale", random_state=SEMILLA), True),
                    {"modelo__C": [0.1, 1, 10], "modelo__class_weight": [None, "balanced"]}),
        "KNN": (pipe(KNeighborsClassifier(), True),
                {"modelo__n_neighbors": [5, 11, 21, 31], "modelo__weights": ["uniform", "distance"]}),
        "Árbol de decisión": (pipe(DecisionTreeClassifier(random_state=SEMILLA), False),
                              {"modelo__max_depth": [2, 3, 4, 5], "modelo__min_samples_leaf": [5, 10, 20],
                               "modelo__class_weight": [None, "balanced"]}),
        "AdaBoost": (pipe(AdaBoostClassifier(estimator=DecisionTreeClassifier(max_depth=1), random_state=SEMILLA), False),
                     {"modelo__n_estimators": [25, 50, 100, 200], "modelo__learning_rate": [0.1, 0.5, 1.0]}),
        "Gradient Boosting": (pipe(GradientBoostingClassifier(random_state=SEMILLA), False),
                              {"modelo__n_estimators": [50, 100], "modelo__max_depth": [1, 2], "modelo__learning_rate": [0.05, 0.1]}),
    }


def puntaje(modelo, X) -> np.ndarray:
    """Probabilidad si el modelo la da; si no (SVC), la distancia al margen. Solo se usa para ordenar y umbralizar."""
    if hasattr(modelo, "predict_proba"):
        return modelo.predict_proba(X)[:, 1]
    return modelo.decision_function(X)


def umbral_para_recall(y, s) -> float:
    cumple = [t for t in np.unique(s) if recall_score(y, (s >= t).astype(int)) >= META_RECALL]
    return float(max(cumple)) if cumple else float(np.min(s))


def metricas(y, pred, s=None) -> dict:
    vn, fp, fn, vp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    r = {"accuracy": accuracy_score(y, pred), "precision": precision_score(y, pred, zero_division=0),
         "recall": recall_score(y, pred, zero_division=0), "f1": f1_score(y, pred, zero_division=0),
         "f2": fbeta_score(y, pred, beta=2, zero_division=0), "vp": int(vp), "fn": int(fn), "fp": int(fp), "vn": int(vn),
         "recordatorios": int(vp + fp)}
    if s is not None:
        r["avg_precision"] = average_precision_score(y, s)
    return r


def main() -> None:
    t0 = time.time()
    SALIDA.mkdir(exist_ok=True)
    df = cargar_dataset(str(AQUI.parent / "dataset_apf3" / "dataset_arcomunity_apf3.csv"))
    periodos = sorted(df["periodo"].unique())
    df["_mes"] = df["periodo"].map({p: i for i, p in enumerate(periodos)})
    df = df[df["_mes"] < MESES_PERMITIDOS].reset_index(drop=True)        # se descarta la prueba
    assert df["_mes"].max() == MESES_PERMITIDOS - 1 and len(df) == 300, "La comparación solo puede usar los meses 1–10"
    X = caracteristicas_al_corte(df)[VARIABLES_MODELO].reset_index(drop=True)
    y = df["moroso"].astype(int).reset_index(drop=True)
    mes = df["_mes"].values

    externos, filas_pliegue, hiper = {}, [], []
    regla = lambda Xp: (Xp["pagos_atrasados_previos"] >= 1).astype(int).values
    for k in MESES_EXTERNOS:
        ent, ext = mes < k, mes == k
        X_e, y_e, mes_e = X[ent].reset_index(drop=True), y[ent].reset_index(drop=True), mes[ent]
        internos = [(np.where(mes_e < j)[0], np.where(mes_e == j)[0]) for j in range(2, k)]
        # Líneas base
        for nombre, pred in {
            "Dummy (clase mayoritaria)": DummyClassifier(strategy="most_frequent").fit(X_e, y_e).predict(X[ext]),
            "Dummy (estratificado)": DummyClassifier(strategy="stratified", random_state=SEMILLA + k).fit(X_e, y_e).predict(X[ext]),
            "Regla: atraso en 3 meses previos": regla(X[ext]),
        }.items():
            externos.setdefault(nombre, {"y": [], "pred": [], "s": None, "mes": []})
            externos[nombre]["y"].extend(y[ext]); externos[nombre]["pred"].extend(pred); externos[nombre]["mes"].extend(mes[ext])
        # Candidatos con búsqueda interna
        for nombre, (p, grilla) in candidatos().items():
            gs = GridSearchCV(p, grilla, cv=internos, scoring="average_precision", refit=True).fit(X_e, y_e)
            s_int, y_int = [], []
            for a, b in internos:
                m = clone(gs.best_estimator_).fit(X_e.iloc[a], y_e.iloc[a])
                s_int.append(puntaje(m, X_e.iloc[b])); y_int.append(y_e.iloc[b].values)
            umbral = umbral_para_recall(np.concatenate(y_int), np.concatenate(s_int))
            modelo = gs.best_estimator_
            s_ext = puntaje(modelo, X[ext]); pred_ext = (s_ext >= umbral).astype(int)
            pred_ent = (puntaje(modelo, X_e) >= umbral).astype(int)
            d = externos.setdefault(nombre, {"y": [], "pred": [], "s": [], "mes": [], "f1_ent": []})
            d["y"].extend(y[ext]); d["pred"].extend(pred_ext); d["s"].extend(s_ext); d["mes"].extend(mes[ext])
            d["f1_ent"].append(f1_score(y_e, pred_ent, zero_division=0))
            hiper.append({"modelo": nombre, "mes_externo": k + 1, **{kk.replace("modelo__", ""): str(v) for kk, v in gs.best_params_.items()},
                          "umbral": round(umbral, 4), "ap_interna": round(gs.best_score_, 3)})
    print(f"Evaluación anidada lista en {time.time() - t0:.0f} s")

    # Métricas agregadas, por mes y estabilidad
    filas, por_mes = [], []
    for nombre, d in externos.items():
        yy, pp = np.array(d["y"]), np.array(d["pred"]); ss = np.array(d["s"]) if d["s"] is not None else None
        r = {"modelo": nombre, **metricas(yy, pp, ss)}
        f1_mes = []
        for m_ in sorted(set(d["mes"])):
            sel = np.array(d["mes"]) == m_
            f1m = f1_score(yy[sel], pp[sel], zero_division=0)
            f1_mes.append(f1m)
            por_mes.append({"modelo": nombre, "mes": m_ + 1, "f1": f1m, "recall": recall_score(yy[sel], pp[sel], zero_division=0),
                            "precision": precision_score(yy[sel], pp[sel], zero_division=0)})
        r["f1_desv_mes"] = float(np.std(f1_mes))
        r["f1_entrenamiento"] = float(np.mean(d["f1_ent"])) if "f1_ent" in d else np.nan
        r["brecha_sobreajuste"] = r["f1_entrenamiento"] - r["f1"] if "f1_ent" in d else np.nan
        filas.append(r)
    tabla = pd.DataFrame(filas)
    por_mes = pd.DataFrame(por_mes)

    # Regla registrada
    candidatos_ = tabla[~tabla["modelo"].str.startswith(("Dummy", "Regla"))].copy()
    f1_regla = float(tabla.loc[tabla["modelo"].str.startswith("Regla"), "f1"].iloc[0])
    candidatos_["auditar"] = (candidatos_["f1"] >= 0.95) | ((candidatos_["recall"] == 1) & (candidatos_["precision"] == 1))
    candidatos_["elegible"] = (candidatos_["recall"] >= META_RECALL) & (candidatos_["f1"] > f1_regla) & ~candidatos_["auditar"]
    elegibles = candidatos_[candidatos_["elegible"]].sort_values("f1", ascending=False)
    mejor = elegibles.iloc[0]["modelo"] if len(elegibles) else candidatos_.sort_values("f1", ascending=False).iloc[0]["modelo"]

    rng = np.random.default_rng(SEMILLA)
    y_ref = np.array(externos[mejor]["y"])
    idx_boot = rng.integers(0, len(y_ref), size=(2000, len(y_ref)))
    boot = []
    for nombre in candidatos_["modelo"]:
        assert np.array_equal(np.array(externos[nombre]["y"]), y_ref)
        pa, pb = np.array(externos[mejor]["pred"]), np.array(externos[nombre]["pred"])
        dif = np.array([f1_score(y_ref[i], pa[i], zero_division=0) - f1_score(y_ref[i], pb[i], zero_division=0) for i in idx_boot])
        lo, hi = np.percentile(dif, [2.5, 97.5])
        boot.append({"modelo": nombre, "dif_f1_vs_mejor": float(f1_score(y_ref, pa) - f1_score(y_ref, pb)),
                     "ic95_inf": float(lo), "ic95_sup": float(hi), "empate_practico": bool(lo <= 0 <= hi) or nombre == mejor})
    boot = pd.DataFrame(boot)
    candidatos_ = candidatos_.merge(boot, on="modelo")
    empatados = candidatos_[candidatos_["elegible"] & candidatos_["empate_practico"]].copy()
    empatados["explicabilidad"] = empatados["modelo"].map(EXPLICABILIDAD)
    empatados["costo_integracion"] = empatados["modelo"].map(COSTO_INTEGRACION)
    # Desempate: brecha (redondeada a 0,02), variabilidad (a 0,02), explicabilidad, integración
    empatados = empatados.assign(_b=(empatados["brecha_sobreajuste"] / 0.02).round(), _v=(empatados["f1_desv_mes"] / 0.02).round())
    orden = empatados.sort_values(["_b", "_v", "explicabilidad", "costo_integracion"])
    recomendado = orden.iloc[0]["modelo"] if len(orden) else mejor
    ganancia_vs_v1 = float(tabla.set_index("modelo").loc[recomendado, "f1"] - tabla.set_index("modelo").loc["Regresión logística", "f1"])
    if recomendado != "Regresión logística":
        v1_empata = bool(candidatos_.set_index("modelo").loc["Regresión logística", "empate_practico"])
        if v1_empata or (COSTO_INTEGRACION[recomendado] == 3 and ganancia_vs_v1 < 0.05):
            motivo_v1 = "el v1 empata en la práctica o la mejora no justifica infraestructura nueva"
            recomendado_final = "Regresión logística"
        else:
            motivo_v1, recomendado_final = "gana sin empate práctico", recomendado
    else:
        motivo_v1, recomendado_final = "es el mejor según la regla", recomendado

    # Predicciones externas por cuota (para el análisis de errores; mismas filas y orden en todos los modelos)
    filas_ext = np.concatenate([np.where(mes == k)[0] for k in MESES_EXTERNOS])
    pred_df = df.loc[filas_ext, ["unidad_ref", "periodo", "moroso"]].reset_index(drop=True)
    for nombre, d in externos.items():
        assert np.array_equal(np.array(d["y"]), pred_df["moroso"].values)
        pred_df[nombre] = d["pred"]
    pred_df.to_csv(SALIDA / "predicciones_externas.csv", index=False)

    # Archivos
    redondeo = lambda d: d.round(3)
    redondeo(tabla).to_csv(SALIDA / "metricas_validacion_anidada.csv", index=False)
    redondeo(por_mes).to_csv(SALIDA / "metricas_por_mes.csv", index=False)
    pd.DataFrame(hiper).to_csv(SALIDA / "hiperparametros_por_pliegue.csv", index=False)
    redondeo(candidatos_.drop(columns=[c for c in ["_b", "_v"] if c in candidatos_])).to_csv(SALIDA / "aplicacion_de_la_regla.csv", index=False)
    decision = {"datos": "meses 1–10 (300 cuotas); 180 predicciones externas (meses 5–10); prueba no usada",
                "mejor_por_f1": mejor, "elegibles": elegibles["modelo"].tolist(),
                "empatados_con_el_mejor": empatados["modelo"].tolist(), "orden_de_desempate": orden["modelo"].tolist(),
                "recomendado": recomendado_final, "motivo": motivo_v1, "f1_regla_negocio": round(f1_regla, 3),
                "ganancia_f1_recomendado_vs_v1": round(ganancia_vs_v1, 3)}
    (SALIDA / "decision.json").write_text(json.dumps(decision, ensure_ascii=False, indent=2), encoding="utf-8")

    # Gráficos
    orden_g = tabla.sort_values("f1")["modelo"].tolist()
    t = tabla.set_index("modelo").loc[orden_g]
    fig, ax = plt.subplots(figsize=(9, 4.6))
    yv = np.arange(len(t))
    ax.barh(yv - 0.27, t["recall"], height=0.27, label="Recall", color="#3d6f73")
    ax.barh(yv, t["f1"], height=0.27, label="F1", color="#86b28d")
    ax.barh(yv + 0.27, t["precision"], height=0.27, label="Precision", color="#c9dfc6")
    ax.axvline(META_RECALL, ls="--", color="#c46a5c", lw=1, label="Meta recall 0,80")
    ax.set_yticks(yv, orden_g, fontsize=8); ax.set_xlim(0, 1)
    ax.set_title("Validación anidada con origen móvil · meses 5–10 (180 cuotas) · sin usar la prueba", fontsize=10)
    ax.legend(fontsize=8, loc="lower right"); plt.tight_layout(); plt.savefig(SALIDA / "comparacion_algoritmos.png", dpi=130); plt.close()
    fig, ax = plt.subplots(figsize=(8, 3.8))
    for nombre in [n for n in tabla["modelo"] if not n.startswith("Dummy")]:
        sub = por_mes[por_mes["modelo"] == nombre]
        ax.plot(sub["mes"], sub["f1"], marker="o", lw=2.2 if nombre == recomendado_final else 1, label=nombre, alpha=1 if nombre == recomendado_final else 0.6)
    ax.set_xlabel("Mes evaluado (cada uno predicho con los meses anteriores)"); ax.set_ylabel("F1"); ax.set_ylim(0, 1.05)
    ax.set_title("Estabilidad por mes", fontsize=10); ax.legend(fontsize=7, ncol=2); plt.tight_layout()
    plt.savefig(SALIDA / "estabilidad_por_mes.png", dpi=130); plt.close()

    cols = ["modelo", "recall", "precision", "f1", "f2", "fn", "fp", "recordatorios", "avg_precision", "f1_desv_mes", "f1_entrenamiento", "brecha_sobreajuste"]
    print(tabla[cols].round(3).to_string(index=False))
    print(boot.round(3).to_string(index=False))
    print(json.dumps(decision, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
