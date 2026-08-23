const express = require("express");
const router = express.Router();

const db = require("../db");

console.log("✅ ESP32 route loaded");

router.get("/test", (req, res) => {
    res.json({
        message: "ESP32 route working"
    });
});

// ======================================================
// ENREGISTREMENT DES DANGERS RÉELS
// ======================================================
// Un même problème persistant n'est enregistré qu'une fois
// toutes les 5 minutes pour éviter de remplir la base toutes
// les 2 secondes pendant lesquelles l'ESP32 envoie ses mesures.
function recordDanger(monitoringId, nodeName, dangerType, severity, sensorValue, thresholdValue, description, callback) {
    const sql = `
        SELECT id
        FROM danger_history
        WHERE danger_type = ?
          AND severity = ?
          AND JSON_EXTRACT(COALESCE(description, '{}'), '$.node_name') = ?
          AND created_at >= NOW() - INTERVAL 5 MINUTE
        ORDER BY id DESC
        LIMIT 1
    `;

    // The existing description column is kept as human-readable text.
    // Node filtering is therefore done with a simpler query below.
    const checkSql = `
        SELECT id
        FROM danger_history
        WHERE danger_type = ?
          AND severity = ?
          AND description LIKE ?
          AND created_at >= NOW() - INTERVAL 5 MINUTE
        ORDER BY id DESC
        LIMIT 1
    `;

    db.query(
        checkSql,
        [dangerType, severity, `%[${nodeName}]%`],
        (checkErr, existing) => {
            if (checkErr) {
                console.log("⚠️ Danger history check error:", checkErr.sqlMessage);
                return callback(checkErr);
            }

            if (existing.length > 0) {
                return callback(null);
            }

            const insertSql = `
                INSERT INTO danger_history
                (
                    monitoring_id,
                    danger_type,
                    severity,
                    sensor_value,
                    threshold_value,
                    description
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            const fullDescription = `[${nodeName}] ${description}`;

            db.query(
                insertSql,
                [
                    monitoringId,
                    dangerType,
                    severity,
                    sensorValue,
                    thresholdValue,
                    fullDescription
                ],
                (insertErr) => {
                    if (insertErr) {
                        console.log("⚠️ Danger history insert error:", insertErr.sqlMessage);
                    } else {
                        console.log(`🚨 Danger recorded: ${nodeName} | ${dangerType} | ${severity}`);
                    }
                    callback(insertErr || null);
                }
            );
        }
    );
}

function checkAndRecordDangers(monitoringId, data, done) {
    const dangers = [];

    const cpuTemp = Number(data.cpu_temperature);
    const externalTemp = Number(data.external_temperature);
    const totalRam = Number(data.total_ram);
    const usedRam = Number(data.used_ram);
    const wifiSignal = Number(data.wifi_signal);
    const gasLevel = Number(data.gas_level);

    const ramPercent = totalRam > 0 ? (usedRam / totalRam) * 100 : 0;

    // CPU temperature
    if (cpuTemp > 80) {
        dangers.push({
            type: "température_cpu",
            severity: "danger",
            value: cpuTemp,
            threshold: 80,
            description: "Température du processeur trop élevée — éteignez le système pour éviter les dommages."
        });
    } else if (cpuTemp > 60) {
        dangers.push({
            type: "température_cpu",
            severity: "warning",
            value: cpuTemp,
            threshold: 60,
            description: "Température du processeur élevée — vérifiez la ventilation."
        });
    }

    // External temperature
    if (externalTemp > 40) {
        dangers.push({
            type: "température_externe",
            severity: "danger",
            value: externalTemp,
            threshold: 40,
            description: "Température ambiante trop élevée — vérifiez la présence de sources de chaleur à proximité."
        });
    } else if (externalTemp > 30) {
        dangers.push({
            type: "température_externe",
            severity: "warning",
            value: externalTemp,
            threshold: 30,
            description: "Température ambiante élevée — à surveiller."
        });
    }

    // RAM usage
    if (ramPercent > 90) {
        dangers.push({
            type: "utilisation_ram",
            severity: "danger",
            value: Number(ramPercent.toFixed(2)),
            threshold: 90,
            description: "Utilisation RAM critique — redémarrez l'ESP32 pour libérer de la mémoire."
        });
    } else if (ramPercent > 70) {
        dangers.push({
            type: "utilisation_ram",
            severity: "warning",
            value: Number(ramPercent.toFixed(2)),
            threshold: 70,
            description: "Utilisation RAM élevée — surveillez une éventuelle fuite mémoire."
        });
    }

    // Wi-Fi signal
    if (wifiSignal < -80) {
        dangers.push({
            type: "signal_wifi",
            severity: "danger",
            value: wifiSignal,
            threshold: -80,
            description: "Signal Wi-Fi très faible — rapprochez l'ESP32 du routeur."
        });
    } else if (wifiSignal < -65) {
        dangers.push({
            type: "signal_wifi",
            severity: "warning",
            value: wifiSignal,
            threshold: -65,
            description: "Signal Wi-Fi faible — la connexion peut être instable."
        });
    }

    // Gas — detection only, never part of Isolation Forest prediction.
    if (gasLevel > 600) {
        dangers.push({
            type: "niveau_gaz",
            severity: "danger",
            value: gasLevel,
            threshold: 600,
            description: "Niveau de gaz critique — vérifiez immédiatement l'environnement et le capteur MQ-2."
        });
    } else if (gasLevel >= 300) {
        dangers.push({
            type: "niveau_gaz",
            severity: "warning",
            value: gasLevel,
            threshold: 300,
            description: "Niveau de gaz élevé — surveillez le capteur MQ-2."
        });
    }

    // Humidity — detection only, never part of Isolation Forest prediction.
    const humidity = data.humidity;
    if (typeof humidity === "number") {
        if (humidity > 70) {
            dangers.push({
                type: "humidité",
                severity: "warning",
                value: humidity,
                threshold: 70,
                description: "Humidité hors de la plage normale — vérifiez les conditions ambiantes."
            });
        } else if (humidity > 0 && humidity < 30) {
            dangers.push({
                type: "humidité",
                severity: "warning",
                value: humidity,
                threshold: 30,
                description: "Humidité hors de la plage normale — vérifiez les conditions ambiantes."
            });
        }
    } else if (typeof humidity === "string") {
        const humidityText = humidity.toLowerCase().trim();
        if (humidityText === "dry environment" || humidityText === "dry") {
            dangers.push({
                type: "humidité",
                severity: "warning",
                value: null,
                threshold: null,
                description: "Environnement trop sec — vérifiez les conditions ambiantes."
            });
        }
    }

    if (dangers.length === 0) {
        return done();
    }

    let pending = dangers.length;
    let firstError = null;

    dangers.forEach((danger) => {
        recordDanger(
            monitoringId,
            data.node_name || "ESP32 inconnu",
            danger.type,
            danger.severity,
            danger.value,
            danger.threshold,
            danger.description,
            (err) => {
                if (err && !firstError) firstError = err;
                pending -= 1;
                if (pending === 0) done(firstError);
            }
        );
    });
}

// ======================================================
// RÉCEPTION DES DONNÉES ESP32
// ======================================================
router.post("/data", (req, res) => {
    console.log("📩 ESP32 DATA RECEIVED");
    console.log(req.body);

    const data = req.body;

    const sql = `
        INSERT INTO monitoring_data
        (
            node_name,
            cpu_temperature,
            external_temperature,
            humidity,
            gas_level,
            gas_alarm,
            total_ram,
            free_ram,
            used_ram,
            minimum_free_ram,
            cpu_frequency,
            cpu_cores,
            active_core,
            wifi_signal,
            wifi_status,
            ip_address,
            gateway,
            subnet,
            dns,
            mac_address,
            hostname,
            chip_model,
            chip_revision,
            flash_size,
            sketch_size,
            free_sketch,
            sdk_version,
            uptime,
            reconnects,
            status
        )
        VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const values = [
        data.node_name,
        data.cpu_temperature,
        data.external_temperature,
        data.humidity,
        data.gas_level,
        data.gas_alarm,
        data.total_ram,
        data.free_ram,
        data.used_ram,
        data.minimum_free_ram,
        data.cpu_frequency,
        data.cpu_cores,
        data.active_core,
        data.wifi_signal,
        data.wifi_status,
        data.ip_address,
        data.gateway,
        data.subnet,
        data.dns,
        data.mac_address,
        data.hostname,
        data.chip_model,
        data.chip_revision,
        data.flash_size,
        data.sketch_size,
        data.free_sketch,
        data.sdk_version,
        data.uptime,
        data.reconnects,
        data.status
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.log("❌ Database insert error");
            console.log(err.sqlMessage);
            console.log(err.sql);

            return res.status(500).json({
                error: err.sqlMessage
            });
        }

        console.log("✅ ESP32 data inserted");

        // The monitoring row is created first so danger_history can reference it.
        checkAndRecordDangers(result.insertId, data, (dangerErr) => {
            if (dangerErr) {
                console.log("⚠️ Some danger events could not be recorded.");
            }

            res.json({
                message: "Data inserted",
                id: result.insertId
            });
        });
    });
});

module.exports = router;
