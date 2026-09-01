import json
import sys
import time

import serial

from diagnostic_esp32 import (
    BAUDRATE,
    make_diagnosis,
    ports,
    print_final,
    print_result,
    query,
    valid,
)


def error_result(node_name, code, message, port=None):
    return {
        "port": port,
        "node_name": node_name,
        "mac": None,
        "wifi_hardware": "UNKNOWN",
        "wifi_scan_status": None,
        "wifi_scan_attempts": None,
        "wifi_scan_code": None,
        "networks_found": None,
        "configured_ssid": None,
        "ssid_detected": None,
        "wifi_connected": False,
        "wifi_ip": None,
        "wifi_rssi": None,
        "server_reachable": None,
        "server_url": None,
        "server_http_code": None,
        "code": code,
        "severity": "ERROR",
        "message": message,
    }


def main():
    if len(sys.argv) < 2:
        print_final(
            error_result(
                "unknown",
                "NODE_NAME_REQUIRED",
                "Le nom de la carte ESP32 est obligatoire.",
            )
        )
        return

    requested_node = sys.argv[1].strip()
    detected_ports = ports()

    if not detected_ports:
        print_final(
            error_result(
                requested_node,
                "ESP32_NOT_CONNECTED",
                "Carte ESP32 introuvable. Vérifiez la connexion USB.",
            )
        )
        return

    serial_errors = []

    for port in detected_ports:
        ser = None
        session_started = False

        try:
            ser = serial.Serial(port, BAUDRATE, timeout=0.2)
            time.sleep(2)
            ser.reset_input_buffer()

            session = query(ser, "DIAG_BEGIN", timeout=8, expected="DIAG_SESSION")
            if not valid(session) or session.get("status") != "STARTED":
                continue

            session_started = True

            identify = query(ser, "IDENTIFY", timeout=8, expected="IDENTIFY")
            if not valid(identify):
                continue

            detected_node = str(identify.get("node_name", "")).strip()
            if detected_node.lower() != requested_node.lower():
                continue

            print(f"ESP32 {requested_node} found on {port}")
            print("MAC:", identify.get("mac", "unknown"))

            wifi_scan = query(ser, "WIFI_SCAN", timeout=45, expected="WIFI_SCAN")
            print_result("Wi-Fi scan", wifi_scan)

            wifi_connect = query(ser, "WIFI_CONNECT", timeout=45, expected="WIFI_CONNECT")
            print_result("Wi-Fi connect", wifi_connect)

            wifi_status = query(ser, "WIFI_STATUS", timeout=8, expected="WIFI_STATUS")
            print_result("Wi-Fi status", wifi_status)

            server = query(ser, "SERVER_CHECK", timeout=120, expected="SERVER_CHECK")
            print_result("Server check", server)

            diag = query(ser, "DIAG", timeout=10, expected="DIAG")
            print_result("Diagnostic", diag)

            final_result = make_diagnosis(
                port,
                identify,
                wifi_scan,
                wifi_connect,
                wifi_status,
                server,
                diag,
            )
            print_final(final_result)
            return

        except (serial.SerialException, OSError) as exc:
            serial_errors.append(f"{port}: {exc}")
        finally:
            if ser is not None and ser.is_open:
                if session_started:
                    try:
                        query(ser, "DIAG_END", timeout=5, expected="DIAG_SESSION")
                    except (serial.SerialException, OSError):
                        pass
                ser.close()

    message = "Carte ESP32 introuvable ou non connectée en USB."
    if serial_errors:
        message = "Carte introuvable ou port série occupé. Fermez le moniteur série et vérifiez l'USB."

    print_final(
        error_result(
            requested_node,
            "ESP32_NOT_CONNECTED",
            message,
        )
    )


if __name__ == "__main__":
    main()
