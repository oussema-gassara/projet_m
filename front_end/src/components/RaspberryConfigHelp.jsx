import { useState } from "react";

export default function RaspberryConfigHelp() {
    const [showHelp, setShowHelp] = useState(false);

    return (
        <section
            style={{
                border: "1px solid #ccc",
                borderRadius: "10px",
                padding: "15px",
                margin: "0 0 15px",
            }}
        >
            <button
                type="button"
                className="setup-secondary-button"
                onClick={() => setShowHelp((current) => !current)}
                style={{
                    borderRadius: "10px",
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontWeight: "bold",
                }}
            >
                {showHelp
                    ? "Masquer comment trouver les informations"
                    : "Comment trouver les informations Raspberry Pi ?"}
            </button>

            {showHelp && (
                <div
                    style={{
                        marginTop: "15px",
                        padding: "15px",
                        border: "1px solid #ddd",
                        borderRadius: "10px",
                    }}
                >
                    <h3>1. IP Ethernet du Raspberry Pi</h3>
                    <p>Sur le Raspberry Pi, avec le câble Ethernet branché, exécute :</p>
                    <code>ip -4 addr show eth0</code>
                    <p>
                        Repère la ligne <strong>inet</strong>. Exemple : si tu vois
                        <strong> 192.168.1.25/24</strong>, mets <strong>192.168.1.25</strong>.
                    </p>

                    <hr />

                    <h3>2. Utilisateur SSH</h3>
                    <p>Sur le Raspberry Pi, exécute :</p>
                    <code>whoami</code>
                    <p>Le résultat est l&apos;utilisateur SSH à saisir.</p>

                    <hr />

                    <h3>3. Port SSH</h3>
                    <p>
                        Le port SSH standard est <strong>22</strong>. Garde 22 si tu ne l&apos;as pas modifié.
                    </p>

                    <hr />

                    <h3>4. Chemin de la clé SSH privée</h3>
                    <p>Sur le PC Windows, ouvre PowerShell et exécute :</p>
                    <code>{'Get-ChildItem "$env:USERPROFILE\\.ssh"'}</code>
                    <p>
                        Choisis la clé privée, par exemple <strong>id_ed25519</strong>, et non
                        <strong> id_ed25519.pub</strong>.
                    </p>
                    <p>Exemple de chemin :</p>
                    <code>C:/Users/ogass/.ssh/id_ed25519</code>

                    <hr />

                    <h3>5. Adresse IP du PC / serveur de monitoring</h3>
                    <p>Sur le PC Windows, exécute :</p>
                    <code>ipconfig</code>
                    <p>
                        Prends l&apos;adresse IPv4 de l&apos;interface réseau qui communique avec le Raspberry Pi.
                    </p>

                    <hr />

                    <h3>6. Port du serveur</h3>
                    <p>
                        Ton backend Express utilise actuellement le port <strong>3000</strong>.
                    </p>
                </div>
            )}
        </section>
    );
}
