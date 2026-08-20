import { useState } from "react";
import { Link } from "react-router-dom";

import Header from "./header.jsx";
import SystemControl from "./systemControl.jsx";
import SensorControl from "./sensorControl.jsx";
import NetworkControl from "./networkControl.jsx";
import Rasberry from "./rasberry.jsx";
import Security from "./security.jsx";
import Ai from "./AiDetection.jsx";
import DangerControl from "./dangerControl.jsx";
import AddNode from "./AddNode.jsx";
import NodeList from "./NodeList.jsx";

export default function Main() {
    const [isAdmin, setIsAdmin] = useState(
        localStorage.getItem("role") === "admin"
    );

    // Dashboard test mode: ON = use fake values, OFF = use real backend data.
    const [testMode, setTestMode] = useState(false);

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
            <NodeList nodeType="esp32" />

            <div className="main">
                <SystemControl testMode={testMode} />
                <SensorControl testMode={testMode} />
                <NetworkControl testMode={testMode} />
            </div>

            {isAdmin && <AddNode nodeType="esp32" />}

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
