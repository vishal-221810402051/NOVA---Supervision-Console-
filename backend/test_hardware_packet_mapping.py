import unittest

from gateway_state import GatewayState
from hardware_normalizer import normalize_hardware_packet
from hardware_validator import validate_raw_hardware_packet


class HardwarePacketMappingTests(unittest.TestCase):
    def test_rtc_sync_result_packet_normalizes_to_telemetry_event(self):
        raw_packet = {
            "schema_version": "hw.v1",
            "packet_type": "RTC_SYNC_RESULT",
            "source_node_id": "esp32_main",
            "target_node_id": "pi_gateway",
            "source_sequence_number": 42,
            "producer_timestamp_ms": 12345,
            "payload": {
                "message_type": "RTC_SYNC_RESULT",
                "protocol_version": 1,
                "request_message_type": "RTC_SESSION_SYNC_REQUEST",
                "session_sync_id": "RTC_SYNC_12345678-1234-4234-9234-123456789abc",
                "accepted": False,
                "result": "REJECTED",
                "reason_code": "MALFORMED_JSON",
                "rtc_write_attempted": False,
                "osf_clear_attempted": False,
                "forwarded_to_sub": False,
                "control_output_touched": False,
            },
        }

        packet, rejection = validate_raw_hardware_packet(raw_packet)
        self.assertIsNone(rejection)
        self.assertIsNotNone(packet)

        state = GatewayState(mode="hardware", stream_prefix="TEST")
        normalized = normalize_hardware_packet(packet, state)

        self.assertEqual(normalized["event_type"], "RTC_SYNC_RESULT_TELEMETRY")
        self.assertEqual(normalized["source_node_id"], "esp32_main")
        self.assertEqual(normalized["source_sequence_number"], 42)
        self.assertEqual(normalized["payload"]["result"], "REJECTED")


if __name__ == "__main__":
    unittest.main()
