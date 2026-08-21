@echo off
REM =========================================================
REM  SETUP - A executer UNE SEULE FOIS
REM  Installe arduino-cli, le coeur ESP32, et les librairies
REM  necessaires (ArduinoJson).
REM =========================================================

echo Telechargement d'arduino-cli...
powershell -Command "Invoke-WebRequest -Uri 'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip' -OutFile 'arduino-cli.zip'"

echo Extraction...
powershell -Command "Expand-Archive -Path 'arduino-cli.zip' -DestinationPath '.' -Force"
del arduino-cli.zip

echo Configuration d'arduino-cli...
arduino-cli.exe config init
arduino-cli.exe config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

echo Mise a jour de l'index des cartes...
arduino-cli.exe core update-index

echo Installation du coeur ESP32 (cela peut prendre plusieurs minutes)...
arduino-cli.exe core install esp32:esp32

echo Installation de la librairie ArduinoJson...
arduino-cli.exe lib install ArduinoJson

echo.
echo =========================================================
echo  Installation terminee !
echo  Tu peux maintenant utiliser flash_esp32.bat
echo =========================================================
pause
