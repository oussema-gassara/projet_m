const express = require("express");
const router = express.Router();

const db = require("../db");
const requireAuth = require("../middleware/auth");
console.log("✅ Network route loaded");

// GET network data for a specific node (réservé aux admins connectés)
// Example:
// /api/network?node_name=esp32-1
// /api/network?node_name=esp32-2

router.get("/network", requireAuth, (req, res) => {

    const { node_name } = req.query;

    let sql;
    let values = [];

    if (node_name) {

        sql = `
            SELECT
                node_name,

                wifi_signal,
                wifi_status,

                ip_address,
                gateway,
                subnet,
                dns,

                mac_address,
                hostname

            FROM monitoring_data

            WHERE node_name = ?

            ORDER BY id DESC

            LIMIT 1
        `;

        values = [node_name];

    } else {

        // Compatibilité avec l'ancien frontend
        sql = `
            SELECT
                node_name,

                wifi_signal,
                wifi_status,

                ip_address,
                gateway,
                subnet,
                dns,

                mac_address,
                hostname

            FROM monitoring_data

            ORDER BY id DESC

            LIMIT 1
        `;
    }

    db.query(sql, values, (err, result) => {

        if (err) {
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
