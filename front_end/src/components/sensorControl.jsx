import { useState, useEffect } from "react";
import clsx from "clsx";
import { fakeSensor } from "./fakeData.js";

export default function SensorControl({ testMode = false }) {
    const [sensor, setSensor] = useState(null);

    useEffect(() => {
        if (testMode) {
            setSensor(fakeSensor);
            return;
        }

        const getSensor = () => {
            fetch("http://localhost:3000/api/sensors")
                .then(res => res.json())
                .then(data => setSensor(data))
                .catch(err => console.error(err));
        };

        getSensor();
        const interval = setInterval(getSensor, 2000);
        return () => clearInterval(interval);
    }, [testMode]);

    if (!sensor) {
        return <h2>Loading sensor data...</h2>;
    }

    return (
        <div className="sensor-control">
            <h2>Sensor Control {testMode && "(TEST)"}</h2>
            <hr />

            <p>
                External Temperature:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": Number(sensor.external_temperature) < 30,
                    "metric-warning": Number(sensor.external_temperature) >= 30 && Number(sensor.external_temperature) <= 40,
                    "metric-danger": Number(sensor.external_temperature) > 40,
                })}>
                    {Number(sensor.external_temperature).toFixed(2)} °C
                </span>
            </p>
            <hr />

            <p>
                Humidity:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": Number(sensor.humidity) === 0,
                    "metric-danger": Number(sensor.humidity) !== 0,
                })}>
                    {Number(sensor.humidity) === 0 ? "Humid environment" : "Dry environment"}
                </span>
            </p>
            <hr />

            <p>
                Gas Level:{" "}
                <span className={clsx("metric-value", {
                    "metric-good": sensor.gas_level < 300,
                    "metric-warning": sensor.gas_level >= 300 && sensor.gas_level <= 600,
                    "metric-danger": sensor.gas_level > 600,
                })}>
                    {sensor.gas_level}
                </span>
            </p>
            <hr />

            <p>Status: {sensor.status}</p>
            <hr />
            <p>Gas Alarm: {sensor.gas_alarm ? "Normal Air" : "Alert: High Gas Level"}</p>
        </div>
    );
}
