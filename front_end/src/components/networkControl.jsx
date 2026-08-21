import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeNodeData } from "./fakeData.js";

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

            fetch(`http://localhost:3000/api/network?node_name=${encodeURIComponent(nodeName)}`, {
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
                <h2>Network Control</h2>
                <hr />
                <p>Accès réservé à l'administrateur.</p>
            </div>
        );
    }

    if (!network) {
        return <h2>Loading network data...</h2>;
    }

    return (
        <div className="network-control">
            <h2>Network Control {testMode && "(TEST)"}</h2>
            <hr />

            <p>IP Address: {network.ip_address}</p>
            <hr />
            <p>Wi-Fi Status: {network.wifi_status}</p>
            <hr />

            <p>
                Signal Strength:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": network.wifi_signal >= -60,
                    "metric-warning": network.wifi_signal < -60 && network.wifi_signal >= -80,
                    "metric-danger": network.wifi_signal < -80,
                })}>
                    {network.wifi_signal} dBm
                </span>
            </p>
            <hr />
            <p>Gateway: {network.gateway}</p>
            <hr />
            <p>Subnet: {network.subnet}</p>
            <hr />
            <p>DNS: {network.dns}</p>
            <hr />
            <p>MAC Address: {network.mac_address}</p>
            <hr />
            <p>Hostname: {network.hostname}</p>
        </div>
    );
}
