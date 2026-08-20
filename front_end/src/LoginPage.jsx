import { useNavigate } from "react-router-dom";
import Login from "./Login.jsx";

export default function LoginPage() {
    const navigate = useNavigate();

    const handleLogin = () => {
        navigate("/");
    };

    return (
        <div className="login-page">
            <Login onLogin={handleLogin} />
        </div>
    );
}
