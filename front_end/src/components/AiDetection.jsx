import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeNodeData } from "./fakeData.js";

export default function AiDetection({ testMode = false, testNodes = [] }) {
    const [ai, setAi] = useState(null);
    const [evaluation, setEvaluation] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const getAi = async () => {
            try {
                let response;

                if (testMode) {
                    // Send exactly the fake values used by the visible ESP32 cards.
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
                    throw new Error(data.error || "Erreur du service IA");
                }

                if (!cancelled) {
                    setAi(data);
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setAi({ error: err.message || "Service IA indisponible" });
                }
            }
        };

        getAi();

        const interval = setInterval(getAi, 5000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [testMode, testNodes]);

    useEffect(() => {
        let cancelled = false;

        if (testMode) {
            setEvaluation(null);
            return undefined;
        }

        const getEvaluation = async () => {
            try {
                const response = await fetch(
                    "http://localhost:3000/api/ai/evaluate"
                );
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || "Impossible d'évaluer le modèle IA"
                    );
                }

                if (!cancelled) {
                    setEvaluation(data);
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setEvaluation({
                        available: false,
                        error:
                            err.message ||
                            "Évaluation du modèle IA indisponible",
                    });
                }
            }
        };

        getEvaluation();
        const interval = setInterval(getEvaluation, 30000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [testMode]);

    const matrix = evaluation?.confusion_matrix;
    const metrics = evaluation?.metrics;

    return (
        <div className="ai-control">
            <h2>Détection IA</h2>
            <hr />

            {!ai ? (
                <p>Chargement des données IA...</p>
            ) : ai.error ? (
                <p>{ai.error}</p>
            ) : !ai.detections || ai.detections.length === 0 ? (
                <p>Aucun nœud ESP32 détecté.</p>
            ) : (
                <div className="ai-detections">
                    {ai.detections.map((node) => {
                        const problems = (node.messages || []).filter(
                            (msg) =>
                                msg &&
                                typeof msg.text === "string" &&
                                msg.text.trim() !== ""
                        );

                        const hasProblems = problems.length > 0;

                        return (
                            <div className="ai-node" key={node.node_name}>
                                <h3>{node.node_name}</h3>

                                <p>
                                    État IA:{" "}
                                    <span
                                        className={clsx(
                                            "metric-value",
                                            hasProblems
                                                ? "metric-warning"
                                                : "metric-good"
                                        )}
                                    >
                                        {hasProblems
                                            ? "Problèmes détectés"
                                            : "Normal"}
                                    </span>
                                </p>

                                {hasProblems ? (
                                    <div className="ai-problems">
                                        <strong>Problèmes détectés :</strong>

                                        {problems.map((msg, i) => (
                                            <p
                                                key={i}
                                                className={clsx("metric-value", {
                                                    "metric-warning":
                                                        msg.level === "warning",
                                                    "metric-danger":
                                                        msg.level === "danger",
                                                })}
                                            >
                                                • {msg.text}
                                            </p>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="metric-good">
                                        Aucun problème détecté.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {!testMode && (
                <div
                    className="ai-evaluation"
                    style={{
                        marginTop: "25px",
                        paddingTop: "15px",
                        borderTop: "1px solid #ccc",
                    }}
                >
                    <h3>Évaluation du modèle — Matrice de confusion</h3>

                    {!evaluation ? (
                        <p>Calcul de l'évaluation du modèle...</p>
                    ) : !evaluation.available ? (
                        <p className="metric-warning">
                            {evaluation.reason ||
                                evaluation.error ||
                                "Évaluation indisponible."}
                        </p>
                    ) : (
                        <>
                            <p>
                                Modèle : <strong>{evaluation.model}</strong>
                            </p>
                            <p>
                                Données d'entraînement réelles :{" "}
                                <strong>{evaluation.training_rows}</strong>
                                {" — "}
                                Scénarios de validation :{" "}
                                <strong>{evaluation.validation_rows}</strong>
                            </p>

                            <div
                                style={{
                                    overflowX: "auto",
                                    border: "1px solid #ccc",
                                    borderRadius: "10px",
                                    margin: "15px 0",
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
                                            <th style={{ padding: "10px" }}>
                                                Anomalie
                                            </th>
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

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(150px, 1fr))",
                                    gap: "10px",
                                }}
                            >
                                <p>
                                    Accuracy :{" "}
                                    <strong>{Number(metrics.accuracy).toFixed(2)} %</strong>
                                </p>
                                <p>
                                    Precision :{" "}
                                    <strong>{Number(metrics.precision).toFixed(2)} %</strong>
                                </p>
                                <p>
                                    Recall :{" "}
                                    <strong>{Number(metrics.recall).toFixed(2)} %</strong>
                                </p>
                                <p>
                                    F1-score :{" "}
                                    <strong>{Number(metrics.f1_score).toFixed(2)} %</strong>
                                </p>
                            </div>

                            <p style={{ fontSize: "0.9rem", marginTop: "12px" }}>
                                {evaluation.validation_source}
                            </p>
                            <p style={{ fontSize: "0.9rem" }}>
                                Classe positive : <strong>Anomalie</strong>. TN = normal correctement détecté,
                                FP = fausse alerte, FN = anomalie manquée, TP = anomalie correctement détectée.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
