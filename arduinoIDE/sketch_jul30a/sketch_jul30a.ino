#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>


// ===============================
// WIFI CONFIGURATION
// ===============================

const char* ssid = "Tunisie_Telecom-2.4G-614A";
const char* password = "Wce2cb7b06";

String serverURL = "http://192.168.1.104:3000/data";


// ===============================
// SENSOR PINS
// ===============================

#define LM35_PIN 34

#define MQ2_A0 35
#define MQ2_DO 27

#define HR202_DO 32



// ===============================
// SENSOR VARIABLES
// ===============================

float temperature = 0;

int gasValue = 0;

int gasAlarm = 0;

int humidityState = 1;



// ===============================
// ESP32 SYSTEM VARIABLES
// ===============================

int cpuFrequency;

int cpuCores;

int runningCore;


uint32_t freeRAM;

uint32_t totalRAM;

int ramUsage;


String chipModel;

String status;



// ===============================
// WIFI CONNECTION
// ===============================

void connectWiFi()
{

  Serial.print("Connecting to WiFi");


  WiFi.begin(ssid,password);


  while(WiFi.status()!=WL_CONNECTED)
  {

    delay(500);

    Serial.print(".");

  }


  Serial.println();

  Serial.println("WiFi Connected");


  Serial.print("IP Address: ");

  Serial.println(WiFi.localIP());

}



// ===============================
// READ SENSORS
// ===============================

void readSensors()
{


  // -------- LM35 --------

  int adcValue = analogRead(LM35_PIN);


  float voltage = adcValue * (3.3 / 4095.0);


  temperature = voltage * 100;



  // -------- MQ2 --------

  gasValue = analogRead(MQ2_A0);


  gasAlarm = digitalRead(MQ2_DO);



  // -------- HR202 --------

  humidityState = digitalRead(HR202_DO);



}



// ===============================
// READ ESP32 INFORMATION
// ===============================

void readESPInfo()
{


  cpuFrequency = getCpuFrequencyMhz();


  cpuCores = ESP.getChipCores();


  runningCore = xPortGetCoreID();



  freeRAM = ESP.getFreeHeap();


  totalRAM = ESP.getHeapSize();



  ramUsage =
  ((totalRAM - freeRAM) * 100) / totalRAM;



  chipModel = ESP.getChipModel();


}



// ===============================
// STATUS CALCULATION
// ===============================

String calculateStatus()
{


  int dangerScore = 0;



  // Temperature

  if(temperature >= 70)
  {
    dangerScore++;
  }



  // Gas

  if(gasAlarm == LOW)
  {
    dangerScore += 2;
  }



  // Humidity

  if(humidityState == LOW)
  {
    dangerScore++;
  }



  // RAM

  if(ramUsage >= 80)
  {
    dangerScore++;
  }





  if(dangerScore >= 3)
  {
    return "DANGER";
  }


  else if(dangerScore >= 1)
  {
    return "WARNING";
  }


  else
  {
    return "NORMAL";
  }


}



// ===============================
// DISPLAY DATA
// ===============================

void printData()
{


Serial.println("==========================");


Serial.println("ESP32 MONITORING");


Serial.println("--------------------------");


Serial.print("Temperature: ");

Serial.print(temperature);

Serial.println(" C");



Serial.print("Gas value: ");

Serial.println(gasValue);



Serial.print("Gas alarm: ");

Serial.println(gasAlarm);



Serial.print("Humidity state: ");

Serial.println(humidityState);



Serial.println("--------------------------");


Serial.print("CPU Frequency: ");

Serial.print(cpuFrequency);

Serial.println(" MHz");



Serial.print("CPU Cores: ");

Serial.println(cpuCores);



Serial.print("Running Core: ");

Serial.println(runningCore);



Serial.print("RAM Usage: ");

Serial.print(ramUsage);

Serial.println("%");



Serial.print("Chip: ");

Serial.println(chipModel);



Serial.println("--------------------------");


Serial.print("IP: ");

Serial.println(WiFi.localIP());



Serial.print("Gateway: ");

Serial.println(WiFi.gatewayIP());



Serial.print("WiFi RSSI: ");

Serial.println(WiFi.RSSI());



Serial.print("STATUS: ");

Serial.println(status);



Serial.println("==========================");



}



// ===============================
// SEND JSON TO NODE.JS
// ===============================

void sendData()
{


if(WiFi.status()==WL_CONNECTED)
{


HTTPClient http;


http.begin(serverURL);



http.addHeader(
"Content-Type",
"application/json"
);



StaticJsonDocument<1200> doc;



// Sensors

doc["temperature"] = temperature;

doc["gas_value"] = gasValue;

doc["gas_alarm"] = gasAlarm;


doc["humidity_alert"] =
(humidityState == LOW);



// ESP info

doc["chip_model"] = chipModel;


doc["cpu_frequency"] = cpuFrequency;


doc["cpu_cores"] = cpuCores;


doc["running_core"] = runningCore;


doc["free_ram"] = freeRAM;


doc["total_ram"] = totalRAM;


doc["ram_usage"] = ramUsage;


doc["flash_size"] =
ESP.getFlashChipSize()/1024/1024;



// Network

doc["ip"] =
WiFi.localIP().toString();



doc["gateway"] =
WiFi.gatewayIP().toString();



doc["mac"] =
WiFi.macAddress();



doc["wifi_signal"] =
WiFi.RSSI();



// Status

doc["status"] = status;



String json;


serializeJson(doc,json);



Serial.println("Sending:");

Serial.println(json);



int response =
http.POST(json);



Serial.print("Server response: ");

Serial.println(response);



http.end();


}


else
{

Serial.println("WiFi disconnected");

}



}



// ===============================
// SETUP
// ===============================

void setup()
{


Serial.begin(115200);



analogReadResolution(12);



pinMode(MQ2_DO,INPUT);


pinMode(HR202_DO,INPUT);



connectWiFi();



}



// ===============================
// LOOP
// ===============================

void loop()
{


readSensors();


readESPInfo();


status = calculateStatus();



printData();



sendData();



delay(2000);



}