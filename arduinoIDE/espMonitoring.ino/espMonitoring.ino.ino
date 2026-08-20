#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

#include "config.h"

// ======================================================
//                    GLOBAL OBJECTS
// ======================================================

WebServer configServer(CONFIG_PORT);
Preferences preferences;

// ======================================================
//                    WIFI VARIABLES
// ======================================================

String wifiSSID = "";
String wifiPassword = "";

String serverURL = "";

bool setupMode = false;
bool serverFound = false;

// ======================================================
//                    TIMING VARIABLES
// ======================================================

unsigned long lastSend = 0;
unsigned long reconnectCount = 0;

int lastHTTPResponse = 0;

// ======================================================
//                    STRESS TEST
// ======================================================

// Uncomment if you want CPU/RAM stress testing.

// #define STRESS_TEST_ENABLED

// ======================================================
//                FUNCTION DECLARATIONS
// ======================================================

// WiFi
void loadWiFiCredentials();
bool connectToWiFi();
void startConfigurationMode();
void handleConfigPage();
void handleSaveWiFi();
void handleConfigNotFound();
void reconnectWiFi();

// Server discovery
bool discoverServer();
bool testServer(String ip);

// Data
void sendData();

// Configuration
void saveWiFiCredentials(String ssid, String password);
void clearWiFiCredentials();

// Sensors / stress
#ifdef STRESS_TEST_ENABLED
void stressCPU(unsigned long durationMs);
void stressRAM();
#endif

// ======================================================
//                         SETUP
// ======================================================

void setup()
{
    Serial.begin(115200);

    delay(1000);

    Serial.println();
    Serial.println("==========================================");
    Serial.println("             ESP32 MONITORING");
    Serial.println("==========================================");

    // --------------------------------------------------
    // SENSOR PINS
    // --------------------------------------------------

    pinMode(MQ2_DIGITAL_PIN, INPUT);
    pinMode(HR202_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);

    analogReadResolution(12);

    // --------------------------------------------------
    // HOSTNAME
    // --------------------------------------------------

    WiFi.setHostname("ESP32-Monitor");

    // --------------------------------------------------
    // LOAD SAVED WIFI
    // --------------------------------------------------

    loadWiFiCredentials();

    // --------------------------------------------------
    // CONNECT TO WIFI
    // --------------------------------------------------

    if (wifiSSID.length() > 0)
    {
        Serial.println();
        Serial.println("Saved WiFi configuration found.");

        if (connectToWiFi())
        {
            Serial.println();
            Serial.println("New WiFi configuration works!");
            Serial.print("ESP32 IP: ");
            Serial.println(WiFi.localIP());

            // --------------------------------------------------
            // FIND NODE.JS SERVER
            // --------------------------------------------------

            if (discoverServer())
            {
                Serial.println();
                Serial.println("Node.js server discovered!");
                Serial.print("Server URL: ");
                Serial.println(serverURL);
            }
            else
            {
                Serial.println();
                Serial.println("Node.js server not found.");
                Serial.println("The ESP32 will retry later.");
            }
        }
        else
        {
            Serial.println();
            Serial.println("Could not connect to saved WiFi.");
            Serial.println("Starting configuration mode...");

            startConfigurationMode();
        }
    }
    else
    {
        Serial.println();
        Serial.println("No WiFi configuration found.");
        Serial.println("Starting configuration mode...");

        startConfigurationMode();
    }

#ifdef STRESS_TEST_ENABLED

    Serial.println();
    Serial.println("!!! STRESS TEST MODE ENABLED !!!");

#endif
}

// ======================================================
//                 LOAD WIFI CREDENTIALS
// ======================================================

void loadWiFiCredentials()
{
    preferences.begin("wifi", true);

    wifiSSID = preferences.getString("ssid", "");
    wifiPassword = preferences.getString("password", "");

    preferences.end();

    Serial.println();
    Serial.println("==========================================");
    Serial.println("             WIFI CONFIGURATION");
    Serial.println("==========================================");

    if (wifiSSID.length() == 0)
    {
        Serial.println("No saved WiFi credentials.");
    }
    else
    {
        Serial.print("Saved SSID: ");
        Serial.println(wifiSSID);
    }
}

// ======================================================
//                 SAVE WIFI CREDENTIALS
// ======================================================

void saveWiFiCredentials(String ssid, String password)
{
    preferences.begin("wifi", false);

    preferences.putString("ssid", ssid);
    preferences.putString("password", password);

    preferences.end();

    wifiSSID = ssid;
    wifiPassword = password;

    Serial.println();
    Serial.println("WiFi credentials saved.");
}

// ======================================================
//                 CLEAR WIFI CREDENTIALS
// ======================================================

void clearWiFiCredentials()
{
    preferences.begin("wifi", false);

    preferences.clear();

    preferences.end();

    wifiSSID = "";
    wifiPassword = "";

    Serial.println("WiFi credentials cleared.");
}

// ======================================================
//                    CONNECT WIFI
// ======================================================

bool connectToWiFi()
{
    Serial.println();
    Serial.println("==========================================");
    Serial.println("             CONNECTING TO WIFI");
    Serial.println("==========================================");

    Serial.print("SSID: ");
    Serial.println(wifiSSID);

    WiFi.mode(WIFI_STA);

    WiFi.disconnect(true);

    delay(500);

    WiFi.begin(
        wifiSSID.c_str(),
        wifiPassword.c_str()
    );

    unsigned long startTime = millis();

    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);

        Serial.print(".");

        if (millis() - startTime >= WIFI_CONNECT_TIMEOUT)
        {
            Serial.println();
            Serial.println("WiFi connection timeout.");

            WiFi.disconnect();

            return false;
        }
    }

    Serial.println();
    Serial.println();
    Serial.println("WiFi Connected!");

    Serial.print("IP Address : ");
    Serial.println(WiFi.localIP());

    Serial.print("Gateway    : ");
    Serial.println(WiFi.gatewayIP());

    Serial.print("Subnet     : ");
    Serial.println(WiFi.subnetMask());

    Serial.print("DNS        : ");
    Serial.println(WiFi.dnsIP());

    Serial.print("MAC        : ");
    Serial.println(WiFi.macAddress());

    Serial.print("RSSI       : ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    Serial.print("Hostname   : ");
    Serial.println(WiFi.getHostname());

    Serial.println("==========================================");

    return true;
}

// ======================================================
//                START CONFIGURATION MODE
// ======================================================

void startConfigurationMode()
{
    setupMode = true;

    WiFi.disconnect(true);

    delay(500);

    WiFi.mode(WIFI_AP);

    bool result = WiFi.softAP(
        AP_SSID,
        AP_PASSWORD
    );

    if (!result)
    {
        Serial.println("Failed to start Access Point.");

        return;
    }

    IPAddress apIP = WiFi.softAPIP();

    Serial.println();
    Serial.println("==========================================");
    Serial.println("          ESP32 WIFI CONFIGURATION");
    Serial.println("==========================================");

    Serial.print("Access Point : ");
    Serial.println(AP_SSID);

    Serial.print("Password     : ");
    Serial.println(AP_PASSWORD);

    Serial.print("Open browser : http://");
    Serial.println(apIP);

    Serial.println("==========================================");

    // --------------------------------------------------
    // ROUTES
    // --------------------------------------------------

    configServer.on("/", HTTP_GET, handleConfigPage);

    configServer.on(
        "/save",
        HTTP_POST,
        handleSaveWiFi
    );

    configServer.onNotFound(
        handleConfigNotFound
    );

    configServer.begin();

    Serial.println("Configuration server started.");
}

// ======================================================
//                 CONFIGURATION PAGE
// ======================================================

void handleConfigPage()
{
    String html = R"rawliteral(

<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
      content="width=device-width, initial-scale=1">

<title>ESP32 WiFi Setup</title>

<style>

body
{
    font-family: Arial;
    background: #f2f2f2;
    margin: 0;
    padding: 30px;
}

.container
{
    max-width: 450px;
    margin: auto;
    background: white;
    padding: 25px;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
}

h1
{
    text-align: center;
}

label
{
    display: block;
    margin-top: 15px;
    font-weight: bold;
}

input
{
    width: 100%;
    padding: 12px;
    margin-top: 7px;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 6px;
}

button
{
    width: 100%;
    padding: 13px;
    margin-top: 25px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
}

button:hover
{
    background: #0056b3;
}

.info
{
    margin-top: 15px;
    font-size: 14px;
    color: #555;
}

</style>

</head>

<body>

<div class="container">

<h1>ESP32 WiFi Setup</h1>

<p>
Connect the ESP32 to your WiFi network.
</p>

<form action="/save" method="POST">

<label>WiFi SSID</label>

<input
    type="text"
    name="ssid"
    placeholder="Enter WiFi name"
    required
>

<label>WiFi Password</label>

<input
    type="password"
    name="password"
    placeholder="Enter WiFi password"
    required
>

<button type="submit">
Connect ESP32
</button>

</form>

<div class="info">

After saving, the ESP32 will automatically
connect to the WiFi and discover the Node.js
server on the local network.

</div>

</div>

</body>

</html>

)rawliteral";

    configServer.send(
        200,
        "text/html",
        html
    );
}

// ======================================================
//                  SAVE WIFI FROM HTML
// ======================================================

void handleSaveWiFi()
{
    if (!configServer.hasArg("ssid") ||
        !configServer.hasArg("password"))
    {
        configServer.send(
            400,
            "text/plain",
            "Missing SSID or password."
        );

        return;
    }

    String newSSID =
        configServer.arg("ssid");

    String newPassword =
        configServer.arg("password");

    Serial.println();
    Serial.println("==========================================");
    Serial.println("          NEW WIFI CONFIGURATION");
    Serial.println("==========================================");

    Serial.print("SSID: ");
    Serial.println(newSSID);

    // Do NOT print the password

    saveWiFiCredentials(
        newSSID,
        newPassword
    );

    String html = R"rawliteral(

<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
      content="width=device-width, initial-scale=1">

<title>ESP32 Connecting</title>

<style>

body
{
    font-family: Arial;
    text-align: center;
    padding: 40px;
}

.box
{
    max-width: 450px;
    margin: auto;
}

</style>

</head>

<body>

<div class="box">

<h1>Configuration saved!</h1>

<p>
The ESP32 is now connecting to your WiFi.
</p>

<p>
You can close this page.
</p>

</div>

</body>

</html>

)rawliteral";

    configServer.send(
        200,
        "text/html",
        html
    );

    delay(2000);

    configServer.stop();

    WiFi.softAPdisconnect(true);

    setupMode = false;

    if (connectToWiFi())
    {
        Serial.println();
        Serial.println("==========================================");
        Serial.println("       WIFI CONFIGURATION SUCCESS");
        Serial.println("==========================================");

        Serial.print("ESP32 IP: ");
        Serial.println(WiFi.localIP());

        Serial.println("==========================================");

        // Find Node.js automatically

        if (discoverServer())
        {
            Serial.println();
            Serial.println("Node.js server discovered!");
            Serial.print("Server URL: ");
            Serial.println(serverURL);
        }
        else
        {
            Serial.println();
            Serial.println("Node.js server not found.");
        }
    }
    else
    {
        Serial.println();
        Serial.println("Could not connect to new WiFi.");

        startConfigurationMode();
    }
}

// ======================================================
//                 CONFIG NOT FOUND
// ======================================================

void handleConfigNotFound()
{
    configServer.send(
        404,
        "text/plain",
        "ESP32 configuration page not found."
    );
}

// ======================================================
//                 SERVER DISCOVERY
// ======================================================

bool discoverServer()
{
    Serial.println();
    Serial.println("==========================================");
    Serial.println("       NODE.JS SERVER DISCOVERY");
    Serial.println("==========================================");

    Serial.print("ESP32 IP : ");
    Serial.println(WiFi.localIP());

    Serial.print("Subnet   : ");
    Serial.println(WiFi.subnetMask());

    Serial.println();
    Serial.println("Scanning local network...");

    IPAddress localIP = WiFi.localIP();
    IPAddress subnet = WiFi.subnetMask();

    // --------------------------------------------------
    // Calculate network address
    // --------------------------------------------------

    IPAddress network;

    for (int i = 0; i < 4; i++)
    {
        network[i] =
            localIP[i] & subnet[i];
    }

    // --------------------------------------------------
    // Scan hosts
    // --------------------------------------------------

    for (
        int host = SERVER_SCAN_START;
        host <= SERVER_SCAN_END;
        host++
    )
    {
        IPAddress targetIP(
            network[0],
            network[1],
            network[2],
            host
        );

        // Don't scan the ESP32 itself

        if (targetIP == localIP)
        {
            continue;
        }

        Serial.print("Checking ");
        Serial.print(targetIP);
        Serial.println("...");

        if (testServer(targetIP.toString()))
        {
            serverURL =
                "http://" +
                targetIP.toString() +
                ":" +
                String(SERVER_PORT) +
                String(API_PATH);

            Serial.println();
            Serial.println("==========================================");
            Serial.println("       NODE.JS SERVER FOUND");
            Serial.println("==========================================");

            Serial.print("Server IP : ");
            Serial.println(targetIP);

            Serial.print("Server URL: ");
            Serial.println(serverURL);

            Serial.println("==========================================");

            serverFound = true;

            return true;
        }
    }

    Serial.println();
    Serial.println("Node.js server not found.");

    serverFound = false;

    return false;
}

// ======================================================
//                   TEST NODE SERVER
// ======================================================

bool testServer(String ip)
{
    WiFiClient client;

    client.setTimeout(
        SERVER_SCAN_TIMEOUT
    );

    if (!client.connect(
        ip.c_str(),
        SERVER_PORT
    ))
    {
        return false;
    }

    // --------------------------------------------------
    // Send HTTP GET
    // --------------------------------------------------

    client.print(
        String("GET ") +
        DISCOVERY_PATH +
        " HTTP/1.1\r\n" +
        "Host: " +
        ip +
        "\r\n" +
        "Connection: close\r\n\r\n"
    );

    unsigned long start = millis();

    while (
        !client.available() &&
        millis() - start <
        SERVER_SCAN_TIMEOUT
    )
    {
        delay(5);
    }

    if (!client.available())
    {
        client.stop();

        return false;
    }

    String statusLine =
        client.readStringUntil('\n');

    client.stop();

    statusLine.trim();

    // We only need the server to answer.

    if (statusLine.startsWith("HTTP/"))
    {
        return true;
    }

    return false;
}

// ======================================================
//               AUTOMATIC WIFI RECONNECT
// ======================================================

void reconnectWiFi()
{
    if (setupMode)
    {
        return;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        return;
    }

    reconnectCount++;

    Serial.println();
    Serial.println("WiFi Lost...");
    Serial.println("Trying to reconnect...");

    if (connectToWiFi())
    {
        Serial.println("WiFi Reconnected.");

        // The IP may have changed.
        // Therefore discover server again.

        serverFound = false;

        discoverServer();
    }
}

// ======================================================
//                  STRESS TEST CPU
// ======================================================

#ifdef STRESS_TEST_ENABLED

void stressCPU(unsigned long durationMs)
{
    Serial.println(">>> Stressing CPU...");

    unsigned long start =
        millis();

    volatile double x = 1.0;

    while (
        millis() - start <
        durationMs
    )
    {
        x += sin(x) * cos(x);
    }

    Serial.println(
        ">>> CPU stress complete."
    );
}

#endif

// ======================================================
//                  STRESS TEST RAM
// ======================================================

#ifdef STRESS_TEST_ENABLED

void stressRAM()
{
    Serial.println(">>> Stressing RAM...");

    const int chunkSize = 1024;

    const int numChunks = 50;

    void* chunks[numChunks];

    for (
        int i = 0;
        i < numChunks;
        i++
    )
    {
        chunks[i] =
            malloc(chunkSize);

        if (chunks[i] != NULL)
        {
            memset(
                chunks[i],
                0xFF,
                chunkSize
            );
        }

        delay(50);
    }

    Serial.print(
        "Free heap during stress: "
    );

    Serial.println(
        ESP.getFreeHeap()
    );

    delay(3000);

    for (
        int i = 0;
        i < numChunks;
        i++
    )
    {
        if (chunks[i] != NULL)
        {
            free(chunks[i]);
        }
    }

    Serial.println(
        ">>> RAM stress complete."
    );
}

#endif

// ======================================================
//                  SEND DATA
// ======================================================

void sendData()
{
    reconnectWiFi();

    // --------------------------------------------------
    // Make sure WiFi is available
    // --------------------------------------------------

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println(
            "WiFi not connected."
        );

        return;
    }

    // --------------------------------------------------
    // Make sure server is known
    // --------------------------------------------------

    if (!serverFound ||
        serverURL.length() == 0)
    {
        Serial.println();
        Serial.println(
            "No server URL available."
        );

        Serial.println(
            "Trying server discovery..."
        );

        if (!discoverServer())
        {
            Serial.println(
                "Server still not found."
            );

            return;
        }
    }

#ifdef STRESS_TEST_ENABLED

    stressCPU(2000);

    stressRAM();

#endif

    // ==================================================
    // LM35
    // ==================================================

    int lm35Raw =
        analogRead(LM35_PIN);

    float voltage =
        (lm35Raw * 3.3) /
        4095.0;

    float externalTemperature =
        voltage * 100.0;

    // ==================================================
    // MQ2
    // ==================================================

    int gasAnalog =
        analogRead(
            MQ2_ANALOG_PIN
        );

    int gasDigital =
        digitalRead(
            MQ2_DIGITAL_PIN
        );

    // ==================================================
    // HR202
    // ==================================================

    int humidityState =
        digitalRead(
            HR202_PIN
        );

    // ==================================================
    // ESP32 INFORMATION
    // ==================================================

    float cpuTemperature =
        temperatureRead();

    uint32_t totalRAM =
        ESP.getHeapSize();

    uint32_t freeRAM =
        ESP.getFreeHeap();

    uint32_t usedRAM =
        totalRAM - freeRAM;

    uint32_t minFreeRAM =
        ESP.getMinFreeHeap();

    int cpuFrequency =
        getCpuFrequencyMhz();

    int cpuCores =
        ESP.getChipCores();

    int activeCore =
        xPortGetCoreID();

    uint32_t flashSize =
        ESP.getFlashChipSize();

    uint32_t sketchSize =
        ESP.getSketchSize();

    uint32_t freeSketch =
        ESP.getFreeSketchSpace();

    uint32_t chipRevision =
        ESP.getChipRevision();

    String chipModel =
        ESP.getChipModel();

    String sdkVersion =
        ESP.getSdkVersion();

    uint32_t uptime =
        millis() / 1000;

    // ==================================================
    // NETWORK INFORMATION
    // ==================================================

    String ipAddress =
        WiFi.localIP().toString();

    String gateway =
        WiFi.gatewayIP().toString();

    String subnet =
        WiFi.subnetMask().toString();

    String dns =
        WiFi.dnsIP().toString();

    String macAddress =
        WiFi.macAddress();

    String hostname =
        WiFi.getHostname();

    int wifiRSSI =
        WiFi.RSSI();

    String wifiStatus =
        (WiFi.status() ==
         WL_CONNECTED)
        ? "Connected"
        : "Disconnected";

    // ==================================================
    // STATUS
    // ==================================================

    String status = "NORMAL";

    if (
        gasAnalog > 2500 ||
        freeRAM < 80000 ||
        externalTemperature > 50
    )
    {
        status = "DANGER";

        digitalWrite(
            LED_PIN,
            HIGH
        );
    }
    else if (
        gasAnalog > 1500 ||
        freeRAM < 150000 ||
        externalTemperature > 35
    )
    {
        status = "WARNING";

        digitalWrite(
            LED_PIN,
            LOW
        );
    }
    else
    {
        digitalWrite(
            LED_PIN,
            LOW
        );
    }

    // ==================================================
    // JSON
    // ==================================================

    StaticJsonDocument<2048> json;

    json["node_name"] =
        DEFAULT_NODE_NAME;

    json["cpu_temperature"] =
        cpuTemperature;

    json["external_temperature"] =
        externalTemperature;

    json["humidity"] =
        humidityState;

    json["gas_level"] =
        gasAnalog;

    json["gas_alarm"] =
        gasDigital;

    json["total_ram"] =
        totalRAM;

    json["free_ram"] =
        freeRAM;

    json["used_ram"] =
        usedRAM;

    json["minimum_free_ram"] =
        minFreeRAM;

    json["cpu_frequency"] =
        cpuFrequency;

    json["cpu_cores"] =
        cpuCores;

    json["active_core"] =
        activeCore;

    json["wifi_signal"] =
        wifiRSSI;

    json["wifi_status"] =
        wifiStatus;

    json["ip_address"] =
        ipAddress;

    json["gateway"] =
        gateway;

    json["subnet"] =
        subnet;

    json["dns"] =
        dns;

    json["mac_address"] =
        macAddress;

    json["hostname"] =
        hostname;

    json["chip_model"] =
        chipModel;

    json["chip_revision"] =
        chipRevision;

    json["flash_size"] =
        flashSize;

    json["sketch_size"] =
        sketchSize;

    json["free_sketch"] =
        freeSketch;

    json["sdk_version"] =
        sdkVersion;

    json["uptime"] =
        uptime;

    json["reconnects"] =
        reconnectCount;

    json["status"] =
        status;

    // ==================================================
    // CONVERT JSON
    // ==================================================

    String output;

    serializeJsonPretty(
        json,
        output
    );

    Serial.println();
    Serial.println(
        "=========================================="
    );

    Serial.println(
        "ESP32 MONITORING DATA"
    );

    Serial.println(
        "=========================================="
    );

    Serial.println(output);

    // ==================================================
    // SEND TO NODE.JS
    // ==================================================

    HTTPClient http;

    Serial.print(
        "Sending data to: "
    );

    Serial.println(
        serverURL
    );

    http.begin(
        serverURL
    );

    http.addHeader(
        "Content-Type",
        "application/json"
    );

    lastHTTPResponse =
        http.POST(output);

    Serial.println(
        "------------------------------------------"
    );

    Serial.print(
        "HTTP Response Code : "
    );

    Serial.println(
        lastHTTPResponse
    );

    if (lastHTTPResponse > 0)
    {
        String response =
            http.getString();

        Serial.print(
            "Server Response : "
        );

        Serial.println(
            response
        );
    }
    else
    {
        Serial.println(
            "Failed to send data."
        );

        // Server might have disappeared.

        serverFound = false;

        serverURL = "";
    }

    http.end();

    Serial.println(
        "=========================================="
    );
}

// ======================================================
//                         LOOP
// ======================================================

void loop()
{
    // --------------------------------------------------
    // CONFIGURATION MODE
    // --------------------------------------------------

    if (setupMode)
    {
        configServer.handleClient();

        delay(5);

        return;
    }

    // --------------------------------------------------
    // WIFI
    // --------------------------------------------------

    reconnectWiFi();

    // --------------------------------------------------
    // SEND DATA
    // --------------------------------------------------

    if (
        millis() - lastSend >=
        SEND_INTERVAL
    )
    {
        lastSend = millis();

        sendData();
    }

    delay(10);
}