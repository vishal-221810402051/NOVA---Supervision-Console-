# Phase 7.2G-E-K-V — Replay Result Artifact Generation Validation

## 1. Executive Summary

Phase 7.2G-E-K-V validated the Phase 7.2G-E-K replay-result artifact implementation on the NOVA SC Raspberry Pi using the two previously captured persistent evidence runs:

- The 5-minute `PHASE_7_2G_E_F_A` run.
- The 1-hour `PHASE_7_2G_E_F_B` run.

The Raspberry Pi transcript shows that both evidence runs were found, replayed through `backend/evidence_replay.py`, and written as explicit JSON artifacts under `backend/replay_results/`, outside their source evidence directories. Both generated artifacts passed `validate_replay_artifact_dict(...)` with `schema_errors: []`, reported `validation_status: PASS`, and set `persistent_replay_validated: True`.

Measured artifact evidence:

| Evidence Run | Events | Segments | Hash Verified | Run Root Match | Result |
|---|---:|---:|---|---|---|
| 5-minute | 3521 | 1 | True | True | PASS |
| 1-hour | 44074 | 9 | True | True | PASS |

The unsafe-output validation attempted to place `replay_result.json` inside the 5-minute source evidence run. The command returned `UNSAFE_EXIT=1`, emitted the expected containment error, and confirmed both `UNSAFE_OUTPUT_REJECTION: PASS` and `NO_UNSAFE_ARTIFACT_CREATED: PASS`.

The functional E-K-V artifact validation passed. However, the supplied transcript does not capture the `python -m py_compile evidence_replay.py test_evidence_replay.py` command or its exit result. It also records `Ran 43 tests in 5.005s` without a standalone `OK` line directly associated with that run. Under the phase brief's evidence rule, these omissions require the documented status:

```text
PHASE_7_2G_E_K_V_REPLAY_RESULT_ARTIFACT_GENERATION_VALIDATION: PASS_WITH_MISSING_DOCUMENTED_OUTPUTS
```

This phase does not implement backend report integration or frontend report export integration. It does not establish tamper-proof storage, cryptographic attestation, production archive certification, FRAM validation, or actuator/control readiness.

## 2. Objective

The objective of Phase 7.2G-E-K-V was to validate, on the Raspberry Pi, that the E-K implementation can:

- Generate Artifact Schema V1 from real finalized NOVA SC persistent evidence.
- Use an explicit `--output` path outside the source evidence run.
- Generate artifacts for both single-segment and multi-segment evidence.
- Validate generated artifacts through `validate_replay_artifact_dict(...)`.
- Preserve strict replay PASS/FAIL semantics.
- Reject an unsafe output path inside a source evidence run.
- Avoid creating an artifact after unsafe-path rejection.
- Keep generated replay artifacts outside Git through the `backend/replay_results/` ignore rule.
- Preserve source evidence as read-only validation input.

## 3. System Context

The validated flow was:

```text
Finalized evidence run
        ↓
backend/evidence_replay.py
        ↓
EvidenceReplayResult
        ↓
Replay result artifact JSON
        ↓
Future backend/report integration
```

The replay verifier reads finalized evidence, checks segment order and continuity, replays NDJSON records, compares event counts, verifies segment hashes, recomputes the run-root SHA-256, and returns a strict `EvidenceReplayResult`.

Phase E-K added the versioned artifact boundary and explicit `--output` support. Phase E-K-V validates that boundary on the Raspberry Pi with previously captured hardware evidence.

The final `Future backend/report integration` step is not part of this phase. Backend summary integration and frontend report-export integration remain future work.

Previous completed phases providing context:

| Phase | Purpose |
|---|---|
| Phase 7.2G-E-H | Persistent Evidence Replay Verifier Implementation |
| Phase 7.2G-E-I | Persistent Evidence Replay Validation Run |
| Phase 7.2G-E-J | Replay Result Report Integration Planning |
| Phase 7.2G-E-K | Replay Result Artifact Schema Implementation |

## 4. Repository State

The Raspberry Pi session started in:

```text
/home/nova/NOVA---Supervision-Console-
```

Platform evidence:

```text
Linux NOVA 6.18.33+rpt-rpi-v8 #1 SMP PREEMPT Debian 1:6.18.33-1+rpt1 (2026-06-01) aarch64
```

Repository update evidence:

```text
From https://github.com/vishal-221810402051/NOVA---Supervision-Console-
d180c45..a8e94f8  main       -> origin/main
Updating d180c45..a8e94f8
Fast-forward
```

The fast-forward included:

```text
.gitignore                                         |   3 +
backend/evidence_replay.py                         | 326 +++++++++
backend/test_evidence_replay.py                    | 402 +++++++++++
..._i_persistent_evidence_replay_validation_run.md | 388 +++++++++++
..._j_replay_result_report_integration_planning.md | 522 ++++++++++++++
...artifact_schema_implementation_investigation.md | 761 +++++++++++++++++++++
6 files changed, 2402 insertions(+)
```

HEAD and branch evidence:

```text
a8e94f8 (HEAD -> main, origin/main, origin/HEAD) Implement Phase 7.2G-E-K replay result artifact schema
```

| Field | Observed Value |
|---|---|
| Branch | `main` |
| HEAD | `a8e94f8` |
| E-K implementation included | Yes |
| Pull result | Fast-forward from `d180c45` to `a8e94f8` |
| Initial `git status --short` | No output observed |
| Final `git status --short` | No output observed |

The Pi repository was therefore clean in the captured status checks, and generated ignored artifacts did not appear as untracked files.

## 5. Test Readiness

The phase brief requested evidence for three commands.

### 5.1 Compile check

Requested command:

```text
python -m py_compile evidence_replay.py test_evidence_replay.py
```

Captured command/output:

```text
NOT_CAPTURED
```

The transcript does not show the literal compile command, output, or exit code. A silent successful `py_compile` run cannot be inferred without the command or exit status.

### 5.2 Replay test suite

Expected command:

```text
python -m unittest test_evidence_replay.py
```

Captured output:

```text
Ran 43 tests in 5.005s
```

The transcript records the expected test count and duration. A standalone `OK` line directly associated with this first suite is not captured.

### 5.3 Combined writer and replay test suite

Expected command:

```text
python -m unittest test_evidence_writer.py test_evidence_replay.py
```

Captured output:

```text
Ran 59 tests in 5.442s

OK
```

The combined suite passed with 59 tests.

No tests were rerun while creating this document. This report uses the supplied Raspberry Pi transcript as its primary validation source.

## 6. Artifact Generation Method

The operator defined the existing source evidence runs:

```text
RUN_5MIN=evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
RUN_1HOUR=evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
```

Both were confirmed present:

```text
5MIN_RUN_FOUND
1HOUR_RUN_FOUND
```

The operator created a separate output directory and selected explicit output filenames:

```text
mkdir -p replay_results

OUT_5MIN=replay_results/replay_result_PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8.json
OUT_1HOUR=replay_results/replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

Artifact generation used:

```text
python -m evidence_replay --run-dir "$RUN_5MIN" --output "$OUT_5MIN" --json
python -m evidence_replay --run-dir "$RUN_1HOUR" --output "$OUT_1HOUR" --json
```

The `--run-dir` values referenced existing finalized evidence. The `--output` values referenced `backend/replay_results/`, not `backend/evidence/` or either source run directory.

Generated artifact file evidence:

```text
-rw------- 1 nova nova 5.7K Sep  8 19:42 replay_results/replay_result_PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8.json
-rw------- 1 nova nova 19K Sep  8 19:43 replay_results/replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

These JSON files are generated runtime outputs and must not be committed.

## 7. 5-Minute Artifact Result

Artifact path:

```text
backend/replay_results/replay_result_PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8.json
```

| Field | Captured Value |
|---|---|
| `validation_status` | `PASS` |
| `persistent_replay_validated` | `True` |
| `replay_phase_id` | `PHASE_7_2G_E_F_A` |
| `replay_run_id` | `EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8` |
| `replay_segment_count` | `1` |
| `replay_total_events` | `3521` |
| `replay_hash_verified` | `True` |
| `replay_run_root_match` | `True` |
| `replay_run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| `malformed_replay_lines` in replay output | `0` |
| `replay_failure_reasons` | `[]` |
| `schema_errors` | `[]` |

The single segment was `events_000001.ndjson`. The captured replay output reports matching expected and actual values:

| Segment Measurement | Expected | Actual |
|---|---:|---:|
| Byte count | 5330803 | 5330803 |
| Event count | 3521 | 3521 |

The captured expected and actual segment SHA-256 values both equal:

```text
c9d517b06b50f629adfc4288eb9fa128e413f1ff946aaad7005e356992410105
```

Result:

```text
5_MINUTE_REPLAY_RESULT_ARTIFACT: PASS
```

## 8. 1-Hour Artifact Result

Artifact path:

```text
backend/replay_results/replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

| Field | Captured Value |
|---|---|
| `validation_status` | `PASS` |
| `persistent_replay_validated` | `True` |
| `replay_phase_id` | `PHASE_7_2G_E_F_B` |
| `replay_run_id` | `EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7` |
| `replay_segment_count` | `9` |
| `replay_total_events` | `44074` |
| `replay_hash_verified` | `True` |
| `replay_run_root_match` | `True` |
| `replay_run_root_sha256` | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be` |
| `malformed_replay_lines` in replay output | `0` |
| `replay_failure_reasons` | `[]` |
| `schema_errors` | `[]` |

The expected and actual run-root SHA-256 values matched the known Phase E-I value:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

Nine continuous segment results were captured, from `events_000001.ndjson` through `events_000009.ndjson`. Their event counts were:

| Segment | Events |
|---|---:|
| `events_000001.ndjson` | 5340 |
| `events_000002.ndjson` | 5341 |
| `events_000003.ndjson` | 5340 |
| `events_000004.ndjson` | 5341 |
| `events_000005.ndjson` | 5340 |
| `events_000006.ndjson` | 5341 |
| `events_000007.ndjson` | 5340 |
| `events_000008.ndjson` | 5340 |
| `events_000009.ndjson` | 1351 |
| **Total** | **44074** |

Each captured segment reported equal expected and actual byte counts, equal expected and actual event counts, zero malformed lines, matching SHA-256 values, and an empty segment failure-reason list.

Result:

```text
1_HOUR_REPLAY_RESULT_ARTIFACT: PASS
```

## 9. Artifact Schema Validation

The two generated JSON artifacts were loaded and passed to:

```python
validate_replay_artifact_dict(artifact)
```

Captured schema results for both artifacts:

| Field | 5-Minute | 1-Hour |
|---|---|---|
| `schema_errors` | `[]` | `[]` |
| `artifact_schema_version` | `1.0` | `1.0` |
| `artifact_type` | `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` | `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` |
| `validation_scope` | `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` | `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` |
| `validation_status` | `PASS` | `PASS` |
| `persistent_replay_validated` | `True` | `True` |

Captured non-claims for both artifacts:

```text
actuator_control_readiness: False
clinical_readiness: False
cryptographic_attestation: False
fram_validation: False
frontend_report_integration: False
production_archive_certification: False
tamper_proof_storage: False
```

The validation script asserted that all non-claim values were false and completed with:

```text
ARTIFACT_SCHEMA_VALIDATION: PASS
```

## 10. Path Safety Validation

The operator attempted to write an artifact directly inside the 5-minute source evidence run:

```text
python -m evidence_replay \
  --run-dir "$RUN_5MIN" \
  --output "$RUN_5MIN/replay_result.json" \
  --json
```

Captured exit result:

```text
UNSAFE_EXIT=1
```

Captured stderr:

```text
Replay result artifact write failed: Replay artifact output must be outside the source evidence run directory: /home/nova/NOVA---Supervision-Console-/backend/evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
```

Captured assertions:

```text
UNSAFE_OUTPUT_REJECTION: PASS
NO_UNSAFE_ARTIFACT_CREATED: PASS
```

The implementation therefore failed closed for the unsafe path and did not create `replay_result.json` in the source evidence run.

## 11. Runtime Evidence Immutability Check

The operator searched both source evidence directories for replay-result JSON files:

```text
find "$RUN_5MIN" -maxdepth 1 -name "replay_result*.json" -print
find "$RUN_1HOUR" -maxdepth 1 -name "replay_result*.json" -print
```

Observed output:

```text
NO OUTPUT
```

This confirms that no `replay_result*.json` artifact was present at the top level of either source evidence directory after validation.

The transcript contains no move, copy, compression, deletion, or edit command against the evidence runs. Artifact output was directed to `backend/replay_results/`, and the unsafe in-run write was rejected before artifact creation.

Technical precision: replay validation necessarily reads and streams source evidence records to verify event counts and hashes. Therefore this document does not claim that the E-K-V verifier avoided reading the evidence. It claims that the evidence was used as read-only input and that no mutation is shown by the supplied transcript.

During creation of this Markdown document, local `backend/evidence/` was not opened, read fully, moved, copied, compressed, deleted, or modified.

## 12. Git Ignore / Artifact Storage Check

Before artifact generation, the Pi transcript captured:

```text
git check-ignore -v backend/replay_results/test.json
.gitignore:44/replay_results/   backend/replay_results/test.json
```

After artifact generation, both files were confirmed ignored:

```text
.gitignore:44/replay_results/   backend/replay_results/replay_result_PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8.json
.gitignore:44/replay_results/   backend/replay_results/replay_result_PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7.json
```

The transcript formatting omits part of the matched pattern after `.gitignore:44`; the repository rule implemented by E-K is `backend/replay_results/`.

The final `git status --short` produced no output. The generated artifacts therefore did not appear as untracked files.

Result:

```text
REPLAY_RESULTS_GIT_IGNORE: PASS
```

Generated replay-result artifacts are validation/runtime outputs and must not be committed.

## 13. Validation Result Matrix

| Validation Item | Result |
|---|---|
| Pi repo pulled E-K implementation | PASS |
| Backend compile check | NOT_CAPTURED |
| Replay tests on Pi | PASS_WITH_MISSING_STANDALONE_OK_LINE |
| Writer + replay tests on Pi | PASS |
| 5-minute artifact generated outside evidence | PASS |
| 5-minute artifact schema valid | PASS |
| 5-minute artifact reports 3521 events | PASS |
| 1-hour artifact generated outside evidence | PASS |
| 1-hour artifact schema valid | PASS |
| 1-hour artifact reports 44074 events | PASS |
| 1-hour artifact reports 9 segments | PASS |
| 1-hour run_root_sha256 matched expected value | PASS |
| Unsafe output path rejected | PASS |
| No unsafe artifact created | PASS |
| No artifacts written inside source evidence directories | PASS |
| `replay_results` artifacts ignored by Git | PASS |
| Runtime evidence used read-only with no mutation shown | PASS |
| Frontend untouched | PASS |
| Firmware/control untouched | PASS |

All artifact-generation, schema, path-safety, placement, and Git-ignore validations passed. The formal phase status retains a missing-output caveat because the compile evidence and first suite's standalone `OK` marker were not captured.

## 14. Engineering Interpretation

Phase E-K had already established strong unit-test coverage for Artifact Schema V1, explicit output handling, containment checks, atomic writing, temporary-file cleanup, PASS/FAIL preservation, and stdout compatibility.

E-K-V adds hardware-host validation against real previously captured NOVA SC evidence:

- The 5-minute case validates single-segment artifact generation.
- The 1-hour case validates multi-segment artifact generation across nine files.
- Both artifacts preserve the validated replay identity and event totals.
- Both artifacts validate against Schema V1 with no schema errors.
- Both report segment hash verification and run-root matching.
- The 1-hour artifact preserves the known root hash from Phase E-I.
- The explicit output path works under Raspberry Pi Linux filesystem behavior.
- The containment check blocks accidental publication into a source run.
- Generated artifacts remain outside Git status through the ignore rule.

This proves that machine-readable replay-result artifacts can be generated on the Raspberry Pi for future report integration. It does not mean the backend can yet ingest those artifacts into a controlled report summary, nor that the frontend can display or export such a summary.

## 15. Safety Boundary

This phase was offline evidence replay and artifact validation only.

- No firmware changes were made.
- No frontend changes were made.
- No backend live telemetry behavior was changed.
- No RTC synchronization or timestamp-authority behavior was changed.
- Raspberry Pi backend UTC remains timestamp authority.
- No GPIO behavior was changed or validated.
- No PWM behavior was changed or validated.
- No PCA9685 behavior was changed or validated.
- No FRAM validation was performed.
- No actuator or control readiness was established.
- No clinical readiness was established.
- No tamper-proof storage claim is made.
- No cryptographic-attestation claim is made.
- No production archive certification is claimed.

## 16. Claims Allowed

The supplied evidence supports these claims:

- Replay-result artifacts were generated on the Raspberry Pi for the 5-minute and 1-hour persistent evidence runs.
- Both generated artifacts passed Artifact Schema V1 validation.
- Both generated artifacts reported PASS.
- The 5-minute artifact verified 3521 events across one segment.
- The 1-hour artifact verified 44074 events across nine segments.
- The 5-minute run-root SHA-256 matched `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167`.
- The 1-hour run-root SHA-256 matched `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be`.
- Unsafe output inside the 5-minute source evidence run was rejected with exit code 1.
- No unsafe artifact was created.
- Generated artifacts were stored outside source evidence directories.
- Generated artifacts were ignored by Git.

## 17. Claims Not Allowed

This phase does not support claims that:

- Backend replay-result report integration is complete.
- Frontend report export integration is complete.
- Evidence or replay artifacts are tamper-proof.
- Cryptographic attestation exists.
- Production archive certification exists.
- FRAM validation exists.
- Actuator/control readiness exists.
- GPIO, PWM, or PCA9685 readiness exists.
- Clinical readiness exists.
- Compile evidence was captured in the supplied transcript.

## 18. Final Status

All captured functional artifact checks passed. The compile command/output and a standalone `OK` line for the 43-test suite were not captured. In accordance with the required missing-evidence policy:

```text
PHASE_7_2G_E_K_V_REPLAY_RESULT_ARTIFACT_GENERATION_VALIDATION: PASS_WITH_MISSING_DOCUMENTED_OUTPUTS
```

## 19. Next Step

Next recommended phase:

```text
Phase 7.2G-E-L — Backend Replay Result Artifact Summary Integration Planning
```

E-L should define the backend-only loading, schema validation, explicit artifact selection, run-identity matching, failure handling, and controlled summary contract. E-L is not implemented by this document.
