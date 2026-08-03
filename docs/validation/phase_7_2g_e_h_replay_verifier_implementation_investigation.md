# Phase 7.2G-E-H — Persistent Evidence Replay Verifier Implementation Investigation

## 1. Executive Summary

Phase 7.2G-E-H should implement the first backend/offline persistent evidence replay verifier for NOVA SC. The verifier must read a finalized evidence run directory and validate the writer-produced evidence artifacts without modifying them.

The replay verifier is the correct next software implementation step because Phase 7.2G-E-F-A and Phase 7.2G-E-F-B validated persistent evidence writing, finalization, segment hashing, and run-root hash generation, but they did not validate deterministic replay. The system can write evidence; it still needs a read-only verifier that proves saved evidence can be re-read, checked, counted, and summarized consistently.

The future verifier should validate:

- `manifest.json`
- `summary.json`
- `integrity.json`
- `events_*.ndjson`
- per-segment SHA-256 hashes
- deterministic `run_root_sha256`
- segment filename continuity
- deterministic replay order
- segment and total event-count consistency
- malformed NDJSON count
- source/component counts where event metadata exists
- read-only behavior

This investigation is documentation/design only. It does not create `backend/evidence_replay.py`, does not create `backend/test_evidence_replay.py`, does not modify backend/frontend/firmware/test code, and does not touch runtime evidence files.

Final recommendation:

```text
PROCEED_TO_PHASE_7_2G_E_H_IMPLEMENTATION_AFTER_DOC_COMMIT
```

The Phase 7.2G-E-G planning documents are present but untracked, so the cleanest engineering sequence is to commit documentation first, then implement the replay verifier.

## 2. Source Files Inspected

| File | What was learned |
|---|---|
| `backend/evidence_writer.py` | Defines writer schema, event record format, manifest, summary, integrity document, segment metadata, SHA-256 logic, run-root hash algorithm, lifecycle, finalization rules, and conservative non-claims |
| `backend/test_evidence_writer.py` | Shows test style using `TemporaryDirectory`, generated evidence runs, JSON assertions, finalization tests, SHA-256 checks, queue drop tests, zero-event finalization, idempotent stop, and interrupted/corrupt manifest checks |
| `backend/main.py` | Initializes writer from `NOVA_SC_EVIDENCE_*` env vars, starts/stops writer in hardware mode, injects writer enqueue callback, and exposes persistent evidence summary through `/health` |
| `backend/hardware_stream_manager.py` | Enqueues normalized packets and gateway health packets to evidence writer before broadcast; evidence enqueue is non-blocking/best-effort |
| `backend/protocol.py` | Adds optional `persistent_evidence_summary` into gateway health telemetry payload |
| `frontend/src/types/telemetry.ts` | Defines `PersistentEvidenceSummary`, including `persistent_replay_validated: false`, `tamper_proof: false`, and `cryptographic_attestation: false` |
| `frontend/src/store/telemetryStore.ts` | Stores `persistent_evidence_summary` from gateway health telemetry |
| `frontend/src/state/reportBuilder.ts` | Exports persistent evidence summary conservatively and forces replay validation false |
| `frontend/src/components/ReportExportPanel.tsx` | Includes persistent evidence summary in report export and displays backend evidence enabled/disabled |
| `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md` | Defines replay purpose, required artifacts, failure matrix, read-only boundary, and 1-hour acceptance target |
| `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md` | Defines proposed replay fields, algorithm, test plan, failure behavior, and Week 10 implementation direction |
| `docs/validation/phase_7_2g_e_f_a_5_minute_persistent_evidence_smoke_validation.md` | Provides 5-minute evidence target: 1 segment, 3521 events, zero drops/errors, run-root hash, PASS |
| `docs/validation/phase_7_2g_e_f_b_1_hour_persistent_evidence_soak_validation.md` | Provides 1-hour evidence target: 9 segments, 44074 events, zero drops/errors, run-root hash, PASS with frontend export caveat |
| `.gitignore` | Confirms `backend/evidence/` runtime evidence artifacts are ignored |

Runtime evidence boundary:

- `backend/evidence/` is not present in this local workspace.
- `backend/evidence/` is ignored by Git.
- Full runtime NDJSON files were not read.

## 3. Evidence Writer Schema Inventory

### `manifest.json` fields

| Field name | Expected type | Source file | Replay validation usage | Required/optional |
|---|---|---|---|---|
| `schema_version` | string | `backend/evidence_writer.py` | Confirm known schema family | Required |
| `phase_id` | string | `backend/evidence_writer.py` | Report run phase and compare with integrity/summary | Required |
| `evidence_run_id` | string | `backend/evidence_writer.py` | Report run ID and compare across files | Required |
| `stream_id` | string/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `start_time_utc` | string/null | `backend/evidence_writer.py` | Metadata and duration context | Optional |
| `end_time_utc` | string/null | `backend/evidence_writer.py` | Verify finalization context | Optional for interrupted, expected for finalized |
| `target_duration_minutes` | number/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `backend_mode` | string/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `serial_port` | string/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `serial_baud` | number/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `hardware_connected` | boolean/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `transport_kind` | string/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `transport_simulated` | boolean/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `rotation_minutes` | number | `backend/evidence_writer.py` | Metadata only | Optional |
| `rotation_mb` | number | `backend/evidence_writer.py` | Metadata only | Optional |
| `flush_interval_seconds` | number | `backend/evidence_writer.py` | Metadata only | Optional |
| `queue_size` | number | `backend/evidence_writer.py` | Metadata only | Optional |
| `persistent_events_written` | number | `backend/evidence_writer.py` | Compare with replayed total and summary | Required |
| `persistent_events_dropped` | number | `backend/evidence_writer.py` | Strict FAIL when > 0 | Required |
| `writer_errors` | number | `backend/evidence_writer.py` | Strict FAIL when > 0 | Required |
| `segment_count` | number | `backend/evidence_writer.py` | Compare with integrity and actual segment list | Required |
| `segments` | array | `backend/evidence_writer.py` | Primary segment metadata for continuity/hash/count validation | Required |
| `run_root_sha256` | string/null | `backend/evidence_writer.py` | Compare with replay-computed run root | Required for finalized hash validation |
| `integrity_filename` | string/null | `backend/evidence_writer.py` | Locate integrity file | Required for finalized run |
| `summary_filename` | string/null | `backend/evidence_writer.py` | Locate summary file | Required for finalized run |
| `finalized` | boolean | `backend/evidence_writer.py` | Required PASS condition | Required |
| `hash_finalized` | boolean | `backend/evidence_writer.py` | Required PASS condition | Required |

### `summary.json` fields

| Field name | Expected type | Source file | Replay validation usage | Required/optional |
|---|---|---|---|---|
| `schema_version` | string | `backend/evidence_writer.py` | Compare with manifest/integrity schema | Required |
| `phase_id` | string | `backend/evidence_writer.py` | Compare with manifest/integrity | Required |
| `evidence_run_id` | string | `backend/evidence_writer.py` | Compare with manifest/integrity | Required |
| `start_time_utc` | string/null | `backend/evidence_writer.py` | Metadata | Optional |
| `end_time_utc` | string/null | `backend/evidence_writer.py` | Metadata | Optional for interrupted, expected finalized |
| `duration_seconds` | number/null | `backend/evidence_writer.py` | Metadata only | Optional |
| `persistent_events_written` | number | `backend/evidence_writer.py` | Compare with total replayed events | Required |
| `persistent_events_dropped` | number | `backend/evidence_writer.py` | Strict FAIL when > 0 | Required |
| `writer_errors` | number | `backend/evidence_writer.py` | Strict FAIL when > 0 | Required |
| `segment_count` | number | `backend/evidence_writer.py` | Compare with manifest/integrity/actual segments | Required |
| `first_global_sequence_number` | number/null | `backend/evidence_writer.py` | Compare with replay first event metadata if available | Optional |
| `last_global_sequence_number` | number/null | `backend/evidence_writer.py` | Compare with replay last event metadata if available | Optional |
| `finalized` | boolean | `backend/evidence_writer.py` | Required PASS condition | Required |
| `hash_finalized` | boolean | `backend/evidence_writer.py` | Required PASS condition | Required |

### `integrity.json` fields

| Field name | Expected type | Source file | Replay validation usage | Required/optional |
|---|---|---|---|---|
| `schema_version` | string | `backend/evidence_writer.py` | Compare with manifest/summary | Required |
| `phase_id` | string | `backend/evidence_writer.py` | Compare with manifest/summary | Required |
| `evidence_run_id` | string | `backend/evidence_writer.py` | Compare with manifest/summary | Required |
| `algorithm` | string | `backend/evidence_writer.py` | Must be `SHA-256` for current verifier | Required |
| `generated_at_utc` | string | `backend/evidence_writer.py` | Metadata | Optional |
| `segment_count` | number | `backend/evidence_writer.py` | Compare with manifest/summary/actual segments | Required |
| `segments` | array | `backend/evidence_writer.py` | Expected hash, bytes, event counts per segment | Required |
| `run_root_sha256` | string | `backend/evidence_writer.py` | Compare with replay-computed run root | Required |
| `hash_finalized` | boolean | `backend/evidence_writer.py` | Required PASS condition | Required |
| `integrity_scope` | string | `backend/evidence_writer.py` | Must remain file-integrity detection only | Required |
| `tamper_proof` | boolean false | `backend/evidence_writer.py` | Confirm non-claim | Required |
| `cryptographic_attestation` | boolean false | `backend/evidence_writer.py` | Confirm non-claim | Required |

### Segment metadata fields

| Field name | Expected type | Source file | Replay validation usage | Required/optional |
|---|---|---|---|---|
| `filename` | string | `backend/evidence_writer.py` | Locate segment; check continuity | Required |
| `index` | number | `backend/evidence_writer.py` | Sort deterministic replay order | Required |
| `start_time_utc` | string/null | `backend/evidence_writer.py` | Metadata | Optional |
| `end_time_utc` | string/null | `backend/evidence_writer.py` | Metadata | Optional for active, expected finalized |
| `first_global_sequence_number` | number/null | `backend/evidence_writer.py` | Compare with first event if available | Optional |
| `last_global_sequence_number` | number/null | `backend/evidence_writer.py` | Compare with last event if available | Optional |
| `event_count` | number | `backend/evidence_writer.py` | Compare with parsed NDJSON line count | Required |
| `byte_count` | number | `backend/evidence_writer.py` | Compare with actual file bytes | Required |
| `finalized` | boolean | `backend/evidence_writer.py` | Required true for PASS | Required |
| `sha256` | string/null | `backend/evidence_writer.py` | Compare with streaming SHA-256 | Required for finalized run |

### Persistent evidence summary fields

| Field name | Expected type | Source file | Replay validation usage | Required/optional |
|---|---|---|---|---|
| `persistent_evidence_enabled` | boolean | `backend/evidence_writer.py`, frontend types | Report current writer state | Optional for replay |
| `persistent_evidence_active` | boolean | `backend/evidence_writer.py`, frontend types | Should be false for finalized evidence | Optional |
| `evidence_run_id` | string/null | `backend/evidence_writer.py`, frontend types | Compare/report | Optional |
| `evidence_phase_id` | string/null | `backend/evidence_writer.py`, frontend types | Compare/report | Optional |
| `evidence_run_dir` | string/null | `backend/evidence_writer.py`, frontend types | Path metadata | Optional |
| `evidence_manifest_path` | string/null | `backend/evidence_writer.py`, frontend types | Path metadata | Optional |
| `evidence_integrity_path` | string/null | `backend/evidence_writer.py`, frontend types | Path metadata | Optional |
| `evidence_summary_path` | string/null | `backend/evidence_writer.py`, frontend types | Path metadata | Optional |
| `evidence_segments_written` | number | `backend/evidence_writer.py`, frontend types | Compare with run segment count | Optional |
| `persistent_events_written` | number | `backend/evidence_writer.py`, frontend types | Compare with replay count | Optional |
| `persistent_events_dropped` | number | `backend/evidence_writer.py`, frontend types | Strict FAIL in replay policy if > 0 | Optional |
| `persistent_writer_errors` | number | `backend/evidence_writer.py`, frontend types | Strict FAIL in replay policy if > 0 | Optional |
| `finalized` | boolean | `backend/evidence_writer.py`, frontend types | Required condition if summary used | Optional |
| `hash_finalized` | boolean | `backend/evidence_writer.py`, frontend types | Required condition if summary used | Optional |
| `run_root_sha256` | string/null | `backend/evidence_writer.py`, frontend types | Compare/report | Optional |
| `integrity_scope` | string/null | `backend/evidence_writer.py`, frontend types | Non-claim boundary | Optional |
| `tamper_proof` | false | `backend/evidence_writer.py`, frontend types | Confirm non-claim | Required if summary present |
| `cryptographic_attestation` | false | `backend/evidence_writer.py`, frontend types | Confirm non-claim | Required if summary present |
| `persistent_hash_available` | boolean | `backend/evidence_writer.py`, frontend types | Report hash availability | Optional |
| `persistent_replay_validated` | false | `backend/evidence_writer.py`, frontend types | Must remain false until validation run passes | Required if summary present |
| `persistent_replay_validation_status` | string | `backend/evidence_writer.py`, frontend types | Must remain conservative before E-I | Required if summary present |
| frontend event-store fields | number/boolean/null | `backend/evidence_writer.py`, frontend types | Frontend replay caveat only | Optional |
| `required_next_action` | string | `backend/evidence_writer.py`, frontend types | Report guidance | Optional |

## 4. Run Root Hash Algorithm

The run-root hash algorithm is defined by `compute_run_root_sha256(segments)` in `backend/evidence_writer.py`.

Input fields per segment:

- `index`
- `filename`
- `sha256`
- `byte_count`
- `event_count`

Ordering rule:

- Sort segments by `index`, using `item.get("index") or 0`.

Line encoding rule:

For each sorted segment, create:

```text
{index}:{filename}:{sha256}:{byte_count}:{event_count}
```

Final encoding rule:

- Join all segment lines with `\n`.
- Encode the joined text as UTF-8.
- Compute SHA-256 hex digest.

Comparison targets:

- `manifest.json` field `run_root_sha256`
- `integrity.json` field `run_root_sha256`
- expected documented run-root hash for validation reports

Failure conditions:

- Any segment field used by the algorithm is missing.
- Recomputed run-root hash does not match manifest.
- Recomputed run-root hash does not match integrity.
- Manifest and integrity run-root hash values disagree.
- Recomputed segment SHA-256 or byte/event counts differ from metadata, since those fields feed the run-root hash.

The replay verifier must not invent a new hash algorithm. It should either import `compute_run_root_sha256` from `backend/evidence_writer.py` or reimplement the same algorithm with tests that compare against the writer function.

## 5. Replay Verifier Proposed API

Future module:

```text
backend/evidence_replay.py
```

Future public API:

```python
def replay_evidence_run(run_dir: str | Path) -> EvidenceReplayResult:
    ...
```

### Proposed dataclass: `EvidenceReplaySegmentResult`

| Field | Type | Purpose |
|---|---|---|
| `filename` | `str` | Segment filename |
| `exists` | `bool` | Whether the segment file exists |
| `byte_count_expected` | `int | None` | Metadata byte count |
| `byte_count_actual` | `int | None` | Actual bytes read/stat/hash counted |
| `sha256_expected` | `str | None` | Metadata SHA-256 |
| `sha256_actual` | `str | None` | Recomputed SHA-256 |
| `hash_match` | `bool` | Whether SHA values match |
| `event_count_expected` | `int | None` | Metadata event count |
| `event_count_actual` | `int` | Parsed non-empty NDJSON line count |
| `malformed_lines` | `int` | Number of unparsable NDJSON lines |
| `first_event_metadata` | `dict[str, Any] | None` | First parsed event identity metadata |
| `last_event_metadata` | `dict[str, Any] | None` | Last parsed event identity metadata |
| `failure_reasons` | `list[str]` | Segment-level failures |

### Proposed dataclass: `EvidenceReplayResult`

| Field | Type | Purpose |
|---|---|---|
| `validation_status` | `"PASS" | "FAIL"` | Overall result |
| `run_dir` | `str` | Run directory path |
| `run_id` | `str | None` | Evidence run ID |
| `phase_id` | `str | None` | Evidence phase ID |
| `segment_count` | `int` | Number of expected/replayed segments |
| `segment_filename_continuity` | `bool` | Whether filenames are continuous |
| `deterministic_order_verified` | `bool` | Whether ordered replay was deterministic by segment index |
| `total_events_replayed` | `int` | Total parsed NDJSON events |
| `summary_events_written` | `int | None` | Summary `persistent_events_written` |
| `writer_errors` | `int | None` | Writer error count |
| `persistent_events_dropped` | `int | None` | Persistent evidence drop count |
| `malformed_replay_lines` | `int` | Total malformed lines |
| `hash_verified` | `bool` | Whether all segment hashes matched |
| `run_root_sha256_expected` | `str | None` | Expected root from manifest/integrity |
| `run_root_sha256_actual` | `str | None` | Recomputed run root |
| `run_root_match` | `bool` | Whether root hashes match |
| `source_component_counts` | `dict[str, int]` | Counts by `source_node_id`, `event_type`, or combined metadata |
| `first_event_metadata` | `dict[str, Any] | None` | First event metadata across run |
| `last_event_metadata` | `dict[str, Any] | None` | Last event metadata across run |
| `replay_started_utc` | `str` | Replay start timestamp |
| `replay_completed_utc` | `str` | Replay completion timestamp |
| `failure_reasons` | `list[str]` | Overall failures |
| `segments` | `list[EvidenceReplaySegmentResult]` | Per-segment results |

Serialization recommendation:

- Provide `to_dict()` helpers or use `dataclasses.asdict()`.
- Keep output JSON deterministic by using sorted keys in CLI output.

## 6. CLI Design

Future CLI:

```text
python -m evidence_replay --run-dir <path>
```

Planned options:

| Option | Purpose |
|---|---|
| `--run-dir <path>` | Required evidence run directory |
| `--json` | Print compact machine-readable JSON |
| `--pretty` | Print indented JSON |
| `--strict` | Enforce strict failure policy; should be default for validation |
| `--allow-drops-warning` | Future option only if policy later permits drops as warning instead of fail |

Default behavior:

- Read-only.
- Stream NDJSON.
- Print machine-readable JSON result.
- Exit code `0` on PASS.
- Exit code `1` on FAIL.
- Do not create, update, or delete files inside the run directory.

Import/path note:

When run from `backend/`, `python -m evidence_replay` can import local backend modules directly. If run from repository root, use `python -m backend.evidence_replay` only if backend packaging supports it later. The phase brief specifies `python -m evidence_replay --run-dir <path>`, so the first implementation should target execution from the `backend` directory.

## 7. Replay Algorithm

Implementation-level pseudocode:

```text
replay_evidence_run(run_dir):
    replay_started_utc = utc_now()
    failures = []
    resolve run_dir as Path

    if run_dir missing or not directory:
        return FAIL(RUN_DIR_MISSING)

    manifest_path = run_dir / "manifest.json"
    summary_path = run_dir / "summary.json"
    integrity_path = run_dir / "integrity.json"

    load manifest JSON or FAIL MANIFEST_MISSING/MANIFEST_UNREADABLE
    load summary JSON or FAIL SUMMARY_MISSING/SUMMARY_UNREADABLE
    load integrity JSON or FAIL INTEGRITY_MISSING/INTEGRITY_UNREADABLE

    validate manifest.finalized == true
    validate manifest.hash_finalized == true
    validate summary.finalized == true
    validate summary.hash_finalized == true
    validate integrity.hash_finalized == true

    compare phase_id and evidence_run_id across manifest, summary, integrity
    extract segments from integrity, falling back only for diagnostics to manifest
    sort segments by index

    expected filenames = events_000001.ndjson ... events_N.ndjson
    validate filename continuity and index continuity

    total_events = 0
    malformed_lines = 0
    source_component_counts = {}
    replay_segments = []
    first_event_metadata = None
    last_event_metadata = None

    for segment in sorted segments:
        segment_path = run_dir / segment.filename
        if segment missing:
            add segment FAIL SEGMENT_FILE_MISSING
            continue

        stream file bytes through SHA-256 hasher
        independently or in same pass, stream text lines as UTF-8
        for each non-empty line:
            try json.loads(line)
            except JSONDecodeError:
                malformed_lines += 1
                segment malformed_lines += 1
                continue
            extract event metadata:
                evidence_run_id, phase_id, stream_id, source_node_id,
                event_type, global_sequence_number, source_sequence_number,
                persisted_at_utc, backend_received_utc
            update source/component counts
            set first/last metadata
            increment segment event count and total_events

        compare byte_count_actual to segment.byte_count
        compare sha256_actual to segment.sha256
        compare event_count_actual to segment.event_count
        add per-segment failure reasons as needed

    compare total_events to summary.persistent_events_written
    compare total_events to manifest.persistent_events_written
    compare segment_count to manifest/summary/integrity segment_count
    fail if summary.writer_errors > 0 or manifest.writer_errors > 0
    fail if summary.persistent_events_dropped > 0 or manifest.persistent_events_dropped > 0
    fail if malformed_lines > 0

    recompute run_root_sha256 from replay-normalized segment metadata
    compare against manifest.run_root_sha256
    compare against integrity.run_root_sha256

    validation_status = PASS if no failures else FAIL
    replay_completed_utc = utc_now()
    return EvidenceReplayResult without modifying files
```

Important implementation detail:

The segment SHA-256 hash should be computed over raw bytes. NDJSON parsing should be streaming and should not require storing every event in memory.

## 8. Failure Policy

Strict validation should return FAIL for:

| Failure | Reason code |
|---|---|
| Missing run directory | `RUN_DIR_MISSING` |
| Missing `manifest.json` | `MANIFEST_MISSING` |
| Missing `summary.json` | `SUMMARY_MISSING` |
| Missing `integrity.json` | `INTEGRITY_MISSING` |
| Unreadable/corrupt JSON metadata | `MANIFEST_UNREADABLE`, `SUMMARY_UNREADABLE`, `INTEGRITY_UNREADABLE` |
| Missing segment file | `SEGMENT_FILE_MISSING` |
| Segment SHA-256 mismatch | `SEGMENT_SHA256_MISMATCH` |
| Segment byte-count mismatch | `SEGMENT_BYTE_COUNT_MISMATCH` |
| Segment event-count mismatch | `SEGMENT_EVENT_COUNT_MISMATCH` |
| Malformed NDJSON line | `MALFORMED_NDJSON_LINE` |
| Segment filename gap | `SEGMENT_FILENAME_GAP` |
| Segment index gap | `SEGMENT_INDEX_GAP` |
| Summary count mismatch | `SUMMARY_EVENT_COUNT_MISMATCH` |
| Manifest count mismatch | `MANIFEST_EVENT_COUNT_MISMATCH` |
| Run-root mismatch | `RUN_ROOT_SHA256_MISMATCH` |
| Manifest/integrity run-root disagreement | `RUN_ROOT_METADATA_DISAGREEMENT` |
| `writer_errors > 0` | `WRITER_ERRORS_PRESENT` |
| `persistent_events_dropped > 0` | `PERSISTENT_EVENTS_DROPPED_PRESENT` |
| Evidence file modification attempt | `EVIDENCE_MODIFICATION_NOT_ALLOWED` |

Warn/not claimed:

- Frontend report not captured.
- Timestamp drift semantic checks not performed.
- RTC semantic validity not evaluated.
- Cryptographic attestation not available.
- Tamper-proof storage not available.
- Production archive readiness not established.

For current strict validation, `writer_errors > 0` and `persistent_events_dropped > 0` should fail. A future `--allow-drops-warning` policy can be considered later, but should not be the Phase 7.2G-E-H default.

## 9. Test Implementation Plan

Future test file:

```text
backend/test_evidence_replay.py
```

Use the existing `backend/test_evidence_writer.py` style:

- `unittest`
- `TemporaryDirectory`
- generated evidence runs using `PersistentEvidenceWriter`
- direct JSON mutation inside temporary directories to create failure cases
- no runtime evidence dependency

Planned tests:

| Test | Expected result |
|---|---|
| Valid finalized run returns PASS | Replay generated writer evidence and confirm PASS |
| Missing run directory FAIL | Return `RUN_DIR_MISSING` |
| Missing manifest FAIL | Return `MANIFEST_MISSING` |
| Missing summary FAIL | Return `SUMMARY_MISSING` |
| Missing integrity FAIL | Return `INTEGRITY_MISSING` |
| Missing segment FAIL | Return `SEGMENT_FILE_MISSING` |
| Segment filename gap FAIL | Rename/delete middle segment or craft metadata gap |
| Corrupt segment content SHA mismatch FAIL | Append/change bytes and detect hash mismatch |
| Truncated segment byte/event mismatch FAIL | Truncate file and detect byte/event/hash failure |
| Malformed NDJSON FAIL | Write invalid JSON line and detect malformed count |
| Summary count mismatch FAIL | Mutate `summary.json` event count |
| Run-root mismatch FAIL | Mutate manifest or integrity `run_root_sha256` |
| `writer_errors > 0` FAIL | Mutate summary/manifest writer error count |
| `persistent_events_dropped > 0` FAIL | Mutate summary/manifest drop count |
| Zero-event finalized run deterministic behavior | PASS if metadata/hashes/counts are internally consistent |
| Repeated replay stable/read-only | Replay twice and compare deterministic fields; file mtimes/content unchanged |
| Large run streaming test | Generate enough events to cover multiple segments and verify no full event list is retained |

Helper recommendations:

- Build small finalized runs through `PersistentEvidenceWriter`.
- Use a helper to load and rewrite metadata JSON only in temporary test directories.
- Use a helper to create multiple segments by setting very small `rotation_mb`.
- Use a helper to capture file hashes/mtimes before and after replay for read-only tests.

## 10. Integration Boundary

Phase 7.2G-E-H should implement:

- `backend/evidence_replay.py`
- `backend/test_evidence_replay.py`
- backend-only unit tests
- optional CLI in the same backend module

Phase 7.2G-E-H should not:

- Modify frontend report integration.
- Modify live backend evidence writer behavior.
- Modify `backend/main.py` runtime health integration unless explicitly approved later.
- Modify `backend/hardware_stream_manager.py`.
- Modify firmware.
- Modify runtime evidence files.
- Set `persistent_replay_validated=true` globally.

Report integration belongs to a later phase, currently planned as Phase 7.2G-E-J, after backend replay verifier implementation and replay validation pass.

## 11. Validation Target for First Replay Run

### 5-minute target

| Field | Expected value |
|---|---|
| Phase | `PHASE_7_2G_E_F_A` |
| Segments | `1` |
| Events | `3521` |
| Writer errors | `0` |
| Persistent events dropped | `0` |
| Run-root SHA-256 | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| Expected result | `PASS` |

### 1-hour target

| Field | Expected value |
|---|---|
| Phase | `PHASE_7_2G_E_F_B` |
| Segments | `9` |
| Total events replayed | `44074` |
| Summary events written | `44074` |
| Writer errors | `0` |
| Persistent events dropped | `0` |
| Malformed replay lines | `0` expected |
| Run-root SHA-256 | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Expected result | `PASS` for backend replay, with separate frontend export caveat retained |

The 1-hour run caveat remains: frontend report export was not captured before backend shutdown. This should not fail backend replay validation, but it must remain documented as a report-capture caveat.

## 12. Implementation Risks

| Risk | Cause | Mitigation | Validation check |
|---|---|---|---|
| Root hash algorithm mismatch | Reimplementation differs from writer | Import or match `compute_run_root_sha256`; add direct comparison test | Known segment metadata test |
| Memory usage from large NDJSON | Loading all event records into memory | Stream lines and keep only counts/first/last metadata | Large run streaming test |
| Source/component field variability | Some records may omit optional fields | Count only fields that exist; do not fail optional metadata absence | Test events with missing optional fields |
| Accidental evidence modification | Writing replay results into run directory | Make replay read-only; write no files by default | Repeated replay file hash/mtime test |
| Confusing replay validation with semantic validation | Replay may be mistaken for RTC/control validation | Scope output to file/evidence consistency | Non-claims in result fields |
| Windows/Pi path differences | Run dirs differ by host and shell | Use `pathlib.Path`; accept absolute/relative paths | Path tests on temp dirs |
| Strict policy around writer errors/drops | Current policy fails drops/errors | Keep strict default; future warning flag only if approved | Mutated metadata tests |
| Untracked planning docs | E-G docs not committed | Commit docs first | Pre-coding checklist |
| Runtime evidence absent locally | Laptop workspace may not have Pi evidence | Unit tests use generated evidence; validation runs on Pi/evidence host | Separate E-I validation run |

## 13. Recommended Implementation Sequence

1. Commit/close Phase 7.2G-E-G planning docs.
2. Create `backend/evidence_replay.py`.
3. Implement dataclasses/result serialization.
4. Implement JSON loaders and required-field checks.
5. Implement segment continuity checks.
6. Implement streaming SHA-256 verification.
7. Implement NDJSON streaming parser.
8. Implement event-count comparison.
9. Implement `run_root_sha256` recomputation from writer algorithm.
10. Implement CLI.
11. Add unit tests using temporary generated evidence runs.
12. Run backend tests.
13. Run replay on 5-minute evidence.
14. Run replay on 1-hour evidence.
15. Document Phase 7.2G-E-I replay validation result.

## 14. Acceptance Criteria Before Coding

Coding should start only when:

- This investigation confirms repository readiness.
- Phase 7.2G-E-G planning docs are committed, or intentionally staged for a separate documentation commit.
- Evidence writer schema is fully identified.
- Root hash algorithm is identified.
- Runtime evidence remains ignored by Git.
- Source/frontend/firmware boundaries are clear.
- The user accepts that Phase 7.2G-E-H is backend-only and does not yet make report-level replay validation claims.

## 15. Final Recommendation

Final recommendation:

```text
PROCEED_TO_PHASE_7_2G_E_H_IMPLEMENTATION_AFTER_DOC_COMMIT
```

Rationale:

- The writer schema and hash algorithm are clear.
- The future replay verifier API and result schema can be implemented from repository evidence.
- Existing writer tests provide enough patterns for robust replay tests.
- Runtime evidence is ignored by Git and was not read or modified.
- Replay implementation files do not exist yet.
- The Phase 7.2G-E-G planning documents are still untracked, so documentation closeout should happen before implementation for a clean phase boundary.

## 16. Final Status

```text
PHASE_7_2G_E_H_PERSISTENT_EVIDENCE_REPLAY_VERIFIER_IMPLEMENTATION_INVESTIGATION: READY_FOR_REVIEW
```
