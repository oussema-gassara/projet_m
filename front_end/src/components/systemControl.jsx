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

    useEffect(() => {
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

    return (
        <>
            <div className="system-status">
                <SystemStatus system={system} />
            </div>
            <div className="system-control">
                <h2>System Control {testMode && "(TEST)"}</h2>
                <hr />

                {!system ? (
                    <p>Loading system data…</p>
                ) : (
                    <>
                        {(() => {
                            const temp = numberOrNull(system.cpu_temperature);
                            const level = getLevel(temp, 60, 80);
                            return (
                                <p>
                                    CPU Temperature:{" "}
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
                        <p>Total RAM: {formatNumber(numberOrNull(system.total_ram) / 1024)} KB</p>
                        <p>Free RAM: {formatNumber(numberOrNull(system.free_ram) / 1024)} KB</p>
                        <p>Used RAM: {formatNumber(numberOrNull(system.used_ram) / 1024)} KB</p>
                        <p>Minimum Free RAM: {formatNumber(numberOrNull(system.minimum_free_ram) / 1024)} KB</p>

                        {(() => {
                            const used = numberOrNull(system.used_ram);
                            const total = numberOrNull(system.total_ram);
                            const usedPct = used !== null && total > 0 ? Math.round((used / total) * 100) : null;
                            const level = getLevel(usedPct, 70, 90);
                            return (
                                <p>
                                    Used RAM Percentage:{" "}
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
                        <p>CPU Frequency: {system.cpu_frequency ?? "—"} MHz</p>
                        <p>CPU Cores: {system.cpu_cores ?? "—"}</p>
                        <p>Active Core: {system.active_core ?? "—"}</p>

                        <hr />
                        <p>Chip Model: {system.chip_model || "—"}</p>
                        <p>Chip Revision: {system.chip_revision ?? "—"}</p>

                        <hr />
                        <p>Flash Size: {formatNumber(numberOrNull(system.flash_size) / 1024 / 1024)} MB</p>
                        <p>Sketch Size: {formatNumber(numberOrNull(system.sketch_size) / 1024 / 1024)} MB</p>

                        <hr />
                        <p>SDK Version: {system.sdk_version || "—"}</p>

                        <hr />
                        <p>Uptime: {system.uptime ?? "—"} seconds</p>
                        <p>Reconnects: {system.reconnects ?? "—"}</p>

                        <hr />
                        <p>Status: {system.status || "—"}</p>
                    </>
                )}
            </div>
        </>
    );
}
