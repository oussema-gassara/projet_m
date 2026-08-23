import { useEffect, useState } from "react";
import clsx from "clsx";

import { fakeNodeData } from "./fakeData.js";

export default function Prediction({ testMode = false, testNodes = [] }) {
    const [predictions, setPredictions] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadPredictions = async () => {
            try {
                let response;

                if (testMode) {
                    const nodes = testNodes
                        .map((node) => {
                            const data = fakeNodeData[node.node_name];
                            if (!data) return null;

                            return {
                                node_name: node.node_name,
                                ...data,
                            };
                        })
                        .filter(Boolean);

                    response = await fetch("http://localhost:3000/api/ai/detect-test", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ nodes }),
                    });
                } else {
                    response = await fetch("http://localhost:3000/api/ai/detect");
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Erreur du service de prédiction");
                }

                if (!cancelled) {
                    setPredictions(data.detections || []);
                    setError("");
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError(err.message || "Service de prédiction indisponible");
                    setPredictions([]);
                }
            }
        };

        loadPredictions();
        const interval = setInterval(loadPredictions, 5000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [testMode, testNodes]);

    return (
        <div className="prediction-control">
            <h2>Prediction</h2>
            <hr />

            {error ? (
                <p className="metric-danger">{error}</p>
            ) : predictions.length === 0 ? (
                <p>Aucune prédiction disponible.</p>
            ) : (
                <div className="prediction-cards">
                    {predictions.map((node) => {
                        const anomaly = Boolean(node.is_anomaly);
                        const score = Number(node.anomaly_score);

                        return (
                            <div
                                className="prediction-card"
                                key={node.node_name}
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "10px",
                                    padding: "15px",
                                    margin: "10px 0",
                                }}
                            >
                                <h3>{node.node_name}</h3>

                                <p>
                                    Isolation Forest: {" "}
                                    <strong
                                        className={clsx(
                                            anomaly
                                                ? "metric-danger"
                                                : "metric-good"
                                        )}
                                    >
                                        {anomaly ? "Anomalie" : "Normal"}
                                    </strong>
                                </p>

                                <p>
                                    Anomaly Score: {" "}
                                    <strong>
                                        {Number.isFinite(score)
                                            ? score.toFixed(4)
                                            : "—"}
                                    </strong>
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
