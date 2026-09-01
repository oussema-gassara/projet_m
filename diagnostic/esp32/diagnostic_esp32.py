import json
import sys
import time

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    print("PySerial is required: pip install pyserial")
    sys.exit(1)

BAUDRATE = 115200
DEFAULT_TIMEOUT = 5


def query(ser, command, timeout=DEFAULT_TIMEOUT, expected=None):
    """Send a command and return only its matching JSON response."""
    ser.reset_input_buffer()
    ser.write((command + "\n").encode())
    ser.flush()

    deadline = time.time() + timeout
    lines = []

    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            continue

        line = raw.decode(errors="ignore").strip()
        if not line:
            continue

        lines.append(line)

        # Normal firmware output (Checking..., WiFi Connected!, etc.) is not
        # a diagnostic response. Keep reading until the expected JSON arrives.
        if not (line.startswith("{") and line.endswith("}")):
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        if expected is None or data.get("diagnostic") == expected:
            return data

    return {"raw": lines}


def ports():
    return [p.device for p in list_ports.comports()]


def valid(result):
    return isinstance(result, dict) and "raw" not in result


def print_result(label, result):
    if not valid(result):
        print(f"{label}: no valid JSON response")
        for line in result.get("raw", [])[-5:]:
            print("  ", line)
    else:
        print(f"{label}:", json.dumps(result, indent=2))


def make_diagnosis(port, identify, wifi_scan, wifi_connect, wifi_status, server, diag):
    node = identify.get("node_name", "unknown") if valid(identify) else "unknown"
    mac = identify.get("mac", "unknown") if valid(identify) else "unknown"

    networks = wifi_scan.get("networks", []) if valid(wifi_scan) else []
    network_names = [n.get("ssid", "") for n in networks]
    networks_found = wifi_scan.get("networks_found", 0) if valid(wifi_scan) else None
    wifi_hardware = wifi_scan.get("wifi_hardware", "UNKNOWN") if valid(wifi_scan) else "UNKNOWN"

    configured_ssid = wifi_connect.get("ssid", "") if valid(wifi_connect) else ""
    ssid_detected = configured_ssid in network_names if configured_ssid else None

    connect_ok = bool(wifi_connect.get("connected")) if valid(wifi_connect) else False
    status_ok = bool(wifi_status.get("connected")) if valid(wifi_status) else False
    connected = connect_ok or status_ok

    result = {
        "port": port,
        "node_name": node,
        "mac": mac,
        "wifi_hardware": wifi_hardware,
        "networks_found": networks_found,
        "configured_ssid": configured_ssid or None,
        "ssid_detected": ssid_detected,
        "wifi_connected": connected,
        "wifi_ip": wifi_status.get("ip") if valid(wifi_status) else None,
        "wifi_rssi": wifi_status.get("rssi") if valid(wifi_status) else None,
        "server_reachable": server.get("server_reachable") if valid(server) else None,
        "server_url": server.get("server_url") if valid(server) else None,
        "server_http_code": server.get("http_code") if valid(server) else None,
    }

    if valid(diag):
        suspect_parts = [
            part
            for part in ("cpu", "ram", "flash")
            if diag.get(part) not in (None, "OK")
        ]
        if suspect_parts:
            result.update(
                code="HARDWARE_SUSPECT",
                severity="ERROR",
                message="Hardware diagnostic reported a suspect component: "
                + ", ".join(suspect_parts),
            )
            return result

    if not valid(wifi_scan):
        result.update(
            code="WIFI_SCAN_NO_RESPONSE",
            severity="ERROR",
            message="The ESP32 answered on UART, but the Wi-Fi scan did not return a valid response.",
        )
        return result

    if wifi_hardware != "OK":
        result.update(
            code="WIFI_HARDWARE_SUSPECT",
            severity="ERROR",
            message="The ESP32 Wi-Fi scan itself failed. The Wi-Fi subsystem should be checked.",
        )
        return result

    if connected:
        if not valid(server):
            result.update(
                code="SERVER_CHECK_NO_RESPONSE",
                severity="WARNING",
                message="Wi-Fi is connected, but the server diagnostic did not return a valid response.",
            )
            return result

        if server.get("server_reachable") is True:
            result.update(
                code="ESP32_OK",
                severity="OK",
                message="ESP32 hardware, Wi-Fi connection and Node.js server communication are operational.",
            )
            return result

        server_status = server.get("status", "SERVER_NOT_REACHABLE")
        if server_status == "SERVER_NOT_FOUND":
            code = "SERVER_NOT_FOUND"
            message = "Wi-Fi is working, but the Node.js server was not discovered on the local network."
        elif server_status == "SERVER_HTTP_ERROR":
            code = "SERVER_HTTP_ERROR"
            message = "The server answered, but the diagnostic endpoint returned an HTTP error."
        else:
            code = "SERVER_NOT_REACHABLE"
            message = "Wi-Fi is working, but the Node.js server cannot be reached."

        result.update(code=code, severity="WARNING", message=message)
        return result

    if valid(wifi_connect) and wifi_connect.get("status") == "NO_SSID_CONFIGURED":
        result.update(
            code="NO_SSID_CONFIGURED",
            severity="WARNING",
            message="No Wi-Fi SSID is saved on the ESP32.",
        )
        return result

    if networks_found == 0:
        result.update(
            code="NO_WIFI_NETWORKS",
            severity="WARNING",
            message="The Wi-Fi hardware responded, but no nearby Wi-Fi network was detected.",
        )
        return result

    if configured_ssid and ssid_detected is False:
        result.update(
            code="SSID_NOT_FOUND",
            severity="WARNING",
            message=f"The configured SSID '{configured_ssid}' was not found in the Wi-Fi scan.",
        )
        return result

    if not valid(wifi_connect):
        result.update(
            code="WIFI_CONNECT_NO_RESPONSE",
            severity="ERROR",
            message="Wi-Fi networks were detected, but WIFI_CONNECT returned no valid diagnostic response.",
        )
        return result

    if wifi_connect.get("status") == "CONNECTION_FAILED":
        result.update(
            code="WIFI_CREDENTIALS_OR_CONFIG_ERROR",
            severity="WARNING",
            message="The configured SSID is visible, but connection failed. Check password, security mode and Wi-Fi configuration.",
        )
        return result

    result.update(
        code="WIFI_NOT_CONNECTED",
        severity="WARNING",
        message="The ESP32 Wi-Fi subsystem responds, but the board is not connected to Wi-Fi.",
    )
    return result


def print_final(result):
    print()
    print("========================================")
    print("          FINAL DIAGNOSTIC")
    print("========================================")
    print("COM              :", result.get("port"))
    print("Node             :", result.get("node_name"))
    print("MAC              :", result.get("mac"))
    print("Wi-Fi hardware   :", result.get("wifi_hardware"))
    print("Networks found   :", result.get("networks_found"))
    print("Configured SSID  :", result.get("configured_ssid") or "<none>")

    ssid_detected = result.get("ssid_detected")
    if ssid_detected is None:
        detected_text = "UNKNOWN"
    else:
        detected_text = "YES" if ssid_detected else "NO"
    print("SSID detected    :", detected_text)

    print("Wi-Fi connected  :", "YES" if result.get("wifi_connected") else "NO")
    print("IP               :", result.get("wifi_ip") or "-")
    print("RSSI             :", result.get("wifi_rssi") if result.get("wifi_rssi") is not None else "-")

    server_value = result.get("server_reachable")
    if server_value is None:
        server_text = "UNKNOWN"
    else:
        server_text = "YES" if server_value else "NO"
    print("Server reachable :", server_text)
    print("Server HTTP      :", result.get("server_http_code") if result.get("server_http_code") is not None else "-")
    print("----------------------------------------")
    print("RESULT           :", result.get("code"))
    print("MESSAGE          :", result.get("message"))
    print("========================================")
    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


def main():
    print("========================================")
    print("          ESP32 LOCAL DIAGNOSTIC")
    print("========================================")

    detected = ports()
    if not detected:
        print("No COM port detected.")
        return

    requested = sys.argv[1].upper() if len(sys.argv) > 1 else None
    if requested:
        detected = [p for p in detected if p.upper() == requested]
        if not detected:
            print(f"Port {requested} was not detected.")
            return
    else:
        print("Detected ports:", ", ".join(detected))

    print()

    for port in detected:
        print(f"--- Testing {port} ---")
        ser = None
        session_started = False

        try:
            ser = serial.Serial(port, BAUDRATE, timeout=0.2)
            time.sleep(2)
            ser.reset_input_buffer()

            session = query(
                ser, "DIAG_BEGIN", timeout=8, expected="DIAG_SESSION"
            )
            if not valid(session) or session.get("status") != "STARTED":
                print("Unable to start a diagnostic session.")
                print("This port may not be an ESP32 diagnostic port or the firmware is outdated.")
                print()
                continue

            session_started = True

            identify = query(ser, "IDENTIFY", timeout=8, expected="IDENTIFY")
            if not valid(identify):
                print("No valid IDENTIFY response.")
                print("This port may not be an ESP32 diagnostic port.")
                print()
                continue

            print("Node:", identify.get("node_name", "unknown"))
            print("MAC :", identify.get("mac", "unknown"))

            wifi_scan = query(ser, "WIFI_SCAN", timeout=30, expected="WIFI_SCAN")
            print_result("Wi-Fi scan", wifi_scan)

            if valid(wifi_scan):
                print()
                print("Wi-Fi Summary:")
                print("  Wi-Fi hardware :", wifi_scan.get("wifi_hardware", "UNKNOWN"))
                print("  Networks found :", wifi_scan.get("networks_found", 0))

                for network in wifi_scan.get("networks", []):
                    print(
                        f"  - {network.get('ssid', '<hidden>')} "
                        f"(RSSI {network.get('rssi', '?')} dBm, "
                        f"channel {network.get('channel', '?')})"
                    )

            wifi_connect = query(
                ser, "WIFI_CONNECT", timeout=45, expected="WIFI_CONNECT"
            )
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
            print()

        except (serial.SerialException, OSError) as exc:
            print(f"Unable to communicate with {port}: {exc}")
            print()
        finally:
            if ser is not None and ser.is_open:
                if session_started:
                    try:
                        query(
                            ser,
                            "DIAG_END",
                            timeout=5,
                            expected="DIAG_SESSION",
                        )
                    except (serial.SerialException, OSError):
                        pass
                ser.close()


if __name__ == "__main__":
    main()
