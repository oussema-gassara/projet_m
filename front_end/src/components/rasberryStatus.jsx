import { useState, useEffect } from "react";

export default function RasberryStatus({ rasberry }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const lastUpdate = rasberry ? new Date(rasberry.created_at) : null;
  const now = new Date();
  const online = lastUpdate ? now - lastUpdate < 10000 : false;

  return (
    <div className="availability-container-rasberry">
      <span className={`status-disc ${online ? "online" : "offline"}`} />
      <span>System Availability: {online ? "Online" :
      "Offline (Problème de connexion)"}</span>
    </div>
  );
}