@echo off
REM =========================================================
REM  FLASH ESP32 - Compile et televerse en un clic
REM  Carte : ESP32 Dev Module | Port : COM3
REM  (executer setup_arduino_cli.bat une fois avant d'utiliser ce script)
REM =========================================================

set SKETCH_PATH=..\arduinoIDE\espMonitoring.ino
set FQBN=esp32:esp32:esp32
set PORT=COM3

echo =========================================================
echo  Compilation du sketch...
echo =========================================================
arduino-cli.exe compile --fqbn %FQBN% "%SKETCH_PATH%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erreur de compilation. Verifie le code du sketch.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo  Televersement vers l'ESP32 (%PORT%)...
echo =========================================================
arduino-cli.exe upload -p %PORT% --fqbn %FQBN% "%SKETCH_PATH%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erreur de televersement. Verifie que l'ESP32 est bien branche sur %PORT%.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo  ✅ Flash termine avec succes !
echo =========================================================
pause
