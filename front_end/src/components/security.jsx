import clsx from 'clsx';
import { useState, useEffect } from "react";
import { API_URL } from "../config.js";

export default function Security() {
    const [security, setSecurity] = useState(null);

    useEffect(() => {
        const getSecurity = () => {
            fetch(`${API_URL}/api/security`)
                .then((res) => res.json())
                .then((data) => setSecurity(data))
                .catch((err) => console.error(err));
        };
        getSecurity();
        const interval = setInterval(getSecurity, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="security">
            {security ? (
                security.map(({ node, service, status }, index) => (
                    <p key={index}>
                        {node} — {service}:{" "}
                        <span className={clsx("metric-value", status === "open" ? "metric-good" : "metric-danger")}>
                            {status}
                        </span>
                    </p>
                ))
            ) : (
                <p>Loading...</p>
            )}
        </div>
    )
}