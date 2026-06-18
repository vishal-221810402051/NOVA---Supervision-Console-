from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from typing import Any, Mapping
from uuid import UUID, uuid4

from pi_time_trust import PI_TIME_TRUSTED, PiTimeTrustEvidence


MESSAGE_TYPE = "RTC_SESSION_SYNC_REQUEST"
PROTOCOL_VERSION = 1
SOURCE = "PI_BACKEND"
SAFETY_SCOPE = "RTC_ONLY"
SESSION_ID_PREFIX = "RTC_SYNC_"
EXPIRY_WINDOW_SECONDS = 10
MINIMUM_RTC_YEAR = 2026
MAXIMUM_RTC_YEAR = 2099
MAXIMUM_FRAME_LENGTH_BYTES = 512

_UTC_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_REQUEST_FIELDS = {
    "message_type", "protocol_version", "session_sync_id", "source",
    "source_utc", "expires_at_utc", "pi_time_status",
    "pi_ntp_synchronized", "safety_scope", "no_forward_to_sub",
}


class RtcSyncProtocolError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class RtcSessionSyncRequest:
    message_type: str
    protocol_version: int
    session_sync_id: str
    source: str
    source_utc: str
    expires_at_utc: str
    pi_time_status: str
    pi_ntp_synchronized: bool
    safety_scope: str
    no_forward_to_sub: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _format_utc(value: datetime) -> str:
    if value.tzinfo is None:
        raise RtcSyncProtocolError("UTC value must be timezone-aware")
    value = value.astimezone(timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S") + f".{value.microsecond // 1000:03d}Z"


def _parse_utc(value: Any, field_name: str) -> datetime:
    if not isinstance(value, str) or not _UTC_PATTERN.fullmatch(value):
        raise RtcSyncProtocolError(
            f"{field_name} must use UTC ISO format with millisecond precision and Z suffix"
        )
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00").astimezone(timezone.utc)
    except ValueError as exc:
        raise RtcSyncProtocolError(f"{field_name} is not a valid UTC timestamp") from exc


def build_rtc_session_sync_request(
    trust_evidence: PiTimeTrustEvidence,
    *,
    utc_now: datetime | None = None,
) -> RtcSessionSyncRequest:
    if not trust_evidence.trust_allowed:
        raise RtcSyncProtocolError("Pi time trust does not allow RTC sync request preview")
    if trust_evidence.pi_time_status != PI_TIME_TRUSTED:
        raise RtcSyncProtocolError("Pi time status must be PI_TIME_TRUSTED")
    if trust_evidence.pi_ntp_synchronized is not True:
        raise RtcSyncProtocolError("Pi NTP synchronization must be true")

    source_time = utc_now or datetime.now(timezone.utc)
    if source_time.tzinfo is None:
        raise RtcSyncProtocolError("Build time must be timezone-aware")
    source_time = source_time.astimezone(timezone.utc)
    request = RtcSessionSyncRequest(
        message_type=MESSAGE_TYPE,
        protocol_version=PROTOCOL_VERSION,
        session_sync_id=f"{SESSION_ID_PREFIX}{uuid4()}",
        source=SOURCE,
        source_utc=_format_utc(source_time),
        expires_at_utc=_format_utc(
            source_time + timedelta(seconds=EXPIRY_WINDOW_SECONDS)
        ),
        pi_time_status=PI_TIME_TRUSTED,
        pi_ntp_synchronized=True,
        safety_scope=SAFETY_SCOPE,
        no_forward_to_sub=True,
    )
    validate_rtc_session_sync_request(request)
    return request


def validate_rtc_session_sync_request(
    request: RtcSessionSyncRequest | Mapping[str, Any],
) -> None:
    values = request.to_dict() if isinstance(request, RtcSessionSyncRequest) else dict(request)
    fields = set(values)
    if fields != _REQUEST_FIELDS:
        unknown = sorted(fields - _REQUEST_FIELDS)
        missing = sorted(_REQUEST_FIELDS - fields)
        raise RtcSyncProtocolError(
            f"Fields must match exact allowlist; unknown={unknown}, missing={missing}"
        )
    if values["message_type"] != MESSAGE_TYPE:
        raise RtcSyncProtocolError(f"message_type must be {MESSAGE_TYPE}")
    if type(values["protocol_version"]) is not int or values["protocol_version"] != PROTOCOL_VERSION:
        raise RtcSyncProtocolError(f"protocol_version must be {PROTOCOL_VERSION}")
    if values["source"] != SOURCE:
        raise RtcSyncProtocolError(f"source must be {SOURCE}")
    if values["pi_time_status"] != PI_TIME_TRUSTED:
        raise RtcSyncProtocolError("pi_time_status must be PI_TIME_TRUSTED")
    if values["pi_ntp_synchronized"] is not True:
        raise RtcSyncProtocolError("pi_ntp_synchronized must be true")
    if values["safety_scope"] != SAFETY_SCOPE:
        raise RtcSyncProtocolError(f"safety_scope must be {SAFETY_SCOPE}")
    if values["no_forward_to_sub"] is not True:
        raise RtcSyncProtocolError("no_forward_to_sub must be true")

    session_id = values["session_sync_id"]
    if not isinstance(session_id, str) or not session_id.startswith(SESSION_ID_PREFIX):
        raise RtcSyncProtocolError(f"session_sync_id must start with {SESSION_ID_PREFIX}")
    uuid_text = session_id[len(SESSION_ID_PREFIX):]
    try:
        session_uuid = UUID(uuid_text)
    except (ValueError, AttributeError) as exc:
        raise RtcSyncProtocolError("session_sync_id must contain a valid UUID4") from exc
    if session_uuid.version != 4 or str(session_uuid) != uuid_text.lower():
        raise RtcSyncProtocolError("session_sync_id must contain a canonical UUID4")

    source_time = _parse_utc(values["source_utc"], "source_utc")
    expires_time = _parse_utc(values["expires_at_utc"], "expires_at_utc")
    for field_name, value in (("source_utc", source_time), ("expires_at_utc", expires_time)):
        if not MINIMUM_RTC_YEAR <= value.year <= MAXIMUM_RTC_YEAR:
            raise RtcSyncProtocolError(f"{field_name} is outside the supported RTC year range")
    if (expires_time - source_time).total_seconds() != EXPIRY_WINDOW_SECONDS:
        raise RtcSyncProtocolError(
            f"Expiry window must be exactly {EXPIRY_WINDOW_SECONDS} seconds"
        )


def _canonical_json_bytes(request: RtcSessionSyncRequest) -> bytes:
    validate_rtc_session_sync_request(request)
    return json.dumps(
        request.to_dict(), ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def serialize_rtc_session_sync_request(request: RtcSessionSyncRequest) -> bytes:
    frame = _canonical_json_bytes(request) + b"\n"
    if len(frame) > MAXIMUM_FRAME_LENGTH_BYTES:
        raise RtcSyncProtocolError(
            f"RTC sync frame exceeds {MAXIMUM_FRAME_LENGTH_BYTES} bytes"
        )
    return frame


def hash_rtc_session_sync_request(request: RtcSessionSyncRequest) -> str:
    return hashlib.sha256(_canonical_json_bytes(request)).hexdigest()
