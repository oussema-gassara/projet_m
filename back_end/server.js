require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// routes
app.use("/api", require("./routes/esp32"));
app.use("/api", require("./routes/sensors"));
app.use("/api", require("./routes/system"));
app.use("/api", require("./routes/network"));
app.use("/api", require("./routes/dangers"));
app.use("/api", require("./routes/pi"));
app.use("/api", require("./routes/security"));
app.use("/api", require("./routes/ai"));
app.use("/api", require("./routes/diagnostic"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/nodes"));
// ======================================================
// ESP32 SERVER DISCOVERY
// ======================================================

app.get("/api/discovery", (req, res) => {
    res.json({
        status: "online",
        service: "Node.js ESP32 Backend"
    });
});


const PORT = process.env.PORT || 3000;


app.listen(PORT,()=>{

    console.log(`Server running on port ${PORT}`);

});