from __future__ import annotations

import asyncio
from typing import Any

from gateway_state import GatewayState
from hardware_normalizer import normalize_hardware_packet
from hardware_validator import parse_uart_json_line, validate_raw_hardware_packet
from protocol import build_integrity_event_packet


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
        except Exception as exc:
            self.state.set_serial_status(
                serial_connected=False,
                hardware_connected=False,
                bridge_status="SERIAL_OPEN_FAILED",
                last_error=str(exc),
            )
            return

        while self._running:
            try:
                line = await asyncio.to_thread(self._serial.readline)
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
                    )
                )
                await asyncio.sleep(1)
                continue

            if not line:
                self.state.set_serial_status(
                    serial_connected=True,
                    hardware_connected=True,
                    bridge_status="WAITING_FOR_HARDWARE_PACKETS",
                )
                continue

            raw, parse_rejection = parse_uart_json_line(line)
            if parse_rejection:
                await self._emit_rejection(parse_rejection)
                continue

            packet, validation_rejection = validate_raw_hardware_packet(raw)
            if validation_rejection:
                await self._emit_rejection(validation_rejection)
                continue

            await self.output_queue.put(normalize_hardware_packet(packet, self.state))

    async def _emit_rejection(self, rejection) -> None:
        self.state.record_malformed_packet(rejection.details)
        await self.output_queue.put(
            build_integrity_event_packet(
                state=self.state,
                anomaly_type="SCHEMA_REJECTION",
                severity=rejection.severity,
                details=f"{rejection.reason}: {rejection.details}",
                affected_source_node_id=rejection.source_node_id,
                affected_sequence_number=rejection.source_sequence_number,
            )
        )
