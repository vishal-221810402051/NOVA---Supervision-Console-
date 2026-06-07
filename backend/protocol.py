from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from gateway_state import GatewayState


SCHEMA_VERSION = "v1.0"
RAW_SCHEMA_VERSION = "hw.v1"
RUN_ID = "NOVA_SC_PHASE_6_1"

NODE_IDS = {
    "LAPTOP_CONSOLE": "laptop_console",
    "PI_GATEWAY": "pi_gateway",
    "ESP32_MAIN": "esp32_main",
    "ESP32_SUB": "esp32_sub",
}

LEGACY_NODE_ALIASES = {
    "esp32_motion": NODE_IDS["ESP32_MAIN"],
    "esp32_qc": NODE_IDS["ESP32_SUB"],
}

ALLOWED_NODE_IDS = set(NODE_IDS.values())

LINK_IDS = {
    "LAPTOP_PI": "link_laptop_pi",
    "PI_MAIN": "link_pi_main",
    "MAIN_SUB": "link_main_sub",
}

PACKET_TYPE_TO_EVENT_TYPE = {
    "NODE_HEALTH": "NODE_HEALTH_TELEMETRY",
    "CHIP_STATUS": "CHIP_STATUS_TELEMETRY",
    "POWER_HEALTH": "POWER_HEALTH_TELEMETRY",
    "LINK_HEARTBEAT": "LINK_HEARTBEAT_TELEMETRY",
    "LINK_SYNC": "LINK_SYNC_TELEMETRY",
    "INTEGRITY_EVENT": "TELEMETRY_INTEGRITY_EVENT",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_node_id(node_id: str) -> str:
    return LEGACY_NODE_ALIASES.get(node_id, node_id)


def is_known_node_id(node_id: str) -> bool:
    return normalize_node_id(node_id) in ALLOWED_NODE_IDS


def build_packet_metadata(
    *,
    state: GatewayState,
    source_node_id: str,
    source_sequence_number: int | None = None,
    producer_timestamp_utc: str | None = None,
) -> dict[str, Any]:
    normalized_source = normalize_node_id(source_node_id)
    global_sequence_number = state.next_global_sequence()
    source_sequence = (
        source_sequence_number
        if source_sequence_number is not None
        else state.next_gateway_source_sequence(normalized_source)
    )
    received_utc = utc_now()

    return {
        "schema_version": SCHEMA_VERSION,
        "stream_id": state.stream_id,
        "global_sequence_number": global_sequence_number,
        "source_node_id": normalized_source,
        "source_sequence_number": source_sequence,
        "producer_timestamp_utc": producer_timestamp_utc or received_utc,
        "supervisor_received_utc": received_utc,
        "timestamp_utc": received_utc,
        "sequence_number": global_sequence_number,
        "run_id": RUN_ID,
        "node_id": normalized_source,
    }


def build_gateway_health_packet(state: GatewayState) -> dict[str, Any]:
    health_status = state.to_health_status()
    bridge_healthy = health_status["bridge_status"] in {
        "DISABLED",
        "SERIAL_CONNECTED",
        "WAITING_FOR_SERIAL",
        "WAITING_FOR_HARDWARE_PACKETS",
    }

    return {
        **build_packet_metadata(state=state, source_node_id=NODE_IDS["PI_GATEWAY"]),
        "event_type": "GATEWAY_HEALTH_TELEMETRY",
        "payload": {
            "node_id": NODE_IDS["PI_GATEWAY"],
            "health_state": "HEALTHY" if bridge_healthy else "DEGRADED",
            "uptime_ms": health_status["malformed_packet_count"]
            + health_status["dropped_packet_count"],
            "cpu_percent": 0,
            "memory_used_percent": 0,
            "disk_used_percent": 0,
            "buffer_depth": 0,
            "dropped_packets": health_status["dropped_packet_count"],
            "status_message": f"Pi gateway bridge status: {health_status['bridge_status']}",
        },
    }


def build_integrity_event_packet(
    *,
    state: GatewayState,
    anomaly_type: str,
    severity: str,
    details: str,
    affected_source_node_id: str | None = None,
    affected_sequence_number: int | None = None,
) -> dict[str, Any]:
    return {
        **build_packet_metadata(state=state, source_node_id=NODE_IDS["PI_GATEWAY"]),
        "event_type": "TELEMETRY_INTEGRITY_EVENT",
        "payload": {
            "anomaly_type": anomaly_type,
            "severity": severity,
            "affected_stream_id": state.stream_id,
            "affected_source_node_id": affected_source_node_id,
            "affected_sequence_number": affected_sequence_number,
            "details": details,
        },
    }
