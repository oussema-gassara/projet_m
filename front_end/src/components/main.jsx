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

    // Vérifier si l'utilisateur connecté est administrateur
    const [isAdmin, setIsAdmin] = useState(
        localStorage.getItem("role") === "admin"
    );

    const handleLogout = () => {

        // Supprimer les informations de connexion
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("role");

        setIsAdmin(false);
    };

    return (
        <>
            <Header />

            {/* ================= AUTH BAR ================= */}

            <div className="auth-bar">

                {isAdmin ? (
                    <>
                        <span>
                            Connecté en tant que :{" "}
                            <span style={{fontWeight: 'bold'}}>
                                {localStorage.getItem("username").toUpperCase()}
                            </span>     
                        </span>

                        <button 
                            style={{marginLeft:'5px',borderRadius:'7px',backgroundColor:'FireBrick',color:'white'}}
                            onClick={handleLogout}>
                            Se déconnecter
                        </button>
                    </>
                ) : (
                    <Link to="/login">
                        <button
                            style={{borderRadius: 7,backgroundColor: 'lightblue'}}
                        >
                            Se connecter
                        </button>
                    </Link>
                )}

            </div>


            {/* ================= ESP32 ================= */}

            <h1
                style={{
                    textAlign: "center",
                    width: "100%",
                }}
            >
                ESP32 Monitoring
            </h1>
            <NodeList nodeType="esp32" />

            <div className="main">

                <SystemControl
                    className="system-control"
                />

                <SensorControl
                    className="sensor-control"
                />

                <NetworkControl
                    className="network-control"
                />

            </div>


            {/* ================= ADD ESP32 ================= */}

            {isAdmin && (
                <AddNode nodeType="esp32" />
            )}


            {/* ================= RASPBERRY PI ================= */}

            <h1
                style={{
                    textAlign: "center",
                    width: "100%",
                }}
            >
                Raspberry Pi Monitoring
            </h1>

            <div className="rasberry">
                <Rasberry />
            </div>


            {/* ================= ADD RASPBERRY ================= */}

            {isAdmin && (
                <AddNode nodeType="raspberry" />
            )}


            {/* ================= SECURITY ================= */}

            <div className="security">
                <Security />
            </div>


            {/* ================= DANGER ================= */}

            <div className="danger">
                <DangerControl />
            </div>


            {/* ================= AI ================= */}

            <div className="ai">
                <Ai />
            </div>

        </>
    );
}