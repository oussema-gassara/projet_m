@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM =========================================================
REM  ESP32 AUTO FLASH
REM  Detecte automatiquement le port COM si un seul ESP32 est branche.
REM =========================================================

cd /d "%~dp0"
set "SKETCH_PATH=arduinoIDE\espMonitoring.ino"
set "FQBN=esp32:esp32:esp32"
set "PORT="
set "PORT_COUNT=0"

if not exist "%SKETCH_PATH%" (
    echo ERREUR: Sketch introuvable: %SKETCH_PATH%
    pause
    exit /b 1
)

echo =========================================================
echo          ESP32 AUTO FLASH
echo =========================================================
echo.
echo Detection du port ESP32...

for /f "tokens=1" %%P in ('arduino-cli board list ^| findstr /R /B "COM[0-9][0-9]*"') do (
    set /a PORT_COUNT+=1
    set "FOUND_PORT=%%P"
    echo Port detecte: %%P
)

echo.

if "%PORT_COUNT%"=="0" (
    echo ERREUR: Aucun port serie detecte.
    echo Branche un ESP32 en USB puis relance ce fichier.
    pause
    exit /b 1
)

if not "%PORT_COUNT%"=="1" (
    echo ERREUR: Plusieurs ports serie sont detectes.
    echo Pour eviter de flasher le mauvais ESP32, laisse un seul ESP32 branche.
    echo.
    arduino-cli board list
    pause
    exit /b 1
)

set "PORT=%FOUND_PORT%"
echo Port utilise: %PORT%
echo.

echo =========================================================
echo          COMPILATION
echo =========================================================
arduino-cli compile --fqbn %FQBN% "%SKETCH_PATH%"
if errorlevel 1 (
    echo.
    echo ERREUR: Compilation echouee.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo          TELEVERSEMENT VERS %PORT%
echo =========================================================
arduino-cli upload -p %PORT% --fqbn %FQBN% "%SKETCH_PATH%"
if errorlevel 1 (
    echo.
    echo ERREUR: Televersement echoue.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo          FLASH TERMINE AVEC SUCCES
 echo =========================================================
echo.
echo Si c'est une nouvelle carte, connecte-toi a ESP32-SETUP.
echo Puis ouvre http://192.168.4.1
 echo Configure un nom unique: esp32-1, esp32-2, esp32-3, etc.
echo Le nom est sauvegarde dans la memoire de l'ESP32.
echo.
pause
exit /b 0
