import { useState, useEffect } from "react";
import RasberryStatus from "./rasberryStatus.jsx";
import clsx from "clsx";
import { API_URL } from "../config.js";
import { fakeNodeData } from "./fakeData.js";

export default function Rasberry({ node, testMode = false, onRemove }) {

    const nodeName = node.node_name;

    const [rasberry, setRasberry] = useState(null);

    useEffect(() => {

        if (testMode) {
            setRasberry(fakeNodeData[nodeName]?.pi || null);
            return;
        }

        const getRasberry = () => {

            const token = localStorage.getItem("token");

            fetch(`${API_URL}/api/pi?node_name=${encodeURIComponent(nodeName)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
                .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Erreur serveur"))))
                .then(data => setRasberry(data || null))
                .catch(err => console.error(err));

        };

        getRasberry();

        const interval = setInterval(getRasberry, 2000);

        return () => clearInterval(interval);

    }, [nodeName, testMode]);

    return (
        <div className="rasberry-main">
            <div className="rasberry-status">
                <RasberryStatus rasberry={rasberry} />
            </div>
            <div className="rasberry-control">
                <div className="esp-node-header">
                    <h2 className="esp-node-title">{nodeName}</h2>

                    {onRemove && (
                        <button
                            className="remove-node-button"
                            onClick={() => onRemove(node)}
                            type="button"
                        >
                            Supprimer
                        </button>
                    )}
                </div>
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