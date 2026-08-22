from flask import Flask, jsonify, request
import mysql.connector
import pandas as pd
from sklearn.ensemble import IsolationForest
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

# Each ESP32 gets its own Isolation Forest, trained only on its own
# history, so one node's normal readings can never make another
# node's normal readings look anomalous.
ROWS_PER_NODE_LIMIT = 200
MIN_SAMPLES_PER_NODE = 20


def get_recent_data(limit_per_node=ROWS_PER_NODE_LIMIT):
    conn = mysql.connector.connect(**DB_CONFIG)

    columns = PREDICTION_FEATURES + DETECTION_FEATURES + ["total_ram"]

    # Pull a generous window across all ESP32 nodes; we trim it down
    # to each node's own most recent rows below. Multiplying by a
    # fixed fan-out keeps this simple without a second DB round trip.
    query = f"""
        SELECT node_name, {", ".join(columns)}
        FROM monitoring_data
        WHERE node_name IS NOT NULL
          AND node_name LIKE 'esp32%'
        ORDER BY id DESC
        LIMIT {limit_per_node * 20}
    """

    df = pd.read_sql(query, conn)
    conn.close()

    df = df.dropna(subset=PREDICTION_FEATURES + ["total_ram"])

    # Rows are newest-first from the query, so head(n) per node keeps
    # each node's own most recent history.
    df = df.groupby("node_name", group_keys=False).apply(
        lambda g: g.head(limit_per_node)
    )

    return df


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

    # Wi-Fi RSSI: values closer to 0 are stronger.
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
    # Same thresholds as the ESP32 dashboard:
    # <300 normal, 300-600 warning, >600 danger.
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
    # ESP32 encodes humidity as a state:
    # 0 = Humid environment (normal)
    # 1 = Dry environment (warning)
    # If a real numeric percentage is ever received, use 30-70% as normal.
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


def run_isolation_forest_for_node(training_df, row_to_score):
    """Train a dedicated Isolation Forest on one node's own history and
    score a single row (which may or may not be part of that history —
    TEST MODE scores a fake row against the node's real history).

    Returns (prediction, score, status) where status is
    'trained' or 'insufficient_data'.
    """
    if len(training_df) < MIN_SAMPLES_PER_NODE:
        return None, None, "insufficient_data"

    model = IsolationForest(contamination="auto", random_state=42)
    model.fit(training_df[PREDICTION_FEATURES])

    row_features = row_to_score[PREDICTION_FEATURES].to_frame().T.astype(float)
    prediction = model.predict(row_features)[0]
    score = model.decision_function(row_features)[0]
    return prediction, score, "trained"


def build_detections(latest_df, history_df=None):
    """latest_df: one or more rows per node to report on (most recent
    row per node is used). history_df: data used to train each node's
    model; defaults to latest_df itself (normal /detect flow). Passing
    a separate history_df lets TEST MODE score fake values against a
    node's real historical baseline instead of training on fake data.
    """
    same_source = history_df is None
    if same_source:
        history_df = latest_df

    detections = []

    for node_name, node_latest in latest_df.groupby("node_name", dropna=False, sort=False):
        node_name_str = str(node_name) if pd.notna(node_name) else "ESP32 inconnu"

        # Rows are newest-first, so the first row is the latest reading.
        latest_row = node_latest.iloc[0]

        if same_source:
            node_history = node_latest
        else:
            node_history = history_df[history_df["node_name"] == node_name]

        prediction, score, status = run_isolation_forest_for_node(node_history, latest_row)
        is_anomaly = bool(status == "trained" and prediction == -1)
        anomaly_score = float(score) if status == "trained" else None

        latest_values = latest_row[PREDICTION_FEATURES + DETECTION_FEATURES].to_dict()
        latest_values["total_ram"] = latest_row["total_ram"]

        messages = diagnose(latest_row)

        if is_anomaly:
            messages.insert(0, {
                "text": "Comportement inhabituel détecté par Isolation Forest.",
                "level": "danger"
            })

        detections.append({
            "node_name": node_name_str,
            "is_anomaly": is_anomaly,
            "anomaly_score": anomaly_score,
            "model_status": status,
            "samples_used": len(node_history),
            "latest_values": latest_values,
            "messages": messages,
        })

    return detections


@app.route("/detect", methods=["GET"])
def detect():
    df = get_recent_data()

    if df.empty:
        return jsonify({
            "error": "Pas encore de données",
            "rows_available": 0,
            "detections": [],
        })

    detections = build_detections(df)

    return jsonify({
        "rows_used": len(df),
        "nodes_detected": len(detections),
        "detections": detections,
    })


@app.route("/detect-test", methods=["POST"])
def detect_test():
    """Analyze exactly the fake ESP32 values displayed by TEST MODE."""
    payload = request.get_json(silent=True) or {}
    nodes = payload.get("nodes", [])

    if not isinstance(nodes, list) or not nodes:
        return jsonify({
            "error": "Aucune donnée ESP32 de test reçue",
            "detections": [],
        }), 400

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

        # TEST MODE humidity encoding: 0 = humid/normal, 1 = dry/warning.
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
        return jsonify({
            "error": "Aucun nœud ESP32 de test valide",
            "detections": [],
        }), 400

    test_df = pd.DataFrame(rows)

    # Score the injected TEST MODE values against each node's real
    # historical baseline, so TEST MODE actually exercises the model
    # instead of always reporting "insufficient_data".
    history_df = get_recent_data()

    detections = build_detections(test_df, history_df=history_df)

    return jsonify({
        "test_mode": True,
        "rows_used": len(test_df),
        "nodes_detected": len(detections),
        "detections": detections,
    })


if __name__ == "__main__":
    app.run(port=5000)
