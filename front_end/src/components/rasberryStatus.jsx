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

  const checkClass = (value) => {
    if (value === "OK") return "metric-good";
    if (value === "WARNING" || value === "DISCONNECTED" || value === "UNKNOWN") {
      return "metric-warning";
    }
    return "metric-danger";
  };

  const serverLabel = (value) => {
    if (value === true) return "OK";
    if (value === false) return "ERROR";
    return "UNKNOWN";
  };

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

          <p>
            Mode : {diagnosticResult.simulation ? "simulation" : "diagnostic SSH réel"}
          </p>

          {diagnosticResult.target_ip && (
            <p>IP Ethernet ciblée : {diagnosticResult.target_ip}</p>
          )}

          <p className={checkClass(diagnosticResult.ssh)}>
            SSH : {diagnosticResult.ssh || "UNKNOWN"}
          </p>

          <p className={checkClass(diagnosticResult.ethernet)}>
            Ethernet : {diagnosticResult.ethernet || "UNKNOWN"}
          </p>

          <p className={checkClass(diagnosticResult.wifi)}>
            Wi-Fi : {diagnosticResult.wifi || "UNKNOWN"}
          </p>

          <p className={checkClass(diagnosticResult.cpu)}>
            CPU : {diagnosticResult.cpu || "UNKNOWN"}
            {diagnosticResult.cpu_temperature != null
              ? ` (${Number(diagnosticResult.cpu_temperature).toFixed(1)} °C)`
              : ""}
          </p>

          <p className={checkClass(diagnosticResult.ram)}>
            RAM : {diagnosticResult.ram || "UNKNOWN"}
            {diagnosticResult.ram_percent != null
              ? ` (${Number(diagnosticResult.ram_percent).toFixed(1)} %)`
              : ""}
          </p>

          <p className={checkClass(diagnosticResult.disk)}>
            Disque : {diagnosticResult.disk || "UNKNOWN"}
            {diagnosticResult.disk_percent != null
              ? ` (${Number(diagnosticResult.disk_percent).toFixed(1)} %)`
              : ""}
          </p>

          <p className={checkClass(serverLabel(diagnosticResult.server_reachable))}>
            Serveur : {serverLabel(diagnosticResult.server_reachable)}
          </p>

          {diagnosticResult.wifi === "HARDWARE_ERROR" && (
            <p className="metric-danger">
              L&apos;interface wlan0 est absente. Elle peut être désactivée ou présenter une défaillance matérielle.
            </p>
          )}

          {diagnosticResult.wifi === "DISCONNECTED" && (
            <p className="metric-warning">
              L&apos;interface Wi-Fi existe mais elle n&apos;est pas connectée. Le diagnostic continue via Ethernet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}