import SystemControl from "./systemControl.jsx";
import SensorControl from "./sensorControl.jsx";
import NetworkControl from "./networkControl.jsx";

export default function EspNodeCard({ node, testMode = false, onRemove }) {
    const nodeName = node.node_name;

    return (
        <div className="esp-node-card">
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

            <div className="main">
                <SystemControl nodeName={nodeName} testMode={testMode} />
                <SensorControl nodeName={nodeName} testMode={testMode} />
                <NetworkControl nodeName={nodeName} testMode={testMode} />
            </div>
        </div>
    );
}
