import { useState, useEffect } from "react";
import clsx from "clsx";

export default function AiDetection() {

    const [ai, setAi] = useState(null);

    useEffect(() => {

        const getAi = () => {

            fetch("http://localhost:3000/api/ai/detect")
                .then(res => res.json())
                .then(data => setAi(data))
                .catch(err => console.error(err));

        };

        getAi();

        const interval = setInterval(getAi, 5000);

        return () => clearInterval(interval);

    }, []);

    return (
        <div className="ai-control">
            <h2>Détection IA</h2>
            <hr />

            {!ai ? (
                <p>Chargement des données IA...</p>
            ) : ai.error ? (
                <p>{ai.error} ({ai.rows_available} lignes disponibles)</p>
            ) : (
                <>
                    <p>
                        {/*État:{" "}
                        <span className={clsx("metric-value", ai.is_anomaly ? "metric-danger" : "metric-good")}>
                            {ai.is_anomaly ? "Anomalie détectée" : "Normal"}
                        </span>*/}
                    </p>

                    {ai.messages.length > 0 && (
                        <div>
                            
                            {ai.messages.map((msg, i) => (
                                <p
                                    key={i}
                                    className={clsx("metric-value", {
                                        "metric-warning": msg.level === "warning",
                                        "metric-danger": msg.level === "danger",
                                    })}
                                >
                                    {msg.text}
                                </p>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}