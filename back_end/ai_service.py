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

FEATURES = ["used_ram", "cpu_temperature", "wifi_signal", "external_temperature"]

def get_recent_data(limit=200):
    conn = mysql.connector.connect(**DB_CONFIG)
    query = f"""
        SELECT {", ".join(FEATURES)}, total_ram
        FROM monitoring_data
        ORDER BY id DESC
        LIMIT {limit}
    """
    df = pd.read_sql(query, conn)
    conn.close()
    return df.dropna()

def diagnose(latest_row):
    messages = []

    used_ram = latest_row["used_ram"]
    total_ram = latest_row["total_ram"]
    ram_percent = (used_ram / total_ram) * 100 if total_ram else 0

    cpu_temp = latest_row["cpu_temperature"]
    wifi_signal = latest_row["wifi_signal"]
    ext_temp = latest_row["external_temperature"]

    if ram_percent > 90:
        messages.append({"text": "Utilisation RAM critique — redémarrez l'ESP32 pour libérer de la mémoire.", "level": "danger"})
    elif ram_percent > 70:
        messages.append({"text": "Utilisation RAM élevée — surveillez une éventuelle fuite mémoire.", "level": "warning"})

    if cpu_temp > 80:
        messages.append({"text": "Température du processeur trop élevée — éteignez le système pour éviter les dommages.", "level": "danger"})
    elif cpu_temp > 60:
        messages.append({"text": "Température du processeur élevée — vérifiez la ventilation.", "level": "warning"})

    if wifi_signal < -80:
        messages.append({"text": "Signal Wi-Fi faible — rapprochez l'ESP32 du routeur.", "level": "danger"})
    elif wifi_signal < -60:
        messages.append({"text": "Signal Wi-Fi modéré — la connexion peut être instable.", "level": "warning"})

    if ext_temp > 40:
        messages.append({"text": "Température ambiante trop élevée — vérifiez la présence de sources de chaleur à proximité.", "level": "danger"})
    elif ext_temp > 30:
        messages.append({"text": "Température ambiante élevée — à surveiller.", "level": "warning"})

    return messages

@app.route("/detect", methods=["GET"])
def detect():
    df = get_recent_data()

    if len(df) < 20:
        return jsonify({
            "error": "Pas encore assez de données",
            "is_anomaly": False,
            "rows_available": len(df),
            "messages": [],
        })

    model_features = df[FEATURES]
    model = IsolationForest(contamination=0.05, random_state=42)
    model.fit(model_features)

    latest = model_features.iloc[[0]]
    prediction = model.predict(latest)[0]
    score = model.decision_function(latest)[0]

    latest_full_row = df.iloc[0]
    messages = diagnose(latest_full_row)

    return jsonify({
        "is_anomaly": bool(prediction == -1),
        "anomaly_score": float(score),
        "rows_used": len(df),
        "latest_values": latest.to_dict(orient="records")[0],
        "messages": messages,
    })

if __name__ == "__main__":
    app.run(port=5000)