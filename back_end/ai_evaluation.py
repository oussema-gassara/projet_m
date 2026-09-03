import json
import os
import random
import sys

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


def get_recent_training_data(limit=200):
    conn = mysql.connector.connect(**DB_CONFIG)
    query = """
        SELECT used_ram, total_ram, cpu_temperature,
               wifi_signal, external_temperature
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

    return df.dropna(subset=FEATURES + ["total_ram"]).reset_index(drop=True)


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def build_validation_dataset(training_df):
    """
    Build deterministic labelled validation scenarios around the recent ESP32
    baseline. Labels are reference labels based on the project's alert limits.

    0 = NORMAL
    1 = ANOMALIE
    """
    rng = random.Random(42)

    total_ram = float(training_df["total_ram"].median())
    if not total_ram or total_ram <= 0:
        total_ram = 323836.0

    used_ram = float(training_df["used_ram"].median())
    cpu_temp = float(training_df["cpu_temperature"].median())
    wifi_signal = float(training_df["wifi_signal"].median())
    external_temp = float(training_df["external_temperature"].median())

    # Keep the normal reference scenarios inside the normal limits used by
    # the monitoring project, while remaining close to the recent baseline.
    normal_used_ram = clamp(used_ram, total_ram * 0.20, total_ram * 0.60)
    normal_cpu = clamp(cpu_temp, 35.0, 55.0)
    normal_wifi = clamp(wifi_signal, -62.0, -45.0)
    normal_external = clamp(external_temp, 15.0, 28.0)

    rows = []

    # 40 labelled NORMAL scenarios.
    for _ in range(40):
        rows.append({
            "used_ram": clamp(
                normal_used_ram * rng.uniform(0.94, 1.06),
                total_ram * 0.15,
                total_ram * 0.65,
            ),
            "cpu_temperature": clamp(
                normal_cpu + rng.uniform(-2.0, 2.0), 30.0, 59.0
            ),
            "wifi_signal": clamp(
                normal_wifi + rng.uniform(-2.0, 2.0), -64.0, -40.0
            ),
            "external_temperature": clamp(
                normal_external + rng.uniform(-1.5, 1.5), 10.0, 29.0
            ),
            "label": 0,
        })

    # 10 CPU anomalies.
    for _ in range(10):
        rows.append({
            "used_ram": normal_used_ram,
            "cpu_temperature": rng.uniform(65.0, 90.0),
            "wifi_signal": normal_wifi,
            "external_temperature": normal_external,
            "label": 1,
        })

    # 10 Wi-Fi anomalies.
    for _ in range(10):
        rows.append({
            "used_ram": normal_used_ram,
            "cpu_temperature": normal_cpu,
            "wifi_signal": rng.uniform(-95.0, -70.0),
            "external_temperature": normal_external,
            "label": 1,
        })

    # 10 external-temperature anomalies.
    for _ in range(10):
        rows.append({
            "used_ram": normal_used_ram,
            "cpu_temperature": normal_cpu,
            "wifi_signal": normal_wifi,
            "external_temperature": rng.uniform(35.0, 50.0),
            "label": 1,
        })

    # 10 RAM anomalies.
    for _ in range(10):
        rows.append({
            "used_ram": total_ram * rng.uniform(0.75, 0.95),
            "cpu_temperature": normal_cpu,
            "wifi_signal": normal_wifi,
            "external_temperature": normal_external,
            "label": 1,
        })

    return pd.DataFrame(rows)


def safe_ratio(numerator, denominator):
    return float(numerator / denominator) if denominator else 0.0


def evaluate_model():
    training_df = get_recent_training_data()

    if len(training_df) < 20:
        return {
            "available": False,
            "reason": "Pas encore assez de données réelles pour entraîner et évaluer Isolation Forest.",
            "training_rows": len(training_df),
        }

    model = IsolationForest(contamination="auto", random_state=42)
    model.fit(training_df[FEATURES])

    validation_df = build_validation_dataset(training_df)
    predicted_raw = model.predict(validation_df[FEATURES])

    # Isolation Forest: 1 = inlier/normal, -1 = outlier/anomaly.
    predicted = [1 if value == -1 else 0 for value in predicted_raw]
    actual = validation_df["label"].astype(int).tolist()

    tn = sum(1 for y, p in zip(actual, predicted) if y == 0 and p == 0)
    fp = sum(1 for y, p in zip(actual, predicted) if y == 0 and p == 1)
    fn = sum(1 for y, p in zip(actual, predicted) if y == 1 and p == 0)
    tp = sum(1 for y, p in zip(actual, predicted) if y == 1 and p == 1)

    total = tp + tn + fp + fn
    accuracy = safe_ratio(tp + tn, total)
    precision = safe_ratio(tp, tp + fp)
    recall = safe_ratio(tp, tp + fn)
    f1 = safe_ratio(2 * precision * recall, precision + recall)

    return {
        "available": True,
        "model": "Isolation Forest",
        "features": FEATURES,
        "training_rows": len(training_df),
        "validation_rows": len(validation_df),
        "validation_source": (
            "Scénarios de validation étiquetés NORMAL/ANOMALIE, construits autour "
            "des mesures réelles récentes et des seuils du projet."
        ),
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
