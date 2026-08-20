// Script à exécuter une seule fois pour créer le compte admin par défaut.
// Usage : node seed_admin.js

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./db");

const USERNAME = "admin";
const PASSWORD = "admin";

async function seed() {
    const hash = await bcrypt.hash(PASSWORD, 10);

    const sql = `
        INSERT INTO users (username, password_hash, role)
        VALUES (?, ?, 'admin')
        ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `;

    db.query(sql, [USERNAME, hash], (err) => {
        if (err) {
            console.log("❌ Erreur lors de la création de l'admin");
            console.log(err);
            process.exit(1);
        }

        console.log("✅ Compte admin créé (username: admin / password: admin)");
        process.exit(0);
    });
}

seed();
