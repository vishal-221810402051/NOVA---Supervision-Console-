import asyncio
import hashlib
import json
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from evidence_writer import (
    PersistentEvidenceWriter,
    PersistentEvidenceWriterConfig,
    build_persistent_evidence_summary,
    compute_run_root_sha256,
    inspect_run_finalization_status,
)


def sample_packet(**overrides):
    packet = {
        "schema_version": "v1.0",
        "stream_id": "PI_STREAM_TEST",
        "global_sequence_number": 7,
        "source_node_id": "esp32_main",
        "source_sequence_number": 42,
        "supervisor_received_utc": "2026-07-13T00:00:00+00:00",
        "timestamp_utc": "2026-07-13T00:00:00+00:00",
        "event_type": "RTC_STATUS_TELEMETRY",
        "payload": {"rtc_detected": True},
    }
    packet.update(overrides)
    return packet


class PersistentEvidenceWriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_path_does_not_create_evidence_files(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "evidence"
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=False, evidence_root=root)
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer.stop()

            self.assertFalse(root.exists())
            self.assertEqual(writer.stats_snapshot()["persistent_events_written"], 0)

    async def test_disabled_summary_serializes_safe_defaults(self):
        summary = build_persistent_evidence_summary(None)

        self.assertFalse(summary["persistent_evidence_enabled"])
        self.assertFalse(summary["persistent_evidence_active"])
        self.assertFalse(summary["persistent_hash_available"])
        self.assertFalse(summary["persistent_replay_validated"])
        self.assertFalse(summary["tamper_proof"])
        self.assertFalse(summary["cryptographic_attestation"])
        self.assertEqual(summary["persistent_replay_validation_status"], "NOT_VALIDATED")
        self.assertEqual(
            summary["required_next_action"],
            "ENABLE_BACKEND_PERSISTENT_EVIDENCE_FOR_VALIDATION_RUN",
        )

    async def test_enabled_creates_run_directory_and_manifest(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(
                    enabled=True,
                    evidence_root=Path(temp_dir),
                    phase_id="PHASE_TEST",
                )
            )

            await writer.start()
            try:
                self.assertIsNotNone(writer.evidence_run_dir)
                manifest_path = writer.evidence_run_dir / "manifest.json"
                self.assertTrue(manifest_path.exists())
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(manifest["phase_id"], "PHASE_TEST")
                self.assertFalse(manifest["finalized"])
                self.assertFalse(manifest["hash_finalized"])
            finally:
                await writer.stop()

    async def test_enqueue_writes_one_valid_ndjson_line(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(
                    enabled=True,
                    evidence_root=Path(temp_dir),
                    phase_id="PHASE_TEST",
                    flush_interval_seconds=0.01,
                )
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()

            event_path = writer.evidence_run_dir / "events_000001.ndjson"
            lines = event_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["evidence_run_id"], writer.evidence_run_id)
            self.assertEqual(record["phase_id"], "PHASE_TEST")
            self.assertEqual(record["stream_id"], "PI_STREAM_TEST")
            self.assertEqual(record["source_node_id"], "esp32_main")
            self.assertEqual(record["global_sequence_number"], 7)
            self.assertEqual(record["event_type"], "RTC_STATUS_TELEMETRY")
            self.assertEqual(record["packet"]["payload"]["rtc_detected"], True)

    async def test_missing_optional_fields_do_not_crash_serialization(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue({"event_type": "NODE_HEALTH_TELEMETRY"})
            await writer._queue.join()
            await writer.stop()

            event_path = writer.evidence_run_dir / "events_000001.ndjson"
            record = json.loads(event_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(record["event_type"], "NODE_HEALTH_TELEMETRY")
            self.assertIsNone(record["stream_id"])

    async def test_queue_full_increments_persistent_events_dropped(self):
        writer = PersistentEvidenceWriter(
            PersistentEvidenceWriterConfig(enabled=True, queue_size=1)
        )
        writer.active = True
        writer._queue = asyncio.Queue(maxsize=1)

        writer.enqueue(sample_packet(global_sequence_number=1))
        writer.enqueue(sample_packet(global_sequence_number=2))

        self.assertEqual(writer.persistent_events_dropped, 1)

    async def test_segment_rotation_by_byte_threshold(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(
                    enabled=True,
                    evidence_root=Path(temp_dir),
                    rotation_mb=0.00001,
                    flush_interval_seconds=0.01,
                )
            )

            await writer.start()
            writer.enqueue(sample_packet(global_sequence_number=1))
            writer.enqueue(sample_packet(global_sequence_number=2))
            await writer._queue.join()
            await writer.stop()

            self.assertGreaterEqual(writer.segment_count, 2)
            self.assertTrue((writer.evidence_run_dir / "events_000001.ndjson").exists())
            self.assertTrue((writer.evidence_run_dir / "events_000002.ndjson").exists())

    async def test_stop_flushes_and_closes_without_crashing(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()

            stats = writer.stats_snapshot()
            self.assertFalse(stats["active"])
            self.assertEqual(stats["writer_errors"], 0)

    async def test_finalization_creates_integrity_and_summary_files(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()

            self.assertTrue((writer.evidence_run_dir / "integrity.json").exists())
            self.assertTrue((writer.evidence_run_dir / "summary.json").exists())

    async def test_finalized_manifest_has_hashes_and_finalized_flags(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()

            manifest = json.loads(
                (writer.evidence_run_dir / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertTrue(manifest["finalized"])
            self.assertTrue(manifest["hash_finalized"])
            self.assertEqual(manifest["integrity_filename"], "integrity.json")
            self.assertEqual(manifest["summary_filename"], "summary.json")
            self.assertIsNotNone(manifest["run_root_sha256"])
            self.assertTrue(manifest["segments"][0]["finalized"])
            self.assertIsNotNone(manifest["segments"][0]["sha256"])

            summary = build_persistent_evidence_summary(
                writer,
                frontend_raw_replay_complete=False,
                frontend_event_store_capacity=20000,
                frontend_event_store_current_events=20000,
                frontend_event_store_dropped_old_events=1,
            )
            self.assertTrue(summary["persistent_evidence_enabled"])
            self.assertFalse(summary["persistent_evidence_active"])
            self.assertTrue(summary["finalized"])
            self.assertTrue(summary["hash_finalized"])
            self.assertTrue(summary["persistent_hash_available"])
            self.assertIsNotNone(summary["run_root_sha256"])
            self.assertEqual(summary["integrity_scope"], "file_integrity_detection_only")
            self.assertFalse(summary["persistent_replay_validated"])
            self.assertFalse(summary["tamper_proof"])
            self.assertFalse(summary["cryptographic_attestation"])
            self.assertEqual(
                summary["persistent_replay_validation_status"],
                "PENDING_SOAK_VALIDATION",
            )
            self.assertEqual(
                summary["required_next_action"],
                "RUN_PHASE_7_2G_E_F_PERSISTENT_EVIDENCE_SOAK_VALIDATION",
            )
            self.assertEqual(summary["frontend_event_store_capacity"], 20000)
            self.assertEqual(summary["frontend_event_store_dropped_old_events"], 1)
            self.assertFalse(Path(summary["evidence_run_dir"]).is_absolute())

    async def test_segment_sha256_matches_actual_ndjson_contents(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()

            event_path = writer.evidence_run_dir / "events_000001.ndjson"
            expected_digest = hashlib.sha256(event_path.read_bytes()).hexdigest()
            manifest = json.loads(
                (writer.evidence_run_dir / "manifest.json").read_text(encoding="utf-8")
            )
            segment = manifest["segments"][0]
            self.assertEqual(segment["sha256"], expected_digest)
            self.assertEqual(segment["byte_count"], event_path.stat().st_size)

    async def test_run_root_sha256_is_deterministic_for_segment_metadata(self):
        segments = [
            {
                "index": 2,
                "filename": "events_000002.ndjson",
                "sha256": "b" * 64,
                "byte_count": 20,
                "event_count": 2,
            },
            {
                "index": 1,
                "filename": "events_000001.ndjson",
                "sha256": "a" * 64,
                "byte_count": 10,
                "event_count": 1,
            },
        ]

        self.assertEqual(
            compute_run_root_sha256(segments),
            compute_run_root_sha256(list(reversed(segments))),
        )

    async def test_stop_is_idempotent(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            writer.enqueue(sample_packet())
            await writer._queue.join()
            await writer.stop()
            segment_count = writer.segment_count
            run_root = writer.run_root_sha256
            await writer.stop()

            self.assertEqual(writer.segment_count, segment_count)
            self.assertEqual(writer.run_root_sha256, run_root)
            self.assertEqual(writer.writer_errors, 0)

    async def test_zero_event_run_finalizes_without_crashing(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            await writer.stop()

            summary = json.loads(
                (writer.evidence_run_dir / "summary.json").read_text(encoding="utf-8")
            )
            manifest = json.loads(
                (writer.evidence_run_dir / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertTrue(summary["finalized"])
            self.assertTrue(summary["hash_finalized"])
            self.assertEqual(summary["persistent_events_written"], 0)
            self.assertEqual(manifest["segments"][0]["event_count"], 0)
            self.assertIsNotNone(manifest["segments"][0]["sha256"])

    async def test_interrupted_run_detection_identifies_unfinalized_manifest(self):
        with TemporaryDirectory() as temp_dir:
            writer = PersistentEvidenceWriter(
                PersistentEvidenceWriterConfig(enabled=True, evidence_root=Path(temp_dir))
            )

            await writer.start()
            status = inspect_run_finalization_status(writer.evidence_run_dir)
            await writer.stop()

            self.assertTrue(status["manifest_exists"])
            self.assertFalse(status["finalized"])
            self.assertFalse(status["hash_finalized"])
            self.assertEqual(status["incomplete_reason"], "MANIFEST_NOT_FINALIZED")
            self.assertTrue(status["recoverable"])

    async def test_missing_or_corrupt_manifest_detection_does_not_crash(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = Path(temp_dir) / "run"
            run_dir.mkdir()
            (run_dir / "events_000001.ndjson").write_text("{}", encoding="utf-8")

            missing_status = inspect_run_finalization_status(run_dir)
            self.assertEqual(missing_status["incomplete_reason"], "MANIFEST_MISSING")
            self.assertTrue(missing_status["recoverable"])

            (run_dir / "manifest.json").write_text("{bad json", encoding="utf-8")
            corrupt_status = inspect_run_finalization_status(run_dir)
            self.assertEqual(corrupt_status["incomplete_reason"], "MANIFEST_UNREADABLE")
            self.assertTrue(corrupt_status["recoverable"])


if __name__ == "__main__":
    unittest.main()
