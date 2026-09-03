const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const requireAuth = require("../middleware/auth");

const router = express.Router();

const CONFIG_PATH = path.resolve(
    __dirname,
    "..",
    "raspberry-diagnostic-config.json"
);
const AGENT_PATH = path.resolve(__dirname, "..", "raspberry_agent.py");

const NODE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const LINUX_USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

let installRunning = false;

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (error) {
        console.error("Unable to read Raspberry install config:", error);
        return {};
    }
}

function validPort(value) {
    return /^\d{1,5}$/.test(String(value || "")) &&
        Number(value) >= 1 &&
        Number(value) <= 65535;
}

function buildService(config, nodeName) {
    const serverUrl = `http://${config.server_host}:${config.server_port}/api/pi/data`;

    return `[Unit]
Description=IoT Monitoring Raspberry Agent
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${config.ssh_user}
Environment="MONITORING_SERVER_URL=${serverUrl}"
Environment="IOT_NODE_NAME=${nodeName}"
ExecStart=/usr/bin/python3 /opt/iot-monitoring/agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

function markerSteps(stdout) {
    const markers = new Set(
        String(stdout || "")
            .split(/\r?\n/)
            .filter((line) => line.startsWith("STEP:"))
            .map((line) => line.slice("STEP:".length).trim())
    );

    return [
        ["ssh", "Connexion SSH"],
        ["sudo", "Droits d'installation"],
        ["directory", "Création du dossier /opt/iot-monitoring"],
        ["agent", "Installation de l'agent Python"],
        ["service", "Création du service systemd"],
        ["enabled", "Activation au démarrage"],
        ["running", "Démarrage de l'agent"],
    ].map(([id, label]) => ({
        id,
        label,
        ok: markers.has(id),
    }));
}

router.post("/raspberry/install", requireAuth, (req, res) => {
    if (req.user?.role !== "admin") {
        return res.status(403).json({
            code: "ADMIN_REQUIRED",
            message: "Seul un administrateur peut installer l'agent Raspberry Pi.",
        });
    }

    if (installRunning) {
        return res.status(409).json({
            code: "RASPBERRY_INSTALL_RUNNING",
            message: "Une installation Raspberry Pi est déjà en cours.",
        });
    }

    const config = loadConfig();
    const nodeName = String(req.body?.node_name || "raspberry-1").trim();

    if (!NODE_NAME_PATTERN.test(nodeName)) {
        return res.status(400).json({
            code: "INVALID_NODE_NAME",
            message: "Nom du Raspberry Pi invalide.",
        });
    }

    if (
        !config.ethernet_ip ||
        !config.ssh_user ||
        !config.ssh_key_path ||
        !config.server_host ||
        !validPort(config.ssh_port || "22") ||
        !validPort(config.server_port || "3000")
    ) {
        return res.status(400).json({
            code: "RASPBERRY_CONFIG_MISSING",
            message: "Enregistrez d'abord la configuration SSH / Ethernet du Raspberry Pi.",
        });
    }

    if (!LINUX_USER_PATTERN.test(config.ssh_user)) {
        return res.status(400).json({
            code: "INVALID_SSH_USER",
            message: "Le nom d'utilisateur SSH n'est pas valide pour l'installation automatique.",
        });
    }

    if (!HOST_PATTERN.test(config.ethernet_ip) || !HOST_PATTERN.test(config.server_host)) {
        return res.status(400).json({
            code: "INVALID_NETWORK_ADDRESS",
            message: "L'adresse Ethernet du Raspberry Pi ou l'adresse du serveur est invalide.",
        });
    }

    if (!fs.existsSync(config.ssh_key_path)) {
        return res.status(400).json({
            code: "SSH_KEY_NOT_FOUND",
            message: "La clé SSH privée configurée est introuvable sur le PC qui exécute le backend.",
        });
    }

    if (!fs.existsSync(AGENT_PATH)) {
        return res.status(500).json({
            code: "RASPBERRY_AGENT_MISSING",
            message: "Le fichier de l'agent Raspberry Pi est introuvable sur le serveur.",
        });
    }

    const agentBase64 = fs.readFileSync(AGENT_PATH).toString("base64");
    const serviceBase64 = Buffer.from(
        buildService(
            {
                ...config,
                ssh_port: String(config.ssh_port || "22"),
                server_port: String(config.server_port || "3000"),
            },
            nodeName
        ),
        "utf8"
    ).toString("base64");

    const remoteCommand = [
        "set -e",
        "echo STEP:ssh",
        "command -v python3 >/dev/null",
        "sudo -n true",
        "echo STEP:sudo",
        "sudo -n mkdir -p /opt/iot-monitoring",
        "echo STEP:directory",
        `printf '%s' '${agentBase64}' | base64 -d | sudo -n tee /opt/iot-monitoring/agent.py >/dev/null`,
        "sudo -n chmod 755 /opt/iot-monitoring/agent.py",
        "echo STEP:agent",
        `printf '%s' '${serviceBase64}' | base64 -d | sudo -n tee /etc/systemd/system/iot-monitoring.service >/dev/null`,
        "echo STEP:service",
        "sudo -n systemctl daemon-reload",
        "sudo -n systemctl enable iot-monitoring.service >/dev/null 2>&1",
        "echo STEP:enabled",
        "sudo -n systemctl restart iot-monitoring.service",
        "sleep 2",
        "sudo -n systemctl is-active --quiet iot-monitoring.service",
        "echo STEP:running",
    ].join(" && ");

    const sshCommand = process.env.SSH_COMMAND || "ssh";
    const sshArgs = [
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "ConnectionAttempts=1",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", String(config.ssh_port || "22"),
        "-i", config.ssh_key_path,
        `${config.ssh_user}@${config.ethernet_ip}`,
        remoteCommand,
    ];

    installRunning = true;

    const child = spawn(sshCommand, sshArgs, {
        shell: false,
        windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;

    const finish = () => {
        installRunning = false;
    };

    const timeout = setTimeout(() => {
        if (finished) return;
        timedOut = true;
        child.kill();
    }, 60000);

    child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        finish();
        console.error("Unable to start Raspberry installer:", error);

        return res.status(500).json({
            code: "SSH_CLIENT_START_ERROR",
            message: "Impossible de démarrer le client SSH sur le PC serveur.",
            steps: markerSteps(stdout),
        });
    });

    child.on("close", (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        finish();

        const steps = markerSteps(stdout);

        if (timedOut) {
            return res.status(504).json({
                code: "RASPBERRY_INSTALL_TIMEOUT",
                message: "L'installation du Raspberry Pi a dépassé le délai autorisé.",
                steps,
            });
        }

        if (code !== 0) {
            const sudoProblem = /sudo:.*password|a password is required|not allowed to run sudo/i.test(stderr);
            const sshProblem = /permission denied|connection refused|connection timed out|no route to host|could not resolve/i.test(stderr);

            let message = "L'installation automatique du Raspberry Pi a échoué.";
            if (sudoProblem) {
                message = "La connexion SSH fonctionne, mais l'utilisateur doit pouvoir utiliser sudo sans saisie interactive pendant l'installation.";
            } else if (sshProblem) {
                message = "Impossible de se connecter au Raspberry Pi en SSH. Vérifiez l'IP Ethernet, l'utilisateur et la clé SSH.";
            }

            return res.status(500).json({
                code: "RASPBERRY_INSTALL_FAILED",
                message,
                steps,
            });
        }

        return res.json({
            installed: true,
            node_name: nodeName,
            service: "iot-monitoring.service",
            agent_path: "/opt/iot-monitoring/agent.py",
            monitoring_endpoint: `http://${config.server_host}:${config.server_port}/api/pi/data`,
            steps,
            message: "Agent Raspberry Pi installé et démarré automatiquement.",
        });
    });
});

module.exports = router;
