#ifndef CONFIG_H
#define CONFIG_H

// ======================================================
//                    ESP32 SETUP ACCESS POINT
// ======================================================

#define AP_SSID "ESP32-SETUP"
#define AP_PASSWORD "12345678"

#define CONFIG_PORT 80

// ======================================================
//                    NODE.JS SERVER
// ======================================================

#define SERVER_PORT 3000

#define API_PATH "/api/data"

// Endpoint used to test whether a Node.js server exists
#define DISCOVERY_PATH "/api/discovery"

// ======================================================
//                    DEVICE INFORMATION
// ======================================================

#define DEFAULT_NODE_NAME "esp32-1"

// ======================================================
//                         SENSORS
// ======================================================

// LM35DZ
#define LM35_PIN 34

// MQ-2
#define MQ2_ANALOG_PIN 35
#define MQ2_DIGITAL_PIN 27

// HR202
#define HR202_PIN 32

// Status LED
#define LED_PIN 2

// ======================================================
//                    DATA TIMING
// ======================================================

#define SEND_INTERVAL 5000

// ======================================================
//                 WIFI CONNECTION SETTINGS
// ======================================================

#define WIFI_CONNECT_TIMEOUT 20000

// ======================================================
//                 SERVER DISCOVERY SETTINGS
// ======================================================

// Timeout for checking one IP
#define SERVER_SCAN_TIMEOUT 200

// ======================================================
//                  SERVER DISCOVERY
// ======================================================

// Start/end of host scan inside the local subnet.
//
// Example:
//
// ESP32 = 192.168.1.189
//
// It will search:
// 192.168.1.1
// 192.168.1.2
// ...
// 192.168.1.254

#define SERVER_SCAN_START 1
#define SERVER_SCAN_END 254

#endif
/*const char* ssid = "TOPNET_2951";
const char* password = "WMAWE9AM8S67";
String serverURL = "http://192.168.100.3:3000/api/data";*/
/*const char* ssid = "RECHERCHES";
const char* password = "rch*$crnsfax";
String serverURL = "http://10.1.30.21:3000/api/data";*/