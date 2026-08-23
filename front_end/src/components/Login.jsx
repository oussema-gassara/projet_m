import { useState } from "react";
import logo from "../assets/logo.svg";
import { API_URL } from "../config.js";
export default function Login({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");

        if (!username || !password) {
            setError("Veuillez remplir tous les champs.");
            return;
        }

        try {
            const response = await fetch(
                `${API_URL}/api/auth/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        username,
                        password,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Erreur de connexion");
                return;
            }

            // Sauvegarde des informations de connexion
            localStorage.setItem("token", data.token);
            localStorage.setItem("username", data.username);
            localStorage.setItem("role", data.role);

            // Retour vers LoginPage
            // qui redirigera vers /dashboard
            onLogin(data);

        } catch (error) {
            console.error(error);
            setError("Serveur injoignable");
        }
    };

    return (
        <form
            className="login-form"
            onSubmit={handleSubmit}
        >
            <img src={logo} className="header-logo" alt="logo" />
            <hr/>

            <h2 style={{textAlign:'center'}} >Connexion</h2>

            <hr />
            <div style={{textAlign:'center'}} className='section-connexion'>
                <input
                    style={{marginLeft: '10px',borderRadius:7,borderColor:'FireBrick',backgroundColor:'white'}}
                    type="text"
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />

                <input
                    style={{marginLeft: '10px',borderRadius:7,borderColor:'FireBrick',backgroundColor:'white'}}
                    className='password'
                    type="password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <button className='button-connecter' type="submit"
                    style={{marginLeft:'5px',borderRadius:'7px',backgroundColor:'FireBrick',color:'white'}}
                >
                    Se connecter
                </button>

                {error && (
                    <p className="metric-value metric-danger">
                        {error}
                    </p>
                )}
            </div>
        </form>
    );
}