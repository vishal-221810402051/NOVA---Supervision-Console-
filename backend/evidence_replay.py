from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any


PASS = "PASS"
FAIL = "FAIL"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class EvidenceReplaySegmentResult:
    filename: str
    exists: bool
    byte_count_expected: int | None
    byte_count_actual: int | None
    sha256_expected: str | None
    sha256_actual: str | None
    hash_match: bool
    event_count_expected: int | None
    event_count_actual: int
    malformed_lines: int
    first_event_metadata: dict[str, object] | None
    last_event_metadata: dict[str, object] | None
    failure_reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class EvidenceReplayResult:
    validation_status: str
    run_dir: str
    run_id: str | None
    phase_id: str | None
    segment_count: int
    segment_filename_continuity: bool
    deterministic_order_verified: bool
    total_events_replayed: int
    summary_events_written: int | None
    writer_errors: int | None
    persistent_events_dropped: int | None
    malformed_replay_lines: int
    hash_verified: bool
    run_root_sha256_expected: str | None
    run_root_sha256_actual: str | None
    run_root_match: bool
    source_component_counts: dict[str, int]
    first_event_metadata: dict[str, object] | None
    last_event_metadata: dict[str, object] | None
    replay_started_utc: str
    replay_completed_utc: str
    failure_reasons: list[str]
    segments: list[EvidenceReplaySegmentResult]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, *, pretty: bool = False) -> str:
        return json.dumps(
            self.to_dict(),
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=True,
        )


def compute_replay_run_root_sha256(segments: list[dict[str, Any]]) -> str:
    lines = []
    for segment in sorted(segments, key=lambda item: item.get("index") or 0):
        lines.append(
            "{index}:{filename}:{sha256}:{byte_count}:{event_count}".format(
                index=segment.get("index"),
                filename=segment.get("filename"),
                sha256=segment.get("sha256"),
                byte_count=segment.get("byte_count"),
                event_count=segment.get("event_count"),
            )
        )
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def replay_evidence_run(run_dir: str | Path) -> EvidenceReplayResult:
    started = utc_now()
    path = Path(run_dir)
    failures: list[str] = []
    segments: list[EvidenceReplaySegmentResult] = []

    if not path.exists() or not path.is_dir():
        failures.append("RUN_DIR_MISSING")
        return _result(
            run_dir=path,
            replay_started_utc=started,
            failure_reasons=failures,
        )

    manifest, manifest_failures = _load_required_json(path / "manifest.json", "MANIFEST")
    summary, summary_failures = _load_required_json(path / "summary.json", "SUMMARY")
    integrity, integrity_failures = _load_required_json(path / "integrity.json", "INTEGRITY")
    failures.extend(manifest_failures)
    failures.extend(summary_failures)
    failures.extend(integrity_failures)

    if manifest is None or summary is None or integrity is None:
        return _result(
            run_dir=path,
            replay_started_utc=started,
            failure_reasons=failures,
        )

    _validate_metadata_flags(manifest, summary, integrity, failures)
    _validate_metadata_identity(manifest, summary, integrity, failures)

    raw_segments = integrity.get("segments")
    if not isinstance(raw_segments, list):
        failures.append("INTEGRITY_SEGMENTS_MISSING")
        raw_segments = []

    sorted_segments = sorted(
        [segment for segment in raw_segments if isinstance(segment, dict)],
        key=lambda item: str(item.get("filename") or ""),
    )
    segment_filename_continuity = _validate_segment_continuity(
        sorted_segments,
        failures,
    )
    deterministic_order_verified = _validate_deterministic_order(sorted_segments, failures)

    total_events = 0
    malformed_lines = 0
    source_component_counts: dict[str, int] = {}
    first_event_metadata: dict[str, object] | None = None
    last_event_metadata: dict[str, object] | None = None
    root_segments: list[dict[str, Any]] = []

    for segment in sorted_segments:
        segment_result, root_segment = _replay_segment(
            run_dir=path,
            segment=segment,
            source_component_counts=source_component_counts,
        )
        segments.append(segment_result)
        root_segments.append(root_segment)
        total_events += segment_result.event_count_actual
        malformed_lines += segment_result.malformed_lines
        failures.extend(_prefix_segment_failures(segment_result))
        if first_event_metadata is None and segment_result.first_event_metadata is not None:
            first_event_metadata = segment_result.first_event_metadata
        if segment_result.last_event_metadata is not None:
            last_event_metadata = segment_result.last_event_metadata

    summary_events_written = _as_int(summary.get("persistent_events_written"))
    manifest_events_written = _as_int(manifest.get("persistent_events_written"))
    writer_errors = _coalesce_int(
        summary.get("writer_errors"),
        manifest.get("writer_errors"),
    )
    persistent_events_dropped = _coalesce_int(
        summary.get("persistent_events_dropped"),
        manifest.get("persistent_events_dropped"),
    )

    _compare_count(
        actual=total_events,
        expected=summary_events_written,
        reason="SUMMARY_EVENT_COUNT_MISMATCH",
        failures=failures,
    )
    _compare_count(
        actual=total_events,
        expected=manifest_events_written,
        reason="MANIFEST_EVENT_COUNT_MISMATCH",
        failures=failures,
    )
    _compare_count(
        actual=len(segments),
        expected=_as_int(integrity.get("segment_count")),
        reason="INTEGRITY_SEGMENT_COUNT_MISMATCH",
        failures=failures,
    )
    _compare_count(
        actual=len(segments),
        expected=_as_int(summary.get("segment_count")),
        reason="SUMMARY_SEGMENT_COUNT_MISMATCH",
        failures=failures,
    )
    _compare_count(
        actual=len(segments),
        expected=_as_int(manifest.get("segment_count")),
        reason="MANIFEST_SEGMENT_COUNT_MISMATCH",
        failures=failures,
    )

    if writer_errors is not None and writer_errors > 0:
        failures.append("WRITER_ERRORS_PRESENT")
    if persistent_events_dropped is not None and persistent_events_dropped > 0:
        failures.append("PERSISTENT_EVENTS_DROPPED_PRESENT")
    if malformed_lines > 0:
        failures.append("MALFORMED_NDJSON_LINE")

    expected_run_root = _expected_run_root(manifest, integrity, failures)
    actual_run_root = (
        compute_replay_run_root_sha256(root_segments)
        if root_segments
        else compute_replay_run_root_sha256([])
    )
    run_root_match = bool(expected_run_root and actual_run_root == expected_run_root)
    if expected_run_root and not run_root_match:
        failures.append("RUN_ROOT_SHA256_MISMATCH")

    hash_verified = bool(segments) and all(segment.hash_match for segment in segments)
    if not segments and _as_int(integrity.get("segment_count")) == 0:
        hash_verified = run_root_match

    if not hash_verified:
        failures.append("HASH_VERIFICATION_FAILED")

    completed = utc_now()
    return EvidenceReplayResult(
        validation_status=PASS if not failures else FAIL,
        run_dir=str(path),
        run_id=_coalesce_str(manifest.get("evidence_run_id"), summary.get("evidence_run_id")),
        phase_id=_coalesce_str(manifest.get("phase_id"), summary.get("phase_id")),
        segment_count=len(segments),
        segment_filename_continuity=segment_filename_continuity,
        deterministic_order_verified=deterministic_order_verified,
        total_events_replayed=total_events,
        summary_events_written=summary_events_written,
        writer_errors=writer_errors,
        persistent_events_dropped=persistent_events_dropped,
        malformed_replay_lines=malformed_lines,
        hash_verified=hash_verified,
        run_root_sha256_expected=expected_run_root,
        run_root_sha256_actual=actual_run_root,
        run_root_match=run_root_match,
        source_component_counts=dict(sorted(source_component_counts.items())),
        first_event_metadata=first_event_metadata,
        last_event_metadata=last_event_metadata,
        replay_started_utc=started,
        replay_completed_utc=completed,
        failure_reasons=_dedupe(failures),
        segments=segments,
    )


def _result(
    *,
    run_dir: Path,
    replay_started_utc: str,
    failure_reasons: list[str],
) -> EvidenceReplayResult:
    return EvidenceReplayResult(
        validation_status=FAIL,
        run_dir=str(run_dir),
        run_id=None,
        phase_id=None,
        segment_count=0,
        segment_filename_continuity=False,
        deterministic_order_verified=False,
        total_events_replayed=0,
        summary_events_written=None,
        writer_errors=None,
        persistent_events_dropped=None,
        malformed_replay_lines=0,
        hash_verified=False,
        run_root_sha256_expected=None,
        run_root_sha256_actual=None,
        run_root_match=False,
        source_component_counts={},
        first_event_metadata=None,
        last_event_metadata=None,
        replay_started_utc=replay_started_utc,
        replay_completed_utc=utc_now(),
        failure_reasons=_dedupe(failure_reasons),
        segments=[],
    )


def _load_required_json(path: Path, prefix: str) -> tuple[dict[str, Any] | None, list[str]]:
    if not path.exists():
        return None, [f"{prefix}_MISSING"]
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None, [f"{prefix}_UNREADABLE"]
    if not isinstance(value, dict):
        return None, [f"{prefix}_UNREADABLE"]
    return value, []


def _validate_metadata_flags(
    manifest: dict[str, Any],
    summary: dict[str, Any],
    integrity: dict[str, Any],
    failures: list[str],
) -> None:
    if manifest.get("finalized") is not True:
        failures.append("MANIFEST_NOT_FINALIZED")
    if manifest.get("hash_finalized") is not True:
        failures.append("MANIFEST_HASH_NOT_FINALIZED")
    if summary.get("finalized") is not True:
        failures.append("SUMMARY_NOT_FINALIZED")
    if summary.get("hash_finalized") is not True:
        failures.append("SUMMARY_HASH_NOT_FINALIZED")
    if integrity.get("hash_finalized") is not True:
        failures.append("INTEGRITY_HASH_NOT_FINALIZED")
    if integrity.get("algorithm") not in {None, "SHA-256"}:
        failures.append("UNSUPPORTED_HASH_ALGORITHM")


def _validate_metadata_identity(
    manifest: dict[str, Any],
    summary: dict[str, Any],
    integrity: dict[str, Any],
    failures: list[str],
) -> None:
    for field, reason in (
        ("evidence_run_id", "RUN_ID_METADATA_MISMATCH"),
        ("phase_id", "PHASE_ID_METADATA_MISMATCH"),
        ("schema_version", "SCHEMA_VERSION_METADATA_MISMATCH"),
    ):
        values = [
            value
            for value in (
                manifest.get(field),
                summary.get(field),
                integrity.get(field),
            )
            if value is not None
        ]
        if len(set(values)) > 1:
            failures.append(reason)


def _validate_segment_continuity(
    segments: list[dict[str, Any]],
    failures: list[str],
) -> bool:
    continuous = True
    for position, segment in enumerate(segments, start=1):
        expected = f"events_{position:06d}.ndjson"
        if segment.get("filename") != expected:
            continuous = False
            failures.append("SEGMENT_FILENAME_GAP")
    return continuous


def _validate_deterministic_order(
    segments: list[dict[str, Any]],
    failures: list[str],
) -> bool:
    verified = True
    for position, segment in enumerate(segments, start=1):
        index = _as_int(segment.get("index"))
        if index != position:
            verified = False
            failures.append("SEGMENT_INDEX_GAP")
    return verified


def _replay_segment(
    *,
    run_dir: Path,
    segment: dict[str, Any],
    source_component_counts: dict[str, int],
) -> tuple[EvidenceReplaySegmentResult, dict[str, Any]]:
    filename = str(segment.get("filename") or "")
    expected_byte_count = _as_int(segment.get("byte_count"))
    expected_sha256 = _as_str(segment.get("sha256"))
    expected_event_count = _as_int(segment.get("event_count"))
    failure_reasons: list[str] = []

    if not filename:
        failure_reasons.append("SEGMENT_FILENAME_MISSING")
        return (
            EvidenceReplaySegmentResult(
                filename=filename,
                exists=False,
                byte_count_expected=expected_byte_count,
                byte_count_actual=None,
                sha256_expected=expected_sha256,
                sha256_actual=None,
                hash_match=False,
                event_count_expected=expected_event_count,
                event_count_actual=0,
                malformed_lines=0,
                first_event_metadata=None,
                last_event_metadata=None,
                failure_reasons=failure_reasons,
            ),
            _root_segment(segment, None, None, 0),
        )

    path = run_dir / filename
    if not path.exists():
        failure_reasons.append("SEGMENT_FILE_MISSING")
        return (
            EvidenceReplaySegmentResult(
                filename=filename,
                exists=False,
                byte_count_expected=expected_byte_count,
                byte_count_actual=None,
                sha256_expected=expected_sha256,
                sha256_actual=None,
                hash_match=False,
                event_count_expected=expected_event_count,
                event_count_actual=0,
                malformed_lines=0,
                first_event_metadata=None,
                last_event_metadata=None,
                failure_reasons=failure_reasons,
            ),
            _root_segment(segment, None, None, 0),
        )

    actual_sha256, actual_byte_count = _sha256_file(path)
    event_count, malformed_lines, first_metadata, last_metadata = _parse_ndjson_segment(
        path,
        source_component_counts,
    )
    hash_match = bool(expected_sha256 and actual_sha256 == expected_sha256)

    if not hash_match:
        failure_reasons.append("SEGMENT_SHA256_MISMATCH")
    if expected_byte_count is not None and actual_byte_count != expected_byte_count:
        failure_reasons.append("SEGMENT_BYTE_COUNT_MISMATCH")
    if expected_event_count is not None and event_count != expected_event_count:
        failure_reasons.append("SEGMENT_EVENT_COUNT_MISMATCH")
    if malformed_lines > 0:
        failure_reasons.append("MALFORMED_NDJSON_LINE")

    return (
        EvidenceReplaySegmentResult(
            filename=filename,
            exists=True,
            byte_count_expected=expected_byte_count,
            byte_count_actual=actual_byte_count,
            sha256_expected=expected_sha256,
            sha256_actual=actual_sha256,
            hash_match=hash_match,
            event_count_expected=expected_event_count,
            event_count_actual=event_count,
            malformed_lines=malformed_lines,
            first_event_metadata=first_metadata,
            last_event_metadata=last_metadata,
            failure_reasons=_dedupe(failure_reasons),
        ),
        _root_segment(segment, actual_sha256, actual_byte_count, event_count),
    )


def _sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> tuple[str, int]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            byte_count += len(chunk)
            digest.update(chunk)
    return digest.hexdigest(), byte_count


def _parse_ndjson_segment(
    path: Path,
    source_component_counts: dict[str, int],
) -> tuple[int, int, dict[str, object] | None, dict[str, object] | None]:
    event_count = 0
    malformed_lines = 0
    first_metadata: dict[str, object] | None = None
    last_metadata: dict[str, object] | None = None

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                malformed_lines += 1
                continue
            if not isinstance(event, dict):
                malformed_lines += 1
                continue

            event_count += 1
            metadata = _event_metadata(event, line_number=line_number)
            if first_metadata is None:
                first_metadata = metadata
            last_metadata = metadata
            _update_source_component_counts(event, source_component_counts)

    return event_count, malformed_lines, first_metadata, last_metadata


def _event_metadata(event: dict[str, Any], *, line_number: int) -> dict[str, object]:
    return {
        "line_number": line_number,
        "evidence_run_id": event.get("evidence_run_id"),
        "phase_id": event.get("phase_id"),
        "stream_id": event.get("stream_id"),
        "source_node_id": event.get("source_node_id"),
        "source_sequence_number": event.get("source_sequence_number"),
        "global_sequence_number": event.get("global_sequence_number"),
        "event_type": event.get("event_type"),
        "persisted_at_utc": event.get("persisted_at_utc"),
        "backend_received_utc": event.get("backend_received_utc"),
    }


def _update_source_component_counts(
    event: dict[str, Any],
    source_component_counts: dict[str, int],
) -> None:
    source_node_id = event.get("source_node_id")
    event_type = event.get("event_type")
    if isinstance(source_node_id, str) and source_node_id:
        _increment(source_component_counts, f"source_node_id:{source_node_id}")
    if isinstance(event_type, str) and event_type:
        _increment(source_component_counts, f"event_type:{event_type}")
    if isinstance(source_node_id, str) and source_node_id and isinstance(event_type, str) and event_type:
        _increment(source_component_counts, f"{source_node_id}:{event_type}")


def _increment(counts: dict[str, int], key: str) -> None:
    counts[key] = counts.get(key, 0) + 1


def _root_segment(
    segment: dict[str, Any],
    sha256: str | None,
    byte_count: int | None,
    event_count: int,
) -> dict[str, Any]:
    return {
        "index": segment.get("index"),
        "filename": segment.get("filename"),
        "sha256": sha256,
        "byte_count": byte_count,
        "event_count": event_count,
    }


def _prefix_segment_failures(segment: EvidenceReplaySegmentResult) -> list[str]:
    return [f"{reason}:{segment.filename}" for reason in segment.failure_reasons]


def _expected_run_root(
    manifest: dict[str, Any],
    integrity: dict[str, Any],
    failures: list[str],
) -> str | None:
    manifest_root = _as_str(manifest.get("run_root_sha256"))
    integrity_root = _as_str(integrity.get("run_root_sha256"))
    if manifest_root and integrity_root and manifest_root != integrity_root:
        failures.append("RUN_ROOT_METADATA_DISAGREEMENT")
    return manifest_root or integrity_root


def _compare_count(
    *,
    actual: int,
    expected: int | None,
    reason: str,
    failures: list[str],
) -> None:
    if expected is not None and actual != expected:
        failures.append(reason)


def _coalesce_int(*values: Any) -> int | None:
    for value in values:
        parsed = _as_int(value)
        if parsed is not None:
            return parsed
    return None


def _coalesce_str(*values: Any) -> str | None:
    for value in values:
        parsed = _as_str(value)
        if parsed:
            return parsed
    return None


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _as_str(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    return None


def _dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Replay and verify a NOVA SC persistent evidence run.",
    )
    parser.add_argument("--run-dir", required=True, help="Evidence run directory")
    parser.add_argument("--json", action="store_true", help="Print compact JSON")
    parser.add_argument("--pretty", action="store_true", help="Print indented JSON")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Strict validation policy; currently the default behavior",
    )
    parser.add_argument(
        "--allow-drops-warning",
        action="store_true",
        help="Reserved for a future warning policy; current implementation remains strict",
    )
    args = parser.parse_args(argv)

    result = replay_evidence_run(args.run_dir)
    print(result.to_json(pretty=args.pretty))
    return 0 if result.validation_status == PASS else 1


if __name__ == "__main__":
    raise SystemExit(main())
