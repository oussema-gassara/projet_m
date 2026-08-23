import { useEffect, useState } from "react";
import { fakeNodes } from "./fakeData.js";
import { API_URL } from "../config.js";

export default function NodeList({ nodeType = "esp32", testMode = false, onNodesChange }) {
    const [nodes, setNodes] = useState([]);
    const [error, setError] = useState("");

    const loadNodes = async () => {
        if (testMode) {
            const testNodes = fakeNodes.filter((node) => node.node_type === nodeType);
            setNodes(testNodes);
            onNodesChange?.(testNodes);
            setError("");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/nodes`);

            if (!response.ok) {
                throw new Error("Erreur serveur");
            }

            const data = await response.json();
            const filtered = data.filter((node) => node.node_type === nodeType);

            setNodes(filtered);
            onNodesChange?.(filtered);
            setError("");
        } catch (error) {
            console.error(error);
            setError("Impossible de récupérer les nœuds");
            setNodes([]);
            onNodesChange?.([]);
        }
    };

    useEffect(() => {
        loadNodes();

        if (testMode) return;

        // Automatically detect newly registered nodes.
        const interval = setInterval(loadNodes, 3000);
        return () => clearInterval(interval);
    }, [testMode, nodeType]);

    return (
        <div className="node-list">
            <h2>
                {nodeType === "esp32" ? "Nœuds ESP32" : "Nœuds Raspberry Pi"}
            </h2>

            {error && <p className="metric-danger">{error}</p>}

            {!error && nodes.length === 0 && <p>Aucun nœud enregistré.</p>}

            {nodes.map((node) => (
                <div className="node-card" key={node.id || node.node_name}>
                    <h3>{node.node_name}</h3>
                    <p>Type : {node.node_type}</p>
                    {node.added_at && (
                        <p>
                            Ajouté le : {new Date(node.added_at).toLocaleString()}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
