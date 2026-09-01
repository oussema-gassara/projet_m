const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");

const router = express.Router();
const runningDiagnostics = new Set();

const NODE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

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
                stdout += chunk.toString();
            });

            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
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

module.exports = router;
