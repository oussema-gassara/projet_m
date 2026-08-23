import { useState } from "react";
import { API_URL } from "../config.js";

export default function AddNode({ nodeType, onAdded }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [error, setError] = useState("");

    const label = nodeType === "esp32" ? "Ajouter ESP32" : "Ajouter Raspberry Pi";

    const handleAdd = (e) => {
        e.preventDefault();
        setError("");

        const token = localStorage.getItem("token");

        fetch(`${API_URL}/api/nodes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ node_name: name, node_type: nodeType }),
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok) {
                    setError(data.error || "Erreur lors de l'ajout");
                    return;
                }

                setName("");
                setOpen(false);
                if (onAdded) onAdded(data);
            })
            .catch(() => setError("Serveur injoignable"));
    };

    if (!open) {
        return (
            <button className="add-node-button" onClick={() => setOpen(true)}>
                + {label}
            </button>
        );
    }

    return (
        <form className="add-node-form" onSubmit={handleAdd}>
            <input
                type="text"
                placeholder="Nom du nœud (ex: esp32-2)"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">Confirmer</button>
            <button type="button" onClick={() => setOpen(false)}>
                Annuler
            </button>
            {error && <p className="metric-value metric-danger">{error}</p>}
        </form>
    );
}
