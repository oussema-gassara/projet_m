import { useState, useEffect } from "react";
import clsx from "clsx";
import SystemStatus from "./SystemStatus.jsx";

const getLevel = (value, warnAt, dangerAt) => {
    if (value >= dangerAt) return "danger";
    if (value >= warnAt) return "warning";
    return "good";
};

export default function SystemControl() {
    const [system, setSystem] = useState(null);

    useEffect(() => {
        const getSystem = () => {
            fetch("http://localhost:3000/api/system")
                .then((res) => res.json())
                .then((data) => setSystem(data))
                .catch((err) => console.error(err));
        };

        getSystem();

        const interval = setInterval(getSystem, 2000);

        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <div className="system-status">
                <SystemStatus system={system} />
            </div>
            <div className="system-control">
                <h2>System Control</h2>
                <hr />

                {!system ? (
                    <p>Loading system data…</p>
                ) : (
                    <>
                        {(() => {
                            const temp = Number(system.cpu_temperature);
                            const level = getLevel(temp, 60, 80);
                            return (
                                <p>
                                    CPU Temperature:{" "}
                                    <span
                                        className={clsx("metric-value", {
                                            "metric-good": level === "good",
                                            "metric-warning": level === "warning",
                                            "metric-danger": level === "danger",
                                        })}
                                    >
                                        {temp.toFixed(2)} °C
                                    </span>
                                </p>
                            );
                        })()}

                        <hr />

                        <p>Total RAM: {(system.total_ram / 1024).toFixed(2)} KB</p>
                        <p>Free RAM: {(system.free_ram / 1024).toFixed(2)} KB</p>
                        <p>Used RAM: {(system.used_ram / 1024).toFixed(2)} KB</p>
                        <p>Minimum Free RAM: {(system.minimum_free_ram / 1024).toFixed(2)} KB</p>

                        {(() => {
                            const usedPct = Math.round((system.used_ram / system.total_ram) * 100);
                            const level = getLevel(usedPct, 70, 90);
                            return (
                                <p>
                                    Used RAM Percentage:{" "}
                                    <span
                                        className={clsx("metric-value", {
                                            "metric-good": level === "good",
                                            "metric-warning": level === "warning",
                                            "metric-danger": level === "danger",
                                        })}
                                    >
                                        {usedPct} %
                                    </span>
                                </p>
                            );
                        })()}

                        <hr />

                        <p>CPU Frequency: {system.cpu_frequency} MHz</p>
                        <p>CPU Cores: {system.cpu_cores}</p>
                        <p>Active Core: {system.active_core}</p>

                        <hr />

                        <p>Chip Model: {system.chip_model}</p>
                        <p>Chip Revision: {system.chip_revision}</p>

                        <hr />

                        <p>Flash Size: {(system.flash_size / 1024 / 1024).toFixed(2)} MB</p>
                        <p>Sketch Size: {(system.sketch_size / 1024 / 1024).toFixed(2)} MB</p>

                        <hr />

                        <p>SDK Version: {system.sdk_version}</p>

                        <hr />

                        <p>Uptime: {system.uptime} seconds</p>
                        <p>Reconnects: {system.reconnects}</p>

                        <hr />

                        <p>Status: {system.status}</p>
                    </>
                )}
            </div>
        </>
    );
}