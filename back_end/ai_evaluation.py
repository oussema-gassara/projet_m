import json
import math
import os

import mysql.connector
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.linear_model import LinearRegression


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

HORIZON_SECONDS = 5 * 60
MAX_ROWS_PER_NODE = 2500
MAX_WINDOW_ROWS = 120
MIN_WINDOW_ROWS = 20
BACKTEST_STRIDE = 10
TARGET_TOLERANCE_SECONDS = 45

# Must stay aligned with back_end/routes/ai.js.
WIFI_LOCAL_ROWS = 60
WIFI_SMOOTHING_WINDOW = 5
WIFI_RECENT_LEVEL_ROWS = 15
WIFI_TREND_DAMPING = 0.5
WIFI_MAX_TREND_PER_MINUTE = 1.0

METRICS = {
    "cpu_temperature": {
        "label": "Température du processeur",
        "unit": "°C",
        "threshold": 60.0,
        "direction": "high",
        "model": "Linear Regression (time-series trend)",
    },
    "external_temperature": {
        "label": "Température externe",
        "unit": "°C",
        "threshold": 30.0,
        "direction": "high",
        "model": "Linear Regression (time-series trend)",
    },
    "ram_usage_percent": {
        "label": "Utilisation de la RAM",
        "unit": "%",
        "threshold": 70.0,
        "direction": "high",
        "model": "Linear Regression (time-series trend)",
    },
    "wifi_signal": {
        "label": "Signal Wi-Fi",
        "unit": "dBm",
        "threshold": -65.0,
        "direction": "low",
        "model": "RSSI lissé + tendance locale amortie",
    },
}


def get_node_names():
    conn = mysql.connector.connect(**DB_CONFIG)
    query = """
        SELECT DISTINCT node_name
        FROM monitoring_data
        WHERE node_name IS NOT NULL
          AND node_name LIKE 'esp32%'
        ORDER BY node_name
    """
    cursor = conn.cursor()
    cursor.execute(query)
    rows = [str(row[0]) for row in cursor.fetchall() if row and row[0]]
    cursor.close()
    conn.close()
    return rows


def get_node_measurements(node_name):
    conn = mysql.connector.connect(**DB_CONFIG)
    query = """
        SELECT created_at, used_ram, total_ram, cpu_temperature,
               wifi_signal, external_temperature
        FROM monitoring_data
        WHERE node_name = %s
          AND used_ram IS NOT NULL
          AND total_ram IS NOT NULL
          AND cpu_temperature IS NOT NULL
          AND wifi_signal IS NOT NULL
          AND external_temperature IS NOT NULL
        ORDER BY created_at DESC
        LIMIT %s
    """
    df = pd.read_sql(query, conn, params=(node_name, MAX_ROWS_PER_NODE))
    conn.close()

    if df.empty:
        return df

    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    numeric_columns = [
        "used_ram",
        "total_ram",
        "cpu_temperature",
        "wifi_signal",
        "external_temperature",
    ]
    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["created_at"] + numeric_columns)
    df = df[df["total_ram"] > 0].copy()
    df["ram_usage_percent"] = (df["used_ram"] / df["total_ram"]) * 100.0

    return (
        df.sort_values("created_at")
        .drop_duplicates(subset=["created_at"], keep="last")
        .reset_index(drop=True)
    )


def is_anomaly(metric_key, value):
    config = METRICS[metric_key]
    threshold = config["threshold"]
    if config["direction"] == "low":
        return float(value) < threshold
    return float(value) >= threshold


def empty_counts():
    return {"tn": 0, "fp": 0, "fn": 0, "tp": 0}


def update_counts(counts, actual_anomaly, predicted_anomaly):
    if not actual_anomaly and not predicted_anomaly:
        counts["tn"] += 1
    elif not actual_anomaly and predicted_anomaly:
        counts["fp"] += 1
    elif actual_anomaly and not predicted_anomaly:
        counts["fn"] += 1
    else:
        counts["tp"] += 1


def safe_ratio(numerator, denominator):
    return float(numerator / denominator) if denominator else 0.0


def classification_metrics(counts):
    tn = counts["tn"]
    fp = counts["fp"]
    fn = counts["fn"]
    tp = counts["tp"]
    total = tn + fp + fn + tp

    accuracy = safe_ratio(tp + tn, total)
    precision = safe_ratio(tp, tp + fp)
    recall = safe_ratio(tp, tp + fn)
    f1 = safe_ratio(2 * precision * recall, precision + recall)

    return {
        "accuracy": round(accuracy * 100, 2),
        "precision": round(precision * 100, 2),
        "recall": round(recall * 100, 2),
        "f1_score": round(f1 * 100, 2),
    }


def regression_metrics(errors):
    if not errors:
        return {"mae": None, "rmse": None}

    absolute = [abs(value) for value in errors]
    squared = [value * value for value in errors]

    return {
        "mae": round(sum(absolute) / len(absolute), 3),
        "rmse": round(math.sqrt(sum(squared) / len(squared)), 3),
    }


def nearest_future_index(timestamps_ns, start_index, target_ns):
    insert_index = int(np.searchsorted(timestamps_ns, target_ns, side="left"))
    candidates = []

    for index in (insert_index - 1, insert_index):
        if index > start_index and 0 <= index < len(timestamps_ns):
            candidates.append(index)

    if not candidates:
        return None

    best = min(candidates, key=lambda index: abs(int(timestamps_ns[index]) - int(target_ns)))
    distance_seconds = abs(int(timestamps_ns[best]) - int(target_ns)) / 1_000_000_000

    if distance_seconds > TARGET_TOLERANCE_SECONDS:
        return None

    return best


def forecast_wifi_signal(window, horizon_seconds=HORIZON_SECONDS):
    """Mirror the production RSSI forecast used in routes/ai.js."""
    local = window.tail(WIFI_LOCAL_ROWS).copy()
    if len(local) < MIN_WINDOW_ROWS:
        return None

    elapsed_minutes = (
        local["created_at"] - local["created_at"].iloc[0]
    ).dt.total_seconds().to_numpy(dtype=float) / 60.0

    if elapsed_minutes[-1] <= elapsed_minutes[0]:
        return None

    raw_values = pd.to_numeric(local["wifi_signal"], errors="coerce")
    if raw_values.isna().any():
        return None

    smoothed = (
        raw_values
        .rolling(window=WIFI_SMOOTHING_WINDOW, min_periods=1)
        .median()
        .to_numpy(dtype=float)
    )

    x_mean = float(np.mean(elapsed_minutes))
    y_mean = float(np.mean(smoothed))
    denominator = float(np.sum((elapsed_minutes - x_mean) ** 2))
    if denominator == 0:
        return None

    numerator = float(
        np.sum((elapsed_minutes - x_mean) * (smoothed - y_mean))
    )
    raw_trend_per_minute = numerator / denominator
    trend_per_minute = max(
        -WIFI_MAX_TREND_PER_MINUTE,
        min(WIFI_MAX_TREND_PER_MINUTE, raw_trend_per_minute),
    )

    recent_values = raw_values.tail(WIFI_RECENT_LEVEL_ROWS).to_numpy(dtype=float)
    recent_level = float(np.median(recent_values))
    horizon_minutes = horizon_seconds / 60.0

    return recent_level + (
        trend_per_minute * WIFI_TREND_DAMPING * horizon_minutes
    )


def evaluate_node(node_name, df):
    metric_counts = {key: empty_counts() for key in METRICS}
    metric_errors = {key: [] for key in METRICS}
    samples = 0

    if len(df) < MIN_WINDOW_ROWS + 2:
        return {
            "node_name": node_name,
            "rows_available": len(df),
            "backtest_samples": 0,
            "metrics": {},
        }

    timestamps = df["created_at"].astype("int64").to_numpy()

    for anchor_index in range(MIN_WINDOW_ROWS - 1, len(df), BACKTEST_STRIDE):
        anchor_ns = int(timestamps[anchor_index])
        target_ns = anchor_ns + HORIZON_SECONDS * 1_000_000_000
        actual_index = nearest_future_index(timestamps, anchor_index, target_ns)

        if actual_index is None:
            continue

        window_start = max(0, anchor_index - MAX_WINDOW_ROWS + 1)
        window = df.iloc[window_start : anchor_index + 1]
        if len(window) < MIN_WINDOW_ROWS:
            continue

        elapsed_seconds = (
            window["created_at"] - window["created_at"].iloc[0]
        ).dt.total_seconds().to_numpy(dtype=float)

        if elapsed_seconds[-1] <= elapsed_seconds[0]:
            continue

        prediction_time = elapsed_seconds[-1] + HORIZON_SECONDS
        x = elapsed_seconds.reshape(-1, 1)
        sample_used = False

        for metric_key in METRICS:
            actual_value = float(df.iloc[actual_index][metric_key])
            if not math.isfinite(actual_value):
                continue

            if metric_key == "wifi_signal":
                predicted_value = forecast_wifi_signal(window)
                if predicted_value is None or not math.isfinite(predicted_value):
                    continue
            else:
                values = pd.to_numeric(
                    window[metric_key], errors="coerce"
                ).to_numpy(dtype=float)
                if not np.isfinite(values).all():
                    continue

                model = LinearRegression()
                model.fit(x, values)
                predicted_value = float(model.predict([[prediction_time]])[0])

            predicted_anomaly = is_anomaly(metric_key, predicted_value)
            actual_anomaly = is_anomaly(metric_key, actual_value)

            update_counts(
                metric_counts[metric_key],
                actual_anomaly=actual_anomaly,
                predicted_anomaly=predicted_anomaly,
            )
            metric_errors[metric_key].append(predicted_value - actual_value)
            sample_used = True

        if sample_used:
            samples += 1

    metric_results = {}
    for metric_key, config in METRICS.items():
        counts = metric_counts[metric_key]
        total = sum(counts.values())
        metric_results[metric_key] = {
            "label": config["label"],
            "unit": config["unit"],
            "threshold": config["threshold"],
            "model": config["model"],
            "anomaly_rule": (
                f"< {config['threshold']} {config['unit']}"
                if config["direction"] == "low"
                else f">= {config['threshold']} {config['unit']}"
            ),
            "evaluations": total,
            "confusion_matrix": counts,
            "classification_metrics": classification_metrics(counts),
            "regression_metrics": regression_metrics(metric_errors[metric_key]),
        }

    return {
        "node_name": node_name,
        "rows_available": len(df),
        "backtest_samples": samples,
        "metrics": metric_results,
    }


def merge_counts(target, source):
    for key in ("tn", "fp", "fn", "tp"):
        target[key] += int(source.get(key, 0))


def evaluate_model():
    node_names = get_node_names()

    if not node_names:
        return {
            "available": False,
            "reason": "Aucune mesure ESP32 réelle disponible dans monitoring_data.",
        }

    nodes = []
    overall_counts = empty_counts()
    total_rows = 0
    total_evaluations = 0

    for node_name in node_names:
        df = get_node_measurements(node_name)
        total_rows += len(df)
        node_result = evaluate_node(node_name, df)
        nodes.append(node_result)

        for metric_result in node_result["metrics"].values():
            counts = metric_result["confusion_matrix"]
            merge_counts(overall_counts, counts)
            total_evaluations += sum(counts.values())

    if total_evaluations == 0:
        return {
            "available": False,
            "reason": (
                "Pas encore assez d'historique réel couvrant au moins 5 minutes "
                "pour comparer les prévisions aux mesures futures."
            ),
            "database_table": "monitoring_data",
            "rows_read": total_rows,
            "horizon_minutes": 5,
        }

    return {
        "available": True,
        "model": "Linear Regression + modèle RSSI lissé",
        "database_table": "monitoring_data",
        "rows_read": total_rows,
        "horizon_minutes": 5,
        "validation_method": (
            "Backtest chronologique sur les mesures réelles : pour chaque fenêtre historique, "
            "le modèle prédit la valeur à +5 minutes puis la compare à la mesure réelle la plus "
            "proche de +5 minutes. CPU, température externe et RAM utilisent la régression linéaire. "
            "Le Wi-Fi utilise un lissage médian et une tendance locale amortie pour réduire l'effet "
            "des fluctuations rapides du RSSI. Les valeurs prévues et réelles sont converties en "
            "NORMAL/ANOMALIE avec les mêmes seuils que le dashboard."
        ),
        "overall": {
            "evaluations": total_evaluations,
            "confusion_matrix": overall_counts,
            "classification_metrics": classification_metrics(overall_counts),
        },
        "nodes": nodes,
    }


def main():
    try:
        result = evaluate_model()
    except Exception as error:
        result = {
            "available": False,
            "reason": f"Impossible d'évaluer le modèle de prédiction: {error}",
        }

    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
