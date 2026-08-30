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
TIMEOUT = 2


def query(port, command, timeout=TIMEOUT):
    with serial.Serial(port, BAUDRATE, timeout=0.2) as ser:
        ser.reset_input_buffer()
        ser.write((command + "\n").encode())
        ser.flush()
        deadline = time.time() + timeout
        lines = []
        while time.time() < deadline:
            line = ser.readline().decode(errors="ignore").strip()
            if line:
                lines.append(line)
                if line.startswith("{") and line.endswith("}"):
                    try:
                        return json.loads(line)
                    except json.JSONDecodeError:
                        pass
        return {"raw": lines}


def ports():
    return [p.device for p in list_ports.comports()]


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
        try:
            result = query(port, "IDENTIFY")
            if "raw" in result:
                print("No JSON identification response.")
                continue

            print("Node:", result.get("node_name", "unknown"))
            print("MAC :", result.get("mac", "unknown"))

            diag = query(port, "DIAG")
            print("Diagnostic:", json.dumps(diag, indent=2))

            wifi = query(port, "WIFI_SCAN", timeout=10)
            print("Wi-Fi scan:", json.dumps(wifi, indent=2))
            print()
        except (serial.SerialException, OSError) as exc:
            print(f"Unable to communicate with {port}: {exc}")


if __name__ == "__main__":
    main()
