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

def query(ser, command, timeout=TIMEOUT):
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

        # The firmware can print normal startup/debug text before JSON.
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

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

    print("Detected ports:", ", ".join(detected))
    print()

    for port in detected:
        print(f"--- Testing {port} ---")
        ser = None
        try:
            ser = serial.Serial(port, BAUDRATE, timeout=0.2)
            # Opening a USB serial port can reset many ESP32 boards.
            time.sleep(2)
            ser.reset_input_buffer()

            identify = query(ser, "IDENTIFY", timeout=4)
            if "raw" in identify:
                print("No valid IDENTIFY response.")
                print("This port may not be an ESP32 diagnostic port.")
                print()
                continue

            print("Node:", identify.get("node_name", "unknown"))
            print("MAC :", identify.get("mac", "unknown"))

            diag = query(ser, "DIAG", timeout=4)
            print_result("Diagnostic", diag)

            # WIFI_SCAN can take several seconds. Keep the same serial
            # connection open so opening the port does not reset the ESP32
            # between IDENTIFY, DIAG and WIFI_SCAN.
            wifi = query(ser, "WIFI_SCAN", timeout=15)
            print_result("Wi-Fi scan", wifi)
            print()

        except (serial.SerialException, OSError) as exc:
            print(f"Unable to communicate with {port}: {exc}")
            print()
        finally:
            if ser is not None and ser.is_open:
                ser.close()


if __name__ == "__main__":
    main()
