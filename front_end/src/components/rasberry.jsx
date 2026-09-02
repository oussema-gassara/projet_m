import { useState, useEffect } from "react";
import RasberryStatus from "./rasberryStatus.jsx";
import clsx from "clsx";

export default function Rasberry({ testMode = false }) {

    const [rasberry, setRasberry] = useState(null);
    const [diagnosticLoading, setDiagnosticLoading] = useState(false);
    const [diagnosticResult, setDiagnosticResult] = useState(null);
    const [diagnosticError, setDiagnosticError] = useState("");

    useEffect(() => {

        const getRasberry = () => {

            const token = localStorage.getItem("token");

            fetch("http://localhost:3000/api/pi", {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
                .then(res => res.json())
                .then(data => setRasberry(data))
                .catch(err => console.error(err));

        };

        getRasberry();

        const interval = setInterval(getRasberry, 2000);

        return () => clearInterval(interval);

    }, []);

    const handleDiagnostic = async () => {
        if (diagnosticLoading) return;

        setDiagnosticLoading(true);
        setDiagnosticResult(null);
        setDiagnosticError("");

        try {
            const response = await fetch(
                "http://localhost:3000/api/diagnostic/raspberry",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node_name: rasberry?.node_name || "raspberry-1",
                        test_mode: testMode,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Impossible de lancer le diagnostic Raspberry Pi."
                );
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
        <div className="rasberry-main">
            <div className="rasberry-status">
                <RasberryStatus
                    rasberry={rasberry}
                    onDiagnostic={handleDiagnostic}
                    diagnosticLoading={diagnosticLoading}
                    diagnosticResult={diagnosticResult}
                    diagnosticError={diagnosticError}
                />
            </div>
            <div className="rasberry-control">
                <h2>Rasberry Pi Control</h2>
                <hr />

                {!rasberry ? (
                    <p>Loading rasberry data...</p>
                ) : (
                    <>
                        {rasberry.ip_address && (
                            <>
                                <p>Adresse Ip: {rasberry.ip_address}</p>
                                <hr />
                            </>
                        )}
                        {rasberry.mac_address && (
                            <>
                                <p>Adresse Mac: {rasberry.mac_address}</p>
                                <hr />
                            </>
                        )}
                        <p>
                            Statut Wi-Fi: {rasberry.wifi_status}
                        </p>
                        <hr />
                        <p>
                            Temperature Du Processeur:{" "}
                            <span
                                className={clsx("metric-value", {
                                    "metric-good": rasberry.cpu_temperature < 60,
                                    "metric-warning": rasberry.cpu_temperature >= 60 && rasberry.cpu_temperature <= 80,
                                    "metric-danger": rasberry.cpu_temperature > 80,
                                })}
                            >
                                {Number(rasberry.cpu_temperature).toFixed(2)}°C
                            </span>
                        </p>
                        <hr />
                        <p>
                            Utilisation Du Processeur:{" "}
                            {Number(rasberry.cpu_usage_percent).toFixed(1)}%
                        </p>
                        <hr />
                        <p>
                            RAM Totale:{" "}
                            {(rasberry.total_ram / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <hr />
                        <p>
                            RAM Libre:{" "}
                            {(rasberry.free_ram / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <hr />
                        <p>
                            RAM Utilisée:{" "}
                            {(rasberry.used_ram / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <hr />
                        <p>
                            Utilisation de Ram:{" "}
                            <span
                                className={clsx("metric-value", {
                                    "metric-good": rasberry.used_ram_percent < 70,
                                    "metric-warning": rasberry.used_ram_percent >= 70 && rasberry.used_ram_percent <= 90,
                                    "metric-danger": rasberry.used_ram_percent > 90,
                                })}
                            >
                                {Number(rasberry.used_ram_percent).toFixed(1)}%
                            </span>
                        </p>
                        <hr />
                        <p>
                            Disque Total:{" "}
                            {(rasberry.disk_total / 1024 / 1024 / 1024).toFixed(2)} GB
                        </p>
                        <hr />
                        <p>
                            Disque Utilisé:{" "}
                            {(rasberry.disk_used / 1024 / 1024 / 1024).toFixed(2)} GB
                        </p>
                        <hr />
                        <p>
                            Disque Libre:{" "}
                            {(rasberry.disk_free / 1024 / 1024 / 1024).toFixed(2)} GB
                        </p>
                        <hr />
                        <p>
                            Utilisation du Disque:{" "}
                            <span
                                className={clsx("metric-value", {
                                    "metric-good": rasberry.disk_percent < 70,
                                    "metric-warning": rasberry.disk_percent >= 70 && rasberry.disk_percent <= 90,
                                    "metric-danger": rasberry.disk_percent > 90,
                                })}
                            >
                                {Number(rasberry.disk_percent).toFixed(1)}%
                            </span>
                        </p>
                        <hr />
                        <p>
                            Temps de Fonctionnement:{" "}
                            {Math.floor(Number(rasberry.uptime) / 3600)}h{" "}
                            {Math.floor((Number(rasberry.uptime) % 3600) / 60)}m
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}