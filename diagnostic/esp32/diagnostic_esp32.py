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
TIMEOUT = 3


def query(ser, command, timeout=TIMEOUT, expected=None):
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

        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                if expected is None or data.get("diagnostic") == expected:
                    return data
            except json.JSONDecodeError:
                pass

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

            # First identify the board.
            identify = query(ser, "IDENTIFY", timeout=5)
            if "raw" in identify:
                print("No valid IDENTIFY response.")
                print("This port may not be an ESP32 diagnostic port.")
                print()
                continue

            node = identify.get("node_name", "unknown")
            mac = identify.get("mac", "unknown")
            print("Node:", node)
            print("MAC :", mac)

            # IMPORTANT: scan before DIAG. We verified manually that WIFI_SCAN
            # works in this state, while DIAG followed by WIFI_SCAN can leave
            # the Wi-Fi scan with zero networks.
            wifi = query(ser, "WIFI_SCAN", timeout=20, expected="WIFI_SCAN")
            print_result("Wi-Fi scan", wifi)

            if "raw" not in wifi:
                found = wifi.get("networks_found", 0)
                hardware = wifi.get("wifi_hardware", "UNKNOWN")
                print()
                print("Wi-Fi Summary:")
                print("  Wi-Fi hardware :", hardware)
                print("  Networks found :", found)

                networks = wifi.get("networks", [])
                for network in networks:
                    print(
                        f"  - {network.get('ssid', '<hidden>')} "
                        f"(RSSI {network.get('rssi', '?')} dBm, "
                        f"channel {network.get('channel', '?')})"
                    )

            # Run the hardware/system diagnostic AFTER the Wi-Fi scan.
            diag = query(ser, "DIAG", timeout=5, expected="DIAG")
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
