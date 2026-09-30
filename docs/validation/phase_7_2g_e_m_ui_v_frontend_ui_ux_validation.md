# Phase 7.2G-E-M-UI-V - Frontend UI/UX Final Runtime Validation

## 1. Executive Summary

Phase 7.2G-E-M-UI-V completed final runtime validation of the NOVA SC frontend against the live Raspberry Pi hardware telemetry backend.

The validation result is:

```text
PHASE_7_2G_E_M_UI_V_FRONTEND_UI_UX_VALIDATION: READY_FOR_REVIEW
```

The frontend connected to the hardware-mode backend at `10.212.83.193:8000`. Live telemetry remained connected and fresh, populated technical evidence was accessible, the five required mobile views fit a `360 x 800` viewport without horizontal overflow, keyboard focus and disclosure operation passed, and one report export produced one version `v1.2` JSON download from one `/health` request.

The exported report preserved the required semantic separation between `persistent_evidence_summary`, `persistent_replay_summary`, and `persistent_replay_capture`. Replay remained `PENDING`; the absence of an artifact did not become a pass or failure.

No application source was modified. The previously recorded C1/C2 ambiguities and device/link registry aging risks remain open and were not changed in this phase.

## 2. Baseline

| Field | Evidence |
|---|---|
| Local `HEAD` | `d3244c51e78f8bba97fe86289c418e6fdb9dd96f` |
| `origin/main` | `d3244c51e78f8bba97fe86289c418e6fdb9dd96f` |
| Baseline commit | `d3244c5 Fix frontend telemetry freshness clock domain` |
| Initial `git diff --check` | PASS |
| Backend host | Raspberry Pi `NOVA` |
| Verified Pi IPv4 | `10.212.83.193` |
| Frontend endpoint configuration | Already matched the verified Pi IP; unchanged |

Recent implementation history:

```text
d3244c5 Fix frontend telemetry freshness clock domain
19f4f16 Document frontend telemetry freshness clock-domain diagnosis
6e9ad80 Fix NOVA SC desktop topology responsiveness
18a7660 Professionalize NOVA SC reports and event log
2c4b472 Professionalize NOVA SC time health and device views
1d35dc9 Professionalize NOVA SC topology hardware and power views
ab72813 Professionalize NOVA SC overview and global status
66b39e9 Implement NOVA SC responsive supervision shell
31c3e18 Document NOVA SC frontend UI UX professionalization diagnosis
```

The Pi-local loopback curl was not repeated because the password-authenticated PuTTY session was occupied by the foreground backend process. The same process visibly completed startup on `0.0.0.0:8000`, and its `/health` endpoint returned HTTP 200 from Windows. No second backend was started.

## 3. UI-A Through UI-B5 History

| Phase | Scope | Result |
|---|---|---|
| UI-A | UI/UX diagnosis | PASS |
| UI-B1 | Shell, navigation, and header | PASS |
| UI-B2 | Overview and global status | PASS |
| UI-B3 | Topology, hardware, and power | PASS |
| UI-B4 | Time, health, and devices | PASS |
| UI-B5 | Reports and event log | PASS |

This runtime phase retained those completed implementation results and did not reopen their source changes.

## 4. Original UI-V Validation

The original UI-V campaign established the broad responsive and functional baseline. This resumed pass covered only the remaining live-evidence items: Time & Clock, advanced power diagnostics, health-rule evidence, report export semantics, populated `360 px` views, accessibility, console behavior, and final documentation.

The original desktop Hardware, Power, Event Log, Devices, terminology audit, and 54-case viewport matrix were retained as existing evidence and were not rerun unnecessarily.

## 5. Topology F1/F2 Correction

| Phase | Scope | Result |
|---|---|---|
| UI-V-F1 | Topology breakpoint correction | PASS |
| UI-V-F2 | Topology density correction | PASS |

The committed correction at `6e9ad80` remained in the validated baseline. No topology source was modified during this phase.

## 6. Freshness V-F Diagnosis, Correction, and Validation

| Phase | Scope | Result |
|---|---|---|
| V-F-A | Freshness clock-domain diagnosis | PASS |
| V-F-B1 | Local monotonic freshness correction | PASS |
| V-F-B2 | Deterministic regression tests | PASS |
| V-F-V | Real Pi/browser freshness validation | PASS |

The freshness defect remains closed. This phase performed only the requested export smoke check and did not modify or reopen freshness logic.

## 7. Static Test, Build, and Lint Evidence

| Check | Result | Evidence |
|---|---|---|
| `npm test -- --run` | PASS | 3 test files, 42 tests passed |
| `npm run build` | PASS | Vite `8.0.14`; 1773 modules transformed |
| `npm run lint` | PASS | No lint errors |

## 8. Original Responsive Matrix

The original 54-case responsive viewport matrix remains accepted evidence. It was not repeated. The resumed runtime pass added direct populated measurements for Hardware, Power, Event Log, Devices, and Reports at exactly `360 x 800`.

## 9. Live Hardware Result

Result: **PASS**.

The Hardware page showed live hardware status with system health `Needs attention`, connection `Connected`, seven healthy devices, five devices needing attention, and data status `Live`.

At `360 px`, hardware content rendered as cards rather than a squeezed desktop table. Populated I2C/SPI identities, status labels, technical disclosures, addresses, and chip-select values remained contained. Observed device context included ADS1115 `0x48`, DS3231 `0x68`, PCA9685 addresses `0x40`, `0x41`, and AllCall `0x70`, plus MB85RS256B FRAM at `FRAM_CS_GPIO10`.

## 10. Live Power Result

Result: **PASS**.

The Power page showed `Unknown status` for overall power because calibrated rail mapping is not available. Input supply, 5 V rail, and 3.3 V rail remained explicitly identified as raw ADC-only evidence rather than validated rail voltages.

Advanced measurement diagnostics exposed:

| Field | Runtime value |
|---|---|
| ADC source | `ADS1115` |
| ADC address | `0x48` |
| ADC mode | `RAW_SINGLE_ENDED_DEBUG` |
| Measurement status | `ADC_RAW_DEBUG` |
| AIN0 | approximately `0.5663 V` |
| AIN1 | approximately `0.5667 V` |
| AIN2 | approximately `0.5683 V` |
| AIN3 | approximately `0.5657 V` |

The warning remained readable and explicit: raw ADC inputs are diagnostic measurements and are not calibrated rail voltages. No raw reading was presented as a validated 5 V or 3.3 V rail.

## 11. Event Log Populated Result

Result: **PASS**.

The populated Event Log presented severity, time, human-readable source, message, and expandable technical details as mobile cards. One disclosure was opened at `360 px`.

Representative exported event evidence:

| Field | Value |
|---|---|
| Severity | `INFO` |
| Event type | `GATEWAY_HEALTH_TELEMETRY` |
| Stream ID | `PI_STREAM_20260930T135000Z` |
| Global sequence | `4152` |
| Source sequence | `467` |
| Raw node ID | `pi_gateway` |
| Exact UTC timestamp | `2026-09-30T13:57:47.430540+00:00` |

The event list retained bounded vertical scrolling and contained long technical values without horizontal page overflow.

## 12. Devices Populated Result

Result: **PASS**.

At `360 px`, populated devices appeared as individual cards with device name, health, type, status message, and technical details. Fifteen disclosure controls were present; one was opened during validation. No seven-column desktop table squeeze remained.

## 13. Time & Clock Result

Result: **PASS**.

| Field | Visible runtime state |
|---|---|
| Clock Detected | `Yes` |
| Clock Condition | `Clock detected - time invalid` |
| Time Authority | `Gateway UTC` |
| Synchronization | `Not recorded` |
| Retention | `Retention check pending` |
| Drift & Stability | `Synchronization result required` |
| Required Next Action | `Clock synchronization required` |

All four disclosures were accessible: Synchronization, Retention, Drift & Stability, and Technical Clock Details. Raw evidence included `RTC_PRESENT_TIME_INVALID_OSF`, oscillator-stop flag `true`, time-valid `false`, DS3231-unverified status, battery present/configured, no synchronization result, and required action `PI_TO_RTC_SESSION_SYNC_REQUIRED`.

Gateway/backend UTC remained timestamp authority (`PI_BACKEND_UTC`, source `PI_GATEWAY_SYSTEM_CLOCK`). DS3231 detection was not presented as RTC validation or timestamp authority. No actuator or control-readiness claim appeared.

## 14. System Health Evidence Result

Result: **PASS**.

System Health reported 40 passes, five warnings, zero failures, and zero critical results. A populated Technical evidence disclosure was opened.

| Field | Value |
|---|---|
| Rule ID | `TOPOLOGY_LAPTOP_CONSOLE_REACHABLE` |
| Raw result | `PASS` |
| Severity | `INFO` |
| Source | `connectionState` |
| Value | `CONNECTED` |
| Timestamp | `-` because this rule carries no timestamp |

The presentation preserved the health-engine result and raw evidence; it did not reinterpret the rule outcome.

## 15. Reports Result

Result: **PASS**.

Before export, Reports displayed Report Summary, Evidence Status, Operating Mode, the Export Report button, and technical details. The operating mode was worded as `Hardware telemetry`, meaning telemetry source mode only. Adjacent evidence state remained explicit and did not imply complete physical-hardware validation.

The pre-export technical details correctly showed replay/report data as not yet captured in that frontend session. Export subsequently captured backend health and represented that capture separately from replay validation.

## 16. Single-Export Validation

Result: **PASS**.

The network observation window was cleared and Export Report was activated exactly once. One JSON report was downloaded:

```text
nova_sc_phase_6_9_hardware_telemetry_report_2026-09-30T13-57-47.446Z.json
```

No concurrent or duplicate export occurred. The Export Report control was not activated again during mobile or accessibility validation.

## 17. Exactly-One `/health` Request

Result: **PASS**.

The export produced exactly one resource entry for:

```text
http://10.212.83.193:8000/health
```

Observed export-attributable `/health` request count: `1`.

Observed report download count: `1`.

## 18. Report v1.2 Schema Validation

Result: **PASS**.

| Contract field | Exported value |
|---|---|
| `report_type` | `NOVA_SC_SUPERVISORY_VALIDATION_REPORT` |
| `report_version` | `v1.2` |
| `report_metadata.report_schema_version` | `v1.2` |
| `persistent_evidence_summary` | Present |
| `persistent_replay_summary` | Present |
| `persistent_replay_capture` | Present |

At export, telemetry was `CONNECTED`, non-stale, and hardware sourced. The report captured packet count `2286`, packet rate `9.2 Hz`, and last packet UTC `2026-09-30T13:57:47.430540+00:00`.

## 19. Replay and Evidence Semantics

The three responsibilities remained separate.

Persistent evidence writer/finalization state:

| Field | Value |
|---|---|
| Enabled | `false` |
| Active | `false` |
| Segments written | `0` |
| Events written/dropped | `0` / `0` |
| Writer errors | `0` |
| Finalized/hash finalized | `false` / `false` |
| Required next action | `ENABLE_BACKEND_PERSISTENT_EVIDENCE_FOR_VALIDATION_RUN` |

Persistent replay artifact validation state:

| Field | Value |
|---|---|
| Replay validation status | `PENDING` |
| Persistent replay validated | `false` |
| Artifact selected | `false` |
| Artifact present | `false` |
| Identity bound | `false` |
| Required next action | `CONFIGURE_REPLAY_ARTIFACT` |

Persistent replay capture state:

| Field | Value |
|---|---|
| Report data status | `AVAILABLE` |
| Source | `BACKEND_HEALTH` |
| Captured at UTC | `2026-09-30T13:57:47.402Z` |
| Error reason | `null` |
| `capture_error` | Not present |

`PENDING` remained `PENDING`. No artifact selected did not become `PASS`. Available report transport data did not become replay validation. A report-data transport failure would remain capture state and would not be rewritten as replay `FAIL`; an actual backend replay `FAIL` would remain `FAIL`. Persistent evidence writer state remained a sibling of replay artifact state.

## 20. 360 px Populated Validation

All required pages were validated at `360 x 800` with populated live data.

| Page | Viewport width | Document width | Body width | Details | Tables | Overflowing descendants | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Hardware | 360 | 360 | 360 | 6 | 0 | 0 | PASS |
| Power | 360 | 360 | 360 | 1 | 0 | 0 | PASS |
| Event Log | 360 | 360 | 360 | 100 | 0 | 0 | PASS |
| Devices | 360 | 360 | 360 | 15 | 0 | 0 | PASS |
| Reports | 360 | 360 | 360 | 1 | 0 | 0 | PASS |

For every page:

```text
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

evaluated true. Long technical values wrapped, chips remained readable, disclosures were usable, buttons were reachable, and content stayed inside cards.

## 21. Accessibility Result

Result: **PASS**.

Keyboard validation confirmed:

- The mobile navigation control has the accessible name `Open navigation`.
- Shell navigation is keyboard reachable.
- Time & Clock disclosures are keyboard reachable.
- Space toggles a native disclosure while focus remains on its summary.
- Power advanced diagnostics and System Health technical evidence use the same keyboard-operable disclosure pattern.
- Export Report is keyboard reachable without activation.
- Mobile cards and their technical disclosures remain in the keyboard path.
- Keyboard-focused controls show a solid `2 px` visible outline.
- Labels are readable, and status words such as Connected, Live, Needs attention, PASS, and WARNING supplement color.

## 22. Browser Console Result

Result: **PASS WITH BENIGN STARTUP NOTE**.

| Category | Result |
|---|---|
| React exceptions | None |
| Uncaught exceptions | None |
| Unexpected network failures | None during validated steady state/export |
| Layout/runtime warnings | None |

One startup-time WebSocket warning stated that a connection closed before establishment during the instrumented development startup. The application then established the live WebSocket, continued receiving packets, and remained connected throughout validation. No persistent runtime failure accompanied the warning.

## 23. Freshness Smoke Result

Result: **PASS**.

| Observation | Before export | After export |
|---|---:|---:|
| WebSocket | `CONNECTED` | `CONNECTED` |
| Packet count | `2286` | `2289` |
| Packet rate | `9.2 Hz` | `9.0 Hz` |
| Telemetry stale | `false` | `false` |
| Data Status | `Live` | `Live` |

The packet counter advanced during export, the rate remained non-zero, and Data Status remained Live. This was intentionally a smoke check, not a repeat of the completed 60-second V-F-V campaign.

## 24. Remaining Open Findings

The following items remain open and unchanged:

| Finding | Status |
|---|---|
| `UI_V_FINDING_C1: AMBIGUOUS_DEVICE_ATTENTION_AGGREGATION` | OPEN |
| `UI_V_FINDING_C2: OPERATOR_CONSOLE_CONNECTION_VS_REGISTRY_HEALTH_AMBIGUITY` | OPEN |
| `DEVICE_REGISTRY_CLOCK_DOMAIN_AGING_RISK` | OPEN |
| `LINK_REGISTRY_CLOCK_DOMAIN_AGING_RISK` | OPEN |

These items were recorded only. No fixes were implemented.

## 25. Non-Regression Boundaries

This phase was validation and documentation only.

It did not modify:

- Frontend application source
- Backend application source
- Firmware
- Freshness logic
- WebSocket or protocol behavior
- Replay validation behavior
- Evidence writer behavior
- RTC sync behavior or timestamp authority
- Command/control paths
- Actuator, PWM, GPIO, PCA9685, or FRAM behavior

The exported report does not claim tamper-proof storage, cryptographic attestation, production archive readiness, FRAM validation, actuator/control readiness, or complete physical-hardware validation.

## 26. Final UI-V Result

```text
PHASE_7_2G_E_M_UI_V_FRONTEND_UI_UX_VALIDATION: READY_FOR_REVIEW
```

Final conclusion:

- Static tests, build, and lint passed.
- The live hardware telemetry frontend was connected, populated, and fresh.
- Remaining Time & Clock, Power, System Health, Reports, export, responsive, accessibility, and console checks passed.
- Exactly one export produced exactly one `/health` request and one download.
- The exported report conformed to schema version `v1.2` and preserved replay/evidence semantic boundaries.
- All required populated `360 px` views passed horizontal-overflow checks.
- The four separately scoped findings remain open without blocking this UI/UX validation result.
