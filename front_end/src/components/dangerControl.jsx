import { useState, useEffect } from "react";
import clsx from "clsx";

export default function DangerControl() {
    const [dangers, setDangers] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        const getDangers = () => {
            fetch("http://localhost:3000/api/dangers")
                .then((res) => res.json())
                .then((data) => setDangers(data))
                .catch((err) => console.error(err));
        };

        getDangers();

        const interval = setInterval(getDangers, 5000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="danger-control">

            <h2>Historique des dangers</h2>

            <hr />

            <button onClick={() => setShowHistory(!showHistory)}>
                {showHistory
                    ? "Masquer l'historique des dangers"
                    : "Afficher l'historique des dangers"}
            </button>

            {showHistory && (
                <div className="danger-history">

                    {!dangers ? (
                        <p>Chargement de l'historique...</p>
                    ) : dangers.length === 0 ? (
                        <p>Aucun événement de danger enregistré.</p>
                    ) : (
                        dangers.map((event) => (
                            <p key={event.id}>
                                [{new Date(event.created_at).toLocaleString()}]{" "}
                                {event.danger_type} —{" "}

                                <span
                                    className={clsx("metric-value", {
                                        "metric-warning":
                                            event.severity === "warning",
                                        "metric-danger":
                                            event.severity === "danger",
                                    })}
                                >
                                    {event.description}
                                </span>
                            </p>
                        ))
                    )}

                </div>
            )}
        </div>
    );
}