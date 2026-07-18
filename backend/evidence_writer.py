from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import uuid
from typing import Any


SCHEMA_VERSION = "phase_7_2g_e_c.v1"
HASH_ALGORITHM = "SHA-256"
INTEGRITY_SCOPE_FILE_DETECTION = "file_integrity_detection_only"
REPLAY_STATUS_NOT_VALIDATED = "NOT_VALIDATED"
REPLAY_STATUS_PENDING_SOAK_VALIDATION = "PENDING_SOAK_VALIDATION"
NEXT_ACTION_ENABLE_EVIDENCE = "ENABLE_BACKEND_PERSISTENT_EVIDENCE_FOR_VALIDATION_RUN"
NEXT_ACTION_FINALIZE_RUN = "COMPLETE_AND_FINALIZE_PERSISTENT_EVIDENCE_RUN"
NEXT_ACTION_RUN_SOAK_VALIDATION = "RUN_PHASE_7_2G_E_F_PERSISTENT_EVIDENCE_SOAK_VALIDATION"
NEXT_ACTION_INVESTIGATE_WRITER = "INVESTIGATE_PERSISTENT_EVIDENCE_WRITER_HEALTH"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_line(value: dict[str, Any]) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n"


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    temp_path = path.with_name(f"{path.name}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temp_path.replace(path)


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


def compute_run_root_sha256(segments: list[dict[str, Any]]) -> str:
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


def inspect_run_finalization_status(run_dir: str | Path) -> dict[str, Any]:
    path = Path(run_dir)
    manifest_path = path / "manifest.json"
    integrity_path = path / "integrity.json"
    summary_path = path / "summary.json"
    segment_files = sorted(path.glob("events_*.ndjson")) if path.exists() else []
    manifest = None
    manifest_exists = manifest_path.exists()
    incomplete_reason = None

    if not path.exists():
        incomplete_reason = "RUN_DIR_MISSING"
    elif not manifest_exists:
        incomplete_reason = "MANIFEST_MISSING"
    else:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            incomplete_reason = "MANIFEST_UNREADABLE"

    finalized = bool(manifest.get("finalized")) if isinstance(manifest, dict) else False
    hash_finalized = bool(manifest.get("hash_finalized")) if isinstance(manifest, dict) else False

    if incomplete_reason is None:
        if not finalized:
            incomplete_reason = "MANIFEST_NOT_FINALIZED"
        elif not hash_finalized:
            incomplete_reason = "HASH_NOT_FINALIZED"
        elif not integrity_path.exists():
            incomplete_reason = "INTEGRITY_MISSING"
        elif not summary_path.exists():
            incomplete_reason = "SUMMARY_MISSING"
        elif any(
            not segment.get("finalized") or not segment.get("sha256")
            for segment in manifest.get("segments", [])
        ):
            incomplete_reason = "SEGMENT_METADATA_INCOMPLETE"

    return {
        "run_dir": str(path),
        "manifest_exists": manifest_exists,
        "finalized": finalized,
        "hash_finalized": hash_finalized,
        "integrity_exists": integrity_path.exists(),
        "summary_exists": summary_path.exists(),
        "segment_files_found": [segment.name for segment in segment_files],
        "incomplete_reason": incomplete_reason,
        "recoverable": path.exists() and bool(segment_files),
    }


def _backend_relative_path(path_value: str | Path | None) -> str | None:
    if path_value is None:
        return None

    path = Path(path_value)
    if not path.is_absolute():
        return path.as_posix()

    backend_root = Path(__file__).resolve().parent
    try:
        return (Path("backend") / path.relative_to(backend_root)).as_posix()
    except ValueError:
        return path.name


def _required_next_action(
    *,
    enabled: bool,
    active: bool,
    finalized: bool,
    persistent_events_dropped: int,
    writer_errors: int,
    persistent_hash_available: bool,
) -> str:
    if writer_errors > 0 or persistent_events_dropped > 0:
        return NEXT_ACTION_INVESTIGATE_WRITER
    if not enabled:
        return NEXT_ACTION_ENABLE_EVIDENCE
    if active and not finalized:
        return NEXT_ACTION_FINALIZE_RUN
    if finalized and persistent_hash_available:
        return NEXT_ACTION_RUN_SOAK_VALIDATION
    return NEXT_ACTION_FINALIZE_RUN


def build_persistent_evidence_summary(
    writer: "PersistentEvidenceWriter | None",
    *,
    frontend_raw_replay_complete: bool | None = None,
    frontend_event_store_capacity: int | None = None,
    frontend_event_store_current_events: int | None = None,
    frontend_event_store_dropped_old_events: int | None = None,
) -> dict[str, Any]:
    stats = writer.stats_snapshot() if writer is not None else {}
    enabled = bool(stats.get("enabled"))
    active = bool(stats.get("active"))
    finalized = bool(stats.get("finalized"))
    hash_finalized = bool(stats.get("hash_finalized"))
    run_root_sha256 = stats.get("run_root_sha256")
    persistent_hash_available = bool(hash_finalized and run_root_sha256)
    persistent_events_dropped = int(stats.get("persistent_events_dropped") or 0)
    writer_errors = int(stats.get("writer_errors") or 0)
    run_dir = stats.get("evidence_run_dir")

    integrity_filename = stats.get("integrity_filename")
    summary_filename = stats.get("summary_filename")
    manifest_path = Path(run_dir) / "manifest.json" if run_dir else None
    integrity_path = Path(run_dir) / integrity_filename if run_dir and integrity_filename else None
    summary_path = Path(run_dir) / summary_filename if run_dir and summary_filename else None

    return {
        "persistent_evidence_enabled": enabled,
        "persistent_evidence_active": active,
        "evidence_run_id": stats.get("evidence_run_id"),
        "evidence_phase_id": stats.get("evidence_phase_id"),
        "evidence_run_dir": _backend_relative_path(run_dir),
        "evidence_manifest_path": _backend_relative_path(manifest_path),
        "evidence_integrity_path": _backend_relative_path(integrity_path),
        "evidence_summary_path": _backend_relative_path(summary_path),
        "evidence_segments_written": int(stats.get("segment_count") or 0),
        "persistent_events_written": int(stats.get("persistent_events_written") or 0),
        "persistent_events_dropped": persistent_events_dropped,
        "persistent_writer_errors": writer_errors,
        "finalized": finalized,
        "hash_finalized": hash_finalized,
        "run_root_sha256": run_root_sha256,
        "integrity_scope": INTEGRITY_SCOPE_FILE_DETECTION if persistent_hash_available else None,
        "tamper_proof": False,
        "cryptographic_attestation": False,
        "persistent_hash_available": persistent_hash_available,
        "persistent_replay_validated": False,
        "persistent_replay_validation_status": (
            REPLAY_STATUS_PENDING_SOAK_VALIDATION if enabled else REPLAY_STATUS_NOT_VALIDATED
        ),
        "frontend_raw_replay_complete": frontend_raw_replay_complete,
        "frontend_event_store_capacity": frontend_event_store_capacity,
        "frontend_event_store_current_events": frontend_event_store_current_events,
        "frontend_event_store_dropped_old_events": frontend_event_store_dropped_old_events,
        "required_next_action": _required_next_action(
            enabled=enabled,
            active=active,
            finalized=finalized,
            persistent_events_dropped=persistent_events_dropped,
            writer_errors=writer_errors,
            persistent_hash_available=persistent_hash_available,
        ),
    }


@dataclass(frozen=True)
class PersistentEvidenceWriterConfig:
    enabled: bool = False
    evidence_root: Path = Path("backend/evidence/soak_runs")
    phase_id: str = "PHASE_7_2G_E_C"
    rotation_minutes: float = 10.0
    rotation_mb: float = 50.0
    flush_interval_seconds: float = 5.0
    queue_size: int = 10000
    target_duration_minutes: int | None = None
    backend_mode: str | None = None
    serial_port: str | None = None
    serial_baud: int | None = None
    hardware_connected: bool | None = None
    transport_kind: str | None = None
    transport_simulated: bool | None = None
    stream_id: str | None = None


class PersistentEvidenceWriter:
    def __init__(self, config: PersistentEvidenceWriterConfig) -> None:
        self.config = config
        self.enabled = config.enabled
        self.active = False
        self.evidence_run_id: str | None = None
        self.evidence_run_dir: Path | None = None
        self.persistent_events_written = 0
        self.persistent_events_dropped = 0
        self.writer_errors = 0
        self.segment_count = 0
        self.current_segment_filename: str | None = None
        self.finalized = False
        self.hash_finalized = False
        self.run_root_sha256: str | None = None
        self.integrity_filename: str | None = None
        self.summary_filename: str | None = None

        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._task: asyncio.Task | None = None
        self._segment_file = None
        self._segment_index = 0
        self._segment_started_monotonic = 0.0
        self._segment_started_utc: str | None = None
        self._segment_event_count = 0
        self._segment_byte_count = 0
        self._segment_first_sequence: int | None = None
        self._segment_last_sequence: int | None = None
        self._segments: list[dict[str, Any]] = []
        self._start_time_utc: str | None = None
        self._end_time_utc: str | None = None

    async def start(self) -> None:
        if not self.enabled or self.active:
            return

        self.evidence_run_id = self._build_run_id()
        self._start_time_utc = utc_now()
        date_partition = self._start_time_utc[:10]
        self.evidence_run_dir = (
            self.config.evidence_root
            / date_partition
            / f"{self.config.phase_id}_{self.evidence_run_id}"
        )

        try:
            self.evidence_run_dir.mkdir(parents=True, exist_ok=False)
            self._queue = asyncio.Queue(maxsize=max(1, self.config.queue_size))
            self.active = True
            self._open_next_segment()
            self.write_manifest()
            self._task = asyncio.create_task(self._run())
        except Exception:
            self.writer_errors += 1
            self.active = False
            self._close_segment()

    def enqueue(self, packet: dict[str, Any]) -> None:
        if not self.enabled or not self.active or self._queue is None:
            return

        try:
            self._queue.put_nowait(deepcopy(packet))
        except asyncio.QueueFull:
            self.persistent_events_dropped += 1
        except Exception:
            self.writer_errors += 1

    async def stop(self) -> None:
        if not self.enabled:
            return
        if self.finalized and self.hash_finalized:
            return

        self.active = False
        if self._queue is not None:
            await self._queue.join()

        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        await self.flush()
        self._end_time_utc = self._end_time_utc or utc_now()
        self._close_segment()
        self._finalize_run()

    async def flush(self) -> None:
        try:
            if self._segment_file is not None:
                await asyncio.to_thread(self._segment_file.flush)
        except Exception:
            self.writer_errors += 1

    def rotate_segment_if_needed(self) -> None:
        if self._segment_file is None:
            return

        loop = asyncio.get_running_loop()
        elapsed_seconds = loop.time() - self._segment_started_monotonic
        rotation_seconds = max(0.0, self.config.rotation_minutes * 60.0)
        rotation_bytes = max(1, int(self.config.rotation_mb * 1024 * 1024))
        should_rotate_by_time = rotation_seconds > 0 and elapsed_seconds >= rotation_seconds
        should_rotate_by_size = self._segment_byte_count >= rotation_bytes

        if should_rotate_by_time or should_rotate_by_size:
            self._close_segment()
            self._open_next_segment()
            self.write_manifest()

    def write_manifest(self) -> None:
        if self.evidence_run_dir is None:
            return

        manifest = {
            "schema_version": SCHEMA_VERSION,
            "phase_id": self.config.phase_id,
            "evidence_run_id": self.evidence_run_id,
            "stream_id": self.config.stream_id,
            "start_time_utc": self._start_time_utc,
            "end_time_utc": self._end_time_utc,
            "target_duration_minutes": self.config.target_duration_minutes,
            "backend_mode": self.config.backend_mode,
            "serial_port": self.config.serial_port,
            "serial_baud": self.config.serial_baud,
            "hardware_connected": self.config.hardware_connected,
            "transport_kind": self.config.transport_kind,
            "transport_simulated": self.config.transport_simulated,
            "rotation_minutes": self.config.rotation_minutes,
            "rotation_mb": self.config.rotation_mb,
            "flush_interval_seconds": self.config.flush_interval_seconds,
            "queue_size": self.config.queue_size,
            "persistent_events_written": self.persistent_events_written,
            "persistent_events_dropped": self.persistent_events_dropped,
            "writer_errors": self.writer_errors,
            "segment_count": self.segment_count,
            "segments": self._segments_with_current(),
            "run_root_sha256": self.run_root_sha256,
            "integrity_filename": self.integrity_filename,
            "summary_filename": self.summary_filename,
            "finalized": self.finalized,
            "hash_finalized": self.hash_finalized,
        }

        try:
            _atomic_write_json(self.evidence_run_dir / "manifest.json", manifest)
        except Exception:
            self.writer_errors += 1

    def stats_snapshot(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "active": self.active,
            "evidence_run_id": self.evidence_run_id,
            "evidence_phase_id": self.config.phase_id,
            "evidence_run_dir": str(self.evidence_run_dir) if self.evidence_run_dir else None,
            "persistent_events_written": self.persistent_events_written,
            "persistent_events_dropped": self.persistent_events_dropped,
            "writer_errors": self.writer_errors,
            "segment_count": self.segment_count,
            "current_segment_filename": self.current_segment_filename,
            "queue_size": self._queue.qsize() if self._queue is not None else 0,
            "finalized": self.finalized,
            "hash_finalized": self.hash_finalized,
            "run_root_sha256": self.run_root_sha256,
            "integrity_filename": self.integrity_filename,
            "summary_filename": self.summary_filename,
            "integrity_scope": INTEGRITY_SCOPE_FILE_DETECTION
            if self.hash_finalized and self.run_root_sha256
            else None,
            "tamper_proof": False,
            "cryptographic_attestation": False,
            "persistent_replay_validated": False,
            "persistent_replay_validation_status": (
                REPLAY_STATUS_PENDING_SOAK_VALIDATION
                if self.enabled
                else REPLAY_STATUS_NOT_VALIDATED
            ),
        }

    async def _run(self) -> None:
        assert self._queue is not None
        last_flush = asyncio.get_running_loop().time()

        while True:
            try:
                packet = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=max(0.1, self.config.flush_interval_seconds),
                )
            except asyncio.TimeoutError:
                await self.flush()
                last_flush = asyncio.get_running_loop().time()
                continue

            try:
                self._write_packet(packet)
                self.rotate_segment_if_needed()
                loop_time = asyncio.get_running_loop().time()
                if loop_time - last_flush >= self.config.flush_interval_seconds:
                    await self.flush()
                    last_flush = loop_time
            except Exception:
                self.writer_errors += 1
            finally:
                self._queue.task_done()

    def _write_packet(self, packet: dict[str, Any]) -> None:
        if self._segment_file is None:
            self._open_next_segment()

        assert self._segment_file is not None
        line = _json_line(self._build_event_record(packet))
        self._segment_file.write(line)
        byte_count = len(line.encode("utf-8"))
        self._segment_byte_count += byte_count
        self._segment_event_count += 1
        self.persistent_events_written += 1

        sequence = packet.get("global_sequence_number")
        if isinstance(sequence, int):
            if self._segment_first_sequence is None:
                self._segment_first_sequence = sequence
            self._segment_last_sequence = sequence

    def _build_event_record(self, packet: dict[str, Any]) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "evidence_run_id": self.evidence_run_id,
            "phase_id": self.config.phase_id,
            "persisted_at_utc": utc_now(),
            "backend_received_utc": packet.get("supervisor_received_utc") or packet.get("timestamp_utc"),
            "stream_id": packet.get("stream_id"),
            "source_node_id": packet.get("source_node_id"),
            "source_sequence_number": packet.get("source_sequence_number"),
            "global_sequence_number": packet.get("global_sequence_number"),
            "event_type": packet.get("event_type"),
            "disposition": packet.get("disposition"),
            "severity": packet.get("severity"),
            "packet": packet,
            "writer_context": {
                "segment_index": self._segment_index,
                "segment_filename": self.current_segment_filename,
                "writer_queue_size": self._queue.qsize() if self._queue is not None else None,
            },
        }

    def _build_run_id(self) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"EVIDENCE_{timestamp}_{uuid.uuid4()}"

    def _open_next_segment(self) -> None:
        if self.evidence_run_dir is None:
            raise RuntimeError("Evidence run directory is not initialized")

        self._segment_index += 1
        self.segment_count = self._segment_index
        filename = f"events_{self._segment_index:06d}.ndjson"
        self.current_segment_filename = filename
        self._segment_started_utc = utc_now()
        self._segment_started_monotonic = asyncio.get_running_loop().time()
        self._segment_event_count = 0
        self._segment_byte_count = 0
        self._segment_first_sequence = None
        self._segment_last_sequence = None
        self._segment_file = (self.evidence_run_dir / filename).open(
            "a",
            encoding="utf-8",
        )

    def _finalize_run(self) -> None:
        if self.evidence_run_dir is None:
            return

        try:
            finalized_segments = []
            for segment in self._segments:
                filename = segment.get("filename")
                if not filename:
                    continue
                segment_path = self.evidence_run_dir / filename
                sha256, byte_count = _sha256_file(segment_path)
                finalized_segment = {
                    **segment,
                    "byte_count": byte_count,
                    "finalized": True,
                    "sha256": sha256,
                }
                finalized_segments.append(finalized_segment)

            self._segments = finalized_segments
            self.segment_count = len(self._segments)
            self.run_root_sha256 = compute_run_root_sha256(self._segments)
            self.integrity_filename = "integrity.json"
            self.summary_filename = "summary.json"
            self.hash_finalized = True
            self.finalized = True

            _atomic_write_json(
                self.evidence_run_dir / self.integrity_filename,
                self._build_integrity_document(),
            )
            _atomic_write_json(
                self.evidence_run_dir / self.summary_filename,
                self._build_summary_document(),
            )
            self.write_manifest()
        except Exception:
            self.writer_errors += 1
            self.finalized = False
            self.hash_finalized = False
            self.write_manifest()

    def _build_integrity_document(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "phase_id": self.config.phase_id,
            "evidence_run_id": self.evidence_run_id,
            "algorithm": HASH_ALGORITHM,
            "generated_at_utc": utc_now(),
            "segment_count": self.segment_count,
            "segments": [
                {
                    "filename": segment.get("filename"),
                    "index": segment.get("index"),
                    "byte_count": segment.get("byte_count"),
                    "event_count": segment.get("event_count"),
                    "sha256": segment.get("sha256"),
                }
                for segment in self._segments
            ],
            "run_root_sha256": self.run_root_sha256,
            "hash_finalized": True,
            "integrity_scope": INTEGRITY_SCOPE_FILE_DETECTION,
            "tamper_proof": False,
            "cryptographic_attestation": False,
        }

    def _build_summary_document(self) -> dict[str, Any]:
        first_sequence = None
        last_sequence = None
        for segment in sorted(self._segments, key=lambda item: item.get("index") or 0):
            if first_sequence is None and segment.get("first_global_sequence_number") is not None:
                first_sequence = segment.get("first_global_sequence_number")
            if segment.get("last_global_sequence_number") is not None:
                last_sequence = segment.get("last_global_sequence_number")

        return {
            "schema_version": SCHEMA_VERSION,
            "phase_id": self.config.phase_id,
            "evidence_run_id": self.evidence_run_id,
            "start_time_utc": self._start_time_utc,
            "end_time_utc": self._end_time_utc,
            "duration_seconds": self._duration_seconds(),
            "persistent_events_written": self.persistent_events_written,
            "persistent_events_dropped": self.persistent_events_dropped,
            "writer_errors": self.writer_errors,
            "segment_count": self.segment_count,
            "first_global_sequence_number": first_sequence,
            "last_global_sequence_number": last_sequence,
            "finalized": True,
            "hash_finalized": True,
        }

    def _duration_seconds(self) -> float | None:
        if not self._start_time_utc or not self._end_time_utc:
            return None
        try:
            start = datetime.fromisoformat(self._start_time_utc)
            end = datetime.fromisoformat(self._end_time_utc)
            return max(0.0, (end - start).total_seconds())
        except ValueError:
            return None

    def _close_segment(self) -> None:
        if self._segment_file is None:
            return

        try:
            self._segment_file.flush()
            self._segment_file.close()
        except Exception:
            self.writer_errors += 1

        self._segments.append(
            {
                "filename": self.current_segment_filename,
                "index": self._segment_index,
                "start_time_utc": self._segment_started_utc,
                "end_time_utc": utc_now(),
                "first_global_sequence_number": self._segment_first_sequence,
                "last_global_sequence_number": self._segment_last_sequence,
                "event_count": self._segment_event_count,
                "byte_count": self._segment_byte_count,
                "finalized": False,
                "sha256": None,
            }
        )
        self._segment_file = None

    def _segments_with_current(self) -> list[dict[str, Any]]:
        segments = list(self._segments)
        if self._segment_file is not None:
            segments.append(
                {
                    "filename": self.current_segment_filename,
                    "index": self._segment_index,
                    "start_time_utc": self._segment_started_utc,
                    "end_time_utc": None,
                    "first_global_sequence_number": self._segment_first_sequence,
                    "last_global_sequence_number": self._segment_last_sequence,
                    "event_count": self._segment_event_count,
                    "byte_count": self._segment_byte_count,
                    "finalized": False,
                    "sha256": None,
                }
            )
        return segments
