import { useState, useEffect } from "react";

export default function SystemStatus({ system, onDiagnostic }) {
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

      <div className="availability-content">
        <span>
          System Availability: {online ? "Online" : "Offline (Problème de connexion)"}
        </span>

        {!online && (
          <>
            <p className="setup-hint">
              Si la carte n&apos;est pas encore configurée, connectez-vous au réseau
              ESP32-SETUP puis ouvrez http://192.168.4.1 pour saisir le SSID et le
              mot de passe Wi-Fi.
            </p>

            <button
              type="button"
              className="diagnostic-button"
              onClick={onDiagnostic}
            >
              Lancer le diagnostic
            </button>
          </>
        )}
      </div>
    </div>
  );
}
