# Phase 7.2G-E-K — Replay Result Artifact Schema Implementation Investigation

## 1. Executive Summary

Phase 7.2G-E-K should implement the first versioned, machine-readable replay-result artifact for NOVA SC backend persistent evidence replay.

The current replay verifier already produces a complete structured `EvidenceReplayResult`, serializes it deterministically to JSON, returns strict PASS or FAIL outcomes, and preserves bounded per-segment diagnostics without retaining raw replayed events. The missing capability is an explicit and safe way to persist a normalized replay result for later backend report integration.

The recommended E-K change is:

```text
python -m evidence_replay --run-dir <read-only-evidence-run> --output <explicit-json-path>
```

The implementation should:

- Preserve current stdout behavior when `--output` is absent.
- Add a versioned `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` artifact schema.
- Write an artifact only when `--output` is explicitly supplied.
- Reject every output path that resolves to the source evidence run directory or any descendant of it.
- Write atomically through a unique temporary file in the destination directory, flush and fsync the file, then use `os.replace`.
- Write both PASS and FAIL replay artifacts when a structured replay result exists.
- Preserve the verifier's status exactly without reinterpretation.
- Keep generated artifacts outside Git by default under `backend/replay_results/`.
- Leave `manifest.json`, `summary.json`, `integrity.json`, and all `events_*.ndjson` files unchanged.

Artifact V1 should include every current top-level replay result field under stable artifact names and every bounded segment result. It should not include raw NDJSON events or packet payloads. Required limitations and non-claims should be embedded in every artifact so later backend and frontend consumers cannot lose the validation boundary.

The next best step is artifact schema implementation because Phase E-I proved that the verifier can replay and validate both single-segment and multi-segment evidence. A versioned artifact creates the controlled handoff required by future Phase E-L backend report integration without coupling report generation to raw evidence files or automatic replay execution.

Final recommendation:

```text
PROCEED_TO_PHASE_7_2G_E_K_IMPLEMENTATION
```

The required `.gitignore` update should be the first change in that implementation phase.

## 2. Source Files Inspected

| File | Findings |
|---|---|
| `backend/evidence_replay.py` | Defines replay result dataclasses, recursive dictionary/JSON serialization, strict PASS/FAIL rules, streaming NDJSON verification, source/component counts, compact first/last metadata, run-root checks, CLI flags, stdout behavior, and exit codes |
| `backend/test_evidence_replay.py` | Uses `TemporaryDirectory`, creates real finalized evidence through `PersistentEvidenceWriter`, mutates generated fixtures for failure tests, compares source file fingerprints, verifies writer/replay hash compatibility, and confirms raw events are not retained |
| `backend/evidence_writer.py` | Provides deterministic JSON formatting, fsync-plus-replace atomic JSON writes, SHA-256 and run-root conventions, finalization documents, writer counters, naming patterns, and conservative non-claims |
| `backend/test_evidence_writer.py` | Uses `IsolatedAsyncioTestCase` and temporary directories to verify manifest creation, NDJSON writing, rotation, finalization, hashes, deterministic run roots, idempotent stop, zero-event runs, and corrupt/interrupted run detection |
| `.gitignore` | Ignores `backend/evidence/` but does not currently ignore `backend/replay_results/` |
| `docs/validation/phase_7_2g_e_j_replay_result_report_integration_planning.md` | Defines the artifact-first architecture, report field needs, PASS/FAIL/PENDING report semantics, output separation, strict claim controls, and E-L/E-M boundaries |
| `docs/validation/phase_7_2g_e_i_persistent_evidence_replay_validation_run.md` | Documents successful replay of 3521 events from one segment and 44074 events from nine segments, with zero malformed lines, writer errors, or drops and matching hashes/run roots |
| `docs/validation/phase_7_2g_e_h_replay_verifier_implementation_investigation.md` | The committed baseline defines source artifact fields, strict replay checks, read-only behavior, and the original replay implementation boundary |

Repository-state note:

- The working copy of the Phase E-H investigation file had a pre-existing unrelated modification.
- Its committed `HEAD` version was inspected for this investigation.
- That working-tree modification was not changed.
- `backend/evidence/` was not accessed or read during this investigation.

## 3. Current Replay Result Structure

`EvidenceReplayResult` is a frozen dataclass. `to_dict()` uses `dataclasses.asdict`, which recursively converts nested segment dataclasses. `to_json(pretty=False)` uses compact separators and sorted keys. `to_json(pretty=True)` uses indented JSON and sorted keys.

All current result fields are suitable for Artifact V1 because the replay implementation already excludes raw event bodies. The artifact should rename fields into the stable report-oriented namespace defined below.

| Current field | Current type | Current meaning | Include in V1 | Artifact field | Notes |
|---|---|---|---|---|---|
| `validation_status` | `str` | Strict replay verdict: PASS only when no failure reasons exist | Yes | `validation_status` | Preserve exactly; V1 permits PASS or FAIL only |
| `run_dir` | `str` | Replay target path as supplied/normalized by `Path` | Yes | `replay_target_run_dir` | Preserve in artifact; future report layer may sanitize host-absolute paths |
| `run_id` | `str \| None` | Evidence run identity from manifest/summary | Yes | `replay_run_id` | Null for early failures before metadata can be loaded |
| `phase_id` | `str \| None` | Evidence phase identity from manifest/summary | Yes | `replay_phase_id` | Null for early failures before metadata can be loaded |
| `segment_count` | `int` | Number of segment result records replayed | Yes | `replay_segment_count` | Must equal `len(replay_segments)` in a valid artifact |
| `segment_filename_continuity` | `bool` | Whether segment names follow `events_000001.ndjson` sequence | Yes | `replay_segment_filename_continuity` | Required PASS invariant |
| `deterministic_order_verified` | `bool` | Whether segment indexes are continuous and ordered | Yes | `replay_deterministic_order_verified` | Required PASS invariant |
| `total_events_replayed` | `int` | Count of valid NDJSON object lines streamed across segments | Yes | `replay_total_events` | Does not include malformed/non-object lines |
| `summary_events_written` | `int \| None` | Writer summary count used for comparison | Yes | `replay_summary_events_written` | Preserve null when metadata is unavailable |
| `writer_errors` | `int \| None` | Writer error count from summary/manifest | Yes | `replay_writer_errors` | Greater than zero is strict FAIL |
| `persistent_events_dropped` | `int \| None` | Persistent writer drop count | Yes | `replay_persistent_events_dropped` | Greater than zero is strict FAIL |
| `malformed_replay_lines` | `int` | Total malformed or non-object NDJSON lines | Yes | `replay_malformed_lines` | Greater than zero is strict FAIL |
| `hash_verified` | `bool` | All segment hashes matched, or zero-event run-root case passed | Yes | `replay_hash_verified` | Required PASS invariant |
| `run_root_sha256_expected` | `str \| None` | Stored root selected from manifest/integrity | Yes | `replay_run_root_sha256_expected` | Preserve on PASS and FAIL when available |
| `run_root_sha256_actual` | `str \| None` | Replay-computed root from actual segment metadata | Yes | `replay_run_root_sha256_actual` | Preserve on PASS and FAIL when available |
| `run_root_match` | `bool` | Expected and actual run roots match | Yes | `replay_run_root_match` | Required PASS invariant |
| `source_component_counts` | `dict[str, int]` | Sorted counts by source node, event type, and source/event combination | Yes | `replay_source_component_counts` | Bounded aggregate; no event payloads |
| `first_event_metadata` | `dict[str, object] \| None` | Compact metadata for first valid replayed event | Yes | `replay_first_event_metadata` | Includes identity, sequence, type, and timestamps only |
| `last_event_metadata` | `dict[str, object] \| None` | Compact metadata for last valid replayed event | Yes | `replay_last_event_metadata` | Includes identity, sequence, type, and timestamps only |
| `replay_started_utc` | `str` | Replay start timestamp generated by verifier | Yes | `replay_started_utc` | Preserve exactly |
| `replay_completed_utc` | `str` | Replay completion timestamp generated by verifier | Yes | `replay_completed_utc` | Preserve exactly |
| `failure_reasons` | `list[str]` | Deduplicated top-level and segment-prefixed failure reasons | Yes | `replay_failure_reasons` | Must remain intact on FAIL |
| `segments` | `list[EvidenceReplaySegmentResult]` | Bounded verification result for each segment | Yes, full | `replay_segments` | Include all result fields; raw events are already absent |

Current status construction:

- A normal replay returns PASS only when `failures` is empty.
- Any metadata, continuity, ordering, count, writer-health, malformed-line, hash, or run-root failure produces FAIL.
- Early failures use `_result(...)`, which returns a complete FAIL result with safe null/zero defaults and preserved failure reasons.
- Failure reasons are deduplicated while retaining first-seen order.

Current source/component count behavior:

- `source_node_id:<node>` counts each valid event with a non-empty source node.
- `event_type:<type>` counts each valid event with a non-empty event type.
- `<source_node_id>:<event_type>` counts each valid source/type combination.
- The final dictionary is sorted by key before being stored in `EvidenceReplayResult`.

Current first/last metadata fields are:

- `line_number`
- `evidence_run_id`
- `phase_id`
- `stream_id`
- `source_node_id`
- `source_sequence_number`
- `global_sequence_number`
- `event_type`
- `persisted_at_utc`
- `backend_received_utc`

No packet payload or complete raw event is stored in the replay result.

## 4. Current Segment Result Structure

`EvidenceReplaySegmentResult` is also a frozen dataclass and is recursively serialized by the parent result. Every field should be included in Artifact V1 because each item is a bounded summary and is useful for diagnosing a failed replay.

| Current field | Current type | Current meaning | V1 treatment | Notes |
|---|---|---|---|---|
| `filename` | `str` | Segment filename from integrity metadata | Full | Required for identity and continuity diagnosis |
| `exists` | `bool` | Whether the expected segment exists | Full | False for missing-file failures |
| `byte_count_expected` | `int \| None` | Stored expected byte count | Full | Preserve on PASS and FAIL |
| `byte_count_actual` | `int \| None` | Actual bytes read from segment | Full | Null when file cannot be read/found |
| `sha256_expected` | `str \| None` | Stored expected segment hash | Full | File-integrity metadata only |
| `sha256_actual` | `str \| None` | Hash computed during replay | Full | Preserve mismatch values for diagnosis |
| `hash_match` | `bool` | Expected and actual segment hashes match | Full | Required true for segment PASS |
| `event_count_expected` | `int \| None` | Stored expected event count | Full | Preserve on PASS and FAIL |
| `event_count_actual` | `int` | Valid event objects replayed from segment | Full | Excludes malformed/non-object lines |
| `malformed_lines` | `int` | Malformed/non-object lines in this segment | Full | Greater than zero contributes to FAIL |
| `first_event_metadata` | `dict[str, object] \| None` | Compact first valid event metadata for segment | Full summary | No event payload included |
| `last_event_metadata` | `dict[str, object] \| None` | Compact last valid event metadata for segment | Full summary | No event payload included |
| `failure_reasons` | `list[str]` | Deduplicated segment-local reasons | Full | Top-level result also carries filename-prefixed forms |

Artifact segment items should retain these field names rather than add a `replay_` prefix inside each item. The parent key `replay_segments` provides the namespace and retaining existing names minimizes mapping errors.

Explicitly excluded from every segment item:

- Raw NDJSON lines.
- Parsed event arrays.
- Full packet payloads.
- File contents.

The existing replay streaming test already asserts that neither the top-level result nor segment results retain an `events` collection.

## 5. Proposed V1 Artifact Schema

### 5.1 Required constants

| Field | Required value |
|---|---|
| `artifact_schema_version` | `"1.0"` |
| `artifact_type` | `"NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT"` |
| `generator` | `"backend.evidence_replay"` |
| `validation_scope` | `"BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY"` |

Recommended module constants:

```python
REPLAY_ARTIFACT_SCHEMA_VERSION = "1.0"
REPLAY_ARTIFACT_TYPE = "NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT"
REPLAY_ARTIFACT_GENERATOR = "backend.evidence_replay"
REPLAY_ARTIFACT_VALIDATION_SCOPE = "BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY"
```

### 5.2 Top-level schema

| Artifact field | Type | Required | Source/invariant |
|---|---|---|---|
| `artifact_schema_version` | string | Yes | Constant `"1.0"` |
| `artifact_type` | string | Yes | Constant artifact type |
| `generated_utc` | string | Yes | `utc_now()` when artifact dictionary is built |
| `generator` | string | Yes | Constant `"backend.evidence_replay"` |
| `validation_scope` | string | Yes | Constant offline replay scope |
| `validation_status` | `PASS` or `FAIL` | Yes | Exact `result.validation_status` |
| `persistent_replay_validated` | boolean | Yes | True only for PASS with empty `result.failure_reasons` |
| `replay_phase_id` | string or null | Yes | `result.phase_id` |
| `replay_run_id` | string or null | Yes | `result.run_id` |
| `replay_target_run_dir` | string | Yes | `result.run_dir` as recorded by replay |
| `replay_started_utc` | string | Yes | `result.replay_started_utc` |
| `replay_completed_utc` | string | Yes | `result.replay_completed_utc` |
| `replay_segment_count` | integer | Yes | `result.segment_count` |
| `replay_total_events` | integer | Yes | `result.total_events_replayed` |
| `replay_summary_events_written` | integer or null | Yes | `result.summary_events_written` |
| `replay_writer_errors` | integer or null | Yes | `result.writer_errors` |
| `replay_persistent_events_dropped` | integer or null | Yes | `result.persistent_events_dropped` |
| `replay_malformed_lines` | integer | Yes | `result.malformed_replay_lines` |
| `replay_segment_filename_continuity` | boolean | Yes | `result.segment_filename_continuity` |
| `replay_deterministic_order_verified` | boolean | Yes | `result.deterministic_order_verified` |
| `replay_hash_verified` | boolean | Yes | `result.hash_verified` |
| `replay_run_root_match` | boolean | Yes | `result.run_root_match` |
| `replay_run_root_sha256` | string or null | Yes | Populated only when expected/actual roots exist, match, and `run_root_match` is true |
| `replay_run_root_sha256_expected` | string or null | Yes | `result.run_root_sha256_expected` |
| `replay_run_root_sha256_actual` | string or null | Yes | `result.run_root_sha256_actual` |
| `replay_failure_reasons` | array of strings | Yes | Copy of `result.failure_reasons` |
| `replay_source_component_counts` | object of integer values | Yes | Copy of sorted aggregate map |
| `replay_first_event_metadata` | object or null | Yes | Copy of bounded metadata |
| `replay_last_event_metadata` | object or null | Yes | Copy of bounded metadata |
| `replay_segments` | array of segment objects | Yes | Full `segment.to_dict()` results |
| `replay_validation_limitations` | array of strings | Yes | Exact required limitation constants |
| `non_claims` | object of boolean false values | Yes | Exact required non-claim keys |

### 5.3 Segment item schema

Each `replay_segments` item must contain:

| Field | Type |
|---|---|
| `filename` | string |
| `exists` | boolean |
| `byte_count_expected` | integer or null |
| `byte_count_actual` | integer or null |
| `sha256_expected` | string or null |
| `sha256_actual` | string or null |
| `hash_match` | boolean |
| `event_count_expected` | integer or null |
| `event_count_actual` | integer |
| `malformed_lines` | integer |
| `first_event_metadata` | object or null |
| `last_event_metadata` | object or null |
| `failure_reasons` | array of strings |

### 5.4 Required limitations

Every V1 artifact must contain these exact strings, in this order:

```text
SHA-256 verification detects mismatch against recorded metadata but is not cryptographic attestation.
Replay validation does not prove tamper-proof storage.
Replay validation does not certify production archive readiness.
Replay validation does not validate frontend report integration.
Replay validation does not validate FRAM checkpoint storage.
Replay validation does not validate actuator or control readiness.
```

### 5.5 Required non-claims

`non_claims` should be an object rather than a list so downstream schema validation can require that every unsupported claim remains explicitly false:

```json
{
  "tamper_proof_storage": false,
  "cryptographic_attestation": false,
  "production_archive_certification": false,
  "frontend_report_integration": false,
  "fram_validation": false,
  "actuator_control_readiness": false,
  "clinical_readiness": false
}
```

### 5.6 Representative artifact shape

```json
{
  "artifact_schema_version": "1.0",
  "artifact_type": "NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT",
  "generated_utc": "2026-08-30T00:00:00+00:00",
  "generator": "backend.evidence_replay",
  "validation_scope": "BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY",
  "validation_status": "PASS",
  "persistent_replay_validated": true,
  "replay_phase_id": "PHASE_7_2G_E_F_B",
  "replay_run_id": "EVIDENCE_...",
  "replay_target_run_dir": "evidence/soak_runs/...",
  "replay_started_utc": "2026-08-30T00:00:00+00:00",
  "replay_completed_utc": "2026-08-30T00:00:02+00:00",
  "replay_segment_count": 9,
  "replay_total_events": 44074,
  "replay_summary_events_written": 44074,
  "replay_writer_errors": 0,
  "replay_persistent_events_dropped": 0,
  "replay_malformed_lines": 0,
  "replay_segment_filename_continuity": true,
  "replay_deterministic_order_verified": true,
  "replay_hash_verified": true,
  "replay_run_root_match": true,
  "replay_run_root_sha256": "88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be",
  "replay_run_root_sha256_expected": "88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be",
  "replay_run_root_sha256_actual": "88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be",
  "replay_failure_reasons": [],
  "replay_source_component_counts": {},
  "replay_first_event_metadata": null,
  "replay_last_event_metadata": null,
  "replay_segments": [],
  "replay_validation_limitations": [
    "SHA-256 verification detects mismatch against recorded metadata but is not cryptographic attestation.",
    "Replay validation does not prove tamper-proof storage.",
    "Replay validation does not certify production archive readiness.",
    "Replay validation does not validate frontend report integration.",
    "Replay validation does not validate FRAM checkpoint storage.",
    "Replay validation does not validate actuator or control readiness."
  ],
  "non_claims": {
    "tamper_proof_storage": false,
    "cryptographic_attestation": false,
    "production_archive_certification": false,
    "frontend_report_integration": false,
    "fram_validation": false,
    "actuator_control_readiness": false,
    "clinical_readiness": false
  }
}
```

The abbreviated sample uses empty aggregate/segment values for readability. Real artifacts must preserve the values from `EvidenceReplayResult`.

### 5.7 Serialization convention

Artifact files should follow the writer's readable deterministic JSON convention:

- UTF-8 encoding.
- `indent=2`.
- `sort_keys=True`.
- One trailing newline.

Key order is deterministic. Artifact bytes from separate builds are not expected to be identical because `generated_utc` records artifact generation time.

## 6. PASS/FAIL Artifact Rules

Artifact V1 represents a completed replay attempt and therefore has only PASS or FAIL. PENDING is a future report-layer state used when no artifact exists; E-K must not create a PENDING replay artifact.

Rules:

- `validation_status` must exactly equal `EvidenceReplayResult.validation_status`.
- Artifact generation must not upgrade, downgrade, recalculate, or reinterpret the verifier verdict.
- `persistent_replay_validated` is true only when `validation_status == "PASS"` and `replay_failure_reasons` is empty.
- `persistent_replay_validated` is false for every FAIL artifact.
- A PASS result with non-empty failure reasons is internally invalid and must be rejected by artifact validation rather than converted to PASS.
- `replay_run_root_sha256` is populated only when expected and actual values are both non-null, equal, and `replay_run_root_match` is true.
- `replay_run_root_sha256` is null for mismatches or unavailable roots.
- `replay_run_root_sha256_expected` and `replay_run_root_sha256_actual` are always preserved when available, including FAIL artifacts.
- FAIL artifacts preserve every `replay_failure_reasons` entry.
- FAIL artifacts preserve completed segment diagnostics, source/component counts, first/last metadata, and all available hash values.
- Early FAIL results such as `RUN_DIR_MISSING` are still artifact-capable because `_result(...)` returns a complete `EvidenceReplayResult`.
- `replay_segment_count` must equal the number of `replay_segments` items.

Recommended `validate_replay_artifact_dict` invariants:

- Required constants match exactly.
- Status is PASS or FAIL.
- `persistent_replay_validated` matches status/failure semantics.
- PASS has no failure reasons.
- PASS has matching event counts, zero writer errors, zero drops, zero malformed lines, continuity true, deterministic order true, hash verified true, and run-root match true.
- Canonical `replay_run_root_sha256` follows expected/actual match rules.
- Every non-claim value is false.
- Required limitations match the V1 constants.

The helper should return validation error codes for tests and future E-L loading. It should not mutate the artifact or reinterpret a replay result.

## 7. Output Path Policy

### 7.1 Default and explicit behavior

- Running without `--output` remains stdout-only and creates no artifact.
- Artifact writing occurs only when `--output <path>` is explicitly supplied.
- `--output` should identify the final JSON file path, not an implicit directory.
- The implementation may create the explicit output parent directory after path safety checks pass.
- The implementation must not silently rewrite the operator's explicit path or filename.

Recommended location:

```text
backend/replay_results/
```

Recommended filename:

```text
replay_result_<phase_id>_<run_id>.json
```

Example:

```text
backend/replay_results/replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

### 7.2 Filename sanitation

`sanitize_replay_artifact_filename(...)` should:

- Use `UNKNOWN_PHASE` when phase ID is null/empty.
- Use `UNKNOWN_RUN` when run ID is null/empty.
- Preserve ASCII letters, digits, dot, underscore, and hyphen.
- Replace all other character runs with `_`.
- Strip leading/trailing dots, underscores, and spaces from components.
- Apply a reasonable component or full filename length cap.
- Return a filename ending in `.json`.

The sanitizer generates the recommended filename for callers and tests. It must not override an explicit CLI output filename.

### 7.3 Source-run containment check

Before creating output directories or files:

1. Resolve the replay target directory using `Path(result.run_dir).resolve(strict=False)`.
2. Resolve the requested output path using `Path(output_path).resolve(strict=False)` so existing symlinked parents are accounted for.
3. Reject when the output equals the run directory.
4. Reject when the run directory appears in `output.parents`.
5. Perform the same check for the temporary path by creating it in the already approved output parent.

The check must work with Windows and Raspberry Pi paths and must not depend on string-prefix comparison. `C:\run2` is not a descendant of `C:\run`; path-parent membership avoids that error.

### 7.4 Atomic write

Recommended write sequence:

1. Validate output containment.
2. Create the destination parent if needed.
3. Build and validate the artifact dictionary.
4. Create a uniquely named temporary file in the destination directory.
5. Serialize UTF-8, indented, sorted-key JSON with a trailing newline.
6. Flush and call `os.fsync` on the temporary file.
7. Close the file.
8. Use `os.replace(temp_path, final_path)` for same-filesystem replacement.
9. Remove the temporary file in `finally` when replacement did not complete.

A unique temporary filename is safer than a fixed `<name>.tmp` for concurrent or interrupted offline replay commands. Because the temporary file and final artifact share a directory, replacement remains on the same filesystem.

Directory fsync is not required for V1 because it is not uniformly portable across Windows and Raspberry Pi. File fsync plus same-directory `os.replace` matches the repository's existing practical durability level.

### 7.5 Git and evidence boundary

`.gitignore` currently ignores only `backend/evidence/` for persistent runtime evidence. E-K implementation should add:

```gitignore
# NOVA SC generated replay result artifacts
backend/replay_results/
```

Generated replay artifacts should remain outside Git by default. Documentation may reference artifact path, run ID, replay status, event/segment counts, and verified hash values without committing generated artifact files.

Artifact writing must never modify:

- `manifest.json`
- `summary.json`
- `integrity.json`
- `events_*.ndjson`
- Any other file inside the replay target run directory

## 8. CLI Design for E-K

Add one parser argument:

```python
parser.add_argument(
    "--output",
    help="Write a versioned replay-result artifact to this explicit JSON file path",
)
```

Current CLI findings:

- `--run-dir` is required.
- `--json` is accepted, but compact JSON is already the default output, so it is currently behaviorally redundant.
- `--pretty` selects indented stdout JSON.
- The result is always printed to stdout.
- `--strict` is accepted but strict behavior is already the default.
- `--allow-drops-warning` is reserved and does not currently weaken strict handling.
- Exit code is `0` for PASS and `1` for FAIL.

Required E-K behavior:

- Without `--output`, keep existing output and exit behavior unchanged.
- `--json` and `--pretty` must continue printing replay result JSON to stdout.
- `--output` writes the normalized artifact in addition to current stdout output.
- A PASS result with successful artifact writing returns `0`.
- A FAIL result should still write a FAIL artifact when a structured result exists, then return `1`.
- An output containment rejection returns `1` and writes an actionable message to stderr.
- An artifact build, validation, directory creation, serialization, fsync, or replace failure returns `1` and writes an actionable message to stderr.
- Artifact write failure must not hide the replay result; stdout should still contain the normal result JSON when practical.
- Artifact write failure must not modify the replay verdict object.
- `--output` does not imply backend integration, frontend integration, archive certification, or any control readiness claim.

Recommended `main(...)` order:

```text
parse arguments
-> replay evidence
-> print current stdout result
-> if --output: build, validate, and atomically write artifact
-> if artifact write failed: print stderr and return 1
-> otherwise return 0 for replay PASS, 1 for replay FAIL
```

## 9. Implementation Functions to Add

### `build_replay_result_artifact`

```python
def build_replay_result_artifact(
    result: EvidenceReplayResult,
) -> dict[str, object]:
```

Responsibilities:

- Map the result into exact V1 field names.
- Add constants, generation UTC, limitations, and non-claims.
- Derive `persistent_replay_validated` only from PASS plus empty failures.
- Derive canonical `replay_run_root_sha256` only from a verified expected/actual match.
- Preserve FAIL diagnostics.
- Avoid filesystem writes.

### `write_replay_result_artifact`

```python
def write_replay_result_artifact(
    result: EvidenceReplayResult,
    output_path: str | Path,
) -> Path:
```

Responsibilities:

- Resolve and enforce output containment policy.
- Build and validate the artifact.
- Create the approved parent directory.
- Write through a unique same-directory temporary file.
- Flush, fsync, and atomically replace the final path.
- Return the final resolved path.
- Clean up temporary files after failures.
- Raise a focused exception with an actionable message; `main` handles stderr/exit code.

### `validate_replay_artifact_dict`

```python
def validate_replay_artifact_dict(
    artifact: Mapping[str, object],
) -> list[str]:
```

Responsibilities:

- Validate required constants, keys, basic types, and cross-field invariants.
- Return stable error codes for unit tests and future E-L integration.
- Return an empty list for a valid PASS or FAIL V1 artifact.
- Never mutate the artifact.

This is not a replacement for a future formal JSON Schema, but it gives E-K and E-L one shared invariant definition.

### `sanitize_replay_artifact_filename`

```python
def sanitize_replay_artifact_filename(
    phase_id: str | None,
    run_id: str | None,
) -> str:
```

Responsibilities:

- Produce the recommended filesystem-safe filename.
- Handle null and hostile components deterministically.
- Remain path-component only; never return parent directories.

### Recommended private helpers

```python
def _assert_output_outside_run_dir(run_dir: str | Path, output_path: str | Path) -> None:
    ...

def _atomic_write_replay_artifact(path: Path, artifact: Mapping[str, object]) -> None:
    ...
```

These functions belong in `backend/evidence_replay.py` for E-K. Importing the writer's private `_atomic_write_json` would create unnecessary coupling between source evidence writing and replay-result output.

## 10. Test Plan for E-K Implementation

The existing replay tests are the correct home for E-K coverage. They use standard `unittest`, `TemporaryDirectory`, real writer-generated evidence, JSON helper functions, and source file fingerprints.

### 10.1 Fixture strategy

Reuse:

- `sample_packet(...)` for canonical packet input.
- `create_evidence_run(...)` for finalized PASS fixtures.
- `load_json(...)` and `write_json(...)` for controlled fixture corruption.
- `file_fingerprints(...)` to prove source evidence immutability.
- Existing failure mutations for hash mismatch, malformed lines, count mismatch, writer errors, and drops.

No test should use repository runtime evidence under `backend/evidence/`.

### 10.2 Required tests

| Test | Required assertions |
|---|---|
| Build artifact from PASS result | Schema version, artifact type, generator, validation scope, status, IDs, counts, and timestamps are correct |
| PASS artifact validation flag | `persistent_replay_validated` is true only for PASS with empty failures |
| FAIL artifact validation flag | FAIL preserves status/reasons and sets `persistent_replay_validated` false |
| PASS canonical run root | `replay_run_root_sha256` equals matching expected/actual value |
| FAIL root diagnostics | Expected/actual values remain present and canonical matched root is null |
| Required limitations | Exact six strings are present in required order |
| Required non-claims | Exact seven keys exist and every value is false |
| Segment mapping | Segment count and every bounded segment field are preserved |
| Aggregate mapping | Source/component counts and first/last metadata are preserved |
| Artifact validator accepts PASS | Returns no errors for valid PASS artifact |
| Artifact validator accepts FAIL | Returns no errors for internally consistent FAIL artifact |
| Artifact validator rejects inconsistent PASS | Detects non-empty failures or false PASS invariants |
| Sanitized filename | Handles normal, null, separator, traversal-like, Unicode, and long components safely |
| Explicit `--output` writes artifact | Final JSON exists outside run directory and parses successfully |
| Output inside source run rejected | Direct child and nested child paths fail before file creation |
| Symlinked output parent containment | Where platform support permits, resolved descendant is rejected |
| Atomic write success | Final file exists, parses, and no temporary file remains |
| Atomic replace failure | Final partial artifact is absent/unchanged and temporary file is cleaned where practical |
| Artifact write failure exit | `main(...)` returns nonzero and emits actionable stderr |
| Default stdout unchanged | No output file is created and compact result JSON still prints |
| `--pretty` stdout unchanged | Indented result JSON still prints |
| PASS CLI exit | Returns `0` after successful optional artifact write |
| FAIL CLI exit | Writes FAIL artifact when possible and returns `1` |
| Source evidence immutability | Fingerprints before and after replay/artifact write are identical |
| Git ignore rule | `.gitignore` contains `backend/replay_results/` |
| Writer compatibility | Existing replay run-root helper still matches writer algorithm |

### 10.3 CLI test approach

The current test suite does not test `main(...)`. The lowest-complexity extension is direct invocation rather than subprocess:

- Import `main`.
- Use `contextlib.redirect_stdout` and `redirect_stderr` with `io.StringIO`.
- Pass an explicit argument list.
- Assert exit code and parse stdout JSON.
- Inspect the output artifact when supplied.
- Mock the atomic-write helper for deterministic write-failure tests.

One optional subprocess smoke test may validate `python -m evidence_replay`, but direct `main(...)` tests should carry the detailed matrix and remain cross-platform.

### 10.4 Atomicity test constraints

Permission-based failures are unreliable across Windows and Raspberry Pi. Prefer mocking `os.replace` or the local atomic helper to force a failure. Assert that:

- Existing final artifacts are not truncated.
- A new final artifact is not exposed partially.
- Temporary files are removed in `finally` where practical.
- Source evidence fingerprints remain unchanged.

## 11. Backward Compatibility

E-K must preserve these contracts:

- Existing `python -m evidence_replay --run-dir <path>` usage continues to work.
- Existing compact stdout JSON remains the default.
- Existing `--json` and `--pretty` behavior remains available.
- Existing PASS exit code remains `0`.
- Existing FAIL exit code remains `1`.
- Existing `--strict` and reserved `--allow-drops-warning` flags are not redefined by E-K.
- Existing `EvidenceReplayResult` and `EvidenceReplaySegmentResult` fields are not removed or renamed.
- Existing `to_dict()` and `to_json()` output remains unchanged.
- Existing replay tests remain passing.
- Evidence writer behavior and schemas do not change.
- Frontend types, store, report builder, and export panel do not change in E-K.
- Firmware and command/control behavior do not change.

The artifact is an additive wrapper. It must not replace the current replay result or turn artifact generation into a prerequisite for CLI replay.

## 12. Risks and Mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Artifact accidentally written inside evidence run | Source evidence directory is changed and read-only boundary is violated | Resolve paths and reject equality/descendant containment before any mkdir or write |
| Stale artifact mismatched with evidence | Report may associate replay PASS with the wrong run | Preserve phase/run IDs, target path, event/segment counts, and root values; require identity checks in E-L |
| Schema drift | Backend/frontend consumers interpret fields inconsistently | Version schema as `1.0`, validate constants and invariants, add compatibility tests |
| FAIL artifact accidentally shown as PASS | Unsupported validation claim | Preserve status exactly; derive validated boolean strictly; validator rejects inconsistent PASS |
| Unsupported future schema version | Silent misinterpretation | Exact version check; future E-L fails closed on unknown versions |
| Windows/Pi path differences | False containment decisions or unusable filenames | Use `pathlib` resolved parents, not string prefixes; sanitize only filename components; test both path styles where possible |
| Generated artifact accidentally committed | Runtime evidence metadata enters source history unintentionally | Add `backend/replay_results/` to `.gitignore` first |
| Stdout behavior regression | Existing scripts break | Keep result printing and serialization unchanged; add direct CLI regression tests |
| Atomic write leaves a partial file | Later report loader consumes corrupt artifact | Unique same-directory temp file, fsync, `os.replace`, cleanup on failure |
| Two commands target same output | Last writer replaces earlier artifact | Unique temp files prevent temp collision; explicit final path makes overwrite visible/operator-controlled |
| Absolute target path leaks into report | Host filesystem details are exposed | Artifact preserves replay context; future E-L sanitizes paths before report exposure |
| Artifact itself is altered later | Plain JSON may no longer reflect original output | Do not claim attestation or tamper-proof storage; future integrity/signing is separate scope |

## 13. Recommended Implementation Sequence

1. Update `.gitignore` with `backend/replay_results/`.
2. Add artifact schema, type, generator, scope, limitation, and non-claim constants to `backend/evidence_replay.py`.
3. Add `build_replay_result_artifact(...)`.
4. Add `validate_replay_artifact_dict(...)` and stable validation error codes.
5. Add `sanitize_replay_artifact_filename(...)`.
6. Add resolved output-path containment validation.
7. Add the unique temporary-file atomic JSON write helper.
8. Add `write_replay_result_artifact(...)`.
9. Extend the CLI parser with `--output` while preserving stdout behavior.
10. Add artifact builder, validator, filename, path safety, atomicity, and CLI tests.
11. Run replay tests.
12. Run combined writer and replay tests.
13. Run backend compile checks.
14. Verify `git diff --check`.
15. Verify `git status --short` and confirm only expected E-K files changed.
16. Commit E-K only after review and explicit approval.

Recommended verification commands for the future implementation:

```text
python -m unittest test_evidence_replay.py
python -m unittest test_evidence_writer.py test_evidence_replay.py
python -m compileall backend
git diff --check
git status --short
```

## 14. Acceptance Criteria for E-K

Phase E-K implementation is accepted only if:

- Artifact schema V1 is implemented with every required field and constant.
- `--output` writes a valid replay-result JSON artifact to an explicit path.
- Default replay CLI behavior remains stdout-only.
- Existing compact and pretty stdout serialization remains unchanged.
- PASS artifacts set `persistent_replay_validated` true only under exact PASS/empty-failure rules.
- FAIL artifacts set it false and preserve all available failure and hash diagnostics.
- Canonical run-root SHA-256 is populated only for a verified match.
- Required limitations and non-claims are embedded and tested.
- Output equal to or inside the source evidence run is blocked before any write.
- Artifact writes are atomic at the practical repository standard.
- Failed artifact writes return nonzero and emit actionable stderr.
- `backend/replay_results/` is ignored by Git.
- Runtime evidence fingerprints remain unchanged in tests.
- No runtime evidence artifact is moved, copied, compressed, deleted, or rewritten.
- Existing `EvidenceReplayResult` fields and stdout serialization remain compatible.
- Existing writer behavior remains unchanged.
- Frontend remains untouched.
- Firmware, RTC authority, GPIO, PWM, PCA9685, FRAM, and command/control behavior remain untouched.
- Replay tests pass.
- Combined writer and replay tests pass.
- Backend compile checks pass.
- `git diff --check` passes for the E-K changes.

## 15. Final Recommendation

The repository is ready for Phase 7.2G-E-K implementation.

The existing verifier already supplies the full bounded result needed by Artifact V1, and the existing tests provide realistic finalized fixtures plus read-only fingerprint validation. The evidence writer provides a proven serialization and atomic replacement pattern. No architectural blocker was found.

The missing Git hygiene rule is straightforward and should be the first E-K implementation change:

```gitignore
backend/replay_results/
```

Final recommendation:

```text
PROCEED_TO_PHASE_7_2G_E_K_IMPLEMENTATION
```

Safety and scope confirmation:

- This investigation creates documentation only.
- It does not implement the artifact schema or `--output`.
- It does not create a replay-result artifact.
- It does not modify backend, frontend, firmware, or tests.
- It does not access or alter runtime evidence.
- It does not make frontend integration, tamper-proof, attestation, archive-certification, FRAM, clinical-readiness, or actuator/control-readiness claims.
