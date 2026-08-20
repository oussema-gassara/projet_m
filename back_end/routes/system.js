const express = require("express");
const router = express.Router();

const db = require("../db");

console.log("✅ System route loaded");

// GET system data for a specific node
// Example:
// /api/system?node_name=esp32-1
// /api/system?node_name=esp32-2

router.get("/system", (req, res) => {

    const { node_name } = req.query;

    let sql;
    let values = [];

    if (node_name) {

        sql = `
            SELECT
                node_name,

                cpu_temperature,

                total_ram,
                free_ram,
                used_ram,
                minimum_free_ram,

                cpu_frequency,
                cpu_cores,
                active_core,

                chip_model,
                chip_revision,

                flash_size,
                sketch_size,
                free_sketch,

                sdk_version,

                uptime,
                reconnects,

                status,

                created_at

            FROM monitoring_data

            WHERE node_name = ?

            ORDER BY id DESC

            LIMIT 1
        `;

        values = [node_name];

    } else {

        // Compatibility with the old frontend
        // If no node_name is provided,
        // return the latest ESP32 data.

        sql = `
            SELECT
                node_name,

                cpu_temperature,

                total_ram,
                free_ram,
                used_ram,
                minimum_free_ram,

                cpu_frequency,
                cpu_cores,
                active_core,

                chip_model,
                chip_revision,

                flash_size,
                sketch_size,
                free_sketch,

                sdk_version,

                uptime,
                reconnects,

                status,

                created_at

            FROM monitoring_data

            ORDER BY id DESC

            LIMIT 1
        `;
    }

    db.query(sql, values, (err, result) => {

        if (err) {

            console.log("❌ System database error");
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