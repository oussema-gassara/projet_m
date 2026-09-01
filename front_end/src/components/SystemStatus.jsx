import { useState, useEffect } from "react";

export default function SystemStatus({
  system,
  onDiagnostic,
  diagnosticLoading = false,
  diagnosticResult = null,
  diagnosticError = "",
}) {
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
          <button
            type="button"
            className="diagnostic-button"
            onClick={onDiagnostic}
            disabled={diagnosticLoading || !onDiagnostic}
          >
            {diagnosticLoading ? "Diagnostic en cours..." : "Lancer le diagnostic"}
          </button>
        )}

        {diagnosticError && (
          <div className="diagnostic-result diagnostic-result-error">
            {diagnosticError}
          </div>
        )}

        {diagnosticResult && (
          <div
            className={`diagnostic-result ${
              diagnosticResult.severity === "OK"
                ? "diagnostic-result-ok"
                : "diagnostic-result-warning"
            }`}
          >
            <strong>{diagnosticResult.message || "Diagnostic terminé."}</strong>
            {diagnosticResult.port && (
              <span>Port détecté : {diagnosticResult.port}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
