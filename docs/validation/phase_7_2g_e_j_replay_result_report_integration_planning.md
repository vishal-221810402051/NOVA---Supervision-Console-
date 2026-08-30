# Phase 7.2G-E-J — Replay Result Report Integration Planning

## 1. Executive Summary

Phase 7.2G-E-J defines how validated backend/offline persistent evidence replay results should be integrated into NOVA SC validation reports and the supervisory report-export workflow. This is an architecture and planning phase only. It does not implement replay-result serialization, backend ingestion, frontend display, or report export changes.

The validated baseline entering this phase is:

| Capability | Status |
|---|---|
| Backend persistent evidence writing | Validated |
| Manifest, summary, and integrity finalization | Validated |
| Segment and run-root SHA-256 verification | Validated |
| Offline persistent evidence replay verifier | Implemented |
| 5-minute persistent evidence replay | PASS |
| 1-hour persistent evidence replay | PASS |
| Replay result included in exported supervisory report | Not implemented |

The 1-hour evidence run replayed `44074` events from nine segments. Event-count consistency, deterministic order, filename continuity, malformed-line checks, writer-health checks, segment hashes, and run-root verification all passed.

The recommended architecture is staged. Replay remains an explicit offline operation. The verifier first emits a versioned, machine-readable replay-result artifact outside the immutable evidence run. A backend/report boundary may then validate and expose that artifact as a controlled summary. The frontend may later render only that explicit summary. Neither backend nor frontend may infer persistent replay success from raw evidence, live telemetry, writer finalization, or hash availability alone.

This design also keeps two existing concepts distinct:

- Frontend bounded-event-store replay reconstructs recent supervisory state.
- Backend persistent evidence replay verifies finalized filesystem evidence.

Only the second concept may set persistent replay report fields.

## 2. Objective

The objective of Phase 7.2G-E-J is to establish the safest report-integration architecture before implementation.

This plan defines:

- Report fields for persistent replay validation.
- Where replay results should be stored and how reports should reference them.
- The boundary between the offline replay verifier, backend report summary, frontend state, and report export.
- Exact PASS, FAIL, and PENDING semantics.
- Claim-control rules that prevent unsupported evidence, safety, archive, or readiness claims.
- Failure handling for missing, malformed, inconsistent, or failed replay results.
- Acceptance criteria for future implementation phases.

The phase prepares NOVA SC for a future machine-readable replay-result schema and report integration. It does not implement those changes.

## 3. Current Validated Baseline

NOVA SC has completed the following relevant phases:

| Phase | Result |
|---|---|
| Phase 7.2G-E-F-A — 5-Minute Persistent Evidence Smoke Validation | PASS |
| Phase 7.2G-E-F-B — 1-Hour Persistent Evidence Soak Validation | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED |
| Phase 7.2G-E-H — Persistent Evidence Replay Verifier Implementation | Implemented and tested |
| Phase 7.2G-E-I — Persistent Evidence Replay Validation Run | PASS |

Replay verifier implementation:

- `backend/evidence_replay.py`
- `backend/test_evidence_replay.py`

The existing verifier returns a structured `EvidenceReplayResult` containing run identity, segment continuity, deterministic ordering, replayed event counts, writer errors, persistent drops, malformed-line counts, hash results, run-root results, timestamps, failure reasons, and per-segment results. The CLI currently prints JSON to standard output and returns exit code `0` for PASS or `1` for FAIL. It does not yet write a replay-result artifact.

Validated replay results:

| Field | 5-Minute Evidence | 1-Hour Evidence |
|---|---:|---:|
| `validation_status` | PASS | PASS |
| `segment_count` | 1 | 9 |
| `segment_filename_continuity` | True | True |
| `deterministic_order_verified` | True | True |
| `total_events_replayed` | 3521 | 44074 |
| `summary_events_written` | 3521 | 44074 |
| `writer_errors` | 0 | 0 |
| `persistent_events_dropped` | 0 | 0 |
| `malformed_replay_lines` | 0 | 0 |
| `hash_verified` | True | True |
| `run_root_match` | True | True |
| `failure_reasons` | `[]` | `[]` |

The 1-hour expected and actual run-root SHA-256 values matched:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

The current validated chain is therefore:

```text
write -> finalize -> hash -> replay -> verify
```

Persistent evidence is now write/finalize/hash/replay verified for the documented 5-minute and 1-hour runs. Report integration remains pending.

## 4. Problem Statement

Persistent replay validation currently exists as offline CLI output and Markdown validation evidence. The exported NOVA SC supervisory JSON report does not yet carry the validated offline replay result.

The current runtime/report path has several relevant constraints:

- `backend/evidence_writer.py` reports live writer state and finalization metadata.
- `backend/protocol.py` places persistent evidence writer summary data into gateway health telemetry.
- `frontend/src/store/telemetryStore.ts` stores that live summary from gateway packets.
- `frontend/src/state/reportBuilder.ts` exports the persistent evidence summary.
- The current frontend type restricts `persistent_replay_validated` to `false` and replay status to `NOT_VALIDATED` or `PENDING_SOAK_VALIDATION`.
- The report builder deliberately resets persistent replay to unvalidated rather than inferring success.
- The report already contains `replay_snapshot`, `replay_validation_result`, and `live_vs_replay_summary` for bounded frontend event-store reconstruction. Those fields are not persistent evidence replay results.

Report users need an explicit persistent replay section that answers:

- Was offline persistent replay performed?
- Which evidence run was replayed?
- Did it pass, fail, or remain pending?
- How many segments and events were checked?
- Did event counts, hashes, and the run root match?
- Were malformed lines, writer errors, or dropped persistent events found?
- What limitations still apply?

Integration must not turn file-integrity verification into a claim of tamper-proof storage, cryptographic attestation, production archive certification, clinical readiness, or actuator/control readiness.

## 5. Integration Design Options

### Option A — Manual Documentation Only

Replay results remain in validation Markdown reports such as Phase 7.2G-E-I.

| Criterion | Assessment |
|---|---|
| Benefits | No runtime changes; simple review trail; preserves current evidence boundary |
| Risks | Exported reports remain incomplete; manual transcription can drift; automation cannot reliably consume the result |
| Implementation complexity | Low |
| Safety impact | Low, provided claims remain manually controlled |
| Decision | Recommended only as the current interim state; not recommended as the final integration architecture |

### Option B — Backend Replay Result JSON Artifact

The offline verifier writes a versioned `replay_result.json` artifact to an explicit operator-selected output location. The artifact references the replay target and contains a normalized summary of `EvidenceReplayResult`.

| Criterion | Assessment |
|---|---|
| Benefits | Machine-readable; deterministic; testable; preserves offline execution; creates a clear provenance boundary |
| Risks | Stale or mismatched artifacts if run identity is not checked; accidental evidence-directory modification if output location is not constrained; artifact authenticity is not guaranteed by plain JSON |
| Implementation complexity | Low to medium |
| Safety impact | Low when output is separate from runtime evidence and strict schema validation is used |
| Decision | Recommended as the next implementation step and source of truth for report integration |

### Option C — Backend Report Integration

The backend/report layer loads an explicitly configured replay-result artifact, validates its schema and run identity, and exposes a controlled replay summary for report construction.

| Criterion | Assessment |
|---|---|
| Benefits | Centralizes validation and claim rules; keeps filesystem access out of the frontend; supports consistent report fields |
| Risks | A live endpoint could present stale data if artifact selection is ambiguous; automatic discovery could associate the wrong replay result; backend startup must not trigger replay |
| Implementation complexity | Medium |
| Safety impact | Low when loading is explicit, read-only, fail-closed, and independent of telemetry control paths |
| Decision | Recommended after the artifact schema is stable; backend-only summary integration should precede frontend work |

### Option D — Frontend Report Panel Integration

The frontend receives a validated replay summary from a controlled backend/report source and displays it in the report-export panel and exported JSON.

| Criterion | Assessment |
|---|---|
| Benefits | Makes PASS/FAIL/PENDING visible to report users; includes replay evidence in normal export workflow |
| Risks | Frontend inference could overstate validation; terminology may be confused with bounded event-store replay; stale state could be exported without artifact identity |
| Implementation complexity | Medium |
| Safety impact | Low if the frontend is display-only and never reads raw evidence or computes the verdict |
| Decision | Recommended only after Options B and C are implemented and validated |

The options form a staged architecture rather than mutually exclusive alternatives. Option A remains the interim baseline. Options B, C, and D should be implemented in that order.

## 6. Recommended Architecture

Recommended phase sequence:

| Phase | Scope |
|---|---|
| Phase 7.2G-E-J | Planning only |
| Phase 7.2G-E-K | Define and validate replay-result artifact schema |
| Phase 7.2G-E-L | Backend-only replay-result report summary integration |
| Phase 7.2G-E-M | Frontend report-export integration |
| Later phases | Longer soak validation after replay/report pipeline stability |

Preferred data flow:

```text
Finalized read-only evidence run
              |
              v
Offline evidence_replay verifier
              |
              v
Versioned replay_result.json in a separate output location
              |
              v
Backend schema and run-identity validation
              |
              v
Controlled persistent replay report summary
              |
              v
Frontend display and supervisory JSON export
```

Architecture rules:

- Replay execution remains offline and operator initiated in the first integration version.
- `evidence_replay.py` may gain an explicit `--output` argument in Phase E-K.
- The output path must not default inside the replay target evidence directory.
- A separate ignored runtime location such as `backend/replay_results/` is preferred, or the operator may supply another explicit path.
- The replay artifact is the only source that may set `persistent_replay_validated` to `true`.
- The backend validates artifact schema, status, identity, and required invariants before exposing a summary.
- The backend does not scan raw NDJSON to infer report status.
- The frontend receives a normalized summary and remains display-only.
- The frontend does not start replay, discover evidence directories, or inspect hashes itself.
- A report without a validated artifact reports PENDING or NOT_VALIDATED, never inferred PASS.

The replay artifact should include a schema version, verifier version or backend commit where available, replay generation timestamps, target run identity, normalized validation fields, and failure reasons. It should preserve the strict verdict produced by the verifier without frontend reinterpretation.

## 7. Proposed Replay Result Report Fields

The future report should add a dedicated `persistent_replay_summary` object. It must remain distinct from the existing frontend `replay_snapshot` and `replay_validation_result` fields.

Required fields:

| Field | Type | Meaning |
|---|---|---|
| `persistent_replay_validated` | boolean | True only when an explicit, schema-valid artifact reports PASS and all strict acceptance checks pass |
| `replay_validation_status` | `PASS` \| `FAIL` \| `PENDING` | Exact persistent replay report state |
| `replay_phase_id` | string or null | Phase ID recorded by the replay artifact |
| `replay_run_id` | string or null | Evidence run ID verified by replay |
| `replay_result_generated_utc` | string or null | Artifact generation/completion UTC timestamp |
| `replay_target_run_dir` | string or null | Sanitized backend-relative replay target reference; never a required host-absolute path |
| `replay_segment_count` | number or null | Number of replayed evidence segments |
| `replay_total_events` | number or null | Total NDJSON events replayed |
| `replay_summary_events_written` | number or null | Writer summary count compared by replay |
| `replay_malformed_lines` | number or null | Malformed NDJSON lines detected |
| `replay_hash_verified` | boolean or null | Segment/file-integrity verification result |
| `replay_run_root_match` | boolean or null | Expected and actual run-root comparison |
| `replay_run_root_sha256` | string or null | Verified run-root SHA-256 when available and matched |
| `replay_failure_reasons` | string[] | Verifier or artifact-validation failure reasons |
| `replay_validation_scope` | string | Explicit description such as `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` |
| `replay_validation_limitations` | string[] | Claim and evidence limitations carried into the report |

Recommended supporting artifact fields:

| Field | Purpose |
|---|---|
| `replay_result_schema_version` | Enables strict parsing and future migration |
| `replay_verifier_version` | Identifies verifier implementation or release |
| `replay_started_utc` | Preserves verifier start time |
| `replay_completed_utc` | Preserves verifier completion time |
| `replay_segment_filename_continuity` | Exposes continuity check explicitly |
| `replay_deterministic_order_verified` | Exposes deterministic ordering check explicitly |
| `replay_writer_errors` | Preserves writer-health evidence checked by replay |
| `replay_persistent_events_dropped` | Preserves persistent-drop evidence checked by replay |
| `replay_run_root_sha256_expected` | Supports diagnosis without changing verdict |
| `replay_run_root_sha256_actual` | Supports diagnosis without changing verdict |
| `replay_artifact_path` | Sanitized backend-relative artifact reference |

For PASS, `replay_run_root_sha256` should be the verified value after expected/actual equality. For FAIL, expected and actual values may be exposed separately for diagnosis, but the canonical matched value should be null.

## 8. Claim Control Rules

The report may use the following claims only when all conditions are true:

- A replay artifact exists.
- Its schema and required fields are valid.
- Its target `run_id` and `phase_id` are internally consistent.
- `validation_status` is exactly PASS.
- `failure_reasons` is empty.
- Segment filename continuity is true.
- Deterministic ordering is verified.
- Replayed and summary event counts match.
- Malformed replay lines equal zero.
- Writer errors equal zero.
- Persistent events dropped equal zero under the strict V1 policy.
- Hash verification is true.
- Run-root match is true.

Allowed PASS claims:

- Persistent replay validated.
- Replay hash verification passed.
- Replay event-count consistency verified.
- Replay segment continuity verified.
- Deterministic replay order verified.

The report must never claim:

- Tamper-proof evidence.
- Cryptographic attestation.
- Production archive certification.
- Chain-of-custody certification.
- Clinical readiness.
- Actuator/control readiness.
- FRAM validation.
- GPIO readiness.
- PWM readiness.
- PCA9685 readiness.
- Safety-interlock or fail-safe validation.

Hash verification supports detection of changes relative to recorded metadata. It does not establish who created the files, prevent modification, or provide independent attestation.

## 9. Report UX / Export Behavior

The report export should present a dedicated persistent replay section with a clear status banner and evidence summary.

Required display behavior:

| Status | Display behavior |
|---|---|
| PASS | Show validated status, target run, phase, event count, segment count, count consistency, hash result, run-root result, and limitations |
| FAIL | Show failed status prominently, target identity if known, all failure reasons, failed checks, and limitations |
| PENDING | Show that persistent replay has not been validated for the selected evidence run and identify the required next action |

The exported report should include:

- Replay status.
- Replay target evidence run ID and phase ID.
- Replay-result generation UTC.
- Replayed event count.
- Segment count.
- Segment continuity and deterministic-order results.
- Summary event-count comparison.
- Malformed-line count.
- Writer error and persistent-drop counts.
- Segment hash result.
- Run-root result and verified SHA-256 when PASS.
- Failure reasons when present.
- Validation limitations.
- Safety boundary.

Terminology must be explicit:

- `Frontend Replay Reconstruction` refers to bounded browser event-store replay.
- `Persistent Evidence Replay` refers to the backend/offline verifier and artifact.

The frontend panel should avoid a generic label such as `Replay: PASS`, because that would blur the two mechanisms. It should display `Persistent Evidence Replay: PASS`, `FAIL`, or `PENDING`.

## 10. Backend Boundary

Backend integration rules:

- No live hardware is required to create or validate a replay-result artifact.
- No firmware changes are required.
- Evidence writer behavior remains unchanged unless a later approved phase identifies a narrowly scoped metadata requirement.
- Report integration must not automatically start or stop replay.
- Backend startup must not scan or replay raw evidence directories.
- The backend must not mark replay validated unless an explicit replay-result artifact exists and passes schema and strict-policy checks.
- Artifact selection must be explicit through configuration, request input, or another controlled mechanism.
- The backend must compare the artifact target identity with the run identity it reports.
- Invalid, unknown-version, unreadable, or mismatched artifacts must fail closed to FAIL or PENDING according to whether validation was attempted.
- Replay-result loading must remain read-only.
- Replay-result handling must remain isolated from serial ingestion, WebSocket broadcast, RTC sync, and command/control paths.

The existing gateway health persistent evidence summary describes writer state. It must not be treated as proof that offline replay passed. Writer finalization and hash availability are prerequisites for replay, not replay validation themselves.

## 11. Frontend Boundary

Frontend integration rules:

- The frontend must not read raw NDJSON files.
- The frontend must not enumerate evidence directories.
- The frontend must not calculate segment or run-root hashes.
- The frontend must not infer replay success from `finalized`, `hash_finalized`, `persistent_hash_available`, event counts, or writer health.
- The frontend must only render validated replay summary fields supplied through a controlled report/backend contract.
- The frontend must preserve the backend/artifact PASS, FAIL, or PENDING state exactly.
- The frontend may format values for display but must not upgrade or downgrade the verdict.
- Missing replay data must display PENDING or NOT_VALIDATED, not PASS.
- No control or actuator UI work belongs in this integration.
- No GPIO, PWM, PCA9685, or FRAM behavior belongs in this integration.

The existing `PersistentEvidenceSummary` type currently encodes `persistent_replay_validated: false` and a two-state replay status. A future phase should replace or supplement that limited writer-health shape with a dedicated persistent replay summary supporting PASS, FAIL, and PENDING.

## 12. Runtime Evidence Handling Rules

Runtime evidence handling must follow these rules:

- `backend/evidence/` remains outside Git.
- Runtime evidence files remain read-only replay inputs.
- Report integration references replay summaries and artifacts; it does not edit source evidence.
- Replay-result output must use an explicit location separate from the immutable target evidence directory.
- No raw NDJSON is bundled into exported supervisory reports by default.
- Reports may include sanitized relative references, run IDs, counts, hashes, and validation summaries.
- Reports must not expose unnecessary host-absolute paths.
- Artifact generation must not rename, move, copy, compress, truncate, or rewrite source evidence.
- Evidence cleanup, retention, archival, signing, and access control remain separate future concerns.

## 13. Failure Handling Plan

V1 should retain the replay verifier's strict policy. Writer errors or persistent drops are failures rather than warnings.

| Condition | Report status | Required behavior |
|---|---|---|
| Replay artifact missing | PENDING | State that replay has not been validated; do not infer from writer metadata |
| Replay artifact unreadable or schema invalid | FAIL | Show artifact/schema failure reason and suppress validated claim |
| Unsupported artifact schema version | FAIL | Show unsupported-version reason; require compatible verifier/integration |
| Replay artifact reports FAIL | FAIL | Preserve and display all verifier failure reasons |
| Artifact run identity mismatches selected evidence run | FAIL | Show identity mismatch; do not merge data |
| Segment filename continuity false | FAIL | Show continuity failure |
| Deterministic order not verified | FAIL | Show ordering failure |
| Hash mismatch | FAIL | Show hash failure and expected/actual diagnostic values when available |
| Run-root mismatch | FAIL | Show run-root failure and expected/actual diagnostic values when available |
| Malformed lines greater than zero | FAIL | Show malformed-line count |
| Replayed event count differs from summary count | FAIL | Show both counts and mismatch reason |
| Writer errors greater than zero | FAIL | Show writer error count under strict V1 policy |
| Persistent events dropped greater than zero | FAIL | Show drop count under strict V1 policy |
| Failure reasons non-empty while status says PASS | FAIL | Treat artifact as internally inconsistent |
| Frontend report generated before replay | PENDING | Export an explicit pending section and required next action |

If a later phase introduces a warning policy, it must use a new policy/version field and must not silently reinterpret artifacts produced under strict V1 rules.

## 14. Implementation Dependencies

Future implementation depends on:

- `backend/evidence_replay.py` and its structured `EvidenceReplayResult`.
- `backend/test_evidence_replay.py` coverage for strict replay outcomes.
- Stable replay-result serialization and schema versioning.
- Documented 5-minute and 1-hour replay outputs from Phase 7.2G-E-I.
- `backend/evidence_writer.py` persistent evidence metadata and run identity.
- `backend/main.py` application lifecycle and controlled summary ownership.
- `backend/hardware_stream_manager.py` non-blocking telemetry ownership boundary.
- `backend/protocol.py` gateway/report summary contract if backend transport exposure is selected.
- `frontend/src/types/telemetry.ts` report and persistent evidence types.
- `frontend/src/store/telemetryStore.ts` controlled state ingestion.
- `frontend/src/state/reportBuilder.ts` `NovaScValidationReport` structure and JSON serialization.
- `frontend/src/components/ReportExportPanel.tsx` report-export presentation.
- Tests for artifact serialization, backend validation, frontend type handling, report construction, and PASS/FAIL/PENDING rendering.

No dependency requires firmware, RTC authority, actuator, GPIO, PWM, PCA9685, or FRAM changes.

## 15. Future Implementation Plan

### Phase 7.2G-E-K — Replay Result Artifact Schema

- Define a versioned replay-result schema.
- Map `EvidenceReplayResult` fields into the artifact without weakening strict semantics.
- Add an optional explicit `--output` argument to the replay CLI.
- Require a separate output location from the target evidence run.
- Write the artifact atomically.
- Add tests for PASS and FAIL artifacts, output failures, deterministic serialization, and source evidence immutability.
- Generate replay artifacts for the validated 5-minute and 1-hour runs.

### Phase 7.2G-E-L — Backend-Only Report Summary Integration

- Add backend schema/type support for the replay artifact.
- Load only an explicitly selected artifact.
- Validate schema version, required fields, strict invariants, and run identity.
- Produce a controlled `persistent_replay_summary`.
- Keep replay execution manual/offline.
- Keep artifact and evidence access read-only.
- Add backend tests for missing, PASS, FAIL, malformed, mismatched, and unsupported artifacts.

### Phase 7.2G-E-M — Frontend Report Export Integration

- Add frontend replay summary types with PASS, FAIL, and PENDING.
- Ingest only the backend-validated summary.
- Add the summary to `NovaScValidationReport`.
- Update `reportBuilder` to preserve status exactly.
- Update `ReportExportPanel` to display persistent replay status distinctly from frontend replay reconstruction.
- Display failure reasons and limitations.
- Validate report output against 5-minute and 1-hour replay artifacts.

Longer 6-hour or 24-hour soak validation should proceed only after artifact generation, backend validation, frontend export, and report semantics are stable.

## 16. Acceptance Criteria for Future Integration

Future replay-result report integration passes only if:

- A dedicated persistent replay section appears in the exported report.
- Report status matches the validated replay artifact exactly.
- PASS, FAIL, and PENDING states are all implemented and tested.
- Missing artifacts produce PENDING rather than inferred PASS.
- Failure reasons are retained and displayed.
- Validation limitations are retained and displayed.
- Run ID and phase ID are checked before integration.
- Event and segment counts match the artifact.
- Hash and run-root results match the artifact.
- Frontend bounded replay and persistent evidence replay remain clearly distinguished.
- No raw evidence file is modified.
- No raw NDJSON is read by the frontend.
- No frontend inference is made from raw evidence or writer-health metadata.
- No replay starts automatically from backend startup or report export.
- No firmware or command/control behavior changes.
- Backend and frontend tests pass.
- Existing evidence writer and replay verifier tests remain passing.
- `git diff --check` passes.

## 17. Safety Boundary

This phase is documentation and planning only.

The plan does not modify or authorize changes to:

- Firmware.
- RTC synchronization behavior.
- Timestamp authority.
- UART command paths.
- GPIO behavior.
- PWM behavior.
- PCA9685 behavior.
- FRAM behavior.
- Motors, servos, steppers, pumps, valves, relays, or heaters.
- Safety interlocks or watchdog behavior.
- Runtime evidence files.

Raspberry Pi backend UTC remains the trusted timestamp authority. Replay-result report integration is evidence reporting only and does not establish clinical readiness, production readiness, archive certification, actuator readiness, or control readiness.

## 18. Final Status

```text
PHASE_7_2G_E_J_REPLAY_RESULT_REPORT_INTEGRATION_PLANNING: READY_FOR_REVIEW
```

Recommended next phase:

```text
Phase 7.2G-E-K — Replay Result Artifact Schema
```
