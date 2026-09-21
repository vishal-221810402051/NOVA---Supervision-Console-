# Phase 7.2G-E-L-V — Backend Replay Result Artifact Summary Validation

## 1. Executive Summary

Phase 7.2G-E-L-V validated the NOVA SC backend replay-result artifact summary integration on the real Raspberry Pi hardware telemetry environment.

The implementation under validation was Phase 7.2G-E-L-B at commit:

```text
e247d90a3930e9935f66176d9bbb14ca74b7dab5
```

Eight validation cases exercised the backend summary states and safety controls:

- No artifact configured produced `PENDING`.
- The real 5-minute Artifact V1 produced `PASS` with `3521` events and `1` segment.
- The real 1-hour Artifact V1 produced `PASS` with `44074` events and `9` segments.
- An incorrect externally expected run ID produced `FAIL` with `REPLAY_RUN_ID_MISMATCH`.
- An incorrect externally expected phase ID produced `FAIL` with `REPLAY_PHASE_ID_MISMATCH`.
- A configured missing artifact produced `FAIL` with `REPLAY_ARTIFACT_NOT_FOUND`.
- A real Linux symlink was rejected with `REPLAY_ARTIFACT_SYMLINK_REJECTED`.
- An outside-root path was rejected with `REPLAY_ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT` while the backend and live hardware telemetry remained operational.

All eight cases passed their expected validation outcome. The final phase result is:

```text
PHASE_7_2G_E_L_V_BACKEND_REPLAY_RESULT_ARTIFACT_SUMMARY_VALIDATION: PASS
```

## 2. Objective

The objective of Phase 7.2G-E-L-V was to validate that the Raspberry Pi backend can safely consume an explicitly selected Replay Result Artifact V1 and expose a bounded, cached `persistent_replay_summary` through `/health`.

The validation specifically tested:

- Artifact V1 schema enforcement.
- Explicit artifact selection.
- External run and phase identity binding.
- Correct `PASS`, `FAIL`, and `PENDING` semantics.
- Missing-file rejection.
- Linux symlink rejection.
- Allowed-root containment.
- Separation between `persistent_replay_summary` and `persistent_evidence_summary`.
- Isolation of replay-summary failures from the live hardware telemetry path.

## 3. Scope

This phase validated the already implemented backend integration. It did not modify or regenerate replay artifacts and did not execute persistent evidence replay.

In scope:

- Read-only loading of existing JSON replay-result artifacts.
- Artifact V1 validation.
- External run and phase identity checks.
- Startup-cached replay summary state.
- `/health` representation.
- Filesystem path and symlink controls.
- Live backend and hardware telemetry isolation.

Out of scope:

- Frontend replay-report integration.
- Replay artifact generation.
- Persistent evidence replay execution.
- Persistent evidence modification.
- Firmware, GPIO, PWM, PCA9685, FRAM, actuator, or command/control behavior.

## 4. Validated Baseline

Implementation under validation:

```text
Phase 7.2G-E-L-B — Backend Replay Result Artifact Summary Implementation
```

Implementation commit and Raspberry Pi baseline:

```text
e247d90a3930e9935f66176d9bbb14ca74b7dab5
```

Validated backend flow:

```text
replay_result.json
    -> read-only replay artifact loader
    -> Artifact V1 validation
    -> external run/phase identity binding
    -> PASS / FAIL / PENDING
    -> persistent_replay_summary
    -> cached application state
    -> /health
```

The writer-owned `persistent_evidence_summary` remained a separate sibling health structure throughout validation.

## 5. Environment and Repository State

Validation environment:

| Field | Value |
|---|---|
| Platform | Raspberry Pi / Linux |
| Backend mode | `hardware` |
| Serial bridge | `SERIAL_CONNECTED` |
| Backend service | Uvicorn / FastAPI |
| Health endpoint | `/health` |
| WebSocket endpoint | `/ws/telemetry` |

Final repository state recorded after cleanup:

| Check | Result |
|---|---|
| `HEAD` | `e247d90a3930e9935f66176d9bbb14ca74b7dab5` |
| `origin/main` | `e247d90a3930e9935f66176d9bbb14ca74b7dab5` |
| `HEAD == origin/main` | PASS |
| `git status --short` | Clean |
| `git diff --check` | PASS |

## 6. Real Replay Artifacts

### 6.1 Five-Minute Artifact

Artifact:

```text
replay_result_PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8.json
```

| Field | Value |
|---|---|
| Phase | `PHASE_7_2G_E_F_A` |
| Run | `EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8` |
| `artifact_schema_version` | `1.0` |
| `artifact_type` | `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` |
| `validation_scope` | `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` |
| `validation_status` | `PASS` |
| `persistent_replay_validated` | `true` |
| `segment_count` | `1` |
| `total_events` | `3521` |
| `summary_events_written` | `3521` |
| `malformed_lines` | `0` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `segment_filename_continuity` | `true` |
| `deterministic_order_verified` | `true` |
| `hash_verified` | `true` |
| `run_root_match` | `true` |
| `run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| `failure_reasons` | `[]` |

Artifact validator evidence:

```text
VALIDATION_ERROR_COUNT: 0
VALIDATION_ERRORS: []
ARTIFACT_SCHEMA_VALID: PASS
```

### 6.2 One-Hour Artifact

Artifact:

```text
replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

| Field | Value |
|---|---|
| Phase | `PHASE_7_2G_E_F_B` |
| Run | `EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7` |
| `validation_status` | `PASS` |
| `persistent_replay_validated` | `true` |
| `segment_count` | `9` |
| `total_events` | `44074` |
| `summary_events_written` | `44074` |
| `malformed_lines` | `0` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `segment_filename_continuity` | `true` |
| `deterministic_order_verified` | `true` |
| `hash_verified` | `true` |
| `run_root_match` | `true` |
| `run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| `failure_reasons` | `[]` |

## 7. Artifact V1 Safety Baseline

The 5-minute artifact received explicit bounded filesystem and schema validation:

| Safety Check | Evidence | Result |
|---|---|---|
| File size | `5767 bytes` | PASS |
| Regular file | Confirmed | PASS |
| Symlink | No | PASS |
| Maximum loader size | `1 MiB` | PASS |
| Artifact V1 schema | Zero validation errors | PASS |
| Explicit selection | Configured path | PASS |
| Allowed root | `backend/replay_results/` | PASS |

Both real artifacts were consumed as existing JSON artifacts. They were not regenerated, and the loader did not execute the replay engine or inspect raw evidence.

## 8. Case 1 — PENDING

Configuration:

```text
NOVA_SC_REPLAY_RESULT_PATH unset
NOVA_SC_REPLAY_EXPECTED_RUN_ID unset
NOVA_SC_REPLAY_EXPECTED_PHASE_ID unset
```

Observed summary:

| Field | Value |
|---|---|
| `artifact_selected` | `false` |
| `artifact_present` | `false` |
| `artifact_valid` | `null` |
| `identity_bound` | `false` |
| `replay_validation_status` | `PENDING` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `[]` |
| `required_next_action` | `CONFIGURE_REPLAY_ARTIFACT` |
| `persistent_evidence_summary` present | `true` |

The supplied transcript retained the successfully parsed `/health` response but did not retain an explicit HTTP status line for this case. No HTTP status is inferred.

Result: **PASS**

## 9. Case 2 — 5-Minute PASS

The real 5-minute artifact was selected with its exact externally expected run and phase identities.

| Field | Observed |
|---|---|
| `artifact_selected` | `true` |
| `artifact_present` | `true` |
| `artifact_valid` | `true` |
| `identity_bound` | `true` |
| `run_identity_match` | `true` |
| `phase_identity_match` | `true` |
| `replay_validation_status` | `PASS` |
| `persistent_replay_validated` | `true` |
| `segment_count` | `1` |
| `total_events` | `3521` |
| `summary_events_written` | `3521` |
| `malformed_lines` | `0` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `segment_filename_continuity` | `true` |
| `deterministic_order_verified` | `true` |
| `hash_verified` | `true` |
| `run_root_match` | `true` |
| `failure_reasons` | `[]` |
| `required_next_action` | `null` |
| `persistent_evidence_summary` present | `true` |

Run-root SHA-256:

```text
5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167
```

Result: **PASS**

## 10. Case 3 — 1-Hour PASS

The real 1-hour artifact was selected with its exact externally expected run and phase identities.

| Field | Observed |
|---|---|
| `artifact_selected` | `true` |
| `artifact_present` | `true` |
| `artifact_valid` | `true` |
| `identity_bound` | `true` |
| `run_identity_match` | `true` |
| `phase_identity_match` | `true` |
| `replay_validation_status` | `PASS` |
| `persistent_replay_validated` | `true` |
| `segment_count` | `9` |
| `total_events` | `44074` |
| `summary_events_written` | `44074` |
| `malformed_lines` | `0` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `segment_filename_continuity` | `true` |
| `deterministic_order_verified` | `true` |
| `hash_verified` | `true` |
| `run_root_match` | `true` |
| `failure_reasons` | `[]` |
| `required_next_action` | `null` |
| `persistent_evidence_summary` present | `true` |

Run-root SHA-256:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

Result: **PASS**

## 11. Case 4 — Run Identity Rejection

Configuration:

| Field | Value |
|---|---|
| Artifact | Valid real 1-hour artifact |
| Expected run | `EVIDENCE_INTENTIONALLY_WRONG_RUN_ID` |
| Expected phase | `PHASE_7_2G_E_F_B` |

Observed:

| Field | Value |
|---|---|
| `artifact_valid` | `true` |
| `identity_bound` | `true` |
| `run_identity_match` | `false` |
| `phase_identity_match` | `true` |
| `replay_validation_status` | `FAIL` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `["REPLAY_RUN_ID_MISMATCH"]` |
| `hash_verified` | `true` |
| `run_root_match` | `true` |
| `segment_count` | `9` |
| `total_events` | `44074` |
| `persistent_evidence_summary` present | `true` |

The valid artifact was correctly rejected because its run identity did not match the external expected run.

Result: **PASS**

## 12. Case 5 — Phase Identity Rejection

Configuration:

| Field | Value |
|---|---|
| Artifact | Valid real 1-hour artifact |
| Expected run | `EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7` |
| Expected phase | `PHASE_INTENTIONALLY_WRONG` |

Observed:

| Field | Value |
|---|---|
| `artifact_valid` | `true` |
| `identity_bound` | `true` |
| `run_identity_match` | `true` |
| `phase_identity_match` | `false` |
| `replay_validation_status` | `FAIL` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `["REPLAY_PHASE_ID_MISMATCH"]` |
| Artifact integrity | Remained valid |
| `persistent_evidence_summary` present | `true` |

The valid artifact was correctly rejected because its phase identity did not match the external expected phase.

Result: **PASS**

## 13. Case 6 — Missing Artifact

Configured path:

```text
replay_results/intentionally_missing_e_l_v_artifact.json
```

| Field | Observed |
|---|---|
| `artifact_selected` | `true` |
| `artifact_present` | `false` |
| `artifact_valid` | `null` |
| `replay_validation_status` | `FAIL` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `["REPLAY_ARTIFACT_NOT_FOUND"]` |
| `persistent_evidence_summary` present | `true` |

No fabricated replay metadata was exposed.

Result: **PASS**

## 14. Case 7 — Linux Symlink Rejection

A temporary Linux symlink was created inside `backend/replay_results/` and pointed at the valid 1-hour replay artifact.

| Field | Observed |
|---|---|
| `artifact_selected` | `true` |
| `artifact_present` | `false` |
| `artifact_valid` | `null` |
| `replay_validation_status` | `FAIL` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `["REPLAY_ARTIFACT_SYMLINK_REJECTED"]` |
| `persistent_evidence_summary` present | `true` |

This real Linux check closes the Windows unit-test platform gap for symlink handling.

Cleanup evidence:

```text
CASE7_SYMLINK_CLEANUP: PASS
```

Result: **PASS**

## 15. Case 8 — Outside-Root Failure Isolation

Temporary outside-root file:

```text
/tmp/e_l_v_case8_outside.json
```

The path was configured as `NOVA_SC_REPLAY_RESULT_PATH`.

Observed replay summary:

| Field | Value |
|---|---|
| `artifact_selected` | `true` |
| `artifact_present` | `false` |
| `artifact_valid` | `null` |
| `identity_bound` | `false` |
| `replay_validation_status` | `FAIL` |
| `persistent_replay_validated` | `false` |
| `failure_reasons` | `["REPLAY_ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT"]` |

No metadata from the outside-root artifact was accepted.

Runtime isolation evidence:

| Field | First Capture | Second Capture |
|---|---|---|
| HTTP status | `200` | `200` |
| Backend | `HEALTHY` | `HEALTHY` |
| Backend mode | `hardware` | `hardware` |
| Bridge status | `SERIAL_CONNECTED` | `SERIAL_CONNECTED` |
| Serial connected | `true` | `true` |
| Hardware connected | `true` | `true` |
| WebSocket | `/ws/telemetry` | `/ws/telemetry` |
| Stream ID | `PI_STREAM_20260921T121045Z` | `PI_STREAM_20260921T121045Z` |
| Dropped packets | `0` | `0` |
| Malformed packets | `0` | `0` |
| `persistent_evidence_summary` present | `true` | `true` |

Result: **PASS**

## 16. Telemetry Continuity Evidence

The two Case 8 health captures demonstrated continuing MAIN and SUB telemetry after replay-summary path rejection.

| Source | First Timestamp | Second Timestamp | Result |
|---|---|---|---|
| MAIN ESP32-S3 | `2026-09-21T12:10:52.758746+00:00` | `2026-09-21T12:11:16.090425+00:00` | Advanced |
| SUB ESP32-S3 | `2026-09-21T12:10:53.084639+00:00` | `2026-09-21T12:11:15.710550+00:00` | Advanced |

The stable stream ID, zero dropped and malformed packet counters, healthy serial bridge, and advancing source timestamps show that the invalid replay configuration did not interrupt live hardware telemetry.

## 17. PASS / FAIL / PENDING Coverage

The validation exercised all three replay-summary states:

| Summary State | Cases | Meaning |
|---|---|---|
| `PENDING` | Case 1 | No artifact was selected; operator configuration is required |
| `PASS` | Cases 2 and 3 | A valid Artifact V1 passed external run and phase binding |
| `FAIL` | Cases 4 through 8 | Explicit identity, file, symlink, or containment validation failed closed |

Only Cases 2 and 3 set `persistent_replay_validated=true`.

## 18. Validation Matrix

| Case | Scenario | Expected | Observed | Result |
|---:|---|---|---|---|
| 1 | No artifact configured | `PENDING` | `PENDING`, configure artifact | PASS |
| 2 | Real 5-minute artifact | `PASS`, 3521 events, 1 segment | `PASS`, 3521 events, 1 segment | PASS |
| 3 | Real 1-hour artifact | `PASS`, 44074 events, 9 segments | `PASS`, 44074 events, 9 segments | PASS |
| 4 | Wrong expected run ID | `REPLAY_RUN_ID_MISMATCH` | Matching failure reason | PASS |
| 5 | Wrong expected phase ID | `REPLAY_PHASE_ID_MISMATCH` | Matching failure reason | PASS |
| 6 | Missing artifact | `REPLAY_ARTIFACT_NOT_FOUND` | Matching failure reason | PASS |
| 7 | Linux symlink | `REPLAY_ARTIFACT_SYMLINK_REJECTED` | Matching failure reason | PASS |
| 8 | Outside allowed root / failure isolation | Path rejection; backend remains operational | Path rejected; backend and telemetry remained operational | PASS |

## 19. Failure Isolation Assessment

Replay-summary failure remained isolated to `persistent_replay_summary`.

Case 8 demonstrated that an invalid outside-root artifact path did not stop or degrade:

- Backend startup and runtime health.
- `/health` availability.
- WebSocket endpoint availability.
- Serial connectivity.
- Hardware connectivity.
- MAIN ESP32-S3 telemetry.
- SUB ESP32-S3 telemetry.
- The separate `persistent_evidence_summary` health structure.

The loader failed closed for the invalid replay selection while the hardware telemetry path continued independently.

## 20. Claim-Control Boundaries

Validated claim:

> The NOVA SC Raspberry Pi backend successfully consumed real Replay Result Artifact V1 files, enforced schema, path, run-identity and phase-identity validation rules, generated correct PASS/FAIL/PENDING persistent_replay_summary states, and isolated replay-summary failures from live hardware telemetry.

Claims not validated by this phase:

- Tamper-proof storage is **not validated**.
- Cryptographic attestation is **not validated**.
- Production archive certification is **not validated**.
- Frontend replay-report integration is **not validated**.
- FRAM checkpoint storage is **not validated**.
- Actuator/control readiness is **not validated**.
- Clinical readiness is **not validated**.

## 21. Cleanup Evidence

| Cleanup Item | Result |
|---|---|
| Temporary Case 7 Linux symlink removed | `CASE7_SYMLINK_CLEANUP: PASS` |
| Temporary Case 8 outside-root file removed | `CASE8_TEMP_CLEANUP: PASS` |
| Replay validation environment cleared | `REPLAY_TEST_ENV_CLEANUP: PASS` |

No real replay artifact or persistent evidence file was modified during cleanup.

## 22. Repository Final State

Final Raspberry Pi repository evidence:

```text
HEAD:
e247d90a3930e9935f66176d9bbb14ca74b7dab5

origin/main:
e247d90a3930e9935f66176d9bbb14ca74b7dab5

git status --short:
clean

git diff --check:
PASS
```

The validation therefore concluded with the Pi checkout clean and aligned with `origin/main`.

## 23. Acceptance Criteria

| Acceptance Criterion | Result |
|---|---|
| E-L-B implementation validated at the specified commit | PASS |
| No-artifact configuration produces `PENDING` | PASS |
| Real 5-minute Artifact V1 produces identity-bound `PASS` | PASS |
| Real 1-hour Artifact V1 produces identity-bound `PASS` | PASS |
| Wrong expected run ID fails closed | PASS |
| Wrong expected phase ID fails closed | PASS |
| Missing configured artifact fails closed | PASS |
| Linux symlink is rejected | PASS |
| Outside-root path is rejected | PASS |
| Artifact V1 schema validation succeeds for real artifacts | PASS |
| 1 MiB loader bound is respected by the real 5-minute artifact | PASS |
| `persistent_evidence_summary` remains separate and present | PASS |
| Replay-summary failure does not interrupt live hardware telemetry | PASS |
| Temporary resources and replay test environment are cleaned up | PASS |
| Final Pi repository is clean and aligned with `origin/main` | PASS |

## 24. Final Conclusion

Phase 7.2G-E-L-V successfully validated the backend replay-result artifact summary integration on the Raspberry Pi.

The backend consumed both real Replay Result Artifact V1 files without executing replay, correctly projected their validated metadata, and required matching external run and phase identities before reporting `PASS`. Invalid identities, missing files, symlinks, and outside-root paths produced bounded `FAIL` summaries without affecting backend availability or the live hardware telemetry path. An absent artifact configuration correctly remained `PENDING`.

The validation confirms that `persistent_replay_summary` is a bounded, startup-cached interpretation of an explicitly selected replay artifact and remains separate from the writer-owned `persistent_evidence_summary`.

## 25. Next Phase

The next phase is planning only:

```text
Phase 7.2G-E-M — Frontend Persistent Replay Report Integration Planning
```

Phase E-M is not implemented by this document.

## 26. Final Status

```text
PHASE_7_2G_E_L_V_BACKEND_REPLAY_RESULT_ARTIFACT_SUMMARY_VALIDATION: PASS
```
