from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Mapping

from evidence_replay import (
    FAIL,
    PASS,
    REPLAY_ARTIFACT_LIMITATIONS,
    REPLAY_ARTIFACT_NON_CLAIMS,
    validate_replay_artifact_dict,
)


PENDING = "PENDING"
PERSISTENT_REPLAY_SUMMARY_SCHEMA_VERSION = "1.0"
MAX_REPLAY_ARTIFACT_BYTES = 1_048_576

BACKEND_DIR = Path(__file__).resolve().parent
REPLAY_RESULTS_ROOT = (BACKEND_DIR / "replay_results").resolve()

CONFIGURE_REPLAY_ARTIFACT = "CONFIGURE_REPLAY_ARTIFACT"
CONFIGURE_EXPECTED_REPLAY_IDENTITY = "CONFIGURE_EXPECTED_REPLAY_IDENTITY"
REVIEW_REPLAY_ARTIFACT_FAILURES = "REVIEW_REPLAY_ARTIFACT_FAILURES"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_optional(value: str | Path | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _base_summary(*, artifact_selected: bool) -> dict[str, object]:
    return {
        "summary_schema_version": PERSISTENT_REPLAY_SUMMARY_SCHEMA_VERSION,
        "replay_validation_status": PENDING,
        "persistent_replay_validated": False,
        "artifact_selected": artifact_selected,
        "artifact_present": False,
        "artifact_valid": None,
        "artifact_schema_version": None,
        "artifact_type": None,
        "validation_scope": None,
        "phase_id": None,
        "run_id": None,
        "identity_bound": False,
        "run_identity_match": None,
        "phase_identity_match": None,
        "replay_result_generated_utc": None,
        "replay_started_utc": None,
        "replay_completed_utc": None,
        "segment_count": None,
        "total_events": None,
        "summary_events_written": None,
        "malformed_lines": None,
        "writer_errors": None,
        "persistent_events_dropped": None,
        "segment_filename_continuity": None,
        "deterministic_order_verified": None,
        "hash_verified": None,
        "run_root_match": None,
        "run_root_sha256": None,
        "failure_reasons": [],
        "limitations": list(REPLAY_ARTIFACT_LIMITATIONS),
        "non_claims": dict(REPLAY_ARTIFACT_NON_CLAIMS),
        "artifact_reference": None,
        "summary_generated_utc": utc_now(),
        "required_next_action": CONFIGURE_REPLAY_ARTIFACT,
    }


def build_persistent_replay_error_summary(
    reason: str = "REPLAY_ARTIFACT_LOAD_ERROR",
    *,
    artifact_selected: bool = True,
) -> dict[str, object]:
    summary = _base_summary(artifact_selected=artifact_selected)
    summary.update(
        {
            "replay_validation_status": FAIL,
            "failure_reasons": [reason],
            "required_next_action": REVIEW_REPLAY_ARTIFACT_FAILURES,
        }
    )
    return summary


def _fail(summary: dict[str, object], reasons: list[str]) -> dict[str, object]:
    summary.update(
        {
            "replay_validation_status": FAIL,
            "persistent_replay_validated": False,
            "failure_reasons": list(dict.fromkeys(reasons)),
            "required_next_action": REVIEW_REPLAY_ARTIFACT_FAILURES,
        }
    )
    return summary


def _pending_for_identity(summary: dict[str, object]) -> dict[str, object]:
    summary.update(
        {
            "replay_validation_status": PENDING,
            "persistent_replay_validated": False,
            "failure_reasons": [],
            "required_next_action": CONFIGURE_EXPECTED_REPLAY_IDENTITY,
        }
    )
    return summary


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_projected_field_types(artifact: Mapping[str, object]) -> list[str]:
    errors: list[str] = []

    required_strings = (
        "artifact_schema_version",
        "artifact_type",
        "validation_scope",
        "generated_utc",
        "replay_started_utc",
        "replay_completed_utc",
    )
    for field in required_strings:
        value = artifact.get(field)
        if not isinstance(value, str) or not value:
            errors.append(f"INVALID_SUMMARY_FIELD_TYPE:{field}")

    nullable_strings = (
        "replay_phase_id",
        "replay_run_id",
        "replay_run_root_sha256",
    )
    for field in nullable_strings:
        value = artifact.get(field)
        if value is not None and not isinstance(value, str):
            errors.append(f"INVALID_SUMMARY_FIELD_TYPE:{field}")

    required_integers = (
        "replay_segment_count",
        "replay_total_events",
        "replay_malformed_lines",
    )
    for field in required_integers:
        value = artifact.get(field)
        if not _is_int(value) or value < 0:
            errors.append(f"INVALID_SUMMARY_FIELD_TYPE:{field}")

    nullable_integers = (
        "replay_summary_events_written",
        "replay_writer_errors",
        "replay_persistent_events_dropped",
    )
    for field in nullable_integers:
        value = artifact.get(field)
        if value is not None and (not _is_int(value) or value < 0):
            errors.append(f"INVALID_SUMMARY_FIELD_TYPE:{field}")

    required_booleans = (
        "persistent_replay_validated",
        "replay_segment_filename_continuity",
        "replay_deterministic_order_verified",
        "replay_hash_verified",
        "replay_run_root_match",
    )
    for field in required_booleans:
        if not isinstance(artifact.get(field), bool):
            errors.append(f"INVALID_SUMMARY_FIELD_TYPE:{field}")

    limitations = artifact.get("replay_validation_limitations")
    if not isinstance(limitations, list) or not all(
        isinstance(value, str) for value in limitations
    ):
        errors.append("INVALID_SUMMARY_FIELD_TYPE:replay_validation_limitations")

    non_claims = artifact.get("non_claims")
    if not isinstance(non_claims, Mapping) or not all(
        isinstance(key, str) and isinstance(value, bool)
        for key, value in non_claims.items()
    ):
        errors.append("INVALID_SUMMARY_FIELD_TYPE:non_claims")

    return errors


def _safe_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _project_valid_artifact(
    summary: dict[str, object],
    artifact: Mapping[str, object],
) -> None:
    summary.update(
        {
            "artifact_valid": True,
            "artifact_schema_version": artifact["artifact_schema_version"],
            "artifact_type": artifact["artifact_type"],
            "validation_scope": artifact["validation_scope"],
            "phase_id": artifact["replay_phase_id"],
            "run_id": artifact["replay_run_id"],
            "replay_result_generated_utc": artifact["generated_utc"],
            "replay_started_utc": artifact["replay_started_utc"],
            "replay_completed_utc": artifact["replay_completed_utc"],
            "segment_count": artifact["replay_segment_count"],
            "total_events": artifact["replay_total_events"],
            "summary_events_written": artifact["replay_summary_events_written"],
            "malformed_lines": artifact["replay_malformed_lines"],
            "writer_errors": artifact["replay_writer_errors"],
            "persistent_events_dropped": artifact["replay_persistent_events_dropped"],
            "segment_filename_continuity": artifact[
                "replay_segment_filename_continuity"
            ],
            "deterministic_order_verified": artifact[
                "replay_deterministic_order_verified"
            ],
            "hash_verified": artifact["replay_hash_verified"],
            "run_root_match": artifact["replay_run_root_match"],
            "run_root_sha256": artifact["replay_run_root_sha256"],
            "limitations": list(artifact["replay_validation_limitations"]),
            "non_claims": dict(artifact["non_claims"]),
        }
    )


def _project_contract_fields(
    summary: dict[str, object],
    artifact: Mapping[str, object],
) -> None:
    summary.update(
        {
            "artifact_schema_version": _safe_string(
                artifact.get("artifact_schema_version")
            ),
            "artifact_type": _safe_string(artifact.get("artifact_type")),
            "validation_scope": _safe_string(artifact.get("validation_scope")),
            "phase_id": _safe_string(artifact.get("replay_phase_id")),
            "run_id": _safe_string(artifact.get("replay_run_id")),
            "replay_result_generated_utc": _safe_string(artifact.get("generated_utc")),
        }
    )


def _configured_candidate(artifact_path: str | Path) -> Path:
    candidate = Path(artifact_path).expanduser()
    if candidate.is_absolute():
        return candidate
    return BACKEND_DIR / candidate


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _load_artifact_json(path: Path, max_bytes: int) -> object:
    with path.open("rb") as handle:
        payload = handle.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError("REPLAY_ARTIFACT_TOO_LARGE")
    try:
        return json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("REPLAY_ARTIFACT_INVALID_JSON") from exc


def _load_persistent_replay_summary(
    artifact_path: str | Path | None,
    expected_run_id: str | None,
    expected_phase_id: str | None,
    *,
    allowed_root: Path,
    max_bytes: int,
) -> dict[str, object]:
    configured_path = _clean_optional(artifact_path)
    expected_run = _clean_optional(expected_run_id)
    expected_phase = _clean_optional(expected_phase_id)

    if configured_path is None:
        return _base_summary(artifact_selected=False)

    summary = _base_summary(artifact_selected=True)
    root = allowed_root.resolve(strict=False)
    candidate = _configured_candidate(configured_path)
    lexical_candidate = Path(os.path.abspath(candidate))

    if not _is_within(lexical_candidate, root):
        return _fail(summary, ["REPLAY_ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT"])

    if lexical_candidate.is_symlink():
        return _fail(summary, ["REPLAY_ARTIFACT_SYMLINK_REJECTED"])

    resolved_candidate = lexical_candidate.resolve(strict=False)
    if not _is_within(resolved_candidate, root):
        return _fail(summary, ["REPLAY_ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT"])

    relative_reference = resolved_candidate.relative_to(root)
    summary["artifact_reference"] = (
        Path("replay_results") / relative_reference
    ).as_posix()

    if not resolved_candidate.exists():
        return _fail(summary, ["REPLAY_ARTIFACT_NOT_FOUND"])

    summary["artifact_present"] = True
    if not resolved_candidate.is_file():
        return _fail(summary, ["REPLAY_ARTIFACT_NOT_REGULAR_FILE"])
    if resolved_candidate.suffix.lower() != ".json":
        return _fail(summary, ["REPLAY_ARTIFACT_INVALID_EXTENSION"])

    try:
        artifact_size = resolved_candidate.stat().st_size
    except OSError:
        return _fail(summary, ["REPLAY_ARTIFACT_UNREADABLE"])
    if artifact_size > max_bytes:
        return _fail(summary, ["REPLAY_ARTIFACT_TOO_LARGE"])

    try:
        artifact_object = _load_artifact_json(resolved_candidate, max_bytes)
    except OSError:
        return _fail(summary, ["REPLAY_ARTIFACT_UNREADABLE"])
    except ValueError as exc:
        if str(exc) == "REPLAY_ARTIFACT_INVALID_JSON":
            summary["artifact_valid"] = False
        return _fail(summary, [str(exc)])

    if not isinstance(artifact_object, Mapping):
        summary["artifact_valid"] = False
        return _fail(summary, ["REPLAY_ARTIFACT_ROOT_NOT_OBJECT"])

    artifact = artifact_object
    _project_contract_fields(summary, artifact)
    try:
        validation_errors = validate_replay_artifact_dict(artifact)
    except Exception:
        summary["artifact_valid"] = False
        return _fail(summary, ["REPLAY_ARTIFACT_SCHEMA_VALIDATION_ERROR"])

    validation_errors.extend(_validate_projected_field_types(artifact))
    if validation_errors:
        summary["artifact_valid"] = False
        return _fail(summary, validation_errors)

    _project_valid_artifact(summary, artifact)

    identity_bound = expected_run is not None and expected_phase is not None
    run_match = (
        artifact["replay_run_id"] == expected_run if expected_run is not None else None
    )
    phase_match = (
        artifact["replay_phase_id"] == expected_phase
        if expected_phase is not None
        else None
    )
    summary.update(
        {
            "identity_bound": identity_bound,
            "run_identity_match": run_match,
            "phase_identity_match": phase_match,
        }
    )

    artifact_failure_reasons = list(artifact["replay_failure_reasons"])
    identity_failures: list[str] = []
    if identity_bound:
        if run_match is not True:
            identity_failures.append("REPLAY_RUN_ID_MISMATCH")
        if phase_match is not True:
            identity_failures.append("REPLAY_PHASE_ID_MISMATCH")

    if artifact["validation_status"] == FAIL:
        return _fail(summary, artifact_failure_reasons + identity_failures)

    if not identity_bound:
        return _pending_for_identity(summary)

    if identity_failures:
        return _fail(summary, identity_failures)

    summary.update(
        {
            "replay_validation_status": PASS,
            "persistent_replay_validated": True,
            "failure_reasons": [],
            "required_next_action": None,
        }
    )
    return summary


def load_persistent_replay_summary(
    artifact_path: str | Path | None,
    expected_run_id: str | None,
    expected_phase_id: str | None,
    *,
    allowed_root: Path | None = None,
    max_bytes: int = MAX_REPLAY_ARTIFACT_BYTES,
) -> dict[str, object]:
    try:
        return _load_persistent_replay_summary(
            artifact_path,
            expected_run_id,
            expected_phase_id,
            allowed_root=allowed_root or REPLAY_RESULTS_ROOT,
            max_bytes=max_bytes,
        )
    except Exception:
        return build_persistent_replay_error_summary(
            artifact_selected=_clean_optional(artifact_path) is not None
        )


def load_persistent_replay_summary_from_env() -> dict[str, object]:
    return load_persistent_replay_summary(
        os.getenv("NOVA_SC_REPLAY_RESULT_PATH"),
        os.getenv("NOVA_SC_REPLAY_EXPECTED_RUN_ID"),
        os.getenv("NOVA_SC_REPLAY_EXPECTED_PHASE_ID"),
    )
