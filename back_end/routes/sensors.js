const express = require("express");
const router = express.Router();

console.log("✅ Sensors route loaded");

const db = require("../db");

// GET sensor data for a specific node
// Example:
// /api/sensors?node_name=esp32-1
// /api/sensors?node_name=esp32-2

router.get("/sensors", (req, res) => {

    const { node_name } = req.query;

    let sql;
    let values = [];

    if (node_name) {

        sql = `
            SELECT
                node_name,

                external_temperature,
                humidity,
                gas_level,
                gas_alarm,
                status,
                created_at

            FROM monitoring_data

            WHERE node_name = ?

            ORDER BY id DESC

            LIMIT 1
        `;

        values = [node_name];

    } else {

        // Compatibilité avec l'ancien frontend :
        // si aucun node_name n'est fourni, renvoie la dernière donnée ESP32.

        sql = `
            SELECT
                node_name,

                external_temperature,
                humidity,
                gas_level,
                gas_alarm,
                status,
                created_at

            FROM monitoring_data

            ORDER BY id DESC

            LIMIT 1
        `;
    }

    db.query(sql, values, (err, result) => {

        if (err) {

            console.log("❌ Sensors database error");
            console.log(err);

            return res.status(500).json({
                error: "Database error"
            });
        }

        if (result.length === 0) {

            return res.status(404).json({
                error: "Aucune donnée trouvée pour ce nœud",
                node_name: node_name || null
            });
        }

        res.json(result[0]);
    });
});

module.exports = router;
