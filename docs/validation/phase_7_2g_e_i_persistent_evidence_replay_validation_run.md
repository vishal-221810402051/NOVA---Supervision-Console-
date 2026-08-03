# Phase 7.2G-E-I — Persistent Evidence Replay Validation Run

## 1. Executive Summary

Phase 7.2G-E-I documents successful backend/offline persistent evidence replay validation for NOVA SC.

The validation result is:

```text
PHASE_7_2G_E_I_PERSISTENT_EVIDENCE_REPLAY_VALIDATION_RUN: PASS
```

The Phase 7.2G-E-H persistent evidence replay verifier was used against two previously captured backend evidence runs:

| Evidence Run | Phase | Replay Result | Events Replayed | Segments |
|---|---|---|---:|---:|
| 5-minute smoke validation | PHASE_7_2G_E_F_A | PASS | 3521 | 1 |
| 1-hour persistent evidence soak validation | PHASE_7_2G_E_F_B | PASS | 44074 | 9 |

Both replay validations passed deterministic segment ordering, segment filename continuity, NDJSON event count consistency, writer error checks, persistent drop checks, malformed replay line checks, segment hash verification, and run-root SHA-256 verification.

This phase validates that finalized backend persistent evidence can be replayed offline from stored NDJSON, manifest, summary, and integrity artifacts. It does not modify runtime evidence files and does not claim tamper-proof storage, cryptographic attestation, production archive readiness, frontend report integration, FRAM checkpoint validation, or actuator/control readiness.

## 2. Objective

The objective of Phase 7.2G-E-I was to validate the newly implemented backend/offline persistent evidence replay path using existing finalized evidence runs.

Specifically, this phase checked whether the replay verifier could:

- Discover finalized persistent evidence run artifacts.
- Read manifest, summary, integrity metadata, and NDJSON segment files.
- Replay event segments in deterministic order.
- Verify segment filename continuity.
- Count replayed NDJSON events.
- Compare replayed event counts against summary metadata.
- Verify no writer errors were recorded.
- Verify no persistent evidence events were dropped.
- Verify no malformed replay lines were encountered.
- Verify stored segment SHA-256 metadata.
- Verify stored run-root SHA-256 metadata.
- Produce a PASS verdict for known-good 5-minute and 1-hour backend evidence runs.

This phase is replay validation and documentation only. It does not start hardware telemetry, run a new soak, modify backend code, modify frontend code, modify firmware, or alter runtime evidence artifacts.

## 3. System Context

NOVA SC hardware telemetry architecture:

```text
Laptop Supervisory Console -> Raspberry Pi Gateway -> MAIN ESP32-S3 -> SUB ESP32-S3
```

Persistent backend evidence exists to address the earlier frontend bounded event-store limitation. The frontend event store remains useful for live supervision and report generation, but full-duration raw evidence is stored on the Raspberry Pi backend filesystem as append-only NDJSON segments with manifest, summary, and integrity metadata.

Replay validation is performed offline against finalized backend evidence directories. It does not require live hardware telemetry and does not modify the captured evidence files.

Relevant implementation milestone:

| Phase | Artifact | Purpose |
|---|---|---|
| Phase 7.2G-E-H | `backend/evidence_replay.py` | Backend/offline persistent evidence replay verifier |
| Phase 7.2G-E-H | `backend/test_evidence_replay.py` | Replay verifier unit tests |

## 4. Pre-Replay Readiness

Pre-replay readiness evidence from the Raspberry Pi repository:

| Check | Evidence | Result |
|---|---|---|
| Repository commit | `d180c45` | PASS |
| Commit description | `Implement Phase 7.2G-E-H persistent evidence replay verifier` | PASS |
| Replay verifier module present | `backend/evidence_replay.py` | PASS |
| Replay verifier tests present | `backend/test_evidence_replay.py` | PASS |
| Runtime evidence ignored by Git | `backend/evidence/` remained ignored | PASS |
| Runtime evidence files | Not modified, moved, copied, compressed, or deleted | PASS |

Replay verifier test evidence:

```text
python -m unittest test_evidence_replay.py
Ran 18 tests in 4.548s
OK
```

Combined evidence writer and replay verifier test evidence:

```text
python -m unittest test_evidence_writer.py test_evidence_replay.py
Ran 34 tests in 5.102s
OK
```

Engineering interpretation:

- The replay verifier implementation existed before this replay validation run.
- The targeted replay verifier tests passed.
- The combined persistent evidence writer and replay verifier tests passed.
- Runtime evidence artifacts remained outside Git tracking and were not altered for this documentation phase.

## 5. Replay Method

Replay method:

1. Use the Phase 7.2G-E-H backend/offline replay verifier.
2. Point the verifier at finalized backend evidence run directories.
3. Load run metadata from `manifest.json`, `summary.json`, and `integrity.json`.
4. Read NDJSON segment files in deterministic segment order.
5. Verify segment filename continuity.
6. Count replayed NDJSON events.
7. Compare replayed event count with summary `persistent_events_written`.
8. Confirm `writer_errors == 0`.
9. Confirm `persistent_events_dropped == 0`.
10. Confirm `malformed_replay_lines == 0`.
11. Verify segment SHA-256 metadata.
12. Verify run-root SHA-256 metadata.
13. Produce an offline replay validation result.

Replay claim boundary:

- Replay validates stored backend persistent evidence artifacts.
- Replay validates file-integrity metadata for finalized evidence files.
- Replay does not prove tamper-proof storage.
- Replay does not provide cryptographic attestation.
- Replay does not enable any live hardware behavior.
- Replay does not modify stored evidence.

## 6. Evidence Directory Discovery

Two finalized backend evidence directories were used.

5-minute smoke evidence directory:

```text
evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
```

Directory contents:

| File | Status |
|---|---|
| `events_000001.ndjson` | present |
| `integrity.json` | present |
| `manifest.json` | present |
| `summary.json` | present |

Approximate directory size:

```text
5.2 MB
```

1-hour soak evidence directory:

```text
evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
```

Directory contents:

| File | Status |
|---|---|
| `events_000001.ndjson` through `events_000009.ndjson` | present |
| `integrity.json` | present |
| `manifest.json` | present |
| `summary.json` | present |

Approximate directory size:

```text
64 MB
```

These directories were replay targets only. This phase did not move, copy, compress, delete, or modify any runtime evidence files.

## 7. 5-Minute Replay Result

Replay target:

```text
evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
```

Replay result:

| Field | Value |
|---|---|
| `validation_status` | PASS |
| `phase_id` | PHASE_7_2G_E_F_A |
| `run_id` | EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8 |
| `segment_count` | 1 |
| `segment_filename_continuity` | True |
| `deterministic_order_verified` | True |
| `total_events_replayed` | 3521 |
| `summary_events_written` | 3521 |
| `writer_errors` | 0 |
| `persistent_events_dropped` | 0 |
| `malformed_replay_lines` | 0 |
| `hash_verified` | True |
| `run_root_match` | True |
| `failure_reasons` | [] |

Run-root SHA-256 verification:

| Field | Value |
|---|---|
| Expected `run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| Actual `run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| Match | PASS |

Engineering interpretation:

The 5-minute persistent evidence smoke run replayed successfully. The single NDJSON segment was ordered deterministically, counted correctly, matched summary metadata, had no malformed replay lines, recorded no writer errors, recorded no persistent evidence drops, and matched stored SHA-256 integrity metadata.

## 8. 1-Hour Replay Result

Replay target:

```text
evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
```

Replay result:

| Field | Value |
|---|---|
| `validation_status` | PASS |
| `phase_id` | PHASE_7_2G_E_F_B |
| `run_id` | EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7 |
| `segment_count` | 9 |
| `segment_filename_continuity` | True |
| `deterministic_order_verified` | True |
| `total_events_replayed` | 44074 |
| `summary_events_written` | 44074 |
| `writer_errors` | 0 |
| `persistent_events_dropped` | 0 |
| `malformed_replay_lines` | 0 |
| `hash_verified` | True |
| `run_root_match` | True |
| `failure_reasons` | [] |

Run-root SHA-256 verification:

| Field | Value |
|---|---|
| Expected `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Actual `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| Match | PASS |

Engineering interpretation:

The 1-hour persistent evidence soak run replayed successfully. All nine NDJSON segments were discovered in deterministic order, segment filename continuity passed, replayed event count matched summary metadata, no malformed replay lines were reported, no writer errors were recorded, no persistent evidence drops were recorded, and stored SHA-256 integrity metadata matched.

## 9. Validation Result Matrix

| Validation Item | 5-Minute Run | 1-Hour Run | Overall |
|---|---|---|---|
| Evidence directory discovered | PASS | PASS | PASS |
| Required metadata files present | PASS | PASS | PASS |
| NDJSON segments present | PASS | PASS | PASS |
| Segment filename continuity | PASS | PASS | PASS |
| Deterministic segment order | PASS | PASS | PASS |
| Replayed event count available | PASS | PASS | PASS |
| Replayed event count matches summary | PASS | PASS | PASS |
| Writer errors equal zero | PASS | PASS | PASS |
| Persistent evidence drops equal zero | PASS | PASS | PASS |
| Malformed replay lines equal zero | PASS | PASS | PASS |
| Segment SHA-256 verification | PASS | PASS | PASS |
| Run-root SHA-256 verification | PASS | PASS | PASS |
| Replay validation status | PASS | PASS | PASS |

Overall result:

```text
PHASE_7_2G_E_I_PERSISTENT_EVIDENCE_REPLAY_VALIDATION_RUN: PASS
```

## 10. Engineering Interpretation

Phase 7.2G-E-I closes the loop between persistent evidence capture and offline evidence verification.

Earlier phases validated that the backend could write persistent evidence during a 5-minute hardware smoke run and a 1-hour hardware soak run. This phase validates that those finalized evidence artifacts can be replayed offline and verified against summary and integrity metadata.

The 5-minute run provides a small, fast validation target. The 1-hour run provides a longer multi-segment validation target. Passing both matters because it demonstrates that the replay verifier handles both single-segment and multi-segment evidence runs.

The replay results support the following engineering conclusion:

```text
Backend persistent evidence is now not only written and finalized, but also replay-verifiable offline for the documented 5-minute and 1-hour validation runs.
```

This is still bounded by the scope of the verifier and the stored metadata. SHA-256 validation supports detection of file changes after finalization. It does not make the evidence tamper-proof and does not provide independent cryptographic attestation.

## 11. Safety Boundary

This phase is documentation and replay-validation evidence reporting only.

Safety boundary statements:

- No backend runtime behavior was modified by this report.
- No frontend behavior was modified by this report.
- No firmware behavior was modified by this report.
- No telemetry parsing behavior was modified by this report.
- No report-generation code was modified by this report.
- No RTC sync behavior was modified by this report.
- No timestamp authority change occurred.
- Raspberry Pi backend UTC remains the trusted timestamp authority.
- No command/control path was enabled.
- No actuator behavior was modified.
- No PWM behavior was modified.
- No GPIO behavior was modified.
- No PCA9685 behavior was modified.
- No FRAM behavior was modified.
- Runtime evidence files under `backend/evidence/` were not moved, copied, compressed, deleted, or edited.

This phase does not enable motors, servos, steppers, pumps, valves, relays, heaters, GPIO control, PCA9685 PWM output, or FRAM checkpoint storage.

## 12. Claims Allowed After This Phase

The following claims are supported by this phase:

- Backend/offline persistent evidence replay validation passed for the documented 5-minute run.
- Backend/offline persistent evidence replay validation passed for the documented 1-hour run.
- The replay verifier handled a single-segment evidence run.
- The replay verifier handled a nine-segment evidence run.
- Replayed event counts matched summary metadata for both runs.
- Segment filename continuity passed for both runs.
- Deterministic segment ordering passed for both runs.
- No writer errors were recorded in either replayed run.
- No persistent evidence drops were recorded in either replayed run.
- No malformed replay lines were recorded in either replayed run.
- Segment SHA-256 verification passed for both runs.
- Run-root SHA-256 verification passed for both runs.
- Backend persistent evidence is now documented as replay-verifiable offline for the provided validation evidence.

## 13. Claims Not Allowed After This Phase

The following claims are not supported by this phase:

- Frontend report integration is complete.
- Persistent replay results are automatically included in supervisory validation reports.
- 6-hour persistent evidence soak validation passed.
- 24-hour persistent evidence soak validation passed.
- Production archive readiness is complete.
- Evidence storage is tamper-proof.
- Evidence storage provides cryptographic attestation.
- Evidence storage provides chain-of-custody guarantees.
- FRAM checkpoint validation passed.
- FRAM black-box storage is implemented.
- Actuator/control readiness is achieved.
- Motor readiness is achieved.
- Servo readiness is achieved.
- Stepper readiness is achieved.
- Pump readiness is achieved.
- Valve readiness is achieved.
- Relay readiness is achieved.
- Heater readiness is achieved.
- GPIO control readiness is achieved.
- PCA9685 PWM output readiness is achieved.

## 14. Final Status

```text
PHASE_7_2G_E_I_PERSISTENT_EVIDENCE_REPLAY_VALIDATION_RUN: PASS
```

Final engineering status:

- 5-minute backend persistent evidence replay validation passed.
- 1-hour backend persistent evidence replay validation passed.
- Single-segment replay validation passed.
- Multi-segment replay validation passed.
- Event count consistency passed.
- Writer error checks passed.
- Persistent evidence drop checks passed.
- Malformed replay line checks passed.
- SHA-256 segment and run-root verification passed.
- Runtime evidence files were not modified.
- This phase remains backend/offline replay validation only.

## 15. Next Step

Next phase:

```text
Phase 7.2G-E-J — Replay Result Report Integration Planning
```

The next phase should plan how persistent replay validation results are surfaced in NOVA SC validation reports without changing firmware, command/control behavior, actuator behavior, PWM behavior, GPIO behavior, PCA9685 behavior, or FRAM behavior.
