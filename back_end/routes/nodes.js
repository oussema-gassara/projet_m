const express = require("express");
const router = express.Router();

const db = require("../db");
const requireAuth = require("../middleware/auth");

console.log("✅ Nodes route loaded");

// Liste des nœuds enregistrés (public : nécessaire pour afficher les cartes du dashboard)
router.get("/nodes", (req, res) => {
    const sql = `SELECT * FROM nodes ORDER BY added_at ASC`;

    db.query(sql, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json(result);
    });
});

// Ajout d'un nouveau nœud (protégé : réservé à l'admin)
router.post("/nodes", requireAuth, (req, res) => {
    const { node_name, node_type } = req.body;

    if (!node_name || !node_type) {
        return res.status(400).json({ error: "node_name et node_type requis" });
    }

    if (!["esp32", "raspberry"].includes(node_type)) {
        return res.status(400).json({ error: "node_type doit être 'esp32' ou 'raspberry'" });
    }

    const sql = `INSERT INTO nodes (node_name, node_type) VALUES (?, ?)`;

    db.query(sql, [node_name, node_type], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "Ce nom de nœud existe déjà" });
            }
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json({ message: "Nœud ajouté", id: result.insertId, node_name, node_type });
    });
});

// Suppression d'un nœud (protégée : réservé à l'admin)
router.delete("/nodes/:id", requireAuth, (req, res) => {
    const { id } = req.params;

    const sql = `DELETE FROM nodes WHERE id = ?`;

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Nœud introuvable" });
        }

        res.json({ message: "Nœud supprimé", id });
    });
});

module.exports = router;
