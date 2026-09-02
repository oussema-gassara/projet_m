const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");
const requireAuth = require("../middleware/auth");

const router = express.Router();
const runningDiagnostics = new Set();

const NODE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const RASPBERRY_CONFIG_PATH = path.resolve(
    __dirname,
    "..",
    "raspberry-diagnostic-config.json"
);

function loadRaspberryConfig() {
    try {
        if (!fs.existsSync(RASPBERRY_CONFIG_PATH)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(RASPBERRY_CONFIG_PATH, "utf8")
        );
    } catch (error) {
        console.error("Unable to read Raspberry diagnostic config:", error);
        return {};
    }
}

function saveRaspberryConfig(config) {
    fs.writeFileSync(
        RASPBERRY_CONFIG_PATH,
        JSON.stringify(config, null, 2),
        "utf8"
    );
}

function isRaspberryConfigComplete(config) {
    return Boolean(
        config.ethernet_ip &&
        config.ssh_user &&
        config.ssh_key_path &&
        config.server_host
    );
}

function publicRaspberryConfig(config) {
    return {
        configured: isRaspberryConfigComplete(config),
        ethernet_ip: config.ethernet_ip || "",
        ssh_user: config.ssh_user || "",
        ssh_port: config.ssh_port || "22",
        ssh_key_path: config.ssh_key_path || "",
        server_host: config.server_host || "",
        server_port: config.server_port || "3000",
    };
}

router.post("/diagnostic/esp32", (req, res) => {
    const nodeName = String(req.body?.node_name || "").trim();

    if (!NODE_NAME_PATTERN.test(nodeName)) {
        return res.status(400).json({
            code: "INVALID_NODE_NAME",
            message: "Nom de carte ESP32 invalide.",
        });
    }

    db.query(
        "SELECT id, node_name FROM nodes WHERE node_name = ? AND node_type = 'esp32' LIMIT 1",
        [nodeName],
        (dbError, rows) => {
            if (dbError) {
                console.error("Diagnostic DB error:", dbError);
                return res.status(500).json({
                    code: "DATABASE_ERROR",
                    message: "Impossible de vérifier la carte dans la base de données.",
                });
            }

            if (!rows.length) {
                return res.status(404).json({
                    code: "ESP32_NOT_REGISTERED",
                    message: "Cette ESP32 n'est pas enregistrée dans la base de données.",
                });
            }

            if (runningDiagnostics.has(nodeName)) {
                return res.status(409).json({
                    code: "DIAGNOSTIC_ALREADY_RUNNING",
                    message: "Un diagnostic est déjà en cours pour cette ESP32.",
                });
            }

            const scriptPath = path.resolve(
                __dirname,
                "..",
                "..",
                "diagnostic",
                "esp32",
                "diagnostic_by_node.py"
            );

            const pythonCommand =
                process.env.PYTHON_PATH ||
                (process.platform === "win32"
                    ? "C:\\Python314\\python.exe"
                    : "python3");

            runningDiagnostics.add(nodeName);

            const child = spawn(
                pythonCommand,
                [scriptPath, nodeName],
                {
                    shell: false,
                    windowsHide: true,
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: "utf-8",
                        PYTHONUTF8: "1",
                    },
                }
            );

            let stdout = "";
            let stderr = "";
            let finished = false;

            const cleanup = () => {
                runningDiagnostics.delete(nodeName);
            };

            const timeout = setTimeout(() => {
                if (finished) return;
                child.kill();
            }, 300000);

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
                cleanup();

                console.error("Unable to start ESP32 diagnostic:", error);
                return res.status(500).json({
                    code: "DIAGNOSTIC_START_ERROR",
                    message: "Impossible de démarrer le diagnostic ESP32.",
                });
            });

            child.on("close", () => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                cleanup();

                const finalLine = stdout
                    .split(/\r?\n/)
                    .reverse()
                    .find((line) => line.startsWith("FINAL_RESULT_JSON="));

                if (!finalLine) {
                    console.error("ESP32 diagnostic did not return JSON.");
                    if (stderr) console.error(stderr);

                    return res.status(500).json({
                        code: "DIAGNOSTIC_NO_RESULT",
                        message: "Le diagnostic n'a pas retourné de résultat.",
                    });
                }

                try {
                    const result = JSON.parse(
                        finalLine.slice("FINAL_RESULT_JSON=".length)
                    );
                    return res.json(result);
                } catch (parseError) {
                    console.error("Invalid diagnostic JSON:", parseError);
                    return res.status(500).json({
                        code: "DIAGNOSTIC_INVALID_RESULT",
                        message: "Le résultat du diagnostic est invalide.",
                    });
                }
            });
        }
    );
});

router.get(
    "/diagnostic/raspberry/config",
    requireAuth,
    (req, res) => {
        return res.json(
            publicRaspberryConfig(loadRaspberryConfig())
        );
    }
);

router.post(
    "/diagnostic/raspberry/config",
    requireAuth,
    (req, res) => {
        if (req.user?.role !== "admin") {
            return res.status(403).json({
                code: "ADMIN_REQUIRED",
                message: "Seul un administrateur peut configurer le diagnostic Raspberry Pi.",
            });
        }

        const config = {
            ethernet_ip: String(req.body?.ethernet_ip || "").trim(),
            ssh_user: String(req.body?.ssh_user || "").trim(),
            ssh_port: String(req.body?.ssh_port || "22").trim() || "22",
            ssh_key_path: String(req.body?.ssh_key_path || "").trim(),
            server_host: String(req.body?.server_host || "").trim(),
            server_port: String(req.body?.server_port || "3000").trim() || "3000",
        };

        if (!config.ethernet_ip || !config.ssh_user || !config.ssh_key_path || !config.server_host) {
            return res.status(400).json({
                code: "RASPBERRY_CONFIG_INCOMPLETE",
                message: "IP Ethernet, utilisateur SSH, chemin de la clé SSH et adresse du serveur sont requis.",
            });
        }

        if (!/^\d{1,5}$/.test(config.ssh_port) || Number(config.ssh_port) > 65535) {
            return res.status(400).json({
                code: "INVALID_SSH_PORT",
                message: "Port SSH invalide.",
            });
        }

        if (!/^\d{1,5}$/.test(config.server_port) || Number(config.server_port) > 65535) {
            return res.status(400).json({
                code: "INVALID_SERVER_PORT",
                message: "Port du serveur invalide.",
            });
        }

        try {
            saveRaspberryConfig(config);
            return res.json({
                ...publicRaspberryConfig(config),
                message: "Configuration Raspberry Pi enregistrée.",
            });
        } catch (error) {
            console.error("Unable to save Raspberry diagnostic config:", error);
            return res.status(500).json({
                code: "RASPBERRY_CONFIG_SAVE_ERROR",
                message: "Impossible d'enregistrer la configuration Raspberry Pi.",
            });
        }
    }
);

function launchRaspberryDiagnostic(
    req,
    res,
    nodeName,
    targetIp,
    diagnosticMode,
    raspberryConfig = {}
) {
    const diagnosticKey = `raspberry:${nodeName}`;

    if (runningDiagnostics.has(diagnosticKey)) {
        return res.status(409).json({
            code: "DIAGNOSTIC_ALREADY_RUNNING",
            message: "Un diagnostic est déjà en cours pour ce Raspberry Pi.",
        });
    }

    const scriptPath = path.resolve(
        __dirname,
        "..",
        "..",
        "diagnostic",
        "raspberry",
        "diagnostic_raspberry.py"
    );

    const pythonCommand =
        process.env.PYTHON_PATH ||
        (process.platform === "win32"
            ? "C:\\Python314\\python.exe"
            : "python3");

    runningDiagnostics.add(diagnosticKey);

    const child = spawn(
        pythonCommand,
        [scriptPath, nodeName, targetIp || ""],
        {
            shell: false,
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONIOENCODING: "utf-8",
                PYTHONUTF8: "1",
                RASPBERRY_DIAGNOSTIC_MODE: diagnosticMode,
                RASPBERRY_DIAGNOSTIC_SCENARIO:
                    diagnosticMode === "simulation"
                        ? "wifi_hardware_error"
                        : "ok",
                RASPBERRY_SSH_USER:
                    raspberryConfig.ssh_user ||
                    process.env.RASPBERRY_SSH_USER ||
                    "",
                RASPBERRY_SSH_PORT:
                    raspberryConfig.ssh_port ||
                    process.env.RASPBERRY_SSH_PORT ||
                    "22",
                RASPBERRY_SSH_KEY:
                    raspberryConfig.ssh_key_path ||
                    process.env.RASPBERRY_SSH_KEY ||
                    "",
                MONITORING_SERVER_HOST:
                    raspberryConfig.server_host ||
                    process.env.MONITORING_SERVER_HOST ||
                    "",
                MONITORING_SERVER_PORT:
                    raspberryConfig.server_port ||
                    process.env.MONITORING_SERVER_PORT ||
                    "3000",
            },
        }
    );

    let stdout = "";
    let stderr = "";
    let finished = false;

    const cleanup = () => {
        runningDiagnostics.delete(diagnosticKey);
    };

    const timeout = setTimeout(() => {
        if (finished) return;
        child.kill();
    }, 30000);

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
        cleanup();

        console.error("Unable to start Raspberry diagnostic:", error);
        return res.status(500).json({
            code: "DIAGNOSTIC_START_ERROR",
            message: "Impossible de démarrer le diagnostic Raspberry Pi.",
        });
    });

    child.on("close", () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        cleanup();

        const finalLine = stdout
            .split(/\r?\n/)
            .reverse()
            .find((line) => line.startsWith("FINAL_RESULT_JSON="));

        if (!finalLine) {
            console.error("Raspberry diagnostic did not return JSON.");
            if (stderr) console.error(stderr);

            return res.status(500).json({
                code: "DIAGNOSTIC_NO_RESULT",
                message: "Le diagnostic Raspberry Pi n'a pas retourné de résultat.",
            });
        }

        try {
            const result = JSON.parse(
                finalLine.slice("FINAL_RESULT_JSON=".length)
            );
            return res.json(result);
        } catch (parseError) {
            console.error("Invalid Raspberry diagnostic JSON:", parseError);
            return res.status(500).json({
                code: "DIAGNOSTIC_INVALID_RESULT",
                message: "Le résultat du diagnostic Raspberry Pi est invalide.",
            });
        }
    });
}

router.post("/diagnostic/raspberry", (req, res) => {
    const nodeName = String(req.body?.node_name || "raspberry-1").trim();
    const testMode = req.body?.test_mode === true;
    const diagnosticMode = testMode ? "simulation" : "real";

    if (!NODE_NAME_PATTERN.test(nodeName)) {
        return res.status(400).json({
            code: "INVALID_NODE_NAME",
            message: "Nom du Raspberry Pi invalide.",
        });
    }

    if (testMode) {
        return launchRaspberryDiagnostic(
            req,
            res,
            nodeName,
            "",
            diagnosticMode,
            {}
        );
    }

    const raspberryConfig = loadRaspberryConfig();

    if (!isRaspberryConfigComplete(raspberryConfig)) {
        return res.status(400).json({
            code: "RASPBERRY_CONFIG_MISSING",
            message: "Configurez d'abord le Raspberry Pi dans l'interface de configuration.",
        });
    }

    return launchRaspberryDiagnostic(
        req,
        res,
        nodeName,
        raspberryConfig.ethernet_ip,
        diagnosticMode,
        raspberryConfig
    );
});

module.exports = router;
