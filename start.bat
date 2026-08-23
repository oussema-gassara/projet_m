@echo off
title ESP32 Monitoring Project

:: Root of the project = the folder this script lives in.
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: Serial port the ESP32 is connected to - adjust for your machine.
set "ESP32_PORT=COM3"

echo ==========================================
echo       STARTING MONITORING PROJECT
echo ==========================================
echo.

:: ==========================================
:: START BACKEND
:: ==========================================

echo Starting Node.js backend...

start /min "" cmd /c "cd /d "%PROJECT_DIR%\back_end" && node server.js"

timeout /t 2 /nobreak >nul


:: ==========================================
:: START AI SERVICE
:: ==========================================

echo Starting AI service...

start /min "" cmd /c "cd /d "%PROJECT_DIR%\back_end" && py ai_service.py"

timeout /t 2 /nobreak >nul


:: ==========================================
:: START FRONTEND
:: ==========================================

echo Starting React frontend...

start /min "" cmd /c "cd /d "%PROJECT_DIR%\front_end" && npm run dev"

timeout /t 10 /nobreak >nul


:: ==========================================
:: ESP32 COMPILE + UPLOAD
:: ==========================================

echo.
echo ==========================================
echo       COMPILING ESP32
echo ==========================================
echo.

cd /d "%PROJECT_DIR%\arduinoIDE\espMonitoring.ino"

arduino-cli compile --fqbn esp32:esp32:esp32 espMonitoring.ino.ino

if errorlevel 1 (
    echo.
    echo ERROR: ESP32 compilation failed.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo       UPLOADING ESP32
echo ==========================================
echo.

arduino-cli upload -p %ESP32_PORT% --fqbn esp32:esp32:esp32 espMonitoring.ino.ino

if errorlevel 1 (
    echo.
    echo ERROR: ESP32 upload failed.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo       ESP32 UPLOAD SUCCESSFUL
echo ==========================================
echo.


:: ==========================================
:: OPEN FRONTEND
:: ==========================================

taskkill /F /IM msedge.exe >nul 2>&1

timeout /t 1 /nobreak >nul

start /wait "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173 --window-size=1280,800


:: ==========================================
:: STOP PROJECT
:: ==========================================

echo.
echo Closing project...

taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

echo.
echo Project closed.