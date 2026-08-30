#include <WiFi.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// These variables already exist in espMonitoring.ino.ino
extern String nodeName;
extern bool setupMode;

static void diagnosticTask(void *parameter);
static void handleDiagnosticCommand(const String &command);
static void sendIdentify();
static void sendWifiScan();
static void sendWifiStatus();
static void sendHardwareDiagnostic();

void startDiagnosticTask()
{
    static bool started = false;

    if (started)
        return;

    started = true;

    xTaskCreatePinnedToCore(
        diagnosticTask,
        "DiagnosticTask",
        8192,
        nullptr,
        1,
        nullptr,
        1);
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
    if (command == "PING")
    {
        Serial.println("{\"response\":\"PONG\"}");
    }
    else if (command == "IDENTIFY")
    {
        sendIdentify();
    }
    else if (command == "WIFI_SCAN")
    {
        sendWifiScan();
    }
    else if (command == "WIFI_STATUS")
    {
        sendWifiStatus();
    }
    else if (command == "DIAG")
    {
        sendHardwareDiagnostic();
    }
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

    // This scan deliberately does not use any SSID or password.
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(false, false);
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

    json["setup_mode_before_scan"] = setupMode;

    String output;
    serializeJson(json, output);
    Serial.println(output);

    WiFi.scanDelete();
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
