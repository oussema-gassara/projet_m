import { BrowserRouter, Routes, Route } from "react-router-dom";
import Main from "./components/main.jsx";
import LoginPage from "./components/LoginPage.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Page affichée quand on ouvre l'application */}
                <Route path="/" element={<LoginPage />} />

                {/* Page de connexion */}
                <Route path="/login" element={<LoginPage />} />

                {/* Dashboard */}
                <Route path="/dashboard" element={<Main />} />
            </Routes>
        </BrowserRouter>
    );
}