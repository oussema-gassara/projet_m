from flask import Flask, jsonify
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

# Features used ONLY by Isolation Forest prediction.
PREDICTION_FEATURES = [
    "used_ram",
    "cpu_temperature",
    "wifi_signal",
    "external_temperature",
]

# Detection-only values. They generate explicit alerts but never
# influence the Isolation Forest model.
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
    if gas_level >= 600:
        messages.append({
            "text": "Niveau de gaz critique — vérifiez immédiatement l'environnement et le capteur MQ-2.",
            "level": "danger"
        })
    elif gas_level >= 400:
        messages.append({
            "text": "Niveau de gaz élevé — surveillez le capteur MQ-2.",
            "level": "warning"
        })

    # Humidity detection only — never used by Isolation Forest.
    humidity_value = latest_row["humidity"]
    if pd.notna(humidity_value):
        try:
            humidity = float(humidity_value)
            if humidity < 30 or humidity > 70:
                messages.append({
                    "text": "Humidité hors de la plage normale — vérifiez les conditions ambiantes.",
                    "level": "warning"
                })
        except (TypeError, ValueError):
            humidity_text = str(humidity_value).lower()
            if "dry" in humidity_text or "humid" in humidity_text:
                messages.append({
                    "text": "Humidité ambiante à surveiller.",
                    "level": "warning"
                })

    return messages


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

    # IMPORTANT: Isolation Forest uses ONLY prediction features.
    model = IsolationForest(contamination=0.05, random_state=42)
    model.fit(df[PREDICTION_FEATURES])

    # Keep the most recent measurement of each ESP32.
    latest_by_node = df.groupby("node_name", dropna=False, sort=False).head(1)

    detections = []

    for _, latest_row in latest_by_node.iterrows():
        latest_values = latest_row[PREDICTION_FEATURES + DETECTION_FEATURES].to_dict()
        latest_values["total_ram"] = latest_row["total_ram"]

        # Prediction uses ONLY PREDICTION_FEATURES.
        latest_for_model = pd.DataFrame([
            latest_row[PREDICTION_FEATURES].to_dict()
        ])
        prediction = model.predict(latest_for_model)[0]
        score = model.decision_function(latest_for_model)[0]

        node_name = latest_row["node_name"]
        node_name = str(node_name) if pd.notna(node_name) else "ESP32 inconnu"

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

    return jsonify({
        "rows_used": len(df),
        "nodes_detected": len(detections),
        "detections": detections,
    })


if __name__ == "__main__":
    app.run(port=5000)
