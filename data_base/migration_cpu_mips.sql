-- Ajout de l'indicateur de performance CPU MIPS pour les nœuds ESP32.
-- À exécuter une seule fois sur la base stage_dete existante.

ALTER TABLE monitoring_data
ADD COLUMN cpu_mips DECIMAL(10,2) NULL AFTER cpu_frequency;
