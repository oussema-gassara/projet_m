from flask import Flask, jsonify, request
import mysql.connector
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

# AI is ESP32-only for now.
# Raspberry Pi data is intentionally not queried here.

PREDICTION_FEATURES = [
    "used_ram",
    "cpu_temperature",
    "wifi_signal",
    "external_temperature",
]

DETECTION_FEATURES = [
    "humidity",
    "gas_level",
]


def get_recent_data(limit=200):
    conn = mysql.connector.connect(**DB_CONFIG)

    columns = PREDICTION_FEATURES + DETECTION_FEATURES + ["total_ram"]

    query = f"""
        SELECT node_name, {", ".join(columns)}
        FROM monitoring_data
        WHERE node_name IS NOT NULL
          AND node_name LIKE 'esp32%'
        ORDER BY id DESC
        LIMIT {limit}
    """

    df = pd.read_sql(query, conn)
    conn.close()

    return df.dropna(subset=PREDICTION_FEATURES + ["total_ram"])


def get_forecast_data(node_name, limit=120):
    """Get timestamped real measurements for one ESP32 node."""
    conn = mysql.connector.connect(**DB_CONFIG)

    query = """
        SELECT created_at, cpu_temperature, external_temperature,
               used_ram, total_ram
        FROM monitoring_data
        WHERE node_name = %s
          AND node_name LIKE 'esp32%'
        ORDER BY created_at DESC
        LIMIT %s
    """

    df = pd.read_sql(query, conn, params=(node_name, limit))
    conn.close()

    if df.empty:
        return df

    df["created_at"] = pd.to_datetime(df["created_at"])
    for column in ["cpu_temperature", "external_temperature", "used_ram", "total_ram"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    # RAM prediction is based on percentage used, not raw KB.
    df["ram_usage_percent"] = (
        df["used_ram"] / df["total_ram"].replace(0, pd.NA)
    ) * 100

    return df.sort_values("created_at").reset_index(drop=True)


def _forecast_series(df, value_column, horizon_minutes=5, minimum_rows=20):
    """Forecast one real time-series value with Linear Regression."""
    series = df[["created_at", value_column]].copy()
    series[value_column] = pd.to_numeric(series[value_column], errors="coerce")
    series = series.dropna()

    if len(series) < minimum_rows:
        return None, len(series), "Pas encore assez de données historiques"

    elapsed_seconds = (
        series["created_at"] - series["created_at"].iloc[0]
    ).dt.total_seconds().to_numpy()
    values = series[value_column].to_numpy(dtype=float)

    if elapsed_seconds[-1] <= elapsed_seconds[0]:
        return None, len(series), "Les données historiques ne contiennent pas assez de variation temporelle"

    model = LinearRegression()
    model.fit(elapsed_seconds.reshape(-1, 1), values)

    future_minutes = [1, 2, 3, 4, 5][:horizon_minutes]
    last_time = elapsed_seconds[-1]
    future_seconds = last_time + (pd.Series(future_minutes).to_numpy() * 60)
    predicted = model.predict(future_seconds.reshape(-1, 1))

    forecast = [
        {
            "minutes_ahead": minute,
            "value": round(float(value), 2),
        }
        for minute, value in zip(future_minutes, predicted)
    ]

    current_value = float(series[value_column].iloc[-1])
    trend_per_minute = float(model.coef_[0] * 60)

    return {
        "current": round(current_value, 2),
        "predicted_5min": round(float(predicted[-1]), 2),
        "trend_per_minute": round(trend_per_minute, 4),
        "forecast": forecast,
        "rows_used": len(series),
    }, len(series), None


def forecast_cpu_temperature(node_name, horizon_minutes=5):
    """Backward-compatible CPU temperature forecast."""
    df = get_forecast_data(node_name)
    result, rows_used, reason = _forecast_series(
        df, "cpu_temperature", horizon_minutes
    )

    if result is None:
        return {
            "node_name": node_name,
            "available": False,
            "reason": reason,
            "rows_used": rows_used,
            "forecast": [],
        }

    return {
        "node_name": node_name,
        "available": True,
        "rows_used": result["rows_used"],
        "current_cpu_temperature": result["current"],
        "predicted_cpu_temperature_5min": result["predicted_5min"],
        "trend_per_minute": result["trend_per_minute"],
        "forecast": result["forecast"],
        "model": "Linear Regression (time-series trend)",
    }


def forecast_node(node_name, horizon_minutes=5):
    """Forecast CPU temperature, external temperature and RAM usage for one ESP32."""
    df = get_forecast_data(node_name)

    forecasts = {}
    unavailable = []

    definitions = [
        ("cpu_temperature", "cpu_temperature", "°C"),
        ("external_temperature", "external_temperature", "°C"),
        ("ram_usage_percent", "ram_usage_percent", "%"),
    ]

    for key, column, unit in definitions:
        result, rows_used, reason = _forecast_series(
            df, column, horizon_minutes
        )

        if result is None:
            forecasts[key] = {
                "available": False,
                "reason": reason,
                "rows_used": rows_used,
                "forecast": [],
                "unit": unit,
            }
        else:
            forecasts[key] = {
                "available": True,
                "current": result["current"],
                "predicted_5min": result["predicted_5min"],
                "trend_per_minute": result["trend_per_minute"],
                "forecast": result["forecast"],
                "rows_used": result["rows_used"],
                "unit": unit,
            }

    available_count = sum(
        1 for item in forecasts.values() if item["available"]
    )

    return {
        "node_name": node_name,
        "available": available_count > 0,
        "forecasts": forecasts,
        "model": "Linear Regression (time-series trend)",
        "horizon_minutes": horizon_minutes,
    }


def diagnose(latest_row):
    messages = []

    used_ram = float(latest_row["used_ram"] or 0)
    total_ram = float(latest_row["total_ram"] or 0)
    ram_percent = (used_ram / total_ram) * 100 if total_ram else 0

    cpu_temp = float(latest_row["cpu_temperature"] or 0)
    wifi_signal = float(latest_row["wifi_signal"] or 0)
    ext_temp = float(latest_row["external_temperature"] or 0)
    gas_level = float(latest_row["gas_level"] or 0)

    if ram_percent > 90:
        messages.append({
            "text": "Utilisation RAM critique — redémarrez l'ESP32 pour libérer de la mémoire.",
            "level": "danger"
        })
    elif ram_percent > 70:
        messages.append({
            "text": "Utilisation RAM élevée — surveillez une éventuelle fuite mémoire.",
            "level": "warning"
        })

    if cpu_temp > 80:
        messages.append({
            "text": "Température du processeur trop élevée — éteignez le système pour éviter les dommages.",
            "level": "danger"
        })
    elif cpu_temp > 60:
        messages.append({
            "text": "Température du processeur élevée — vérifiez la ventilation.",
            "level": "warning"
        })

    if wifi_signal < -80:
        messages.append({
            "text": "Signal Wi-Fi très faible — rapprochez l'ESP32 du routeur.",
            "level": "danger"
        })
    elif wifi_signal < -65:
        messages.append({
            "text": "Signal Wi-Fi faible — la connexion peut être instable.",
            "level": "warning"
        })

    if ext_temp > 40:
        messages.append({
            "text": "Température ambiante trop élevée — vérifiez la présence de sources de chaleur à proximité.",
            "level": "danger"
        })
    elif ext_temp > 30:
        messages.append({
            "text": "Température ambiante élevée — à surveiller.",
            "level": "warning"
        })

    # Gas detection only — never used by Isolation Forest.
    if gas_level > 600:
        messages.append({
            "text": "Niveau de gaz critique — vérifiez immédiatement l'environnement et le capteur MQ-2.",
            "level": "danger"
        })
    elif gas_level >= 300:
        messages.append({
            "text": "Niveau de gaz élevé — surveillez le capteur MQ-2.",
            "level": "warning"
        })

    # Humidity detection only — never used by Isolation Forest.
    humidity_value = latest_row["humidity"]
    if pd.notna(humidity_value):
        humidity_text = str(humidity_value).strip().lower()

        if humidity_text in ("humid environment", "humid"):
            pass
        elif humidity_text in ("dry environment", "dry"):
            messages.append({
                "text": "Environnement trop sec — vérifiez les conditions ambiantes.",
                "level": "warning"
            })
        else:
            try:
                humidity = float(humidity_value)
                if humidity == 0:
                    pass
                elif humidity == 1:
                    messages.append({
                        "text": "Environnement trop sec — vérifiez les conditions ambiantes.",
                        "level": "warning"
                    })
                elif humidity < 30 or humidity > 70:
                    messages.append({
                        "text": "Humidité hors de la plage normale — vérifiez les conditions ambiantes.",
                        "level": "warning"
                    })
            except (TypeError, ValueError):
                pass

    return messages


def run_isolation_forest(df):
    """Run Isolation Forest using only PREDICTION_FEATURES."""
    if len(df) < 2:
        return [1] * len(df), [0.0] * len(df)

    model = IsolationForest(contamination="auto", random_state=42)
    model.fit(df[PREDICTION_FEATURES])

    predictions = model.predict(df[PREDICTION_FEATURES])
    scores = model.decision_function(df[PREDICTION_FEATURES])
    return predictions, scores


def build_detections(df):
    predictions, scores = run_isolation_forest(df)
    latest_by_node = df.groupby("node_name", dropna=False, sort=False).head(1)
    detections = []

    for index, latest_row in latest_by_node.iterrows():
        node_name = latest_row["node_name"]
        node_name = str(node_name) if pd.notna(node_name) else "ESP32 inconnu"

        latest_values = latest_row[PREDICTION_FEATURES + DETECTION_FEATURES].to_dict()
        latest_values["total_ram"] = latest_row["total_ram"]

        row_position = df.index.get_loc(index)
        prediction = predictions[row_position]
        score = scores[row_position]
        messages = diagnose(latest_row)

        if prediction == -1:
            messages.insert(0, {
                "text": "Comportement inhabituel détecté par Isolation Forest.",
                "level": "danger"
            })

        detections.append({
            "node_name": node_name,
            "is_anomaly": bool(prediction == -1),
            "anomaly_score": float(score),
            "latest_values": latest_values,
            "messages": messages,
        })

    return detections


@app.route("/detect", methods=["GET"])
def detect():
    df = get_recent_data()

    if len(df) < 20:
        return jsonify({
            "error": "Pas encore assez de données",
            "is_anomaly": False,
            "rows_available": len(df),
            "detections": [],
            "messages": [],
        })

    detections = build_detections(df)

    return jsonify({
        "rows_used": len(df),
        "nodes_detected": len(detections),
        "detections": detections,
    })


@app.route("/forecast", methods=["GET"])
def forecast():
    """Forecast real future values for every ESP32 node."""
    conn = mysql.connector.connect(**DB_CONFIG)
    query = """
        SELECT DISTINCT node_name
        FROM monitoring_data
        WHERE node_name IS NOT NULL
          AND node_name LIKE 'esp32%'
        ORDER BY node_name
    """
    nodes_df = pd.read_sql(query, conn)
    conn.close()

    forecasts = [
        forecast_node(str(node_name))
        for node_name in nodes_df["node_name"].dropna().tolist()
    ]

    return jsonify({
        "forecast_type": "future_esp32_metrics",
        "horizon_minutes": 5,
        "forecasts": forecasts,
    })


@app.route("/detect-test", methods=["POST"])
def detect_test():
    """Analyze exactly the fake ESP32 values displayed by TEST MODE."""
    payload = request.get_json(silent=True) or {}
    nodes = payload.get("nodes", [])

    if not isinstance(nodes, list) or not nodes:
        return jsonify({"error": "Aucune donnée ESP32 de test reçue", "detections": []}), 400

    rows = []
    for node in nodes:
        if not isinstance(node, dict):
            continue

        node_name = str(node.get("node_name", ""))
        if not node_name.lower().startswith("esp32"):
            continue

        system = node.get("system", {})
        sensor = node.get("sensor", {})
        network = node.get("network", {})

        fake_humidity = sensor.get("humidity")
        if fake_humidity == 0:
            humidity_for_detection = "Humid environment"
        elif fake_humidity == 1:
            humidity_for_detection = "Dry environment"
        else:
            humidity_for_detection = fake_humidity

        rows.append({
            "node_name": node_name,
            "used_ram": float(system.get("used_ram", 0)),
            "total_ram": float(system.get("total_ram", 0)),
            "cpu_temperature": float(system.get("cpu_temperature", 0)),
            "external_temperature": float(sensor.get("external_temperature", 0)),
            "wifi_signal": float(network.get("wifi_signal", 0)),
            "gas_level": float(sensor.get("gas_level", 0)),
            "humidity": humidity_for_detection,
        })

    if not rows:
        return jsonify({"error": "Aucun nœud ESP32 de test valide", "detections": []}), 400

    df = pd.DataFrame(rows)
    detections = build_detections(df)

    return jsonify({
        "test_mode": True,
        "rows_used": len(df),
        "nodes_detected": len(detections),
        "detections": detections,
    })


if __name__ == "__main__":
    app.run(port=5000)
