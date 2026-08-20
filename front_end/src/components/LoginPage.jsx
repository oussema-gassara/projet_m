import { useNavigate } from "react-router-dom";
import Login from "./Login.jsx";

export default function LoginPage() {
    const navigate = useNavigate();

    // Appelé lorsque le login est réussi
    const handleLogin = () => {
        navigate("/dashboard");
    };

    // Continuer sans compte administrateur
    const handleGuest = () => {
        // Supprimer un éventuel ancien token
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("role");

        navigate("/dashboard");
    };

    return (
        <div className="login-page">

            <Login onLogin={handleLogin} />

            <div style={{textAlign:'center'}} className="guest-login">
                <p>Ou</p>

                <button
                    style={{borderRadius: 7,backgroundColor: 'lightblue'}}
                    className='button-utilisateur'
                    type="button"
                    onClick={handleGuest}
                >
                    Continuer comme utilisateur
                </button>
            </div>

        </div>
    );
}