import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeNodeData } from "./fakeData.js";

export default function AiDetection({ testMode = false, testNodes = [] }) {
    const [ai, setAi] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const getAi = async () => {
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
        </div>
    );
}
