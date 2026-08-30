@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo        ESP32 LOCAL DIAGNOSTIC
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH.
    pause
    exit /b 1
)

python -m pip show pyserial >nul 2>&1
if errorlevel 1 (
    echo PySerial is not installed.
    echo Installing PySerial...
    python -m pip install pyserial
    if errorlevel 1 (
        echo Failed to install PySerial.
        pause
        exit /b 1
    )
)

python diagnostic_esp32.py

echo.
echo ========================================
echo Diagnostic finished.
echo ========================================
pause
