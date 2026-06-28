from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import getpass
import os
import socket
from typing import Any, Callable

from pi_time_trust import PiTimeTrustEvidence, evaluate_pi_time_trust
from rtc_sync_protocol import (
    build_rtc_session_sync_request,
    hash_rtc_session_sync_request,
    serialize_rtc_session_sync_request,
)

RESULT_TIMEOUT_SECONDS = 15.0
RTC_SYNC_RESULT_EVENT_TYPE = "RTC_SYNC_RESULT_TELEMETRY"
RTC_SYNC_SUCCESS = "RTC_SYNC_SUCCESS"


def preview_rtc_sync_request(trust_evidence: PiTimeTrustEvidence) -> dict[str, Any]:
    request = build_rtc_session_sync_request(trust_evidence)
    frame = serialize_rtc_session_sync_request(request)
    return {
        "trust_evidence": trust_evidence.to_dict(),
        "request": request.to_dict(),
        "request_hash": hash_rtc_session_sync_request(request),
        "frame_length_bytes": len(frame),
        "write_attempted": False,
        "result_wait_supported": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "operator": getpass.getuser(),
        "trigger_source": "BACKEND_LOCAL_CLI",
        "hostname": socket.gethostname(),
        "process_id": os.getpid(),
    }


async def send_one_rtc_sync_request(
    *,
    serial_bridge: Any,
    hardware_stream_manager: Any,
    backend_mode: str,
    trust_evaluator: Callable[[], PiTimeTrustEvidence] = evaluate_pi_time_trust,
    result_timeout_seconds: float = RESULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    trust_evidence = trust_evaluator()
    audit = _base_audit(trust_evidence)
    audit["result_timeout_seconds"] = result_timeout_seconds

    if not trust_evidence.trust_allowed:
        audit["failure_reason"] = "PI_TIME_UNTRUSTED"
        return audit

    request = build_rtc_session_sync_request(trust_evidence)
    frame = serialize_rtc_session_sync_request(request)
    audit.update(
        {
            "session_sync_id": request.session_sync_id,
            "request_hash": hash_rtc_session_sync_request(request),
            "frame_length_bytes": len(frame),
        }
    )

    if backend_mode != "hardware":
        audit["failure_reason"] = "BACKEND_NOT_HARDWARE_MODE"
        return audit
    if serial_bridge is None or not hasattr(serial_bridge, "send_rtc_session_sync_frame"):
        audit["failure_reason"] = "SERIAL_BRIDGE_UNAVAILABLE"
        return audit
    if hardware_stream_manager is None or not hasattr(hardware_stream_manager, "subscribe"):
        audit["failure_reason"] = "HARDWARE_STREAM_MANAGER_UNAVAILABLE"
        return audit

    subscriber_queue = await hardware_stream_manager.subscribe()
    try:
        audit["sent_at_utc"] = _utc_now()
        write_result = await serial_bridge.send_rtc_session_sync_frame(frame)
        audit.update(
            {
                "write_attempted": write_result.write_attempted,
                "write_ok": write_result.write_ok,
                "bytes_written": write_result.bytes_written,
            }
        )
        if not write_result.write_ok:
            audit["failure_reason"] = write_result.error or "SERIAL_WRITE_FAILED"
            return audit

        matched_result = await _wait_for_rtc_sync_result(
            subscriber_queue,
            request.session_sync_id,
            timeout_seconds=result_timeout_seconds,
        )
        if matched_result is None:
            audit["failure_reason"] = "RTC_SYNC_RESULT_TIMEOUT"
            return audit

        audit.update(
            {
                "result_received": True,
                "result_received_at_utc": _utc_now(),
                "rtc_sync_result": matched_result,
            }
        )
        if not _is_success_result(matched_result):
            audit["failure_reason"] = "RTC_SYNC_RESULT_REJECTED"
        return audit
    finally:
        await hardware_stream_manager.unsubscribe(subscriber_queue)


def _base_audit(trust_evidence: PiTimeTrustEvidence) -> dict[str, Any]:
    return {
        "trigger_source": "BACKEND_LOCAL_CLI",
        "operator": getpass.getuser(),
        "hostname": socket.gethostname(),
        "process_id": os.getpid(),
        "session_sync_id": None,
        "request_hash": None,
        "frame_length_bytes": 0,
        "trust_evidence": trust_evidence.to_dict(),
        "sent_at_utc": None,
        "bytes_written": 0,
        "write_attempted": False,
        "write_ok": False,
        "result_wait_supported": True,
        "result_received": False,
        "result_received_at_utc": None,
        "result_timeout_seconds": RESULT_TIMEOUT_SECONDS,
        "rtc_sync_result": None,
        "failure_reason": None,
    }


async def _wait_for_rtc_sync_result(
    queue: asyncio.Queue[dict[str, Any]],
    session_sync_id: str,
    *,
    timeout_seconds: float,
) -> dict[str, Any] | None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            return None
        try:
            packet = await asyncio.wait_for(queue.get(), timeout=remaining)
        except asyncio.TimeoutError:
            return None
        if _matches_rtc_sync_result(packet, session_sync_id):
            return packet


def _matches_rtc_sync_result(packet: dict[str, Any], session_sync_id: str) -> bool:
    if packet.get("event_type") != RTC_SYNC_RESULT_EVENT_TYPE:
        return False
    payload = packet.get("payload")
    if not isinstance(payload, dict):
        return False
    return payload.get("session_sync_id") == session_sync_id


def _is_success_result(packet: dict[str, Any]) -> bool:
    payload = packet.get("payload")
    if not isinstance(payload, dict):
        return False
    return payload.get("result") == RTC_SYNC_SUCCESS


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
