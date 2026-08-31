import asyncio
from contextlib import redirect_stderr, redirect_stdout
import hashlib
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from evidence_replay import (
    FAIL,
    PASS,
    REPLAY_ARTIFACT_GENERATOR,
    REPLAY_ARTIFACT_LIMITATIONS,
    REPLAY_ARTIFACT_NON_CLAIMS,
    REPLAY_ARTIFACT_SCHEMA_VERSION,
    REPLAY_ARTIFACT_TYPE,
    REPLAY_ARTIFACT_VALIDATION_SCOPE,
    build_replay_result_artifact,
    compute_replay_run_root_sha256,
    main,
    replay_evidence_run,
    sanitize_replay_artifact_filename,
    validate_replay_artifact_dict,
    write_replay_result_artifact,
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

    def test_build_pass_artifact_has_v1_identity_and_validated_true(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            result = replay_evidence_run(run_dir)

            artifact = build_replay_result_artifact(result)

            self.assertEqual(
                artifact["artifact_schema_version"],
                REPLAY_ARTIFACT_SCHEMA_VERSION,
            )
            self.assertEqual(artifact["artifact_type"], REPLAY_ARTIFACT_TYPE)
            self.assertEqual(artifact["generator"], REPLAY_ARTIFACT_GENERATOR)
            self.assertEqual(
                artifact["validation_scope"],
                REPLAY_ARTIFACT_VALIDATION_SCOPE,
            )
            self.assertEqual(artifact["validation_status"], PASS)
            self.assertTrue(artifact["persistent_replay_validated"])
            self.assertEqual(artifact["replay_phase_id"], result.phase_id)
            self.assertEqual(artifact["replay_run_id"], result.run_id)
            self.assertEqual(artifact["replay_segment_count"], len(result.segments))

    def test_build_fail_artifact_sets_validated_false_and_preserves_failures(self):
        with TemporaryDirectory() as temp_dir:
            missing_run = Path(temp_dir) / "missing-run"
            result = replay_evidence_run(missing_run)

            artifact = build_replay_result_artifact(result)

            self.assertEqual(artifact["validation_status"], FAIL)
            self.assertFalse(artifact["persistent_replay_validated"])
            self.assertEqual(artifact["replay_failure_reasons"], ["RUN_DIR_MISSING"])

    def test_pass_artifact_includes_verified_run_root_sha256(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            result = replay_evidence_run(run_dir)

            artifact = build_replay_result_artifact(result)

            self.assertTrue(result.run_root_match)
            self.assertEqual(
                artifact["replay_run_root_sha256"],
                result.run_root_sha256_expected,
            )
            self.assertEqual(
                artifact["replay_run_root_sha256"],
                result.run_root_sha256_actual,
            )

    def test_fail_artifact_preserves_expected_and_actual_run_roots(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            manifest_path = run_dir / "manifest.json"
            manifest = load_json(manifest_path)
            manifest["run_root_sha256"] = "0" * 64
            write_json(manifest_path, manifest)
            result = replay_evidence_run(run_dir)

            artifact = build_replay_result_artifact(result)

            self.assertEqual(result.validation_status, FAIL)
            self.assertFalse(result.run_root_match)
            self.assertEqual(
                artifact["replay_run_root_sha256_expected"],
                "0" * 64,
            )
            self.assertIsNotNone(artifact["replay_run_root_sha256_actual"])
            self.assertIsNone(artifact["replay_run_root_sha256"])

    def test_fail_artifact_can_preserve_a_verified_root_for_other_failures(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            summary_path = run_dir / "summary.json"
            summary = load_json(summary_path)
            summary["writer_errors"] = 1
            write_json(summary_path, summary)
            result = replay_evidence_run(run_dir)

            artifact = build_replay_result_artifact(result)

            self.assertEqual(result.validation_status, FAIL)
            self.assertTrue(result.run_root_match)
            self.assertEqual(
                artifact["replay_run_root_sha256"],
                result.run_root_sha256_expected,
            )
            self.assertFalse(artifact["persistent_replay_validated"])

    def test_artifact_includes_required_limitations(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            artifact = build_replay_result_artifact(replay_evidence_run(run_dir))

            self.assertEqual(
                artifact["replay_validation_limitations"],
                list(REPLAY_ARTIFACT_LIMITATIONS),
            )

    def test_artifact_includes_explicit_false_non_claims(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            artifact = build_replay_result_artifact(replay_evidence_run(run_dir))

            self.assertEqual(artifact["non_claims"], REPLAY_ARTIFACT_NON_CLAIMS)
            self.assertTrue(all(value is False for value in artifact["non_claims"].values()))

    def test_validate_replay_artifact_dict_accepts_valid_pass_artifact(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            artifact = build_replay_result_artifact(replay_evidence_run(run_dir))

            self.assertEqual(validate_replay_artifact_dict(artifact), [])

    def test_validate_replay_artifact_dict_accepts_valid_fail_artifact(self):
        with TemporaryDirectory() as temp_dir:
            result = replay_evidence_run(Path(temp_dir) / "missing-run")
            artifact = build_replay_result_artifact(result)

            self.assertEqual(validate_replay_artifact_dict(artifact), [])

    def test_validate_replay_artifact_dict_detects_missing_required_field(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            artifact = build_replay_result_artifact(replay_evidence_run(run_dir))
            del artifact["artifact_type"]

            errors = validate_replay_artifact_dict(artifact)

            self.assertIn("MISSING_REQUIRED_FIELD:artifact_type", errors)

    def test_validate_replay_artifact_dict_rejects_inconsistent_pass(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            artifact = build_replay_result_artifact(replay_evidence_run(run_dir))
            artifact["replay_failure_reasons"] = ["INJECTED_FAILURE"]

            errors = validate_replay_artifact_dict(artifact)

            self.assertIn("PERSISTENT_REPLAY_VALIDATED_INCONSISTENT", errors)
            self.assertIn("PASS_WITH_FAILURE_REASONS", errors)

    def test_sanitize_replay_artifact_filename_is_filesystem_safe(self):
        self.assertEqual(
            sanitize_replay_artifact_filename("PHASE_TEST", "EVIDENCE_TEST"),
            "replay_result_PHASE_TEST_EVIDENCE_TEST.json",
        )
        unsafe = sanitize_replay_artifact_filename("../PHASE / TEST", "..\\RUN:*?")
        self.assertNotIn("/", unsafe)
        self.assertNotIn("\\", unsafe)
        self.assertTrue(unsafe.endswith(".json"))
        self.assertEqual(
            sanitize_replay_artifact_filename(None, None),
            "replay_result_UNKNOWN_PHASE_UNKNOWN_RUN.json",
        )

    def test_write_replay_result_artifact_writes_safe_explicit_path(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            run_dir = asyncio.run(create_evidence_run(root / "source"))
            result = replay_evidence_run(run_dir)
            output_path = root / "replay_results" / "replay_result.json"

            written_path = write_replay_result_artifact(result, output_path)
            artifact = load_json(written_path)

            self.assertEqual(written_path, output_path.resolve())
            self.assertEqual(artifact["artifact_schema_version"], "1.0")
            self.assertEqual(artifact["validation_status"], PASS)
            self.assertEqual(validate_replay_artifact_dict(artifact), [])

    def test_output_refuses_path_equal_to_or_inside_source_run(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            result = replay_evidence_run(run_dir)
            unsafe_paths = (
                run_dir,
                run_dir / "replay_result.json",
                run_dir / "nested" / "replay_result.json",
            )

            for unsafe_path in unsafe_paths:
                with self.subTest(path=unsafe_path):
                    with self.assertRaisesRegex(
                        ValueError,
                        "outside the source evidence run directory",
                    ):
                        write_replay_result_artifact(result, unsafe_path)

    def test_output_refuses_source_evidence_metadata_and_segment_paths(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            result = replay_evidence_run(run_dir)
            before = file_fingerprints(run_dir)

            for filename in (
                "manifest.json",
                "summary.json",
                "integrity.json",
                "events_000001.ndjson",
            ):
                with self.subTest(filename=filename):
                    with self.assertRaises(ValueError):
                        write_replay_result_artifact(result, run_dir / filename)

            self.assertEqual(before, file_fingerprints(run_dir))

    def test_atomic_write_produces_final_json_without_temp_file(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            run_dir = asyncio.run(create_evidence_run(root / "source"))
            result = replay_evidence_run(run_dir)
            output_path = root / "results" / "artifact.json"

            write_replay_result_artifact(result, output_path)

            self.assertTrue(output_path.exists())
            self.assertEqual(
                load_json(output_path)["artifact_type"],
                REPLAY_ARTIFACT_TYPE,
            )
            self.assertEqual(
                list(output_path.parent.glob(f".{output_path.name}.*.tmp")),
                [],
            )

    def test_artifact_write_failure_returns_nonzero_and_cleans_temp_file(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            run_dir = asyncio.run(create_evidence_run(root / "source"))
            output_path = root / "results" / "artifact.json"
            stdout = StringIO()
            stderr = StringIO()

            with patch(
                "evidence_replay.os.replace",
                side_effect=OSError("simulated replace failure"),
            ):
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    exit_code = main(
                        [
                            "--run-dir",
                            str(run_dir),
                            "--output",
                            str(output_path),
                            "--json",
                        ]
                    )

            self.assertEqual(exit_code, 1)
            self.assertIn("Replay result artifact write failed", stderr.getvalue())
            self.assertIn("simulated replace failure", stderr.getvalue())
            self.assertFalse(output_path.exists())
            self.assertEqual(
                list(output_path.parent.glob(f".{output_path.name}.*.tmp")),
                [],
            )
            self.assertEqual(json.loads(stdout.getvalue())["validation_status"], PASS)

    def test_cli_default_stdout_behavior_remains_without_output(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            stdout = StringIO()

            with redirect_stdout(stdout):
                exit_code = main(["--run-dir", str(run_dir), "--json"])

            payload = json.loads(stdout.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["validation_status"], PASS)
            self.assertIn("total_events_replayed", payload)
            self.assertNotIn("artifact_schema_version", payload)

    def test_cli_pretty_stdout_behavior_remains(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            stdout = StringIO()

            with redirect_stdout(stdout):
                exit_code = main(["--run-dir", str(run_dir), "--pretty"])

            self.assertEqual(exit_code, 0)
            self.assertTrue(stdout.getvalue().startswith("{\n  \""))
            self.assertEqual(json.loads(stdout.getvalue())["validation_status"], PASS)

    def test_cli_pass_writes_artifact_and_returns_zero(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            run_dir = asyncio.run(create_evidence_run(root / "source"))
            output_path = root / "results" / "pass.json"
            stdout = StringIO()

            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "--run-dir",
                        str(run_dir),
                        "--output",
                        str(output_path),
                        "--json",
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertTrue(output_path.exists())
            self.assertTrue(load_json(output_path)["persistent_replay_validated"])
            self.assertEqual(json.loads(stdout.getvalue())["validation_status"], PASS)

    def test_cli_fail_exit_code_remains_one_without_output(self):
        with TemporaryDirectory() as temp_dir:
            stdout = StringIO()

            with redirect_stdout(stdout):
                exit_code = main(
                    ["--run-dir", str(Path(temp_dir) / "missing"), "--json"]
                )

            self.assertEqual(exit_code, 1)
            self.assertEqual(json.loads(stdout.getvalue())["validation_status"], FAIL)

    def test_cli_fail_still_writes_artifact_to_safe_path(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            missing_run = root / "missing-run"
            output_path = root / "results" / "fail.json"
            stdout = StringIO()

            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "--run-dir",
                        str(missing_run),
                        "--output",
                        str(output_path),
                        "--json",
                    ]
                )

            artifact = load_json(output_path)
            self.assertEqual(exit_code, 1)
            self.assertEqual(artifact["validation_status"], FAIL)
            self.assertFalse(artifact["persistent_replay_validated"])
            self.assertIn("RUN_DIR_MISSING", artifact["replay_failure_reasons"])
            self.assertEqual(validate_replay_artifact_dict(artifact), [])

    def test_cli_unsafe_output_returns_one_and_actionable_stderr(self):
        with TemporaryDirectory() as temp_dir:
            run_dir = asyncio.run(create_evidence_run(Path(temp_dir)))
            output_path = run_dir / "replay_result.json"
            stdout = StringIO()
            stderr = StringIO()

            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = main(
                    [
                        "--run-dir",
                        str(run_dir),
                        "--output",
                        str(output_path),
                    ]
                )

            self.assertEqual(exit_code, 1)
            self.assertFalse(output_path.exists())
            self.assertIn("outside the source evidence run directory", stderr.getvalue())
            self.assertEqual(json.loads(stdout.getvalue())["validation_status"], PASS)

    def test_artifact_writing_does_not_modify_source_evidence_files(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            run_dir = asyncio.run(create_evidence_run(root / "source", packet_count=5))
            result = replay_evidence_run(run_dir)
            before = file_fingerprints(run_dir)

            write_replay_result_artifact(
                result,
                root / "replay_results" / "replay_result.json",
            )

            self.assertEqual(before, file_fingerprints(run_dir))

    def test_backend_replay_results_is_ignored_by_git(self):
        gitignore_path = Path(__file__).resolve().parents[1] / ".gitignore"
        gitignore_lines = gitignore_path.read_text(encoding="utf-8").splitlines()

        self.assertIn("backend/replay_results/", gitignore_lines)

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
