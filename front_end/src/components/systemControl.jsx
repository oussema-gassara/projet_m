import { useState, useEffect } from "react";
import clsx from "clsx";
import SystemStatus from "./SystemStatus.jsx";
import { fakeNodeData } from "./fakeData.js";

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
    const [diagnosticLoading, setDiagnosticLoading] = useState(false);
    const [diagnosticResult, setDiagnosticResult] = useState(null);
    const [diagnosticError, setDiagnosticError] = useState("");

    useEffect(() => {
        setDiagnosticResult(null);
        setDiagnosticError("");

        if (testMode) {
            setSystem(fakeNodeData[nodeName]?.system || null);
            return;
        }

        const getSystem = () => {
            fetch(`http://localhost:3000/api/system?node_name=${encodeURIComponent(nodeName)}`)
                .then((res) => res.json())
                .then((data) => setSystem(data))
                .catch((err) => console.error(err));
        };

        getSystem();
        const interval = setInterval(getSystem, 2000);
        return () => clearInterval(interval);
    }, [testMode, nodeName]);

    const handleDiagnostic = async () => {
        if (diagnosticLoading) return;

        setDiagnosticLoading(true);
        setDiagnosticResult(null);
        setDiagnosticError("");

        if (testMode) {
            setDiagnosticResult({
                node_name: nodeName,
                port: "SIMULATION",
                code: "TEST_DIAGNOSTIC",
                severity: "WARNING",
                message: "Diagnostic simulé en mode test.",
            });
            setDiagnosticLoading(false);
            return;
        }

        try {
            const response = await fetch(
                "http://localhost:3000/api/diagnostic/esp32",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        node_name: nodeName,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Impossible de lancer le diagnostic.");
            }

            setDiagnosticResult(data);
        } catch (error) {
            console.error(error);
            setDiagnosticError(
                error.message || "Impossible de contacter le service de diagnostic."
            );
        } finally {
            setDiagnosticLoading(false);
        }
    };

    return (
        <>
            <div className="system-status">
                <SystemStatus
                    system={system}
                    onDiagnostic={handleDiagnostic}
                    diagnosticLoading={diagnosticLoading}
                    diagnosticResult={diagnosticResult}
                    diagnosticError={diagnosticError}
                />
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
                                    Pourcentage de RAM utilisée:{" "}
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
