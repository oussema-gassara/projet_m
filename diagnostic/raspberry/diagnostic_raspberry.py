import json
import sys


def build_result(node_name, scenario):
    result = {
        "node_name": node_name,
        "simulation": True,
        "cpu": "OK",
        "ram": "OK",
        "disk": "OK",
        "network": "OK",
        "server_reachable": True,
        "code": "RASPBERRY_OK",
        "severity": "OK",
        "message": "Raspberry Pi opérationnel.",
    }

    if scenario == "network_error":
        result.update(
            network="ERROR",
            server_reachable=False,
            code="WIFI_ERROR",
            severity="WARNING",
            message="Vérifier la connexion réseau du Raspberry Pi.",
        )
    elif scenario == "cpu_error":
        result.update(
            cpu="ERROR",
            code="CPU_ERROR",
            severity="WARNING",
            message="Vérifier la charge ou la température du processeur.",
        )
    elif scenario == "ram_error":
        result.update(
            ram="ERROR",
            code="RAM_ERROR",
            severity="WARNING",
            message="Utilisation de la RAM anormale.",
        )
    elif scenario == "disk_error":
        result.update(
            disk="ERROR",
            code="DISK_ERROR",
            severity="WARNING",
            message="Vérifier l'espace disque du Raspberry Pi.",
        )

    return result


def main():
    node_name = sys.argv[1] if len(sys.argv) > 1 else "raspberry-1"
    scenario = sys.argv[2] if len(sys.argv) > 2 else "network_error"

    result = build_result(node_name, scenario)

    print("========================================")
    print("   RASPBERRY PI DIAGNOSTIC SIMULATION")
    print("========================================")
    print("Node    :", result["node_name"])
    print("CPU     :", result["cpu"])
    print("RAM     :", result["ram"])
    print("Disk    :", result["disk"])
    print("Network :", result["network"])
    print("Result  :", result["code"])
    print("Message :", result["message"])
    print("========================================")
    print("FINAL_RESULT_JSON=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
