# August Report — NOVA SC Replay Result Report Integration and Artifact Schema Implementation

## 1. Executive Summary

This report documents the two completed NOVA SC phases immediately preceding Phase 7.2G-E-K-V:

1. Phase 7.2G-E-J — Replay Result Report Integration Planning
2. Phase 7.2G-E-K — Replay Result Artifact Schema Investigation and Implementation

Phase E-J established the architecture for carrying a verified backend persistent-evidence replay result into future supervisory reports without weakening evidence or safety claims. It compared manual documentation, a machine-readable replay-result artifact, backend summary integration, and frontend report-export integration. The selected architecture is staged: create a versioned artifact first, validate and summarize it in the backend later, and expose only that controlled summary to the frontend in a subsequent phase.

Phase E-K implemented the first stage. `backend/evidence_replay.py` can now map `EvidenceReplayResult` into a versioned JSON artifact when an operator supplies an explicit `--output` path. The implementation preserves strict PASS/FAIL semantics, embeds limitations and explicit false non-claims, blocks output within the source evidence run, writes through a unique same-directory temporary file, flushes and fsyncs it, and publishes it with `os.replace`. Generated results under `backend/replay_results/` are ignored by Git.

The implementation and its unit-test evidence support these claims:

- Replay-result report integration architecture has been planned.
- Replay Result Artifact Schema V1 has been implemented.
- Explicit `--output` artifact generation has been implemented.
- Path safety and atomic publication behavior have been unit-tested.
- Existing stdout behavior remains available.
- PASS and FAIL replay results can both be represented without reinterpreting the verifier verdict.

This report does not claim Phase 7.2G-E-K-V completion. No real Pi replay artifact was generated during this task. Backend report integration and frontend report-export integration remain unimplemented.

Final report status:

```text
AUGUST_REPORT_REPLAY_RESULT_REPORT_INTEGRATION_AND_ARTIFACT_SCHEMA: READY_FOR_REVIEW
```

## 2. Objective

The objective is to create a technical record of what Phase E-J planned and what Phase E-K investigated and implemented before artifact-generation validation begins.

The report answers:

- Why persistent replay needed a controlled report-integration boundary.
- How frontend bounded replay differs from backend persistent-evidence replay.
- Why a versioned JSON artifact was selected as the first integration mechanism.
- How Artifact Schema V1 represents replay identity, verification results, diagnostics, limitations, and non-claims.
- How `--output`, path containment checks, and atomic writes protect runtime evidence.
- Which behaviors are supported by unit tests.
- Which claims remain unavailable until E-K-V, E-L, and E-M are completed.

This is documentation-only work. It does not modify or execute the replay/report integration pipeline.

## 3. System Context

NOVA SC persistent evidence follows a backend-owned filesystem model:

```text
Hardware telemetry
        |
        v
Raspberry Pi backend persistent evidence writer
        |
        v
Finalized evidence run
  manifest.json
  summary.json
  integrity.json
  events_*.ndjson
        |
        v
Offline persistent evidence replay verifier
```

The evidence writer records append-only NDJSON segments and finalization metadata. The replay verifier performs read-only validation of finalized evidence by checking metadata identity, segment continuity, deterministic order, event counts, malformed lines, writer health, segment SHA-256 values, and run-root SHA-256 consistency.

The report-integration problem begins after replay succeeds: a CLI verdict is useful to an operator, but it is not yet a stable, versioned input contract for backend report construction or frontend export.

The required artifact flow is:

```text
Finalized evidence run
        ↓
backend/evidence_replay.py
        ↓
EvidenceReplayResult
        ↓
build_replay_result_artifact()
        ↓
replay_result JSON artifact
        ↓
future backend report summary
        ↓
future frontend report export
```

The final two stages are architectural targets only; they are not implemented by Phase E-K.

## 4. Background: Persistent Evidence Before August Report Scope

Before E-J and E-K, NOVA SC already had the core persistent-evidence chain:

```text
write -> finalize -> hash -> replay -> verify
```

Relevant completed capabilities included:

- Backend append-only persistent evidence writing.
- Manifest, summary, and integrity finalization.
- Segment and run-root SHA-256 verification.
- A streaming offline replay verifier.
- Documented PASS replay validation for a 5-minute run and a 1-hour run.

Phase E-I documents the following replay evidence:

| Evidence Run | Result | Events Replayed | Segments | Malformed Lines | Failure Reasons |
|---|---|---:|---:|---:|---|
| 5-minute | PASS | 3521 | 1 | 0 | `[]` |
| 1-hour | PASS | 44074 | 9 | 0 | `[]` |

The 1-hour expected and actual run-root SHA-256 matched:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

Those results established that the verifier could validate both single-segment and multi-segment evidence. However, the replay result existed as CLI JSON and validation documentation. Exported supervisory reports did not have a controlled machine-readable persistent-replay source.

The existing frontend replay fields were not a substitute. Frontend bounded replay reconstructs recent supervisory state from a bounded browser-side event store. Backend persistent evidence replay verifies finalized filesystem evidence. Conflating them would allow a report to imply durable evidence validation from a mechanism that does not provide it.

| Mechanism | Purpose | Status |
|---|---|---|
| Frontend bounded replay | Reconstruct recent frontend/supervisory event state | Existing but not persistent evidence replay |
| Backend persistent evidence replay | Verify finalized backend filesystem evidence | Implemented and validated |
| Replay result artifact | Machine-readable replay validation result | Implemented in E-K |
| Backend report integration | Controlled backend ingestion/report summary | Not implemented |
| Frontend report export integration | Display replay result in exported report | Not implemented |

## 5. Phase 7.2G-E-J Overview

Phase E-J was an architecture and planning phase. Its purpose was to define how a validated offline replay result should eventually enter NOVA SC reports without causing the backend or frontend to infer unsupported success.

The planning document identified the central gap:

- Persistent evidence could be written, finalized, hashed, replayed, and verified.
- The replay verifier returned structured `EvidenceReplayResult` data and CLI JSON.
- Existing supervisory report fields described frontend bounded replay and live writer state.
- No dedicated persistent replay result was included in exported reports.

E-J therefore defined report fields, ownership boundaries, PASS/FAIL/PENDING behavior, runtime evidence rules, failure handling, and a staged implementation sequence.

## 6. Phase 7.2G-E-J Technical Findings

### 6.1 Existing result readiness

`EvidenceReplayResult` already contained the technical evidence needed for controlled reporting:

- Run and phase identity.
- Segment count and filename continuity.
- Deterministic segment order.
- Replayed and summary event counts.
- Writer error and persistent-drop counts.
- Malformed-line count.
- Segment hash verification.
- Expected and actual run-root SHA-256 values.
- Run-root match status.
- Source/component counts.
- First and last bounded event metadata.
- Replay timestamps.
- Failure reasons and per-segment diagnostics.

The missing element was a stable persistence and ingestion contract, not additional raw-evidence analysis.

### 6.2 Integration options considered

| Option | Description | Benefit | Principal Risk | E-J Decision |
|---|---|---|---|---|
| A | Manual Markdown documentation only | No runtime changes and easy human review | Manual drift; reports remain incomplete | Interim state only |
| B | Backend replay-result JSON artifact | Versioned, deterministic, testable handoff | Stale/mismatched artifact or unsafe output path | Recommended next step |
| C | Backend report summary integration | Centralized validation and claim control | Wrong/stale artifact association | Implement after schema stability |
| D | Frontend report panel/export integration | Makes status visible in normal exports | Frontend inference or confusion with bounded replay | Implement last and display-only |

E-J treated B, C, and D as ordered stages rather than competing alternatives.

### 6.3 Proposed report fields

E-J proposed a dedicated `persistent_replay_summary`, separate from existing frontend replay fields. Core fields included:

- `persistent_replay_validated`
- `replay_validation_status`
- `replay_phase_id`
- `replay_run_id`
- `replay_result_generated_utc`
- `replay_target_run_dir`
- `replay_segment_count`
- `replay_total_events`
- `replay_summary_events_written`
- `replay_malformed_lines`
- `replay_hash_verified`
- `replay_run_root_match`
- `replay_run_root_sha256`
- `replay_failure_reasons`
- `replay_validation_scope`
- `replay_validation_limitations`

Supporting fields were proposed for continuity, deterministic order, writer errors, persistent drops, expected and actual roots, verifier/schema identity, and a sanitized artifact reference.

### 6.4 Failure handling

The E-J policy is fail-closed:

| Condition | Report State | Rule |
|---|---|---|
| No artifact | PENDING | Never infer PASS from writer metadata |
| Unreadable or invalid schema | FAIL | Expose schema/artifact reason |
| Unsupported version | FAIL | Require a compatible consumer |
| Artifact says FAIL | FAIL | Preserve all verifier reasons |
| Run identity mismatch | FAIL | Do not merge data |
| Continuity/order/count/hash/root failure | FAIL | Preserve the failed check and diagnostics |
| Writer errors, drops, or malformed lines | FAIL under strict V1 | Preserve exact counts |
| PASS with non-empty failure reasons | FAIL as internally inconsistent | Suppress validated claim |

### 6.5 Claim control

Persistent replay may be reported as validated only when an explicit schema-valid artifact reports PASS, contains no failure reasons, and satisfies every strict invariant. Writer finalization, hash availability, live telemetry health, and frontend replay reconstruction cannot independently set `persistent_replay_validated=true`.

## 7. Phase 7.2G-E-J Architecture Decision

The selected architecture is artifact-first and staged:

```text
E-J  Plan the report boundary and claim rules
 |
 v
E-K  Define and implement the replay-result artifact
 |
 v
E-L  Load and validate an explicitly selected artifact in the backend
 |
 v
E-M  Render the backend-controlled summary in frontend report export
```

### Backend boundary

- Replay remains offline and operator initiated.
- Backend startup must not scan or replay evidence directories.
- Future backend integration must load only an explicitly selected artifact.
- Schema, identity, strict invariants, and limitations must be validated before exposure.
- The backend must not infer replay success from live writer state or raw NDJSON.
- Missing data remains PENDING/NOT_VALIDATED; invalid attempted data fails closed.

### Frontend boundary

- The frontend remains display-only.
- It must not access evidence directories or execute replay.
- It must preserve backend PASS/FAIL/PENDING exactly.
- Persistent replay must be labeled distinctly from frontend replay reconstruction.
- Missing replay data must never become PASS.

### Runtime evidence handling

- Evidence runs remain read-only replay inputs.
- Replay-result artifacts live outside source run directories.
- Reports should reference bounded summaries rather than copy NDJSON evidence.
- No automatic artifact discovery may silently associate the wrong run.
- Absolute host paths should be sanitized before future user-facing report exposure.

## 8. Phase 7.2G-E-K Overview

E-K followed because E-I had already demonstrated valid replay over one and nine segments, and E-J had selected a versioned artifact as the next integration boundary.

The E-K investigation found that `EvidenceReplayResult` was already schema-ready. It is bounded, serializable, strict, and excludes raw event bodies. The implementation therefore focused on controlled mapping, validation, output safety, atomic persistence, and compatibility rather than changing replay algorithms.

Repository history confirms the phase sequence:

| Commit | Subject | State |
|---|---|---|
| `907c1ed` | Document Phase 7.2G-E-J replay result report integration planning | Committed |
| `c5296b1` | Document Phase 7.2G-E-K replay artifact schema investigation | Committed |
| `a8e94f8` | Implement Phase 7.2G-E-K replay result artifact schema | Committed; current HEAD |

The current working copy of the E-K investigation document has a pre-existing local replacement. For this report, technical investigation findings were taken from committed revision `c5296b1`; the local modification was inspected for Git-state reporting and was not altered.

## 9. Phase 7.2G-E-K Investigation Findings

### 9.1 Schema readiness

The investigation concluded that the existing result dataclasses already provided:

- Deterministic dictionary/JSON serialization.
- Strict PASS/FAIL construction.
- Complete bounded top-level diagnostics.
- Complete bounded per-segment diagnostics.
- No raw replay-event collection or packet payload retention.
- Existing writer-generated temporary fixtures and source-fingerprint tests.

### 9.2 Proposed identity

| Field | Value |
|---|---|
| Schema version | `1.0` |
| Artifact type | `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` |
| Generator | `backend.evidence_replay` |
| Validation scope | `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` |

### 9.3 Output policy

- Stdout remains the default behavior.
- Artifact creation requires explicit `--output`.
- No default output is placed in the evidence run.
- Resolved output equal to or below the resolved source run is rejected.
- A separate ignored location such as `backend/replay_results/` is the normal operator choice.

### 9.4 Atomic write plan

The proposed practical atomic-write standard was:

1. Create the destination parent only after output containment is accepted.
2. Create a unique temporary file in the destination directory.
3. Serialize deterministic JSON.
4. Append a newline.
5. Flush the language buffer.
6. Call `os.fsync` on the temporary file.
7. Publish with `os.replace`.
8. Remove the temporary file after failure where possible.

Using the destination directory keeps replacement on the same filesystem, which is important for atomic rename semantics.

### 9.5 Git hygiene

The investigation identified that `.gitignore` already excluded `backend/evidence/` but not generated replay-result artifacts. It recommended adding `backend/replay_results/` before implementation.

### 9.6 Test strategy

The proposed tests covered builders, schema validation, PASS/FAIL semantics, root-hash representation, exact limitations, exact non-claims, filename sanitization, unsafe output rejection, atomic writes, temporary-file cleanup, CLI exit codes, stdout compatibility, Git ignore behavior, and source evidence immutability using temporary writer-generated fixtures.

### 9.7 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Artifact weakens verifier semantics | Preserve status and require strict internal validation |
| Artifact written into source evidence | Resolve both paths and reject equal/descendant output |
| Partial artifact consumed later | Temporary file, flush, fsync, atomic replace |
| Existing CLI scripts break | Preserve stdout and existing exit behavior |
| Unsupported future version is misread | Exact schema-version constant and validation |
| Unsafe phase/run IDs become filenames | Sanitize filename components |
| Generated output enters source control | Ignore `backend/replay_results/` |
| Integrity claims become overstated | Embed exact limitations and false non-claims |

The investigation decision was `PROCEED_TO_PHASE_7_2G_E_K_IMPLEMENTATION`.

## 10. Phase 7.2G-E-K Implementation Details

Commit `a8e94f8` changed only:

- `.gitignore`
- `backend/evidence_replay.py`
- `backend/test_evidence_replay.py`

The commit added 731 lines across those files.

### 10.1 Constants

The implementation added:

```python
REPLAY_ARTIFACT_SCHEMA_VERSION = "1.0"
REPLAY_ARTIFACT_TYPE = "NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT"
REPLAY_ARTIFACT_GENERATOR = "backend.evidence_replay"
REPLAY_ARTIFACT_VALIDATION_SCOPE = "BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY"
```

It also added fixed limitation and non-claim collections plus required top-level and segment field collections.

### 10.2 Artifact builder

`build_replay_result_artifact(result)` maps the bounded replay result to stable artifact field names. It:

- Adds schema identity and `generated_utc`.
- Preserves the exact replay status.
- Sets `persistent_replay_validated` only for PASS with no failure reasons.
- Copies run identity, timestamps, counts, continuity/order flags, hashes, diagnostics, and segment results.
- Sets the canonical `replay_run_root_sha256` only when expected and actual roots are present, equal, and `run_root_match` is true.
- Embeds fixed limitations and explicit false non-claims.

### 10.3 Artifact validator

`validate_replay_artifact_dict(artifact)` returns validation error codes rather than silently normalizing inconsistent data. It checks:

- Required top-level fields and exact constants.
- Non-empty generation timestamp.
- PASS/FAIL status and failure-reason shape.
- `persistent_replay_validated` consistency.
- PASS-with-failures and FAIL-without-failures inconsistencies.
- Expected/actual/canonical root consistency.
- Segment list shape, count, and required segment fields.
- Exact limitation and non-claim collections.
- Strict PASS requirements for continuity, order, hashes, root match, zero errors/drops/malformed lines, and event-count equality.

### 10.4 Artifact writer

`write_replay_result_artifact(result, output_path)`:

- Resolves the explicit destination.
- Rejects a destination inside the source evidence run.
- Builds and validates the artifact before publication.
- Rejects an existing directory as the final file target.
- Creates the destination parent.
- Writes formatted, sorted JSON through `NamedTemporaryFile`.
- Flushes and fsyncs the temporary file.
- Publishes with `os.replace`.
- Attempts temporary-file cleanup after failure.

### 10.5 Filename sanitization

`sanitize_replay_artifact_filename(phase_id, run_id)` converts phase/run identity into a filesystem-safe generated name, supplies fallback components for missing identity, and constrains unsafe characters.

### 10.6 Git ignore update

`.gitignore` now includes:

```gitignore
backend/evidence/
backend/replay_results/
```

The evidence-run ignore rule was preserved.

## 11. Replay Result Artifact Schema V1

### 11.1 Top-level fields

| Category | Fields |
|---|---|
| Artifact identity | `artifact_schema_version`, `artifact_type`, `generated_utc`, `generator`, `validation_scope` |
| Verdict | `validation_status`, `persistent_replay_validated`, `replay_failure_reasons` |
| Run identity | `replay_phase_id`, `replay_run_id`, `replay_target_run_dir` |
| Time | `replay_started_utc`, `replay_completed_utc` |
| Counts | `replay_segment_count`, `replay_total_events`, `replay_summary_events_written`, `replay_writer_errors`, `replay_persistent_events_dropped`, `replay_malformed_lines` |
| Verification | `replay_segment_filename_continuity`, `replay_deterministic_order_verified`, `replay_hash_verified`, `replay_run_root_match` |
| Root diagnostics | `replay_run_root_sha256`, `replay_run_root_sha256_expected`, `replay_run_root_sha256_actual` |
| Bounded replay context | `replay_source_component_counts`, `replay_first_event_metadata`, `replay_last_event_metadata`, `replay_segments` |
| Claim boundary | `replay_validation_limitations`, `non_claims` |

### 11.2 Segment fields

Each item in `replay_segments` contains:

- `filename`
- `exists`
- `byte_count_expected`
- `byte_count_actual`
- `sha256_expected`
- `sha256_actual`
- `hash_match`
- `event_count_expected`
- `event_count_actual`
- `malformed_lines`
- `first_event_metadata`
- `last_event_metadata`
- `failure_reasons`

Raw NDJSON lines, parsed event arrays, packet payloads, and file contents are deliberately excluded.

### 11.3 Required limitations

Artifact V1 carries these exact limitations:

1. SHA-256 verification detects mismatch against recorded metadata but is not cryptographic attestation.
2. Replay validation does not prove tamper-proof storage.
3. Replay validation does not certify production archive readiness.
4. Replay validation does not validate frontend report integration.
5. Replay validation does not validate FRAM checkpoint storage.
6. Replay validation does not validate actuator or control readiness.

### 11.4 Required non-claims

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

These are machine-checkable boundaries, not explanatory comments that a later consumer may accidentally omit.

## 12. CLI --output Behavior

The CLI remains:

```text
python -m evidence_replay --run-dir <read-only-run>
```

With no `--output`, it prints the existing replay result JSON to stdout and returns `0` for PASS or `1` for FAIL.

Artifact generation is explicit:

```text
python -m evidence_replay \
  --run-dir <read-only-run> \
  --output <separate-replay-result.json>
```

Behavior with `--output`:

- Replay result JSON is still printed to stdout.
- A schema-valid artifact is written to the explicit safe path.
- PASS replay plus successful artifact write returns `0`.
- FAIL replay still writes a FAIL artifact when possible and returns `1`.
- Artifact write failure emits `Replay result artifact write failed: ...` to stderr and returns `1`.
- `--pretty` continues to control stdout formatting.

The implementation does not create a default artifact and does not automatically select a source evidence run or destination.

## 13. Path Safety and Runtime Evidence Protection

Before creating destination directories or files, the writer resolves both:

- `result.run_dir`
- the explicit `output_path`

It rejects the destination when:

- the resolved output equals the resolved source run directory; or
- the resolved source run directory appears in the output's resolved parent chain.

This parent-based comparison avoids unsafe string-prefix logic and covers source metadata and segment paths such as:

- `manifest.json`
- `summary.json`
- `integrity.json`
- `events_000001.ndjson`
- any other descendant path

This report task maintained the same boundary:

- `backend/evidence/` was not modified.
- backend/evidence/ was not modified.
- No runtime evidence was moved, copied, compressed, deleted, read fully, or edited.
- No replay artifacts were generated into source evidence directories.
- No real replay artifacts were generated anywhere during this task.
- The report is based on source code, committed validation documentation, Git metadata, and previously captured safe unit-test output.

## 14. Atomic Artifact Writing Design

The implementation's publication sequence is:

```text
Resolve and validate destination
        |
        v
Build Artifact V1 dictionary
        |
        v
Validate schema and strict invariants
        |
        v
Create unique temp file in destination directory
        |
        v
Write sorted, indented JSON + newline
        |
        v
flush() -> os.fsync()
        |
        v
os.replace(temp, final)
```

Why this matters:

- A later consumer should not observe a partially written final JSON file.
- Unique temporary names avoid temporary-file collision between invocations.
- Same-directory replacement avoids cross-filesystem rename problems.
- `fsync` requests that temporary-file content reach the operating-system storage boundary before publication.
- Cleanup reduces abandoned temporary files after an exception.

This is practical atomic file publication. It does not make the artifact tamper-proof, independently attested, or immune to storage failure.

## 15. PASS/FAIL Artifact Semantics

### PASS artifact

A PASS artifact can set `persistent_replay_validated=true` only when:

- `validation_status == "PASS"`.
- `replay_failure_reasons` is empty.
- Segment filename continuity is true.
- Deterministic order is verified.
- Segment hashes are verified.
- Expected and actual run roots match.
- Writer errors are zero.
- Persistent event drops are zero.
- Malformed lines are zero.
- Replayed event count equals the writer summary count.

The canonical `replay_run_root_sha256` is populated only for a verified expected/actual match.

### FAIL artifact

A FAIL replay remains FAIL. Artifact creation does not upgrade, downgrade, or reinterpret it.

- `persistent_replay_validated` is false.
- Failure reasons are preserved.
- Expected and actual roots are retained when available for diagnosis.
- The canonical root is null when expected and actual do not match.
- A FAIL artifact can still be useful because it gives future report integration a controlled, machine-readable failure result.
- CLI exit status remains `1` even when the FAIL artifact is written successfully.

The validator also rejects contradictory representations, including PASS with failure reasons or FAIL without failure reasons.

## 16. Test Coverage and Verification

### 16.1 E-K test additions

The replay suite contains 43 tests after E-K. Added coverage includes:

- PASS artifact identity and validated semantics.
- FAIL artifact diagnostics and false validated state.
- Verified and mismatched run-root representation.
- Exact limitations and non-claims.
- Valid PASS/FAIL schema acceptance.
- Missing required fields and inconsistent PASS rejection.
- Filename sanitization.
- Safe explicit output writing.
- Equal/descendant source-run path rejection.
- Rejection of source metadata and segment file destinations.
- Atomic final JSON and absence of leftover temporary files.
- Replacement failure, nonzero exit, actionable stderr, and cleanup.
- Default and pretty stdout compatibility.
- PASS and FAIL CLI output behavior.
- Source evidence fingerprint immutability in temporary fixtures.
- Git ignore coverage for `backend/replay_results/`.

### 16.2 Test execution status for this report

The backend suites were not rerun during this documentation task because the worktree was not clean at task start. It already contained a modified E-K investigation document and an unrelated untracked Week 9 report. This follows the brief's condition to run safe tests only when the source tree is clean.

The immediately preceding E-K implementation verification captured these exact outputs:

```text
python -m py_compile evidence_replay.py test_evidence_replay.py
Exit code: 0
No output
```

```text
python -m unittest test_evidence_replay.py
...........................................
----------------------------------------------------------------------
Ran 43 tests in 1.977s

OK
```

```text
python -m unittest test_evidence_writer.py test_evidence_replay.py
...........................................................
----------------------------------------------------------------------
Ran 59 tests in 2.409s

OK
```

No test in this report task targeted real runtime evidence, and no replay artifact was created.

### 16.3 Validation matrix

| Capability | Status |
|---|---|
| E-J planning document | Completed |
| E-K investigation document | Completed |
| Artifact schema V1 | Implemented |
| CLI `--output` | Implemented |
| Atomic artifact writing | Implemented |
| Unsafe output inside evidence run rejected | Implemented/tested |
| `backend/replay_results/` ignored | Implemented |
| Artifact generation against real Pi evidence | Not yet validated |
| Backend report integration | Not implemented |
| Frontend report integration | Not implemented |
| FRAM validation | Not validated |
| Actuator/control readiness | Not validated |

## 17. What Is Now Validated

Within the allowed claim boundary:

- The replay-result report-integration architecture has been planned in E-J.
- The artifact-first sequence E-K -> E-L -> E-M has been defined.
- Artifact Schema V1 has been implemented in `backend/evidence_replay.py`.
- Explicit `--output` support has been implemented.
- Artifact dictionaries include strict result evidence, limitations, and non-claims.
- PASS and FAIL artifact behavior has unit-test coverage.
- Output equal to or inside a source evidence run is rejected and tested with temporary fixtures.
- Atomic temporary-file publication and cleanup behavior has unit-test coverage.
- Existing stdout behavior has compatibility tests.
- `backend/replay_results/` is ignored by Git.
- Prior E-I replay validation remains documented as PASS for 3521-event/one-segment and 44074-event/nine-segment evidence runs.

“Implemented and unit-tested” is not the same as “validated against real Pi evidence.” That latter step belongs to E-K-V.

## 18. What Is Still Not Validated

The following remain outside completed E-J/E-K claims:

- E-K-V artifact generation against the documented real Pi evidence runs.
- Actual replay-result artifact contents for the real 5-minute and 1-hour runs.
- Backend loading, schema validation, run association, and summary exposure.
- Frontend persistent-replay summary types and exported report fields.
- PASS/FAIL/PENDING rendering in the report UI.
- Long-term artifact retention, signing, independent attestation, or archive certification.
- Tamper-proof storage.
- Clinical readiness.
- FRAM checkpoint validation.
- Actuator/control, GPIO, PWM, or PCA9685 readiness.
- Safety-interlock, watchdog, or fail-safe validation.

## 19. Engineering Use of These Two Phases

E-J and E-K improve persistent-evidence reliability by converting an informal handoff into a controlled contract.

Before E-J/E-K:

- Persistent evidence could be replayed offline.
- The verifier produced a structured result and CLI JSON.
- Human validation reports could record the outcome.
- Exported reports had no authoritative persistent-replay artifact source.

After E-J:

- Manual documentation, JSON artifacts, backend integration, and frontend integration were compared explicitly.
- The artifact-first staged architecture was selected.
- Backend and frontend ownership boundaries were defined.
- PASS/FAIL/PENDING and claim-control rules were documented.
- Failure handling became fail-closed and identity-aware.

After E-K:

- The verifier can produce a versioned replay-result JSON artifact.
- Artifact generation occurs only with explicit `--output`.
- Output inside source evidence runs is blocked.
- Atomic publication reduces partial-file risk.
- PASS/FAIL semantics and diagnostics are preserved.
- Non-claims travel with the result.
- Generated replay results are excluded from Git by default.

This creates a stable source contract for E-L without requiring E-L to parse raw NDJSON, execute replay during backend startup, or infer success from live writer fields.

## 20. Safety and Claim Boundaries

Allowed claims after these phases:

- Replay-result report integration architecture has been planned.
- Replay Result Artifact Schema V1 has been implemented.
- Explicit `--output` support has been implemented.
- Artifact path safety and atomic writing behavior have been unit-tested.
- `backend/replay_results/` is ignored by Git.
- No frontend, firmware, actuator/control, PWM, GPIO, PCA9685, or FRAM behavior was modified.

Claims not allowed:

- Phase E-K-V is complete.
- Real Pi replay artifacts were generated by this task.
- Backend report integration is complete.
- Frontend report export integration is complete.
- Evidence or artifacts are tamper-proof.
- Cryptographic attestation exists.
- Production archive certification exists.
- Clinical readiness exists.
- FRAM is validated.
- Actuator/control, GPIO, PWM, or PCA9685 readiness exists.

SHA-256 verifies consistency against recorded metadata. It does not identify the actor who produced the files, prevent later modification, or establish independent trust.

## 21. Risks Reduced

| Risk | Reduction Introduced by E-J/E-K |
|---|---|
| Frontend replay confused with persistent replay | Separate terminology and dedicated future summary contract |
| PASS inferred from live writer metadata | Artifact-only claim rule and fail-closed planning |
| Manual transcription drift | Versioned machine-readable result |
| Partial JSON artifact consumed later | Same-directory temporary write, flush, fsync, replace |
| Source evidence overwritten by result output | Resolved equal/descendant path rejection |
| Failure diagnostics lost | FAIL artifact preserves reasons, counts, hashes, and segments |
| Existing CLI automation broken | Stdout and exit semantics retained and tested |
| Unsupported claims escape downstream | Exact limitations and explicit false non-claims |
| Generated artifacts accidentally committed | `backend/replay_results/` ignore rule |
| Wrong schema silently accepted | Version/type/generator/scope and required-field validation |

## 22. Remaining Risks

| Remaining Risk | Why It Remains | Future Control |
|---|---|---|
| Real-evidence artifact path/platform behavior | Only temporary-fixture unit coverage is complete | E-K-V on Pi evidence host |
| Stale or wrong artifact selected | E-K creates artifacts but does not associate them with reports | E-L explicit selection and run-identity validation |
| Host-absolute path exposure | Artifact preserves replay target path | E-L sanitization before report exposure |
| Artifact modification after generation | JSON is unsigned | Do not overclaim; separate signing/attestation design if required |
| Unknown future schema version | V1 consumer not implemented yet | E-L fail closed on unsupported versions |
| Frontend status reinterpretation | E-M not implemented | Backend-owned summary and display-only frontend |
| Artifact retention/cleanup policy | Generated results are ignored but not lifecycle-managed | Separate retention/archive planning |
| Local dirty investigation document | Working copy diverges from committed investigation | Review separately; do not conflate with E-K implementation commit |

## 23. Next Recommended Phase: 7.2G-E-K-V

Phase 7.2G-E-K-V should validate Artifact Schema V1 generation against the already documented real Pi evidence runs without changing implementation behavior.

Recommended validation goals:

- Generate artifacts only to an explicit safe path outside each source evidence run.
- Confirm the 5-minute artifact reports PASS, 3521 events, one segment, zero malformed lines, and no failure reasons.
- Confirm the 1-hour artifact reports PASS, 44074 events, nine segments, zero malformed lines, no failure reasons, and the verified run root:

```text
88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
```

- Validate each artifact with `validate_replay_artifact_dict` or the approved CLI path.
- Confirm source evidence hashes, sizes, and timestamps remain unchanged.
- Confirm generated artifacts appear only in the separate result location.
- Retain explicit non-claims.

This report does not perform those steps and does not mark E-K-V complete.

## 24. Conclusion

Phase E-J solved the architecture question: persistent replay results should reach reports through a staged, artifact-first boundary with strict claim control. Phase E-K implemented that boundary's first concrete contract: a versioned, validated, explicitly generated, path-safe, atomically published replay-result JSON artifact.

The result is a cleaner separation of responsibilities:

- The evidence writer owns durable event capture and finalization.
- The replay verifier owns offline evidence verification.
- Artifact V1 owns the machine-readable handoff.
- Future E-L will own backend artifact validation and summary formation.
- Future E-M will own display and export of the backend-controlled summary.

This sequencing matters because it prevents UI convenience, live telemetry state, or writer finalization from being mistaken for persistent replay validation. The code is ready for E-K-V artifact-generation validation, but that validation remains a separate phase.

```text
AUGUST_REPORT_REPLAY_RESULT_REPORT_INTEGRATION_AND_ARTIFACT_SCHEMA: READY_FOR_REVIEW
```

## 25. Appendix A — Files Inspected

| File or Git Object | Purpose |
|---|---|
| `docs/validation/phase_7_2g_e_j_replay_result_report_integration_planning.md` | E-J architecture, fields, boundaries, failure handling, E-K/E-L/E-M sequence |
| `docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md` | Current working-copy state; identified as locally modified |
| `c5296b1:docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md` | Authoritative committed E-K investigation used for technical findings |
| `docs/validation/phase_7_2g_e_i_persistent_evidence_replay_validation_run.md` | Prior 5-minute and 1-hour replay validation context |
| `docs/validation/phase_7_2g_e_h_replay_verifier_implementation_investigation.md` | Original verifier design and strict replay boundary |
| `backend/evidence_replay.py` | Replay result, artifact builder/validator/writer, path checks, CLI |
| `backend/test_evidence_replay.py` | Replay and artifact unit coverage |
| `.gitignore` | Runtime evidence and replay-result ignore rules |
| Git commits `907c1ed`, `c5296b1`, `a8e94f8` | Phase commit state and implementation history |

`backend/evidence/` and runtime NDJSON were not inspected or read fully.

## 26. Appendix B — Commands and Outputs

Commands run during this report investigation:

```text
git status --short
git log --oneline --decorate -15
git branch -vv
git diff --check
git diff -- docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
git show -s --format=fuller 907c1ed
git show -s --format=fuller c5296b1
git show -s --format=fuller a8e94f8
git show c5296b1:docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
git show --stat --oneline a8e94f8
git check-ignore -v backend/replay_results/test.json
rg ... <source and documentation files>
Get-Content ... <source and documentation files>
```

Initial Git status:

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

Initial `git diff --check` result:

```text
warning: in the working copy of 'docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md', LF will be replaced by CRLF the next time Git touches it
```

No whitespace error was reported. The warning describes Git line-ending normalization.

Replay-result ignore verification:

```text
.gitignore:44:backend/replay_results/    backend/replay_results/test.json
```

The generated replay-results directory is therefore excluded by the active Git ignore rule.

Backend compile and unit-test commands were not rerun in this report task because the worktree was dirty at entry. Their immediately preceding E-K implementation outputs are reproduced in Section 16 and are not represented as newly executed report-task tests.

Phase E-K-V was not run. No command read or targeted real runtime evidence.

## 27. Appendix C — Current Git State

State observed before creating this report:

| Field | Value |
|---|---|
| Current branch | `main` |
| HEAD | `a8e94f8b0a79e4304b7e85a5911e0c0a82d9afbb` |
| HEAD subject | `Implement Phase 7.2G-E-K replay result artifact schema` |
| Upstream | `origin/main` |
| Alignment | `main` and `origin/main` point to `a8e94f8`; no ahead/behind count shown |
| E-J committed | Yes, `907c1ed` |
| E-K investigation committed | Yes, `c5296b1` |
| E-K implementation committed | Yes, `a8e94f8` |
| Modified tracked file | `docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md` |
| Unrelated untracked file | `docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md` |

The modified investigation document and untracked Week 9 report predated this report task and were not changed. This August report is expected to appear as one additional untracked documentation file until reviewed and committed separately.

Post-creation `git status --short`:

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/august_nova_sc_replay_result_report_integration_and_artifact_schema_report.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

Only the August report was created by this task. The other two entries were preserved as pre-existing user-owned worktree state.
