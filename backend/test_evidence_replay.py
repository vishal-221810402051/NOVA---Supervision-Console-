import asyncio
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from evidence_replay import (
    FAIL,
    PASS,
    compute_replay_run_root_sha256,
    replay_evidence_run,
)
from evidence_writer import (
    PersistentEvidenceWriter,
    PersistentEvidenceWriterConfig,
    compute_run_root_sha256,
)


def sample_packet(sequence: int, **overrides):
    packet = {
        "schema_version": "v1.0",
        "stream_id": "PI_STREAM_TEST",
        "global_sequence_number": sequence,
        "source_node_id": "esp32_main",
        "source_sequence_number": sequence + 100,
        "supervisor_received_utc": "2026-07-18T00:00:00+00:00",
        "timestamp_utc": "2026-07-18T00:00:00+00:00",
        "event_type": "NODE_HEALTH_TELEMETRY",
        "payload": {"health_state": "HEALTHY"},
    }
    packet.update(overrides)
    return packet


async def create_evidence_run(
    root: Path,
    *,
    packet_count: int = 3,
    rotation_mb: float = 50.0,
) -> Path:
    writer = PersistentEvidenceWriter(
        PersistentEvidenceWriterConfig(
            enabled=True,
            evidence_root=root,
            phase_id="PHASE_REPLAY_TEST",
            rotation_mb=rotation_mb,
            flush_interval_seconds=0.01,
            stream_id="PI_STREAM_TEST",
        )
    )
    await writer.start()
    for sequence in range(1, packet_count + 1):
        writer.enqueue(
            sample_packet(
                sequence,
                source_node_id="esp32_sub" if sequence % 2 == 0 else "esp32_main",
                event_type=(
                    "LINK_HEARTBEAT_TELEMETRY"
                    if sequence % 2 == 0
                    else "NODE_HEALTH_TELEMETRY"
                ),
            )
        )
    if writer._queue is not None:
        await writer._queue.join()
    await writer.stop()
    assert writer.evidence_run_dir is not None
    return writer.evidence_run_dir


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_fingerprints(run_dir: Path):
    result = {}
    for path in sorted(run_dir.iterdir()):
        if path.is_file():
            result[path.name] = (
                path.stat().st_mtime_ns,
                hashlib.sha256(path.read_bytes()).hexdigest(),
            )
    return result


class EvidenceReplayTests(unittest.TestCase):
    def test_valid_finalized_generated_run_returns_pass(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, PASS)
            self.assertEqual(result.total_events_replayed, 3)
            self.assertEqual(result.summary_events_written, 3)
            self.assertTrue(result.hash_verified)
            self.assertTrue(result.run_root_match)
            self.assertEqual(result.malformed_replay_lines, 0)
            self.assertIn("source_node_id:esp32_main", result.source_component_counts)
            self.assertIn("event_type:NODE_HEALTH_TELEMETRY", result.source_component_counts)
            self.assertIsNotNone(result.first_event_metadata)
            self.assertIsNotNone(result.last_event_metadata)

    def test_missing_run_directory_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            result = replay_evidence_run(Path(temp_dir) / "missing")

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("RUN_DIR_MISSING", result.failure_reasons)

    def test_missing_manifest_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            (run_dir / "manifest.json").unlink()

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("MANIFEST_MISSING", result.failure_reasons)

    def test_missing_summary_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            (run_dir / "summary.json").unlink()

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("SUMMARY_MISSING", result.failure_reasons)

    def test_missing_integrity_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            (run_dir / "integrity.json").unlink()

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("INTEGRITY_MISSING", result.failure_reasons)

    def test_missing_segment_file_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            (run_dir / "events_000001.ndjson").unlink()

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertTrue(
                any(reason.startswith("SEGMENT_FILE_MISSING") for reason in result.failure_reasons)
            )

    def test_segment_filename_gap_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(
                create_evidence_run(Path(temp_dir), packet_count=2, rotation_mb=0.00001)
            )
            integrity_path = run_dir / "integrity.json"
            integrity = load_json(integrity_path)
            integrity["segments"][1]["filename"] = "events_000003.ndjson"
            write_json(integrity_path, integrity)

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("SEGMENT_FILENAME_GAP", result.failure_reasons)

    def test_corrupted_segment_causes_sha_mismatch_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            with (run_dir / "events_000001.ndjson").open("a", encoding="utf-8") as handle:
                handle.write("\n")

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertTrue(
                any(reason.startswith("SEGMENT_SHA256_MISMATCH") for reason in result.failure_reasons)
            )

    def test_truncated_segment_causes_byte_event_mismatch_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            segment_path = run_dir / "events_000001.ndjson"
            lines = segment_path.read_text(encoding="utf-8").splitlines()
            segment_path.write_text(lines[0] + "\n", encoding="utf-8")

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertTrue(
                any(reason.startswith("SEGMENT_BYTE_COUNT_MISMATCH") for reason in result.failure_reasons)
            )
            self.assertTrue(
                any(reason.startswith("SEGMENT_EVENT_COUNT_MISMATCH") for reason in result.failure_reasons)
            )

    def test_malformed_ndjson_causes_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            with (run_dir / "events_000001.ndjson").open("a", encoding="utf-8") as handle:
                handle.write("{bad json\n")

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("MALFORMED_NDJSON_LINE", result.failure_reasons)
            self.assertGreater(result.malformed_replay_lines, 0)

    def test_summary_event_count_mismatch_causes_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            summary_path = run_dir / "summary.json"
            summary = load_json(summary_path)
            summary["persistent_events_written"] = 99
            write_json(summary_path, summary)

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("SUMMARY_EVENT_COUNT_MISMATCH", result.failure_reasons)

    def test_run_root_sha256_mismatch_causes_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            manifest_path = run_dir / "manifest.json"
            manifest = load_json(manifest_path)
            manifest["run_root_sha256"] = "0" * 64
            write_json(manifest_path, manifest)

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("RUN_ROOT_METADATA_DISAGREEMENT", result.failure_reasons)
            self.assertIn("RUN_ROOT_SHA256_MISMATCH", result.failure_reasons)

    def test_writer_errors_greater_than_zero_causes_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            summary_path = run_dir / "summary.json"
            summary = load_json(summary_path)
            summary["writer_errors"] = 1
            write_json(summary_path, summary)

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("WRITER_ERRORS_PRESENT", result.failure_reasons)

    def test_persistent_events_dropped_greater_than_zero_causes_fail(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            summary_path = run_dir / "summary.json"
            summary = load_json(summary_path)
            summary["persistent_events_dropped"] = 1
            write_json(summary_path, summary)

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, FAIL)
            self.assertIn("PERSISTENT_EVENTS_DROPPED_PRESENT", result.failure_reasons)

    def test_zero_event_finalized_run_has_deterministic_behavior(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir), packet_count=0))

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, PASS)
            self.assertEqual(result.total_events_replayed, 0)
            self.assertEqual(result.summary_events_written, 0)
            self.assertTrue(result.hash_verified)
            self.assertTrue(result.run_root_match)

    def test_repeated_replay_is_stable_and_read_only(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir), packet_count=5))
            before = file_fingerprints(run_dir)

            first = replay_evidence_run(run_dir)
            second = replay_evidence_run(run_dir)
            after = file_fingerprints(run_dir)

            self.assertEqual(first.validation_status, PASS)
            self.assertEqual(second.validation_status, PASS)
            self.assertEqual(first.total_events_replayed, second.total_events_replayed)
            self.assertEqual(first.run_root_sha256_actual, second.run_root_sha256_actual)
            self.assertEqual(first.source_component_counts, second.source_component_counts)
            self.assertEqual(before, after)

    def test_replay_streams_events_and_does_not_store_all_events(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(
                create_evidence_run(Path(temp_dir), packet_count=250, rotation_mb=0.0001)
            )

            result = replay_evidence_run(run_dir)

            self.assertEqual(result.validation_status, PASS)
            self.assertEqual(result.total_events_replayed, 250)
            self.assertGreater(result.segment_count, 1)
            result_dict = result.to_dict()
            self.assertNotIn("events", result_dict)
            for segment in result.segments:
                self.assertFalse(hasattr(segment, "events"))

    def test_replay_run_root_helper_matches_writer_algorithm(self):
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
            compute_replay_run_root_sha256(segments),
            compute_run_root_sha256(segments),
        )


if __name__ == "__main__":
    unittest.main()
