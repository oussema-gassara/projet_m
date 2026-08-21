import SystemControl from "./systemControl.jsx";
import SensorControl from "./sensorControl.jsx";
import NetworkControl from "./networkControl.jsx";

export default function EspNodeCard({ nodeName, testMode = false }) {
    return (
        <div className="esp-node-card">
            <h2 className="esp-node-title">{nodeName}</h2>

            <div className="main">
                <SystemControl nodeName={nodeName} testMode={testMode} />
                <SensorControl nodeName={nodeName} testMode={testMode} />
                <NetworkControl nodeName={nodeName} testMode={testMode} />
            </div>
        </div>
    );
}
