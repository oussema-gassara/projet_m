#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

#include "config.h"

WebServer configServer(CONFIG_PORT);
Preferences preferences;

String wifiSSID = "";
String wifiPassword = "";
String nodeName = DEFAULT_NODE_NAME;
String serverURL = "";

bool setupMode = false;
bool serverFound = false;
volatile bool diagnosticBusy = false;

unsigned long lastSend = 0;
unsigned long reconnectCount = 0;
int lastHTTPResponse = 0;

void startDiagnosticTask();
void loadConfiguration();
void saveConfiguration(const String &ssid, const String &password, const String &name);
void clearConfiguration();
bool connectToWiFi();
void startConfigurationMode();
void handleConfigPage();
void handleSaveConfiguration();
void handleConfigNotFound();
void reconnectWiFi();
bool discoverServer();
bool testServer(const String &ip);
void sendData();

void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("==========================================");
    Serial.println("             ESP32 MONITORING");
    Serial.println("==========================================");

    pinMode(MQ2_DIGITAL_PIN, INPUT);
    pinMode(HR202_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    analogReadResolution(12);

    loadConfiguration();
    startDiagnosticTask();

    WiFi.setHostname("ESP32-Monitor");

    if (wifiSSID.length() == 0)
    {
        Serial.println("No WiFi configuration found.");
        startConfigurationMode();
        return;
    }

    Serial.println("Saved WiFi configuration found.");
    Serial.print("Node Name : ");
    Serial.println(nodeName);

    if (connectToWiFi())
    {
        if (discoverServer())
        {
            Serial.print("Server URL: ");
            Serial.println(serverURL);
        }
        else
        {
            Serial.println("Node.js server not found. It will retry later.");
        }
    }
    else
    {
        Serial.println("Could not connect to saved WiFi.");
        startConfigurationMode();
    }
}

void loadConfiguration()
{
    preferences.begin("wifi", true);
    wifiSSID = preferences.getString("ssid", "");
    wifiPassword = preferences.getString("password", "");
    nodeName = preferences.getString("node", DEFAULT_NODE_NAME);
    preferences.end();

    if (nodeName.length() == 0) nodeName = DEFAULT_NODE_NAME;

    Serial.println();
    Serial.println("==========================================");
    Serial.println("          SAVED CONFIGURATION");
    Serial.println("==========================================");
    Serial.print("SSID      : ");
    Serial.println(wifiSSID.length() ? wifiSSID : "<not configured>");
    Serial.print("Node Name : ");
    Serial.println(nodeName);
}

void saveConfiguration(const String &ssid, const String &password, const String &name)
{
    preferences.begin("wifi", false);
    preferences.putString("ssid", ssid);
    preferences.putString("password", password);
    preferences.putString("node", name);
    preferences.end();

    wifiSSID = ssid;
    wifiPassword = password;
    nodeName = name.length() ? name : DEFAULT_NODE_NAME;

    Serial.println("Configuration saved.");
    Serial.print("Node Name : ");
    Serial.println(nodeName);
}

void clearConfiguration()
{
    preferences.begin("wifi", false);
    preferences.clear();
    preferences.end();
    wifiSSID = "";
    wifiPassword = "";
    nodeName = DEFAULT_NODE_NAME;
}

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
    WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());

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
    Serial.println("WiFi Connected!");
    Serial.print("Node Name  : "); Serial.println(nodeName);
    Serial.print("IP Address : "); Serial.println(WiFi.localIP());
    Serial.print("Gateway    : "); Serial.println(WiFi.gatewayIP());
    Serial.print("Subnet     : "); Serial.println(WiFi.subnetMask());
    Serial.print("DNS        : "); Serial.println(WiFi.dnsIP());
    Serial.print("MAC        : "); Serial.println(WiFi.macAddress());
    Serial.print("RSSI       : "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
    Serial.println("==========================================");
    return true;
}

void startConfigurationMode()
{
    setupMode = true;
    serverFound = false;
    serverURL = "";

    WiFi.disconnect(true);
    delay(500);
    WiFi.mode(WIFI_AP);

    if (!WiFi.softAP(AP_SSID, AP_PASSWORD))
    {
        Serial.println("Failed to start Access Point.");
        return;
    }

    Serial.println();
    Serial.println("==========================================");
    Serial.println("          ESP32 WIFI CONFIGURATION");
    Serial.println("==========================================");
    Serial.print("Access Point : "); Serial.println(AP_SSID);
    Serial.print("Password     : "); Serial.println(AP_PASSWORD);
    Serial.print("Open browser : http://"); Serial.println(WiFi.softAPIP());
    Serial.print("Current node : "); Serial.println(nodeName);
    Serial.println("==========================================");

    configServer.on("/", HTTP_GET, handleConfigPage);
    configServer.on("/save", HTTP_POST, handleSaveConfiguration);
    configServer.onNotFound(handleConfigNotFound);
    configServer.begin();
    Serial.println("Configuration server started.");
}

void handleConfigPage()
{
    String html = R"rawliteral(
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>ESP32 Setup</title>
<style>body{font-family:Arial;background:#f2f2f2;margin:0;padding:30px}.container{max-width:450px;margin:auto;background:white;padding:25px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,.15)}h1{text-align:center}label{display:block;margin-top:15px;font-weight:bold}input{width:100%;padding:12px;margin-top:7px;box-sizing:border-box;border:1px solid #ccc;border-radius:6px}button{width:100%;padding:13px;margin-top:25px;background:#007bff;color:white;border:0;border-radius:6px;font-size:16px;cursor:pointer}.info{margin-top:15px;font-size:14px;color:#555}</style></head>
<body><div class="container"><h1>ESP32 Setup</h1><p>Configure WiFi and identify this ESP32 node.</p><form action="/save" method="POST">
<label>WiFi SSID</label><input type="text" name="ssid" value=")rawliteral";
    html += wifiSSID;
    html += R"rawliteral(" required><label>WiFi Password</label><input type="password" name="password" placeholder="Enter WiFi password" required>
<label>Node Name</label><input type="text" name="node_name" value=")rawliteral";
    html += nodeName;
    html += R"rawliteral(" placeholder="esp32-1" required><button type="submit">Save & Connect</button></form>
<div class="info">Choose a unique name such as <b>esp32-1</b>, <b>esp32-2</b> or <b>esp32-3</b>.<br>The same firmware can be used on all boards.</div></div></body></html>)rawliteral";
    configServer.send(200, "text/html", html);
}

void handleSaveConfiguration()
{
    if (!configServer.hasArg("ssid") || !configServer.hasArg("password") || !configServer.hasArg("node_name"))
    {
        configServer.send(400, "text/plain", "Missing SSID, password or node name.");
        return;
    }

    String newSSID = configServer.arg("ssid");
    String newPassword = configServer.arg("password");
    String newNodeName = configServer.arg("node_name");
    newSSID.trim();
    newNodeName.trim();

    if (newSSID.length() == 0 || newNodeName.length() == 0)
    {
        configServer.send(400, "text/plain", "SSID and node name cannot be empty.");
        return;
    }

    saveConfiguration(newSSID, newPassword, newNodeName);
    configServer.send(200, "text/html", "<html><body style='font-family:Arial;text-align:center;padding:40px'><h1>Configuration saved!</h1><p>The ESP32 is connecting to the WiFi.</p><p>You can close this page.</p></body></html>");

    delay(1500);
    configServer.stop();
    WiFi.softAPdisconnect(true);
    setupMode = false;

    if (connectToWiFi())
    {
        if (discoverServer())
        {
            Serial.print("Server URL: ");
            Serial.println(serverURL);
        }
        else Serial.println("Node.js server not found.");
    }
    else
    {
        Serial.println("Could not connect to new WiFi.");
        startConfigurationMode();
    }
}

void handleConfigNotFound()
{
    configServer.send(404, "text/plain", "ESP32 configuration page not found.");
}

bool discoverServer()
{
    if (WiFi.status() != WL_CONNECTED || diagnosticBusy)
        return false;

    Serial.println();
    Serial.println("==========================================");
    Serial.println("       NODE.JS SERVER DISCOVERY");
    Serial.println("==========================================");
    Serial.print("ESP32 IP : "); Serial.println(WiFi.localIP());
    Serial.print("Subnet   : "); Serial.println(WiFi.subnetMask());
    Serial.println("Scanning local network...");

    IPAddress localIP = WiFi.localIP();
    IPAddress subnet = WiFi.subnetMask();
    IPAddress network;
    for (int i = 0; i < 4; i++) network[i] = localIP[i] & subnet[i];

    for (int host = SERVER_SCAN_START; host <= SERVER_SCAN_END; host++)
    {
        if (diagnosticBusy) return false;

        IPAddress targetIP(network[0], network[1], network[2], host);
        if (targetIP == localIP) continue;

        Serial.print("Checking ");
        Serial.print(targetIP);
        Serial.println("...");

        if (testServer(targetIP.toString()))
        {
            if (diagnosticBusy) return false;
            serverURL = "http://" + targetIP.toString() + ":" + String(SERVER_PORT) + String(API_PATH);
            serverFound = true;
            Serial.println();
            Serial.println("==========================================");
            Serial.println("       NODE.JS SERVER FOUND");
            Serial.println("==========================================");
            Serial.print("Server IP  : "); Serial.println(targetIP);
            Serial.print("Server URL : "); Serial.println(serverURL);
            Serial.println("==========================================");
            return true;
        }
    }

    serverFound = false;
    Serial.println("Node.js server not found.");
    return false;
}

bool testServer(const String &ip)
{
    if (diagnosticBusy) return false;

    WiFiClient client;
    client.setTimeout(SERVER_SCAN_TIMEOUT);
    if (!client.connect(ip.c_str(), SERVER_PORT)) return false;

    client.print(String("GET ") + DISCOVERY_PATH + " HTTP/1.1\r\n" + "Host: " + ip + "\r\n" + "Connection: close\r\n\r\n");

    unsigned long start = millis();
    while (!client.available() && millis() - start < SERVER_SCAN_TIMEOUT)
    {
        if (diagnosticBusy)
        {
            client.stop();
            return false;
        }
        delay(5);
    }

    if (!client.available())
    {
        client.stop();
        return false;
    }

    String statusLine = client.readStringUntil('\n');
    client.stop();
    statusLine.trim();
    return statusLine.startsWith("HTTP/");
}

void reconnectWiFi()
{
    if (setupMode || diagnosticBusy || WiFi.status() == WL_CONNECTED) return;

    reconnectCount++;
    Serial.println("WiFi Lost... Trying to reconnect...");
    if (connectToWiFi())
    {
        serverFound = false;
        discoverServer();
    }
}

void sendData()
{
    if (diagnosticBusy) return;
    reconnectWiFi();
    if (diagnosticBusy || WiFi.status() != WL_CONNECTED) return;

    if (!serverFound || serverURL.length() == 0)
    {
        Serial.println("No server URL available. Trying server discovery...");
        if (diagnosticBusy || !discoverServer()) return;
    }

    int lm35Raw = analogRead(LM35_PIN);
    float voltage = (lm35Raw * 3.3f) / 4095.0f;
    float externalTemperature = voltage * 100.0f;
    int gasAnalog = analogRead(MQ2_ANALOG_PIN);
    int gasDigital = digitalRead(MQ2_DIGITAL_PIN);
    int humidityState = digitalRead(HR202_PIN);
    float cpuTemperature = temperatureRead();
    uint32_t totalRAM = ESP.getHeapSize();
    uint32_t freeRAM = ESP.getFreeHeap();
    uint32_t usedRAM = totalRAM - freeRAM;
    uint32_t minFreeRAM = ESP.getMinFreeHeap();
    int cpuFrequency = getCpuFrequencyMhz();
    int cpuCores = ESP.getChipCores();
    int activeCore = xPortGetCoreID();
    uint32_t flashSize = ESP.getFlashChipSize();
    uint32_t sketchSize = ESP.getSketchSize();
    uint32_t freeSketch = ESP.getFreeSketchSpace();
    uint32_t chipRevision = ESP.getChipRevision();
    String chipModel = ESP.getChipModel();
    String sdkVersion = ESP.getSdkVersion();
    String ipAddress = WiFi.localIP().toString();
    String gateway = WiFi.gatewayIP().toString();
    String subnet = WiFi.subnetMask().toString();
    String dns = WiFi.dnsIP().toString();
    String macAddress = WiFi.macAddress();
    String hostname = WiFi.getHostname();
    int wifiRSSI = WiFi.RSSI();
    String wifiStatus = WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected";
    String status = "NORMAL";

    if (gasAnalog > 2500 || freeRAM < 80000 || externalTemperature > 50)
    {
        status = "DANGER";
        digitalWrite(LED_PIN, HIGH);
    }
    else if (gasAnalog > 1500 || freeRAM < 150000 || externalTemperature > 35)
    {
        status = "WARNING";
        digitalWrite(LED_PIN, LOW);
    }
    else digitalWrite(LED_PIN, LOW);

    StaticJsonDocument<2048> json;
    json["node_name"] = nodeName;
    json["node_type"] = "esp32";
    json["cpu_temperature"] = cpuTemperature;
    json["external_temperature"] = externalTemperature;
    json["humidity"] = humidityState;
    json["gas_level"] = gasAnalog;
    json["gas_alarm"] = gasDigital;
    json["total_ram"] = totalRAM;
    json["free_ram"] = freeRAM;
    json["used_ram"] = usedRAM;
    json["minimum_free_ram"] = minFreeRAM;
    json["cpu_frequency"] = cpuFrequency;
    json["cpu_cores"] = cpuCores;
    json["active_core"] = activeCore;
    json["wifi_signal"] = wifiRSSI;
    json["wifi_status"] = wifiStatus;
    json["ip_address"] = ipAddress;
    json["gateway"] = gateway;
    json["subnet"] = subnet;
    json["dns"] = dns;
    json["mac_address"] = macAddress;
    json["hostname"] = hostname;
    json["chip_model"] = chipModel;
    json["chip_revision"] = chipRevision;
    json["flash_size"] = flashSize;
    json["sketch_size"] = sketchSize;
    json["free_sketch"] = freeSketch;
    json["sdk_version"] = sdkVersion;
    json["uptime"] = millis() / 1000;
    json["reconnects"] = reconnectCount;
    json["status"] = status;

    String output;
    serializeJsonPretty(json, output);
    Serial.println();
    Serial.println("==========================================");
    Serial.println("ESP32 MONITORING DATA");
    Serial.println("==========================================");
    Serial.println(output);

    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    lastHTTPResponse = http.POST(output);
    Serial.print("HTTP Response Code : "); Serial.println(lastHTTPResponse);
    if (lastHTTPResponse > 0)
    {
        Serial.print("Server Response : ");
        Serial.println(http.getString());
    }
    else
    {
        Serial.println("Failed to send data.");
        serverFound = false;
        serverURL = "";
    }
    http.end();
}

void loop()
{
    if (setupMode)
    {
        configServer.handleClient();
        delay(5);
        return;
    }

    if (diagnosticBusy)
    {
        delay(5);
        return;
    }

    reconnectWiFi();

    if (diagnosticBusy) return;

    if (millis() - lastSend >= SEND_INTERVAL)
    {
        lastSend = millis();
        sendData();
    }

    delay(10);
}
