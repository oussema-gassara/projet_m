import { useState, useEffect } from "react";
import clsx from "clsx";
import SystemStatus from "./SystemStatus.jsx";
import { fakeNodeData } from "./fakeData.js";
import { API_URL } from "../config.js";

const getLevel = (value, warnAt, dangerAt) => {
    if (!Number.isFinite(value)) return "good";
    if (value >= dangerAt) return "danger";
    if (value >= warnAt) return "warning";
    return "good";
};

const numberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const formatNumber = (value, digits = 2) => {
    const number = numberOrNull(value);
    return number === null ? "—" : number.toFixed(digits);
};

export default function SystemControl({ nodeName = "esp32-1", testMode = false }) {
    const [system, setSystem] = useState(null);

    useEffect(() => {
        if (testMode) {
            setSystem(fakeNodeData[nodeName]?.system || null);
            return;
        }

        const getSystem = () => {
            fetch(`${API_URL}/api/system?node_name=${encodeURIComponent(nodeName)}`)
                .then((res) => res.json())
                .then((data) => setSystem(data))
                .catch((err) => console.error(err));
        };

        getSystem();
        const interval = setInterval(getSystem, 2000);
        return () => clearInterval(interval);
    }, [testMode, nodeName]);

    return (
        <>
            <div className="system-status">
                <SystemStatus system={system} />
            </div>
            <div className="system-control">
                <h2>Contrôle du système {testMode && "(TEST)"}</h2>
                <hr />

                {!system ? (
                    <p>Chargement des données système…</p>
                ) : (
                    <>
                        {(() => {
                            const temp = numberOrNull(system.cpu_temperature);
                            const level = getLevel(temp, 60, 80);
                            return (
                                <p>
                                    Température du processeur:{" "}
                                    <span className={clsx("metric-value", {
                                        "metric-good": level === "good",
                                        "metric-warning": level === "warning",
                                        "metric-danger": level === "danger",
                                    })}>
                                        {formatNumber(temp)} °C
                                    </span>
                                </p>
                            );
                        })()}

                        <hr />
                        <p>RAM totale : {formatNumber(numberOrNull(system.total_ram) / 1024)} Ko</p>
                        <p>RAM libre : {formatNumber(numberOrNull(system.free_ram) / 1024)} Ko</p>
                        <p>RAM utilisée : {formatNumber(numberOrNull(system.used_ram) / 1024)} Ko</p>
                        <p>RAM libre minimale : {formatNumber(numberOrNull(system.minimum_free_ram) / 1024)} Ko</p>

                        {(() => {
                            const used = numberOrNull(system.used_ram);
                            const total = numberOrNull(system.total_ram);
                            const usedPct = used !== null && total > 0 ? Math.round((used / total) * 100) : null;
                            const level = getLevel(usedPct, 70, 90);
                            return (
                                <p>
                                    Pourcentage de RAM utilisée :{" "}
                                    <span className={clsx("metric-value", {
                                        "metric-good": level === "good",
                                        "metric-warning": level === "warning",
                                        "metric-danger": level === "danger",
                                    })}>
                                        {usedPct === null ? "—" : `${usedPct} %`}
                                    </span>
                                </p>
                            );
                        })()}

                        <hr />
                        <p>Fréquence du processeur : {system.cpu_frequency ?? "—"} MHz</p>
                        <p>Nombre de cœurs : {system.cpu_cores ?? "—"}</p>
                        <p>Cœur actif : {system.active_core ?? "—"}</p>

                        <hr />
                        <p>Modèle de la puce : {system.chip_model || "—"}</p>
                        <p>Révision de la puce : {system.chip_revision ?? "—"}</p>

                        <hr />
                        <p>Taille de la mémoire Flash : {formatNumber(numberOrNull(system.flash_size) / 1024 / 1024)} Mo</p>
                        <p>Taille du programme : {formatNumber(numberOrNull(system.sketch_size) / 1024 / 1024)} Mo</p>

                        <hr />
                        <p>Version du SDK : {system.sdk_version || "—"}</p>

                        <hr />
                        <p>Temps de fonctionnement : {system.uptime ?? "—"} secondes</p>
                        <p>Reconnexions : {system.reconnects ?? "—"}</p>

                        <hr />
                        <p>État : {system.status || "—"}</p>
                    </>
                )}
            </div>
        </>
    );
}
