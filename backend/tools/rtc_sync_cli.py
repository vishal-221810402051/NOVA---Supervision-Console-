from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from pi_time_trust import evaluate_pi_time_trust
from rtc_sync_ipc import (
    IPC_PROTOCOL_VERSION,
    IPC_SOCKET_PATH,
    RTC_SYNC_SEND_ONCE_ACTION,
)
from rtc_sync_protocol import RtcSyncProtocolError
from rtc_sync_service import preview_rtc_sync_request


def _is_successful_send(audit: dict) -> bool:
    result = audit.get("rtc_sync_result")
    payload = result.get("payload") if isinstance(result, dict) else None
    if not isinstance(payload, dict):
        payload = {}
    return (
        audit.get("write_ok") is True
        and audit.get("result_received") is True
        and payload.get("result") == "RTC_SYNC_SUCCESS"
    )


async def _send_once(socket_path: str) -> dict:
    request = {
        "action": RTC_SYNC_SEND_ONCE_ACTION,
        "protocol_version": IPC_PROTOCOL_VERSION,
    }

    try:
        reader, writer = await asyncio.open_unix_connection(socket_path)
    except (FileNotFoundError, ConnectionRefusedError, OSError, AttributeError) as exc:
        return {
            "write_attempted": False,
            "write_ok": False,
            "result_received": False,
            "failure_reason": f"RTC_SYNC_IPC_UNAVAILABLE: {exc}",
        }

    writer.write(json.dumps(request, sort_keys=True).encode("utf-8") + b"\n")
    await writer.drain()
    response = await reader.readline()
    writer.close()
    await writer.wait_closed()

    try:
        decoded = json.loads(response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return {
            "write_attempted": False,
            "write_ok": False,
            "result_received": False,
            "failure_reason": f"RTC_SYNC_IPC_BAD_RESPONSE: {exc}",
        }
    return decoded


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate whether Pi time is trusted for a future RTC sync."
    )
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate trust only; this tool never writes to UART.",
    )
    modes.add_argument(
        "--preview-request",
        action="store_true",
        help="Build and print an RTC sync request preview without writing to UART.",
    )
    modes.add_argument(
        "--send-once",
        action="store_true",
        help="Ask the running backend to send one RTC sync request over its owned UART.",
    )
    parser.add_argument(
        "--socket-path",
        default=IPC_SOCKET_PATH,
        help="Backend-local RTC sync Unix socket path.",
    )
    args = parser.parse_args()

    if args.send_once:
        output = asyncio.run(_send_once(args.socket_path))
        print(json.dumps(output, indent=2, sort_keys=True))
        print(f"SYNC_ALLOWED={'true' if output.get('trust_evidence', {}).get('trust_allowed') else 'false'}")
        print(f"WRITE_ATTEMPTED={'true' if output.get('write_attempted') else 'false'}")
        return 0 if _is_successful_send(output) else 1

    evidence = evaluate_pi_time_trust()
    if args.preview_request and evidence.trust_allowed:
        try:
            output = preview_rtc_sync_request(evidence)
        except RtcSyncProtocolError as exc:
            output = {"trust_evidence": evidence.to_dict(), "error": str(exc)}
            print(json.dumps(output, indent=2, sort_keys=True))
            print("SYNC_ALLOWED=false")
            print("WRITE_ATTEMPTED=false")
            return 1
    else:
        output = evidence.to_dict()

    print(json.dumps(output, indent=2, sort_keys=True))
    print(f"SYNC_ALLOWED={'true' if evidence.trust_allowed else 'false'}")
    print("WRITE_ATTEMPTED=false")
    return 0 if evidence.trust_allowed else 1


if __name__ == "__main__":
    raise SystemExit(main())
