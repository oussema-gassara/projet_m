import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeNodeData } from "./fakeData.js";

const numberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

export default function SensorControl({ nodeName = "esp32-1", testMode = false }) {
    const [sensor, setSensor] = useState(null);

    useEffect(() => {
        if (testMode) {
            setSensor(fakeNodeData[nodeName]?.sensor || null);
            return;
        }

        const getSensor = () => {
            fetch(`http://localhost:3000/api/sensors?node_name=${encodeURIComponent(nodeName)}`)
                .then(res => res.json())
                .then(data => setSensor(data))
                .catch(err => console.error(err));
        };

        getSensor();
        const interval = setInterval(getSensor, 2000);
        return () => clearInterval(interval);
    }, [testMode, nodeName]);

    if (!sensor) {
        return <h2>Loading sensor data...</h2>;
    }

    const externalTemp = numberOrNull(sensor.external_temperature);
    const gasLevel = numberOrNull(sensor.gas_level);
    const humidity = numberOrNull(sensor.humidity);

    // ESP32 humidity encoding: 0 = Humid environment, 1 = Dry environment.
    const isDry = humidity === 1;

    return (
        <div className="sensor-control">
            <h2>Sensor Control {testMode && "(TEST)"}</h2>
            <hr />

            <p>
                External Temperature:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": externalTemp !== null && externalTemp < 30,
                    "metric-warning": externalTemp !== null && externalTemp >= 30 && externalTemp <= 40,
                    "metric-danger": externalTemp !== null && externalTemp > 40,
                })}>
                    {externalTemp === null ? "—" : `${externalTemp.toFixed(2)} °C`}
                </span>
            </p>
            <hr />

            <p>
                Humidity:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": !isDry,
                    "metric-danger": isDry,
                })}>
                    {humidity === null ? "—" : isDry ? "Dry environment" : "Humid environment"}
                </span>
            </p>
            <hr />

            <p>
                Gas Level:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": gasLevel !== null && gasLevel < 300,
                    "metric-warning": gasLevel !== null && gasLevel >= 300 && gasLevel <= 600,
                    "metric-danger": gasLevel !== null && gasLevel > 600,
                })}>
                    {gasLevel === null ? "—" : gasLevel}
                </span>
            </p>
            <hr />

            <p>Status: {sensor.status || "—"}</p>
            <hr />
            <p>
                Gas Alarm: {sensor.gas_alarm === undefined || sensor.gas_alarm === null
                    ? "—"
                    : Number(sensor.gas_alarm) ? "Normal Air" : "Alert: High Gas Level"}
            </p>
        </div>
    );
}
