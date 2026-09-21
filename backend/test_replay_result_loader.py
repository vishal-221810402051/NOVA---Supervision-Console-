import asyncio
import inspect
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import main as backend_main
import replay_result_loader
from evidence_replay import (
    FAIL,
    PASS,
    EvidenceReplayResult,
    EvidenceReplaySegmentResult,
    REPLAY_ARTIFACT_LIMITATIONS,
    REPLAY_ARTIFACT_NON_CLAIMS,
    build_replay_result_artifact,
)
from replay_result_loader import (
    MAX_REPLAY_ARTIFACT_BYTES,
    PENDING,
    load_persistent_replay_summary,
)


RUN_ID = "EVIDENCE_TEST_RUN"
PHASE_ID = "PHASE_7_2G_E_L_B_TEST"
RUN_ROOT = "a" * 64


def make_artifact(
    *,
    status: str = PASS,
    failure_reasons: list[str] | None = None,
) -> dict[str, object]:
    failures = list(failure_reasons or [])
    segment = EvidenceReplaySegmentResult(
        filename="events_000001.ndjson",
        exists=True,
        byte_count_expected=128,
        byte_count_actual=128,
        sha256_expected="b" * 64,
        sha256_actual="b" * 64,
        hash_match=True,
        event_count_expected=3,
        event_count_actual=3,
        malformed_lines=0,
        first_event_metadata={"global_sequence_number": 1},
        last_event_metadata={"global_sequence_number": 3},
        failure_reasons=[],
    )
    result = EvidenceReplayResult(
        validation_status=status,
        run_dir="/private/source/backend/evidence/run",
        run_id=RUN_ID,
        phase_id=PHASE_ID,
        segment_count=1,
        segment_filename_continuity=True,
        deterministic_order_verified=True,
        total_events_replayed=3,
        summary_events_written=3,
        writer_errors=0,
        persistent_events_dropped=0,
        malformed_replay_lines=0,
        hash_verified=True,
        run_root_sha256_expected=RUN_ROOT,
        run_root_sha256_actual=RUN_ROOT,
        run_root_match=True,
        source_component_counts={"source_node_id:esp32_main": 3},
        first_event_metadata={"global_sequence_number": 1},
        last_event_metadata={"global_sequence_number": 3},
        replay_started_utc="2026-09-21T10:00:00+00:00",
        replay_completed_utc="2026-09-21T10:00:01+00:00",
        failure_reasons=failures,
        segments=[segment],
    )
    return build_replay_result_artifact(result)


def make_replay_root(temp_dir: str) -> Path:
    root = Path(temp_dir) / "replay_results"
    root.mkdir()
    return root


def write_artifact(
    root: Path,
    artifact: dict[str, object] | None = None,
    *,
    filename: str = "replay_result.json",
) -> Path:
    path = root / filename
    path.write_text(
        json.dumps(artifact or make_artifact(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def load_bound(path: Path, root: Path) -> dict[str, object]:
    return load_persistent_replay_summary(
        path,
        RUN_ID,
        PHASE_ID,
        allowed_root=root,
    )


class ReplayResultLoaderTests(unittest.TestCase):
    def test_no_artifact_configured_returns_pending(self):
        summary = load_persistent_replay_summary(None, RUN_ID, PHASE_ID)

        self.assertEqual(summary["replay_validation_status"], PENDING)
        self.assertFalse(summary["persistent_replay_validated"])
        self.assertFalse(summary["artifact_selected"])
        self.assertFalse(summary["artifact_present"])
        self.assertIsNone(summary["artifact_valid"])
        self.assertEqual(summary["failure_reasons"], [])
        self.assertEqual(summary["required_next_action"], "CONFIGURE_REPLAY_ARTIFACT")

    def test_missing_expected_run_id_returns_pending(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)

            summary = load_persistent_replay_summary(
                path,
                None,
                PHASE_ID,
                allowed_root=root,
            )

        self.assertEqual(summary["replay_validation_status"], PENDING)
        self.assertFalse(summary["identity_bound"])
        self.assertIsNone(summary["run_identity_match"])
        self.assertTrue(summary["phase_identity_match"])

    def test_missing_expected_phase_id_returns_pending(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)

            summary = load_persistent_replay_summary(
                path,
                RUN_ID,
                None,
                allowed_root=root,
            )

        self.assertEqual(summary["replay_validation_status"], PENDING)
        self.assertFalse(summary["identity_bound"])
        self.assertTrue(summary["run_identity_match"])
        self.assertIsNone(summary["phase_identity_match"])

    def test_valid_pass_artifact_with_matching_identity_returns_pass(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertEqual(summary["replay_validation_status"], PASS)
        self.assertTrue(summary["persistent_replay_validated"])
        self.assertTrue(summary["artifact_valid"])
        self.assertTrue(summary["identity_bound"])
        self.assertTrue(summary["run_identity_match"])
        self.assertTrue(summary["phase_identity_match"])
        self.assertIsNone(summary["required_next_action"])

    def test_valid_fail_artifact_returns_fail_but_remains_schema_valid(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(
                root,
                make_artifact(status=FAIL, failure_reasons=["HASH_MISMATCH"]),
            )
            summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertTrue(summary["artifact_valid"])
        self.assertFalse(summary["persistent_replay_validated"])
        self.assertIn("HASH_MISMATCH", summary["failure_reasons"])

    def test_configured_artifact_missing_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(root / "missing.json", root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_NOT_FOUND", summary["failure_reasons"])

    def test_artifact_outside_allowed_root_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "replay_results"
            root.mkdir()
            outside = temp / "outside.json"
            outside.write_text("{}", encoding="utf-8")

            summary = load_bound(outside, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn(
            "REPLAY_ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT",
            summary["failure_reasons"],
        )
        self.assertIsNone(summary["artifact_reference"])

    def test_symlink_artifact_is_rejected(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            target = write_artifact(root, filename="target.json")
            symlink = root / "selected.json"
            try:
                symlink.symlink_to(target)
            except OSError as exc:
                self.skipTest(f"Symlink creation unavailable on this platform: {exc}")

            summary = load_bound(symlink, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_SYMLINK_REJECTED", summary["failure_reasons"])

    def test_symlink_rejection_branch_is_enforced(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            with patch.object(Path, "is_symlink", return_value=True):
                summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_SYMLINK_REJECTED", summary["failure_reasons"])

    def test_artifact_larger_than_one_mib_is_rejected(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = root / "large.json"
            path.write_bytes(b"{" + b" " * MAX_REPLAY_ARTIFACT_BYTES)

            summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_TOO_LARGE", summary["failure_reasons"])

    def test_artifact_size_is_rejected_before_file_open(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = root / "large.json"
            path.write_bytes(b"{" + b" " * MAX_REPLAY_ARTIFACT_BYTES)

            with patch.object(Path, "open", side_effect=AssertionError("opened")):
                summary = load_bound(path, root)

        self.assertIn("REPLAY_ARTIFACT_TOO_LARGE", summary["failure_reasons"])

    def test_unreadable_artifact_returns_stable_failure(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            with patch.object(Path, "open", side_effect=PermissionError):
                summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_UNREADABLE", summary["failure_reasons"])
        self.assertNotIn("PermissionError", str(summary))

    def test_invalid_json_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = root / "invalid.json"
            path.write_text("{not json", encoding="utf-8")

            summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertFalse(summary["artifact_valid"])
        self.assertIn("REPLAY_ARTIFACT_INVALID_JSON", summary["failure_reasons"])

    def test_missing_required_artifact_field_returns_fail(self):
        artifact = make_artifact()
        del artifact["replay_total_events"]
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertFalse(summary["artifact_valid"])
        self.assertIn(
            "MISSING_REQUIRED_FIELD:replay_total_events",
            summary["failure_reasons"],
        )

    def test_unsupported_schema_version_returns_fail(self):
        artifact = make_artifact()
        artifact["artifact_schema_version"] = "2.0"
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertIn("INVALID_ARTIFACT_SCHEMA_VERSION", summary["failure_reasons"])

    def test_wrong_artifact_type_returns_fail(self):
        artifact = make_artifact()
        artifact["artifact_type"] = "WRONG"
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertIn("INVALID_ARTIFACT_TYPE", summary["failure_reasons"])

    def test_wrong_validation_scope_returns_fail(self):
        artifact = make_artifact()
        artifact["validation_scope"] = "WRONG"
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertIn("INVALID_VALIDATION_SCOPE", summary["failure_reasons"])

    def test_pass_artifact_with_failure_reasons_returns_fail(self):
        artifact = make_artifact()
        artifact["replay_failure_reasons"] = ["UNEXPECTED"]
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertFalse(summary["artifact_valid"])
        self.assertIn("PASS_WITH_FAILURE_REASONS", summary["failure_reasons"])

    def test_pass_artifact_with_validated_false_returns_fail(self):
        artifact = make_artifact()
        artifact["persistent_replay_validated"] = False
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root, artifact), root)

        self.assertFalse(summary["artifact_valid"])
        self.assertIn(
            "PERSISTENT_REPLAY_VALIDATED_INCONSISTENT",
            summary["failure_reasons"],
        )

    def test_expected_run_id_mismatch_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            summary = load_persistent_replay_summary(
                path,
                "WRONG_RUN",
                PHASE_ID,
                allowed_root=root,
            )

        self.assertFalse(summary["run_identity_match"])
        self.assertIn("REPLAY_RUN_ID_MISMATCH", summary["failure_reasons"])

    def test_expected_phase_id_mismatch_returns_fail(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            summary = load_persistent_replay_summary(
                path,
                RUN_ID,
                "WRONG_PHASE",
                allowed_root=root,
            )

        self.assertFalse(summary["phase_identity_match"])
        self.assertIn("REPLAY_PHASE_ID_MISMATCH", summary["failure_reasons"])

    def test_valid_pass_without_external_identity_binding_is_pending(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            summary = load_persistent_replay_summary(
                path,
                None,
                None,
                allowed_root=root,
            )

        self.assertEqual(summary["replay_validation_status"], PENDING)
        self.assertTrue(summary["artifact_valid"])
        self.assertFalse(summary["persistent_replay_validated"])
        self.assertEqual(
            summary["required_next_action"],
            "CONFIGURE_EXPECTED_REPLAY_IDENTITY",
        )

    def test_limitations_are_preserved(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertEqual(summary["limitations"], list(REPLAY_ARTIFACT_LIMITATIONS))

    def test_non_claims_are_preserved_and_false(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertEqual(summary["non_claims"], REPLAY_ARTIFACT_NON_CLAIMS)
        self.assertTrue(all(value is False for value in summary["non_claims"].values()))

    def test_artifact_reference_is_backend_relative(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root, filename="result.json")
            summary = load_bound(path, root)

        reference = summary["artifact_reference"]
        self.assertEqual(reference, "replay_results/result.json")
        self.assertFalse(Path(reference).is_absolute())
        self.assertNotIn(str(Path(temp_dir).resolve()), reference)

    def test_replay_target_run_dir_is_not_exposed(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertNotIn("replay_target_run_dir", summary)
        self.assertNotIn("/private/source/backend/evidence/run", str(summary))

    def test_per_segment_array_is_not_exposed(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertNotIn("replay_segments", summary)
        self.assertNotIn("segments", summary)

    def test_raw_event_metadata_is_not_exposed(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            summary = load_bound(write_artifact(root), root)

        self.assertNotIn("replay_first_event_metadata", summary)
        self.assertNotIn("replay_last_event_metadata", summary)
        self.assertNotIn("source_component_counts", summary)

    def test_loader_does_not_modify_artifact(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            before_bytes = path.read_bytes()
            before_stat = path.stat()

            load_bound(path, root)

            self.assertEqual(path.read_bytes(), before_bytes)
            self.assertEqual(path.stat().st_mtime_ns, before_stat.st_mtime_ns)

    def test_loader_opens_only_selected_json_artifact(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = write_artifact(root)
            opened_paths: list[Path] = []
            original_open = Path.open

            def tracking_open(path_object, *args, **kwargs):
                opened_paths.append(path_object.resolve())
                return original_open(path_object, *args, **kwargs)

            with patch.object(Path, "open", tracking_open):
                summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], PASS)
        self.assertEqual(opened_paths, [path.resolve()])
        self.assertFalse(any("evidence" in item.parts for item in opened_paths))

    def test_loader_has_no_replay_engine_dependency(self):
        source = inspect.getsource(replay_result_loader)

        self.assertNotIn("replay_evidence_run", source)
        self.assertFalse(hasattr(replay_result_loader, "replay_evidence_run"))

    def test_invalid_artifact_never_escapes_loader_api(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = root / "invalid.json"
            path.write_text("[]", encoding="utf-8")

            summary = load_bound(path, root)

        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertIn("REPLAY_ARTIFACT_ROOT_NOT_OBJECT", summary["failure_reasons"])

    def test_relative_path_is_resolved_from_backend_directory(self):
        with TemporaryDirectory() as temp_dir:
            backend_dir = Path(temp_dir) / "backend"
            root = backend_dir / "replay_results"
            root.mkdir(parents=True)
            write_artifact(root)

            with patch.object(replay_result_loader, "BACKEND_DIR", backend_dir):
                summary = load_persistent_replay_summary(
                    "replay_results/replay_result.json",
                    RUN_ID,
                    PHASE_ID,
                    allowed_root=root,
                )

        self.assertEqual(summary["replay_validation_status"], PASS)

    def test_environment_helper_uses_explicit_three_variable_contract(self):
        with TemporaryDirectory() as temp_dir:
            backend_dir = Path(temp_dir) / "backend"
            root = backend_dir / "replay_results"
            root.mkdir(parents=True)
            write_artifact(root)
            environment = {
                "NOVA_SC_REPLAY_RESULT_PATH": "replay_results/replay_result.json",
                "NOVA_SC_REPLAY_EXPECTED_RUN_ID": RUN_ID,
                "NOVA_SC_REPLAY_EXPECTED_PHASE_ID": PHASE_ID,
            }

            with (
                patch.dict(os.environ, environment, clear=False),
                patch.object(replay_result_loader, "BACKEND_DIR", backend_dir),
                patch.object(replay_result_loader, "REPLAY_RESULTS_ROOT", root),
            ):
                summary = replay_result_loader.load_persistent_replay_summary_from_env()

        self.assertEqual(summary["replay_validation_status"], PASS)


class ReplayResultHealthIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.original_summary = backend_main.app.state.persistent_replay_summary

    def tearDown(self):
        backend_main.app.state.persistent_replay_summary = self.original_summary

    def test_health_contains_sibling_persistent_replay_summary(self):
        expected = load_persistent_replay_summary(None, None, None)
        backend_main.app.state.persistent_replay_summary = expected

        response = backend_main.health()

        self.assertIs(response["persistent_replay_summary"], expected)
        self.assertIn("persistent_evidence_summary", response)

    def test_existing_persistent_evidence_summary_is_unchanged(self):
        writer_summary = {"persistent_evidence_enabled": False, "marker": "writer"}

        with patch.object(
            backend_main,
            "current_persistent_evidence_summary",
            return_value=writer_summary,
        ):
            response = backend_main.health()

        self.assertIs(response["persistent_evidence_summary"], writer_summary)
        self.assertIn("persistent_replay_summary", response)

    def test_bad_replay_artifact_does_not_prevent_health_response(self):
        with TemporaryDirectory() as temp_dir:
            root = make_replay_root(temp_dir)
            path = root / "bad.json"
            path.write_text("{bad", encoding="utf-8")
            backend_main.app.state.persistent_replay_summary = load_bound(path, root)

            response = backend_main.health()

        self.assertEqual(response["backend"], "HEALTHY")
        self.assertEqual(
            response["persistent_replay_summary"]["replay_validation_status"],
            FAIL,
        )

    def test_existing_health_fields_remain_available(self):
        response = backend_main.health()

        expected_fields = {
            "backend",
            "websocket",
            "stream_id",
            "backend_mode",
            "bridge_status",
            "serial_port",
            "baud",
            "serial_connected",
            "hardware_connected",
            "malformed_packet_count",
            "dropped_packet_count",
            "last_esp32_main_packet_utc",
            "last_esp32_sub_packet_utc",
            "last_error",
            "persistent_evidence_summary",
            "persistent_replay_summary",
        }
        self.assertTrue(expected_fields.issubset(response))

    def test_startup_loads_summary_once_and_health_uses_cache(self):
        cached = load_persistent_replay_summary(None, None, None)

        with (
            patch.object(backend_main, "BACKEND_MODE", "simulator"),
            patch.object(
                backend_main,
                "load_persistent_replay_summary_from_env",
                return_value=cached,
            ) as load_from_env,
        ):
            asyncio.run(backend_main.startup())
            first = backend_main.health()["persistent_replay_summary"]
            second = backend_main.health()["persistent_replay_summary"]

        load_from_env.assert_called_once_with()
        self.assertIs(first, cached)
        self.assertIs(second, cached)

    def test_startup_contains_unexpected_loader_failure(self):
        with (
            patch.object(backend_main, "BACKEND_MODE", "simulator"),
            patch.object(
                backend_main,
                "load_persistent_replay_summary_from_env",
                side_effect=RuntimeError("private path detail"),
            ),
        ):
            asyncio.run(backend_main.startup())
            response = backend_main.health()

        summary = response["persistent_replay_summary"]
        self.assertEqual(summary["replay_validation_status"], FAIL)
        self.assertEqual(summary["failure_reasons"], ["REPLAY_ARTIFACT_LOAD_ERROR"])
        self.assertNotIn("private path detail", str(summary))


if __name__ == "__main__":
    unittest.main()
