"""Inferencia del modelo de riesgo de morosidad sobre registros del MVP.

Entrada: uno o varios registros con el esquema que devuelve `ml_caracteristicas_cuotas` en Supabase
(ver contrato_integracion.json). Salida: el formato de docs/ml-contrato.md (probabilidad, prediccion,
nivel_riesgo y factores). Solo usa información disponible antes del vencimiento.

Uso por línea de comandos:
    python inferencia.py ejemplo_entrada.json          # imprime las predicciones en JSON
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np

from caracteristicas import VARIABLES_MODELO, registro_a_dataframe

DIR_MODELO = Path(__file__).parent / "modelo"


def cargar_modelo(directorio: Path | str = DIR_MODELO, version: str = "v1") -> dict:
    """Carga el pipeline exportado y sus metadatos (umbral, versión y características)."""
    directorio = Path(directorio)
    meta = json.loads((directorio / f"modelo_morosidad_{version}.json").read_text(encoding="utf-8"))
    pipeline = joblib.load(directorio / f"modelo_morosidad_{version}.joblib")
    if meta["caracteristicas"] != VARIABLES_MODELO:
        raise ValueError("El modelo exportado no usa las mismas características que caracteristicas.py")
    return {"pipeline": pipeline, "meta": meta}


def _factores(pipeline, fila) -> list[dict]:
    """Variables que elevan el riesgo de esta cuota (solo modelos lineales), con su aporte al logit.

    Solo se listan variables cuyo valor está por encima del promedio de entrenamiento y que, con ese valor,
    suben el riesgo. Así una cuota sin historial no muestra "factores" (con variables correlacionadas, un
    coeficiente negativo haría parecer que tener 0 atrasos aumenta el riesgo).
    """
    modelo = pipeline.named_steps["modelo"]
    if not hasattr(modelo, "coef_"):
        return []
    x = pipeline.named_steps["preprocesamiento"].transform(fila)[0]
    aportes = modelo.coef_[0] * x
    orden = np.argsort(-aportes)[:3]
    return [{"variable": VARIABLES_MODELO[i], "aporte": round(float(aportes[i]), 3)} for i in orden if aportes[i] > 0 and x[i] > 0]


def predecir_registro(modelo: dict, registro: dict) -> dict:
    """Predice el riesgo de una cuota. Lanza ValueError si el registro no cumple el contrato."""
    fila = registro_a_dataframe(registro)
    umbral = float(modelo["meta"]["umbral"])
    prob = float(modelo["pipeline"].predict_proba(fila)[0, 1])
    nivel = "alto" if prob >= umbral else "medio" if prob >= umbral / 2 else "bajo"
    return {
        "cuota_id": registro.get("cuota_id"),
        "modelo_version": modelo["meta"]["modelo_version"],
        "probabilidad": round(prob, 4),
        "prediccion": int(prob >= umbral),
        "nivel_riesgo": nivel,
        "umbral": round(umbral, 4),
        "factores": _factores(modelo["pipeline"], fila),
    }


def predecir_lote(modelo: dict, registros: list[dict]) -> dict:
    """Formato de salida del contrato: versión, umbral y lista de predicciones."""
    return {
        "modelo_version": modelo["meta"]["modelo_version"],
        "umbral": round(float(modelo["meta"]["umbral"]), 4),
        "predicciones": [predecir_registro(modelo, r) for r in registros],
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python inferencia.py archivo_entrada.json")
    entrada = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    registros = entrada["registros"] if isinstance(entrada, dict) else entrada
    print(json.dumps(predecir_lote(cargar_modelo(), registros), ensure_ascii=False, indent=2))
