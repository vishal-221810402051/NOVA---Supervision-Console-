from __future__ import annotations

import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
from typing import Any, Awaitable, Callable


IPC_SOCKET_PATH = "/tmp/nova-sc-rtc-sync.sock"
IPC_PROTOCOL_VERSION = 1
RTC_SYNC_SEND_ONCE_ACTION = "rtc_sync_send_once"
MAX_IPC_REQUEST_BYTES = 4096


class RtcSyncIpcError(ValueError):
    pass


class RtcSyncIpcServer:
    def __init__(
        self,
        *,
        send_once: Callable[[], Awaitable[dict[str, Any]]],
        socket_path: str = IPC_SOCKET_PATH,
    ) -> None:
        self.send_once = send_once
        self.socket_path = socket_path
        self._server: asyncio.AbstractServer | None = None
        self._send_lock = asyncio.Lock()

    async def start(self) -> None:
        if self._server is not None:
            return

        path = Path(self.socket_path)
        if path.exists():
            path.unlink()

        self._server = await asyncio.start_unix_server(
            self._handle_client,
            path=self.socket_path,
        )
        os.chmod(self.socket_path, 0o600)
        print(f"RTC sync IPC server listening on {self.socket_path}", flush=True)

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        with suppress(FileNotFoundError):
            Path(self.socket_path).unlink()
        print("RTC sync IPC server stopped", flush=True)

    async def _handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            request_bytes = await reader.readline()
            response = await self.handle_request_bytes(request_bytes)
        except Exception as exc:
            response = {
                "write_attempted": False,
                "write_ok": False,
                "result_received": False,
                "failure_reason": f"IPC_SERVER_ERROR: {exc}",
            }

        writer.write(json.dumps(response, sort_keys=True).encode("utf-8") + b"\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def handle_request_bytes(self, request_bytes: bytes) -> dict[str, Any]:
        try:
            request = decode_ipc_request(request_bytes)
        except RtcSyncIpcError as exc:
            return _rejection(str(exc))

        if self._send_lock.locked():
            return _rejection("RTC_SYNC_ALREADY_ACTIVE")

        async with self._send_lock:
            return await self.send_once()


def decode_ipc_request(request_bytes: bytes) -> dict[str, Any]:
    if len(request_bytes) > MAX_IPC_REQUEST_BYTES:
        raise RtcSyncIpcError("IPC request exceeds maximum size")

    try:
        request = json.loads(request_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RtcSyncIpcError(f"Invalid IPC JSON request: {exc}") from exc

    if not isinstance(request, dict):
        raise RtcSyncIpcError("IPC request must be a JSON object")
    if request.get("protocol_version") != IPC_PROTOCOL_VERSION:
        raise RtcSyncIpcError("Unsupported IPC protocol_version")
    if request.get("action") != RTC_SYNC_SEND_ONCE_ACTION:
        raise RtcSyncIpcError("Unsupported IPC action")
    if set(request) != {"action", "protocol_version"}:
        raise RtcSyncIpcError("IPC request contains unsupported fields")
    return request


def _rejection(reason: str) -> dict[str, Any]:
    return {
        "write_attempted": False,
        "write_ok": False,
        "result_received": False,
        "failure_reason": reason,
    }
