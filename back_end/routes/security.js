const express = require("express");
const router = express.Router();
const net = require("net");

const db = require("../db");

console.log("✅ Security route loaded");

function checkPort(ip, port, timeout = 1000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.on("error", () => {
            resolve(false);
        });

        socket.connect(port, ip);
    });
}

router.get("/security", (req, res) => {

    const sql = `

    SELECT ip_address

    FROM pi_data

    ORDER BY id DESC

    LIMIT 1

    `;

    db.query(sql, async (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        const piIP = result[0] ? result[0].ip_address : null;

        const targets = [
            { node: "Backend Server", ip: "10.1.30.21", port: 3000, service: "Express API" },
        ];

        if (piIP) {
            targets.push(
                { node: "Raspberry Pi", ip: piIP, port: 22, service: "SSH" },
                { node: "Raspberry Pi", ip: piIP, port: 5901, service: "VNC" }
            );
        }

        const results = await Promise.all(
            targets.map(async (t) => {
                const isOpen = await checkPort(t.ip, t.port);
                return {
                    node: t.node,
                    ip: t.ip,
                    port: t.port,
                    service: t.service,
                    status: isOpen ? "open" : "closed",
                };
            })
        );

        res.json(results);

    });

});

module.exports = router;