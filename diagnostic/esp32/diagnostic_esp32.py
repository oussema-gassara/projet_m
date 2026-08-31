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
    """Send a diagnostic command and return its JSON response.

    ESP32 may print normal monitoring/discovery messages before, during, or
    after the JSON response. Only a JSON object with the expected diagnostic
    name is accepted as the command result; all other serial lines are ignored.
    """
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

        # Ignore normal ESP32 text such as:
        #   Checking 192.168.100.20...
        #   WiFi Connected!
        # and keep looking for the actual JSON response.
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


def print_result(label, result):
    if "raw" in result:
        print(f"{label}: no valid JSON response")
        for line in result["raw"][-5:]:
            print("  ", line)
    else:
        print(f"{label}:", json.dumps(result, indent=2))


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
        try:
            ser = serial.Serial(port, BAUDRATE, timeout=0.2)
            time.sleep(2)
            ser.reset_input_buffer()

            identify = query(ser, "IDENTIFY", timeout=8, expected="IDENTIFY")
            if "raw" in identify:
                print("No valid IDENTIFY response.")
                print("This port may not be an ESP32 diagnostic port.")
                print()
                continue

            node = identify.get("node_name", "unknown")
            mac = identify.get("mac", "unknown")
            print("Node:", node)
            print("MAC :", mac)

            wifi_scan = query(ser, "WIFI_SCAN", timeout=30, expected="WIFI_SCAN")
            print_result("Wi-Fi scan", wifi_scan)

            if "raw" not in wifi_scan:
                found = wifi_scan.get("networks_found", 0)
                hardware = wifi_scan.get("wifi_hardware", "UNKNOWN")
                print()
                print("Wi-Fi Summary:")
                print("  Wi-Fi hardware :", hardware)
                print("  Networks found :", found)

                for network in wifi_scan.get("networks", []):
                    print(
                        f"  - {network.get('ssid', '<hidden>')} "
                        f"(RSSI {network.get('rssi', '?')} dBm, "
                        f"channel {network.get('channel', '?')})"
                    )

            # WIFI_CONNECT can take as long as the firmware's connection
            # timeout. The normal ESP32 text printed by connectToWiFi() is
            # ignored until the WIFI_CONNECT JSON object arrives.
            wifi_connect = query(
                ser, "WIFI_CONNECT", timeout=45, expected="WIFI_CONNECT"
            )
            print_result("Wi-Fi connect", wifi_connect)

            wifi_status = query(ser, "WIFI_STATUS", timeout=8, expected="WIFI_STATUS")
            print_result("Wi-Fi status", wifi_status)

            # SERVER_CHECK may perform a local-network discovery. Give it
            # enough time to finish instead of treating discovery log lines
            # as a failed JSON response.
            server = query(ser, "SERVER_CHECK", timeout=120, expected="SERVER_CHECK")
            print_result("Server check", server)

            diag = query(ser, "DIAG", timeout=10, expected="DIAG")
            print_result("Diagnostic", diag)
            print()

        except (serial.SerialException, OSError) as exc:
            print(f"Unable to communicate with {port}: {exc}")
            print()
        finally:
            if ser is not None and ser.is_open:
                ser.close()


if __name__ == "__main__":
    main()
