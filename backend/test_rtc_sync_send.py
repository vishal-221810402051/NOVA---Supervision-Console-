from dataclasses import replace
import ast
from pathlib import Path
import unittest

from pi_time_trust import PI_TIME_TRUSTED, PiTimeTrustEvidence
from rtc_sync_ipc import RtcSyncIpcServer, decode_ipc_request
from rtc_sync_protocol import MESSAGE_TYPE
from rtc_sync_service import send_one_rtc_sync_request
from serial_bridge import RtcSyncWriteResult, SerialBridge


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


class FakeStreamManager:
    def __init__(self):
        self.queue = None
        self.unsubscribed = False

    async def subscribe(self):
        import asyncio

        self.queue = asyncio.Queue()
        return self.queue

    async def unsubscribe(self, queue):
        self.unsubscribed = True


class FakeBridge:
    def __init__(self, stream_manager=None, *, partial=False, emit_result=True):
        self.frames = []
        self.stream_manager = stream_manager
        self.partial = partial
        self.emit_result = emit_result

    async def send_rtc_session_sync_frame(self, frame):
        import json

        self.frames.append(frame)
        request = json.loads(frame.decode("utf-8"))
        if request["message_type"] != MESSAGE_TYPE:
            raise AssertionError("unexpected message_type")
        if self.partial:
            return RtcSyncWriteResult(
                write_attempted=True,
                write_ok=False,
                bytes_written=len(frame) - 1,
                error="partial",
            )
        if self.emit_result:
            await self.stream_manager.queue.put(
                {
                    "event_type": "RTC_SYNC_RESULT_TELEMETRY",
                    "payload": {
                        "session_sync_id": "RTC_SYNC_other",
                        "result": "RTC_SYNC_SUCCESS",
                    },
                }
            )
            await self.stream_manager.queue.put(
                {
                    "event_type": "RTC_SYNC_RESULT_TELEMETRY",
                    "payload": {
                        "session_sync_id": request["session_sync_id"],
                        "result": "RTC_SYNC_SUCCESS",
                    },
                }
            )
        return RtcSyncWriteResult(
            write_attempted=True,
            write_ok=True,
            bytes_written=len(frame),
        )


class RtcSyncSendTests(unittest.IsolatedAsyncioTestCase):
    async def test_untrusted_pi_time_blocks_before_write(self):
        evidence = replace(trusted_evidence(), trust_allowed=False)
        manager = FakeStreamManager()
        bridge = FakeBridge(manager)

        audit = await send_one_rtc_sync_request(
            serial_bridge=bridge,
            hardware_stream_manager=manager,
            backend_mode="hardware",
            trust_evaluator=lambda: evidence,
            result_timeout_seconds=0.01,
        )

        self.assertEqual(audit["failure_reason"], "PI_TIME_UNTRUSTED")
        self.assertFalse(audit["write_attempted"])
        self.assertEqual(bridge.frames, [])

    async def test_partial_write_fails_without_retry(self):
        manager = FakeStreamManager()
        bridge = FakeBridge(manager, partial=True)

        audit = await send_one_rtc_sync_request(
            serial_bridge=bridge,
            hardware_stream_manager=manager,
            backend_mode="hardware",
            trust_evaluator=trusted_evidence,
            result_timeout_seconds=0.01,
        )

        self.assertTrue(audit["write_attempted"])
        self.assertFalse(audit["write_ok"])
        self.assertEqual(audit["failure_reason"], "partial")
        self.assertEqual(len(bridge.frames), 1)
        self.assertTrue(manager.unsubscribed)

    async def test_matching_result_succeeds_and_nonmatching_result_is_ignored(self):
        manager = FakeStreamManager()
        bridge = FakeBridge(manager)

        audit = await send_one_rtc_sync_request(
            serial_bridge=bridge,
            hardware_stream_manager=manager,
            backend_mode="hardware",
            trust_evaluator=trusted_evidence,
            result_timeout_seconds=0.1,
        )

        self.assertTrue(audit["write_ok"])
        self.assertTrue(audit["result_received"])
        self.assertIsNone(audit["failure_reason"])
        self.assertEqual(
            audit["rtc_sync_result"]["payload"]["session_sync_id"],
            audit["session_sync_id"],
        )

    async def test_result_timeout_returns_no_retry(self):
        manager = FakeStreamManager()
        bridge = FakeBridge(manager, emit_result=False)

        audit = await send_one_rtc_sync_request(
            serial_bridge=bridge,
            hardware_stream_manager=manager,
            backend_mode="hardware",
            trust_evaluator=trusted_evidence,
            result_timeout_seconds=0.01,
        )

        self.assertEqual(audit["failure_reason"], "RTC_SYNC_RESULT_TIMEOUT")
        self.assertEqual(len(bridge.frames), 1)
        self.assertFalse(audit["result_received"])

    async def test_ipc_rejects_unknown_action(self):
        server = RtcSyncIpcServer(send_once=lambda: {})
        response = await server.handle_request_bytes(
            b'{"action":"other","protocol_version":1}\n'
        )
        self.assertFalse(response["write_attempted"])
        self.assertIn("Unsupported IPC action", response["failure_reason"])


class RtcSyncSendStaticTests(unittest.TestCase):
    def test_decode_ipc_request_allows_only_send_once_action(self):
        request = decode_ipc_request(
            b'{"action":"rtc_sync_send_once","protocol_version":1}\n'
        )
        self.assertEqual(request["action"], "rtc_sync_send_once")

    def test_cli_has_no_serial_dependency_after_send_once_addition(self):
        cli_path = Path(__file__).parent / "tools" / "rtc_sync_cli.py"
        tree = ast.parse(cli_path.read_text(encoding="utf-8"))
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.add(node.module or "")
        self.assertFalse(any("serial" in imported.lower() for imported in imports))

    def test_serial_bridge_has_no_generic_write_api(self):
        public_methods = {
            name for name in dir(SerialBridge)
            if not name.startswith("_") and callable(getattr(SerialBridge, name))
        }
        self.assertIn("send_rtc_session_sync_frame", public_methods)
        self.assertNotIn("write", public_methods)


if __name__ == "__main__":
    unittest.main()
