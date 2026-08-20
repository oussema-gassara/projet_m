-- =========================================================
-- MIGRATION : authentification + gestion multi-nœuds
-- =========================================================

-- Table des utilisateurs (login admin/mod)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des nœuds enregistrés (ESP32 / Raspberry Pi ajoutés via les boutons "+")
CREATE TABLE IF NOT EXISTS nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_name VARCHAR(50) UNIQUE NOT NULL,
    node_type ENUM('esp32', 'raspberry') NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ajout de la colonne node_name pour distinguer plusieurs cartes du même type
ALTER TABLE monitoring_data ADD COLUMN node_name VARCHAR(50) DEFAULT 'esp32-1';
ALTER TABLE pi_data ADD COLUMN node_name VARCHAR(50) DEFAULT 'pi-1';

-- Nœuds par défaut correspondant aux cartes déjà utilisées
INSERT INTO nodes (node_name, node_type) VALUES ('esp32-1', 'esp32');
INSERT INTO nodes (node_name, node_type) VALUES ('pi-1', 'raspberry');
