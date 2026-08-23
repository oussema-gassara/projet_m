import { useEffect, useState } from "react";
import clsx from "clsx";

export default function Prediction({ testMode = false }) {
    const [forecasts, setForecasts] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadForecasts = async () => {
            // Forecasting is intentionally based on real historical data.
            // Fake TEST MODE values are not used to train or forecast the future.
            if (testMode) {
                setForecasts([]);
                setError("");
                return;
            }

            try {
                const response = await fetch("http://localhost:3000/api/ai/forecast");
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
            <h2>Prediction</h2>
            <hr />

            {testMode ? (
                <p>
                    La prédiction future utilise uniquement les données
                    historiques réelles des ESP32. Désactivez le TEST MODE
                    pour afficher les prévisions.
                </p>
            ) : error ? (
                <p className="metric-danger">{error}</p>
            ) : forecasts.length === 0 ? (
                <p>
                    Pas encore assez de données historiques pour effectuer
                    une prédiction.
                </p>
            ) : (
                <div className="prediction-cards">
                    {forecasts.map((node) => {
                        if (!node.available) {
                            return (
                                <div className="prediction-card" key={node.node_name}>
                                    <h3>{node.node_name}</h3>
                                    <p>{node.reason}</p>
                                    <p>Données utilisées : {node.rows_used}</p>
                                </div>
                            );
                        }

                        const current = Number(node.current_cpu_temperature);
                        const predicted = Number(node.predicted_cpu_temperature_5min);
                        const rising = Number(node.trend_per_minute) > 0;
                        const risk = predicted >= 80;

                        return (
                            <div className="prediction-card" key={node.node_name}>
                                <h3>{node.node_name}</h3>

                                <p>
                                    Température CPU actuelle : {" "}
                                    <strong>{current.toFixed(2)} °C</strong>
                                </p>

                                <p>
                                    Température CPU prévue dans 5 min : {" "}
                                    <strong className={clsx(risk ? "metric-danger" : "metric-good")}>
                                        {predicted.toFixed(2)} °C
                                    </strong>
                                </p>

                                <p>
                                    Tendance : {" "}
                                    <strong>{rising ? "Hausse" : "Baisse / stable"}</strong>
                                </p>

                                <p>
                                    Variation estimée : {" "}
                                    <strong>{Number(node.trend_per_minute).toFixed(3)} °C/min</strong>
                                </p>

                                <p>Données historiques utilisées : {node.rows_used}</p>

                                {risk ? (
                                    <p className="metric-danger">
                                        ⚠ Température susceptible de dépasser 80 °C dans les prochaines minutes.
                                    </p>
                                ) : (
                                    <p className="metric-good">
                                        ✓ Aucune surchauffe prévue à l'horizon de 5 minutes.
                                    </p>
                                )}

                                <h4>Prévisions</h4>
                                <ul>
                                    {node.forecast.map((point) => (
                                        <li key={point.minutes_ahead}>
                                            +{point.minutes_ahead} min : {point.predicted_cpu_temperature.toFixed(2)} °C
                                        </li>
                                    ))}
                                </ul>

                                <small>Modèle : {node.model}</small>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
