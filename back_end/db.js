require("dotenv").config();

const mysql = require("mysql2");

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

function ensureCpuMipsColumn(connection) {
    connection.query(
        "SHOW COLUMNS FROM monitoring_data LIKE 'cpu_mips'",
        (checkErr, rows) => {
            if (checkErr) {
                console.log("⚠️ Impossible de vérifier la colonne cpu_mips:", checkErr.sqlMessage || checkErr.message);
                connection.release();
                return;
            }

            if (rows.length > 0) {
                connection.release();
                return;
            }

            connection.query(
                "ALTER TABLE monitoring_data ADD COLUMN cpu_mips DECIMAL(10,2) NULL AFTER cpu_frequency",
                (alterErr) => {
                    if (alterErr) {
                        console.log("⚠️ Impossible d'ajouter la colonne cpu_mips:", alterErr.sqlMessage || alterErr.message);
                    } else {
                        console.log("✅ Colonne cpu_mips ajoutée à monitoring_data");
                    }

                    connection.release();
                }
            );
        }
    );
}

db.getConnection((err, connection) => {
    if (err) {
        console.log("❌ Database error");
        console.log(err);
    } else {
        console.log("✅ MySQL connected");
        ensureCpuMipsColumn(connection);
    }
});

module.exports = db;
