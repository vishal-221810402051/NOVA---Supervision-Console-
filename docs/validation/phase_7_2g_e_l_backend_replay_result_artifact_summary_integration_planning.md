# Phase 7.2G-E-L — Backend Replay Result Artifact Summary Integration Planning

## 1. Executive Summary

Phase 7.2G-E-L defines the safest V1 architecture for converting an explicitly selected, already-generated replay-result JSON artifact into a backend-owned `persistent_replay_summary`.

This is a planning and repository-investigation phase only. It does not implement artifact loading, execute replay, inspect raw NDJSON, modify runtime evidence, alter telemetry behavior, or change frontend, firmware, control, PWM, GPIO, PCA9685, or FRAM behavior.

The recommended V1 design is:

1. Select exactly one artifact with `NOVA_SC_REPLAY_RESULT_PATH`.
2. Bind it to externally configured `NOVA_SC_REPLAY_EXPECTED_RUN_ID` and `NOVA_SC_REPLAY_EXPECTED_PHASE_ID` before allowing a `PASS` claim.
3. Load it once during backend startup through a new `backend/replay_result_loader.py` module.
4. Restrict the selected artifact to `backend/replay_results/`, reject symlinks, require a regular JSON file, and enforce a `1 MiB` maximum.
5. Parse JSON only; never read the artifact's `replay_target_run_dir`, raw evidence directory, manifests, summaries, integrity files, or NDJSON segments.
6. Reuse `validate_replay_artifact_dict(...)` and add loader-side type, identity, path, and summary-projection checks.
7. Cache an immutable sibling `persistent_replay_summary` independently of the live writer-owned `persistent_evidence_summary`.
8. Expose the cached summary as a new `/health` field only in the first implementation phase.
9. Keep gateway telemetry, WebSocket payloads, frontend state, and report export unchanged until Phase E-M.
10. Convert every artifact-selection or validation problem into a bounded `FAIL` or `PENDING` summary without failing backend startup or live telemetry.

The state model remains deliberately small: `PASS`, `FAIL`, and `PENDING`. A missing configuration is `PENDING`; an explicitly configured but missing artifact is `FAIL`; an internally valid artifact without external identity binding remains `PENDING`; and only a strict, identity-bound Artifact V1 `PASS` may set `persistent_replay_validated=true`.

The repository is technically suitable for planning, but it is not clean enough to begin implementation without first preserving or disposing of existing user-owned documentation changes. The current branch is `main` at `9b317e2`, exactly aligned with `origin/main`. One tracked document is modified and one report is untracked. This document does not alter either file.

## 2. Objective

The objective is to lock the pre-implementation architecture for this missing layer:

```text
Explicit replay-result JSON artifact
        |
        v
Backend bounded loading and validation
        |
        v
Backend-owned persistent_replay_summary
        |
        v
Future frontend/report integration
```

The plan must ensure that the backend can eventually:

- Read one explicitly selected replay-result artifact.
- Validate Artifact Schema V1 and its strict replay semantics.
- Compare replay run and phase identity with values supplied outside the artifact.
- Preserve `PASS`, `FAIL`, and `PENDING` without inferring replay success from writer state.
- Preserve exact replay limitations and explicit false non-claims.
- Expose a compact, stable summary without leaking filesystem paths or segment internals.
- Remain read-only and isolated from serial ingestion, WebSocket delivery, RTC synchronization, evidence writing, firmware, and controls.

This phase does not implement the plan.

## 3. Current Validated Baseline

The completed chain entering this phase is:

| Phase | Result | Relevant Output |
|---|---|---|
| Phase 7.2G-E-H | Implemented and tested | Offline persistent-evidence replay verifier |
| Phase 7.2G-E-I | PASS | 5-minute and 1-hour evidence replay validation |
| Phase 7.2G-E-J | Planning complete | Staged artifact, backend, then frontend integration architecture |
| Phase 7.2G-E-K | Implemented | Versioned replay-result artifact schema and explicit output |
| Phase 7.2G-E-K-V | Functional artifact checks passed with documentation caveat | Real Pi Artifact V1 generation and validation |

Current validated pipeline:

```text
Persistent backend evidence
        |
        v
Finalization and SHA-256/run-root metadata
        |
        v
Explicit offline replay
        |
        v
Strict EvidenceReplayResult
        |
        v
Versioned replay-result artifact
        |
        v
Artifact schema validation
```

Measured baseline:

| Evidence Run | Replay Status | Events | Segments | Hash Verified | Run Root Match |
|---|---|---:|---:|---|---|
| 5-minute smoke | PASS | 3521 | 1 | true | true |
| 1-hour soak | PASS | 44074 | 9 | true | true |

Known run roots:

- 5-minute: `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167`
- 1-hour: `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be`

E-K-V generated real artifacts under `backend/replay_results/`, verified `schema_errors: []`, and confirmed unsafe output inside source evidence was rejected. Its formal documentation status is `PASS_WITH_MISSING_DOCUMENTED_OUTPUTS` because the supplied Pi transcript did not capture the compile command/result and did not include a standalone `OK` line for the first 43-test invocation. That caveat concerns captured validation evidence, not the Artifact V1 contract.

## 4. Repository State

Repository state captured on 2026-09-21:

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `9b317e2` |
| HEAD subject | `Document Phase 7.2G-E-K-V replay artifact generation validation` |
| Upstream | `origin/main` |
| Ahead/behind | Aligned; no ahead/behind marker in `git branch -vv` |
| Modified tracked files | `docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md` |
| Untracked files | `docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md` |
| `git diff --check` | Exit 0; one LF-to-CRLF warning, no whitespace error |

Relevant commits:

| Commit | Phase |
|---|---|
| `d180c45` | Implement Phase E-H persistent evidence replay verifier |
| `434d85e` | Document Phase E-I replay validation |
| `907c1ed` | Document Phase E-J report integration planning |
| `c5296b1` | Document Phase E-K artifact schema investigation |
| `a8e94f8` | Implement Phase E-K replay result artifact schema |
| `9b317e2` | Document Phase E-K-V artifact generation validation |

The working tree is clean enough to create this isolated planning document, but not clean enough for Phase E-L-B implementation without deliberate handling of the existing changes. The modified E-K investigation currently differs substantially from its committed form (`26 insertions`, `736 deletions`). The committed `c5296b1` version remains the authoritative technical investigation for this plan. The working-copy modification and untracked Week 9 report are treated as user-owned and are not changed.

## 5. Source Files Inspected

Primary phase documents:

- `docs/validation/phase_7_2g_e_i_persistent_evidence_replay_validation_run.md`
- `docs/validation/phase_7_2g_e_j_replay_result_report_integration_planning.md`
- `docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md`
- Committed `c5296b1` version of the E-K investigation because the working copy is locally replaced
- `docs/validation/phase_7_2g_e_k_v_replay_result_artifact_generation_validation.md`
- `docs/reports/august_nova_sc_replay_result_report_integration_and_artifact_schema_report.md`
- `docs/reports/nova_sc_project_status_investigation_for_roadmap.md`

Backend implementation and tests:

- `backend/evidence_replay.py`
- `backend/test_evidence_replay.py`
- `backend/evidence_writer.py`
- `backend/test_evidence_writer.py`
- `backend/main.py`
- `backend/protocol.py`
- `backend/hardware_stream_manager.py`

Frontend contract files:

- `frontend/src/types/telemetry.ts`
- `frontend/src/store/telemetryStore.ts`
- `frontend/src/state/reportBuilder.ts`
- `frontend/src/components/ReportExportPanel.tsx`

Repository-wide searches excluded `backend/evidence/` and generated `backend/replay_results/` content. Runtime evidence and replay artifacts were not opened.

### Documentation conflicts

The older project-status roadmap assigns:

- E-K to extended persistent-evidence soak validation.
- E-L to persistent-evidence fault/resilience validation.

The newer committed E-J plan, E-K implementation, E-K-V validation, and current task assign:

- E-K to replay-result artifact schema work.
- E-L to backend replay-result summary integration.
- E-M to frontend report integration.

These documents conflict. This plan follows the newer, implemented sequence because commits `c5296b1`, `a8e94f8`, and `9b317e2` provide concrete schema and validation work matching E-J. The older roadmap should be updated in a separate documentation task; it is not silently reinterpreted here.

## 6. Existing Replay Artifact Contract

### 6.1 Constants and strict semantics

Artifact V1 is defined by `backend/evidence_replay.py`:

| Constant | Value |
|---|---|
| `REPLAY_ARTIFACT_SCHEMA_VERSION` | `1.0` |
| `REPLAY_ARTIFACT_TYPE` | `NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT` |
| `REPLAY_ARTIFACT_GENERATOR` | `backend.evidence_replay` |
| `REPLAY_ARTIFACT_VALIDATION_SCOPE` | `BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY` |

`build_replay_result_artifact(...)` maps a frozen `EvidenceReplayResult` into a versioned dictionary. It sets `persistent_replay_validated=true` only when `validation_status == PASS` and `failure_reasons` is empty. It exposes a canonical run-root only when expected and actual values are both present, equal, and the result reports a root match.

`validate_replay_artifact_dict(...)` checks required fields, exact schema/type/generator/scope constants, verdict consistency, run-root consistency, segment count and required segment fields, exact limitations/non-claims, and strict PASS invariants. It accepts a coherent FAIL artifact, which is correct: schema validity and replay verdict are separate properties.

The loader must reuse this validator but also add bounded JSON type checks, identity checks, path safety, and summary projection. Artifact V1 validation is strong on semantic consistency but is not a complete hostile-input type schema for every nested and top-level value.

### 6.2 Existing result types

`EvidenceReplayResult` contains:

- Verdict and run directory.
- Run ID and phase ID.
- Segment count and ordered segment results.
- Segment filename continuity and deterministic-order result.
- Replayed and summary event counts.
- Writer errors, persistent drops, and malformed replay lines.
- Hash and run-root expected/actual/match results.
- Source-component counts and first/last event metadata.
- Replay start/completion timestamps and failure reasons.

`EvidenceReplaySegmentResult` contains:

- Filename and existence.
- Expected/actual byte count.
- Expected/actual SHA-256 and hash match.
- Expected/actual event count.
- Malformed line count.
- First/last event metadata.
- Segment failure reasons.

`sanitize_replay_artifact_filename(...)` converts phase/run identity into a safe generated filename. It does not select input artifacts for E-L.

`write_replay_result_artifact(...)` validates the built artifact, rejects output within the source evidence run, writes through a unique same-directory temporary file, flushes and fsyncs it, then publishes atomically with `os.replace`. E-L consumes the published artifact read-only and must not call this writer.

### 6.3 Artifact V1 top-level field map

| Artifact Field | Type | Required | Meaning | Needed in Backend Summary? | Reason |
|---|---|---|---|---|---|
| `artifact_schema_version` | string | Yes | Artifact contract version | Yes | Version gate and future compatibility |
| `artifact_type` | string | Yes | Stable artifact discriminator | Yes | Prevents loading unrelated JSON |
| `generated_utc` | string | Yes | Artifact generation time | Yes | Provenance and staleness context |
| `generator` | string | Yes | Producing component | Backend-only validation | Exact validator invariant; low frontend value |
| `validation_scope` | string | Yes | Replay validation scope | Yes | Prevents scope confusion |
| `validation_status` | `PASS` or `FAIL` | Yes | Strict replay verdict | Yes | Primary summary state input |
| `persistent_replay_validated` | boolean | Yes | Derived strict replay claim | Yes | Must agree with status and failure reasons |
| `replay_phase_id` | string or null | Yes | Evidence phase identity | Yes | External identity binding |
| `replay_run_id` | string or null | Yes | Evidence run identity | Yes | External identity binding |
| `replay_target_run_dir` | string | Yes | Replay source directory as invoked | No | May be absolute; never expose or dereference |
| `replay_started_utc` | string | Yes | Replay start time | Yes | Audit context |
| `replay_completed_utc` | string | Yes | Replay completion time | Yes | Audit context |
| `replay_segment_count` | integer | Yes | Number of replayed segments | Yes | Compact completeness evidence |
| `replay_total_events` | integer | Yes | Total replayed events | Yes | Event-count consistency evidence |
| `replay_summary_events_written` | integer | Yes | Writer summary event total | Yes | Compare with replay total |
| `replay_writer_errors` | integer | Yes | Source run writer error count | Yes | Strict PASS criterion |
| `replay_persistent_events_dropped` | integer | Yes | Source run persistent drops | Yes | Strict PASS criterion |
| `replay_malformed_lines` | integer | Yes | Malformed NDJSON lines found by replay | Yes | Strict PASS criterion |
| `replay_segment_filename_continuity` | boolean | Yes | Segment names are continuous | Yes | Strict PASS criterion |
| `replay_deterministic_order_verified` | boolean | Yes | Replay order was deterministic | Yes | Strict PASS criterion |
| `replay_hash_verified` | boolean | Yes | Segment hashes verified | Yes | Strict PASS criterion |
| `replay_run_root_match` | boolean | Yes | Expected/actual run roots match | Yes | Strict PASS criterion |
| `replay_run_root_sha256` | string or null | Yes | Canonical root only when verified | Yes | Compact integrity reference |
| `replay_run_root_sha256_expected` | string or null | Yes | Stored expected root | Backend-only | Diagnostic detail; avoid redundant frontend exposure |
| `replay_run_root_sha256_actual` | string or null | Yes | Recomputed root | Backend-only | Diagnostic detail; avoid redundant frontend exposure |
| `replay_failure_reasons` | array of strings | Yes | Strict replay failures | Yes | Preserve exact failure explanation |
| `replay_source_component_counts` | object | Yes | Event counts by source component | Backend-only | Diagnostic and potentially unbounded by future sources |
| `replay_first_event_metadata` | object or null | Yes | First replayed event metadata | Backend-only | Event-level diagnostic detail |
| `replay_last_event_metadata` | object or null | Yes | Last replayed event metadata | Backend-only | Event-level diagnostic detail |
| `replay_segments` | array of segment objects | Yes | Per-segment diagnostics | No | Avoid payload growth and path/detail leakage |
| `replay_validation_limitations` | array of strings | Yes | Exact claim boundaries | Yes | Must remain visible to report layer |
| `non_claims` | object of false booleans | Yes | Explicit unsupported claims | Yes | Prevents claim expansion |

Every top-level field is structurally required, even when its value may be null. Nullable V1 fields include phase/run identity in malformed or incomplete results, canonical/expected/actual root values, and first/last event metadata. `replay_target_run_dir` can contain a host absolute path because it is copied from `EvidenceReplayResult.run_dir`; it must remain backend-only and must never be emitted in `/health` or future frontend reports.

### 6.4 Exact limitations and non-claims

Artifact V1 requires these exact limitations:

1. SHA-256 verification detects mismatch against recorded metadata but is not cryptographic attestation.
2. Replay validation does not prove tamper-proof storage.
3. Replay validation does not certify production archive readiness.
4. Replay validation does not validate frontend report integration.
5. Replay validation does not validate FRAM checkpoint storage.
6. Replay validation does not validate actuator or control readiness.

It requires these exact false non-claims:

- `tamper_proof_storage`
- `cryptographic_attestation`
- `production_archive_certification`
- `frontend_report_integration`
- `fram_validation`
- `actuator_control_readiness`
- `clinical_readiness`

## 7. Existing Backend Persistent Evidence Data Flow

### 7.1 Current ownership

Persistent evidence writer state is created and owned by `PersistentEvidenceWriter` in `backend/evidence_writer.py`. `backend/main.py` owns the process lifecycle and stores the active writer in the global `evidence_writer` reference.

`build_persistent_evidence_summary(...)` normalizes the current writer `stats_snapshot`. It deliberately reports replay as not validated:

- `persistent_replay_validated: false`
- `persistent_replay_validation_status: NOT_VALIDATED` when disabled
- `persistent_replay_validation_status: PENDING_SOAK_VALIDATION` when enabled

This function is called by `current_persistent_evidence_summary()` each time `/health` is requested and each time a hardware gateway health packet is built. It is not a cached replay result.

### 7.2 Actual data flow

```text
Environment configuration in backend/main.py
        |
        v
PersistentEvidenceWriterConfig
        |
        v
PersistentEvidenceWriter owned by backend application lifecycle
        |
        v
writer.stats_snapshot()
        |
        v
build_persistent_evidence_summary()
        |
        +------------------------------+
        |                              |
        v                              v
/health.persistent_evidence_summary    build_gateway_health_packet()
                                               |
                                               v
                                  GATEWAY_HEALTH_TELEMETRY payload
                                               |
                                               v
                                    HardwareStreamManager broadcast
                                               |
                                               v
                                           WebSocket
```

Precise answers:

1. Persistent evidence state is created in `PersistentEvidenceWriter`.
2. The writer object owns it; `main.py` owns the writer lifecycle.
3. `build_persistent_evidence_summary(...)` normalizes writer state.
4. `/health` calls `current_persistent_evidence_summary()` per request.
5. The same function supplies `protocol.build_gateway_health_packet(...)`.
6. Hardware gateway health telemetry is pushed through WebSocket.
7. The summary is recomputed from current writer state, not cached as an immutable replay verdict.
8. `protocol.py` accepts a generic dictionary and places it in the wire payload; it does not define a typed replay summary.
9. There is no generic backend validation-summary abstraction suitable for replay-result ownership.
10. Existing backend configuration uses `os.getenv(...)` and `NOVA_SC_*` variables, which is suitable for an explicit artifact path and expected identities.

## 8. Existing Frontend/Report Data Flow

`frontend/src/types/telemetry.ts` defines `PersistentEvidenceSummary`. Its current contract intentionally fixes:

```text
persistent_replay_validated: false
persistent_replay_validation_status: NOT_VALIDATED | PENDING_SOAK_VALIDATION
```

Gateway health may carry `persistent_evidence_summary`. `telemetryStore.ts` retains the latest value in `persistentEvidenceSummary`. `ReportExportPanel.tsx` passes it into `reportBuilder.ts` and currently displays only whether backend persistent evidence is enabled.

`reportBuilder.ts` deliberately rebuilds conservative evidence state and resets persistent replay to false. It also exports existing frontend-bounded replay fields:

- `replay_snapshot`
- `replay_validation_result`
- `live_vs_replay_summary`

Those fields reconstruct recent supervisory state from the bounded browser event store. They are not backend persistent-evidence replay.

Current frontend flow:

```text
GATEWAY_HEALTH_TELEMETRY
        |
        v
telemetryStore.gatewayHealth and persistentEvidenceSummary
        |
        v
ReportExportPanel
        |
        v
reportBuilder
        |
        +--> persistent_evidence_summary (writer state)
        +--> replay_snapshot (bounded frontend replay)
        +--> replay_validation_result (bounded frontend replay)
```

Terminology collision is a material risk. The future `persistent_replay_summary` must always be named with the `persistent_` qualifier and sourced only from the validated backend artifact. E-L must provide an authoritative, compact object with no frontend reinterpretation so Phase E-M can be display-only.

## 9. Integration Gap

The repository has three established facts but no bridge between them:

1. The live writer can report capture/finalization/hash state.
2. The offline verifier can produce a strict `EvidenceReplayResult` and Artifact V1.
3. The frontend can export reports but cannot claim persistent replay success.

The missing bridge must not:

- Infer replay PASS from `finalized`, `hash_finalized`, `persistent_hash_available`, healthy telemetry, or frontend replay.
- Execute replay at startup or on demand.
- Reopen source evidence named by `replay_target_run_dir`.
- Merge an immutable offline verdict into mutable writer health.
- Stream per-segment data every second.

The semantic mismatch between writer status and replay verdict is the main reason to introduce a sibling object.

### Existing summary architecture options

| Option | Semantic Correctness | Coupling | Compatibility | Complexity | Safety | Decision |
|---|---|---|---|---|---|---|
| A. Extend `persistent_evidence_summary` | Low | High | Risks changing existing frontend type | Low initially | High confusion risk | Reject |
| B. Add sibling `persistent_replay_summary` | High | Low | Additive | Low | Strong separation | Recommend |
| C. Dedicated report-only endpoint/object | High | Low | Additive | Medium | Strong | Defer unless E-M needs it |
| D. Generic validation-summary framework | Unproven | High | Broad change | High | Adds abstraction risk | Reject for V1 |

Option B preserves backward compatibility and makes the authority boundary explicit. `/health` can expose the sibling without changing the gateway protocol in E-L-B.

## 10. Artifact Selection Options

Existing backend configuration is environment-variable based. `main.py` reads mode, serial port, baud, evidence enablement, evidence root, phase ID, target duration, rotation, flush interval, and queue size from `NOVA_SC_*` variables.

| Option | Determinism | Wrong/Stale Run Risk | Deployment | Testability | Safety | Operator Clarity | Decision |
|---|---|---|---|---|---|---|---|
| A. `NOVA_SC_REPLAY_RESULT_PATH` | High | Low with identity binding | Matches repository | High | High | High | Recommend |
| B. CLI startup argument | High | Low | Awkward under current uvicorn startup | Medium | High | Medium | Not V1 |
| C. API/report request parameter | Request-specific | High without authorization and binding | Adds API surface | Medium | Lower | Medium | Reject V1 |
| D. Configuration file | High | Medium | No current backend pattern | Medium | Medium | Medium | Reject V1 |
| E. Automatic latest-file discovery | Low | High | Easy | Hard to prove selection | Low | Low | Reject |
| F. Environment path plus expected identities | Highest | Lowest | Matches repository | High | Highest | High | Recommend complete V1 |

Recommended configuration:

```text
NOVA_SC_REPLAY_RESULT_PATH
NOVA_SC_REPLAY_EXPECTED_RUN_ID
NOVA_SC_REPLAY_EXPECTED_PHASE_ID
```

No globbing, directory scan, mtime selection, lexicographic latest selection, or fallback artifact is permitted.

## 11. Artifact Loader Ownership Options

| Location | Separation | Testability | Live-Telemetry Coupling | Read-Only Clarity | Decision |
|---|---|---|---|---|---|
| A. `evidence_replay.py` | Mixes producer and consumer | Good | Low | Weaker | Reuse constants/validator only |
| B. New `replay_result_loader.py` | Strong | Excellent | None | Strong | Recommend |
| C. `main.py` | Poor; orchestration becomes parsing logic | Medium | Medium | Medium | Orchestration only |
| D. `hardware_stream_manager.py` | Wrong ownership | Poor | High | Poor | Reject |
| E. `protocol.py` | Wrong layer | Poor | High | Poor | Reject |
| F. Generic report service | No existing layer | Unknown | Low | Strong | Overbuilt for V1 |

The exact owner should be a new `backend/replay_result_loader.py`. It should import public Artifact V1 constants and `validate_replay_artifact_dict(...)` from `evidence_replay.py`, but it must never import or call `replay_evidence_run(...)`, the CLI entry point, or artifact-writing functions.

## 12. Recommended Artifact Loader Architecture

### 12.1 Components

Proposed production API:

```python
@dataclass(frozen=True)
class ReplayResultSelection:
    artifact_path: Path | None
    expected_run_id: str | None
    expected_phase_id: str | None


def load_persistent_replay_summary(
    selection: ReplayResultSelection,
    *,
    allowed_root: Path,
    max_bytes: int = 1024 * 1024,
) -> dict[str, object]:
    ...
```

Exact naming can follow local style during E-L-B, but ownership and behavior should remain as above.

### 12.2 Architecture diagram

```text
NOVA_SC_REPLAY_RESULT_PATH
NOVA_SC_REPLAY_EXPECTED_RUN_ID
NOVA_SC_REPLAY_EXPECTED_PHASE_ID
        |
        v
ReplayResultSelection in backend/main.py
        |
        v
backend/replay_result_loader.py
        |
        +--> resolve under backend/replay_results/
        +--> reject symlink/non-file/oversize
        +--> bounded UTF-8 JSON parse
        +--> validate_replay_artifact_dict()
        +--> loader-side type checks
        +--> expected run/phase comparison
        +--> strict state projection
        |
        v
Cached immutable persistent_replay_summary
        |
        v
/health.persistent_replay_summary
        |
        v
Future Phase E-M display/report transport
```

### 12.3 Non-actions

The loader does not:

- Read `replay_target_run_dir` from disk.
- Open manifests, summaries, integrity files, or NDJSON.
- Call replay verification.
- Write, move, rename, hash, or update the artifact.
- Poll the filesystem.
- Select the latest artifact.
- Modify writer state.

## 13. Proposed persistent_replay_summary V1 Schema

The object should use `replay_validation_status`, not a generic `status`, because it will sit beside other health concepts. Fields classified `FUTURE_FRONTEND` are safe for later display/export but remain backend-only during E-L-B.

| Summary Field | Type | Source Artifact Field | State Rules | Exposure | Reason |
|---|---|---|---|---|---|
| `summary_schema_version` | string | Backend constant | Always `1.0` | REQUIRED, FUTURE_FRONTEND | Version summary independently |
| `replay_validation_status` | `PASS`/`FAIL`/`PENDING` | Derived | State machine below | REQUIRED, FUTURE_FRONTEND | Primary state |
| `persistent_replay_validated` | boolean | Artifact plus loader checks | True only in final PASS | REQUIRED, FUTURE_FRONTEND | Controlled claim |
| `artifact_selected` | boolean | Configuration | True when path configured | REQUIRED, BACKEND_ONLY | Distinguishes unconfigured from missing |
| `artifact_present` | boolean | Filesystem check | False for no/missing file | REQUIRED, FUTURE_FRONTEND | Operator diagnosis |
| `artifact_valid` | boolean or null | Schema/type validation | Null when not loaded | REQUIRED, FUTURE_FRONTEND | Separates contract validity from verdict |
| `artifact_schema_version` | string or null | `artifact_schema_version` | Only after parse | REQUIRED, FUTURE_FRONTEND | Compatibility context |
| `artifact_type` | string or null | `artifact_type` | Only after parse | REQUIRED, BACKEND_ONLY | Discriminator audit |
| `validation_scope` | string or null | `validation_scope` | Exact V1 constant | REQUIRED, FUTURE_FRONTEND | Scope clarity |
| `phase_id` | string or null | `replay_phase_id` | Must match expected for PASS | REQUIRED, FUTURE_FRONTEND | Run association |
| `run_id` | string or null | `replay_run_id` | Must match expected for PASS | REQUIRED, FUTURE_FRONTEND | Run association |
| `identity_bound` | boolean | Configuration | True only when both expected IDs supplied | REQUIRED, FUTURE_FRONTEND | Prevents self-asserted association |
| `run_identity_match` | boolean or null | Derived comparison | Null until comparable | REQUIRED, FUTURE_FRONTEND | Explicit identity evidence |
| `phase_identity_match` | boolean or null | Derived comparison | Null until comparable | REQUIRED, FUTURE_FRONTEND | Explicit identity evidence |
| `replay_result_generated_utc` | string or null | `generated_utc` | Preserve valid value | REQUIRED, FUTURE_FRONTEND | Artifact age/provenance |
| `replay_started_utc` | string or null | `replay_started_utc` | Preserve valid value | REQUIRED, FUTURE_FRONTEND | Replay timing |
| `replay_completed_utc` | string or null | `replay_completed_utc` | Preserve valid value | REQUIRED, FUTURE_FRONTEND | Replay timing |
| `segment_count` | integer or null | `replay_segment_count` | Non-negative integer | REQUIRED, FUTURE_FRONTEND | Compact completeness |
| `total_events` | integer or null | `replay_total_events` | Non-negative integer | REQUIRED, FUTURE_FRONTEND | Replay total |
| `summary_events_written` | integer or null | `replay_summary_events_written` | Non-negative integer | REQUIRED, FUTURE_FRONTEND | Count comparison |
| `malformed_lines` | integer or null | `replay_malformed_lines` | Zero required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `writer_errors` | integer or null | `replay_writer_errors` | Zero required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `persistent_events_dropped` | integer or null | `replay_persistent_events_dropped` | Zero required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `segment_filename_continuity` | boolean or null | `replay_segment_filename_continuity` | True required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `deterministic_order_verified` | boolean or null | `replay_deterministic_order_verified` | True required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `hash_verified` | boolean or null | `replay_hash_verified` | True required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `run_root_match` | boolean or null | `replay_run_root_match` | True required for PASS | REQUIRED, FUTURE_FRONTEND | Strict evidence |
| `run_root_sha256` | string or null | `replay_run_root_sha256` | Present only for verified match | REQUIRED, FUTURE_FRONTEND | Compact integrity reference |
| `failure_reasons` | array of strings | Artifact plus loader reasons | Empty only for PASS | REQUIRED, FUTURE_FRONTEND | Explain state |
| `limitations` | array of strings | `replay_validation_limitations` | Exact validated copy | REQUIRED, FUTURE_FRONTEND | Claim boundary |
| `non_claims` | object of false booleans | `non_claims` | Exact validated copy | REQUIRED, FUTURE_FRONTEND | Claim boundary |
| `artifact_reference` | string or null | Sanitized selected filename | Never absolute | REQUIRED, FUTURE_FRONTEND | Traceability without path leakage |
| `summary_generated_utc` | string | Loader clock | Set once at load | REQUIRED, FUTURE_FRONTEND | Snapshot timing |
| `required_next_action` | string | Derived | State-specific operator action | OPTIONAL, FUTURE_FRONTEND | Actionable failure/PENDING state |

Excluded from the summary:

- `generator`
- `replay_target_run_dir`
- expected/actual root duplicates
- source component counts
- first/last event metadata
- per-segment results
- selected absolute path
- expected identity values

These remain in the artifact or backend configuration and do not belong in a compact health/report contract.

## 14. PASS / FAIL / PENDING State Machine

V1 uses exactly three states. `NOT_CONFIGURED` is unnecessary because `PENDING` plus `artifact_selected=false` is unambiguous.

| Condition | Status | Validated | Required Reason/Action |
|---|---|---:|---|
| No artifact path configured | `PENDING` | false | `SELECT_REPLAY_RESULT_ARTIFACT` |
| Path configured but expected run/phase not both configured | `PENDING` | false | `CONFIGURE_EXPECTED_REPLAY_IDENTITY` |
| Explicit path does not exist | `FAIL` | false | `REPLAY_ARTIFACT_NOT_FOUND` |
| Path is symlink, outside allowed root, directory, or non-regular | `FAIL` | false | Path-specific loader reason |
| File exceeds size limit | `FAIL` | false | `REPLAY_ARTIFACT_TOO_LARGE` |
| File unreadable | `FAIL` | false | `REPLAY_ARTIFACT_UNREADABLE` |
| Invalid UTF-8 or JSON | `FAIL` | false | `REPLAY_ARTIFACT_INVALID_JSON` |
| JSON root is not an object | `FAIL` | false | `REPLAY_ARTIFACT_ROOT_NOT_OBJECT` |
| Missing required field | `FAIL` | false | Preserve validator error |
| Unsupported schema version | `FAIL` | false | `INVALID_ARTIFACT_SCHEMA_VERSION` |
| Wrong type, generator, or scope | `FAIL` | false | Preserve validator error |
| Loader-side field type invalid | `FAIL` | false | Stable loader type error |
| Run ID mismatch | `FAIL` | false | `REPLAY_RUN_ID_MISMATCH` |
| Phase ID mismatch | `FAIL` | false | `REPLAY_PHASE_ID_MISMATCH` |
| Artifact `validation_status == FAIL` and schema is coherent | `FAIL` | false | Preserve artifact failure reasons |
| Artifact says PASS with failure reasons | `FAIL` | false | Validator rejects inconsistency |
| Artifact says PASS but validated flag is not true | `FAIL` | false | Validator rejects inconsistency |
| Artifact says PASS but any strict invariant fails | `FAIL` | false | Validator/loader reason |
| Artifact-only internal validation succeeds without external binding | `PENDING` | false | Identity binding still required |
| Schema valid PASS, strict checks pass, and both identities match | `PASS` | true | No failure reasons |

An explicitly configured missing file is `FAIL`, not `PENDING`, because the operator has requested a concrete validation input and that attempt cannot be completed. An unconfigured input is `PENDING` because no validation was attempted.

## 15. Run Identity Validation Strategy

The artifact cannot authenticate its own relationship to a report merely by containing a run ID and phase ID. E-L therefore requires expected identity from outside the artifact.

Candidate identity sources:

| Source | Safety | Decision |
|---|---|---|
| Selected artifact itself | Self-asserted | Reject as binding source |
| Current live writer | May be a different/historical run | Reject |
| Current live stream/run | Not the offline evidence run | Reject |
| Existing writer summary | Mutable and capture-oriented | Reject |
| Report request | Potential future option with authorization | Defer |
| Explicit backend configuration | Deterministic and testable | Recommend V1 |

Two conceptual modes are useful:

1. Artifact-only validation checks internal schema and semantics. It may set `artifact_valid=true`, but its integration state remains `PENDING` and it may not set `persistent_replay_validated=true`.
2. Artifact-bound validation checks the artifact and compares both expected run and phase identity. This is the only V1 path to `PASS`.

The first implementation should support artifact-bound validation as the operational mode. Artifact-only behavior may exist only as a safe diagnostic/PENDING state. Requiring both expected IDs is stricter than using phase only and prevents a correct artifact from the wrong run from being reported as authoritative.

## 16. Path and File Safety

Recommended V1 protections:

| Protection | Rule |
|---|---|
| Read-only | Open once for bounded read; never write or chmod |
| Allowed root | Resolved `backend/replay_results/` only |
| Selection | One explicit file path; no glob or scan |
| Existence | Missing configured path is FAIL |
| File kind | Require regular file |
| Symlinks | Reject in V1, even if target resolves under root |
| Resolution | Resolve allowed root and candidate before containment check |
| Extension | Require `.json` |
| Maximum size | `1 MiB` before read |
| Encoding | Strict UTF-8 |
| JSON root | Require object/mapping |
| Structure | Shared schema validator plus loader type checks |
| Evidence isolation | Never dereference `replay_target_run_dir` |
| Frontend reference | Backend-relative `backend/replay_results/<filename>` or basename only |
| Exceptions | Catch and translate to bounded failure reason |

Artifact sizes observed in E-K-V were approximately `5.7 KiB` and `19 KiB`. A `1 MiB` limit is generous while bounding memory and parser work. The size limit also makes pathological JSON depth less concerning, although loader-side shape/type validation remains required.

Allowing arbitrary absolute paths would increase deployment flexibility but weaken containment, path-leak prevention, and operator predictability. V1 should keep generated artifacts in the already ignored `backend/replay_results/` root. A later phase can add an explicitly configured allowed root if a real deployment need appears.

The artifact may contain an absolute `replay_target_run_dir`; the loader validates that the field exists but never exposes, resolves, opens, or trusts it.

## 17. Backend Lifecycle / Caching Strategy

| Option | Filesystem Cost | Determinism | Staleness | Complexity | Decision |
|---|---|---|---|---|---|
| A. Once at startup | One bounded read | High | Requires restart for changes | Low | Recommend |
| B. Every `/health` | Repeated I/O | Low if file changes | Lower | Low | Reject |
| C. Every gateway packet | Wasteful and coupled | Low | Lower | High risk | Reject |
| D. Lazy load plus cache | One read after first request | Medium | Same as startup | Medium | Not needed |
| E. Reload endpoint | Explicit but new mutable API | Medium | Low | High | Defer |
| F. Report-generation load | Request-scoped | Medium | Low | Requires report backend not present | Defer |

Recommended lifecycle:

1. Read replay selection configuration with the other `NOVA_SC_*` settings.
2. During FastAPI startup, before the simulator-mode early return, call the loader exactly once.
3. Cache the complete immutable summary in a process-global reference owned by `main.py`.
4. `/health` returns the cached object without filesystem access.
5. Configuration or artifact changes require an intentional backend restart in V1.

Startup loading must not invoke replay. Loading in simulator mode is acceptable because it is metadata-only and independent of serial hardware; placing it before mode-specific startup avoids inconsistent API behavior between modes.

If the artifact changes or is deleted after loading, the backend continues exposing the startup snapshot and its `summary_generated_utc`. This deterministic snapshot behavior is preferable to silent hot reload. A later explicit reload design would need authorization, atomic cache replacement, and audit fields.

## 18. Failure Isolation

The loader boundary must catch all anticipated filesystem, decoding, JSON, schema, type, and identity errors and return a summary. No loader exception should escape backend startup.

Failure architecture:

```text
Artifact problem
        |
        v
ReplayResultLoader catches and classifies
        |
        v
Cached FAIL/PENDING persistent_replay_summary
        |
        +--> /health remains available

SerialBridge ------------------------------> unchanged
HardwareStreamManager ---------------------> unchanged
PersistentEvidenceWriter ------------------> unchanged
RtcSyncService ----------------------------> unchanged
WebSocket telemetry ------------------------> unchanged
```

A bad artifact may affect only `persistent_replay_summary`. It must not:

- Crash startup.
- Change backend mode.
- Stop serial ingestion.
- Stop WebSocket telemetry.
- Stop RTC synchronization.
- Stop or degrade evidence writing.
- Increment telemetry packet-integrity counters.
- Enable control behavior.

Unexpected internal exceptions should yield a generic bounded `REPLAY_ARTIFACT_LOAD_ERROR` without leaking stack traces or absolute paths into `/health`; detailed traces may be logged server-side.

## 19. Backend API / Protocol Exposure

| Option | Coupling | Payload/Rate | Compatibility | Frontend Utility | Decision |
|---|---|---|---|---|---|
| A. Add sibling to `/health` | Low | On request, compact | Additive | Available for future use | Recommend E-L-B |
| B. Add to gateway telemetry | Medium/high | Repeated every second | Additive but changes wire types | Direct to current store | Defer to E-M decision |
| C. Dedicated endpoint | Low | On request | Additive | Clean long-term contract | Consider in E-M |
| D. Report generation only | Low | On export | No current backend report service | Not currently viable | Defer |
| E. `/health` plus gateway telemetry | Higher | Duplicate transport | More changes | Convenient | Reject V1 |

E-L-B should add only:

```text
/health.persistent_replay_summary
```

It should not modify `protocol.py` or `hardware_stream_manager.py`. This keeps the implementation backend-only, prevents a roughly one-second rebroadcast of immutable metadata, and leaves existing frontend types untouched. Phase E-M can decide whether to fetch `/health`, add a dedicated read-only endpoint, or approve a compact WebSocket field.

Existing `/health` fields remain unchanged; the new sibling is additive.

## 20. Frontend Boundary

E-L-B must not modify frontend code. It must provide a summary contract that E-M can render without recomputing replay correctness.

E-M should eventually:

- Treat backend state as authoritative.
- Display `PASS`, `FAIL`, or `PENDING` without upgrading it.
- Preserve limitations and non-claims exactly.
- Keep `persistent_replay_summary` distinct from bounded `replay_snapshot` fields.
- Never set replay PASS from writer finalization, hash availability, or frontend reconstruction.

E-L-B should not add `persistent_replay_summary` to WebSocket yet because that would force immediate frontend type awareness. `/health` exposure is enough to validate backend ownership first.

## 21. Claim-Control Rules

### Allowed only for strict PASS

- Persistent replay validated.
- Replay artifact schema validated.
- Replay event-count consistency verified.
- Replay segment filename continuity verified.
- Replay deterministic ordering verified.
- Replay segment hash verification passed.
- Replay run-root verification passed.
- The selected artifact matched the externally expected run and phase.

### Never allowed

- Tamper-proof storage.
- Cryptographic attestation.
- Production archive certification.
- Chain-of-custody certification.
- Frontend report integration validation.
- FRAM validation.
- Actuator/control readiness.
- Clinical readiness.

For a schema-valid artifact, the loader should copy the exact validated `replay_validation_limitations` and `non_claims` values rather than reconstructing a looser interpretation. The validator already requires exact equality to public constants.

For `PENDING` and pre-schema loader failures, the summary should use copies of the same imported Artifact V1 constants as conservative defaults. This avoids an empty limitations block that could be misread as broader assurance. The loader must never mutate the imported constants or artifact object.

## 22. Test Strategy

Recommended new test module:

```text
backend/test_replay_result_loader.py
```

Tests should use `unittest` and `TemporaryDirectory`, matching current backend patterns. Prefer small direct Artifact V1 dictionary fixtures. The production `build_replay_result_artifact(...)` may be used to establish one canonical valid fixture, but test modules should not import private helpers from `test_evidence_replay.py`.

No subprocess is needed for loader unit tests. Subprocess coverage already belongs to the replay CLI. `/health` integration can directly exercise FastAPI's test client or call the health function with a controlled cached summary, provided startup side effects are isolated.

Required cases:

| # | Case | Expected Result |
|---:|---|---|
| 1 | No artifact configured | PENDING, validated false |
| 2 | Valid identity-bound PASS artifact | PASS, validated true |
| 3 | Valid FAIL artifact | FAIL, preserve reasons |
| 4 | Explicit path missing | FAIL |
| 5 | Unreadable artifact | FAIL |
| 6 | Invalid JSON | FAIL |
| 7 | Missing required field | FAIL |
| 8 | Unsupported schema version | FAIL |
| 9 | Wrong artifact type | FAIL |
| 10 | Wrong validation scope | FAIL |
| 11 | PASS with failure reasons | FAIL |
| 12 | PASS with validated false | FAIL |
| 13 | Run ID mismatch | FAIL |
| 14 | Phase ID mismatch | FAIL |
| 15 | Limitations preserved exactly | PASS/FAIL as source verdict |
| 16 | Non-claims preserved exactly | All remain false |
| 17 | Absolute source/selected path not exposed | Sanitized reference only |
| 18 | Raw NDJSON never read | Mock/open assertion limits reads to JSON artifact |
| 19 | Replay verifier never executed | Patch replay entry points to fail if called |
| 20 | Invalid artifact does not affect telemetry | Startup/health integration remains available |
| 21 | Evidence writer behavior unchanged | Existing writer tests pass |
| 22 | Existing backend tests remain passing | Full backend suite passes |
| 23 | Artifact over `1 MiB` | FAIL before JSON read |
| 24 | Symlink selected | FAIL |
| 25 | Path escapes allowed root | FAIL |
| 26 | JSON root is array/scalar | FAIL |
| 27 | Valid artifact without expected identities | PENDING, not validated |
| 28 | Cached summary avoids repeat file reads | One startup read only |
| 29 | `/health` returns sibling summary | Additive field, existing fields intact |
| 30 | Loader internal exception | Bounded FAIL; startup continues |

Implementation validation should include:

```text
backend\.venv\Scripts\python.exe -m py_compile backend\replay_result_loader.py backend\main.py backend\test_replay_result_loader.py
backend\.venv\Scripts\python.exe -m unittest backend.test_replay_result_loader
backend\.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py"
git diff --check
git status --short
```

No test should target `backend/evidence/` or real replay artifacts. Fixtures should be created under temporary directories.

## 23. Performance / Resource Considerations

Real E-K-V artifacts were approximately `5.7 KiB` for one segment and `19 KiB` for nine segments. Artifact size grows with per-segment diagnostics, but remains tiny relative to raw evidence.

Expected V1 cost:

- One bounded file stat and read at startup.
- One JSON object in memory, then one compact projected summary.
- No raw NDJSON parsing.
- No hashing or replay computation.
- Constant-cost `/health` dictionary access after startup.

Loading per gateway telemetry packet would be wasteful because the artifact is immutable and gateway health is produced approximately once per second. Caching makes memory and CPU impact negligible and prevents filesystem latency from entering the telemetry path.

## 24. Backward Compatibility

E-L-B must preserve:

- Persistent evidence writer behavior and its current summary.
- Offline replay verifier and CLI behavior.
- Artifact Schema V1 and artifact writing behavior.
- Serial bridge and hardware stream timing.
- Existing `/health` fields.
- Gateway health protocol and WebSocket packet shape.
- Frontend `PersistentEvidenceSummary` type until E-M.
- `reportBuilder` bounded replay and writer-summary behavior.
- Telemetry-only safety boundaries.

Compatibility risks:

- Reusing `persistent_evidence_summary` would break semantic and type assumptions.
- Adding the summary to gateway telemetry would require frontend type changes and repeat immutable data.
- Renaming Artifact V1 fields would break validated artifacts.
- Importing CLI/replay execution into startup would alter operational behavior.

The recommended sibling `/health` field is additive and avoids these risks.

## 25. Expected Implementation File Set

### MUST ADD

| File | Purpose |
|---|---|
| `backend/replay_result_loader.py` | Bounded read-only loader, strict projection, identity checks, summary state |
| `backend/test_replay_result_loader.py` | Loader and `/health` integration tests |

### MUST MODIFY

| File | Purpose |
|---|---|
| `backend/main.py` | Read selection/identity env vars, load once at startup, cache summary, expose sibling in `/health` |

### MAY MODIFY

| File | Condition |
|---|---|
| `backend/evidence_replay.py` | Only if a narrowly scoped public validation/type helper is truly needed; prefer no change |
| Existing backend API test module | Only if repository testing style favors endpoint tests there |
| `.env.example` or backend operator documentation | Separate approved configuration documentation step |

### MUST NOT MODIFY IN E-L-B

- `backend/evidence_writer.py`
- `backend/test_evidence_writer.py`
- `backend/protocol.py`
- `backend/hardware_stream_manager.py`
- `backend/serial_bridge.py`
- `backend/rtc_sync_service.py`
- `frontend/*`
- `firmware/*`
- `backend/evidence/*`
- `backend/replay_results/*`
- Existing runtime validation evidence

## 26. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stale artifact selected | Old validation reported as current | Explicit path, generated timestamp, external identity binding |
| Wrong run artifact selected | False association | Require expected run and phase for PASS |
| Malformed JSON | Loader exception or bad summary | Bounded strict parse and FAIL summary |
| Unsupported schema | Misinterpretation | Exact version check; FAIL closed |
| Absolute path leakage | Host information disclosure | Never expose selected path or `replay_target_run_dir`; sanitize reference |
| Artifact changed after loading | Cached result differs from disk | Startup snapshot semantics; restart required; expose summary timestamp |
| Artifact deleted after loading | Cached summary remains | Same explicit snapshot semantics; no polling |
| Backend startup failure | Telemetry outage | Catch all loader errors; return bounded summary |
| Telemetry coupling | Latency or packet loss | Load once before live loops; `/health` only |
| Frontend semantic confusion | Persistent and bounded replay conflated | Separate object/name; no frontend change in E-L-B |
| PASS inferred from writer state | False replay claim | Sibling object; artifact is sole replay authority |
| Schema drift | New artifact read as V1 | Exact schema version and type; future adapter per version |
| Artifact directory scan | Wrong/latest artifact chosen | No scanning or automatic discovery |
| Accidental replay execution | Evidence I/O and startup delay | Loader imports validator only; tests patch replay entry points |
| Excessive health payload | Repeated large metadata | Exclude segment array/event metadata; cached compact summary |
| Symlink escape | Allowed-root bypass | Reject symlinks; resolve and check containment |
| Oversize/deep JSON | Resource use | `1 MiB` cap plus shape/type checks |
| Sensitive failure text | Path leakage | Stable reason codes; detailed exception only in server logs |
| Future signed artifacts | V1 API becomes dead end | Keep schema/type fields; isolate loader; extend with versioned verifier later |
| Artifact-only mode overclaimed | Self-asserted identity treated as authoritative | Keep PENDING until external identity is supplied |
| Existing dirty work lost | User documentation overwritten | Touch only new E-L document in this phase; clean/disposition before E-L-B |

## 27. Recommended Implementation Sequence

Phase E-L-B should proceed in this order:

1. Preserve or resolve the existing dirty documentation state.
2. Add loader tests for PENDING/FAIL/PASS and path safety.
3. Add `ReplayResultSelection` and stable summary constants in `replay_result_loader.py`.
4. Implement no-selection PENDING summary.
5. Implement allowed-root, regular-file, symlink, extension, and size checks.
6. Implement bounded UTF-8 JSON parsing.
7. Reuse `validate_replay_artifact_dict(...)`.
8. Add loader-side type checks for projected fields.
9. Add expected run/phase identity checks.
10. Project the compact immutable summary and exact claim boundaries.
11. Read environment configuration in `main.py`.
12. Load once during startup and cache the result.
13. Add the sibling field to `/health` only.
14. Add endpoint/failure-isolation tests.
15. Run targeted and full backend tests.
16. Verify no frontend, protocol, firmware, evidence, or artifact changes.

No real artifact is required for E-L-B tests. Phase E-L-V should perform controlled validation with explicit copies or known ignored artifacts without mutating source evidence.

## 28. Acceptance Criteria

This planning phase passes when:

- Loader responsibility is assigned to `backend/replay_result_loader.py`.
- Artifact selection uses one explicit environment path.
- Automatic latest-file discovery is rejected.
- External expected run and phase identity are required for PASS.
- `PASS`, `FAIL`, and `PENDING` rules are unambiguous.
- The sibling `persistent_replay_summary` schema is field-level defined.
- Paths are bounded, contained, sanitized, and read-only.
- Startup-only loading and caching are selected.
- Loader failures affect only the replay summary.
- `/health`-only V1 exposure is selected.
- Frontend work remains Phase E-M.
- Exact limitations and non-claims remain preserved.
- Implementation files and prohibited files are explicit.
- Tests cover schema, identity, path, claims, isolation, and caching.
- Runtime evidence and generated artifacts remain untouched.
- No source implementation code is changed in this phase.

All criteria are satisfied by this document.

## 29. Safety Boundary

This phase is documentation and planning only.

It does not modify or validate:

- Backend runtime code.
- Frontend runtime code.
- Firmware.
- Serial packet validation or normalization.
- RTC sync behavior or timestamp authority.
- Persistent evidence writer behavior.
- Replay execution behavior.
- Report generation behavior.
- Command/control paths.
- Actuators, motors, servos, steppers, pumps, valves, relays, or heaters.
- PWM, GPIO, PCA9685, or FRAM behavior.

`backend/evidence/` and runtime replay artifacts were not moved, copied, compressed, deleted, opened for full reading, or modified during this task. No replay artifact was created, regenerated, or changed.

## 30. Final Recommendation

Implement Phase E-L-B as a small backend-only consumer boundary:

- Add `backend/replay_result_loader.py`.
- Select one artifact through `NOVA_SC_REPLAY_RESULT_PATH`.
- Require `NOVA_SC_REPLAY_EXPECTED_RUN_ID` and `NOVA_SC_REPLAY_EXPECTED_PHASE_ID` before PASS.
- Restrict the artifact to `backend/replay_results/` and `1 MiB`.
- Reject symlinks and non-regular files.
- Parse and validate once at startup.
- Reuse Artifact V1's shared validator and add loader-specific type/identity checks.
- Project a compact sibling summary.
- Cache it and expose it only in `/health`.
- Keep protocol, WebSocket, frontend, writer, replay CLI, firmware, and evidence unchanged.

This is the smallest architecture that is deterministic, testable, backward compatible, and resistant to wrong-run and overclaiming failures.

## 31. Next Phase

Next implementation phase:

```text
Phase 7.2G-E-L-B — Backend Replay Result Artifact Summary Implementation
```

Next validation phase:

```text
Phase 7.2G-E-L-V — Backend Replay Result Artifact Summary Validation
```

Neither phase is implemented here.

## 32. Final Status

```text
PHASE_7_2G_E_L_BACKEND_REPLAY_RESULT_ARTIFACT_SUMMARY_INTEGRATION_PLANNING: READY_FOR_REVIEW
```

Readiness note: architecture is ready for review. Before E-L-B starts, the existing modified E-K investigation and untracked Week 9 report should be preserved, committed, or otherwise deliberately dispositioned without reverting user work.

## 33. Appendix A — Repository Search Results

### A.1 Persistent replay and evidence terms

Repository-wide searches, excluding runtime evidence and generated replay results, found relevant implementation occurrences in:

- `backend/evidence_writer.py`
- `backend/evidence_replay.py`
- `backend/main.py`
- `backend/protocol.py`
- `backend/test_evidence_writer.py`
- `backend/test_evidence_replay.py`
- `frontend/src/types/telemetry.ts`
- `frontend/src/store/telemetryStore.ts`
- `frontend/src/state/reportBuilder.ts`
- Validation and report Markdown files

No standalone `persistent_replay_status` implementation field currently exists. The writer and frontend use `persistent_replay_validation_status`.

### A.2 Existing term ownership

| Term | Source | Owner | Current Default/Behavior | E-L Decision |
|---|---|---|---|---|
| `persistent_evidence_summary` | Writer/main/protocol/frontend | Live writer health | Dynamic writer snapshot | Preserve unchanged |
| `persistent_replay_validated` | Writer/frontend/artifact | Ambiguous today; authoritative only in artifact | Writer/frontend force false; artifact may be true | New sibling is authoritative after strict load |
| `persistent_replay_validation_status` | Writer/frontend | Writer/report placeholder | `NOT_VALIDATED` or `PENDING_SOAK_VALIDATION` | Preserve existing writer field |
| `persistent_hash_available` | Writer/frontend | Writer finalization | Derived from finalized root hash | Never infer replay PASS |
| `integrity_scope` | Writer/frontend | Writer summary | File integrity detection scope | Preserve writer semantics |
| `tamper_proof` | Writer/frontend | Claim control | Always false | Preserve false |
| `cryptographic_attestation` | Writer/frontend/artifact | Claim control | Always false | Preserve false |

Implementation occurrence matrix:

| Source File | Owning Layer | Terms / Schema Role | Default and Current Behavior | E-L Treatment |
|---|---|---|---|---|
| `backend/evidence_writer.py` | Persistent writer | Defines `build_persistent_evidence_summary`; emits `persistent_hash_available`, `integrity_scope`, `tamper_proof`, `cryptographic_attestation`, `persistent_replay_validated`, and `persistent_replay_validation_status` | Hash availability follows finalized writer metadata; claim flags remain false; replay is `NOT_VALIDATED` or `PENDING_SOAK_VALIDATION` | Do not modify or replace; introduce sibling replay summary |
| `backend/main.py` | Application lifecycle/API | Calls `build_persistent_evidence_summary`, injects it into `/health`, and supplies it to hardware gateway packet creation | Recomputed on each call from the active writer | Add separately cached replay summary in E-L-B; preserve writer path |
| `backend/protocol.py` | Gateway wire packet | Accepts optional `persistent_evidence_summary` dictionary and places it in `GATEWAY_HEALTH_TELEMETRY` | No typed replay-result contract | Do not modify in E-L-B |
| `backend/evidence_replay.py` | Offline replay/artifact authority | Defines Artifact V1 `persistent_replay_validated`, `non_claims.tamper_proof_storage`, and `non_claims.cryptographic_attestation` | Replay validated only for coherent strict PASS; all non-claims false | Reuse constants and validator; do not merge with writer state |
| `backend/test_evidence_writer.py` | Writer tests | Asserts writer summary integrity and conservative claim defaults | Protects false replay/tamper/attestation defaults | Keep passing unchanged |
| `backend/test_evidence_replay.py` | Replay/artifact tests | Asserts strict artifact replay flag, exact limitations/non-claims, hashing, and path safety | Protects Artifact V1 authority | Reuse public production builders where useful; do not import private test helpers |
| `frontend/src/types/telemetry.ts` | Frontend wire/state types | Defines `PersistentEvidenceSummary`; fixes replay flag to literal `false` and status to two conservative values | Frontend cannot currently represent persistent replay PASS/FAIL | Do not modify in E-L-B; add a separate type in E-M |
| `frontend/src/store/telemetryStore.ts` | Frontend state | Stores `persistentEvidenceSummary` from gateway health | Retains latest writer summary | Do not modify in E-L-B |
| `frontend/src/state/reportBuilder.ts` | Frontend report generation | Rebuilds `persistent_evidence_summary`; computes `persistent_hash_available`; forces replay false and conservative status; preserves false claim flags | Prevents writer/report state from implying replay validation | Do not modify in E-L-B; E-M consumes sibling without reinterpretation |
| `frontend/src/components/ReportExportPanel.tsx` | Frontend display/export trigger | Reads `persistentEvidenceSummary` and displays backend evidence enabled/disabled | Does not display persistent replay result | Do not modify in E-L-B |

Documentation occurrences repeat historical decisions and validation evidence but do not define runtime behavior. The table above covers every implementation and test layer returned by the repository-wide search. The exact identifier `persistent_replay_status` has no implementation occurrence; only `persistent_replay_validation_status` exists today.

### A.3 Configuration patterns

`backend/main.py` uses `os.getenv(...)` for:

- `NOVA_SC_BACKEND_MODE`
- `NOVA_SC_SERIAL_PORT`
- `NOVA_SC_SERIAL_BAUD`
- `NOVA_SC_EVIDENCE_ENABLED`
- `NOVA_SC_EVIDENCE_ROOT`
- `NOVA_SC_EVIDENCE_PHASE_ID`
- `NOVA_SC_EVIDENCE_ROTATE_MINUTES`
- `NOVA_SC_EVIDENCE_ROTATE_MB`
- `NOVA_SC_EVIDENCE_FLUSH_INTERVAL_SECONDS`
- `NOVA_SC_EVIDENCE_QUEUE_SIZE`
- `NOVA_SC_EVIDENCE_TARGET_MINUTES`

No `BaseSettings` or general configuration-file abstraction is present. Environment variables are therefore the established V1 mechanism.

## 34. Appendix B — Relevant Existing Types/Fields

### B.1 `PersistentEvidenceSummary`

The frontend type contains writer enablement/activity, run and phase identity, manifest/summary/integrity references, segment/event/error counters, finalization/hash flags, integrity scope, false tamper/attestation claims, conservative replay placeholders, frontend event-store completeness, and next action.

Its replay fields are intentionally restricted:

```text
persistent_replay_validated: false
persistent_replay_validation_status: NOT_VALIDATED | PENDING_SOAK_VALIDATION
```

E-L must not widen this writer-owned type. E-M should add a distinct `PersistentReplaySummary` type matching the backend sibling contract.

### B.2 Artifact V1 segment fields

Each `replay_segments` item requires:

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

These fields remain artifact diagnostics and are excluded from the compact backend summary.

### B.3 Strict Artifact V1 PASS invariants

Artifact V1 PASS requires:

- Empty replay failure reasons.
- `persistent_replay_validated == true`.
- Segment filename continuity true.
- Deterministic order verified true.
- Hash verification true.
- Run-root match true.
- Canonical/expected/actual run roots consistent.
- Writer errors zero.
- Persistent events dropped zero.
- Malformed replay lines zero.
- Replayed total equals writer summary total.
- Segment list count equals declared segment count.
- Exact limitations and non-claims.

E-L adds one further integration invariant: externally expected run and phase identity must both match.

## 35. Appendix C — Git State

### C.1 `git status --short`

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

After this document is created, this new file is also expected to appear as untracked until the user chooses to commit it.

### C.2 `git branch -vv`

```text
* main 9b317e2 [origin/main] Document Phase 7.2G-E-K-V replay artifact generation validation
```

### C.3 Relevant `git log --oneline --decorate`

```text
9b317e2 (HEAD -> main, origin/main) Document Phase 7.2G-E-K-V replay artifact generation validation
7c8870b Add August report for replay result artifact phases
a8e94f8 Implement Phase 7.2G-E-K replay result artifact schema
c5296b1 Document Phase 7.2G-E-K replay artifact schema investigation
907c1ed Document Phase 7.2G-E-J replay result report integration planning
434d85e Document Phase 7.2G-E-I persistent evidence replay validation
d180c45 Implement Phase 7.2G-E-H persistent evidence replay verifier
```

### C.4 `git diff --check`

Exit code: `0`.

Observed warning:

```text
warning: in the working copy of 'docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md', LF will be replaced by CRLF the next time Git touches it
```

No whitespace errors were reported. The warning concerns the pre-existing modified file and was not caused or corrected by this phase.
