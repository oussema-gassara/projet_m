import json
import os
import shutil
import subprocess
import sys


REMOTE_DIAGNOSTIC_SCRIPT = r'''
set +e

hostname_value=$(hostname 2>/dev/null || echo unknown)

echo "HOSTNAME=$hostname_value"

# CPU temperature
if [ -r /sys/class/thermal/thermal_zone0/temp ]; then
    cpu_temp_raw=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
    if [ -n "$cpu_temp_raw" ]; then
        awk "BEGIN { printf \"CPU_TEMP=%.2f\\n\", $cpu_temp_raw / 1000 }"
    else
        echo "CPU_TEMP=UNKNOWN"
    fi
else
    echo "CPU_TEMP=UNKNOWN"
fi

# CPU usage calculated from /proc/stat over a short sample.
read -r _ u1 n1 s1 i1 w1 irq1 sirq1 st1 _ < /proc/stat
sleep 0.25
read -r _ u2 n2 s2 i2 w2 irq2 sirq2 st2 _ < /proc/stat
idle1=$((i1 + w1))
idle2=$((i2 + w2))
total1=$((u1 + n1 + s1 + i1 + w1 + irq1 + sirq1 + st1))
total2=$((u2 + n2 + s2 + i2 + w2 + irq2 + sirq2 + st2))
delta_total=$((total2 - total1))
delta_idle=$((idle2 - idle1))
if [ "$delta_total" -gt 0 ]; then
    cpu_usage=$((100 * (delta_total - delta_idle) / delta_total))
    echo "CPU_USAGE=$cpu_usage"
else
    echo "CPU_USAGE=UNKNOWN"
fi

# RAM
mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)
mem_available_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null)
if [ -n "$mem_total_kb" ] && [ -n "$mem_available_kb" ] && [ "$mem_total_kb" -gt 0 ]; then
    mem_used_kb=$((mem_total_kb - mem_available_kb))
    ram_percent=$((100 * mem_used_kb / mem_total_kb))
    echo "RAM_TOTAL_KB=$mem_total_kb"
    echo "RAM_AVAILABLE_KB=$mem_available_kb"
    echo "RAM_USED_KB=$mem_used_kb"
    echo "RAM_PERCENT=$ram_percent"
else
    echo "RAM_PERCENT=UNKNOWN"
fi

# Disk
disk_line=$(df -P / 2>/dev/null | awk 'NR==2 {print $2 " " $3 " " $4 " " $5}')
if [ -n "$disk_line" ]; then
    set -- $disk_line
    echo "DISK_TOTAL_KB=$1"
    echo "DISK_USED_KB=$2"
    echo "DISK_FREE_KB=$3"
    echo "DISK_PERCENT=${4%%%}"
else
    echo "DISK_PERCENT=UNKNOWN"
fi

# Ethernet interface used for the diagnostic transport.
if [ -d /sys/class/net/eth0 ]; then
    echo "ETHERNET_EXISTS=1"
    ethernet_state=$(cat /sys/class/net/eth0/operstate 2>/dev/null || echo unknown)
    ethernet_carrier=$(cat /sys/class/net/eth0/carrier 2>/dev/null || echo 0)
    ethernet_ip=$(ip -4 -o addr show dev eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)
    echo "ETHERNET_STATE=$ethernet_state"
    echo "ETHERNET_CARRIER=$ethernet_carrier"
    echo "ETHERNET_IP=${ethernet_ip:-UNKNOWN}"
else
    echo "ETHERNET_EXISTS=0"
    echo "ETHERNET_STATE=missing"
    echo "ETHERNET_CARRIER=0"
    echo "ETHERNET_IP=UNKNOWN"
fi

# Wi-Fi hardware/interface.
if [ -d /sys/class/net/wlan0 ]; then
    echo "WIFI_EXISTS=1"
    wifi_state=$(cat /sys/class/net/wlan0/operstate 2>/dev/null || echo unknown)
    echo "WIFI_STATE=$wifi_state"

    wifi_ssid=""
    if command -v iw >/dev/null 2>&1; then
        wifi_ssid=$(iw dev wlan0 link 2>/dev/null | awk -F'SSID: ' '/SSID:/ {print $2; exit}')
    fi
    if [ -z "$wifi_ssid" ] && command -v iwgetid >/dev/null 2>&1; then
        wifi_ssid=$(iwgetid -r 2>/dev/null)
    fi

    if [ -n "$wifi_ssid" ]; then
        echo "WIFI_CONNECTED=1"
        echo "WIFI_SSID=$wifi_ssid"
    else
        echo "WIFI_CONNECTED=0"
        echo "WIFI_SSID=UNKNOWN"
    fi
else
    echo "WIFI_EXISTS=0"
    echo "WIFI_STATE=missing"
    echo "WIFI_CONNECTED=0"
    echo "WIFI_SSID=UNKNOWN"
fi

# Optional check from Raspberry Pi back to the monitoring backend.
server_host="$1"
server_port="$2"
if [ -n "$server_host" ] && [ -n "$server_port" ]; then
    if command -v timeout >/dev/null 2>&1 && timeout 3 bash -c "</dev/tcp/$server_host/$server_port" >/dev/null 2>&1; then
        echo "SERVER_REACHABLE=1"
    else
        echo "SERVER_REACHABLE=0"
    fi
else
    echo "SERVER_REACHABLE=UNKNOWN"
fi
'''


def simulation_result(node_name, scenario="ok"):
    result = {
        "node_name": node_name,
        "simulation": True,
        "ssh": "OK",
        "cpu": "OK",
        "ram": "OK",
        "disk": "OK",
        "ethernet": "OK",
        "wifi": "OK",
        "network": "OK",
        "server_reachable": True,
        "code": "RASPBERRY_OK",
        "severity": "OK",
        "message": "Raspberry Pi opérationnel.",
    }

    if scenario == "wifi_hardware_error":
        result.update(
            wifi="HARDWARE_ERROR",
            code="WIFI_HARDWARE_ERROR",
            severity="DANGER",
            message="Interface Wi-Fi absente ou potentiellement défaillante.",
        )
    elif scenario == "wifi_disconnected":
        result.update(
            wifi="DISCONNECTED",
            code="WIFI_DISCONNECTED",
            severity="WARNING",
            message="Interface Wi-Fi présente mais non connectée.",
        )
    elif scenario == "ssh_error":
        result.update(
            ssh="ERROR",
            cpu="UNKNOWN",
            ram="UNKNOWN",
            disk="UNKNOWN",
            ethernet="ERROR",
            wifi="UNKNOWN",
            network="ERROR",
            server_reachable=False,
            code="RASPBERRY_SSH_UNREACHABLE",
            severity="DANGER",
            message="Raspberry Pi inaccessible via SSH sur Ethernet.",
        )

    return result


def parse_key_values(text):
    values = {}
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def to_number(value, cast=float):
    if value in (None, "", "UNKNOWN"):
        return None
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None


def status_from_percent(value, warning, danger):
    if value is None:
        return "UNKNOWN"
    if value >= danger:
        return "ERROR"
    if value >= warning:
        return "WARNING"
    return "OK"


def build_real_result(node_name, target_ip):
    ssh_user = os.getenv("RASPBERRY_SSH_USER", "").strip()
    ssh_port = os.getenv("RASPBERRY_SSH_PORT", "22").strip() or "22"
    ssh_key = os.getenv("RASPBERRY_SSH_KEY", "").strip()
    ssh_command = os.getenv("SSH_COMMAND", "").strip() or shutil.which("ssh")
    server_host = os.getenv("MONITORING_SERVER_HOST", "").strip()
    server_port = os.getenv("MONITORING_SERVER_PORT", "3000").strip() or "3000"

    if not target_ip or not ssh_user:
        return {
            "node_name": node_name,
            "simulation": False,
            "ssh": "UNKNOWN",
            "cpu": "UNKNOWN",
            "ram": "UNKNOWN",
            "disk": "UNKNOWN",
            "ethernet": "UNKNOWN",
            "wifi": "UNKNOWN",
            "network": "UNKNOWN",
            "server_reachable": None,
            "code": "SSH_CONFIG_MISSING",
            "severity": "WARNING",
            "message": "Configuration SSH incomplète. Définissez l'adresse Ethernet et l'utilisateur SSH du Raspberry Pi.",
        }

    if not ssh_command:
        return {
            "node_name": node_name,
            "simulation": False,
            "ssh": "ERROR",
            "cpu": "UNKNOWN",
            "ram": "UNKNOWN",
            "disk": "UNKNOWN",
            "ethernet": "UNKNOWN",
            "wifi": "UNKNOWN",
            "network": "ERROR",
            "server_reachable": None,
            "code": "SSH_CLIENT_NOT_FOUND",
            "severity": "DANGER",
            "message": "Client SSH introuvable sur le serveur de monitoring.",
        }

    command = [
        ssh_command,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "ConnectionAttempts=1",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", ssh_port,
    ]

    if ssh_key:
        command.extend(["-i", ssh_key])

    command.extend([
        f"{ssh_user}@{target_ip}",
        "bash",
        "-s",
        "--",
        server_host,
        server_port,
    ])

    try:
        completed = subprocess.run(
            command,
            input=REMOTE_DIAGNOSTIC_SCRIPT,
            text=True,
            capture_output=True,
            timeout=20,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        completed = None
    except OSError as error:
        return {
            "node_name": node_name,
            "simulation": False,
            "ssh": "ERROR",
            "cpu": "UNKNOWN",
            "ram": "UNKNOWN",
            "disk": "UNKNOWN",
            "ethernet": "UNKNOWN",
            "wifi": "UNKNOWN",
            "network": "ERROR",
            "server_reachable": None,
            "code": "SSH_START_ERROR",
            "severity": "DANGER",
            "message": f"Impossible de démarrer SSH: {error}",
        }

    if completed is None or completed.returncode != 0:
        return {
            "node_name": node_name,
            "target_ip": target_ip,
            "simulation": False,
            "ssh": "ERROR",
            "cpu": "UNKNOWN",
            "ram": "UNKNOWN",
            "disk": "UNKNOWN",
            "ethernet": "ERROR",
            "wifi": "UNKNOWN",
            "network": "ERROR",
            "server_reachable": False,
            "code": "RASPBERRY_SSH_UNREACHABLE",
            "severity": "DANGER",
            "message": "Raspberry Pi inaccessible via SSH sur Ethernet. Vérifiez le câble Ethernet, l'adresse IP et le service SSH.",
        }

    data = parse_key_values(completed.stdout)

    cpu_temp = to_number(data.get("CPU_TEMP"), float)
    cpu_usage = to_number(data.get("CPU_USAGE"), float)
    ram_percent = to_number(data.get("RAM_PERCENT"), float)
    disk_percent = to_number(data.get("DISK_PERCENT"), float)

    if cpu_temp is None:
        cpu_status = "UNKNOWN"
    elif cpu_temp >= 80:
        cpu_status = "ERROR"
    elif cpu_temp >= 65:
        cpu_status = "WARNING"
    else:
        cpu_status = "OK"

    ram_status = status_from_percent(ram_percent, 80, 90)
    disk_status = status_from_percent(disk_percent, 85, 95)

    ethernet_exists = data.get("ETHERNET_EXISTS") == "1"
    ethernet_carrier = data.get("ETHERNET_CARRIER") == "1"
    ethernet_status = "OK" if ethernet_exists and ethernet_carrier else "ERROR"

    wifi_exists = data.get("WIFI_EXISTS") == "1"
    wifi_connected = data.get("WIFI_CONNECTED") == "1"
    if not wifi_exists:
        wifi_status = "HARDWARE_ERROR"
    elif wifi_connected:
        wifi_status = "OK"
    else:
        wifi_status = "DISCONNECTED"

    server_raw = data.get("SERVER_REACHABLE", "UNKNOWN")
    if server_raw == "1":
        server_reachable = True
    elif server_raw == "0":
        server_reachable = False
    else:
        server_reachable = None

    result = {
        "node_name": node_name,
        "target_ip": target_ip,
        "hostname": data.get("HOSTNAME", "unknown"),
        "simulation": False,
        "ssh": "OK",
        "cpu": cpu_status,
        "cpu_temperature": cpu_temp,
        "cpu_usage_percent": cpu_usage,
        "ram": ram_status,
        "ram_percent": ram_percent,
        "disk": disk_status,
        "disk_percent": disk_percent,
        "ethernet": ethernet_status,
        "ethernet_ip": data.get("ETHERNET_IP", "UNKNOWN"),
        "wifi": wifi_status,
        "wifi_ssid": data.get("WIFI_SSID", "UNKNOWN"),
        "network": ethernet_status,
        "server_reachable": server_reachable,
        "code": "RASPBERRY_OK",
        "severity": "OK",
        "message": "Raspberry Pi opérationnel.",
    }

    if ethernet_status != "OK":
        result.update(
            code="ETHERNET_ERROR",
            severity="DANGER",
            message="Interface Ethernet du Raspberry Pi en erreur.",
        )
    elif wifi_status == "HARDWARE_ERROR":
        result.update(
            code="WIFI_HARDWARE_ERROR",
            severity="DANGER",
            message="Interface Wi-Fi absente, désactivée ou potentiellement défaillante.",
        )
    elif cpu_status == "ERROR":
        result.update(
            code="CPU_ERROR",
            severity="DANGER",
            message="Température CPU anormale sur le Raspberry Pi.",
        )
    elif ram_status == "ERROR":
        result.update(
            code="RAM_ERROR",
            severity="DANGER",
            message="Utilisation de la RAM critique sur le Raspberry Pi.",
        )
    elif disk_status == "ERROR":
        result.update(
            code="DISK_ERROR",
            severity="DANGER",
            message="Espace disque critique sur le Raspberry Pi.",
        )
    elif wifi_status == "DISCONNECTED":
        result.update(
            code="WIFI_DISCONNECTED",
            severity="WARNING",
            message="Wi-Fi présent mais non connecté. Le diagnostic reste disponible via Ethernet.",
        )
    elif cpu_status == "WARNING" or ram_status == "WARNING" or disk_status == "WARNING":
        result.update(
            code="SYSTEM_WARNING",
            severity="WARNING",
            message="Raspberry Pi accessible, mais une ressource système nécessite une surveillance.",
        )
    elif server_reachable is False:
        result.update(
            code="SERVER_NOT_REACHABLE",
            severity="WARNING",
            message="Raspberry Pi accessible, mais le serveur de monitoring n'est pas joignable depuis le Raspberry Pi.",
        )

    return result


def main():
    node_name = sys.argv[1] if len(sys.argv) > 1 else "raspberry-1"
    target_ip = sys.argv[2] if len(sys.argv) > 2 else os.getenv("RASPBERRY_ETHERNET_IP", "").strip()

    mode = os.getenv("RASPBERRY_DIAGNOSTIC_MODE", "real").strip().lower()

    if mode == "simulation":
        scenario = os.getenv("RASPBERRY_DIAGNOSTIC_SCENARIO", "ok").strip().lower()
        result = simulation_result(node_name, scenario)
    else:
        result = build_real_result(node_name, target_ip)

    print("========================================")
    print("      RASPBERRY PI DIAGNOSTIC")
    print("========================================")
    print("Node     :", result.get("node_name"))
    print("SSH      :", result.get("ssh"))
    print("CPU      :", result.get("cpu"))
    print("RAM      :", result.get("ram"))
    print("Disk     :", result.get("disk"))
    print("Ethernet :", result.get("ethernet"))
    print("Wi-Fi    :", result.get("wifi"))
    print("Result   :", result.get("code"))
    print("Message  :", result.get("message"))
    print("========================================")
    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
