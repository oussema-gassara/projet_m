const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");

const router = express.Router();

const MIN_FORECAST_ROWS = 20;
const WIFI_FORECAST_ROWS = 120;
const WIFI_LOCAL_ROWS = 60;
const WIFI_SMOOTHING_WINDOW = 5;
const WIFI_RECENT_LEVEL_ROWS = 15;
const WIFI_DEGRADATION_DAMPING = 0.5;
const WIFI_IMPROVEMENT_DAMPING = 0.25;
const WIFI_MAX_TREND_PER_MINUTE = 1.0;

async function getWifiSignalHistory(nodeName) {
    const [rows] = await db.promise().query(
        `SELECT created_at, wifi_signal
         FROM monitoring_data
         WHERE node_name = ?
           AND wifi_signal IS NOT NULL
         ORDER BY created_at DESC
         LIMIT ?`,
        [nodeName, WIFI_FORECAST_ROWS]
    );

    return rows
        .reverse()
        .map((row) => ({
            createdAt: new Date(row.created_at),
            value: Number(row.wifi_signal),
        }))
        .filter(
            (row) =>
                !Number.isNaN(row.createdAt.getTime()) &&
                Number.isFinite(row.value)
        );
}

function unavailableWifiForecast(reason, rowsUsed = 0) {
    return {
        available: false,
        reason,
        rows_used: rowsUsed,
        forecast: [],
        unit: "dBm",
        model: "RSSI lissé + tendance locale amortie",
    };
}

function median(values) {
    if (!values.length) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function smoothWifiPoints(points) {
    return points.map((point, index) => {
        const start = Math.max(0, index - WIFI_SMOOTHING_WINDOW + 1);
        const windowValues = points
            .slice(start, index + 1)
            .map((item) => item.y);

        return {
            x: point.x,
            y: median(windowValues),
        };
    });
}

function forecastWifiSignal(history) {
    if (history.length < MIN_FORECAST_ROWS) {
        return unavailableWifiForecast(
            "Pas encore assez de données historiques",
            history.length
        );
    }

    // RSSI changes quickly. Use only the most recent local window instead of
    // extrapolating a long global regression far into the future.
    const localHistory = history.slice(-WIFI_LOCAL_ROWS);
    const firstTime = localHistory[0].createdAt.getTime();
    const rawPoints = localHistory.map((row) => ({
        x: (row.createdAt.getTime() - firstTime) / 60_000,
        y: row.value,
    }));

    if (rawPoints[rawPoints.length - 1].x <= rawPoints[0].x) {
        return unavailableWifiForecast(
            "Les données historiques ne contiennent pas assez de variation temporelle",
            localHistory.length
        );
    }

    // A rolling median removes short RSSI spikes without hiding the recent
    // signal level. The forecast is anchored on the recent median, which
    // prevents the regression intercept from predicting a much stronger
    // signal while the measured RSSI is already weak.
    const points = smoothWifiPoints(rawPoints);
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;

    let numerator = 0;
    let denominator = 0;

    for (const point of points) {
        numerator += (point.x - meanX) * (point.y - meanY);
        denominator += (point.x - meanX) ** 2;
    }

    if (denominator === 0) {
        return unavailableWifiForecast(
            "Impossible de calculer la tendance du signal Wi-Fi",
            localHistory.length
        );
    }

    const rawTrendPerMinute = numerator / denominator;
    const trendPerMinute = clamp(
        rawTrendPerMinute,
        -WIFI_MAX_TREND_PER_MINUTE,
        WIFI_MAX_TREND_PER_MINUTE
    );

    // A temporary positive RSSI spike can look like a strong recovery.
    // Improvements are therefore damped more than degradations.
    const damping =
        trendPerMinute > 0
            ? WIFI_IMPROVEMENT_DAMPING
            : WIFI_DEGRADATION_DAMPING;
    const effectiveTrendPerMinute = trendPerMinute * damping;

    const recentValues = rawPoints
        .slice(-WIFI_RECENT_LEVEL_ROWS)
        .map((point) => point.y);
    const recentLevel = median(recentValues);

    const forecast = [1, 2, 3, 4, 5].map((minutesAhead) => ({
        minutes_ahead: minutesAhead,
        value: Number(
            (recentLevel + effectiveTrendPerMinute * minutesAhead).toFixed(2)
        ),
    }));

    return {
        available: true,
        current: Number(rawPoints[rawPoints.length - 1].y.toFixed(2)),
        smoothed_current: Number(recentLevel.toFixed(2)),
        predicted_5min: forecast[forecast.length - 1].value,
        trend_per_minute: Number(effectiveTrendPerMinute.toFixed(4)),
        raw_trend_per_minute: Number(rawTrendPerMinute.toFixed(4)),
        forecast,
        rows_used: localHistory.length,
        unit: "dBm",
        model: "RSSI lissé + tendance locale amortie",
    };
}

async function addWifiForecast(nodeForecast) {
    const nodeName = String(nodeForecast?.node_name || "");

    if (!nodeName) {
        return nodeForecast;
    }

    try {
        const history = await getWifiSignalHistory(nodeName);
        const wifiForecast = forecastWifiSignal(history);

        return {
            ...nodeForecast,
            forecasts: {
                ...(nodeForecast.forecasts || {}),
                wifi_signal: wifiForecast,
            },
        };
    } catch (error) {
        console.error(`Wi-Fi forecast error for ${nodeName}:`, error);

        return {
            ...nodeForecast,
            forecasts: {
                ...(nodeForecast.forecasts || {}),
                wifi_signal: unavailableWifiForecast(
                    "Impossible de calculer la prédiction du signal Wi-Fi"
                ),
            },
        };
    }
}

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

        if (response.ok && Array.isArray(data.forecasts)) {
            data.forecasts = await Promise.all(
                data.forecasts.map(addWifiForecast)
            );
        }

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

router.get("/ai/evaluate", (req, res) => {
    const scriptPath = path.resolve(__dirname, "..", "ai_evaluation.py");
    const pythonCommand =
        process.env.PYTHON_PATH ||
        (process.platform === "win32"
            ? "C:\\Python314\\python.exe"
            : "python3");

    const child = spawn(pythonCommand, [scriptPath], {
        shell: false,
        windowsHide: true,
        env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUTF8: "1",
        },
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = setTimeout(() => {
        if (finished) return;
        child.kill();
    }, 30000);

    child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        console.error("Unable to start AI evaluation:", error);
        return res.status(500).json({
            available: false,
            error: "Impossible de démarrer l'évaluation du modèle IA.",
        });
    });

    child.on("close", () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        const finalLine = stdout
            .split(/\r?\n/)
            .reverse()
            .find((line) => line.startsWith("FINAL_RESULT_JSON="));

        if (!finalLine) {
            if (stderr) console.error(stderr);
            return res.status(500).json({
                available: false,
                error: "L'évaluation du modèle IA n'a pas retourné de résultat.",
            });
        }

        try {
            const result = JSON.parse(
                finalLine.slice("FINAL_RESULT_JSON=".length)
            );
            return res.json(result);
        } catch (error) {
            console.error("Invalid AI evaluation JSON:", error);
            return res.status(500).json({
                available: false,
                error: "Le résultat de l'évaluation IA est invalide.",
            });
        }
    });
});

module.exports = router;
