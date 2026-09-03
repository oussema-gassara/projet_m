import { useEffect, useState } from "react";
import clsx from "clsx";

const metricLabels = {
    cpu_temperature: "Température du processeur",
    external_temperature: "Température externe",
    ram_usage_percent: "Utilisation de la RAM",
    wifi_signal: "Signal Wi-Fi",
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
    const isWifi = metricKey === "wifi_signal";
    const isRam = metricKey === "ram_usage_percent";
    const unit = metric.unit || "";

    let predictedDanger;
    let predictedWarning;
    let trendText;
    let normalMessage;
    let warningMessage;
    let dangerMessage;

    if (isWifi) {
        predictedDanger = predicted < -80;
        predictedWarning = predicted < -65 && !predictedDanger;
        trendText = trend < 0 ? "Dégradation" : trend > 0 ? "Amélioration" : "Stable";
        normalMessage = "✓ Le signal Wi-Fi devrait rester dans une zone correcte dans les 5 prochaines minutes.";
        warningMessage = "⚠ Le signal Wi-Fi risque de devenir faible dans les prochaines minutes.";
        dangerMessage = "⚠ Le signal Wi-Fi risque de devenir très faible dans les prochaines minutes.";
    } else {
        const dangerLimit = isRam ? 90 : metricKey === "cpu_temperature" ? 80 : 40;
        const warningLimit = isRam ? 70 : metricKey === "cpu_temperature" ? 60 : 30;
        predictedDanger = predicted >= dangerLimit;
        predictedWarning = predicted >= warningLimit && !predictedDanger;
        trendText = trend > 0 ? "Hausse" : "Baisse / stable";
        normalMessage = "✓ Aucune valeur critique prévue dans les 5 prochaines minutes.";
        warningMessage = "⚠ La valeur prévue atteint un niveau nécessitant une surveillance.";
        dangerMessage = "⚠ La valeur prévue atteint un niveau critique dans les prochaines minutes.";
    }

    return (
        <div className="prediction-metric">
            <h4>{metricLabels[metricKey]}</h4>

            <p>
                Valeur actuelle : <strong>{current.toFixed(2)} {unit}</strong>
            </p>

            <p>
                Prévue dans 5 min:{" "}
                <strong
                    className={clsx(
                        predictedDanger
                            ? "metric-danger"
                            : predictedWarning
                                ? "metric-warning"
                                : "metric-good"
                    )}
                >
                    {predicted.toFixed(2)} {unit}
                </strong>
            </p>

            <p>
                Tendance : <strong>{trendText}</strong>
            </p>

            <p>
                Variation estimée : <strong>{trend.toFixed(3)} {unit}/min</strong>
            </p>

            <p>Données historiques utilisées : {metric.rows_used}</p>

            {metric.model && (
                <p>
                    <small>Modèle : {metric.model}</small>
                </p>
            )}

            {predictedDanger ? (
                <p className="metric-danger">{dangerMessage}</p>
            ) : predictedWarning ? (
                <p className="metric-warning">{warningMessage}</p>
            ) : (
                <p className="metric-good">{normalMessage}</p>
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

function ConfusionMatrix({ matrix }) {
    if (!matrix) return null;

    return (
        <div
            style={{
                overflowX: "auto",
                border: "1px solid #ccc",
                borderRadius: "10px",
                margin: "12px 0",
            }}
        >
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "center",
                }}
            >
                <thead>
                    <tr>
                        <th style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            Réel / Prédit
                        </th>
                        <th style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            Normal
                        </th>
                        <th style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            Anomalie
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            Normal
                        </th>
                        <td style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            <strong>{matrix.tn}</strong>
                            <br />
                            <small>TN</small>
                        </td>
                        <td style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
                            <strong>{matrix.fp}</strong>
                            <br />
                            <small>FP</small>
                        </td>
                    </tr>
                    <tr>
                        <th style={{ padding: "10px" }}>Anomalie</th>
                        <td style={{ padding: "10px" }}>
                            <strong>{matrix.fn}</strong>
                            <br />
                            <small>FN</small>
                        </td>
                        <td style={{ padding: "10px" }}>
                            <strong>{matrix.tp}</strong>
                            <br />
                            <small>TP</small>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

function ClassificationMetrics({ metrics }) {
    if (!metrics) return null;

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "8px",
            }}
        >
            <p>Accuracy : <strong>{Number(metrics.accuracy).toFixed(2)} %</strong></p>
            <p>Precision : <strong>{Number(metrics.precision).toFixed(2)} %</strong></p>
            <p>Recall : <strong>{Number(metrics.recall).toFixed(2)} %</strong></p>
            <p>F1-score : <strong>{Number(metrics.f1_score).toFixed(2)} %</strong></p>
        </div>
    );
}

function PredictionEvaluation({ evaluation }) {
    if (!evaluation) {
        return <p>Calcul de l'évaluation du modèle de prédiction...</p>;
    }

    if (!evaluation.available) {
        return (
            <p className="metric-warning">
                {evaluation.reason || "Évaluation du modèle de prédiction indisponible."}
            </p>
        );
    }

    const overall = evaluation.overall || {};

    return (
        <div
            className="prediction-evaluation"
            style={{
                marginTop: "25px",
                paddingTop: "15px",
                borderTop: "1px solid #ccc",
            }}
        >
            <h3>Évaluation du modèle de prédiction — Matrice de confusion</h3>

            <p>
                Modèle : <strong>{evaluation.model}</strong>
            </p>
            <p>
                Table utilisée : <strong>{evaluation.database_table}</strong>
                {" — "}
                Mesures réelles lues : <strong>{evaluation.rows_read}</strong>
                {" — "}
                Horizon : <strong>+{evaluation.horizon_minutes} min</strong>
            </p>

            <p style={{ fontSize: "0.9rem" }}>
                La prédiction produit une valeur continue. Pour construire la matrice de confusion,
                la valeur prédite et la vraie valeur mesurée 5 minutes plus tard sont transformées
                en classes <strong>NORMAL</strong> / <strong>ANOMALIE</strong> avec les mêmes seuils que le dashboard.
            </p>

            <h4>Matrice globale</h4>
            <p>Comparaisons réalisées : <strong>{overall.evaluations}</strong></p>
            <ConfusionMatrix matrix={overall.confusion_matrix} />
            <ClassificationMetrics metrics={overall.classification_metrics} />

            <p style={{ fontSize: "0.9rem", marginTop: "12px" }}>
                {evaluation.validation_method}
            </p>

            {(evaluation.nodes || []).map((node) => (
                <div
                    key={node.node_name}
                    style={{
                        border: "1px solid #ccc",
                        borderRadius: "10px",
                        padding: "15px",
                        marginTop: "15px",
                    }}
                >
                    <h4>{node.node_name}</h4>
                    <p>
                        Mesures disponibles : <strong>{node.rows_available}</strong>
                        {" — "}
                        Points de backtest : <strong>{node.backtest_samples}</strong>
                    </p>

                    {Object.entries(node.metrics || {}).map(([metricKey, metric]) => (
                        <div
                            key={metricKey}
                            style={{
                                borderTop: "1px solid #ddd",
                                paddingTop: "12px",
                                marginTop: "12px",
                            }}
                        >
                            <h5>{metric.label || metricLabels[metricKey]}</h5>
                            <p>
                                Modèle : <strong>{metric.model}</strong>
                            </p>
                            <p>
                                Règle ANOMALIE : <strong>{metric.anomaly_rule}</strong>
                                {" — "}
                                Comparaisons : <strong>{metric.evaluations}</strong>
                            </p>

                            <ConfusionMatrix matrix={metric.confusion_matrix} />
                            <ClassificationMetrics metrics={metric.classification_metrics} />

                            {metric.regression_metrics?.mae !== null && (
                                <p>
                                    MAE : <strong>{metric.regression_metrics.mae} {metric.unit}</strong>
                                    {" — "}
                                    RMSE : <strong>{metric.regression_metrics.rmse} {metric.unit}</strong>
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            ))}

            <p style={{ fontSize: "0.9rem", marginTop: "12px" }}>
                Classe positive : <strong>Anomalie</strong>. TN = normal correctement prévu,
                FP = fausse alerte, FN = anomalie future non prévue, TP = anomalie future correctement prévue.
            </p>
        </div>
    );
}

export default function Prediction({ testMode = false }) {
    const [forecasts, setForecasts] = useState([]);
    const [evaluation, setEvaluation] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadForecasts = async () => {
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

    useEffect(() => {
        let cancelled = false;

        if (testMode) {
            setEvaluation(null);
            return undefined;
        }

        const loadEvaluation = async () => {
            try {
                const response = await fetch("http://localhost:3000/api/ai/evaluate");
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Erreur d'évaluation du modèle de prédiction");
                }

                if (!cancelled) {
                    setEvaluation(data);
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setEvaluation({
                        available: false,
                        reason: err.message || "Évaluation du modèle de prédiction indisponible",
                    });
                }
            }
        };

        loadEvaluation();
        const interval = setInterval(loadEvaluation, 30000);

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
                    La prédiction future et son évaluation utilisent uniquement les données historiques
                    réelles des ESP32. Désactivez le mode TEST pour les afficher.
                </p>
            ) : (
                <>
                    {error ? (
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

                                    <MetricPrediction
                                        metricKey="wifi_signal"
                                        metric={node.forecasts?.wifi_signal}
                                    />

                                    <small>
                                        CPU / Température / RAM : {node.model}
                                        {" — "}
                                        Wi-Fi : {node.forecasts?.wifi_signal?.model || "modèle RSSI dédié"}
                                    </small>
                                </div>
                            ))}
                        </div>
                    )}

                    <PredictionEvaluation evaluation={evaluation} />
                </>
            )}
        </div>
    );
}
