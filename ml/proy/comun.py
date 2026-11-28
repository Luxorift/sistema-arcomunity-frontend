"""Piezas comunes del PROY: datos, variables, pipeline, desempate determinista y registro del entorno.

Corrección del Paso 2a (observaciones O2, O2b y O3 del reporte de APF3):
- O2: en el mes externo 5 la búsqueda interna de la regresión logística tiene un empate exacto de AP entre
  `class_weight=None` y `'balanced'`; GridSearchCV elegía según el orden de punto flotante del entorno. Aquí la AP se
  redondea a 6 decimales y, entre empatados, gana la configuración más simple (sin pesos de clase, luego C menor).
- O2b: el entorno con el que se calcula cada resultado queda registrado (versiones cargadas, no solo instaladas).
- O3: la huella del dataset se calcula sobre el contenido con fin de línea LF, igual en Windows, Linux y Git.

Los archivos de APF3 (`ml/modelo_morosidad/`) no se modifican: se importan.
"""
from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

AQUI = Path(__file__).resolve().parent
ML = AQUI.parent
sys.path.insert(0, str(ML / "modelo_morosidad"))
from caracteristicas import VARIABLES_MODELO, cargar_dataset, caracteristicas_al_corte  # noqa: E402

SEMILLA = 42
META_RECALL = 0.80
RUTA_DATOS = ML / "dataset_apf3" / "dataset_arcomunity_apf3.csv"
RESULTADOS = AQUI / "resultados"
VARIABLES_RECENCIA = ["atraso_mes_anterior", "meses_desde_ultimo_atraso"]
VARIABLES_PROY = VARIABLES_MODELO + VARIABLES_RECENCIA
DECIMALES_EMPATE = 6

GRILLA_APF3 = {"modelo__C": [0.01, 0.1, 1, 10], "modelo__class_weight": [None, "balanced"]}
GRILLA_AMPLIA = {"modelo__C": [0.001, 0.01, 0.1, 1, 10, 100, 1000], "modelo__class_weight": [None, "balanced"]}
CANDIDATOS = {  # nombre: (variables, grilla) — ver REGLA_DE_MEJORA.md, sección 3
    "APF3 corregido": (VARIABLES_MODELO, GRILLA_APF3),
    "PROY-A · recencia": (VARIABLES_PROY, GRILLA_APF3),
    "PROY-B · reajuste": (VARIABLES_MODELO, GRILLA_AMPLIA),
    "PROY-C · recencia + reajuste": (VARIABLES_PROY, GRILLA_AMPLIA),
}


# --- Datos --------------------------------------------------------------------------------------------------------
def huella_lf(ruta: Path = RUTA_DATOS) -> str:
    """SHA-256 del archivo con fin de línea LF (idéntico al blob de Git y a una copia de Linux o Colab)."""
    return hashlib.sha256(ruta.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def variables_recencia(df: pd.DataFrame) -> pd.DataFrame:
    """Variables de recencia al corte (día 1 del periodo), con la misma semántica de «atrasada» que v1.

    - atraso_mes_anterior: 1 si la cuota del mes inmediatamente anterior estaba atrasada al corte.
    - meses_desde_ultimo_atraso: meses desde la última cuota previa atrasada; 12 si nunca hubo atraso (tope 12).
    """
    filas = []
    for idx, c in df.iterrows():
        corte = c["periodo"]
        previas = df[(df["unidad_ref"] == c["unidad_ref"]) & (df["periodo"] < corte) & (df["fecha_vencimiento"] < corte)]
        pagada_al_corte = previas["fecha_pago"].notna() & (previas["fecha_pago"] <= corte)
        atrasada = (~pagada_al_corte) | (previas["fecha_pago"] > previas["fecha_vencimiento"])
        mes_anterior = corte - pd.DateOffset(months=1)
        en_mes_anterior = previas["periodo"] == mes_anterior
        periodos_atrasados = previas.loc[atrasada, "periodo"]
        if len(periodos_atrasados):
            ultimo = periodos_atrasados.max()
            meses = (corte.year - ultimo.year) * 12 + (corte.month - ultimo.month)
        else:
            meses = 12
        filas.append({"_idx": idx, "atraso_mes_anterior": int((atrasada & en_mes_anterior).any()),
                      "meses_desde_ultimo_atraso": int(min(meses, 12))})
    return pd.DataFrame(filas).set_index("_idx").loc[df.index]


def cargar() -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, np.ndarray]:
    """Devuelve (df, X con las 6 variables, y, índice de mes 0–11). No filtra la prueba: lo hace cada script."""
    df = cargar_dataset(str(RUTA_DATOS))
    periodos = sorted(df["periodo"].unique())
    mes = df["periodo"].map({p: i for i, p in enumerate(periodos)}).to_numpy()
    X = pd.concat([caracteristicas_al_corte(df)[VARIABLES_MODELO], variables_recencia(df)], axis=1)
    return df, X.reset_index(drop=True), df["moroso"].astype(int).reset_index(drop=True), mes


# --- Modelo y búsqueda --------------------------------------------------------------------------------------------
def pipeline(variables: list[str]) -> Pipeline:
    pre = ColumnTransformer([("num", StandardScaler(), variables)])
    return Pipeline([("preprocesamiento", pre), ("modelo", LogisticRegression(max_iter=2000, random_state=SEMILLA))])


def _complejidad(params: dict) -> tuple:
    """Orden de simplicidad: sin pesos de clase primero; luego C menor (más regularización)."""
    return (params.get("modelo__class_weight") is not None, params.get("modelo__C", 0))


def elegir_determinista(cv_results: dict) -> int:
    """`refit` de GridSearchCV: mejor AP redondeada a 6 decimales; empate → configuración más simple."""
    s = np.round(np.asarray(cv_results["mean_test_score"], dtype=float), DECIMALES_EMPATE)
    mejores = np.flatnonzero(s == np.nanmax(s))
    return int(min(mejores, key=lambda i: _complejidad(cv_results["params"][i])))


def buscar(variables: list[str], grilla: dict, X: pd.DataFrame, y: pd.Series, cv) -> GridSearchCV:
    return GridSearchCV(pipeline(variables), grilla, cv=cv, scoring="average_precision",
                        refit=elegir_determinista).fit(X[variables], y)


# --- Entorno ------------------------------------------------------------------------------------------------------
def entorno() -> dict:
    """Versiones cargadas e instaladas, SO, commit y huella del dataset (observaciones O2b y O3)."""
    import sklearn
    cargadas = {"numpy": np.__version__, "pandas": pd.__version__, "scikit-learn": sklearn.__version__}
    instaladas = {}
    for paquete in cargadas:
        try:
            instaladas[paquete] = metadata.version(paquete)
        except metadata.PackageNotFoundError:
            instaladas[paquete] = None
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=AQUI, capture_output=True, text=True,
                                check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None
    return {"fecha_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "python": sys.version.split()[0], "sistema": platform.platform(), "commit": commit,
            "versiones_cargadas": cargadas, "versiones_instaladas": instaladas,
            "versiones_coinciden": cargadas == instaladas,
            "dataset": {"archivo": str(RUTA_DATOS.relative_to(ML.parent)).replace("\\", "/"), "sha256_lf": huella_lf()}}


def guardar_json(datos, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
