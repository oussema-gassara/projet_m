#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

extern String nodeName;
extern String wifiSSID;
extern String wifiPassword;
extern String serverURL;
extern bool setupMode;
extern bool serverFound;
extern volatile bool diagnosticBusy;
extern bool discoverServer();
extern bool connectToWiFi();

static bool diagnosticSessionActive = false;

static void diagnosticTask(void *parameter);
static void handleDiagnosticCommand(const String &command);
static void sendIdentify();
static void sendWifiScan();
static void sendWifiConnect();
static void sendWifiStatus();
static void sendServerCheck();
static void sendHardwareDiagnostic();

void startDiagnosticTask()
{
    static bool started = false;
    if (started) return;
    started = true;

    xTaskCreatePinnedToCore(diagnosticTask, "DiagnosticTask", 8192, nullptr, 1, nullptr, 1);
}

static void diagnosticTask(void *parameter)
{
    (void)parameter;

    for (;;)
    {
        if (Serial.available())
        {
            String command = Serial.readStringUntil('\n');
            command.trim();

            if (command.length() > 0)
                handleDiagnosticCommand(command);
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

static void handleDiagnosticCommand(const String &command)
{
    // DIAG_BEGIN keeps the normal monitoring loop paused across the complete
    // multi-command diagnostic sequence. Previously diagnosticBusy was
    // released between WIFI_SCAN and WIFI_CONNECT, which allowed the normal
    // loop to start its own server discovery in parallel with SERVER_CHECK.
    if (command == "DIAG_BEGIN")
    {
        diagnosticSessionActive = true;
        diagnosticBusy = true;
        Serial.println("{\"diagnostic\":\"DIAG_SESSION\",\"status\":\"STARTED\"}");
        Serial.flush();
        return;
    }

    if (command == "DIAG_END")
    {
        Serial.println("{\"diagnostic\":\"DIAG_SESSION\",\"status\":\"ENDED\"}");
        Serial.flush();
        vTaskDelay(pdMS_TO_TICKS(100));
        diagnosticSessionActive = false;
        diagnosticBusy = false;
        return;
    }

    diagnosticBusy = true;

    if (command == "PING")
        Serial.println("{\"response\":\"PONG\"}");
    else if (command == "IDENTIFY")
        sendIdentify();
    else if (command == "WIFI_SCAN")
        sendWifiScan();
    else if (command == "WIFI_CONNECT")
        sendWifiConnect();
    else if (command == "WIFI_STATUS")
        sendWifiStatus();
    else if (command == "SERVER_CHECK")
        sendServerCheck();
    else if (command == "DIAG")
        sendHardwareDiagnostic();
    else
        Serial.println("{\"diagnostic\":\"ERROR\",\"status\":\"UNKNOWN_COMMAND\"}");

    Serial.flush();
    vTaskDelay(pdMS_TO_TICKS(100));

    // Outside a diagnostic session, preserve the old one-command behavior.
    // During a session diagnosticBusy stays true until DIAG_END.
    if (!diagnosticSessionActive)
        diagnosticBusy = false;
}

static void sendIdentify()
{
    StaticJsonDocument<512> json;
    json["diagnostic"] = "IDENTIFY";
    json["node_name"] = nodeName;
    json["node_type"] = "esp32";
    json["mac"] = WiFi.macAddress();
    json["chip_model"] = ESP.getChipModel();
    json["chip_revision"] = ESP.getChipRevision();

    String output;
    serializeJson(json, output);
    Serial.println(output);
}

static void sendWifiScan()
{
    StaticJsonDocument<4096> json;
    JsonArray networks = json["networks"].to<JsonArray>();

    json["diagnostic"] = "WIFI_SCAN";
    json["status"] = "SCANNING";
    json["setup_mode_before_scan"] = setupMode;

    if (setupMode)
        WiFi.mode(WIFI_AP_STA);
    else
        WiFi.mode(WIFI_STA);

    delay(100);

    int count = WiFi.scanNetworks(false, true);

    if (count < 0)
    {
        json["wifi_hardware"] = "SUSPECT";
        json["networks_found"] = 0;
    }
    else
    {
        json["wifi_hardware"] = "OK";
        json["networks_found"] = count;

        for (int i = 0; i < count; ++i)
        {
            JsonObject network = networks.add<JsonObject>();
            network["ssid"] = WiFi.SSID(i);
            network["rssi"] = WiFi.RSSI(i);
            network["channel"] = WiFi.channel(i);
            network["encryption"] = (int)WiFi.encryptionType(i);
        }
    }

    String output;
    serializeJson(json, output);
    Serial.println(output);
    WiFi.scanDelete();
}

static void sendWifiConnect()
{
    StaticJsonDocument<1024> json;
    json["diagnostic"] = "WIFI_CONNECT";
    json["ssid"] = wifiSSID;

    if (wifiSSID.length() == 0)
    {
        json["connected"] = false;
        json["status"] = "NO_SSID_CONFIGURED";
    }
    else if (connectToWiFi())
    {
        json["connected"] = true;
        json["status"] = "CONNECTED";
        json["rssi"] = WiFi.RSSI();
        json["ip"] = WiFi.localIP().toString();
        json["gateway"] = WiFi.gatewayIP().toString();
        json["mac"] = WiFi.macAddress();
    }
    else
    {
        json["connected"] = false;
        json["status"] = "CONNECTION_FAILED";
        json["wifi_status_code"] = (int)WiFi.status();
    }

    String output;
    serializeJson(json, output);
    Serial.println(output);
}

static void sendWifiStatus()
{
    StaticJsonDocument<1024> json;
    wl_status_t status = WiFi.status();

    json["diagnostic"] = "WIFI_STATUS";
    json["connected"] = (status == WL_CONNECTED);
    json["status_code"] = (int)status;

    if (status == WL_CONNECTED)
    {
        json["ssid"] = WiFi.SSID();
        json["rssi"] = WiFi.RSSI();
        json["ip"] = WiFi.localIP().toString();
        json["gateway"] = WiFi.gatewayIP().toString();
        json["mac"] = WiFi.macAddress();
    }

    String output;
    serializeJson(json, output);
    Serial.println(output);
}

static void sendServerCheck()
{
    StaticJsonDocument<1024> json;
    json["diagnostic"] = "SERVER_CHECK";

    if (WiFi.status() != WL_CONNECTED)
    {
        json["wifi_connected"] = false;
        json["server_reachable"] = false;
        json["status"] = "WIFI_NOT_CONNECTED";

        String output;
        serializeJson(json, output);
        Serial.println(output);
        return;
    }

    json["wifi_connected"] = true;
    json["esp32_ip"] = WiFi.localIP().toString();

    if (!serverFound || serverURL.length() == 0)
    {
        bool found = discoverServer();
        if (!found || serverURL.length() == 0)
        {
            json["server_reachable"] = false;
            json["status"] = "SERVER_NOT_FOUND";

            String output;
            serializeJson(json, output);
            Serial.println(output);
            return;
        }
    }

    // serverURL is the POST endpoint used by normal monitoring (/api/data).
    // For diagnostics use the dedicated GET endpoint /api/discovery.
    String discoveryURL = serverURL;
    discoveryURL.replace(String(API_PATH), String(DISCOVERY_PATH));

    json["server_data_url"] = serverURL;
    json["server_url"] = discoveryURL;

    HTTPClient http;
    http.setConnectTimeout(2000);
    http.setTimeout(3000);

    if (!http.begin(discoveryURL))
    {
        json["server_reachable"] = false;
        json["status"] = "HTTP_INIT_FAILED";
    }
    else
    {
        int code = http.GET();
        json["http_code"] = code;
        json["transport_reachable"] = code > 0;
        json["server_reachable"] = code >= 200 && code < 300;

        if (code >= 200 && code < 300)
            json["status"] = "SERVER_REACHABLE";
        else if (code > 0)
            json["status"] = "SERVER_HTTP_ERROR";
        else
            json["status"] = "SERVER_NOT_REACHABLE";

        http.end();
    }

    String output;
    serializeJson(json, output);
    Serial.println(output);
}

static void sendHardwareDiagnostic()
{
    StaticJsonDocument<1024> json;
    json["diagnostic"] = "DIAG";
    json["uart"] = "OK";
    json["cpu"] = "OK";
    json["ram"] = ESP.getFreeHeap() > 0 ? "OK" : "SUSPECT";
    json["flash"] = ESP.getFlashChipSize() > 0 ? "OK" : "SUSPECT";
    json["wifi_status"] = WiFi.status() == WL_CONNECTED ? "CONNECTED" : "NOT_CONNECTED";
    json["free_ram"] = ESP.getFreeHeap();
    json["total_ram"] = ESP.getHeapSize();
    json["flash_size"] = ESP.getFlashChipSize();
    json["chip_model"] = ESP.getChipModel();
    json["mac"] = WiFi.macAddress();

    String output;
    serializeJson(json, output);
    Serial.println(output);
}
