# Phase 7.2G-E-H — Replay Verifier Pre-Implementation Diagnosis

## 1. Executive Summary

This document diagnoses NOVA SC readiness to move from Phase 7.2G-E-G, persistent evidence replay validation planning, into Phase 7.2G-E-H, persistent evidence replay verifier implementation.

The repository is technically ready to implement a backend-only, read-only replay verifier. The persistent evidence writer schema, manifest format, summary format, integrity format, segment metadata, per-segment SHA-256 behavior, and deterministic run-root hash algorithm are identifiable in `backend/evidence_writer.py`. The 5-minute and 1-hour persistent evidence validation documents provide clear expected replay targets.

However, the Phase 7.2G-E-G planning documents are currently untracked. Under the requested readiness logic, the recommended decision is:

```text
READY_AFTER_DOCUMENTATION_COMMIT
```

The implementation should not begin by modifying live backend integration or frontend report surfaces. Phase 7.2G-E-H should implement an offline/read-only backend replay verifier first, with tests, without modifying runtime evidence files and without claiming replay validation until a later replay validation run passes.

## 2. Repository State Diagnosis

Repository state inspected on 2026-08-03.

| Item | Finding |
|---|---|
| Current HEAD | `a44b6fe Ignore backend runtime evidence artifacts` |
| Current branch | `main` |
| Upstream | `origin/main` |
| Branch status | `main a44b6fe [origin/main]` |
| `git diff --check` | PASS, no output |
| Modified files | None reported by `git status --short` |
| Untracked files/directories | `docs/reports/`, Phase 7.2G-E-G planning docs |

Recent git history:

```text
a44b6fe (HEAD -> main, origin/main) Ignore backend runtime evidence artifacts
e18ec83 Document Phase 7.2G-E-F-B persistent evidence soak validation
8c8fb1c Document Phase 7.2G-E-F-A persistent evidence smoke validation
bb2c2dc Integrate persistent evidence summary into validation reports
d2f08b5 Implement backend persistent evidence writer and hash finalization
1992ee1 Document Phase 7.2G-E-B backend evidence writer plan
e8e641e Document Phase 7.2G-E persistent soak evidence planning
ad75e71 Document Phase 7.2G-D heartbeat gap soak stability diagnosis
8d95b99 Document Phase 7.2G-C one-hour RTC drift validation
2693e5e Phase 7.2G-B prepare one-hour RTC drift validation
26073b3 Document Phase 7.2F-EXT DS3231 cold retention evidence
ebdc431 Phase 7.2G validate RTC drift evidence with hardened baseline
b9a4abf Phase 7.2F add RTC retention evidence UI and report
379e19c Phase 7.2E-5 add RTC sync result UI and report evidence
38e20dc Phase 7.2E-4C add controlled backend RTC sync send path
```

Required file existence checks:

| Path | Exists | Status |
|---|---:|---|
| `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md` | true | Untracked planning doc |
| `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md` | true | Untracked implementation-plan doc |
| `docs/reports/nova_sc_project_status_investigation_for_roadmap.md` | true | Under untracked `docs/reports/` |
| `backend/evidence/` | false locally | Ignored by Git if present |

Git ignore check:

```text
.gitignore:41:backend/evidence/    "backend\\evidence\\soak_runs"
```

Diagnosis:

- Runtime evidence artifacts are protected from Git tracking by `.gitignore`.
- The local laptop workspace does not currently contain `backend/evidence/`.
- Future replay validation must run read-only against evidence in place on the system where evidence exists, likely the Raspberry Pi backend evidence directory.

## 3. Existing Planning Documents

| Document | Exists | Git status | Diagnosis |
|---|---:|---|---|
| `phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md` | true | Untracked | Planning is drafted and ready for review |
| `phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md` | true | Untracked | Implementation plan is drafted and ready for review |
| `nova_sc_project_status_investigation_for_roadmap.md` | true | Untracked under `docs/reports/` | Roadmap status report exists as a working-tree doc |

The Phase 7.2G-E-G planning documents identify the replay verifier scope:

- Read `manifest.json`, `summary.json`, `integrity.json`, and `events_*.ndjson`.
- Recompute per-segment SHA-256.
- Count NDJSON events.
- Compare event counts against segment metadata and summary metadata.
- Recompute deterministic `run_root_sha256`.
- Preserve read-only behavior.
- Avoid replay validation claims until a validation run passes.

Readiness note:

Because the planning and implementation-plan documents are untracked, implementation should wait until documentation is reviewed and committed, unless the user explicitly chooses to proceed from uncommitted planning.

## 4. Replay Implementation File Check

| File | Exists | Required action |
|---|---:|---|
| `backend/evidence_replay.py` | false | Safe to create in Phase 7.2G-E-H after documentation commit |
| `backend/test_evidence_replay.py` | false | Safe to create in Phase 7.2G-E-H after documentation commit |

Expected result was satisfied: replay implementation files do not exist yet.

No existing replay implementation was modified or inspected because no implementation files are present.

## 5. Persistent Evidence Writer Schema Diagnosis

The existing writer baseline is in `backend/evidence_writer.py`.

Relevant constants:

| Constant | Value / meaning |
|---|---|
| `SCHEMA_VERSION` | `phase_7_2g_e_c.v1` |
| `HASH_ALGORITHM` | `SHA-256` |
| `INTEGRITY_SCOPE_FILE_DETECTION` | `file_integrity_detection_only` |
| `REPLAY_STATUS_NOT_VALIDATED` | `NOT_VALIDATED` |
| `REPLAY_STATUS_PENDING_SOAK_VALIDATION` | `PENDING_SOAK_VALIDATION` |

Relevant functions/classes:

| Name | Role for future replay |
|---|---|
| `compute_run_root_sha256(segments)` | Defines deterministic run-root hash algorithm replay must match |
| `inspect_run_finalization_status(run_dir)` | Existing finalization-state inspection helper; useful conceptual baseline |
| `build_persistent_evidence_summary(writer, ...)` | Defines health/report summary fields and non-claims |
| `PersistentEvidenceWriterConfig` | Writer configuration and metadata source |
| `PersistentEvidenceWriter` | Writer lifecycle, queue, segment writing, finalization, hashes |
| `_sha256_file(path)` | Existing per-file SHA-256 behavior |
| `_build_event_record(packet)` | NDJSON event record schema |
| `_build_integrity_document()` | Integrity document schema |
| `_build_summary_document()` | Summary document schema |
| `write_manifest()` | Manifest schema and update behavior |

NDJSON event record schema:

| Field | Source / meaning |
|---|---|
| `schema_version` | Writer schema version |
| `evidence_run_id` | Current evidence run ID |
| `phase_id` | Evidence phase ID |
| `persisted_at_utc` | Writer persistence timestamp |
| `backend_received_utc` | Packet `supervisor_received_utc` or packet timestamp |
| `stream_id` | Canonical telemetry stream ID |
| `source_node_id` | Canonical source node |
| `source_sequence_number` | Source sequence number |
| `global_sequence_number` | Backend global sequence number |
| `event_type` | Canonical telemetry event type |
| `disposition` | Optional event disposition |
| `severity` | Optional event severity |
| `packet` | Full canonical telemetry packet |
| `writer_context` | Segment index, segment filename, writer queue size |

Queue/drop/error behavior:

- `enqueue(packet)` uses a bounded `asyncio.Queue`.
- Queue overflow increments `persistent_events_dropped`.
- Writer exceptions increment `writer_errors`.
- Evidence enqueue exceptions are swallowed by `HardwareStreamManager` so telemetry broadcast continues.

Segment rotation behavior:

- Rotation is checked by elapsed time and byte count.
- Defaults are configured through environment variables, with planned/default values of 10 minutes and 50 MB.
- On rotation, the current segment is closed, a new `events_00000N.ndjson` file is opened, and manifest is updated.

Stop/finalization behavior:

- `stop()` drains the queue, cancels the writer task, flushes, closes the current segment, and calls `_finalize_run()`.
- Repeated stop is idempotent once `finalized` and `hash_finalized` are both true.
- Finalization computes per-segment SHA-256, computes `run_root_sha256`, writes `integrity.json`, writes `summary.json`, and updates `manifest.json`.
- If finalization fails, `writer_errors` increments and `finalized/hash_finalized` are set false.

Zero-event finalization behavior:

- `backend/test_evidence_writer.py` includes `test_zero_event_run_finalizes_without_crashing`.
- A replay verifier should support finalized runs even if segment event counts are zero, though the current validation targets are non-zero hardware runs.

## 6. Manifest/Summary/Integrity Field Inventory

### `manifest.json`

The writer manifest includes:

| Field | Purpose |
|---|---|
| `schema_version` | Writer evidence schema |
| `phase_id` | Evidence phase |
| `evidence_run_id` | Evidence run ID |
| `stream_id` | Stream ID at writer configuration time |
| `start_time_utc` | Run start timestamp |
| `end_time_utc` | Run end timestamp |
| `target_duration_minutes` | Optional target metadata |
| `backend_mode` | Hardware/simulator mode |
| `serial_port` | Serial port metadata |
| `serial_baud` | Serial baud metadata |
| `hardware_connected` | Hardware connection metadata |
| `transport_kind` | Transport metadata |
| `transport_simulated` | Simulation flag |
| `rotation_minutes` | Rotation time threshold |
| `rotation_mb` | Rotation size threshold |
| `flush_interval_seconds` | Flush interval |
| `queue_size` | Writer queue size |
| `persistent_events_written` | Writer count |
| `persistent_events_dropped` | Persistent writer drop count |
| `writer_errors` | Writer error count |
| `segment_count` | Number of segments |
| `segments` | Segment metadata list |
| `run_root_sha256` | Deterministic run-root hash |
| `integrity_filename` | Integrity file name |
| `summary_filename` | Summary file name |
| `finalized` | Finalized flag |
| `hash_finalized` | Hash finalized flag |

### Segment metadata

Segment metadata includes:

| Field | Meaning |
|---|---|
| `filename` | Segment filename |
| `index` | Segment index |
| `start_time_utc` | Segment start timestamp |
| `end_time_utc` | Segment end timestamp |
| `first_global_sequence_number` | First global sequence in segment |
| `last_global_sequence_number` | Last global sequence in segment |
| `event_count` | Number of NDJSON records in segment |
| `byte_count` | Segment byte count |
| `finalized` | Segment finalization flag |
| `sha256` | Segment SHA-256 after finalization |

### `summary.json`

The writer summary includes:

| Field | Meaning |
|---|---|
| `schema_version` | Evidence schema |
| `phase_id` | Evidence phase |
| `evidence_run_id` | Evidence run ID |
| `start_time_utc` | Run start |
| `end_time_utc` | Run end |
| `duration_seconds` | Computed duration |
| `persistent_events_written` | Total written events |
| `persistent_events_dropped` | Persistent evidence drops |
| `writer_errors` | Writer errors |
| `segment_count` | Segment count |
| `first_global_sequence_number` | First sequence across ordered segments |
| `last_global_sequence_number` | Last sequence across ordered segments |
| `finalized` | Finalized flag |
| `hash_finalized` | Hash finalized flag |

### `integrity.json`

The writer integrity document includes:

| Field | Meaning |
|---|---|
| `schema_version` | Evidence schema |
| `phase_id` | Evidence phase |
| `evidence_run_id` | Evidence run ID |
| `algorithm` | `SHA-256` |
| `generated_at_utc` | Integrity generation time |
| `segment_count` | Segment count |
| `segments` | Filename, index, byte count, event count, sha256 |
| `run_root_sha256` | Deterministic run-root hash |
| `hash_finalized` | Hash finalized flag |
| `integrity_scope` | `file_integrity_detection_only` |
| `tamper_proof` | false |
| `cryptographic_attestation` | false |

Replay implication:

The replay verifier should treat `manifest.json`, `summary.json`, `integrity.json`, and all referenced segment files as required inputs. It should fail closed for missing required files, unreadable JSON, hash mismatch, event-count mismatch, and run-root mismatch.

## 7. Run Root Hash Algorithm Diagnosis

The run-root hash is generated by `compute_run_root_sha256(segments)`.

Algorithm behavior:

1. Sort segment metadata by `index`.
2. For each segment, build a line:

```text
{index}:{filename}:{sha256}:{byte_count}:{event_count}
```

3. Join lines with `\n`.
4. SHA-256 hash the UTF-8 encoded joined string.

Replay requirements:

- Recompute each segment SHA-256 from the segment file bytes.
- Confirm byte count while hashing.
- Confirm each segment event count by counting NDJSON lines.
- Build normalized segment metadata with the same `index`, `filename`, `sha256`, `byte_count`, and `event_count` fields.
- Recompute `run_root_sha256` with the same algorithm.
- Compare against manifest and integrity values.

The writer tests include `test_run_root_sha256_is_deterministic_for_segment_metadata`, confirming the algorithm is deterministic independent of input order.

## 8. Backend Integration Boundary

Persistent evidence writer initialization:

- `backend/main.py` reads `NOVA_SC_EVIDENCE_*` environment variables.
- In hardware mode startup, `main.py` constructs `PersistentEvidenceWriterConfig`.
- `main.py` starts `PersistentEvidenceWriter`.
- `main.py` injects `evidence_writer.enqueue` into `HardwareStreamManager` when enabled.
- On shutdown, `main.py` stops/finalizes the writer.

Packet ingestion into writer:

- `HardwareStreamManager._run()` consumes normalized hardware packets from `source_queue`.
- It calls `_enqueue_evidence(packet)` before `_broadcast(packet)`.
- It also enqueues gateway health packets.
- `_enqueue_evidence` catches exceptions so evidence logging does not interrupt telemetry.

Persistent evidence summary exposure:

- `main.py` exposes `persistent_evidence_summary` through `/health`.
- `protocol.py` includes optional `persistent_evidence_summary` inside `GATEWAY_HEALTH_TELEMETRY` payload.

Fields reported through health/gateway summary include:

- `persistent_evidence_enabled`
- `persistent_evidence_active`
- `evidence_run_id`
- `evidence_phase_id`
- `evidence_run_dir`
- `evidence_manifest_path`
- `evidence_integrity_path`
- `evidence_summary_path`
- `evidence_segments_written`
- `persistent_events_written`
- `persistent_events_dropped`
- `persistent_writer_errors`
- `finalized`
- `hash_finalized`
- `run_root_sha256`
- `persistent_hash_available`
- `persistent_replay_validated=false`
- `persistent_replay_validation_status`
- `required_next_action`

Implementation boundary decision:

Phase 7.2G-E-H should be standalone/offline first. It should not be integrated into the live backend health path until the replay verifier passes tests and a replay validation phase proves correctness.

## 9. Frontend/Report Boundary

Current frontend/report persistent evidence fields are defined in `frontend/src/types/telemetry.ts` as `PersistentEvidenceSummary`.

Current fields include:

- `persistent_evidence_enabled`
- `persistent_evidence_active`
- `evidence_run_id`
- `evidence_phase_id`
- `evidence_run_dir`
- `evidence_manifest_path`
- `evidence_integrity_path`
- `evidence_summary_path`
- `evidence_segments_written`
- `persistent_events_written`
- `persistent_events_dropped`
- `persistent_writer_errors`
- `finalized`
- `hash_finalized`
- `run_root_sha256`
- `integrity_scope`
- `tamper_proof=false`
- `cryptographic_attestation=false`
- `persistent_hash_available`
- `persistent_replay_validated=false`
- `persistent_replay_validation_status`
- frontend bounded event-store metadata
- `required_next_action`

Store/report behavior:

- `frontend/src/store/telemetryStore.ts` stores `persistent_evidence_summary` from gateway health telemetry.
- `frontend/src/state/reportBuilder.ts` builds conservative persistent evidence report fields and forces `persistent_replay_validated=false`.
- `frontend/src/components/ReportExportPanel.tsx` includes persistent evidence summary in report export and displays backend evidence enabled/disabled status.

Boundary decision:

Replay result integration should be postponed until after the backend replay verifier passes unit tests and a replay validation run. Phase 7.2G-E-H does not require frontend implementation.

## 10. Validation Evidence Baseline

### 5-minute persistent evidence smoke validation

Source:

```text
docs/validation/phase_7_2g_e_f_a_5_minute_persistent_evidence_smoke_validation.md
```

| Field | Value |
|---|---|
| Phase ID | `PHASE_7_2G_E_F_A` |
| Duration | approximately `395.905995` seconds |
| Segments | `1` |
| Total NDJSON events | `3521` |
| Summary events written | `3521` |
| Writer errors | `0` |
| Persistent events dropped | `0` |
| Run-root SHA-256 | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| Integrity verification | `VALIDATION_RESULT: PASS` |
| Final result | `PASS` |
| Persistent replay validation | NOT CLAIMED |

### 1-hour persistent evidence soak validation

Source:

```text
docs/validation/phase_7_2g_e_f_b_1_hour_persistent_evidence_soak_validation.md
```

| Field | Value |
|---|---|
| Phase ID | `PHASE_7_2G_E_F_B` |
| Runtime | approximately 71 minutes 34 seconds |
| Segments | `9` |
| Total NDJSON events | `44074` |
| Summary events written | `44074` |
| Writer errors | `0` |
| Persistent events dropped | `0` |
| Run-root SHA-256 | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Integrity verification | `VALIDATION_RESULT: PASS` |
| Final result | `PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED` |
| Caveat | Frontend report export before backend shutdown was not captured |
| Persistent replay validation | NOT CLAIMED |

### Replay planning acceptance criteria

Phase 7.2G-E-G planning and implementation-plan documents define the future replay acceptance target for the 1-hour evidence run:

| Acceptance item | Expected value |
|---|---|
| Segment count | `9` |
| Total replayed events | `44074` |
| `summary_events_written` | `44074` |
| Writer errors | `0` |
| Persistent events dropped | `0` |
| Run-root SHA-256 | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| File reads | Read-only |
| Runtime evidence mutation | Not allowed |

## 11. Runtime Evidence Handling Rules

Runtime evidence status:

| Item | Finding |
|---|---|
| `backend/evidence/` exists locally | false |
| `backend/evidence/` ignored by Git | true |
| Runtime evidence tracked by Git | No evidence of tracked runtime artifacts |
| Full NDJSON evidence read during diagnosis | No |

Rules for Phase 7.2G-E-H:

- Do not modify `backend/evidence/`.
- Do not move, copy, compress, delete, or edit runtime evidence files.
- Do not rewrite `manifest.json`, `summary.json`, `integrity.json`, or `events_*.ndjson`.
- The verifier must read evidence in place, read-only.
- The verifier should stream segment files instead of loading all event records into memory.
- The verifier should produce a separate replay result object/report, not mutate original evidence.

## 12. Safety Boundary

Phase 7.2G-E-H requires:

- No firmware changes.
- No GPIO changes.
- No PWM changes.
- No control-path changes.
- No PCA9685 changes.
- No FRAM changes.
- No actuator path.
- No frontend implementation.
- No RTC timestamp authority change.

Raspberry Pi backend UTC remains the timestamp authority.

NOVA SC remains telemetry-only.

Persistent replay verification is a backend filesystem validation function. It must not interact with UART, command paths, actuator hardware, GPIO outputs, PWM outputs, PCA9685 outputs, or FRAM.

## 13. Readiness Risks

| Risk | Diagnosis | Mitigation | Readiness impact |
|---|---|---|---|
| Phase 7.2G-E-G docs are untracked | Confirmed | Commit documentation before implementation | Makes decision `READY_AFTER_DOCUMENTATION_COMMIT` |
| Replay files already exist | Not present | Safe to create later | No block |
| Runtime evidence not ignored | Ignored by `.gitignore` | Keep as-is | No block |
| Runtime evidence absent locally | `backend/evidence/` absent | Run replay validation on Pi or evidence host later | No block for implementation |
| Writer schema/hash unclear | Schema and hash algorithm identified | Reuse algorithm conceptually | No block |
| Source code accidentally modified | No modified tracked source files reported | Continue documentation only | No block |
| Frontend report integration could overclaim replay | Current frontend forces replay false | Postpone integration | No block |
| Large NDJSON memory use | 1-hour target is 44074 events, future runs larger | Stream files line-by-line | Implementation requirement |

## 14. Required Corrections Before Implementation

Required before Phase 7.2G-E-H implementation:

1. Review and commit `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md`.
2. Review and commit `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md`.
3. Decide whether `docs/reports/nova_sc_project_status_investigation_for_roadmap.md` and other untracked `docs/reports/` content should be committed in the same documentation closeout.

Not required before implementation:

- Frontend changes.
- Firmware changes.
- Runtime evidence movement.
- FRAM work.
- Control/PWM/GPIO/PCA9685 work.

Implementation must not claim replay validation until a later validation run verifies at least the documented 5-minute and 1-hour persistent evidence runs.

## 15. Implementation Readiness Decision

Readiness decision:

```text
READY_AFTER_DOCUMENTATION_COMMIT
```

Rationale:

- The writer schema and hash algorithm are identifiable.
- Runtime evidence is ignored by Git.
- Replay implementation files do not exist yet.
- Source code is not modified.
- Safety boundaries are clear.
- Backend-only offline replay is the correct first implementation step.
- The Phase 7.2G-E-G planning and implementation-plan documents are currently untracked, so they should be committed before starting implementation.

If the user explicitly chooses to proceed before committing documentation, the repository is technically ready for Phase 7.2G-E-H implementation, but the cleaner engineering sequence is documentation commit first.

## 16. Final Status

```text
PHASE_7_2G_E_H_REPLAY_VERIFIER_PRE_IMPLEMENTATION_DIAGNOSIS: READY_FOR_REVIEW
```
