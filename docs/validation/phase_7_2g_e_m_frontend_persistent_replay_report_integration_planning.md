# Phase 7.2G-E-M — Frontend Persistent Replay Report Integration Planning

## 1. Executive Summary

Phase 7.2G-E-M defines the minimum safe frontend architecture for adding the already validated backend `persistent_replay_summary` to NOVA SC report export.

The recommended V1 design is an export-time, read-only `GET /health` request from `ReportExportPanel`. The frontend should derive the HTTP origin from the active telemetry WebSocket endpoint, extract and runtime-check `persistent_replay_summary`, capture it once, and pass that immutable snapshot into `buildNovaScValidationReport(...)`. The report builder should copy the backend verdict and evidence fields without calculating replay validity.

The summary should not be added to `GATEWAY_HEALTH_TELEMETRY`, polled periodically, or stored in `telemetryStore`. It is startup-cached backend metadata used by report export, not live telemetry. `persistent_replay_summary` must remain separate from the writer-owned `persistent_evidence_summary` and the frontend-bounded `replay_snapshot`.

Backend authority remains unchanged for:

- `PASS`, `FAIL`, and `PENDING`.
- Artifact validity.
- Run and phase identity binding.
- Hash and run-root verification.
- Failure reasons.
- Limitations and non-claims.

Planning result:

```text
READY_FOR_REVIEW_PHASE_7_2G_E_M_FRONTEND_PERSISTENT_REPLAY_REPORT_INTEGRATION_PLANNING
```

## 2. Current Validated Backend Contract

Repository baseline:

| Field | Value |
|---|---|
| Branch | `main` |
| `HEAD` | `49eb771` |
| `origin/main` | `49eb771` |
| E-L-B implementation commit | `e247d90` |
| E-L-V documentation commit | `49eb771` |
| `git diff --check` at diagnosis start | PASS |

Unrelated pre-existing working-tree changes:

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

The backend loads the explicitly configured replay-result artifact once during FastAPI startup through `load_persistent_replay_summary_from_env()`. The resulting object is cached at `app.state.persistent_replay_summary` and exposed at:

```text
GET /health
  -> persistent_replay_summary
```

It is a sibling of, not an extension of:

```text
persistent_evidence_summary
```

Validated status semantics:

| Backend Status | Meaning | `persistent_replay_validated` |
|---|---|---:|
| `PASS` | Artifact V1 is valid, strict replay checks passed, and expected run and phase identities match | `true` |
| `FAIL` | A configured artifact, identity, schema, integrity, or path check failed | `false` |
| `PENDING` | No artifact is selected or external identity binding is incomplete | `false` |

The frontend must consume these values verbatim. It must never infer `PASS` from writer finalization, hash availability, live telemetry health, or frontend replay reconstruction.

The backend does not currently include `persistent_replay_summary` in WebSocket gateway telemetry. `build_hardware_gateway_health_packet_with_evidence(...)` adds only `persistent_evidence_summary` to `GATEWAY_HEALTH_TELEMETRY`.

## 3. Current Frontend/Report Data Flow

The current live telemetry and report flow is:

```text
backend/main.py /ws/telemetry
    -> frontend/src/hooks/useTelemetrySocket.ts
    -> frontend/src/transport/ingestionPipeline.ts
    -> telemetryStore.ingestPacket(...)
    -> gatewayHealth + persistentEvidenceSummary
    -> ReportExportPanel
    -> buildNovaScValidationReport(...)
    -> downloadJsonReport(...)
```

Relevant concrete ownership:

| Layer | Current File / Symbol | Role |
|---|---|---|
| Backend gateway packet | `backend/main.py` / `build_hardware_gateway_health_packet_with_evidence` | Adds writer summary to gateway health telemetry |
| WebSocket source | `frontend/src/hooks/useTelemetrySocket.ts` | Receives `/ws/telemetry` packets |
| Ingestion | `frontend/src/transport/ingestionPipeline.ts` | Validates and forwards telemetry packets |
| State | `frontend/src/store/telemetryStore.ts` / `ingestPacket` | Stores `gatewayHealth` and `persistentEvidenceSummary` |
| Export UI | `frontend/src/components/ReportExportPanel.tsx` | Reads Zustand telemetry state and initiates JSON export |
| Report model | `frontend/src/state/reportBuilder.ts` / `NovaScValidationReport` | Builds report version `v1.1` |
| Download | `downloadJsonReport(...)` | Serializes and downloads the report |

Current health transport determination:

```text
A. WebSocket GATEWAY_HEALTH_TELEMETRY
```

The frontend does not currently call `GET /health`; no `fetch(...)` or Axios health client exists under `frontend/src`. Gateway health arrives only through WebSocket telemetry. Therefore, the backend `persistent_replay_summary` is not available to the frontend today.

## 4. Integration Gap

The backend now exposes an authoritative replay summary through `/health`, while the frontend report builder receives only WebSocket-derived state. The report currently contains:

- `persistent_evidence_summary`, derived from writer state.
- `replay_snapshot`, reconstructed from the bounded frontend event store.
- `replay_validation_result`, derived from that bounded frontend replay.
- `live_vs_replay_summary`, comparing live and frontend-reconstructed state.

It does not contain the backend artifact-owned `persistent_replay_summary`.

This gap cannot be closed by reusing `PersistentEvidenceSummary`. That object deliberately reports replay as `NOT_VALIDATED` or `PENDING_SOAK_VALIDATION` and fixes `persistent_replay_validated` to `false`. The two summaries describe different systems:

```text
persistent_evidence_summary = writer/finalization state
persistent_replay_summary   = replay artifact validation state
```

## 5. Transport Options

| Option | Size | Coupling | Frequency | Stale Risk | Compatibility | Report Correctness | Testability |
|---|---|---|---|---|---|---|---|
| A. Fetch `/health` when export is requested | Small | Low | Once per export | Low | Additive; no protocol change | High; captures backend startup snapshot immediately before build | High; mock one request |
| B. Poll `/health` periodically | Medium | Medium | Repeated | Low while polling | Additive | Medium; cached value can diverge from export moment | Medium; timers and lifecycle add complexity |
| C. Add summary to `GATEWAY_HEALTH_TELEMETRY` | Medium to large | High | Approximately once per gateway packet | Low | Changes backend protocol and frontend packet types | High, but repeats immutable metadata | Medium; backend and frontend protocol tests required |
| D. Dedicated replay-summary endpoint | Medium | Medium | On demand | Low | Adds API surface | High | High, but unnecessary while `/health` already has the contract |

Option A is the V1 recommendation.

## 6. Recommended Transport

Use one bounded `GET /health` immediately before report generation.

The frontend should add a small helper, proposed as:

```text
frontend/src/transport/backendHealth.ts
```

Responsibilities:

1. Derive the backend HTTP origin from `activeTelemetrySource.endpoint`.
2. Convert `ws:` to `http:` and `wss:` to `https:`.
3. Resolve `/health` against that origin.
4. Perform one `fetch` with `Accept: application/json`, `cache: no-store`, and a bounded timeout.
5. Check HTTP success and the JSON root shape.
6. Require `persistent_replay_summary` to exist.
7. Runtime-check summary schema `1.0` and required field types.
8. Return a discriminated capture result without recalculating backend replay validity.

The helper should not use the currently undocumented `VITE_API_BASE_URL` from `.env.local`; that value is malformed and no source code consumes it. Deriving from `VITE_NOVA_SC_WS_URL` through the active source guarantees that report export addresses the same backend as telemetry.

Backend CORS already allows the frontend to call `/health`, so no backend change is required.

## 7. Proposed PersistentReplaySummary Type

The frontend should define the backend-shaped type in `frontend/src/types/telemetry.ts`:

```ts
export type PersistentReplayValidationStatus = "PASS" | "FAIL" | "PENDING";

export type PersistentReplayNonClaims = {
  tamper_proof_storage: false;
  cryptographic_attestation: false;
  production_archive_certification: false;
  frontend_report_integration: false;
  fram_validation: false;
  actuator_control_readiness: false;
  clinical_readiness: false;
};

export type PersistentReplaySummary = {
  summary_schema_version: "1.0";
  replay_validation_status: PersistentReplayValidationStatus;
  persistent_replay_validated: boolean;
  artifact_selected: boolean;
  artifact_present: boolean;
  artifact_valid: boolean | null;
  artifact_schema_version: string | null;
  artifact_type: string | null;
  validation_scope: string | null;
  phase_id: string | null;
  run_id: string | null;
  identity_bound: boolean;
  run_identity_match: boolean | null;
  phase_identity_match: boolean | null;
  replay_result_generated_utc: string | null;
  replay_started_utc: string | null;
  replay_completed_utc: string | null;
  segment_count: number | null;
  total_events: number | null;
  summary_events_written: number | null;
  malformed_lines: number | null;
  writer_errors: number | null;
  persistent_events_dropped: number | null;
  segment_filename_continuity: boolean | null;
  deterministic_order_verified: boolean | null;
  hash_verified: boolean | null;
  run_root_match: boolean | null;
  run_root_sha256: string | null;
  failure_reasons: string[];
  limitations: string[];
  non_claims: PersistentReplayNonClaims;
  artifact_reference: string | null;
  summary_generated_utc: string;
  required_next_action: string | null;
};
```

Field classification:

| Field | Classification | Rationale |
|---|---|---|
| `summary_schema_version` | REQUIRED FOR REPORT | Contract compatibility |
| `replay_validation_status` | REQUIRED FOR REPORT | Authoritative verdict |
| `persistent_replay_validated` | REQUIRED FOR REPORT | Controlled validation claim |
| `artifact_selected` | REQUIRED FOR REPORT | Distinguishes unconfigured `PENDING` |
| `artifact_present` | REQUIRED FOR REPORT | Bounded artifact availability |
| `artifact_valid` | REQUIRED FOR REPORT | Distinguishes schema validity from verdict |
| `artifact_schema_version` | REQUIRED FOR REPORT | Artifact compatibility evidence |
| `artifact_type` | BACKEND-ONLY / EXCLUDE | Low report value; discriminator already validated by backend |
| `validation_scope` | REQUIRED FOR REPORT | Prevents scope ambiguity |
| `phase_id`, `run_id` | REQUIRED FOR REPORT | Validated association |
| `identity_bound`, `run_identity_match`, `phase_identity_match` | REQUIRED FOR REPORT | External identity evidence |
| Replay generated/start/completed timestamps | OPTIONAL DISPLAY | Useful provenance without affecting verdict |
| `segment_count`, `total_events`, `summary_events_written` | REQUIRED FOR REPORT | Completeness metrics |
| `malformed_lines`, `writer_errors`, `persistent_events_dropped` | REQUIRED FOR REPORT | Strict replay evidence |
| `segment_filename_continuity`, `deterministic_order_verified` | REQUIRED FOR REPORT | Ordering and continuity evidence |
| `hash_verified`, `run_root_match`, `run_root_sha256` | REQUIRED FOR REPORT | Integrity-detection evidence |
| `failure_reasons` | REQUIRED FOR REPORT | Explains `FAIL` |
| `limitations`, `non_claims` | REQUIRED FOR REPORT | Prevents claim expansion |
| `artifact_reference` | OPTIONAL DISPLAY | Backend-sanitized traceability only |
| `summary_generated_utc` | REQUIRED FOR REPORT | Backend snapshot age |
| `required_next_action` | REQUIRED FOR REPORT | Explains `PENDING` and recovery action |

The frontend must not request or expose `replay_target_run_dir`, absolute selected paths, per-segment internals, or expected/actual root duplicates.

## 8. State Ownership

Evaluated options:

| Option | Assessment |
|---|---|
| A. `telemetryStore` | Reject for V1. The summary is not live telemetry and does not arrive over the telemetry transport. |
| B. Report-builder-local/report snapshot | Recommend. It is fetched only for export and captured once. |
| C. Dedicated health/report state | Defer. Useful only if future UI pages need persistent health state. |
| D. Existing gateway state | Reject. It would merge replay validation with writer/gateway telemetry semantics. |

V1 owner:

```text
ReportExportPanel export operation
    -> immutable PersistentReplaySummary snapshot
    -> buildNovaScValidationReport
```

No `persistentReplaySummary` property should be added to `telemetryStore` in E-M-B.

Frontend transport availability must remain separate from backend replay status. Proposed capture metadata:

```ts
export type PersistentReplayCapture =
  | {
      report_data_status: "AVAILABLE";
      source: "BACKEND_HEALTH";
      captured_at_utc: string;
      error_reason: null;
      summary: PersistentReplaySummary;
    }
  | {
      report_data_status: "REPORT_DATA_UNAVAILABLE";
      source: "BACKEND_HEALTH";
      captured_at_utc: string;
      error_reason:
        | "HEALTH_REQUEST_FAILED"
        | "HEALTH_RESPONSE_INVALID"
        | "PERSISTENT_REPLAY_SUMMARY_MISSING"
        | "UNSUPPORTED_REPLAY_SUMMARY_SCHEMA";
      summary: null;
    };
```

## 9. ReportBuilder Integration

`NovaScValidationReport` should add two sibling fields immediately after the existing `persistent_evidence_summary`:

```ts
persistent_evidence_summary: PersistentEvidenceSummary;
persistent_replay_summary: PersistentReplaySummary | null;
persistent_replay_capture: {
  report_data_status: "AVAILABLE" | "REPORT_DATA_UNAVAILABLE";
  source: "BACKEND_HEALTH";
  captured_at_utc: string;
  error_reason: string | null;
};
```

`buildNovaScValidationReport(...)` should accept one already captured `PersistentReplayCapture`. It should copy the summary into the report without deriving or correcting any replay field.

The new section belongs beside `persistent_evidence_summary`, not inside:

- `replay_snapshot`.
- `replay_validation_result`.
- `live_vs_replay_summary`.
- `gateway_health`.

Because this changes the exported report contract, E-M-B should bump `report_version` and `report_schema_version` from `v1.1` to `v1.2` rather than silently extending V1.1.

`ReportExportPanel` should add a compact `Persistent Replay` metric showing the backend status when capture succeeds, or `REPORT_DATA_UNAVAILABLE` when transport/data capture fails.

## 10. PASS / FAIL / PENDING Presentation Rules

The frontend must render `replay_validation_status` verbatim.

| Backend Status | Report/UI Presentation |
|---|---|
| `PASS` | Show `PASS`, validated run and phase IDs, events, segments, identity binding, hash verification, run-root verification, and canonical root hash. Preserve limitations and non-claims. |
| `FAIL` | Show `FAIL` and every backend `failure_reasons` entry. Display available integrity/count context, but do not soften or replace the verdict. |
| `PENDING` | Show `PENDING`, `required_next_action`, artifact selection/presence state, and any available identity context. Do not present it as failure. |

The frontend must not:

- Convert `persistent_replay_validated` into a verdict independent of `replay_validation_status`.
- Recompute hash or run-root results.
- Re-evaluate identity binding.
- Infer replay success from event counts or zero errors.
- Merge backend persistent replay with bounded frontend replay.

## 11. Snapshot / Freshness Strategy

Recommended sequence when the user selects report download:

1. Disable the export button and enter a bounded loading state.
2. Fetch `/health` with a timeout and `cache: no-store`.
3. Runtime-check and capture `persistent_replay_summary` or a `REPORT_DATA_UNAVAILABLE` result.
4. Read `useTelemetryStore.getState()` once after the health request completes.
5. Build a plain report-parameter snapshot from that single Zustand read and the replay capture.
6. Call `buildNovaScValidationReport(...)` synchronously once.
7. Download that completed report object.
8. Re-enable export.

This captures one stable backend summary and one stable telemetry state. No field should be read again while the report is being built.

The report should preserve both:

- Backend `summary_generated_utc`, which records when the startup-cached summary was created.
- Frontend `captured_at_utc`, which records when report export fetched it.

No periodic polling or silent hot reload is required.

## 12. Transport and Data Error Handling

Frontend capture failures must not be converted into backend replay `FAIL`.

| Condition | Frontend Result | Backend Replay Status |
|---|---|---|
| `/health` unavailable, timeout, network failure, or non-2xx | `REPORT_DATA_UNAVAILABLE` / `HEALTH_REQUEST_FAILED` | Unknown; do not invent |
| JSON root or health response malformed | `REPORT_DATA_UNAVAILABLE` / `HEALTH_RESPONSE_INVALID` | Unknown; do not invent |
| `persistent_replay_summary` missing | `REPORT_DATA_UNAVAILABLE` / `PERSISTENT_REPLAY_SUMMARY_MISSING` | Unknown; do not invent |
| Unsupported `summary_schema_version` | `REPORT_DATA_UNAVAILABLE` / `UNSUPPORTED_REPLAY_SUMMARY_SCHEMA` | Unknown; do not invent |
| Valid summary with `PASS` | `AVAILABLE` | Copy `PASS` |
| Valid summary with `FAIL` | `AVAILABLE` | Copy `FAIL` |
| Valid summary with `PENDING` | `AVAILABLE` | Copy `PENDING` |

Recommended V1 export behavior: still allow report generation when replay data is unavailable, but include `persistent_replay_summary: null` and the explicit capture error. This preserves the rest of the supervisory report without falsely claiming replay failure or success.

The UI should show the capture error after download and must never silently reuse a stale previous replay summary.

## 13. Claim-Control Rules

The report builder should copy `limitations` and `non_claims` directly from the validated backend summary. It should not translate them into looser claims.

Recommended policy: option A, direct copy. Fixed human-readable text may be used only for UI labels such as `Hash Verification` and `Run-Root Verification`, not to replace backend limitations.

In particular:

```text
hash_verified = true
```

means recorded SHA-256 integrity checks matched. It does not mean:

- Tamper-proof storage.
- Cryptographic attestation.
- Production archive certification.

All seven backend non-claims must remain explicit false values in the report. The frontend must not mutate, omit selectively, or invert them.

## 14. Test Strategy

The frontend currently has no configured test script or test framework. E-M-B should establish a minimal Vitest setup for pure transport-validation and report-builder tests. Component testing can be added only if needed to verify export interaction.

Planned cases:

| Test | Expected Assertion |
|---|---|
| PASS summary | Report copies `PASS`, counts, identities, hash, and root fields exactly |
| FAIL summary | Report copies `FAIL` and backend failure reasons without reinterpretation |
| PENDING summary | Report copies `PENDING` and `required_next_action` |
| Health unavailable | Capture is `REPORT_DATA_UNAVAILABLE`; replay summary is null |
| Missing summary | Uses `PERSISTENT_REPLAY_SUMMARY_MISSING` |
| Unsupported schema | Uses `UNSUPPORTED_REPLAY_SUMMARY_SCHEMA` |
| Limitations | Exact strings preserved in order |
| Non-claims | Exact false-valued object preserved |
| Hash/root fields | Displayed and exported without recomputation |
| No validity calculation | Frontend does not upgrade inconsistent input; parser rejects malformed contract instead |
| Stable snapshot | Builder uses one captured summary and one telemetry snapshot |
| Existing writer report | `persistent_evidence_summary` output remains unchanged |
| Existing frontend quality | TypeScript build and ESLint remain passing |

Likely future test files:

```text
frontend/src/transport/backendHealth.test.ts
frontend/src/state/reportBuilder.test.ts
frontend/src/components/ReportExportPanel.test.tsx   # only if interaction coverage is added
```

The implementation phase will likely need `vitest` and, for component tests, `jsdom` plus React Testing Library. Package changes should be limited to that test tooling.

## 15. Expected Implementation Files

### Must Modify

| File | Planned Change |
|---|---|
| `frontend/src/types/telemetry.ts` | Add backend-shaped `PersistentReplaySummary`, non-claims, status, and capture types |
| `frontend/src/state/reportBuilder.ts` | Add replay summary/capture fields, accept stable capture input, and bump report schema to `v1.2` |
| `frontend/src/components/ReportExportPanel.tsx` | Make export handler asynchronous, fetch health before export, capture store once, and show replay/capture state |

### Must Add

| File | Planned Change |
|---|---|
| `frontend/src/transport/backendHealth.ts` | Derive health URL, perform bounded fetch, runtime-check summary, and return discriminated capture result |
| `frontend/src/transport/backendHealth.test.ts` | Transport and runtime contract tests |
| `frontend/src/state/reportBuilder.test.ts` | PASS/FAIL/PENDING, claim-control, and unchanged writer-summary tests |

### May Modify or Add

| File | Condition |
|---|---|
| `frontend/package.json`, `frontend/package-lock.json` | Add minimal Vitest/test scripts because no frontend test framework exists |
| `frontend/vite.config.ts` or `frontend/vitest.config.ts` | Only if required for Vitest configuration |
| `frontend/src/components/ReportExportPanel.test.tsx` | Only if component-level loading/error/download behavior needs direct coverage |
| `frontend/.env.example` | Only if implementation rejects endpoint derivation and formally introduces a supported API base variable; not recommended |

### Must Not Modify

- `backend/main.py`.
- `backend/replay_result_loader.py`.
- Backend protocol and WebSocket packet builders.
- `frontend/src/store/telemetryStore.ts` for V1 replay-summary ownership.
- Firmware.
- Replay artifacts or persistent evidence.
- GPIO, PWM, PCA9685, FRAM, actuator, or command/control code.

## 16. Recommended V1 Architecture

```text
ReportExportPanel.handleDownload
        |
        v
activeTelemetrySource.endpoint
        |
        v
derive same-backend GET /health URL
        |
        v
backendHealth.ts bounded one-shot fetch
        |
        +--> runtime contract error
        |       -> REPORT_DATA_UNAVAILABLE capture
        |
        +--> valid /health.persistent_replay_summary
                -> PersistentReplaySummary capture
        |
        v
single useTelemetryStore.getState() snapshot
        |
        v
buildNovaScValidationReport(...)
        |
        +--> persistent_evidence_summary (unchanged writer state)
        +--> persistent_replay_summary (backend verdict copied verbatim)
        +--> persistent_replay_capture (frontend availability only)
        |
        v
downloadJsonReport(...)
```

Architecture decisions:

| Concern | V1 Decision |
|---|---|
| Transport | One export-time `GET /health` |
| URL ownership | Derive from active WebSocket origin |
| Type ownership | `frontend/src/types/telemetry.ts` |
| Runtime validation | `frontend/src/transport/backendHealth.ts` |
| State ownership | Export-local immutable snapshot; no Zustand replay state |
| Snapshot timing | Immediately before report build |
| Report insertion | Sibling after `persistent_evidence_summary` |
| Verdict rendering | Backend status verbatim |
| Data error | Separate `REPORT_DATA_UNAVAILABLE` capture state |
| Claim control | Copy limitations and non-claims exactly |
| Test boundary | Health helper and pure report builder; component test only as needed |

## 17. Risks

| Risk | Mitigation |
|---|---|
| Replay and writer summaries are conflated | Keep separate report fields, types, and ownership |
| Transport failure is reported as replay FAIL | Use separate `REPORT_DATA_UNAVAILABLE` capture state |
| Frontend silently uses stale data | Fetch immediately before export; never reuse a prior capture |
| Backend and frontend point to different hosts | Derive HTTP origin from active WebSocket endpoint |
| Unsupported schema is misread | Runtime-check `summary_schema_version == "1.0"` |
| Host path leaks into report | Exclude all absolute paths and `replay_target_run_dir`; allow only sanitized `artifact_reference` |
| Immutable summary is broadcast repeatedly | Keep it out of WebSocket and avoid polling |
| Existing V1.1 consumers miss the new field | Bump report schema/version to `v1.2` |
| Hash success is overstated | Preserve exact limitations and false non-claims |
| No frontend test infrastructure exists | Add minimal Vitest tooling during E-M-B |
| Existing `.env.local` API base is malformed | Do not use it; derive from active WebSocket URL |

## 18. Acceptance Criteria

Planning is complete when E-M-B has the following locked decisions:

| Criterion | Planned Result |
|---|---|
| Exact transport mechanism | One bounded export-time `GET /health` |
| Exact frontend type | Backend-shaped `PersistentReplaySummary` plus separate capture union |
| Exact state owner | Report-export-local snapshot |
| Exact report insertion | Sibling after `persistent_evidence_summary` |
| PASS rendering | Copy backend PASS and validated metrics |
| FAIL rendering | Copy backend FAIL and all failure reasons |
| PENDING rendering | Copy backend PENDING and next action |
| Transport-failure behavior | `REPORT_DATA_UNAVAILABLE`, never replay FAIL |
| Snapshot timing | Fetch, then one store read, then synchronous build |
| Claim-control handling | Copy limitations/non-claims exactly; no validity inference |
| Implementation file set | Defined in Section 15 |
| Test strategy | Defined in Section 14 |
| Backend change required | No |
| WebSocket/protocol change required | No |

No technical blocker prevents E-M-B. The absence of frontend test infrastructure is an implementation prerequisite, not a planning blocker.

## 19. Next Phase

This document completes planning only.

Next implementation phase:

```text
Phase 7.2G-E-M-B — Frontend Persistent Replay Report Integration Implementation
```

Next validation phase:

```text
Phase 7.2G-E-M-V — Frontend Persistent Replay Report Integration Validation
```

Neither phase is implemented here.

## 20. Final Status

```text
READY_FOR_REVIEW_PHASE_7_2G_E_M_FRONTEND_PERSISTENT_REPLAY_REPORT_INTEGRATION_PLANNING
```
