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
                    ? "Masquer comment préparer le Raspberry Pi"
                    : "Comment préparer et connecter le Raspberry Pi ?"}
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
                    <h3>Avant le premier démarrage — Raspberry Pi Imager</h3>
                    <ol>
                        <li>Installe Raspberry Pi OS sur la carte SD avec Raspberry Pi Imager.</li>
                        <li>Choisis un nom d'utilisateur pour le Raspberry Pi.</li>
                        <li>Active SSH dans les options de personnalisation.</li>
                        <li>Configure l'authentification SSH par clé publique.</li>
                        <li>Insère la carte SD, branche le câble Ethernet et démarre le Raspberry Pi.</li>
                    </ol>

                    <p>
                        Si tu n'as pas encore de clé SSH sur le PC, ouvre PowerShell avant l'installation et exécute :
                    </p>
                    <code>ssh-keygen -t ed25519</code>
                    <p>
                        La clé publique se termine par <strong>.pub</strong> et sert à autoriser le PC dans Raspberry Pi Imager.
                        La clé privée reste uniquement sur le PC et sera utilisée par l'application Web.
                    </p>

                    <hr />

                    <h3>1. IP Ethernet du Raspberry Pi</h3>
                    <p>Après le démarrage, sur le Raspberry Pi, avec le câble Ethernet branché :</p>
                    <code>ip -4 addr show eth0</code>
                    <p>
                        Repère la ligne <strong>inet</strong>. Exemple : si tu vois
                        <strong> 192.168.1.25/24</strong>, saisis <strong>192.168.1.25</strong> dans l'application.
                    </p>

                    <hr />

                    <h3>2. Utilisateur SSH</h3>
                    <p>
                        C'est le nom d'utilisateur choisi dans Raspberry Pi Imager. Pour le vérifier sur le Raspberry Pi :
                    </p>
                    <code>whoami</code>

                    <hr />

                    <h3>3. Port SSH</h3>
                    <p>
                        Le port SSH standard est <strong>22</strong>. Garde 22 si tu ne l'as pas modifié.
                    </p>

                    <hr />

                    <h3>4. Chemin de la clé SSH privée</h3>
                    <p>Sur le PC Windows, ouvre PowerShell et exécute :</p>
                    <code>{'Get-ChildItem "$env:USERPROFILE\\.ssh"'}</code>
                    <p>
                        Choisis la clé privée, par exemple <strong>id_ed25519</strong>, et non
                        <strong> id_ed25519.pub</strong>. Ne copie jamais le contenu de la clé privée dans l'application.
                    </p>
                    <p>Exemple de chemin :</p>
                    <code>C:/Users/VotreNom/.ssh/id_ed25519</code>

                    <hr />

                    <h3>5. Adresse IP du PC / serveur de monitoring</h3>
                    <p>Sur le PC Windows, exécute :</p>
                    <code>ipconfig</code>
                    <p>
                        Prends l'adresse IPv4 de l'interface réseau qui communique avec le Raspberry Pi.
                    </p>

                    <hr />

                    <h3>6. Port du serveur</h3>
                    <p>
                        Le backend Express utilise le port <strong>3000</strong> par défaut.
                    </p>

                    <hr />

                    <h3>7. Installation depuis le dashboard</h3>
                    <p>
                        Enregistre la configuration, puis clique sur <strong>Connecter et installer le Raspberry Pi</strong>.
                        L'application installe automatiquement l'agent dans <strong>/opt/iot-monitoring</strong>, crée le service
                        <strong> iot-monitoring.service</strong> et le démarre. Aucun fichier Python n'est à créer sur le Desktop.
                    </p>
                </div>
            )}
        </section>
    );
}
