# NOVA SC Project Status Investigation for Roadmap Planning

## 1. Executive Summary

NOVA SC is currently a telemetry and supervision validation platform for the NOVA B1 hardware chain:

```text
Laptop Supervisory Console -> Raspberry Pi backend/gateway -> MAIN ESP32-S3 -> SUB ESP32-S3
```

The repository shows a mature telemetry validation path. Hardware telemetry baseline validation is documented, DS3231 RTC sync/retention/drift evidence has progressed through multiple phases, and backend persistent evidence writing has been implemented and validated with real hardware in both a 5-minute smoke run and a 1-hour-plus soak run.

The strongest validated current capability is backend filesystem-resident persistent evidence writing: canonical telemetry can be written to append-only NDJSON segments, finalized into `manifest.json`, `summary.json`, and `integrity.json`, and checked with SHA-256 file-integrity metadata. Phase 7.2G-E-F-A passed with 1 segment and 3521 NDJSON events. Phase 7.2G-E-F-B passed with caveat after approximately 71 minutes 34 seconds, 9 segments, 44074 NDJSON events, zero writer errors, and zero persistent evidence drops.

The primary unvalidated gap is deterministic persistent replay validation. The repository contains planning and implementation-plan documents for Phase 7.2G-E-G, but it does not contain `backend/evidence_replay.py`, `backend/test_evidence_replay.py`, or a validation report proving replay has passed. Therefore persistent replay validation must not be claimed yet.

The safest next engineering priority is to close and commit the Phase 7.2G-E-G planning documents, then implement a backend-only read-only replay verifier in the next phase. Longer soaks, report-level replay claims, FRAM checkpointing, and actuator/control validation should remain gated until replay validation and safety architecture are complete.

## 2. Investigation Method

This investigation inspected the working tree, recent git history, validation documents, report documents, backend evidence code, frontend report integration code, firmware README files, and repository ignore rules.

Git commands inspected:

| Command | Result |
|---|---|
| `git status --short` | Working tree contains untracked docs/reports and two untracked Phase 7.2G-E-G planning docs |
| `git log --oneline --decorate -30` | HEAD is `a44b6fe` on `main`, aligned with `origin/main` |
| `git branch -vv` | `main` at `a44b6fe [origin/main]` |
| `git show --stat d2f08b5` | Backend persistent evidence writer and hash finalization implementation |
| `git show --stat bb2c2dc` | Persistent evidence summary integrated into backend health and frontend report export |
| `git show --stat 8c8fb1c` | Phase 7.2G-E-F-A smoke validation document |
| `git show --stat e18ec83` | Phase 7.2G-E-F-B 1-hour soak validation document |
| `git show --stat a44b6fe` | Runtime evidence ignore rule added |
| `git log --oneline -- docs/validation` | Validation history from Phase 6.9 through Phase 7.2G-E-F-B |
| `git log --oneline -- docs/reports` | No committed report-history entries found |
| `git log --oneline -- backend` | Backend telemetry, RTC sync, and persistent evidence implementation history |
| `git log --oneline -- frontend` | Frontend telemetry, RTC, and report integration history |

Validation documents inspected under `docs/validation/`:

| File | Status in working tree |
|---|---|
| `phase_6_9_hardware_telemetry_baseline.md` | Tracked |
| `phase_6_9_baseline.json` | Tracked |
| `PHASE_7_1_POWER_RAIL_ADC_TELEMETRY.md` | Tracked |
| `phase_7_2f_ext_6_day_ds3231_cold_retention_evidence.md` | Tracked |
| `phase_7_2g_c_1_hour_ds3231_rtc_drift_validation.md` | Tracked |
| `phase_7_2g_d_heartbeat_gap_soak_stability_diagnosis.md` | Tracked |
| `phase_7_2g_e_persistent_soak_evidence_event_store_capacity_planning.md` | Tracked |
| `phase_7_2g_e_b_backend_persistent_evidence_writer_implementation_plan.md` | Tracked |
| `phase_7_2g_e_f_a_5_minute_persistent_evidence_smoke_validation.md` | Tracked |
| `phase_7_2g_e_f_b_1_hour_persistent_evidence_soak_validation.md` | Tracked |
| `phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md` | Untracked |
| `phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md` | Untracked |

Report documents inspected under `docs/reports/`:

| File | Status |
|---|---|
| `week_9_nova_sc_persistent_evidence_validation_report.md` | Untracked |

Backend files inspected:

| File | Found |
|---|---|
| `backend/evidence_writer.py` | Yes |
| `backend/test_evidence_writer.py` | Yes |
| `backend/main.py` | Yes |
| `backend/hardware_stream_manager.py` | Yes |
| `backend/protocol.py` | Yes |
| `backend/README.md` | No |
| `backend/evidence_replay.py` | No |
| `backend/test_evidence_replay.py` | No |

Frontend files inspected:

| File | Found |
|---|---|
| `frontend/src/types/telemetry.ts` | Yes |
| `frontend/src/store/telemetryStore.ts` | Yes |
| `frontend/src/state/reportBuilder.ts` | Yes |
| `frontend/src/components/ReportExportPanel.tsx` | Yes |
| `frontend/src/components/RtcStatus.tsx` | Yes |
| `frontend/src/state/rtcValidity.ts` | Yes |

Firmware directories inspected:

| Directory/File | Finding |
|---|---|
| `firmware/main_esp32/README.md` | MAIN firmware is telemetry-only; command/control and actuator writes are excluded |
| `firmware/sub_esp32/README.md` | SUB firmware is telemetry-only; command/control and actuator writes are excluded |

Runtime evidence rule followed:

- Full NDJSON runtime evidence files were not read.
- `backend/evidence/` was not moved, copied, compressed, deleted, or modified.
- Runtime evidence results in this report come from validation documents, not direct runtime evidence replay.

## 3. Current System Architecture

### Laptop Supervisory Console

The laptop/frontend layer receives telemetry over WebSocket, maintains live supervision state, renders RTC and system evidence panels, and can export supervisory validation reports. It remains a live supervision and report/export layer, not the primary long-duration evidence store.

### Raspberry Pi Backend / Gateway

The Raspberry Pi backend owns hardware-mode serial ingestion over `/dev/serial0` at `115200` baud. It validates and normalizes hardware telemetry, tracks gateway health, broadcasts canonical telemetry packets to WebSocket clients, and now optionally writes persistent evidence to backend filesystem storage.

### MAIN ESP32-S3

The MAIN ESP32-S3 emits telemetry to the Pi backend and forwards telemetry from SUB. Its README states that it does not receive commands and does not control actuator hardware. It reports node/link telemetry, power-health telemetry, chip status, and DS3231 RTC telemetry where supported by the implemented phase.

### SUB ESP32-S3

The SUB ESP32-S3 emits telemetry to MAIN. Its README states that it is telemetry-only and does not implement motor, servo, pump, valve, relay, heater, stepper, PCA9685 output, command parser, command receiver, or GPIO actuator writes.

### Backend Persistent Evidence Layer

The backend persistent evidence layer is implemented in `backend/evidence_writer.py` and integrated through `backend/main.py`, `backend/hardware_stream_manager.py`, and `backend/protocol.py`. It writes accepted canonical telemetry events as append-only NDJSON segments with manifest, summary, integrity metadata, segment SHA-256 hashes, and a deterministic run-root hash.

### Frontend Report / Export Layer

The frontend report layer includes persistent evidence summary fields from backend gateway health telemetry in report export. It intentionally keeps `persistent_replay_validated` false and does not claim tamper-proof evidence or cryptographic attestation.

### RTC Validation Layer

RTC validation is centered on DS3231 evidence. The repository documents RTC sync, retention, cold-retention observation, drift baseline hardening, and 1-hour drift validation. Pi/backend UTC remains the timestamp authority. DS3231 remains evidence-only and is not promoted to timestamp authority.

### Safety Boundary

The current system remains telemetry-only. Command/control, actuator readiness, PCA9685 PWM output, GPIO output, motor/servo/stepper/pump/valve/relay/heater activation, FRAM checkpoint validation, production readiness, and clinical readiness are not validated.

## 4. Completed Phase Inventory

| Phase | Name | Category | Main deliverable | Validation result | Evidence/source document | Commit, if known | Notes/caveats |
|---|---|---|---|---|---|---|---|
| Phase 6.9 | Hardware telemetry baseline | Hardware telemetry | Validated Laptop/Pi/MAIN/SUB telemetry chain | VALIDATED | `docs/validation/phase_6_9_hardware_telemetry_baseline.md` | `6a853a2` | Telemetry only; no actuator/control path |
| Phase 7.1A/B-C | Power rail ADC telemetry/investigation | Power telemetry | ADS1115 raw debug and channel investigation | PASS | `docs/validation/PHASE_7_1_POWER_RAIL_ADC_TELEMETRY.md` | `fceadb5`, `b8d5b50` | Raw/debug evidence; calibrated rail measurement remains limited |
| Phase 7.2E series | DS3231 RTC sync path | RTC software/hardware evidence | Pi time trust gate, preview protocol, bounded request parser, controlled sync path, UI/report evidence | Implemented in git history | Git history for `ab6b860`, `792d4ef`, `fa36f00`, `c450d25`, `a5914e4`, `55f617e`, `38e20dc`, `379e19c` | Multiple commits | No standalone validation doc found for each subphase in `docs/validation` |
| Phase 7.2F | RTC retention evidence UI/report | RTC evidence | RTC retention evidence integration | Implemented in git history | Git history and later 7.2F-EXT doc | `b9a4abf` | Detailed retained evidence appears in 7.2F-EXT report |
| Phase 7.2F-EXT | 6-day DS3231 cold-retention evidence | RTC evidence | Cold-retention observation after powered-off interval | CAPTURED / PASS | `docs/validation/phase_7_2f_ext_6_day_ds3231_cold_retention_evidence.md` | `26073b3` | DS3231 remains evidence-only; `rtc_validated=false` |
| Phase 7.2G-A/B | RTC drift hardening/readiness | RTC frontend/report logic | Hardened baseline and 1-hour target readiness | Implemented/planned by git history | Git history for `ebdc431`, `2693e5e` | `ebdc431`, `2693e5e` | No separate tracked validation doc found for A/B |
| Phase 7.2G-C | 1-hour DS3231 RTC drift validation | RTC validation | 1-hour drift measurement | PASS / VALIDATED | `docs/validation/phase_7_2g_c_1_hour_ds3231_rtc_drift_validation.md` | `8d95b99` | RTC drift passed; general soak had heartbeat-gap caveat |
| Phase 7.2G-D | Heartbeat-gap / soak stability diagnosis | Telemetry soak diagnosis | 1-hour clean heartbeat-gap diagnosis | VALIDATED_WITH_REPLAY_WARNING | `docs/validation/phase_7_2g_d_heartbeat_gap_soak_stability_diagnosis.md` | `ad75e71` | Previous gap not reproduced; frontend raw replay partial due bounded store |
| Phase 7.2G-E | Persistent soak evidence / event-store capacity planning | Architecture planning | Backend persistent evidence selected as primary long-soak evidence store | ARCHITECTURE_LOCK_READY | `docs/validation/phase_7_2g_e_persistent_soak_evidence_event_store_capacity_planning.md` | `e8e641e` | Planning only |
| Phase 7.2G-E-B | Backend persistent evidence writer implementation plan | Implementation planning | NDJSON writer lifecycle, manifest, hashing, queue plan | READY_FOR_REVIEW | `docs/validation/phase_7_2g_e_b_backend_persistent_evidence_writer_implementation_plan.md` | `1992ee1` | Planning only |
| Phase 7.2G-E-C/D | Backend persistent evidence writer and hash finalization | Backend implementation | Writer, queue, rotation, manifest, summary, integrity, hashing, tests | Implemented | `backend/evidence_writer.py`, `backend/test_evidence_writer.py`, commit stat | `d2f08b5` | Backend-only writer implemented; replay not implemented |
| Phase 7.2G-E-E | Persistent evidence report integration | Backend/frontend report integration | Persistent evidence summary surfaced into gateway health and reports | Implemented | `backend/main.py`, `backend/protocol.py`, frontend report files | `bb2c2dc` | Frontend report export missed during 1-hour run |
| Phase 7.2G-E-F-A | 5-minute persistent evidence smoke validation | Hardware validation | Short hardware persistent evidence run | PASS | `docs/validation/phase_7_2g_e_f_a_5_minute_persistent_evidence_smoke_validation.md` | `8c8fb1c` | 1 segment, 3521 events, zero drops/errors |
| Phase 7.2G-E-F-B | 1-hour persistent evidence soak validation | Hardware validation | 1-hour-plus persistent evidence soak | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED | `docs/validation/phase_7_2g_e_f_b_1_hour_persistent_evidence_soak_validation.md` | `e18ec83` | Backend evidence passed; frontend report export before shutdown not captured |
| Git hygiene | Runtime evidence ignore protection | Repository hygiene | Ignore backend runtime evidence artifacts | Implemented | `.gitignore` | `a44b6fe` | `backend/evidence/` ignored |

### Known From Project Context But Not Found in Repository Documents

| Item | Repository evidence status | Handling |
|---|---|---|
| Separate Phase 7.2E validation reports | Not found under `docs/validation/` | Treat as implemented through commits, not as separately documented validation reports |
| Separate Phase 7.2G-A diagnostic document | Not found as a tracked validation document | Treat as git-history-supported context only |
| Separate Phase 7.2G-B readiness document | Not found as a tracked validation document | Treat as git-history-supported context only |
| Week 8 report | Not found under `docs/reports/` | Do not cite as repository evidence |
| Week 10 report | Not found under `docs/reports/` | Future/planned |

## 5. Current In-Progress Phase Inventory

| Item | Status | What exists | What is missing | Safe to proceed? | Required next action |
|---|---|---|---|---|---|
| Phase 7.2G-E-G persistent evidence replay validation planning | Drafted / untracked | `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_planning.md` | Review and commit | Yes | Review, adjust if needed, commit with related planning docs |
| Phase 7.2G-E-G replay validation implementation plan | Drafted / untracked | `docs/validation/phase_7_2g_e_g_persistent_evidence_replay_validation_implementation_plan.md` | Review and commit | Yes | Close planning before implementation |
| Week 9 persistent evidence validation report | Drafted / untracked | `docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md` | Review and commit | Yes | Include in documentation closeout |
| Week 10 roadmap/status report | Not found | No Week 10 report file found | Report creation | Yes | Use this investigation report as input |
| `backend/evidence_replay.py` | Not started | File absent | Replay verifier implementation | Yes after planning is committed | Implement in Phase 7.2G-E-H |
| `backend/test_evidence_replay.py` | Not started | File absent | Replay verifier tests | Yes after implementation begins | Add tests in Phase 7.2G-E-H |

## 6. Remaining Phase Inventory

| Phase | Name | Goal | Required implementation | Required validation | Safety constraints | Expected output document | Dependency | Priority |
|---|---|---|---|---|---|---|---|---|
| Phase 7.2G-E-G | Persistent Evidence Replay Validation Planning closeout | Lock replay validation plan | Documentation only | Review and commit planning docs | Do not read/modify runtime evidence | Phase 7.2G-E-G planning closeout | Current drafts | P0 |
| Phase 7.2G-E-H | Persistent Evidence Replay Verifier Implementation | Build read-only backend replay verifier | `backend/evidence_replay.py`, tests | Unit tests and read-only fixture-style validation | No runtime evidence modification; no frontend/firmware/control changes | Implementation report | Phase 7.2G-E-G | P0 |
| Phase 7.2G-E-I | Persistent Evidence Replay Validation Run | Validate replay on 5-minute and 1-hour evidence | Use verifier read-only | Confirm segment count, event count, summary match, hashes, run-root | Runtime evidence read-only; no file mutation | Replay validation report | Phase 7.2G-E-H | P0 |
| Phase 7.2G-E-J | Replay Result Report Integration | Add replay result to reports | Backend/frontend report schema updates if approved | Report export showing replay status | No unsupported replay claims | Report integration validation doc | Phase 7.2G-E-I | P1 |
| Phase 7.2G-E-K | Extended Persistent Evidence Soak Validation | Run longer persistent evidence soak | Possibly config/disk planning only | 6-hour or 24-hour run after replay passes | Keep telemetry-only; monitor disk | Extended soak report | Phase 7.2G-E-I/J | P1 |
| Phase 7.2G-E-L | Persistent Evidence Fault/Resilience Validation | Test writer/replay resilience | Fault injection or controlled tests | Queue overflow, partial finalization, missing/corrupt file handling | Do not compromise live telemetry | Fault/resilience validation report | Replay verifier | P1 |
| Future | FRAM checkpoint validation | Validate compact embedded checkpoint storage | MAIN firmware FRAM work in separate phase | FRAM read/write/checkpoint tests | No actuator scope creep | FRAM checkpoint validation report | Safety and hardware approval | P2 |
| Future | Actuator/control validation | Validate control path safely | Command authorization, safety interlocks, failsafe logic, actuator supervision | Dedicated safety validation before any actuation | Blocked until safety architecture exists | Control-readiness validation plan/report | Safety architecture | Blocked |

## 7. Detailed Current Capability Assessment

### Telemetry Ingestion

Current capability: Hardware telemetry ingestion from Pi gateway through MAIN and SUB is validated for telemetry-only operation.

Evidence: Phase 6.9 baseline documents `SERIAL_CONNECTED`, clean malformed/drop counters, healthy/synced links, and accepted packet types. Phase 7.2G-E-F-B documents hardware mode, `/dev/serial0`, `115200`, `SERIAL_CONNECTED`, `serial_connected=true`, and `hardware_connected=true`.

Limitations: Telemetry does not imply command/control readiness or actuator readiness.

Next action: Preserve telemetry-only boundary while adding read-only persistent replay validation.

### Backend Health Reporting

Current capability: Backend health includes hardware bridge state and persistent evidence summary fields.

Evidence: `backend/main.py` builds persistent evidence summary and includes it in `/health`; `backend/protocol.py` attaches optional `persistent_evidence_summary` to gateway health telemetry.

Limitations: Persistent replay status is not yet validated and remains false/pending by design.

Next action: Add replay result fields only after replay verifier validation passes.

### RTC Sync / Retention / Drift Evidence

Current capability: DS3231 RTC evidence includes sync path implementation, 6-day cold-retention observation, and 1-hour drift validation.

Evidence: Phase 7.2F-EXT reports `CAPTURED / PASS`; Phase 7.2G-C reports `PASS / VALIDATED` with 69 ms drift over 3609 seconds against a 3000 ms tolerance.

Limitations: Pi/backend UTC remains timestamp authority; `rtc_validated=false`; DS3231 is not timestamp authority.

Next action: Continue treating RTC as evidence-only unless a later approved phase changes authority rules.

### Persistent Evidence Writing

Current capability: Backend persistent evidence writing is implemented and validated in hardware mode.

Evidence: `backend/evidence_writer.py`, `backend/test_evidence_writer.py`, commit `d2f08b5`, Phase 7.2G-E-F-A, and Phase 7.2G-E-F-B.

Limitations: Writing and hash finalization are validated; deterministic replay validation is not.

Next action: Implement replay verifier.

### Evidence Finalization and Hashing

Current capability: Clean shutdown produces finalized manifest, summary, integrity metadata, segment SHA-256 hashes, and run-root SHA-256.

Evidence: Phase 7.2G-E-F-A reports `run_root_sha256=5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167`; Phase 7.2G-E-F-B reports `run_root_sha256=88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be`.

Limitations: SHA-256 supports file-integrity detection only. It is not tamper-proof storage or cryptographic attestation.

Next action: Replay and re-check saved metadata read-only.

### Frontend Report Integration

Current capability: Frontend report builder includes persistent evidence summary from backend state.

Evidence: `frontend/src/types/telemetry.ts`, `frontend/src/store/telemetryStore.ts`, `frontend/src/state/reportBuilder.ts`, and `frontend/src/components/ReportExportPanel.tsx`.

Limitations: The 1-hour persistent evidence validation did not capture a frontend report export before backend shutdown.

Next action: Decide whether replay result integration belongs before or after a replay validation run.

### Replay Validation

Current capability: Planning exists. Implementation does not.

Evidence: Phase 7.2G-E-G planning and implementation-plan docs exist but are untracked; `backend/evidence_replay.py` and `backend/test_evidence_replay.py` are absent.

Limitations: Persistent replay validation must not be claimed.

Next action: Implement backend-only read-only replay verifier in Phase 7.2G-E-H.

### Extended Soak Readiness

Current capability: 1-hour-plus backend persistent evidence soak passed with caveat.

Evidence: Phase 7.2G-E-F-B reports approximately 71 minutes 34 seconds, 9 segments, 44074 events, zero writer errors, and zero persistent drops.

Limitations: Longer 6-hour or 24-hour runs have not been documented, and replay validation has not passed.

Next action: Delay extended soak until replay verifier is implemented and validated.

### Fault Tolerance

Current capability: Evidence writer has tests for queue full handling, interrupted run detection, hash behavior, and safe disabled defaults.

Evidence: `backend/test_evidence_writer.py` includes queue overflow, idempotent stop, zero-event finalization, interrupted run detection, and corrupt/missing manifest detection coverage.

Limitations: Runtime fault/resilience validation is not documented for persistent evidence.

Next action: Add Phase 7.2G-E-L fault/resilience validation after replay verifier is complete.

### Runtime Evidence Git Hygiene

Current capability: Runtime evidence is ignored by Git.

Evidence: `.gitignore` contains `backend/evidence/` under NOVA SC runtime persistent evidence artifacts. Commit `a44b6fe` added this protection.

Limitations: Runtime evidence remains local filesystem evidence, not an attested archive.

Next action: Keep runtime evidence outside Git and plan separate archive/retention policy later.

### Firmware / Control Readiness

Current capability: MAIN and SUB firmware provide telemetry-only behavior.

Evidence: Firmware READMEs explicitly exclude command parser, command receiver, actuator control, PCA9685 output, GPIO actuator writes, and actuator power.

Limitations: No actuator/control/PWM/GPIO readiness is validated.

Next action: Keep actuator/control blocked until a safety architecture and validation plan exist.

## 8. Validation Evidence Summary

| Validation run | Duration | Source | Backend mode | Segments | Events | Drops | Errors | Hash/root result | Final result | Caveat |
|---|---:|---|---|---:|---:|---:|---:|---|---|---|
| Phase 7.2G-E-F-A 5-minute persistent evidence smoke | Approximately 395.905995 seconds | `docs/validation/phase_7_2g_e_f_a_5_minute_persistent_evidence_smoke_validation.md` | hardware | 1 | 3521 | 0 | 0 | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167`; integrity PASS | PASS | Persistent replay not claimed |
| Phase 7.2G-E-F-B 1-hour persistent evidence soak | Approximately 71 minutes 34 seconds | `docs/validation/phase_7_2g_e_f_b_1_hour_persistent_evidence_soak_validation.md` | hardware | 9 | 44074 | 0 | 0 | `88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be`; integrity PASS | PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED | Frontend report export before shutdown not captured; persistent replay not claimed |

## 9. Software Components Status

| Component | Current status | Role | Validation state | Remaining work |
|---|---|---|---|---|
| `backend/evidence_writer.py` | Implemented | Persistent evidence writer, segment rotation, manifest/summary/integrity, hashes, summary builder | Unit-tested and hardware-validated for writing | Replay verifier separate |
| `backend/test_evidence_writer.py` | Implemented | Unit tests for writer behavior | 40 targeted tests reported passing in validation docs | Add replay tests separately |
| `backend/evidence_replay.py` | Absent | Planned read-only replay verifier | Not validated | Implement in Phase 7.2G-E-H |
| `backend/test_evidence_replay.py` | Absent | Planned replay verifier tests | Not validated | Implement in Phase 7.2G-E-H |
| `backend/main.py` integration | Implemented | Configures/starts/stops writer; exposes persistent summary | Validated indirectly by hardware runs | Add replay summary only after replay validation |
| `backend/hardware_stream_manager.py` integration | Implemented | Enqueues normalized packets to writer before broadcast | Validated indirectly by hardware runs | Preserve non-blocking behavior |
| `backend/protocol.py` integration | Implemented | Adds persistent evidence summary to gateway health telemetry | Integrated | Add replay fields only when validated |
| Frontend telemetry types | Implemented | Defines `PersistentEvidenceSummary` | Integrated | Replay result type later if approved |
| Frontend telemetry store | Implemented | Stores persistent evidence summary from gateway health | Integrated | Replay status handling later |
| Frontend report builder | Implemented | Exports persistent evidence summary with conservative defaults | Integrated | Replay result report integration later |
| Frontend report export panel | Implemented | Displays backend persistent evidence enabled/disabled state | Integrated | Capture frontend export in future run |
| `.gitignore` | Implemented | Ignores `backend/evidence/` runtime artifacts | Committed | Maintain runtime evidence outside Git |

## 10. Hardware Interaction Status

| Hardware area | Current status | Evidence | Boundary |
|---|---|---|---|
| Raspberry Pi serial bridge | Validated for telemetry | Phase 6.9 and Phase 7.2G-E-F-B show `/dev/serial0`, `115200`, `SERIAL_CONNECTED` | Telemetry only |
| MAIN ESP32-S3 telemetry | Validated for telemetry | Phase 6.9 and firmware README | No actuator/control claim |
| SUB ESP32-S3 telemetry | Validated for telemetry through MAIN | Phase 6.9 and firmware README | One-way telemetry path; no command path |
| DS3231 RTC | Evidence captured, sync/drift path validated at evidence level | Phase 7.2F-EXT and Phase 7.2G-C | Pi/backend UTC remains authority; `rtc_validated=false` |
| FRAM | Blocked/future | Phase docs list FRAM as blocked/wrong IC pending | Future checkpoint layer only |
| Actuator/control hardware | Blocked/not validated | Phase 6.9 and firmware READMEs explicitly disable | No readiness claim |
| PCA9685 | I2C devices detected where documented; AllCall not independent validation | Phase 6.9 baseline | PWM output not validated |
| GPIO/PWM outputs | Not validated | Firmware READMEs exclude actuator writes | Blocked pending safety architecture |

## 11. Safety Boundary and Non-Claims

This report does not claim:

- Production readiness.
- Clinical readiness.
- Actuator/control readiness.
- Persistent replay validation.
- Tamper-proof evidence storage.
- Cryptographic attestation.
- FRAM validation.
- 6-hour or 24-hour soak validation.
- PCA9685 PWM readiness.
- GPIO output readiness.
- Motor, servo, stepper, pump, valve, relay, or heater readiness.
- DS3231 timestamp authority.

## 12. Risks and Open Issues

| Risk | Impact | Current mitigation | Remaining action | Priority |
|---|---|---|---|---|
| Replay validation not yet passed | Persistent evidence cannot yet be claimed replay-verified | Planning docs exist | Implement and validate replay verifier | P0 |
| Frontend report export missed in 1-hour run | Frontend export path not evidenced for that run | Backend evidence still finalized and verified | Capture export in future validation | P1 |
| Long-run evidence not yet replay-verified | Longer soaks may produce evidence that is hard to audit deterministically | Backend writing and hashes validated | Replay 5-minute and 1-hour runs first | P0 |
| Runtime evidence stored locally only | Evidence could be lost outside Git/archive process | `.gitignore` protects repo from runtime artifacts | Plan archive/backup policy later | P2 |
| No cryptographic attestation | SHA-256 detects changes but does not prove custody | Claim boundary documented | Consider signed manifests later | P3 |
| No tamper-proof storage | Local files can be altered by a privileged user | Claim boundary documented | Consider immutable/archive workflow later | P3 |
| No FRAM checkpoint validation | Embedded black-box checkpoint layer unavailable | FRAM kept out of primary evidence path | Separate FRAM validation phase | P2 |
| No actuator/control safety layer | Control readiness cannot be claimed | Firmware and docs keep command/control disabled | Design safety architecture before controls | Blocked |
| Longer soak tests not yet done | 6-hour/24-hour reliability remains unknown | 1-hour-plus persistent evidence soak passed | Run only after replay validation | P1 |
| Git/authentication workflow differences between Pi and laptop | Evidence/code synchronization may be uneven | Pi pull and laptop docs used in validation flow | Document operational workflow | P2 |

## 13. Recommended Roadmap

1. Close and commit Phase 7.2G-E-G planning documents.
2. Implement Phase 7.2G-E-H replay verifier.
3. Validate replay on 5-minute and 1-hour evidence.
4. Document Phase 7.2G-E-I replay validation result.
5. Integrate replay result into reports.
6. Run a longer soak only after replay validation passes.
7. Add fault/resilience tests.
8. Plan FRAM checkpoint validation separately.
9. Keep actuator/control blocked until safety architecture exists.

## 14. Week 10 / Immediate Work Plan

| Day | Work item | Output |
|---|---|---|
| Day 1 | Review current Phase 7.2G-E-G planning and implementation-plan docs | Committed planning baseline |
| Day 2 | Implement backend-only read-only replay verifier skeleton | `backend/evidence_replay.py` |
| Day 3 | Add replay verifier unit tests for manifest, summary, integrity, segment count, event count, and missing/corrupt files | `backend/test_evidence_replay.py` |
| Day 4 | Run read-only replay against documented 5-minute evidence if available on Pi | Smoke replay result |
| Day 5 | Run read-only replay against documented 1-hour evidence if available on Pi | 1-hour replay result |
| Day 6 | Write Phase 7.2G-E-I replay validation report | Validation report |
| Day 7 | Decide whether report integration should happen immediately or after one more replay run | Phase 7.2G-E-J go/no-go |

## 15. Final Status Summary

COMPLETED:

- Phase 6.9 hardware telemetry baseline.
- Phase 7.1 ADS1115/power rail raw debug and investigation evidence.
- DS3231 RTC sync/retention/drift evidence through Phase 7.2G-C.
- Heartbeat-gap soak stability diagnosis.
- Persistent evidence architecture planning.
- Backend persistent evidence writer and hash finalization.
- Persistent evidence summary report integration.
- 5-minute persistent evidence smoke validation.
- 1-hour persistent evidence soak validation with frontend export caveat.
- Runtime evidence ignore protection.

CURRENT:

- Phase 7.2G-E-G persistent evidence replay validation planning is drafted but untracked.
- This project-status investigation report is newly created for roadmap planning.

REMAINING:

- Replay verifier implementation.
- Replay validation on existing persistent evidence runs.
- Replay result report integration.
- Longer persistent evidence soak validation.
- Persistent evidence fault/resilience validation.

BLOCKED:

- Actuator/control validation.
- PCA9685 PWM readiness.
- GPIO output readiness.
- Motor/servo/stepper/pump/valve/relay/heater readiness.

FUTURE:

- FRAM checkpoint validation as a separate compact embedded checkpoint phase.
- Archive/attestation policy if stronger evidence-chain claims are required.

Recommended immediate next action:

```text
Close and commit Phase 7.2G-E-G planning documents, then implement Phase 7.2G-E-H read-only persistent evidence replay verifier.
```

## 16. Final Machine-Readable Summary

```json
{
  "repository_head": "a44b6fe Ignore backend runtime evidence artifacts",
  "completed_phase_count": 14,
  "current_phase": "Phase 7.2G-E-G persistent evidence replay validation planning",
  "next_phase": "Phase 7.2G-E-H persistent evidence replay verifier implementation",
  "replay_validated": false,
  "actuator_control_validated": false,
  "fram_validated": false,
  "backend_persistent_evidence_validated": true,
  "one_hour_soak_validated": true,
  "recommended_next_action": "Review and commit Phase 7.2G-E-G planning documents, then implement a backend-only read-only persistent evidence replay verifier."
}
```

## 17. Final Status

```text
NOVA_SC_PROJECT_STATUS_INVESTIGATION_FOR_ROADMAP: READY_FOR_REVIEW
```
