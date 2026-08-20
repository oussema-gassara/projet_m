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

module.exports = router;