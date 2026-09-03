import json
import os

import mysql.connector
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import IsolationForest


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

FEATURES = [
    "used_ram",
    "cpu_temperature",
    "wifi_signal",
    "external_temperature",
]

# Same warning thresholds already used by the monitoring/AI diagnosis.
RAM_ANOMALY_PERCENT = 70.0
CPU_ANOMALY_C = 60.0
WIFI_ANOMALY_DBM = -65.0
EXTERNAL_TEMP_ANOMALY_C = 30.0


def get_real_measurements(limit=500):
    """Read only real ESP32 measurements stored in monitoring_data."""
    conn = mysql.connector.connect(**DB_CONFIG)
    query = """
        SELECT id, node_name, used_ram, total_ram, cpu_temperature,
               wifi_signal, external_temperature, created_at
        FROM monitoring_data
        WHERE node_name IS NOT NULL
          AND node_name LIKE 'esp32%'
          AND used_ram IS NOT NULL
          AND total_ram IS NOT NULL
          AND cpu_temperature IS NOT NULL
          AND wifi_signal IS NOT NULL
          AND external_temperature IS NOT NULL
        ORDER BY id DESC
        LIMIT %s
    """

    df = pd.read_sql(query, conn, params=(limit,))
    conn.close()

    for column in FEATURES + ["total_ram"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=FEATURES + ["total_ram"])

    # Query returns newest first. Reverse so the split remains chronological:
    # older rows train the model, newer rows evaluate it.
    return df.sort_values("id").reset_index(drop=True)


def label_real_measurement(row):
    """
    Reference label from the project's monitoring limits.
    0 = NORMAL
    1 = ANOMALIE
    """
    total_ram = float(row["total_ram"] or 0)
    used_ram = float(row["used_ram"] or 0)
    ram_percent = (used_ram / total_ram) * 100 if total_ram > 0 else 0

    cpu_temp = float(row["cpu_temperature"])
    wifi_signal = float(row["wifi_signal"])
    external_temp = float(row["external_temperature"])

    is_anomaly = (
        ram_percent > RAM_ANOMALY_PERCENT
        or cpu_temp > CPU_ANOMALY_C
        or wifi_signal < WIFI_ANOMALY_DBM
        or external_temp > EXTERNAL_TEMP_ANOMALY_C
    )

    return 1 if is_anomaly else 0


def safe_ratio(numerator, denominator):
    return float(numerator / denominator) if denominator else 0.0


def evaluate_model():
    df = get_real_measurements()

    if len(df) < 40:
        return {
            "available": False,
            "reason": "Pas encore assez de mesures réelles dans monitoring_data pour évaluer Isolation Forest.",
            "rows_available": len(df),
        }

    # Chronological hold-out: 70% older real rows for training,
    # 30% newest real rows for evaluation.
    split_index = max(20, int(len(df) * 0.70))
    if split_index >= len(df):
        split_index = len(df) - 1

    training_df = df.iloc[:split_index].copy()
    validation_df = df.iloc[split_index:].copy()

    if len(validation_df) < 10:
        return {
            "available": False,
            "reason": "Pas encore assez de mesures réelles récentes pour constituer le jeu de validation.",
            "training_rows": len(training_df),
            "validation_rows": len(validation_df),
        }

    model = IsolationForest(contamination="auto", random_state=42)
    model.fit(training_df[FEATURES])

    predicted_raw = model.predict(validation_df[FEATURES])

    # Isolation Forest: 1 = inlier/normal, -1 = outlier/anomaly.
    predicted = [1 if value == -1 else 0 for value in predicted_raw]
    actual = validation_df.apply(label_real_measurement, axis=1).astype(int).tolist()

    tn = sum(1 for y, p in zip(actual, predicted) if y == 0 and p == 0)
    fp = sum(1 for y, p in zip(actual, predicted) if y == 0 and p == 1)
    fn = sum(1 for y, p in zip(actual, predicted) if y == 1 and p == 0)
    tp = sum(1 for y, p in zip(actual, predicted) if y == 1 and p == 1)

    total = tp + tn + fp + fn
    accuracy = safe_ratio(tp + tn, total)
    precision = safe_ratio(tp, tp + fp)
    recall = safe_ratio(tp, tp + fn)
    f1 = safe_ratio(2 * precision * recall, precision + recall)

    real_normal = sum(1 for value in actual if value == 0)
    real_anomaly = sum(1 for value in actual if value == 1)

    return {
        "available": True,
        "model": "Isolation Forest",
        "features": FEATURES,
        "database_table": "monitoring_data",
        "rows_read": len(df),
        "training_rows": len(training_df),
        "validation_rows": len(validation_df),
        "real_normal_rows": real_normal,
        "real_anomaly_rows": real_anomaly,
        "validation_source": (
            "Évaluation réalisée uniquement avec les mesures réelles de la table monitoring_data. "
            "Les 70 % mesures les plus anciennes entraînent Isolation Forest et les 30 % mesures "
            "récentes servent au test. La classe réelle NORMAL/ANOMALIE est déterminée avec les "
            "seuils du système de monitoring."
        ),
        "reference_thresholds": {
            "ram_usage_percent": RAM_ANOMALY_PERCENT,
            "cpu_temperature": CPU_ANOMALY_C,
            "wifi_signal": WIFI_ANOMALY_DBM,
            "external_temperature": EXTERNAL_TEMP_ANOMALY_C,
        },
        "labels": {
            "normal": 0,
            "anomaly": 1,
        },
        "confusion_matrix": {
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "tp": tp,
        },
        "metrics": {
            "accuracy": round(accuracy * 100, 2),
            "precision": round(precision * 100, 2),
            "recall": round(recall * 100, 2),
            "f1_score": round(f1 * 100, 2),
        },
    }


def main():
    try:
        result = evaluate_model()
    except Exception as error:
        result = {
            "available": False,
            "reason": f"Impossible d'évaluer le modèle IA: {error}",
        }

    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
