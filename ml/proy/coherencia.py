"""Ficha de coherencia del dataset final: los siete criterios de la sección 4.2 de APF3, ejecutados en código.

Condición 6 de la consigna del PROY: es requisito de entrada del Paso 2b. Cada criterio tiene comprobaciones con
resultado «cumple», «no cumple» o «no aplicable», y la evidencia numérica que lo respalda.

Uso:  python coherencia.py                    → ficha del dataset final (APF3, sin modificar)
      python coherencia.py <otro.csv> <nombre> → ficha de otro archivo con el mismo contrato (p. ej., escenario difuso)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import average_precision_score

from comun import (RESULTADOS, RUTA_DATOS, SEMILLA, VARIABLES_MODELO, caracteristicas_al_corte, cargar_dataset,
                   entorno, guardar_json, huella_lf, pipeline)

CONTRATO = ["unidad_ref", "periodo", "monto", "fecha_vencimiento", "fecha_pago", "dias_atraso", "metodo_pago",
            "pagos_atrasados_previos", "moroso", "es_simulado"]          # 10 campos del Contrato de Datos de APF2
METODOS = {"yape_qr", "yape_captura", "plin_captura", "efectivo", "transferencia"}


def _c(nombre: str, ok: bool | None, evidencia: str) -> dict:
    return {"comprobacion": nombre, "resultado": "no aplicable" if ok is None else ("cumple" if ok else "no cumple"),
            "evidencia": evidencia}


def ficha(df: pd.DataFrame) -> list[dict]:
    pagada = df["fecha_pago"].notna()
    criterios = []

    # 1. Escala del negocio (piloto declarado en APF1/APF2: 30 unidades, cuota mensual de S/ 150)
    n_u, n_p = df["unidad_ref"].nunique(), df["periodo"].nunique()
    por_celda = df.groupby(["unidad_ref", "periodo"]).size()
    criterios.append({"criterio": "1. Escala del negocio", "comprobaciones": [
        _c("30 unidades y 12 meses consecutivos", n_u == 30 and n_p == 12
           and (df["periodo"].sort_values().dt.to_period("M").drop_duplicates().diff().dropna().apply(lambda d: d.n) == 1).all(),
           f"{n_u} unidades, {n_p} periodos, {len(df)} cuotas"),
        _c("Una cuota por unidad y mes", bool(por_celda.max() == 1), f"máximo {int(por_celda.max())} por unidad y mes"),
        _c("Monto emitido por mes coherente con el piloto (S/ 3 000–6 000)",
           bool(df.groupby("periodo")["monto"].sum().between(3000, 6000).all()),
           f"S/ {df.groupby('periodo')['monto'].sum().min():,.0f} a S/ {df.groupby('periodo')['monto'].sum().max():,.0f} por mes"),
    ]})

    # 2. Rangos y unidades
    criterios.append({"criterio": "2. Rangos y unidades", "comprobaciones": [
        _c("Monto en soles > 0 con 2 decimales", bool((df["monto"] > 0).all() and (df["monto"].round(2) == df["monto"]).all()),
           f"monto entre {df['monto'].min():.2f} y {df['monto'].max():.2f}"),
        _c("dias_atraso entero ≥ 0", bool((df["dias_atraso"] >= 0).all() and (df["dias_atraso"] % 1 == 0).all()),
           f"0 a {int(df['dias_atraso'].max())} días"),
        _c("pagos_atrasados_previos entre 0 y 3", bool(df["pagos_atrasados_previos"].between(0, 3).all()),
           f"valores {sorted(df['pagos_atrasados_previos'].unique().tolist())}"),
        _c("moroso y es_simulado binarios", bool(df["moroso"].isin([0, 1]).all() and df["es_simulado"].isin([0, 1]).all()),
           f"moroso {sorted(df['moroso'].unique().tolist())}, es_simulado {sorted(df['es_simulado'].unique().tolist())}"),
        _c("Periodo el día 1 y vencimiento el día 10 del mismo mes",
           bool((df["periodo"].dt.day == 1).all() and (df["fecha_vencimiento"].dt.day == 10).all()
                and (df["fecha_vencimiento"].dt.to_period("M") == df["periodo"].dt.to_period("M")).all()),
           "periodo AAAA-MM-01 y vencimiento AAAA-MM-10"),
        _c("Método de pago dentro del catálogo", bool(df.loc[pagada, "metodo_pago"].isin(METODOS).all()),
           f"métodos {sorted(df.loc[pagada, 'metodo_pago'].unique().tolist())}"),
    ]})

    # 3. Consistencia lógica y temporal
    dias_calc = (df["fecha_pago"] - df["fecha_vencimiento"]).dt.days.clip(lower=0).where(pagada, 0)
    moroso_calc = ((df["fecha_pago"] > df["fecha_vencimiento"]) | ~pagada).astype(int)
    previos_calc = caracteristicas_al_corte(df)["pagos_atrasados_previos"]
    criterios.append({"criterio": "3. Consistencia lógica y temporal", "comprobaciones": [
        _c("dias_atraso = max(0, fecha_pago − vencimiento)", bool((dias_calc == df["dias_atraso"]).all()),
           f"{int((dias_calc != df['dias_atraso']).sum())} diferencias"),
        _c("moroso = pagó tarde o sigue impaga", bool((moroso_calc == df["moroso"]).all()),
           f"{int((moroso_calc != df['moroso']).sum())} diferencias"),
        _c("Cuotas impagas sin método de pago", bool(df.loc[~pagada, "metodo_pago"].isna().all()),
           f"{int((~pagada).sum())} impagas"),
        _c("pagos_atrasados_previos recalculado con información anterior al corte",
           bool((previos_calc.values == df["pagos_atrasados_previos"].values).all()),
           f"{int((previos_calc.values != df['pagos_atrasados_previos'].values).sum())} diferencias"),
        _c("Ningún pago anterior a la emisión del periodo", bool((df.loc[pagada, "fecha_pago"] >= df.loc[pagada, "periodo"]).all()),
           f"primer día de pago relativo al periodo: {int((df.loc[pagada, 'fecha_pago'] - df.loc[pagada, 'periodo']).dt.days.min())}"),
    ]})

    # 4. Relaciones plausibles
    tasa = df["moroso"].mean()
    con, sin = df.loc[df["pagos_atrasados_previos"] >= 1, "moroso"].mean(), df.loc[df["pagos_atrasados_previos"] == 0, "moroso"].mean()
    por_unidad = df.groupby("unidad_ref")["moroso"].sum().sort_values(ascending=False)
    criterios.append({"criterio": "4. Relaciones plausibles", "comprobaciones": [
        _c("Morosidad entre 10 % y 35 %", bool(0.10 <= tasa <= 0.35), f"{tasa:.1%} ({int(df['moroso'].sum())} de {len(df)})"),
        _c("Quien se atrasó antes se atrasa más", bool(con > sin), f"{con:.1%} con atraso previo frente a {sin:.1%} sin atraso"),
        _c("Concentración de la morosidad (se reporta)", True,
           f"las 5 unidades con más atrasos suman {int(por_unidad.head(5).sum())} de {int(por_unidad.sum())} "
           f"({por_unidad.head(5).sum() / por_unidad.sum():.0%}); perfil determinista de la semilla, ver robustez"),
    ]})

    # 5. Señal ni nula ni perfecta (solo meses 1–10; la prueba no se mira)
    periodos = sorted(df["periodo"].unique())
    mes = df["periodo"].map({p: i for i, p in enumerate(periodos)}).to_numpy()
    X = caracteristicas_al_corte(df)[VARIABLES_MODELO].reset_index(drop=True)
    y = df["moroso"].astype(int).reset_index(drop=True)
    s, yy = [], []
    base = pipeline(VARIABLES_MODELO).set_params(modelo__C=10)
    for k in range(4, min(10, len(periodos))):
        m = clone(base).fit(X[mes < k], y[mes < k])
        s.append(m.predict_proba(X[mes == k])[:, 1]); yy.append(y[mes == k].values)
    ap = average_precision_score(np.concatenate(yy), np.concatenate(s))
    prev = np.concatenate(yy).mean()
    criterios.append({"criterio": "5. Señal ni nula ni perfecta", "comprobaciones": [
        _c("AP fuera de muestra (meses 5–10) mayor que la prevalencia y menor que 0,95", bool(prev < ap < 0.95),
           f"AP {ap:.3f} frente a prevalencia {prev:.3f}; sin la prueba"),
    ]})

    # 6. Coherencia con el Contrato de Datos de APF2
    faltan = [c for c in CONTRATO if c not in df.columns]
    criterios.append({"criterio": "6. Coherencia con el Contrato de Datos", "comprobaciones": [
        _c("Los 10 campos del contrato presentes", not faltan, "faltan: " + ", ".join(faltan) if faltan else "10 de 10"),
        _c("Columna origen presente y coherente con es_simulado", "origen" in df.columns
           and bool(((df["origen"] == "simulado") == (df["es_simulado"] == 1)).all()), "origen ∈ {real, simulado}"),
        _c("unidad_ref seudónima (sin datos personales)", bool(df["unidad_ref"].str.fullmatch(r"U-[0-9a-f]{10}").all()),
           "formato U- + 10 hexadecimales (SHA-256)"),
    ]})

    # 7. Mezcla real + simulado
    n_real = int((df.get("origen") == "real").sum())
    criterios.append({"criterio": "7. Mezcla real + simulado", "comprobaciones": [
        _c("Mínimo de 30 registros reales (condición 5)", None if n_real == 0 else n_real >= 30,
           f"{n_real} registros reales y {len(df) - n_real} simulados. Arcomunity es una empresa ficticia autorizada: "
           "no existen registros reales. Limitación declarada en la tabla de trazabilidad"),
        _c("Ningún registro simulado presentado como real", bool((df.loc[df["es_simulado"] == 1, "origen"] == "simulado").all()),
           "todas las filas con es_simulado = 1 tienen origen = simulado"),
    ]})
    return criterios


def veredicto(criterios: list[dict]) -> dict:
    res = {}
    for c in criterios:
        r = [x["resultado"] for x in c["comprobaciones"]]
        res[c["criterio"]] = "no cumple" if "no cumple" in r else ("cumple con limitación declarada" if "no aplicable" in r else "cumple")
    return res


def markdown(nombre: str, criterios: list[dict], ver: dict, env: dict) -> str:
    l = [f"# Ficha de coherencia · {nombre}", "",
         f"Generada por `ml/proy/coherencia.py` el {env['fecha_utc']} (commit {env['commit']}, Python {env['python']}, "
         f"numpy {env['versiones_cargadas']['numpy']}, scikit-learn {env['versiones_cargadas']['scikit-learn']}).", "",
         "| Criterio | Veredicto |", "| --- | --- |"] + [f"| {k} | {v} |" for k, v in ver.items()] + [""]
    for c in criterios:
        l += [f"## {c['criterio']}", "", "| Comprobación | Resultado | Evidencia |", "| --- | --- | --- |"]
        l += [f"| {x['comprobacion']} | {x['resultado']} | {x['evidencia']} |" for x in c["comprobaciones"]] + [""]
    return "\n".join(l)


def main() -> None:
    ruta = Path(sys.argv[1]) if len(sys.argv) > 1 else RUTA_DATOS
    nombre = sys.argv[2] if len(sys.argv) > 2 else "dataset_final"
    np.random.seed(SEMILLA)
    df = cargar_dataset(str(ruta))
    criterios = ficha(df)
    ver = veredicto(criterios)
    env = entorno() | {"archivo_evaluado": ruta.name, "sha256_lf_evaluado": huella_lf(ruta)}
    guardar_json({"entorno": env, "veredicto": ver, "criterios": criterios}, RESULTADOS / f"ficha_coherencia_{nombre}.json")
    (RESULTADOS / f"ficha_coherencia_{nombre}.md").write_text(markdown(nombre, criterios, ver, env) + "\n", encoding="utf-8")
    for k, v in ver.items():
        print(f"{k}: {v}")
    if any(v == "no cumple" for v in ver.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
