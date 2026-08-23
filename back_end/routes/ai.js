const express = require("express");
const router = express.Router();

router.get("/ai/detect", async (req, res) => {
    try {
        const response = await fetch("http://localhost:5000/detect");
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI service unreachable" });
    }
});

router.get("/ai/forecast", async (req, res) => {
    try {
        const response = await fetch("http://localhost:5000/forecast");
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI forecasting service unreachable" });
    }
});

// TEST MODE: send the fake ESP32 values from React to the AI service.
router.post("/ai/detect-test", async (req, res) => {
    try {
        const response = await fetch("http://localhost:5000/detect-test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(req.body),
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI service unreachable" });
    }
});

module.exports = router;
