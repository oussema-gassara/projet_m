import json
import os
import shutil
import subprocess
import sys


REMOTE_DIAGNOSTIC_SCRIPT = r'''
set +e

hostname_value=$(hostname 2>/dev/null || echo unknown)
echo "HOSTNAME=$hostname_value"

# Ethernet interface used for SSH diagnostic transport.
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

# Wi-Fi interface / hardware state.
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

# Check if the Raspberry Pi can reach the monitoring backend.
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
        "ethernet": "OK",
        "wifi": "OK",
        "network": "OK",
        "server_reachable": True,
        "code": "RASPBERRY_OK",
        "severity": "OK",
        "message": "Raspberry Pi accessible via Ethernet et réseau opérationnel.",
    }

    if scenario == "wifi_hardware_error":
        result.update(
            wifi="HARDWARE_ERROR",
            code="WIFI_HARDWARE_ERROR",
            severity="DANGER",
            message="Interface Wi-Fi absente, désactivée ou potentiellement défaillante.",
        )
    elif scenario == "wifi_disconnected":
        result.update(
            wifi="DISCONNECTED",
            code="WIFI_DISCONNECTED",
            severity="WARNING",
            message="Interface Wi-Fi présente mais non connectée. Le diagnostic reste disponible via Ethernet.",
        )
    elif scenario == "server_error":
        result.update(
            server_reachable=False,
            code="SERVER_NOT_REACHABLE",
            severity="WARNING",
            message="Raspberry Pi accessible, mais le serveur de monitoring n'est pas joignable.",
        )
    elif scenario == "ssh_error":
        result.update(
            ssh="ERROR",
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


def base_error(node_name, code, message, target_ip=None):
    result = {
        "node_name": node_name,
        "simulation": False,
        "ssh": "ERROR",
        "ethernet": "UNKNOWN",
        "wifi": "UNKNOWN",
        "network": "ERROR",
        "server_reachable": None,
        "code": code,
        "severity": "DANGER",
        "message": message,
    }
    if target_ip:
        result["target_ip"] = target_ip
    return result


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
            "ethernet": "UNKNOWN",
            "wifi": "UNKNOWN",
            "network": "UNKNOWN",
            "server_reachable": None,
            "code": "SSH_CONFIG_MISSING",
            "severity": "WARNING",
            "message": "Configuration SSH incomplète. Définissez l'adresse Ethernet et l'utilisateur SSH du Raspberry Pi.",
        }

    if not ssh_command:
        return base_error(
            node_name,
            "SSH_CLIENT_NOT_FOUND",
            "Client SSH introuvable sur le serveur de monitoring.",
            target_ip,
        )

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
        return base_error(
            node_name,
            "RASPBERRY_SSH_UNREACHABLE",
            "Raspberry Pi inaccessible via SSH sur Ethernet. Vérifiez le câble Ethernet, l'adresse IP et le service SSH.",
            target_ip,
        )
    except OSError as error:
        return base_error(
            node_name,
            "SSH_START_ERROR",
            f"Impossible de démarrer SSH: {error}",
            target_ip,
        )

    if completed.returncode != 0:
        return base_error(
            node_name,
            "RASPBERRY_SSH_UNREACHABLE",
            "Raspberry Pi inaccessible via SSH sur Ethernet. Vérifiez le câble Ethernet, l'adresse IP et le service SSH.",
            target_ip,
        )

    data = parse_key_values(completed.stdout)

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
        "ethernet": ethernet_status,
        "ethernet_ip": data.get("ETHERNET_IP", "UNKNOWN"),
        "wifi": wifi_status,
        "wifi_ssid": data.get("WIFI_SSID", "UNKNOWN"),
        "network": ethernet_status,
        "server_reachable": server_reachable,
        "code": "RASPBERRY_OK",
        "severity": "OK",
        "message": "Raspberry Pi accessible via Ethernet et réseau opérationnel.",
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
    elif wifi_status == "DISCONNECTED":
        result.update(
            code="WIFI_DISCONNECTED",
            severity="WARNING",
            message="Wi-Fi présent mais non connecté. Le diagnostic reste disponible via Ethernet.",
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
    print("      RASPBERRY PI NETWORK DIAGNOSTIC")
    print("========================================")
    print("Node     :", result.get("node_name"))
    print("SSH      :", result.get("ssh"))
    print("Ethernet :", result.get("ethernet"))
    print("Wi-Fi    :", result.get("wifi"))
    print("Server   :", result.get("server_reachable"))
    print("Result   :", result.get("code"))
    print("Message  :", result.get("message"))
    print("========================================")
    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
