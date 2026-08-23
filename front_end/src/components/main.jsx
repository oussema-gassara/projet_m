import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

import Header from "./header.jsx";
import EspNodeCard from "./EspNodeCard.jsx";
import Rasberry from "./rasberry.jsx";
import Security from "./security.jsx";
import Ai from "./AiDetection.jsx";
import Prediction from "./Prediction.jsx";
import DangerControl from "./dangerControl.jsx";
import AddNode from "./AddNode.jsx";
import { fakeNodes } from "./fakeData.js";
import { API_URL } from "../config.js";

export default function Main() {
    const [isAdmin, setIsAdmin] = useState(
        localStorage.getItem("role") === "admin"
    );

    const [testMode, setTestMode] = useState(false);
    const [nodes, setNodes] = useState([]);
    const [nodesError, setNodesError] = useState("");

    const espNodes = nodes.filter((n) => n.node_type === "esp32");
    const piNodes = nodes.filter((n) => n.node_type === "raspberry");

    const loadNodes = useCallback(async () => {
        if (testMode) {
            setNodes(fakeNodes);
            setNodesError("");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/nodes`);

            if (!response.ok) {
                throw new Error("Erreur serveur");
            }

            const data = await response.json();
            setNodes(data);
            setNodesError("");
        } catch (error) {
            console.error(error);
            setNodesError("Impossible de récupérer les nœuds");
        }
    }, [testMode]);

    useEffect(() => {
        loadNodes();

        if (testMode) return;

        const interval = setInterval(loadNodes, 3000);
        return () => clearInterval(interval);
    }, [loadNodes, testMode]);

    const handleRemoveNode = async (node) => {
        const confirmed = window.confirm(
            `Voulez-vous supprimer le nœud ${node.node_name} ?`
        );

        if (!confirmed) return;

        if (testMode) {
            setNodes((current) =>
                current.filter((item) => item.node_name !== node.node_name)
            );
            return;
        }

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/nodes/${node.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Erreur lors de la suppression");
            }

            setNodes((current) =>
                current.filter((item) => item.id !== node.id)
            );
        } catch (error) {
            console.error(error);
            setNodesError(error.message || "Impossible de supprimer le nœud");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("role");
        setIsAdmin(false);
    };

    return (
        <>
            <Header />

            <div className="auth-bar">
                {isAdmin ? (
                    <>
                        <span>
                            Connecté en tant que:{" "}
                            <span style={{ fontWeight: "bold" }}>
                                {localStorage.getItem("username").toUpperCase()}
                            </span>
                        </span>
                        <button
                            style={{ marginLeft: "5px", borderRadius: "7px", backgroundColor: "FireBrick", color: "white" }}
                            onClick={handleLogout}
                        >
                            Se déconnecter
                        </button>
                    </>
                ) : (
                    <Link to="/login">
                        <button style={{ borderRadius: 7, backgroundColor: "lightblue" }}>
                            Se connecter
                        </button>
                    </Link>
                )}
            </div>

            <div style={{ textAlign: "center", margin: "15px 0" }}>
                <button
                    onClick={() => setTestMode((current) => !current)}
                    style={{
                        padding: "8px 14px",
                        borderRadius: "7px",
                        cursor: "pointer",
                        fontWeight: "bold",
                    }}
                >
                    MODE TEST : {testMode ? "ACTIVÉ" : "DÉSACTIVÉ"}
                </button>
                <p style={{ margin: "6px 0" }}>
                    {testMode
                        ? "Utilisation de valeurs de surveillance simulées"
                        : "Utilisation des données réelles des ESP32 et du serveur"}
                </p>
            </div>

            <h1 style={{ textAlign: "center", width: "100%" }}>
                Surveillance des ESP32
            </h1>

            {nodesError && <p className="metric-danger">{nodesError}</p>}

            {!nodesError && espNodes.length === 0 && (
                <p style={{ textAlign: "center" }}>Aucun nœud ESP32 enregistré.</p>
            )}

            <div className="esp-nodes-container">
                {espNodes.map((node) => (
                    <EspNodeCard
                        key={node.id || node.node_name}
                        node={node}
                        testMode={testMode}
                        onRemove={isAdmin ? handleRemoveNode : undefined}
                    />
                ))}
            </div>

            {isAdmin && <AddNode nodeType="esp32" onAdded={loadNodes} />}

            <h1 style={{ textAlign: "center", width: "100%" }}>
                Surveillance des Raspberry Pi
            </h1>

            {!nodesError && piNodes.length === 0 && (
                <p style={{ textAlign: "center" }}>Aucun nœud Raspberry Pi enregistré.</p>
            )}

            <div className="rasberry-nodes-container">
                {piNodes.map((node) => (
                    <Rasberry
                        key={node.id || node.node_name}
                        node={node}
                        testMode={testMode}
                        onRemove={isAdmin ? handleRemoveNode : undefined}
                    />
                ))}
            </div>

            {isAdmin && <AddNode nodeType="raspberry" onAdded={loadNodes} />}

            <div className="security">
                <Security />
            </div>

            <div className="danger">
                <DangerControl />
            </div>

            <div className="ai">
                <Ai
                    testMode={testMode}
                    testNodes={espNodes}
                />
            </div>

            <div className="prediction">
                <Prediction
                    testMode={testMode}
                    testNodes={espNodes}
                />
            </div>
        </>
    );
}
