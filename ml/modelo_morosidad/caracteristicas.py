"""Características de riesgo de morosidad de Arcomunity, calculadas sin fuga de información.

Momento de predicción (corte): el primer día del periodo de la cuota, antes de su vencimiento (día 10).
Las variables replican la semántica de la función SQL `ml_caracteristicas_cuotas` del MVP
(supabase/migrations/20261117000500_preparacion_ml.sql) evaluada con `fecha_corte = periodo`, de modo que
el modelo entrenado con el CSV recibe en producción exactamente los mismos campos.

Reglas (solo información anterior al corte):
- Una cuota previa cuenta si su vencimiento es anterior al corte.
- Es "atrasada" si al corte seguía impaga, se pagó después del corte o se pagó después de su vencimiento.
- Días de atraso de una previa: los del pago si se pagó antes del corte; si no, los transcurridos desde su
  vencimiento hasta el corte.
- Nunca se usan fecha_pago, dias_atraso, metodo_pago ni moroso de la cuota que se predice.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Campos del contrato APF2 que describen el desenlace de la cuota: prohibidos como predictores.
COLUMNAS_FUGA = ["fecha_pago", "dias_atraso", "metodo_pago", "moroso"]
# Identificadores y metadatos: no son predictores (memorizarían unidades o son constantes).
COLUMNAS_NO_PREDICTORAS = ["unidad_ref", "es_simulado", "origen"]

# Variables del modelo (subconjunto de lo que devuelve ml_caracteristicas_cuotas).
VARIABLES_MODELO = [
    "pagos_atrasados_previos",      # atrasos en los 3 meses anteriores (campo del contrato APF2)
    "atrasos_previos_total",        # atrasos en todo el historial previo
    "tasa_atraso_previa",           # atrasos_previos_total / cuotas_previas (derivada)
    "dias_atraso_promedio_previo",  # severidad media de los atrasos previos (derivada)
]
# Variables que se calculan y auditan, pero no entran al modelo principal (ver notebook, sección 2).
VARIABLES_AUDITADAS = ["cuotas_previas", "mes", "monto", "metodo_pago_ultimo"]


def cargar_dataset(ruta: str) -> pd.DataFrame:
    """Lee el CSV del contrato APF2 (UTF-8 con BOM) con fechas tipadas, sin modificarlo."""
    df = pd.read_csv(ruta, parse_dates=["periodo", "fecha_vencimiento", "fecha_pago"])
    return df.sort_values(["periodo", "unidad_ref"]).reset_index(drop=True)


def caracteristicas_al_corte(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula, para cada cuota, las variables conocidas el primer día de su periodo.

    Devuelve un DataFrame alineado con `df` (mismo índice) con las columnas de VARIABLES_MODELO y
    VARIABLES_AUDITADAS. Solo mira filas de la misma unidad con periodo anterior.
    """
    filas = []
    for idx, c in df.iterrows():
        corte = c["periodo"]
        previas = df[(df["unidad_ref"] == c["unidad_ref"]) & (df["periodo"] < c["periodo"])
                     & (df["fecha_vencimiento"] < corte)]
        pagada_al_corte = previas["fecha_pago"].notna() & (previas["fecha_pago"] <= corte)
        atrasada = (~pagada_al_corte) | (previas["fecha_pago"] > previas["fecha_vencimiento"])
        dias = np.where(pagada_al_corte,
                        (previas["fecha_pago"] - previas["fecha_vencimiento"]).dt.days.clip(lower=0),
                        (corte - previas["fecha_vencimiento"]).dt.days.clip(lower=0))
        tres_meses = previas["periodo"] >= corte - pd.DateOffset(months=3)
        ultimos = previas[pagada_al_corte & (previas["fecha_pago"] < corte)].sort_values("fecha_pago")
        n = len(previas)
        filas.append({
            "_idx": idx,
            "pagos_atrasados_previos": int((atrasada & tres_meses).sum()),
            "atrasos_previos_total": int(atrasada.sum()),
            "cuotas_previas": n,
            "tasa_atraso_previa": round(float(atrasada.sum()) / n, 4) if n else 0.0,
            "dias_atraso_promedio_previo": round(float(np.mean(dias)), 2) if n else 0.0,
            "metodo_pago_ultimo": ultimos["metodo_pago"].iloc[-1] if len(ultimos) else "sin_historial",
            "mes": int(c["periodo"].month),
            "monto": float(c["monto"]),
        })
    return pd.DataFrame(filas).set_index("_idx").loc[df.index]


def registro_a_dataframe(registro: dict) -> pd.DataFrame:
    """Convierte un registro JSON del MVP (salida de ml_caracteristicas_cuotas) en la fila del modelo."""
    faltan = [v for v in VARIABLES_MODELO if v not in registro or registro[v] is None]
    if faltan:
        raise ValueError(f"Faltan campos obligatorios: {', '.join(faltan)}")
    prohibidas = [c for c in COLUMNAS_FUGA if c in registro]
    if prohibidas:
        raise ValueError(f"El registro trae campos del desenlace (fuga): {', '.join(prohibidas)}")
    fila = {v: float(registro[v]) for v in VARIABLES_MODELO}
    if fila["pagos_atrasados_previos"] < 0 or fila["atrasos_previos_total"] < fila["pagos_atrasados_previos"]:
        raise ValueError("Historial incoherente: los atrasos de 3 meses no pueden superar el total.")
    if not 0 <= fila["tasa_atraso_previa"] <= 1:
        raise ValueError("tasa_atraso_previa debe estar entre 0 y 1.")
    return pd.DataFrame([fila], columns=VARIABLES_MODELO)
