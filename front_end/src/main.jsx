import { useState } from "react";
import { Link } from "react-router-dom";
import SystemControl from "./systemControl.jsx";
import SensorControl from "./sensorControl.jsx";
import NetworkControl from "./networkControl.jsx";
//import SystemStatus from "./SystemStatus.jsx";
import Rasberry from "./rasberry.jsx";
import Security from "./security.jsx";
//import "./main.css";
import Ai from "./AiDetection.jsx";
import DangerControl from "./dangerControl.jsx";
import AddNode from "./AddNode.jsx";

export default function Main() {
  const [isAdmin, setIsAdmin] = useState(!!localStorage.getItem("token"));

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    setIsAdmin(false);
  };

  return (
    <>
      <div className="auth-bar">
        {isAdmin ? (
          <button onClick={handleLogout}>Se déconnecter</button>
        ) : (
          <Link to="/login">
            <button>Se connecter</button>
          </Link>
        )}
      </div>

      <h1 style={{ textAlign: 'center', width: '100%' }}>ESP32 Monitoring</h1>
      {/* <SystemStatus className="system-status" /> */}
      <div className="main">

        <SystemControl className="system-control" />
        <SensorControl className="sensor-control" />
        <NetworkControl className="network-control" />
      </div>

      {isAdmin && <AddNode nodeType="esp32" />}

      <h1 style={{ textAlign: 'center', width: '100%' }}>Raspberry Pi Monitoring</h1>
      <div className="rasberry" >

        <Rasberry />
      </div>

      {isAdmin && <AddNode nodeType="raspberry" />}

      <div className="security" >
        <Security />
      </div>
      <div className="danger" >
        <DangerControl />
      </div>
      <div className="ai" >
        <Ai />
      </div>
    </>
  )
}
