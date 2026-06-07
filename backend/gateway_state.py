from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class GatewayState:
    def __init__(
        self,
        *,
        mode: str,
        stream_prefix: str,
        serial_port: str | None = None,
        baud: int = 115200,
    ) -> None:
        self.mode = mode
        self.stream_id = (
            f"{stream_prefix}_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        )
        self.serial_port = serial_port
        self.baud = baud

        self._lock = Lock()
        self.global_sequence_number = 0
        self.source_sequence_observations: dict[str, int] = {}
        self.gateway_source_sequences: dict[str, int] = {}

        self.malformed_packet_count = 0
        self.dropped_packet_count = 0
        self.serial_connected = False
        self.hardware_connected = False
        self.last_esp32_main_packet_utc: str | None = None
        self.last_esp32_sub_packet_utc: str | None = None
        self.bridge_status = "DISABLED"
        self.last_error: str | None = None

    def next_global_sequence(self) -> int:
        with self._lock:
            self.global_sequence_number += 1
            return self.global_sequence_number

    def next_gateway_source_sequence(self, source_node_id: str) -> int:
        with self._lock:
            current = self.gateway_source_sequences.get(source_node_id, 0) + 1
            self.gateway_source_sequences[source_node_id] = current
            return current

    def observe_source_packet(
        self, source_node_id: str, source_sequence_number: int
    ) -> None:
        now = _utc_now()
        with self._lock:
            self.source_sequence_observations[source_node_id] = source_sequence_number
            if source_node_id == "esp32_main":
                self.last_esp32_main_packet_utc = now
            elif source_node_id == "esp32_sub":
                self.last_esp32_sub_packet_utc = now

    def record_malformed_packet(self, details: str | None = None) -> None:
        with self._lock:
            self.malformed_packet_count += 1
            self.last_error = details

    def record_dropped_packet(self, details: str | None = None) -> None:
        with self._lock:
            self.dropped_packet_count += 1
            self.last_error = details

    def set_serial_status(
        self,
        *,
        serial_connected: bool,
        hardware_connected: bool | None = None,
        bridge_status: str,
        last_error: str | None = None,
    ) -> None:
        with self._lock:
            self.serial_connected = serial_connected
            if hardware_connected is not None:
                self.hardware_connected = hardware_connected
            self.bridge_status = bridge_status
            self.last_error = last_error

    def to_health_status(self) -> dict:
        with self._lock:
            return {
                "backend_mode": self.mode,
                "stream_id": self.stream_id,
                "bridge_status": self.bridge_status,
                "serial_port": self.serial_port,
                "baud": self.baud,
                "serial_connected": self.serial_connected,
                "hardware_connected": self.hardware_connected,
                "malformed_packet_count": self.malformed_packet_count,
                "dropped_packet_count": self.dropped_packet_count,
                "source_sequence_observations": dict(self.source_sequence_observations),
                "last_esp32_main_packet_utc": self.last_esp32_main_packet_utc,
                "last_esp32_sub_packet_utc": self.last_esp32_sub_packet_utc,
                "last_error": self.last_error,
            }
