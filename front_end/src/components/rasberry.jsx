import { useState, useEffect } from "react";
import RasberryStatus from "./rasberryStatus.jsx";
import clsx from "clsx";

const emptyDiagnosticConfig = {
    ethernet_ip: "",
    ssh_user: "",
    ssh_port: "22",
    ssh_key_path: "",
    server_host: "",
    server_port: "3000",
};

export default function Rasberry({ testMode = false }) {

    const [rasberry, setRasberry] = useState(null);
    const [diagnosticLoading, setDiagnosticLoading] = useState(false);
    const [diagnosticResult, setDiagnosticResult] = useState(null);
    const [diagnosticError, setDiagnosticError] = useState("");

    const [diagnosticConfig, setDiagnosticConfig] = useState(emptyDiagnosticConfig);
    const [configConfigured, setConfigConfigured] = useState(false);
    const [showConfigForm, setShowConfigForm] = useState(false);
    const [configLoading, setConfigLoading] = useState(false);
    const [configMessage, setConfigMessage] = useState("");
    const [configError, setConfigError] = useState("");

    const [installLoading, setInstallLoading] = useState(false);
    const [installResult, setInstallResult] = useState(null);
    const [installError, setInstallError] = useState("");

    const isAdmin = localStorage.getItem("role") === "admin";

    useEffect(() => {

        const getRasberry = () => {

            const token = localStorage.getItem("token");

            fetch("http://localhost:3000/api/pi", {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
                .then(res => res.json())
                .then(data => setRasberry(data))
                .catch(err => console.error(err));

        };

        getRasberry();

        const interval = setInterval(getRasberry, 2000);

        return () => clearInterval(interval);

    }, []);

    useEffect(() => {
        if (testMode || !isAdmin) return;

        const token = localStorage.getItem("token");
        if (!token) return;

        fetch("http://localhost:3000/api/diagnostic/raspberry/config", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || data.error || "Impossible de charger la configuration Raspberry Pi.");
                }
                return data;
            })
            .then((data) => {
                setDiagnosticConfig({
                    ethernet_ip: data.ethernet_ip || "",
                    ssh_user: data.ssh_user || "",
                    ssh_port: data.ssh_port || "22",
                    ssh_key_path: data.ssh_key_path || "",
                    server_host: data.server_host || "",
                    server_port: data.server_port || "3000",
                });
                setConfigConfigured(Boolean(data.configured));
            })
            .catch((error) => {
                console.error(error);
                setConfigError(error.message);
            });
    }, [testMode, isAdmin]);

    const handleConfigChange = (event) => {
        const { name, value } = event.target;
        setDiagnosticConfig((current) => ({
            ...current,
            [name]: value,
        }));
    };

    const handleSaveDiagnosticConfig = async (event) => {
        event.preventDefault();
        if (configLoading) return;

        setConfigLoading(true);
        setConfigMessage("");
        setConfigError("");

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:3000/api/diagnostic/raspberry/config",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(diagnosticConfig),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || data.error || "Impossible d'enregistrer la configuration Raspberry Pi."
                );
            }

            setConfigConfigured(true);
            setShowConfigForm(false);
            setConfigMessage("Configuration Raspberry Pi enregistrée.");
            setInstallResult(null);
            setInstallError("");
        } catch (error) {
            console.error(error);
            setConfigError(error.message);
        } finally {
            setConfigLoading(false);
        }
    };

    const handleInstall = async () => {
        if (installLoading) return;

        if (!configConfigured) {
            setInstallError("Enregistrez d'abord la configuration SSH / Ethernet.");
            return;
        }

        setInstallLoading(true);
        setInstallResult(null);
        setInstallError("");

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                "http://localhost:3000/api/raspberry/install",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        node_name: rasberry?.node_name || "raspberry-1",
                    }),
                }
            );

            const data = await response.json();
            setInstallResult(data);

            if (!response.ok) {
                throw new Error(
                    data.message || "Impossible d'installer automatiquement l'agent Raspberry Pi."
                );
            }
        } catch (error) {
            console.error(error);
            setInstallError(
                error.message || "Installation automatique du Raspberry Pi impossible."
            );
        } finally {
            setInstallLoading(false);
        }
    };

    const handleDiagnostic = async () => {
        if (diagnosticLoading) return;

        setDiagnosticLoading(true);
        setDiagnosticResult(null);
        setDiagnosticError("");

        try {
            const response = await fetch(
                "http://localhost:3000/api/diagnostic/raspberry",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node_name: rasberry?.node_name || "raspberry-1",
                        test_mode: testMode,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Impossible de lancer le diagnostic Raspberry Pi."
                );
            }

            setDiagnosticResult(data);
        } catch (error) {
            console.error(error);
            setDiagnosticError(
                error.message || "Impossible de contacter le service de diagnostic."
            );
        } finally {
            setDiagnosticLoading(false);
        }
    };

    const createdAt = rasberry?.created_at
        ? new Date(rasberry.created_at).getTime()
        : NaN;
    const rasberryOnline =
        Number.isFinite(createdAt) && Date.now() - createdAt < 10000;

    return (
        <>
            {!testMode && isAdmin && (
                <section
                    style={{
                        border: "1px solid #ccc",
                        borderRadius: "10px",
                        padding: "15px",
                        marginBottom: "15px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "10px",
                            flexWrap: "wrap",
                        }}
                    >
                        <h2 style={{ margin: 0 }}>
                            Configuration du Raspberry Pi
                        </h2>

                        <button
                            type="button"
                            className="setup-secondary-button"
                            onClick={() => {
                                setShowConfigForm((current) => !current);
                                setConfigMessage("");
                                setConfigError("");
                            }}
                            style={{
                                borderRadius: "10px",
                                padding: "8px 14px",
                                cursor: "pointer",
                                fontWeight: "bold",
                            }}
                        >
                            {showConfigForm
                                ? "Masquer la configuration"
                                : "Afficher la configuration"}
                        </button>
                    </div>

                    {!showConfigForm && (
                        <p className={configConfigured ? "metric-good" : "metric-warning"}>
                            {configConfigured
                                ? "Configuration SSH / Ethernet enregistrée."
                                : "Configuration SSH / Ethernet non enregistrée."}
                        </p>
                    )}

                    {showConfigForm && (
                        <form onSubmit={handleSaveDiagnosticConfig} style={{ marginTop: "15px" }}>
                            <p>
                                Ces informations servent à l'installation automatique et au diagnostic SSH via Ethernet.
                            </p>

                            <label>
                                IP Ethernet du Raspberry Pi
                                <input
                                    type="text"
                                    name="ethernet_ip"
                                    value={diagnosticConfig.ethernet_ip}
                                    onChange={handleConfigChange}
                                    placeholder="192.168.1.25"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <label>
                                Utilisateur SSH
                                <input
                                    type="text"
                                    name="ssh_user"
                                    value={diagnosticConfig.ssh_user}
                                    onChange={handleConfigChange}
                                    placeholder="pi"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <label>
                                Port SSH
                                <input
                                    type="number"
                                    name="ssh_port"
                                    value={diagnosticConfig.ssh_port}
                                    onChange={handleConfigChange}
                                    min="1"
                                    max="65535"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <label>
                                Chemin de la clé SSH privée sur le PC
                                <input
                                    type="text"
                                    name="ssh_key_path"
                                    value={diagnosticConfig.ssh_key_path}
                                    onChange={handleConfigChange}
                                    placeholder="C:/Users/VotreNom/.ssh/id_ed25519"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <label>
                                Adresse IP du PC / serveur de monitoring
                                <input
                                    type="text"
                                    name="server_host"
                                    value={diagnosticConfig.server_host}
                                    onChange={handleConfigChange}
                                    placeholder="192.168.1.10"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <label>
                                Port du serveur
                                <input
                                    type="number"
                                    name="server_port"
                                    value={diagnosticConfig.server_port}
                                    onChange={handleConfigChange}
                                    min="1"
                                    max="65535"
                                    required
                                    style={{ display: "block", width: "100%", margin: "5px 0 12px", borderRadius: "10px" }}
                                />
                            </label>

                            <button
                                type="submit"
                                className="setup-yes-button"
                                disabled={configLoading}
                                style={{ borderRadius: "10px" }}
                            >
                                {configLoading ? "Enregistrement..." : "Enregistrer la configuration"}
                            </button>
                        </form>
                    )}

                    {configMessage && (
                        <p className="metric-good">{configMessage}</p>
                    )}

                    {configError && (
                        <p className="metric-danger">{configError}</p>
                    )}

                    {configConfigured && (
                        <div
                            style={{
                                marginTop: "18px",
                                paddingTop: "15px",
                                borderTop: "1px solid #ccc",
                            }}
                        >
                            <h3>Installation automatique de l'agent</h3>
                            <p>
                                Le backend se connecte en SSH, installe l'agent dans
                                <strong> /opt/iot-monitoring</strong> et crée un service systemd qui démarre automatiquement avec le Raspberry Pi.
                            </p>

                            <button
                                type="button"
                                className="setup-yes-button"
                                onClick={handleInstall}
                                disabled={installLoading}
                                style={{ borderRadius: "10px" }}
                            >
                                {installLoading
                                    ? "Installation en cours..."
                                    : "Connecter et installer le Raspberry Pi"}
                            </button>

                            {installResult?.steps && (
                                <div style={{ marginTop: "15px" }}>
                                    {installResult.steps.map((step) => (
                                        <p
                                            key={step.id}
                                            className={step.ok ? "metric-good" : "metric-warning"}
                                            style={{ margin: "6px 0" }}
                                        >
                                            {step.ok ? "✅" : "○"} {step.label}
                                        </p>
                                    ))}
                                </div>
                            )}

                            {installResult?.installed && (
                                <>
                                    <p className="metric-good">
                                        Agent installé : {installResult.agent_path}
                                    </p>
                                    <p className="metric-good">
                                        Service automatique : {installResult.service}
                                    </p>
                                </>
                            )}

                            {installResult?.installed && !rasberryOnline && (
                                <p className="metric-warning">
                                    Installation terminée. En attente des premières données du Raspberry Pi...
                                </p>
                            )}

                            {rasberryOnline && (
                                <p className="metric-good" style={{ fontWeight: "bold" }}>
                                    ✅ System Availability: Online — les données arrivent automatiquement dans le dashboard.
                                </p>
                            )}

                            {installError && (
                                <p className="metric-danger">{installError}</p>
                            )}
                        </div>
                    )}
                </section>
            )}

            <div className="rasberry-main">
                <div className="rasberry-status">
                    <RasberryStatus
                        rasberry={rasberry}
                        onDiagnostic={handleDiagnostic}
                        diagnosticLoading={diagnosticLoading}
                        diagnosticResult={diagnosticResult}
                        diagnosticError={diagnosticError}
                    />
                </div>
                <div className="rasberry-control">
                    <h2>Rasberry Pi Control</h2>
                    <hr />

                    {!rasberry ? (
                        <p>Loading rasberry data...</p>
                    ) : (
                        <>
                            {rasberry.ip_address && (
                                <>
                                    <p>Adresse Ip: {rasberry.ip_address}</p>
                                    <hr />
                                </>
                            )}
                            {rasberry.mac_address && (
                                <>
                                    <p>Adresse Mac: {rasberry.mac_address}</p>
                                    <hr />
                                </>
                            )}
                            <p>
                                Statut Wi-Fi: {rasberry.wifi_status}
                            </p>
                            <hr />
                            <p>
                                Temperature Du Processeur:{" "}
                                <span
                                    className={clsx("metric-value", {
                                        "metric-good": rasberry.cpu_temperature < 60,
                                        "metric-warning": rasberry.cpu_temperature >= 60 && rasberry.cpu_temperature <= 80,
                                        "metric-danger": rasberry.cpu_temperature > 80,
                                    })}
                                >
                                    {Number(rasberry.cpu_temperature).toFixed(2)}°C
                                </span>
                            </p>
                            <hr />
                            <p>
                                Utilisation Du Processeur:{" "}
                                {Number(rasberry.cpu_usage_percent).toFixed(1)}%
                            </p>
                            <hr />
                            <p>
                                RAM Totale:{" "}
                                {(rasberry.total_ram / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <hr />
                            <p>
                                RAM Libre:{" "}
                                {(rasberry.free_ram / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <hr />
                            <p>
                                RAM Utilisée:{" "}
                                {(rasberry.used_ram / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <hr />
                            <p>
                                Utilisation de Ram:{" "}
                                <span
                                    className={clsx("metric-value", {
                                        "metric-good": rasberry.used_ram_percent < 70,
                                        "metric-warning": rasberry.used_ram_percent >= 70 && rasberry.used_ram_percent <= 90,
                                        "metric-danger": rasberry.used_ram_percent > 90,
                                    })}
                                >
                                    {Number(rasberry.used_ram_percent).toFixed(1)}%
                                </span>
                            </p>
                            <hr />
                            <p>
                                Disque Total:{" "}
                                {(rasberry.disk_total / 1024 / 1024 / 1024).toFixed(2)} GB
                            </p>
                            <hr />
                            <p>
                                Disque Utilisé:{" "}
                                {(rasberry.disk_used / 1024 / 1024 / 1024).toFixed(2)} GB
                            </p>
                            <hr />
                            <p>
                                Disque Libre:{" "}
                                {(rasberry.disk_free / 1024 / 1024 / 1024).toFixed(2)} GB
                            </p>
                            <hr />
                            <p>
                                Utilisation du Disque:{" "}
                                <span
                                    className={clsx("metric-value", {
                                        "metric-good": rasberry.disk_percent < 70,
                                        "metric-warning": rasberry.disk_percent >= 70 && rasberry.disk_percent <= 90,
                                        "metric-danger": rasberry.disk_percent > 90,
                                    })}
                                >
                                    {Number(rasberry.disk_percent).toFixed(1)}%
                                </span>
                            </p>
                            <hr />
                            <p>
                                Temps de Fonctionnement:{" "}
                                {Math.floor(Number(rasberry.uptime) / 3600)}h{" "}
                                {Math.floor((Number(rasberry.uptime) % 3600) / 60)}m
                            </p>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
