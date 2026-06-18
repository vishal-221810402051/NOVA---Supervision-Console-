from __future__ import annotations

from datetime import datetime, timezone
import getpass
import os
import socket
from typing import Any

from pi_time_trust import PiTimeTrustEvidence
from rtc_sync_protocol import (
    build_rtc_session_sync_request,
    hash_rtc_session_sync_request,
    serialize_rtc_session_sync_request,
)


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
