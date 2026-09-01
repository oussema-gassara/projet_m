import { useState, useEffect } from "react";

export default function RasberryStatus({
  rasberry,
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

  const lastUpdate = rasberry ? new Date(rasberry.created_at) : null;
  const now = new Date();
  const online = lastUpdate ? now - lastUpdate < 10000 : false;

  const checkClass = (value) =>
    value === "OK" ? "metric-good" : "metric-danger";

  return (
    <div className="availability-container-rasberry">
      <div>
        <span className={`status-disc ${online ? "online" : "offline"}`} />
        <span>
          System Availability: {online ? "Online" : "Offline (Problème de connexion)"}
        </span>
      </div>

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
          <strong>{diagnosticResult.message}</strong>
          <p>Simulation : oui</p>
          <p className={checkClass(diagnosticResult.cpu)}>
            CPU : {diagnosticResult.cpu}
          </p>
          <p className={checkClass(diagnosticResult.ram)}>
            RAM : {diagnosticResult.ram}
          </p>
          <p className={checkClass(diagnosticResult.disk)}>
            Disque : {diagnosticResult.disk}
          </p>
          <p className={checkClass(diagnosticResult.network)}>
            Réseau : {diagnosticResult.network}
          </p>
        </div>
      )}
    </div>
  );
}