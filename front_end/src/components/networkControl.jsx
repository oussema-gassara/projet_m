import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeNodeData } from "./fakeData.js";
import { API_URL } from "../config.js";

export default function NetworkControl({ nodeName = "esp32-1", testMode = false }) {
    const [network, setNetwork] = useState(null);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        if (testMode) {
            setDenied(false);
            setNetwork(fakeNodeData[nodeName]?.network || null);
            return;
        }

        const getNetwork = () => {
            const token = localStorage.getItem("token");

            fetch(`${API_URL}/api/network?node_name=${encodeURIComponent(nodeName)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
                .then((res) => {
                    if (res.status === 401 || res.status === 403) {
                        setDenied(true);
                        return null;
                    }
                    setDenied(false);
                    return res.json();
                })
                .then((data) => {
                    if (data) setNetwork(data);
                })
                .catch(err => console.error(err));
        };

        getNetwork();
        const interval = setInterval(getNetwork, 2000);
        return () => clearInterval(interval);
    }, [testMode, nodeName]);

    if (denied) {
        return (
            <div className="network-control">
                <h2>Contrôle réseau</h2>
                <hr />
                <p>Accès réservé à l'administrateur.</p>
            </div>
        );
    }

    if (!network) {
        return <h2>Chargement des données réseau...</h2>;
    }

    return (
        <div className="network-control">
            <h2>Contrôle réseau {testMode && "(TEST)"}</h2>
            <hr />

            <p>Adresse IP : {network.ip_address}</p>
            <hr />
            <p>État du Wi-Fi : {network.wifi_status}</p>
            <hr />

            <p>
                Puissance du signal :{" "}
                <span className={clsx("metric-value", {
                    "metric-good": network.wifi_signal >= -60,
                    "metric-warning": network.wifi_signal < -60 && network.wifi_signal >= -80,
                    "metric-danger": network.wifi_signal < -80,
                })}>
                    {network.wifi_signal} dBm
                </span>
            </p>
            <hr />
            <p>Passerelle : {network.gateway}</p>
            <hr />
            <p>Sous-réseau : {network.subnet}</p>
            <hr />
            <p>DNS : {network.dns}</p>
            <hr />
            <p>Adresse MAC : {network.mac_address}</p>
            <hr />
            <p>Nom d'hôte : {network.hostname}</p>
        </div>
    );
}
