# Phase 7.2G-E-G — Persistent Evidence Replay Validation Implementation Plan

## 1. Executive Summary

Phase 7.2G-E-G defines the software implementation plan for persistent evidence replay validation in NOVA SC.

This is the correct next step after validating persistent evidence writing, manifest finalization, hash finalization, report integration, and 1-hour hardware evidence storage. The backend can now write finalized evidence files and verify their file-integrity hashes. The remaining gap is deterministic replay: proving that a saved evidence run can be read back from disk, checked for consistency, and summarized without relying on frontend/browser state.

This document is an implementation plan only. It does not implement replay validation, create `backend/evidence_replay.py`, modify source code, modify tests, modify firmware, or touch runtime evidence files.

Current claim boundary:

```text
Persistent evidence writing is validated.
Persistent replay validation is not yet validated.
```

## 2. Objective

The engineering objective is to build a future deterministic offline replay verifier for backend persistent evidence.

The future verifier should:

- Read backend persistent evidence from a saved run directory.
- Verify `manifest.json`, `summary.json`, `integrity.json`, and `events_*.ndjson`.
- Recompute per-segment SHA-256 hashes.
- Recompute deterministic `run_root_sha256`.
- Confirm event counts and segment continuity.
- Confirm deterministic ordering.
- Produce a machine-readable replay result.
- Keep replay read-only.
- Remain independent of frontend browser state.

The future replay verifier should convert finalized evidence files from validated storage into replay-verifiable engineering evidence.

## 3. NOVA SC System Context

NOVA SC telemetry chain:

```text
Laptop Supervisory Console → Raspberry Pi backend/gateway → MAIN ESP32-S3 → SUB ESP32-S3
```

System context:

- The Laptop Supervisory Console displays telemetry and exports validation reports.
- The Raspberry Pi backend/gateway owns hardware telemetry ingestion and backend filesystem evidence storage.
- The MAIN ESP32-S3 and SUB ESP32-S3 provide real embedded hardware telemetry.
- Raspberry Pi backend UTC remains the trusted timestamp authority.
- NOVA SC is still telemetry-only.
- This phase is software/data-validation focused with limited hardware dependence.

The hardware role for the replay phase is contextual only. The target evidence was already captured from real Raspberry Pi → MAIN ESP32-S3 → SUB ESP32-S3 hardware telemetry in previous phases. Future replay validation reads saved backend files; it does not exercise live hardware behavior.

## 4. Current Completed Baseline

Completed baseline:

| Item | Status |
|---|---|
| Persistent soak evidence architecture planning | COMPLETE |
| Backend evidence writer implementation plan | COMPLETE |
| `backend/evidence_writer.py` implementation | COMPLETE |
| Manifest finalization | COMPLETE |
| Summary finalization | COMPLETE |
| Integrity finalization | COMPLETE |
| SHA-256 per-segment hashing | COMPLETE |
| `run_root_sha256` | COMPLETE |
| `persistent_evidence_summary` backend health/report pipeline integration | COMPLETE |
| Frontend report integration | COMPLETE |
| 5-minute hardware smoke validation | PASS |
| 1-hour hardware soak validation | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED |
| `backend/evidence/` added to `.gitignore` | COMPLETE |

Relevant Git history inspected:

| Commit | Scope |
|---|---|
| `d2f08b5` | Implement backend persistent evidence writer and hash finalization |
| `bb2c2dc` | Integrate persistent evidence summary into validation reports |
| `8c8fb1c` | Document Phase 7.2G-E-F-A persistent evidence smoke validation |
| `e18ec83` | Document Phase 7.2G-E-F-B persistent evidence soak validation |
| `a44b6fe` | Ignore backend runtime evidence artifacts |

Validated 5-minute smoke evidence:

| Field | Value |
|---|---|
| Evidence run ID | `EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8` |
| Phase ID | `PHASE_7_2G_E_F_A` |
| Backend mode | hardware |
| Serial port | `/dev/serial0` |
| Serial baud | `115200` |
| Runtime duration | approximately `395.905995` seconds |
| NDJSON events | `3521` |
| Segments | `1` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| Validation result | PASS |

Validated 1-hour soak evidence:

| Field | Value |
|---|---|
| Evidence run ID | `EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7` |
| Phase ID | `PHASE_7_2G_E_F_B` |
| Backend mode | hardware |
| Serial port | `/dev/serial0` |
| Serial baud | `115200` |
| Backend bridge status | `SERIAL_CONNECTED` |
| `serial_connected` | `true` |
| `hardware_connected` | `true` |
| `malformed_packet_count` | `0` |
| `dropped_packet_count` | `0` |
| Final active runtime | approximately 71 minutes 34 seconds |
| Target runtime | 60 minutes |
| NDJSON segments | `9` |
| Total NDJSON events | `44074` |
| `summary_events_written` | `44074` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Integrity verification result | PASS |
| Frontend report export before backend shutdown | NOT CAPTURED |
| Final status | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED |

## 5. Problem Being Solved

The platform can now write evidence and hash-verify finalized files. However, it does not yet prove that saved evidence can be replayed deterministically.

Current problem:

- Evidence can be stored as backend NDJSON files.
- Manifest, summary, and integrity metadata can be finalized.
- Per-segment hashes and `run_root_sha256` can be generated.
- The frontend event-store replay remains bounded by browser memory and event-store capacity.
- Long-duration evidence must be validated from backend files, not from browser state.
- Without replay validation, the system has storage integrity but not full replay-verifiable evidence.

The replay verifier closes this gap by reading finalized evidence and producing a deterministic validation result.

## 6. Why This Is the Best Next Step

Replay validation should come before longer soak tests because it verifies that stored evidence can actually be read back and checked.

Reasons this is the best next step:

- It verifies that saved evidence is usable after the run.
- It catches missing segment files.
- It catches corrupted NDJSON segments.
- It catches SHA-256 mismatches.
- It catches malformed NDJSON lines.
- It catches summary-count mismatches.
- It confirms that `44074` events from the 1-hour run are reconstructable.
- It avoids wasting time on 6-hour or 24-hour runs before the replay tool exists.
- It turns persistent evidence from stored files into verifiable engineering evidence.
- It improves auditability, reproducibility, and validation confidence.

Longer soak tests generate more evidence. Running them before a replay verifier exists would increase evidence volume without increasing evidence confidence.

## 7. Benefits to NOVA SC

### Data Integrity Benefit

Replay validation strengthens the existing SHA-256 file-integrity path by verifying that hashed files can also be parsed, counted, and summarized.

### Software Validation Benefit

The replay verifier becomes a deterministic backend validation tool. It checks evidence structure, metadata, hashes, counts, and continuity without requiring the frontend.

### Debugging Benefit

Replay can identify exactly where evidence inconsistency occurs: missing manifest, missing segment, hash mismatch, malformed line, event-count mismatch, or run-root mismatch.

### Reportability Benefit

A machine-readable replay result can later be integrated into validation reports. This will allow reports to distinguish write/hash validation from replay validation.

### Long-Duration Soak Readiness Benefit

The replay verifier should be implemented before 6-hour or 24-hour soaks. This prevents large evidence runs from becoming difficult to validate after capture.

### Reduced Dependency on Frontend Event Store

Replay validates backend evidence directly. This reduces dependence on bounded browser storage and avoids losing raw replay capability when the frontend event store rolls over.

### Engineering Evidence Benefit

Replay results provide clearer evidence for internship reporting, research review, and investor or technical review. The result is a measurable software validation artifact rather than a manual file inspection.

### Telemetry-Only Safety Benefit

Replay reads already captured files. It does not require command/control behavior, actuator enablement, GPIO changes, PWM changes, or firmware changes.

## 8. Risks / Issues This Phase Addresses

| Issue | Current Risk | Replay Verifier Benefit |
|---|---|---|
| Missing segment files | A run may appear finalized but lack one or more evidence segments | Detects missing files and fails explicitly |
| Corrupted NDJSON segments | Stored evidence may be unreadable or altered | Detects malformed content and hash mismatch |
| SHA-256 mismatch | File contents may not match integrity metadata | Recomputes hash and fails on mismatch |
| Summary event count mismatch | Summary may not match actual stored events | Compares replayed count to `summary_events_written` |
| Manifest/integrity mismatch | Metadata files may disagree | Cross-checks manifest, summary, and integrity |
| Malformed NDJSON line | A segment may contain unparsable evidence | Counts malformed lines and fails |
| Accidental runtime evidence modification | Evidence can be changed outside the app | Hash and count checks detect changes |
| Frontend report not captured | Browser report may be unavailable after shutdown | Backend replay validates files independently |
| Browser event-store rollover | Frontend replay can be partial | Backend replay reads full persistent evidence |
| Inability to reproduce evidence after a run | Manual inspection is not deterministic | Produces stable machine-readable replay output |
| Longer soak evidence too large to manually inspect | Manual validation does not scale | Streams segments and summarizes automatically |

## 9. Planned Software Architecture

Future files:

```text
backend/evidence_replay.py
backend/test_evidence_replay.py
```

Future CLI:

```text
python -m evidence_replay --run-dir <path>
```

Future main function:

```python
replay_evidence_run(run_dir: str | Path) -> EvidenceReplayResult
```

Planned result object fields:

| Field | Purpose |
|---|---|
| `validation_status` | `PASS` or `FAIL` |
| `run_dir` | Evidence directory replayed |
| `phase_id` | Evidence phase ID |
| `run_id` | Evidence run ID |
| `segment_count` | Number of segments replayed |
| `segment_filename_continuity` | Whether `events_000001.ndjson` through `events_N.ndjson` are continuous |
| `deterministic_order_verified` | Whether replay order is deterministic |
| `total_events_replayed` | Total valid NDJSON events streamed |
| `summary_events_written` | Summary persistent event count |
| `writer_errors` | Writer error count from evidence metadata |
| `persistent_events_dropped` | Persistent drop count from evidence metadata |
| `malformed_replay_lines` | Number of malformed NDJSON lines |
| `hash_verified` | Whether segment and run-root hashes match |
| `run_root_sha256` | Replay-verified run-root SHA-256 |
| `source_component_counts` | Counts by source/component metadata where available |
| `first_event_metadata` | Minimal metadata from first replayed event |
| `last_event_metadata` | Minimal metadata from last replayed event |
| `replay_started_utc` | Replay start timestamp |
| `replay_completed_utc` | Replay completion timestamp |
| `failure_reasons` | Explicit failure reasons |

Architecture rules:

- Read files in place.
- Do not write into evidence directories.
- Stream NDJSON line by line.
- Do not load all events into memory.
- Reuse the writer’s deterministic `run_root_sha256` algorithm.
- Produce JSON-compatible output.

## 10. Replay Algorithm

Detailed algorithm:

1. Resolve `run_dir`.
2. Load `manifest.json`.
3. Load `summary.json`.
4. Load `integrity.json`.
5. Verify `finalized` and `hash_finalized` flags.
6. Extract segment list.
7. Sort segments by filename.
8. Verify segment filenames are continuous from `events_000001.ndjson` through `events_N.ndjson`.
9. For each segment:
   - Verify file exists.
   - Recompute SHA-256.
   - Verify `byte_count`.
   - Stream-read line by line.
   - Skip empty lines.
   - Parse JSON.
   - Count valid events.
   - Count malformed lines.
   - Preserve deterministic replay order.
   - Collect source/component counts where metadata exists.
10. Accumulate total replayed events.
11. Compare per-segment event counts with `integrity.json`.
12. Compare total replayed events with summary `persistent_events_written`.
13. Recompute deterministic `run_root_sha256` using the same algorithm as the writer.
14. Compare replay-computed `run_root_sha256` against manifest and integrity.
15. Build replay-derived summary.
16. Return `PASS` only if all required checks pass.
17. Return `FAIL` with explicit `failure_reasons` for any mismatch.

The algorithm should keep going where safe so one replay result can report multiple failures in a single run.

## 11. Implementation Timeline for Week 10

| Day | Planned Work |
|---|---|
| Day 1 | Review planning document and inspect evidence writer finalization logic |
| Day 2 | Implement `evidence_replay.py` data structures and JSON loaders |
| Day 3 | Implement segment verification, SHA-256 recomputation, byte-count checks, and event-count checks |
| Day 4 | Implement deterministic replay order, filename continuity, source/component counts, and derived summary |
| Day 5 | Add unit tests using temporary evidence directories |
| Day 6 | Run replay verifier against 5-minute and 1-hour evidence directories on Raspberry Pi |
| Day 7 | Document validation result and decide whether to integrate replay status into reports |

This timeline keeps implementation incremental and testable while preserving evidence read-only behavior.

## 12. Testing Strategy

Future tests should include:

- Valid finalized run returns `PASS`.
- Missing run directory returns `FAIL`.
- Missing `manifest.json` returns `FAIL`.
- Missing `summary.json` returns `FAIL`.
- Missing `integrity.json` returns `FAIL`.
- Missing segment file returns `FAIL`.
- Segment filename gap returns `FAIL`.
- Corrupted segment causes SHA mismatch `FAIL`.
- Truncated segment causes byte/event mismatch `FAIL`.
- Malformed NDJSON line causes `FAIL`.
- Summary event count mismatch causes `FAIL`.
- `run_root_sha256` mismatch causes `FAIL`.
- `writer_errors > 0` causes `FAIL` or validation warning according to policy.
- `persistent_events_dropped > 0` causes `FAIL` or validation warning according to policy.
- Repeated replay is read-only and stable.
- Replay can handle `44074` events without loading all events into memory.

Test evidence should use temporary directories and small generated NDJSON samples. Tests should not depend on checked-in runtime evidence.

## 13. Hardware Interaction Boundary

This phase is mostly software.

Replay reads already captured backend files:

- No live hardware is required for offline replay.
- No ESP32 firmware changes are required.
- No UART protocol changes are required.
- No DS3231 RTC changes are required.
- No GPIO changes are required.
- No PWM changes are required.
- No control changes are required.
- No PCA9685 changes are required.
- No FRAM checkpoint behavior is required.
- No actuator path is required.

Hardware is relevant only as context: the target replay evidence came from real Raspberry Pi → MAIN ESP32-S3 → SUB ESP32-S3 hardware telemetry. Future replay validates saved evidence from that run, not the hardware behavior itself.

## 14. Safety and Scope Boundary

Safety and scope boundary:

- No firmware modifications.
- No actuator/control enablement.
- No GPIO behavior changes.
- No PWM behavior changes.
- No PCA9685 behavior changes.
- No FRAM validation.
- No clinical validation.
- No command/control path.
- No timestamp authority change.
- Raspberry Pi backend UTC remains the trusted timestamp authority.
- `persistent_replay_validated` must remain `false` until replay implementation passes.

This planning phase does not change backend, frontend, firmware, tests, or runtime evidence.

## 15. Expected Output of Future Replay

Example expected machine-readable summary for the 1-hour run:

```json
{
  "validation_status": "PASS",
  "segment_count": 9,
  "total_events_replayed": 44074,
  "summary_events_written": 44074,
  "writer_errors": 0,
  "persistent_events_dropped": 0,
  "malformed_replay_lines": 0,
  "run_root_sha256": "88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be",
  "hash_verified": true,
  "segment_filename_continuity": true,
  "deterministic_order_verified": true
}
```

This output is an expected future target, not a result already produced by an implemented replay verifier.

## 16. Acceptance Criteria

Future implementation should be accepted only when:

| Acceptance Criterion | Required Result |
|---|---|
| Replay verifier runs against a valid run directory | PASS |
| All 9 1-hour segments are detected | PASS |
| Segment filename continuity passes | PASS |
| All segment SHA-256 hashes pass | PASS |
| Total replayed events | `44074` |
| `summary_events_written` | `44074` |
| `malformed_replay_lines` | `0` |
| `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Replay-derived summary is produced | PASS |
| Repeated replay produces stable output | PASS |
| Runtime evidence files modified | `false` |
| Tests pass | PASS |
| Firmware/frontend/control behavior changes | `false` |

Acceptance should not depend on frontend browser state.

## 17. Limitations After This Plan

Even after this planning document:

- Replay is not implemented yet.
- Replay validation has not passed yet.
- Semantic telemetry analysis is not validated.
- RTC drift replay semantics are not validated.
- Evidence is file-integrity checked but not tamper-proof.
- Cryptographic attestation is not implemented.
- Production archive certification is not claimed.

This document defines how to implement replay validation safely; it does not claim the replay result.

## 18. Week 10 Report Alignment

This document supports the Week 10 internship report by providing:

- Research and design rationale.
- Implementation timeline.
- Software architecture.
- Benefits and risks.
- Measurable acceptance criteria.
- Clear safety boundaries.
- A path from write/hash validation to replay-verifiable evidence.

It keeps the project aligned with safe telemetry-only validation while moving NOVA SC toward stronger software evidence infrastructure.

## 19. Final Status

```text
PHASE_7_2G_E_G_PERSISTENT_EVIDENCE_REPLAY_VALIDATION_IMPLEMENTATION_PLAN: READY_FOR_REVIEW
```
