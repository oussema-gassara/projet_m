import { useState, useEffect } from "react";

export default function SystemStatus({ system }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const lastUpdate = system ? new Date(system.created_at) : null;
  const now = new Date();
  const online = lastUpdate ? now - lastUpdate < 10000 : false;

  return (
    <div className="availability-container">
      <span
        className={`status-disc ${online ? "online" : "offline"}`}
      />

      <span>
        System Availability:{" "}
        {online ? (
          "Online"
        ) : (
          <>
            <span>Offline (Problème de connexion)</span>
            <p>
              Connectez-vous au réseau ESP32-SETUP et entrez votre SSID et
              votre mot de passe sous ce lien : <a href="http://192.168.4.1" target="_blank" rel="noopener noreferrer">http://192.168.4.1</a>
            </p>
          </>
        )}
      </span>
    </div>
  );
}