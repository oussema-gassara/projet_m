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


def wifi_config_error(result):
    result.update(
        code="WIFI_SSID_OR_PASSWORD_ERROR",
        severity="WARNING",
        message="Vérifier le SSID ou le mot de passe Wi-Fi.",
    )
    return result


def make_diagnosis(port, identify, wifi_scan, wifi_connect, wifi_status, server, diag):
    node = identify.get("node_name", "unknown") if valid(identify) else "unknown"
    mac = identify.get("mac", "unknown") if valid(identify) else "unknown"

    # If IDENTIFY happened while the Wi-Fi driver was temporarily reset,
    # prefer the valid MAC returned by the hardware diagnostic.
    if mac in (None, "", "00:00:00:00:00:00") and valid(diag):
        diag_mac = diag.get("mac")
        if diag_mac not in (None, "", "00:00:00:00:00:00"):
            mac = diag_mac

    networks = wifi_scan.get("networks", []) if valid(wifi_scan) else []
    network_names = [n.get("ssid", "") for n in networks]
    networks_found = wifi_scan.get("networks_found", 0) if valid(wifi_scan) else None
    wifi_hardware = wifi_scan.get("wifi_hardware", "UNKNOWN") if valid(wifi_scan) else "UNKNOWN"
    scan_status = wifi_scan.get("status") if valid(wifi_scan) else None
    scan_attempts = wifi_scan.get("scan_attempts") if valid(wifi_scan) else None
    scan_code = wifi_scan.get("scan_code") if valid(wifi_scan) else None

    configured_ssid = wifi_connect.get("ssid", "") if valid(wifi_connect) else ""
    ssid_detected = (
        configured_ssid in network_names
        if configured_ssid and valid(wifi_scan) and scan_status != "SCAN_FAILED"
        else None
    )

    connect_ok = bool(wifi_connect.get("connected")) if valid(wifi_connect) else False
    status_ok = bool(wifi_status.get("connected")) if valid(wifi_status) else False
    connected = connect_ok or status_ok

    result = {
        "port": port,
        "node_name": node,
        "mac": mac,
        "wifi_hardware": wifi_hardware,
        "wifi_scan_status": scan_status,
        "wifi_scan_attempts": scan_attempts,
        "wifi_scan_code": scan_code,
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
                message="Un composant matériel semble présenter un problème.",
            )
            return result

    # A successful Wi-Fi connection is stronger evidence than the scan result.
    if connected:
        if not valid(server):
            result.update(
                code="SERVER_CHECK_NO_RESPONSE",
                severity="WARNING",
                message="Impossible de vérifier la connexion au serveur.",
            )
            return result

        if server.get("server_reachable") is True:
            result.update(
                code="ESP32_OK",
                severity="OK",
                message="ESP32 opérationnel.",
            )
            return result

        result.update(
            code="SERVER_NOT_REACHABLE",
            severity="WARNING",
            message="Vérifier le serveur ou la connexion réseau.",
        )
        return result

    if not valid(wifi_scan):
        result.update(
            code="WIFI_SCAN_NO_RESPONSE",
            severity="ERROR",
            message="Impossible de vérifier le Wi-Fi.",
        )
        return result

    if scan_status == "SCAN_FAILED":
        result.update(
            code="WIFI_SCAN_FAILED",
            severity="WARNING",
            message="Impossible d'effectuer le scan Wi-Fi.",
        )
        return result

    if wifi_hardware == "SUSPECT":
        result.update(
            code="WIFI_HARDWARE_SUSPECT",
            severity="ERROR",
            message="Vérifier le module Wi-Fi de l'ESP32.",
        )
        return result

    # User-facing diagnosis is intentionally simple: whether the SSID is
    # absent, not configured, or the password/authentication fails, expose one
    # single actionable problem.
    if valid(wifi_connect) and wifi_connect.get("status") == "NO_SSID_CONFIGURED":
        return wifi_config_error(result)

    if configured_ssid:
        ssid_detected = configured_ssid in network_names
        result["ssid_detected"] = ssid_detected
        if not ssid_detected:
            return wifi_config_error(result)

    if valid(wifi_connect) and wifi_connect.get("status") == "CONNECTION_FAILED":
        return wifi_config_error(result)

    if networks_found == 0:
        return wifi_config_error(result)

    if not valid(wifi_connect):
        result.update(
            code="WIFI_CONNECT_NO_RESPONSE",
            severity="ERROR",
            message="Impossible de vérifier la connexion Wi-Fi.",
        )
        return result

    result.update(
        code="WIFI_NOT_CONNECTED",
        severity="WARNING",
        message="Vérifier la connexion Wi-Fi.",
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
    print("Wi-Fi scan       :", result.get("wifi_scan_status") or "UNKNOWN")
    print("Networks found   :", result.get("networks_found"))
    print("Configured SSID  :", result.get("configured_ssid") or "<none>")

    ssid_detected = result.get("ssid_detected")
    if ssid_detected is None:
        detected_text = "UNKNOWN"
    else:
        detected_text = "YES" if ssid_detected else "NO"
    print("SSID detected    :", detected_text)

    print("Wi-Fi connected  :", "YES" if result.get("wifi_connected") else "NO")
    print("Server reachable :", "YES" if result.get("server_reachable") else "NO")
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

            session = query(ser, "DIAG_BEGIN", timeout=8, expected="DIAG_SESSION")
            if not valid(session) or session.get("status") != "STARTED":
                print("Unable to start a diagnostic session.")
                print()
                continue

            session_started = True

            identify = query(ser, "IDENTIFY", timeout=8, expected="IDENTIFY")
            if not valid(identify):
                print("No valid IDENTIFY response.")
                print()
                continue

            print("Node:", identify.get("node_name", "unknown"))
            print("MAC :", identify.get("mac", "unknown"))

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
            print()

        except (serial.SerialException, OSError) as exc:
            print(f"Unable to communicate with {port}: {exc}")
            print()
        finally:
            if ser is not None and ser.is_open:
                if session_started:
                    try:
                        query(ser, "DIAG_END", timeout=5, expected="DIAG_SESSION")
                    except (serial.SerialException, OSError):
                        pass
                ser.close()


if __name__ == "__main__":
    main()
