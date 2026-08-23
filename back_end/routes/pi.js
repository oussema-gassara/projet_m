const express = require("express");
const router = express.Router();

const db = require("../db");
const optionalAuth = require("../middleware/optionalAuth");

console.log("✅ Pi route loaded");

router.post("/pi/data", (req, res) => {
    console.log("📩 PI DATA RECEIVED");
    console.log(req.body);
    const data = req.body;

    const sql = `

    INSERT INTO pi_data
    (

    hostname,
    ip_address,
    mac_address,
    wifi_status,

    cpu_temperature,
    cpu_usage_percent,

    total_ram,
    free_ram,
    used_ram,
    used_ram_percent,

    disk_total,
    disk_used,
    disk_free,
    disk_percent,

    uptime,
    status,
    node_name

    )

    VALUES
    (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)

    `;

    const values = [
        data.hostname,
        data.ip_address,
        data.mac_address,
        data.wifi_status,

        data.cpu_temperature,
        data.cpu_usage_percent,

        data.total_ram,
        data.free_ram,
        data.used_ram,
        data.used_ram_percent,

        data.disk_total,
        data.disk_used,
        data.disk_free,
        data.disk_percent,

        data.uptime,
        data.status,
        data.node_name || "pi-1",
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json({ status: "received" });
    });
});

router.get("/pi", optionalAuth, (req, res) => {
    const { node_name } = req.query;

    const sql = node_name
        ? `SELECT * FROM pi_data WHERE node_name = ? ORDER BY id DESC LIMIT 1`
        : `SELECT * FROM pi_data ORDER BY id DESC LIMIT 1`;

    const params = node_name ? [node_name] : [];

    db.query(sql, params, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        const data = result[0];

        if (data && !req.user) {
            delete data.ip_address;
            delete data.mac_address;
        }

        res.json(data);
    });
});

module.exports = router;