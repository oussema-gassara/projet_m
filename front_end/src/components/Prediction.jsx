import { useEffect, useState } from "react";
import clsx from "clsx";
import { API_URL } from "../config.js";

const metricLabels = {
    cpu_temperature: "Température du processeur",
    external_temperature: "Température externe",
    ram_usage_percent: "Utilisation de la RAM",
};

function MetricPrediction({ metricKey, metric }) {
    if (!metric?.available) {
        return (
            <div className="prediction-metric">
                <h4>{metricLabels[metricKey]}</h4>
                <p>{metric?.reason || "Prédiction indisponible"}</p>
                <p>Données utilisées : {metric?.rows_used ?? 0}</p>
            </div>
        );
    }

    const current = Number(metric.current);
    const predicted = Number(metric.predicted_5min);
    const trend = Number(metric.trend_per_minute);
    const rising = trend > 0;

    const isRam = metricKey === "ram_usage_percent";
    const dangerLimit = isRam ? 90 : metricKey === "cpu_temperature" ? 80 : 40;
    const warningLimit = isRam ? 70 : metricKey === "cpu_temperature" ? 60 : 30;
    const unit = metric.unit || "";
    const predictedDanger = predicted >= dangerLimit;
    const predictedWarning = predicted >= warningLimit;

    return (
        <div className="prediction-metric">
            <h4>{metricLabels[metricKey]}</h4>

            <p>
                Valeur actuelle : <strong>{current.toFixed(2)} {unit}</strong>
            </p>

            <p>
                Prévue dans 5 min : {" "}
                <strong className={clsx(
                    predictedDanger
                        ? "metric-danger"
                        : predictedWarning
                            ? "metric-warning"
                            : "metric-good"
                )}>
                    {predicted.toFixed(2)} {unit}
                </strong>
            </p>

            <p>
                Tendance : <strong>{rising ? "Hausse" : "Baisse / stable"}</strong>
            </p>

            <p>
                Variation estimée : <strong>{trend.toFixed(3)} {unit}/min</strong>
            </p>

            <p>Données historiques utilisées : {metric.rows_used}</p>

            {predictedDanger ? (
                <p className="metric-danger">
                    ⚠ La valeur prévue atteint un niveau critique dans les prochaines minutes.
                </p>
            ) : predictedWarning ? (
                <p className="metric-warning">
                    ⚠ La valeur prévue atteint un niveau nécessitant une surveillance.
                </p>
            ) : (
                <p className="metric-good">
                    ✓ Aucune valeur critique prévue dans les 5 prochaines minutes.
                </p>
            )}

            <h5>Prévisions</h5>
            <ul>
                {metric.forecast.map((point) => (
                    <li key={point.minutes_ahead}>
                        +{point.minutes_ahead} min : {Number(point.value).toFixed(2)} {unit}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Prediction({ testMode = false }) {
    const [forecasts, setForecasts] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadForecasts = async () => {
            // Les prévisions utilisent uniquement les données historiques réelles des ESP32.
            if (testMode) {
                setForecasts([]);
                setError("");
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/ai/forecast`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Erreur du service de prédiction");
                }

                if (!cancelled) {
                    setForecasts(data.forecasts || []);
                    setError("");
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError(err.message || "Service de prédiction indisponible");
                    setForecasts([]);
                }
            }
        };

        loadForecasts();
        const interval = setInterval(loadForecasts, 10000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [testMode]);

    return (
        <div className="prediction-control">
            <h2>Prédiction</h2>
            <hr />

            {testMode ? (
                <p>
                    La prédiction future utilise uniquement les données historiques
                    réelles des ESP32. Désactivez le mode TEST pour afficher les prévisions.
                </p>
            ) : error ? (
                <p className="metric-danger">{error}</p>
            ) : forecasts.length === 0 ? (
                <p>
                    Pas encore assez de données historiques pour effectuer une prédiction.
                </p>
            ) : (
                <div className="prediction-cards">
                    {forecasts.map((node) => (
                        <div className="prediction-card" key={node.node_name}>
                            <h3>{node.node_name}</h3>

                            <MetricPrediction
                                metricKey="cpu_temperature"
                                metric={node.forecasts?.cpu_temperature}
                            />

                            <MetricPrediction
                                metricKey="external_temperature"
                                metric={node.forecasts?.external_temperature}
                            />

                            <MetricPrediction
                                metricKey="ram_usage_percent"
                                metric={node.forecasts?.ram_usage_percent}
                            />

                            <small>Modèle : {node.model}</small>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
