import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request


SERVER_URL = os.getenv("MONITORING_SERVER_URL", "").strip()
NODE_NAME = os.getenv("IOT_NODE_NAME", "raspberry-1").strip() or "raspberry-1"
SEND_INTERVAL = 5


def read_text(path, default=""):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return file.read().strip()
    except (OSError, ValueError):
        return default


def cpu_temperature():
    raw = read_text("/sys/class/thermal/thermal_zone0/temp")
    try:
        return round(float(raw) / 1000.0, 2)
    except (TypeError, ValueError):
        return 0.0


def read_cpu_times():
    line = read_text("/proc/stat").splitlines()[0].split()
    values = [float(value) for value in line[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    total = sum(values)
    return idle, total


def cpu_usage_percent():
    try:
        idle1, total1 = read_cpu_times()
        time.sleep(0.2)
        idle2, total2 = read_cpu_times()
        total_delta = total2 - total1
        idle_delta = idle2 - idle1
        if total_delta <= 0:
            return 0.0
        return round((1.0 - idle_delta / total_delta) * 100.0, 1)
    except (OSError, ValueError, IndexError):
        return 0.0


def memory_info():
    values = {}
    try:
        for line in read_text("/proc/meminfo").splitlines():
            key, raw = line.split(":", 1)
            number = raw.strip().split()[0]
            values[key] = int(number) * 1024
    except (ValueError, IndexError):
        pass

    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", values.get("MemFree", 0))
    used = max(total - available, 0)
    percent = (used / total * 100.0) if total else 0.0
    return total, available, used, round(percent, 1)


def disk_info():
    usage = shutil.disk_usage("/")
    percent = usage.used / usage.total * 100.0 if usage.total else 0.0
    return usage.total, usage.used, usage.free, round(percent, 1)


def uptime_seconds():
    try:
        return int(float(read_text("/proc/uptime").split()[0]))
    except (ValueError, IndexError):
        return 0


def first_ip_address():
    try:
        output = subprocess.check_output(
            ["hostname", "-I"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        addresses = [item for item in output.split() if not item.startswith("127.")]
        if addresses:
            return addresses[0]
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        address = sock.getsockname()[0]
        sock.close()
        return address
    except OSError:
        return ""


def mac_address():
    preferred = ["eth0", "wlan0"]
    net_dir = "/sys/class/net"
    try:
        interfaces = preferred + [
            name for name in os.listdir(net_dir)
            if name not in preferred and name != "lo"
        ]
    except OSError:
        interfaces = preferred

    for interface in interfaces:
        value = read_text(f"{net_dir}/{interface}/address")
        if value:
            return value
    return ""


def wifi_status():
    if not os.path.exists("/sys/class/net/wlan0"):
        return "Unavailable"

    try:
        result = subprocess.run(
            ["iw", "dev", "wlan0", "link"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        text = (result.stdout or "").lower()
        if "connected to" in text:
            return "Connected"
        if "not connected" in text:
            return "Disconnected"
    except (OSError, subprocess.SubprocessError):
        pass

    return "Connected" if read_text("/sys/class/net/wlan0/operstate") == "up" else "Disconnected"


def system_status(cpu_temp, ram_percent, disk_percent):
    if cpu_temp > 80 or ram_percent > 90 or disk_percent > 90:
        return "DANGER"
    if cpu_temp >= 60 or ram_percent >= 70 or disk_percent >= 70:
        return "WARNING"
    return "NORMAL"


def build_payload():
    total_ram, free_ram, used_ram, ram_percent = memory_info()
    disk_total, disk_used, disk_free, disk_percent = disk_info()
    temperature = cpu_temperature()

    return {
        "node_name": NODE_NAME,
        "hostname": socket.gethostname(),
        "ip_address": first_ip_address(),
        "mac_address": mac_address(),
        "wifi_status": wifi_status(),
        "cpu_temperature": temperature,
        "cpu_usage_percent": cpu_usage_percent(),
        "total_ram": total_ram,
        "free_ram": free_ram,
        "used_ram": used_ram,
        "used_ram_percent": ram_percent,
        "disk_total": disk_total,
        "disk_used": disk_used,
        "disk_free": disk_free,
        "disk_percent": disk_percent,
        "uptime": uptime_seconds(),
        "status": system_status(temperature, ram_percent, disk_percent),
    }


def send_payload(payload):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        SERVER_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        response.read()


def main():
    if not SERVER_URL:
        raise RuntimeError("MONITORING_SERVER_URL is not configured")

    while True:
        try:
            payload = build_payload()
            send_payload(payload)
            print(f"Monitoring data sent for {NODE_NAME}", flush=True)
        except Exception as error:
            print(f"Monitoring send error: {error}", flush=True)

        time.sleep(SEND_INTERVAL)


if __name__ == "__main__":
    main()
