"""Ciclo de mejora del PROY (Paso 2b) aplicando REGLA_DE_MEJORA.md. No usa los meses 11–12 (prueba).

Salidas en ml/proy/resultados/:
- entorno_experimento.json        versiones, sistema, commit y huella LF del dataset
- pruebas_fuga.json               contrafactuales: el desenlace actual o futuro no cambia las variables
- anidada_metricas.csv            evaluación anidada (meses 5–10, 180 predicciones) por modelo
- anidada_hiperparametros.csv     configuración elegida y umbral por mes externo
- anidada_bootstrap.csv           IC 95 % de la diferencia de F1 de cada candidato frente a APF3 corregido
- protocolo_apf3.csv              ajuste en meses 1–9, umbral fuera de muestra y métricas del mes 10
- coeficientes.csv                coeficientes (variables escaladas) del ajuste en meses 1–10
- sensibilidad_umbral_costo.csv   análisis informativo del umbral por costo de errores (línea d; no elige)
- decision.json                   decisión según la regla, escrita ANTES de evaluar la prueba
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.metrics import f1_score, recall_score

from comun import (CANDIDATOS, META_RECALL, RESULTADOS, SEMILLA, VARIABLES_PROY, buscar, cargar, cargar_dataset,
                   caracteristicas_al_corte, entorno, guardar_json, RUTA_DATOS, variables_recencia)
from comparacion import metricas, umbral_para_recall  # funciones de APF3, sin cambios

MESES_PERMITIDOS = 10
MESES_EXTERNOS = range(4, 10)       # índices 0-based → meses 5…10
REGLA_MANUAL = "Regla: atraso en 3 meses previos"
REFERENCIA = "APF3 corregido"


def regla(Xp: pd.DataFrame) -> np.ndarray:
    return (Xp["pagos_atrasados_previos"] >= 1).astype(int).values


def ajustar_con_umbral(variables, grilla, X_e, y_e, cv):
    """Búsqueda determinista + umbral = mayor valor con recall ≥ 0,80 en las predicciones internas fuera de muestra."""
    gs = buscar(variables, grilla, X_e, y_e, cv)
    s_int, y_int = [], []
    for a, b in cv:
        m = clone(gs.best_estimator_).fit(X_e.iloc[a][variables], y_e.iloc[a])
        s_int.append(m.predict_proba(X_e.iloc[b][variables])[:, 1]); y_int.append(y_e.iloc[b].values)
    return gs, umbral_para_recall(np.concatenate(y_int), np.concatenate(s_int))


def pruebas_fuga() -> dict:
    """Cambiar el desenlace de la cuota actual no debe cambiar sus variables ni las de meses anteriores.

    Solo usa los meses 1–10: se alteran las cuotas del mes 10 y se comparan las variables de los meses 1–10.
    """
    df = cargar_dataset(str(RUTA_DATOS))
    periodos = sorted(df["periodo"].unique())
    df = df[df["periodo"] <= periodos[MESES_PERMITIDOS - 1]].reset_index(drop=True)
    base = pd.concat([caracteristicas_al_corte(df), variables_recencia(df)], axis=1)[VARIABLES_PROY]
    alterado = df.copy()
    sel = alterado["periodo"] == periodos[MESES_PERMITIDOS - 1]
    alterado.loc[sel, "fecha_pago"] = pd.NaT                     # el mes 10 queda impago y moroso
    alterado.loc[sel, ["moroso", "dias_atraso"]] = [1, 0]
    alterado.loc[sel, "metodo_pago"] = None
    nuevo = pd.concat([caracteristicas_al_corte(alterado), variables_recencia(alterado)], axis=1)[VARIABLES_PROY]
    return {"descripcion": "Se cambió el desenlace de las 30 cuotas del mes 10 (impagas y morosas). Las variables de "
                           "los meses 1–10, incluidas las de ese mes, deben quedar iguales porque solo usan cuotas "
                           "anteriores al corte. No se usan los meses 11–12.",
            "cuotas_alteradas": int(sel.sum()), "filas_comparadas": int(len(df)),
            "filas_con_variables_distintas": int((base != nuevo).any(axis=1).sum()),
            "resultado": "pasó" if bool((base == nuevo).all().all()) else "no pasó"}


def main() -> None:
    t0 = time.time()
    np.random.seed(SEMILLA)
    env = entorno()
    guardar_json(env, RESULTADOS / "entorno_experimento.json")
    fuga = pruebas_fuga()
    guardar_json(fuga, RESULTADOS / "pruebas_fuga.json")
    assert fuga["resultado"] == "pasó", "Prueba de fuga fallida"

    df, X_todo, y_todo, mes_todo = cargar()
    dentro = mes_todo < MESES_PERMITIDOS                       # se descarta la prueba
    X, y, mes = X_todo[dentro].reset_index(drop=True), y_todo[dentro].reset_index(drop=True), mes_todo[dentro]
    assert len(X) == 300 and mes.max() == MESES_PERMITIDOS - 1, "El experimento solo puede usar los meses 1–10"

    # --- Evaluación anidada de origen móvil -------------------------------------------------------------------------
    ext = {}
    hiper = []
    for k in MESES_EXTERNOS:
        ent, sal = mes < k, mes == k
        X_e, y_e, mes_e = X[ent].reset_index(drop=True), y[ent].reset_index(drop=True), mes[ent]
        cv = [(np.where(mes_e < j)[0], np.where(mes_e == j)[0]) for j in range(2, k)]
        for nombre, pred in {
            "Dummy (clase mayoritaria)": DummyClassifier(strategy="most_frequent").fit(X_e, y_e).predict(X[sal]),
            "Dummy (estratificado)": DummyClassifier(strategy="stratified", random_state=SEMILLA + k).fit(X_e, y_e).predict(X[sal]),
            REGLA_MANUAL: regla(X[sal]),
        }.items():
            d = ext.setdefault(nombre, {"y": [], "pred": [], "s": None, "mes": []})
            d["y"] += list(y[sal]); d["pred"] += list(pred); d["mes"] += list(mes[sal])
        for nombre, (variables, grilla) in CANDIDATOS.items():
            gs, umbral = ajustar_con_umbral(variables, grilla, X_e, y_e, cv)
            s = gs.best_estimator_.predict_proba(X[sal][variables])[:, 1]
            d = ext.setdefault(nombre, {"y": [], "pred": [], "s": [], "mes": [], "f1_ent": []})
            d["y"] += list(y[sal]); d["pred"] += list((s >= umbral).astype(int)); d["s"] += list(s); d["mes"] += list(mes[sal])
            d["f1_ent"].append(f1_score(y_e, (gs.best_estimator_.predict_proba(X_e[variables])[:, 1] >= umbral).astype(int)))
            hiper.append({"modelo": nombre, "mes_externo": k + 1, "C": gs.best_params_["modelo__C"],
                          "class_weight": str(gs.best_params_["modelo__class_weight"]), "umbral": round(umbral, 4),
                          "ap_interna": round(float(gs.cv_results_["mean_test_score"][gs.best_index_]), 6)})

    filas = []
    for nombre, d in ext.items():
        yy, pp = np.array(d["y"]), np.array(d["pred"])
        r = {"modelo": nombre, **metricas(yy, pp, np.array(d["s"]) if d["s"] is not None else None)}
        f1_mes = [f1_score(yy[np.array(d["mes"]) == m_], pp[np.array(d["mes"]) == m_], zero_division=0) for m_ in sorted(set(d["mes"]))]
        r["f1_desv_mes"] = float(np.std(f1_mes))
        if "f1_ent" in d:
            r["f1_entrenamiento"] = float(np.mean(d["f1_ent"])); r["brecha_sobreajuste"] = r["f1_entrenamiento"] - r["f1"]
        filas.append(r)
    tabla = pd.DataFrame(filas)
    tabla.round(4).to_csv(RESULTADOS / "anidada_metricas.csv", index=False)
    pd.DataFrame(hiper).to_csv(RESULTADOS / "anidada_hiperparametros.csv", index=False)

    # --- Bootstrap pareado frente a APF3 corregido ------------------------------------------------------------------
    rng = np.random.default_rng(SEMILLA)
    y_ref = np.array(ext[REFERENCIA]["y"])
    idx = rng.integers(0, len(y_ref), size=(2000, len(y_ref)))
    p_ref = np.array(ext[REFERENCIA]["pred"])
    boot = []
    for nombre in CANDIDATOS:
        if nombre == REFERENCIA:
            continue
        assert np.array_equal(np.array(ext[nombre]["y"]), y_ref)
        p = np.array(ext[nombre]["pred"])
        dif = np.array([f1_score(y_ref[i], p[i], zero_division=0) - f1_score(y_ref[i], p_ref[i], zero_division=0) for i in idx])
        lo, hi = np.percentile(dif, [2.5, 97.5])
        boot.append({"modelo": nombre, "dif_f1_vs_apf3_corregido": f1_score(y_ref, p) - f1_score(y_ref, p_ref),
                     "ic95_inf": lo, "ic95_sup": hi, "excluye_cero": bool(lo > 0 or hi < 0)})
    boot = pd.DataFrame(boot)
    boot.round(4).to_csv(RESULTADOS / "anidada_bootstrap.csv", index=False)

    # --- Regla de decisión (REGLA_DE_MEJORA.md, sección 4) ----------------------------------------------------------
    t = tabla.set_index("modelo")
    f1_regla = float(t.loc[REGLA_MANUAL, "f1"])
    auditar = {n: bool(t.loc[n, "f1"] >= 0.95 or (t.loc[n, "recall"] == 1 and t.loc[n, "precision"] == 1)) for n in CANDIDATOS}
    elegible = {n: bool(t.loc[n, "recall"] >= META_RECALL and t.loc[n, "f1"] > f1_regla and not auditar[n]) for n in CANDIDATOS}
    proy = [n for n in CANDIDATOS if n != REFERENCIA and elegible[n]]
    orden = sorted(proy, key=lambda n: (-round(float(t.loc[n, "f1"]), 3), len(CANDIDATOS[n][0]),
                                        len(CANDIDATOS[n][1]["modelo__C"])))
    mejor = orden[0] if orden else None
    reemplaza = False
    if mejor is not None:
        b = boot.set_index("modelo").loc[mejor]
        reemplaza = bool(t.loc[mejor, "f1"] > t.loc[REFERENCIA, "f1"] and b["ic95_inf"] > 0)
    servido = mejor if reemplaza else REFERENCIA

    # --- Protocolo de APF3 (informativo): meses 1–9, CV temporal, umbral OOF, mes 10 ---------------------------------
    m_ent, m_val = mes < 9, mes == 9
    X_ent, y_ent = X[m_ent].reset_index(drop=True), y[m_ent].reset_index(drop=True)
    cv_temporal = [(np.where(mes[m_ent] < k)[0], np.where(mes[m_ent] == k)[0]) for k in range(4, 9)]
    proto, coef, umbrales_finales = [], [], {}
    for nombre, (variables, grilla) in CANDIDATOS.items():
        gs, umbral = ajustar_con_umbral(variables, grilla, X_ent, y_ent, cv_temporal)
        s_val = gs.best_estimator_.predict_proba(X[m_val][variables])[:, 1]
        proto.append({"modelo": nombre, "C": gs.best_params_["modelo__C"], "class_weight": str(gs.best_params_["modelo__class_weight"]),
                      "umbral": round(umbral, 4), **{f"val_{k_}": v for k_, v in metricas(y[m_val], (s_val >= umbral).astype(int), s_val).items()}})
        umbrales_finales[nombre] = {"C": gs.best_params_["modelo__C"], "class_weight": gs.best_params_["modelo__class_weight"],
                                    "umbral": umbral}
        final = clone(gs.best_estimator_).fit(X[variables], y)   # meses 1–10, como el v1 de APF3
        for v, c in zip(variables, final.named_steps["modelo"].coef_[0]):
            coef.append({"modelo": nombre, "variable": v, "coeficiente": round(float(c), 4)})
    pd.DataFrame(proto).round(4).to_csv(RESULTADOS / "protocolo_apf3.csv", index=False)
    pd.DataFrame(coef).to_csv(RESULTADOS / "coeficientes.csv", index=False)

    # --- Sensibilidad del umbral por costo (línea d, informativa) ---------------------------------------------------
    s_srv, y_srv = np.array(ext[servido]["s"]), np.array(ext[servido]["y"])
    p_srv = np.array(ext[servido]["pred"])
    sens = []
    for razon in (2, 5, 10):
        costos = [(razon * int(((s_srv < u) & (y_srv == 1)).sum()) + int(((s_srv >= u) & (y_srv == 0)).sum()), u) for u in np.unique(s_srv)]
        c_min, u_min = min(costos)
        sens.append({"razon_costo_fn_fp": razon, "costo_con_regla_del_umbral": razon * int(((p_srv == 0) & (y_srv == 1)).sum()) + int(((p_srv == 1) & (y_srv == 0)).sum()),
                     "costo_minimo_posible": c_min, "umbral_que_lo_logra": round(float(u_min), 4),
                     "recall_en_ese_umbral": round(recall_score(y_srv, (s_srv >= u_min).astype(int)), 3)})
    pd.DataFrame(sens).to_csv(RESULTADOS / "sensibilidad_umbral_costo.csv", index=False)

    decision = {
        "regla": "ml/proy/REGLA_DE_MEJORA.md", "fecha_utc": env["fecha_utc"], "commit_del_codigo": env["commit"],
        "datos": "meses 1–10 (300 cuotas); 180 predicciones externas (meses 5–10); prueba no usada",
        "f1_regla_manual": round(f1_regla, 4),
        "candidatos": {n: {"f1": round(float(t.loc[n, "f1"]), 4), "recall": round(float(t.loc[n, "recall"]), 4),
                           "precision": round(float(t.loc[n, "precision"]), 4), "fn": int(t.loc[n, "fn"]),
                           "recordatorios": int(t.loc[n, "recordatorios"]), "elegible": elegible[n], "auditar": auditar[n]}
                       for n in CANDIDATOS},
        "mejor_candidato_proy": mejor, "reemplaza_a_apf3_corregido": reemplaza, "modelo_servido": servido,
        "configuracion_final": {n: {k_: (v if k_ != "umbral" else round(v, 4)) for k_, v in c.items()} for n, c in umbrales_finales.items()},
        "motivo": (f"{mejor} mejora el F1 anidado y el IC 95 % de la diferencia excluye el 0" if reemplaza else
                   "ningún candidato PROY supera a APF3 corregido fuera del empate práctico: se conserva v1"),
        "duracion_s": round(time.time() - t0, 1),
    }
    guardar_json(decision, RESULTADOS / "decision.json")
    pd.set_option("display.width", 220)
    print(tabla[["modelo", "recall", "precision", "f1", "fn", "fp", "recordatorios", "avg_precision"]].round(3).to_string(index=False))
    print(boot.round(3).to_string(index=False))
    print(pd.DataFrame(proto).round(3).to_string(index=False))
    print(decision["motivo"], "| servido:", servido, f"| {decision['duracion_s']} s")


if __name__ == "__main__":
    main()
