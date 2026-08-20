import { useEffect, useState } from "react";
import { fakeNodes } from "./fakeData.js";

export default function NodeList({ nodeType = "esp32", testMode = false }) {
    const [nodes, setNodes] = useState([]);
    const [error, setError] = useState("");

    const loadNodes = async () => {
        try {
            const response = await fetch(
                "http://localhost:3000/api/nodes"
            );

            if (!response.ok) {
                throw new Error("Erreur serveur");
            }

            const data = await response.json();
            setNodes(data);
            setError("");
        } catch (error) {
            console.error(error);
            setError("Impossible de récupérer les nœuds");
        }
    };

    useEffect(() => {
        if (testMode) {
            setNodes(fakeNodes);
            setError("");
            return;
        }

        loadNodes();
    }, [testMode]);

    const filteredNodes = nodes.filter(
        (node) => node.node_type === nodeType
    );

    return (
        <div className="node-list">
            <h2>
                {nodeType === "esp32"
                    ? "Nœuds ESP32"
                    : "Nœuds Raspberry Pi"}
            </h2>

            {error && (
                <p className="metric-danger">
                    {error}
                </p>
            )}

            {!error && filteredNodes.length === 0 && (
                <p>Aucun nœud enregistré.</p>
            )}

            {filteredNodes.map((node) => (
                <div
                    className="node-card"
                    key={node.id}
                >
                    <h3>{node.node_name}</h3>

                    <p>
                        Type : {node.node_type}
                    </p>

                    <p>
                        Ajouté le :{" "}
                        {new Date(node.added_at).toLocaleString()}
                    </p>
                </div>
            ))}
        </div>
    );
}