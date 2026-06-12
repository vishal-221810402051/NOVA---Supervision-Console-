from __future__ import annotations

import asyncio
import time
from typing import Any

from gateway_state import GatewayState
from hardware_normalizer import normalize_hardware_packet
from hardware_validator import (
    HardwareValidationRejection,
    parse_uart_json_line,
    validate_raw_hardware_packet,
)
from protocol import build_integrity_event_packet

STARTUP_GRACE_SECONDS = 2.0
STARTUP_SETTLE_SECONDS = 0.2


class SerialBridge:
    def __init__(
        self,
        *,
        state: GatewayState,
        output_queue: asyncio.Queue[dict[str, Any]],
        serial_port: str | None,
        baud: int = 115200,
    ) -> None:
        self.state = state
        self.output_queue = output_queue
        self.serial_port = serial_port
        self.baud = baud
        self._task: asyncio.Task | None = None
        self._running = False
        self._serial = None
        self._startup_fragment_count = 0
        self._boundary_fragment_count = 0

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._running = True
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._serial is not None:
            await asyncio.to_thread(self._serial.close)
            self._serial = None
        self.state.set_serial_status(
            serial_connected=False,
            hardware_connected=False,
            bridge_status="STOPPED",
        )

    async def _run(self) -> None:
        if not self.serial_port:
            self.state.set_serial_status(
                serial_connected=False,
                hardware_connected=False,
                bridge_status="SERIAL_PORT_NOT_CONFIGURED",
                last_error="NOVA_SC_SERIAL_PORT is required in hardware mode",
            )
            return

        try:
            import serial
        except ImportError:
            self.state.set_serial_status(
                serial_connected=False,
                hardware_connected=False,
                bridge_status="PYSERIAL_NOT_INSTALLED",
                last_error="pyserial is required in hardware mode",
            )
            return

        try:
            self._serial = serial.Serial(
                port=self.serial_port,
                baudrate=self.baud,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1,
            )
            self.state.set_serial_status(
                serial_connected=True,
                hardware_connected=True,
                bridge_status="SERIAL_CONNECTED",
            )
            await self._prepare_serial_stream()
        except Exception as exc:
            self.state.set_serial_status(
                serial_connected=False,
                hardware_connected=False,
                bridge_status="SERIAL_OPEN_FAILED",
                last_error=str(exc),
            )
            return

        serial_started_at = time.monotonic()

        while self._running:
            try:
                raw_line = await asyncio.to_thread(self._serial.readline)
            except Exception as exc:
                self.state.set_serial_status(
                    serial_connected=False,
                    hardware_connected=False,
                    bridge_status="SERIAL_READ_FAILED",
                    last_error=str(exc),
                )
                await self.output_queue.put(
                    build_integrity_event_packet(
                        state=self.state,
                        anomaly_type="MALFORMED_PACKET",
                        severity="ERROR",
                        details=f"UART read failed: {exc}",
                        diagnostic_metadata={
                            "source": "serial_bridge",
                            "reason": "SERIAL_READ_FAILED",
                            "raw_length": 0,
                            "safe_preview": "",
                            "boundary_valid": False,
                            "parser_stage": "read",
                            "decode_error": str(exc),
                        },
                    )
                )
                await asyncio.sleep(1)
                continue

            if not raw_line:
                self._mark_waiting_if_no_hardware_seen()
                continue

            raw_length = _raw_length(raw_line)
            line, decode_error = self._decode_uart_line(raw_line)
            if not line:
                continue

            in_startup_grace = (
                time.monotonic() - serial_started_at < STARTUP_GRACE_SECONDS
            )
            if not _has_json_object_boundary(line):
                if in_startup_grace:
                    self._startup_fragment_count += 1
                    continue

                self._boundary_fragment_count += 1
                await self._emit_rejection(
                    HardwareValidationRejection(
                        reason="INVALID_JSON",
                        severity="WARNING",
                        details="UART line was not valid JSON boundary",
                    ),
                    raw_line=line,
                    raw_length=raw_length,
                    boundary_valid=False,
                    parser_stage="boundary",
                    decode_error=decode_error,
                )
                continue

            raw, parse_rejection = parse_uart_json_line(line)
            if parse_rejection:
                await self._emit_rejection(
                    parse_rejection,
                    raw_line=line,
                    raw_length=raw_length,
                    boundary_valid=True,
                    parser_stage="json_parse",
                    decode_error=decode_error,
                )
                continue

            packet, validation_rejection = validate_raw_hardware_packet(raw)
            if validation_rejection:
                await self._emit_rejection(
                    validation_rejection,
                    raw_line=line,
                    raw_length=raw_length,
                    boundary_valid=True,
                    parser_stage="schema_validate",
                    decode_error=decode_error,
                )
                continue

            normalized_packet = normalize_hardware_packet(packet, self.state)
            self.state.set_serial_status(
                serial_connected=True,
                hardware_connected=True,
                bridge_status="SERIAL_CONNECTED",
            )
            await self.output_queue.put(normalized_packet)

    async def _prepare_serial_stream(self) -> None:
        try:
            await asyncio.to_thread(self._serial.reset_input_buffer)
        except Exception:
            pass

        await asyncio.sleep(STARTUP_SETTLE_SECONDS)

        try:
            await asyncio.to_thread(self._serial.readline)
        except Exception:
            pass

    def _decode_uart_line(self, raw_line: bytes | str) -> tuple[str, str | None]:
        if isinstance(raw_line, bytes):
            try:
                return raw_line.decode("utf-8").strip(), None
            except UnicodeDecodeError as exc:
                return raw_line.decode("utf-8", errors="replace").strip(), str(exc)

        return raw_line.strip(), None

    def _mark_waiting_if_no_hardware_seen(self) -> None:
        status = self.state.to_health_status()
        if (
            status["last_esp32_main_packet_utc"] is not None
            or status["last_esp32_sub_packet_utc"] is not None
        ):
            return

        self.state.set_serial_status(
            serial_connected=True,
            hardware_connected=True,
            bridge_status="WAITING_FOR_HARDWARE_PACKETS",
        )

    async def _emit_rejection(
        self,
        rejection,
        *,
        raw_line: bytes | str | None,
        raw_length: int,
        boundary_valid: bool,
        parser_stage: str,
        decode_error: str | None = None,
    ) -> None:
        self.state.record_malformed_packet(rejection.details)
        diagnostic_metadata = {
            "source": "serial_bridge",
            "reason": rejection.reason,
            "raw_length": raw_length,
            "safe_preview": _safe_preview(raw_line),
            "boundary_valid": boundary_valid,
            "parser_stage": parser_stage,
        }
        if decode_error:
            diagnostic_metadata["decode_error"] = decode_error

        await self.output_queue.put(
            build_integrity_event_packet(
                state=self.state,
                anomaly_type="SCHEMA_REJECTION",
                severity=rejection.severity,
                details=f"{rejection.reason}: {rejection.details}",
                affected_source_node_id=rejection.source_node_id,
                affected_sequence_number=rejection.source_sequence_number,
                diagnostic_metadata=diagnostic_metadata,
            )
        )


def _has_json_object_boundary(line: str) -> bool:
    return line.startswith("{") and line.endswith("}")


def _raw_length(raw_line: bytes | str | None) -> int:
    if raw_line is None:
        return 0
    return len(raw_line)


def _safe_preview(raw_line: bytes | str | None, max_length: int = 240) -> str:
    if raw_line is None:
        return ""

    if isinstance(raw_line, bytes):
        text = raw_line.decode("utf-8", errors="replace")
    else:
        text = raw_line

    filtered = "".join(
        char if char in "\r\n\t" or ord(char) >= 32 else "?"
        for char in text
    )
    filtered = filtered.replace("\r", "\\r").replace("\n", "\\n")

    if len(filtered) <= max_length:
        return filtered

    return filtered[:max_length] + "...<truncated>"
