from dataclasses import replace
from datetime import datetime, timezone
import ast
from pathlib import Path
import unittest
from uuid import UUID

from pi_time_trust import PI_TIME_TRUSTED, PiTimeTrustEvidence
from rtc_sync_protocol import (
    EXPIRY_WINDOW_SECONDS,
    MESSAGE_TYPE,
    PROTOCOL_VERSION,
    SAFETY_SCOPE,
    SESSION_ID_PREFIX,
    SOURCE,
    RtcSyncProtocolError,
    build_rtc_session_sync_request,
    hash_rtc_session_sync_request,
    serialize_rtc_session_sync_request,
    validate_rtc_session_sync_request,
)
from rtc_sync_service import preview_rtc_sync_request


BUILD_TIME = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)


def trusted_evidence() -> PiTimeTrustEvidence:
    return PiTimeTrustEvidence(
        pi_time_status=PI_TIME_TRUSTED,
        pi_ntp_synchronized=True,
        pi_utc_now="2026-06-19T11:59:59.000Z",
        timezone="Etc/UTC",
        plausible_year=True,
        backend_uptime_seconds=60.0,
        monotonic_observation_seconds=30.0,
        wall_clock_progression_seconds=30.0,
        monotonic_progression_seconds=30.0,
        wall_clock_jump_detected=False,
        trust_allowed=True,
        failure_reasons=[],
        evidence_source="timedatectl",
        checked_at_utc="2026-06-19T11:59:59.000Z",
    )


class RtcSyncProtocolTests(unittest.TestCase):
    def setUp(self):
        self.request = build_rtc_session_sync_request(
            trusted_evidence(), utc_now=BUILD_TIME
        )

    def test_trusted_evidence_builds_exact_request(self):
        self.assertEqual(self.request.message_type, MESSAGE_TYPE)
        self.assertEqual(self.request.protocol_version, PROTOCOL_VERSION)
        self.assertEqual(self.request.source, SOURCE)
        self.assertEqual(self.request.safety_scope, SAFETY_SCOPE)
        self.assertTrue(self.request.no_forward_to_sub)
        self.assertEqual(self.request.source_utc, "2026-06-19T12:00:00.000Z")
        self.assertEqual(self.request.expires_at_utc, "2026-06-19T12:00:10.000Z")
        self.assertEqual(
            set(self.request.to_dict()),
            {
                "message_type", "protocol_version", "session_sync_id", "source",
                "source_utc", "expires_at_utc", "pi_time_status",
                "pi_ntp_synchronized", "safety_scope", "no_forward_to_sub",
            },
        )

    def test_untrusted_evidence_blocks_request(self):
        evidence = replace(trusted_evidence(), trust_allowed=False)
        with self.assertRaises(RtcSyncProtocolError):
            build_rtc_session_sync_request(evidence, utc_now=BUILD_TIME)

    def test_session_id_contains_uuid4(self):
        self.assertTrue(self.request.session_sync_id.startswith(SESSION_ID_PREFIX))
        value = UUID(self.request.session_sync_id[len(SESSION_ID_PREFIX):])
        self.assertEqual(value.version, 4)

    def test_expiry_window_is_ten_seconds(self):
        self.assertEqual(EXPIRY_WINDOW_SECONDS, 10)
        validate_rtc_session_sync_request(self.request)

    def test_validator_rejects_unknown_field(self):
        values = self.request.to_dict()
        values["unexpected"] = True
        with self.assertRaises(RtcSyncProtocolError):
            validate_rtc_session_sync_request(values)

    def test_validator_rejects_wrong_message_type(self):
        with self.assertRaises(RtcSyncProtocolError):
            validate_rtc_session_sync_request(replace(self.request, message_type="OTHER"))

    def test_validator_rejects_wrong_safety_scope(self):
        with self.assertRaises(RtcSyncProtocolError):
            validate_rtc_session_sync_request(replace(self.request, safety_scope="GENERAL"))

    def test_validator_rejects_unsynchronized_ntp(self):
        with self.assertRaises(RtcSyncProtocolError):
            validate_rtc_session_sync_request(
                replace(self.request, pi_ntp_synchronized=False)
            )

    def test_serializer_has_one_newline_and_bounded_length(self):
        frame = serialize_rtc_session_sync_request(self.request)
        self.assertTrue(frame.endswith(b"\n"))
        self.assertFalse(frame.endswith(b"\n\n"))
        self.assertEqual(frame.count(b"\n"), 1)
        self.assertLessEqual(len(frame), 512)

    def test_hash_is_stable(self):
        first = hash_rtc_session_sync_request(self.request)
        second = hash_rtc_session_sync_request(self.request)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)

    def test_preview_service_reports_no_write(self):
        preview = preview_rtc_sync_request(trusted_evidence())
        self.assertFalse(preview["write_attempted"])
        self.assertFalse(preview["result_wait_supported"])
        self.assertLessEqual(preview["frame_length_bytes"], 512)
        self.assertEqual(len(preview["request_hash"]), 64)

    def test_cli_has_no_serial_bridge_dependency(self):
        cli_path = Path(__file__).parent / "tools" / "rtc_sync_cli.py"
        tree = ast.parse(cli_path.read_text(encoding="utf-8"))
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.add(node.module or "")
        self.assertFalse(any("serial" in imported.lower() for imported in imports))


if __name__ == "__main__":
    unittest.main()
