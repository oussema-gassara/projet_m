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
    json["setup_mode_before_scan"] = setupMode;

    if (setupMode)
        WiFi.mode(WIFI_AP_STA);
    else
        WiFi.mode(WIFI_STA);

    // Clear any stale scan result before starting a diagnostic scan.
    WiFi.scanDelete();
    delay(250);

    int count = -2;
    int attempts = 0;
    const int maxAttempts = 3;

    // scanNetworks() can temporarily return a negative code when the Wi-Fi
    // driver is busy. Retry before classifying the scan as failed.
    for (attempts = 1; attempts <= maxAttempts; attempts++)
    {
        count = WiFi.scanNetworks(false, true);
        if (count >= 0)
            break;

        WiFi.scanDelete();
        delay(500);

        if (setupMode)
            WiFi.mode(WIFI_AP_STA);
        else
            WiFi.mode(WIFI_STA);
    }

    json["scan_attempts"] = attempts > maxAttempts ? maxAttempts : attempts;
    json["scan_code"] = count;

    if (count < 0)
    {
        // A failed scan is not enough evidence to declare the radio hardware
        // defective. Report the scan failure explicitly and let the host
        // diagnostic distinguish it from a true no-network condition.
        json["status"] = "SCAN_FAILED";
        json["wifi_hardware"] = "UNKNOWN";
        json["networks_found"] = 0;
    }
    else
    {
        json["status"] = count == 0 ? "NO_NETWORKS" : "NETWORKS_FOUND";
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
