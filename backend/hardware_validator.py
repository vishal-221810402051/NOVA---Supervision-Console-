from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from protocol import PACKET_TYPE_TO_EVENT_TYPE, RAW_SCHEMA_VERSION, is_known_node_id, normalize_node_id


@dataclass(frozen=True)
class HardwareValidationRejection:
    reason: str
    severity: str
    details: str
    source_node_id: str | None = None
    source_sequence_number: int | None = None


@dataclass(frozen=True)
class ValidatedHardwarePacket:
    schema_version: str
    packet_type: str
    source_node_id: str
    target_node_id: str | None
    source_sequence_number: int
    producer_timestamp_ms: int | float | None
    payload: dict[str, Any]


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _is_non_negative_int(value: Any) -> bool:
    return isinstance(value, int) and value >= 0


def parse_uart_json_line(line: bytes | str) -> tuple[dict[str, Any] | None, HardwareValidationRejection | None]:
    try:
        text = line.decode("utf-8") if isinstance(line, bytes) else line
    except UnicodeDecodeError:
        return None, HardwareValidationRejection(
            reason="INVALID_JSON",
            severity="ERROR",
            details="UART line was not valid UTF-8",
        )

    text = text.strip("\r\n")
    if not text:
        return None, HardwareValidationRejection(
            reason="INVALID_JSON",
            severity="WARNING",
            details="UART line was empty",
        )

    try:
        raw = json.loads(text)
    except json.JSONDecodeError:
        return None, HardwareValidationRejection(
            reason="INVALID_JSON",
            severity="ERROR",
            details="UART line was not valid JSON",
        )

    if not _is_record(raw):
        return None, HardwareValidationRejection(
            reason="INVALID_PAYLOAD_SHAPE",
            severity="ERROR",
            details="UART JSON root must be an object",
        )

    return raw, None


def validate_raw_hardware_packet(
    raw: dict[str, Any],
) -> tuple[ValidatedHardwarePacket | None, HardwareValidationRejection | None]:
    required_fields = [
        "schema_version",
        "packet_type",
        "source_node_id",
        "source_sequence_number",
        "payload",
    ]
    missing = [field for field in required_fields if field not in raw]
    if missing:
        return None, HardwareValidationRejection(
            reason="MISSING_REQUIRED_FIELD",
            severity="ERROR",
            details=f"Hardware packet missing required field(s): {', '.join(missing)}",
        )

    if raw["schema_version"] != RAW_SCHEMA_VERSION:
        return None, HardwareValidationRejection(
            reason="INVALID_SCHEMA_VERSION",
            severity="ERROR",
            details=f"Hardware schema_version must be {RAW_SCHEMA_VERSION}",
        )

    packet_type = raw["packet_type"]
    if packet_type not in PACKET_TYPE_TO_EVENT_TYPE:
        return None, HardwareValidationRejection(
            reason="UNKNOWN_EVENT_TYPE",
            severity="ERROR",
            details=f"Unknown hardware packet_type: {packet_type}",
        )

    source_node_id = raw["source_node_id"]
    if not isinstance(source_node_id, str) or not is_known_node_id(source_node_id):
        return None, HardwareValidationRejection(
            reason="UNKNOWN_SOURCE_NODE",
            severity="ERROR",
            details=f"Unknown hardware source_node_id: {source_node_id}",
            source_node_id=source_node_id if isinstance(source_node_id, str) else None,
        )

    target_node_id = raw.get("target_node_id")
    if target_node_id is not None:
        if not isinstance(target_node_id, str) or not is_known_node_id(target_node_id):
            return None, HardwareValidationRejection(
                reason="UNKNOWN_SOURCE_NODE",
                severity="ERROR",
                details=f"Unknown hardware target_node_id: {target_node_id}",
                source_node_id=normalize_node_id(source_node_id),
            )
        target_node_id = normalize_node_id(target_node_id)

    source_sequence_number = raw["source_sequence_number"]
    if not _is_non_negative_int(source_sequence_number):
        return None, HardwareValidationRejection(
            reason="INVALID_NUMERIC_RANGE",
            severity="ERROR",
            details="source_sequence_number must be a non-negative integer",
            source_node_id=normalize_node_id(source_node_id),
        )

    payload = raw["payload"]
    if not _is_record(payload):
        return None, HardwareValidationRejection(
            reason="INVALID_PAYLOAD_SHAPE",
            severity="ERROR",
            details="payload must be an object",
            source_node_id=normalize_node_id(source_node_id),
            source_sequence_number=source_sequence_number,
        )

    producer_timestamp_ms = raw.get("producer_timestamp_ms")
    if producer_timestamp_ms is not None and not isinstance(producer_timestamp_ms, (int, float)):
        return None, HardwareValidationRejection(
            reason="INVALID_NUMERIC_RANGE",
            severity="ERROR",
            details="producer_timestamp_ms must be numeric when present",
            source_node_id=normalize_node_id(source_node_id),
            source_sequence_number=source_sequence_number,
        )

    return (
        ValidatedHardwarePacket(
            schema_version=raw["schema_version"],
            packet_type=packet_type,
            source_node_id=normalize_node_id(source_node_id),
            target_node_id=target_node_id,
            source_sequence_number=source_sequence_number,
            producer_timestamp_ms=producer_timestamp_ms,
            payload=payload,
        ),
        None,
    )
