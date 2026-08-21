import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import Header from "./header.jsx";
import EspNodeCard from "./EspNodeCard.jsx";
import Rasberry from "./rasberry.jsx";
import Security from "./security.jsx";
import Ai from "./AiDetection.jsx";
import DangerControl from "./dangerControl.jsx";
import AddNode from "./AddNode.jsx";
import { fakeNodes } from "./fakeData.js";

export default function Main() {
    const [isAdmin, setIsAdmin] = useState(
        localStorage.getItem("role") === "admin"
    );

    // Dashboard test mode: ON = use fake values, OFF = use real backend data.
    const [testMode, setTestMode] = useState(false);

    const [espNodes, setEspNodes] = useState([]);
    const [nodesError, setNodesError] = useState("");

    const loadNodes = () => {
        if (testMode) {
            setEspNodes(fakeNodes.filter((n) => n.node_type === "esp32"));
            setNodesError("");
            return;
        }

        fetch("http://localhost:3000/api/nodes")
            .then((res) => {
                if (!res.ok) throw new Error("Erreur serveur");
                return res.json();
            })
            .then((data) => {
                setEspNodes(data.filter((n) => n.node_type === "esp32"));
                setNodesError("");
            })
            .catch((err) => {
                console.error(err);
                setNodesError("Impossible de récupérer les nœuds");
            });
    };

    useEffect(() => {
        loadNodes();
    }, [testMode]);

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
                    TEST MODE: {testMode ? "ON" : "OFF"}
                </button>
                <p style={{ margin: "6px 0" }}>
                    {testMode
                        ? "Using fake monitoring values"
                        : "Using real ESP32/backend data"}
                </p>
            </div>

            <h1 style={{ textAlign: "center", width: "100%" }}>
                ESP32 Monitoring
            </h1>

            {nodesError && <p className="metric-danger">{nodesError}</p>}

            {!nodesError && espNodes.length === 0 && (
                <p style={{ textAlign: "center" }}>Aucun nœud ESP32 enregistré.</p>
            )}

            {espNodes.map((node) => (
                <EspNodeCard
                    key={node.id}
                    nodeName={node.node_name}
                    testMode={testMode}
                />
            ))}

            {isAdmin && <AddNode nodeType="esp32" onAdded={loadNodes} />}

            <h1 style={{ textAlign: "center", width: "100%" }}>
                Raspberry Pi Monitoring
            </h1>

            <div className="rasberry">
                <Rasberry />
            </div>

            {isAdmin && <AddNode nodeType="raspberry" />}

            <div className="security">
                <Security />
            </div>

            <div className="danger">
                <DangerControl />
            </div>

            <div className="ai">
                <Ai />
            </div>
        </>
    );
}
