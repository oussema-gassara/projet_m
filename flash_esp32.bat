@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM =========================================================
REM  ESP32 AUTO FLASH
REM  Detecte les ports serie et permet de choisir celui a flasher.
REM  Plusieurs ESP32 peuvent rester connectes et fonctionner.
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
echo Ports serie detectes:
echo.

for /f "tokens=1" %%P in ('arduino-cli board list ^| findstr /R /B "COM[0-9][0-9]*"') do (
    set /a PORT_COUNT+=1
    set "PORT[!PORT_COUNT!]=%%P"
    echo   [!PORT_COUNT!] %%P
)

echo.

if "%PORT_COUNT%"=="0" (
    echo ERREUR: Aucun port serie detecte.
    echo Branche un ESP32 en USB puis relance ce fichier.
    pause
    exit /b 1
)

echo Details des cartes detectees:
echo.
arduino-cli board list
echo.

:SELECT_PORT
set "CHOICE="
set /p "CHOICE=Choisis le numero de l'ESP32 a flasher [1-%PORT_COUNT%]: "

if not defined CHOICE goto SELECT_PORT

set "PORT=!PORT[%CHOICE%]!"
if not defined PORT (
    echo.
    echo Choix invalide.
    goto SELECT_PORT
)

echo.
echo ESP32 selectionne: %PORT%
echo.
echo ATTENTION: seul %PORT% sera flashe.
echo Les autres ESP32 connectes continuent de fonctionner normalement.
echoice /C OAN /N /M "Confirmer le flash ? [O=Oui A=Annuler]: "
if errorlevel 2 (
    echo Flash annule.
    pause
    exit /b 0
)
if errorlevel 1 goto FLASH

goto SELECT_PORT

:FLASH
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
