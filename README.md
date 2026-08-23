# Projet M - ESP32 / Raspberry Pi Monitoring

An IoT monitoring stack: ESP32 sensor nodes and Raspberry Pi devices report
system/sensor data to a central API, which a React dashboard visualizes in
real time. Includes JWT-based admin login, multi-node support, danger event
detection/history, and an ML service for anomaly detection and forecasting.

## Architecture

- **`front_end/`** - React (Vite) dashboard. Displays live ESP32/Raspberry Pi
  metrics, network status, security/danger events, and AI predictions.
- **`back_end/`** - Node.js/Express REST API backed by MySQL. Handles auth,
  node registration, and ingesting/serving sensor data.
- **`back_end/ai_service.py`** - Flask microservice used by the backend for
  anomaly detection and forecasting (scikit-learn).
- **`arduinoIDE/`** - ESP32 firmware (Arduino sketches) that reports sensor
  readings to the backend.
- **`data_base/`** - MySQL schema (`satagedete.sql.txt`) and migration
  (`migration_auth_nodes.sql`).
- **`tools/`** - Helper scripts to install `arduino-cli` and flash the ESP32.

## Setup

### 1. Database

Run against a MySQL server, in order:

```sql
SOURCE data_base/satagedete.sql.txt;
SOURCE data_base/migration_auth_nodes.sql;
```

Then create an admin user with `back_end/seed_admin.js` (see that file for
usage).

### 2. Backend API

```bash
cd back_end
npm install
cp .env.example .env   # fill in DB_PASSWORD, JWT_SECRET, etc.
npm start
```

### 3. AI service (optional, needed for the AI/prediction panels)

```bash
cd back_end
pip install -r requirements.txt
python ai_service.py
```

### 4. Frontend

```bash
cd front_end
npm install
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:3000
npm run dev
```

### 5. ESP32 firmware

Run `tools/setup_arduino_cli.bat` once, then `tools/flash_esp32.bat` (or
`start.bat`, which compiles/uploads automatically) to flash
`arduinoIDE/espMonitoring.ino`. Set the Wi-Fi credentials and backend URL in
`arduinoIDE/espMonitoring.ino/config.h` first.

### All-in-one (Windows)

`start.bat` starts the backend, AI service, and frontend, then compiles and
uploads the ESP32 firmware. Edit the `ESP32_PORT` variable at the top if your
board isn't on COM3. `launch.vbs` runs it silently (no console window).

## Notes

- `seed_admin.js` creates a default `admin` / `admin` account - change that
  password immediately after seeding (there's no in-app password change flow
  yet, so update it directly in the `users` table with a new bcrypt hash).
- The AI service currently only analyzes ESP32 data (see the comment at the
  top of `ai_service.py`); Raspberry Pi metrics aren't fed into it yet.
- No automated tests or CI exist yet.
