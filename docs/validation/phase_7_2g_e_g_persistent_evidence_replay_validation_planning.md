# Phase 7.2G-E-G — Persistent Evidence Replay Validation Planning

## 1. Executive Summary

Phase 7.2G-E-G defines the engineering plan for persistent evidence replay validation in NOVA SC.

This phase is planning only. No replay verifier is implemented in this phase, no backend code is modified, no frontend code is modified, no firmware is modified, and no runtime evidence files are moved or changed.

NOVA SC has already validated backend persistent evidence writing and finalization:

- Phase 7.2G-E-F-A: 5-minute persistent evidence smoke validation passed.
- Phase 7.2G-E-F-B: 1-hour persistent evidence soak validation passed with frontend report export not captured.
- The 1-hour run produced 9 NDJSON segments, `44074` events, zero writer errors, zero persistent event drops, and SHA-256 verification pass.
- Runtime evidence remains ignored by Git using `backend/evidence/`.
- Pi and laptop repositories are aligned at commit:

```text
a44b6fe Ignore backend runtime evidence artifacts
```

The next implementation phase should add a deterministic offline replay verifier that reads a backend evidence run directory and verifies the manifest, summary, integrity metadata, NDJSON segments, segment hashes, run-root hash, event counts, ordering, continuity, source coverage, and replay-derived summary consistency.

Persistent evidence remains write/hash validated after this planning phase. Persistent replay validation is not claimed yet.

## 2. Objective

The objective of Phase 7.2G-E-G is to define the plan for persistent evidence replay validation.

The replay validation plan should convert backend persistent evidence from write-only validated storage into replay-verifiable evidence.

The future replay verifier should:

- Ensure a saved evidence run can be read back deterministically.
- Verify `manifest.json`, `summary.json`, `integrity.json`, and `events_*.ndjson` segment files.
- Confirm stored NDJSON can reconstruct basic telemetry counts and integrity summaries independent of frontend browser state.
- Validate per-segment SHA-256 hashes and run-root SHA-256.
- Detect missing, corrupted, truncated, malformed, or internally inconsistent evidence.
- Produce machine-readable validation output suitable for later reports.

This phase does not implement that verifier.

## 3. Current Validated Baseline

Current baseline status:

| Item | Status |
|---|---|
| Backend persistent writer implemented | COMPLETE |
| Manifest/hash finalization implemented | COMPLETE |
| Report integration implemented | COMPLETE |
| 5-minute smoke validation | PASS |
| 1-hour soak validation | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED |
| Runtime evidence ignored by Git | `backend/evidence/` |
| Pi/laptop repository alignment | `a44b6fe Ignore backend runtime evidence artifacts` |

1-hour persistent evidence result:

| Field | Value |
|---|---:|
| `segments` | `9` |
| `total_ndjson_events` | `44074` |
| `summary_events_written` | `44074` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |

1-hour run-root SHA-256:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

Known caveat:

```text
Frontend report export for the 1-hour run was not captured.
```

That caveat does not invalidate backend persistent evidence writing/finalization, but it reinforces why backend/offline replay validation should come before any stronger replay or report reconstruction claim.

## 4. Problem Statement

The current platform can write persistent evidence, finalize metadata, and verify file hashes. However, it does not yet prove that saved evidence can be replayed into a deterministic validation result.

Current limitation:

- Evidence can be written and hash-verified.
- `manifest.json`, `summary.json`, `integrity.json`, and NDJSON segment files can be produced.
- The platform does not yet provide an offline replay verifier that reads those files and reconstructs validation counts.
- Frontend raw replay remains bounded by browser event-store limits.
- Frontend report export was not captured for the 1-hour run.

Therefore, persistent replay validation must be backend/offline first. The next implementation should read persistent evidence in place, verify it without modifying it, and produce a deterministic machine-readable result.

## 5. Replay Validation Requirements

| Requirement | Expected Behavior |
|---|---|
| Run directory exists | Verifier resolves the run directory and fails if it is missing |
| `manifest.json` exists | Verifier loads manifest metadata or fails |
| `summary.json` exists | Verifier loads summary metadata or fails |
| `integrity.json` exists | Verifier loads integrity metadata or fails |
| All segment files listed in `integrity.json` exist | Missing segment files are reported as failures |
| Per-segment SHA-256 recomputation matches `integrity.json` | Hash mismatch produces FAIL |
| `byte_count` matches actual file size | Byte-count mismatch produces FAIL |
| `event_count` matches non-empty NDJSON lines | Event-count mismatch produces FAIL |
| Summary `persistent_events_written` equals total replayed events | Summary-count mismatch produces FAIL |
| Segment order is deterministic by filename | Replay order is stable and reproducible |
| NDJSON parsing has zero malformed lines | Malformed line count greater than zero produces FAIL |
| Replay preserves event order within each segment | Events are streamed in file order |
| Replay detects missing segment files | Missing segment produces FAIL |
| Replay detects hash mismatch | Hash mismatch produces FAIL |
| Replay detects event-count mismatch | Segment count mismatch produces FAIL |
| Replay detects summary-count mismatch | Summary mismatch produces FAIL |
| Replay produces machine-readable validation output | Result is JSON-compatible |

## 6. Planned Replay Verifier Design

The next implementation phase should add a backend utility. It is not implemented in this planning phase.

Proposed future file:

```text
backend/evidence_replay.py
```

Proposed function:

```python
replay_evidence_run(run_dir: str | Path) -> EvidenceReplayResult
```

Proposed CLI:

```text
python -m evidence_replay --run-dir <path>
```

Planned output fields:

| Field | Purpose |
|---|---|
| `validation_status` | `PASS` or `FAIL` |
| `run_dir` | Evidence run directory checked |
| `phase_id` | Phase ID from manifest/summary evidence |
| `run_id` | Evidence run ID |
| `segment_count` | Number of replayed segments |
| `total_events_replayed` | Total valid NDJSON events replayed |
| `summary_events_written` | Summary persistent event count |
| `writer_errors` | Writer error count from summary/manifest |
| `persistent_events_dropped` | Persistent drop count from summary/manifest |
| `malformed_replay_lines` | Count of malformed NDJSON lines during replay |
| `hash_verified` | Whether segment hashes and run-root hash verified |
| `run_root_sha256` | Replay-computed and verified run-root SHA-256 |
| `replay_started_utc` | Replay start timestamp |
| `replay_completed_utc` | Replay completion timestamp |
| `failure_reasons` | Explicit mismatch or missing-file reasons |

The verifier should stream segment files line by line and should not load all events into memory.

## 7. Replay Algorithm Plan

Planned algorithm:

1. Resolve `run_dir`.
2. Load `manifest.json`, `summary.json`, and `integrity.json`.
3. Verify `finalized` and `hash_finalized` flags.
4. Sort segments by filename.
5. For each segment:
   - Verify file exists.
   - Recompute SHA-256.
   - Compare `byte_count`.
   - Stream-read NDJSON line by line.
   - Parse JSON.
   - Count non-empty valid events.
   - Count malformed lines.
6. Accumulate total replayed events.
7. Compare accumulated count against integrity segment counts.
8. Compare accumulated count against summary `persistent_events_written`.
9. Recompute deterministic `run_root_sha256` using the same algorithm as the evidence writer.
10. Compare replay-computed `run_root_sha256` against manifest and integrity values.
11. Produce `PASS` only if all checks pass.
12. Produce `FAIL` with explicit `failure_reasons` for any mismatch.

Additional implementation guidance:

- File reads must be read-only.
- Replay should tolerate large runs by streaming line by line.
- Failure output should be deterministic and machine-readable.
- The verifier should report all detected mismatches where practical, not only the first failure.

## 8. Replay Scope Boundary

Replay validation is not:

- Full semantic telemetry validation.
- Clinical validation.
- Production archive certification.
- Cryptographic attestation.
- Tamper-proof storage.
- FRAM validation.
- Actuator/control validation.
- Frontend report validation.

Replay validation should establish only that a finalized backend evidence run can be read back deterministically and that file/hash/count/order consistency checks pass.

## 9. Failure Mode Matrix

| Failure Mode | Detection Method | Expected Result |
|---|---|---|
| Missing `manifest.json` | Required file check | FAIL with `MANIFEST_MISSING` |
| Missing `summary.json` | Required file check | FAIL with `SUMMARY_MISSING` |
| Missing `integrity.json` | Required file check | FAIL with `INTEGRITY_MISSING` |
| Missing segment file | Segment path existence check | FAIL with `SEGMENT_FILE_MISSING` |
| Corrupted segment content | SHA-256 recomputation and NDJSON parse | FAIL |
| SHA-256 mismatch | Compare recomputed hash to integrity metadata | FAIL with `SEGMENT_SHA256_MISMATCH` |
| `byte_count` mismatch | Compare file size to integrity metadata | FAIL with `SEGMENT_BYTE_COUNT_MISMATCH` |
| `event_count` mismatch | Compare parsed non-empty line count to segment metadata | FAIL with `SEGMENT_EVENT_COUNT_MISMATCH` |
| Malformed NDJSON line | JSON parse exception during streaming replay | FAIL with `MALFORMED_NDJSON_LINE` |
| Summary count mismatch | Compare total replayed events to summary `persistent_events_written` | FAIL with `SUMMARY_EVENT_COUNT_MISMATCH` |
| Run-root mismatch | Recompute run-root SHA-256 and compare manifest/integrity values | FAIL with `RUN_ROOT_SHA256_MISMATCH` |
| `writer_errors > 0` | Read summary/manifest writer error count | FAIL with `WRITER_ERRORS_PRESENT` |
| `persistent_events_dropped > 0` | Read summary/manifest persistent drop count | FAIL with `PERSISTENT_EVENTS_DROPPED_PRESENT` |

## 10. Test Plan for Future Implementation

Future tests should include:

- Valid finalized run returns `PASS`.
- Missing run directory returns `FAIL`.
- Missing manifest returns `FAIL`.
- Missing integrity returns `FAIL`.
- Missing segment returns `FAIL`.
- Modified segment causes SHA mismatch `FAIL`.
- Truncated segment causes byte/event mismatch `FAIL`.
- Malformed NDJSON causes `FAIL`.
- Summary event mismatch causes `FAIL`.
- Zero-event finalized run behavior is deterministic.
- Replay does not modify files.
- Replay can process the 1-hour run scale without loading all events into memory.

Implementation tests should be backend-only unless a later phase explicitly adds frontend report consumption.

## 11. Runtime Evidence Handling Rules

Runtime evidence handling rules:

- Runtime evidence files remain outside Git.
- Do not move evidence during validation.
- Do not copy evidence during validation.
- Do not compress evidence during validation.
- Do not delete evidence during validation.
- Do not edit `backend/evidence/` during validation.
- Replay reads evidence in place.
- Replay must be read-only.
- Replay must not rewrite `manifest.json`.
- Replay must not rewrite `summary.json`.
- Replay must not rewrite `integrity.json`.
- Replay must not modify `events_*.ndjson`.
- Replay must not mark `persistent_replay_validated` true until replay implementation passes.

## 12. Safety Boundary

This planning phase does not change runtime behavior.

Safety boundary statements:

- No firmware changes.
- No GPIO changes.
- No PWM changes.
- No control changes.
- No actuator path enabled.
- No PCA9685 changes.
- No FRAM behavior changed.
- No RTC timestamp authority changed.
- Raspberry Pi backend UTC remains the trusted timestamp authority.
- No hardware wiring changes.

## 13. Acceptance Criteria for Future Replay Validation

Future Phase 7.2G-E-H should pass only if:

| Acceptance Criterion | Required Value |
|---|---|
| Replay utility runs against the 1-hour evidence directory | PASS |
| All 9 segments are read | PASS |
| Total replayed events | `44074` |
| `summary_events_written` | `44074` |
| Per-segment SHA-256 checks | PASS |
| `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Malformed replay lines | `0` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `validation_status` | `PASS` |
| Evidence files modified | `false` |

The 1-hour evidence directory for the future acceptance run is:

```text
backend/evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
```

## 14. Allowed Claims After This Planning Phase

Allowed claims:

- Replay validation plan defined.
- Replay verifier requirements defined.
- Future replay acceptance criteria defined.
- Persistent evidence remains write/hash validated but not replay validated yet.

## 15. Claims Not Allowed After This Planning Phase

Not allowed claims:

- Persistent replay validated.
- Report reconstruction validated.
- Production evidence archive.
- Tamper-proof evidence.
- Cryptographic attestation.
- Actuator/control readiness.
- FRAM validation.

## 16. Final Status

```text
PHASE_7_2G_E_G_PERSISTENT_EVIDENCE_REPLAY_VALIDATION_PLANNING: READY_FOR_REVIEW
```

## 17. Next Step

Proceed to Phase 7.2G-E-H — Persistent Evidence Replay Verifier Implementation, only after this planning document is reviewed and committed.
