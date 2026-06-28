# NOVA SC Week 5 Internship Progress Report

**Project:** NOVA Supervision Console (NOVA SC)  
**Internship area:** AI and Data Engineering  
**Reporting scope:** Phase 7.0C through Phase 7.2E-2A  
**Report date:** 22 June 2026

## 1. Executive Summary

NOVA SC is a supervisory telemetry and validation application for observing a distributed embedded system through a Raspberry Pi gateway. Its software purpose is to ingest telemetry from multiple producers, validate packet identity and structure, reconstruct system state, monitor topology and health, detect integrity anomalies, retain bounded event evidence, replay that evidence deterministically, and export an auditable validation report.

Week 5 moved NOVA SC from short-session hardware telemetry monitoring toward a more disciplined observability and evidence platform. The most important improvement was not the addition of individual sensor values; it was the strengthening of the complete data path and the rules governing what the software is allowed to claim. Long-duration soak evidence became reproducible, transport freshness semantics were corrected, replay reconstruction was brought into agreement with live state, analog data was explicitly classified as uncalibrated debug evidence, and RTC data was separated from trusted timestamp authority.

The current architecture is best described as a validated engineering prototype operating in a relevant hardware environment. A cautious Technology Readiness Level interpretation is approximately **TRL 5 for the telemetry supervision subsystem**: the end-to-end chain has been demonstrated with physical devices, sustained traffic, validation rules, replay, and report export. This is not a project-wide TRL claim. Production readiness remains limited by the absence of validated RTC retention, calibrated rail sensing, persistent event storage, command authorization, safety interlock telemetry, watchdog/fail-safe evidence, and deployment hardening.

Key Week 5 achievements were:

- Stable 10-minute and 30-minute hardware telemetry soak validation.
- Expansion of the bounded event store from 5,000 to 20,000 records.
- Explicit separation of live soak summaries from bounded raw replay completeness.
- Correction of laptop/Pi WebSocket freshness and replay topology reconstruction.
- End-to-end ADS1115 raw channel telemetry with honest non-calibrated labeling.
- Read-only DS3231 status telemetry and deterministic RTC validity classification.
- Preservation of Pi/backend UTC as the only timestamp authority.
- A fail-closed Pi time trust gate using NTP and monotonic-clock evidence.
- A strict preview-only RTC synchronization request protocol with canonical serialization and hashing.

The evidence base for this report comprises the repository at commit `792d4ef`, the phase-scoped Git history, validation documentation under `docs/validation`, current source and tests, and the exported supervisory JSON reports reviewed from 15-18 June 2026. The runtime exports and operator-provided Pi trust result were available for this review but are not committed artifacts. Moving selected acceptance evidence into a versioned or controlled artifact store remains an auditability improvement.

For an AI/Data Engineering internship, this work is directly relevant because reliable models and analytics depend on trustworthy data lineage. NOVA SC now has stronger schema enforcement, event provenance, deterministic replay, state derivation, anomaly counters, and evidence export. No machine-learning model was introduced during this period; the engineering focus was the data-quality and observability foundation required before later analytics or AI-assisted diagnosis can be credible.

## 2. Phase-by-Phase Analysis

| Phase | Goal | Implementation | Validation | Outcome |
|---|---|---|---|---|
| **7.0C** | Stabilize soak evidence and freshness behavior. | Prioritized queued hardware packets before periodic gateway health broadcasts; increased event capacity to 10,000; introduced device-specific freshness policies; preserved static expected-warning devices; added replay-completeness fields to reports. | A 619-second run reached the 10-minute target with 5,686 retained events, no dropped old records, and zero duplicate, out-of-order, gap, reset, malformed, or schema-rejected packets. | Soak verdict `PASS`; raw replay complete. |
| **7.0D** | Prepare the event pipeline for 30-minute validation. | Increased the bounded event store from 10,000 to 20,000 records. | A 2,135-second run retained 18,763 events with no dropped old records and clean integrity counters. | Thirty-minute soak behavior passed, but a false laptop/Pi freshness failure and incomplete replay topology remained visible in health output. |
| **7.0D fixes** | Remove false topology failures and align replay with live state. | Refreshed the laptop/Pi link from real WebSocket activity; made freshness depend on connection and telemetry staleness; reconstructed gateway registry state from gateway health packets; derived laptop/Pi activity during replay. | A post-fix 1,801-second run retained 17,103 events. Soak verdict was `PASS`; health reported 40 passes, five expected warnings, zero failures, and zero critical findings. | Live health, topology, and replay evidence became mutually consistent. |
| **7.1A** | Prove end-to-end ADS1115 analog telemetry without making rail claims. | Added an ADS1115 single-ended AIN0-AIN3 reader, `ADC_RAW_DEBUG` payload fields, packet validation, device-registry handling, UI display, and report evidence. | ADS1115 was detected at `0x48`; all four raw channels reached the frontend and report; packet integrity remained clean. | Accepted as raw debug telemetry. No calibration or rail mapping was claimed. |
| **7.1B investigation** | Determine whether ADC channels represent VIN, 5 V, or 3.3 V rails. | Traced channel connectivity and documented electrical observations. | Repository documentation records AIN0-AIN3 as general-purpose connector inputs, with no dedicated rail-divider network. Raw values near 0.57-0.58 V differed from DMM observations near 1.1 V. | Investigation accepted; channels must not be interpreted as power rails. |
| **7.2A** | Define RTC role, trust boundary, and timestamp-discipline requirements. | Investigated DS3231 access, Pi/backend timing, UART directionality, and the consequences of OSF and uninitialized time. | Architecture review confirmed that the current pipeline is upstream telemetry only and that RTC data cannot safely replace backend timestamps. | Pi/backend UTC retained as authority; RTC restricted to evidence. |
| **7.2B** | Add read-only RTC status telemetry. | Added DS3231 register reading, BCD decoding, OSF extraction, five-second status packets, backend event mapping, frontend validation/types/store/UI, and report export. | Runtime report shows DS3231 detected at `0x68`, register reads successful, battery configured, and status telemetry transported end to end. | Read-only RTC evidence accepted; OSF remained set and time remained invalid. |
| **7.2C** | Convert raw RTC status into explicit validity evidence. | Added a deterministic RTC validity classifier, required-next-action model, UI evidence, and report fields. | Runtime classification produced `RTC_PRESENT_TIME_INVALID_OSF`, `RTC_PRESENT_BUT_TIME_INVALID`, and `PI_TO_RTC_SESSION_SYNC_REQUIRED`. | Accepted. The RTC cannot be timestamp authority. |
| **7.2E-1** | Prove that Pi time is trustworthy before any future RTC write. | Added `PiTimeTrustEvidence`, `timedatectl` NTP inspection, plausible-year checks, a 30-second wall/monotonic observation, clock-jump detection, fail-closed statuses, and a local dry-run CLI. | Deterministic backend tests cover trusted, unavailable, and jump-detected cases. Pi-side evidence reported `PI_TIME_TRUSTED`, NTP synchronized, and `SYNC_ALLOWED=true`. | Trust gate accepted; no UART write was introduced. |
| **7.2E-2A** | Define and preview a safe RTC synchronization request without transmission. | Added a frozen request type, exact field allowlist, UUID4 session IDs, ten-second expiry, UTC millisecond formatting, canonical JSON, 512-byte limit, SHA-256 audit hash, preview metadata, and CLI preview mode. | Protocol and trust suite contains 15 passing tests. Preview always reports `write_attempted=false`; the CLI has no serial dependency and no send option. | Preview protocol accepted. UART transmission remains disabled pending a bounded MAIN parser. |

Commit-level traceability is available through the phase commits `bdf55a2`, `d20edcf`, `a461fb9`, `fceadb5`, `b8d5b50`, `0166a11`, `435e768`, `ab6b860`, and `792d4ef`.

## 3. Software Architecture Evolution

### 3.1 Current architecture

```text
MAIN ESP32 telemetry ----+
                         |
SUB ESP32 telemetry --> MAIN forwarding
                         |
                         v
                  Raspberry Pi UART
                         |
              SerialBridge validation
                         |
              HardwareStreamManager
                         |
                  WebSocket stream
                         |
              Frontend ingestion pipeline
                         |
       +-----------------+-------------------+
       |                 |                   |
 Packet validation   Event store       Live registries
       |                 |             and health engine
       |                 v                   |
       |          Replay reducer             |
       +-----------------+-------------------+
                         |
                 Supervisory report
```

### 3.2 Evolution by subsystem

**Telemetry ingestion.** Before these phases, the physical UART and WebSocket pipeline was operational, but long-session behavior had not been fully characterized. Phase 7.0C changed backend scheduling so already-queued hardware packets are drained before synthetic gateway-health emission. This reduced avoidable queue latency and made the gateway packet source a better citizen in a mixed-rate stream.

**Packet validation.** The frontend validator already enforced canonical nodes, links, event types, numeric bounds, timestamps, and source-to-event consistency. Week 5 extended this contract for `ADC_RAW_DEBUG` and `RTC_STATUS_TELEMETRY`. Invalid event sources, malformed RTC fields, unsupported status values, and out-of-range ADC values are rejected rather than silently accepted.

**Device registry.** Device state is derived from accepted telemetry, not directly trusted from UI components. Freshness is now policy-based: high-rate nodes, slower chip telemetry, power telemetry, and static expected warnings use different aging behavior. This prevents a slow but valid sensor cadence from being treated like a failed heartbeat.

**Link registry.** The three canonical links are laptop/Pi, Pi/MAIN, and MAIN/SUB. UART links use explicit heartbeat telemetry. The laptop/Pi link does not have a firmware heartbeat, so Phase 7.0D fixes correctly model live WebSocket packet activity as its freshness evidence.

**Health engine.** The health engine combines connection state, telemetry freshness, node state, link state, synchronization, packet integrity, chip evidence, and expected warnings. The key improvement was semantic: a connected and active WebSocket is no longer failed because its original connection timestamp ages during a long soak.

**Event store and replay reducer.** The frontend retains an append-only logical event history with accepted and rejected dispositions. It is bounded for browser safety, while the soak accumulator separately preserves long-run counters. Replay rebuilds registries and health from stored accepted packets using a replay-relative clock. Gateway state and laptop/Pi activity are now reconstructed, eliminating false replay-only offline nodes.

**Report engine.** Exported reports now explain whether the live soak summary is complete and whether raw event replay is complete. They contain topology, registries, health rules, event dispositions, integrity counters, recent events, replay state, live/replay comparisons, raw ADC evidence, RTC evidence, limitations, and disabled features. This makes the report an engineering audit artifact rather than a UI screenshot substitute.

**Power telemetry subsystem.** The subsystem progressed from null placeholders to real ADS1115 input readings while preserving null rail fields. The data model distinguishes acquisition success from engineering interpretation.

**RTC subsystem.** The subsystem progressed from device detection to read-only status, then to validity classification, then to trust-gated synchronization design. At no point was RTC data allowed to replace packet timestamps.

**Pi gateway.** The Pi owns serial ingestion, normalization, stream identity, gateway health, WebSocket distribution, and backend UTC timestamps. Phase 7.2E adds a time-trust assessment around that authority without changing it.

## 4. Telemetry System Improvements

The operational packet path is:

```text
ESP32 packet
  -> newline-delimited UART JSON
  -> backend boundary/decode/schema validation
  -> normalization and stream metadata
  -> subscriber broadcast
  -> WebSocket transport
  -> frontend packet validation
  -> integrity classification
  -> event store and derived state
  -> health, replay, UI, and report evidence
```

The backend rejects malformed UART boundaries, JSON parse failures, unknown sources, unsupported events, invalid links, and schema errors. Accepted packets are normalized before entering the broadcast queue. The frontend performs a second validation layer because transport acceptance alone is not sufficient evidence for supervisory state.

Integrity accounting distinguishes duplicate packets, out-of-order packets, sequence gaps, sequence resets, stream switches, malformed packets, schema rejections, and unknown identities. Duplicate and out-of-order packets are retained as rejection evidence rather than used to update live state. Sequence gaps may be accepted with an anomaly disposition so the state can continue while the loss remains auditable.

Replay is deterministic over the bounded event store. It reconstructs device state, link state, gateway health, active stream identity, source sequences, packet counters, and validation results relative to the latest accepted packet time. Live-versus-replay comparison checks critical state and integrity counters. The reports reviewed for the successful soak runs recorded no live/replay differences.

Soak testing adds a time-oriented aggregation layer above individual packets. It records packet rates, counts by source and event type, link heartbeat gaps, dropout/recovery counts, health transitions, reset observations, warnings, and failure reasons. Exported reports preserve both the accumulated soak verdict and the raw-event replay limitation state.

## 5. Phase 7.0 Soak Test Results

### 5.1 Evidence progression

| Snapshot | Event capacity/use | Soak result | Integrity result | Engineering interpretation |
|---|---:|---|---|---|
| Initial constrained snapshot | 5,000/5,000; 1,183 old events dropped | In progress | 8 out-of-order packets and 8 sequence gaps | Capacity was insufficient for retained replay evidence; the snapshot exposed real evidence-loss limits. |
| 10-minute validation | 5,686/10,000; none dropped | `PASS`, 619 seconds | All tracked counters zero | Phase 7.0C scheduling, freshness, and evidence changes supported a complete ten-minute run. |
| First 30-minute validation | 18,763/20,000; none dropped | `PASS`, 2,135 seconds | All tracked counters zero | Data retention and link telemetry were stable, but health still falsely failed laptop/Pi freshness and replay Pi topology. |
| Post-fix 30-minute validation | 17,103/20,000; none dropped | `PASS`, 1,801 seconds | All tracked counters zero | Health converged to 40 passes, five expected warnings, no failures, and no critical results. |

### 5.2 Root causes and fixes

1. **Event-store overflow:** the original 5,000-record bound was smaller than the volume accumulated around soak execution. Capacity was increased first to 10,000 and then 20,000. Reports now disclose dropped old records instead of implying complete replay.
2. **Gateway scheduling fairness:** periodic gateway health generation could run before waiting hardware packets. The stream manager now drains immediately available source packets first.
3. **Over-general freshness thresholds:** one timeout policy was unsuitable for nodes, chip scans, power samples, and static warnings. Device-specific policies were introduced.
4. **Laptop/Pi false freshness failure:** the health engine aged the WebSocket connection timestamp as if it were a periodic heartbeat. Real packet activity now refreshes the link, while connection state and telemetry staleness remain failure gates.
5. **Replay topology mismatch:** gateway-health packets updated gateway payload state but did not update the replayed device registry; WebSocket activity was also absent from replay. Both derivations were added.

The final result is a long-duration evidence path in which the soak verdict, health engine, topology, event retention, and replay reconstruction describe the same run consistently.

## 6. ADS1115 Raw Telemetry Work

Phase 7.1A implemented a real acquisition path from the ADS1115 at address `0x48`. MAIN firmware configures each input for single-ended conversion, waits for conversion completion, reads the signed conversion register, and converts counts using a 4.096 V full-scale range. The scheduler publishes the results inside `POWER_HEALTH_TELEMETRY`:

```json
{
  "measurement_status": "ADC_RAW_DEBUG",
  "adc_source": "ADS1115",
  "adc_address": "0x48",
  "adc_mode": "RAW_SINGLE_ENDED_DEBUG",
  "ads1115_channels": {
    "ain0_v": 0.57,
    "ain1_v": 0.58,
    "ain2_v": 0.57,
    "ain3_v": 0.58
  }
}
```

The frontend accepts raw channel values only within the ADC input range, labels the data "Raw ADC only," updates registry evidence, and exports the values in reports. The rail fields remain null.

The `RAW DEBUG` designation is an intentional reliability control. Repository investigation found that AIN0-AIN3 terminate at general-purpose external connectors and are not connected to dedicated VIN, 5 V, or 3.3 V divider networks. Observed ADC and DMM readings also disagree. Without verified topology, divider ratios, loading analysis, and calibration, converting these values into rail claims would create false health evidence. Phase 7.1 therefore validates the software acquisition and transport path, not power-rail accuracy.

## 7. RTC Telemetry Architecture

The DS3231 subsystem follows an evidence-first design:

```text
DS3231 registers
   -> read-only MAIN firmware decoder
   -> RTC_STATUS_TELEMETRY
   -> packet validator and store
   -> validity classifier
   -> RTC UI and report evidence

Packet timestamps remain PI_BACKEND_UTC throughout.
```

The reader checks device presence, reads the status register and time registers, decodes BCD values, rejects unsupported 12-hour mode, evaluates the oscillator stop flag, and emits a status message. It does not write the time or clear OSF.

The latest reviewed runtime report records:

- DS3231 detected at `0x68`.
- Register reads successful.
- Backup battery present and configured.
- `oscillator_stop_flag=true`.
- `rtc_time_valid=false`.
- Classification `RTC_PRESENT_TIME_INVALID_OSF`.
- Required action `PI_TO_RTC_SESSION_SYNC_REQUIRED`.
- Timestamp authority `PI_BACKEND_UTC`.

OSF indicates that oscillator continuity has been lost at some point; a readable calendar value is therefore not proof of valid time. The RTC remains evidence-only until it is synchronized from a trusted source, read back, checked for retention, observed over time, and formally accepted. Even successful synchronization will initially produce `RTC_VALIDATION_READY`, not immediate timestamp authority.

## 8. Pi Time Trust System

Phase 7.2E-1 introduced a fail-closed trust model around the Pi clock. `evaluate_pi_time_trust()` returns structured evidence containing UTC, timezone, NTP state, plausible-year status, process uptime, observation duration, wall-clock and monotonic progression, jump detection, reasons, and final permission.

Trust requires:

- UTC year at least 2026.
- `timedatectl` reporting NTP synchronized.
- A 30-second local observation.
- Sufficient process uptime.
- Wall-clock progression within one second of monotonic progression.

The states are `PI_TIME_TRUSTED`, `PI_TIME_UNVERIFIED`, `PI_TIME_NOT_SYNCHRONIZED`, `PI_TIME_INVALID`, and `PI_TIME_JUMP_DETECTED`. Missing `timedatectl`, unavailable NTP evidence, implausible time, insufficient observation, or a detected jump blocks synchronization. This is important because writing incorrect Pi time into a battery-backed RTC would persist and could later appear trustworthy.

The E-1 dry-run mode evaluates and prints trust evidence without constructing or transmitting a request. Operator-provided Pi-side validation produced `PI_TIME_TRUSTED`, `pi_ntp_synchronized=true`, and `SYNC_ALLOWED=true`; this result should also be retained as a controlled runtime artifact.

## 9. RTC Sync Request Protocol

Phase 7.2E-2A defines the request that may eventually cross from the Pi to MAIN, but it deliberately does not transmit it. The schema contains exactly ten fields:

```json
{
  "message_type": "RTC_SESSION_SYNC_REQUEST",
  "protocol_version": 1,
  "session_sync_id": "RTC_SYNC_<UUID4>",
  "source": "PI_BACKEND",
  "source_utc": "2026-06-19T12:34:56.123Z",
  "expires_at_utc": "2026-06-19T12:35:06.123Z",
  "pi_time_status": "PI_TIME_TRUSTED",
  "pi_ntp_synchronized": true,
  "safety_scope": "RTC_ONLY",
  "no_forward_to_sub": true
}
```

The validator rejects unknown fields, wrong constants, non-UUID4 session identifiers, untrusted time, non-UTC timestamps, expiry other than ten seconds, and years outside 2026-2099. Serialization uses compact sorted JSON, UTF-8, one newline terminator, and a maximum size of 512 bytes. A SHA-256 hash is computed over canonical JSON without the newline for audit correlation; it is not presented as authentication.

The preview service records request metadata, host, operator, PID, hash, and frame size while fixing `write_attempted=false` and `result_wait_supported=false`. The CLI exposes `--dry-run` and `--preview-request`; there is no `--send`, no serial import, no HTTP/WebSocket endpoint, and no generic command dispatcher.

UART transmission is disabled because MAIN has no bounded inbound parser or rejection path. Sending before that boundary exists would create an unaudited state-changing interface and could disrupt a previously receive-only telemetry architecture.

## 10. Validation and Quality Assurance

### 10.1 Validation layers

- **Firmware:** controlled I2C access, bounded conversion/register reads, explicit status fields, and compile-time board configuration.
- **Backend:** UART boundary checks, schema validation, normalization, serial status evidence, broadcast ownership, and gateway health.
- **Frontend:** TypeScript packet validation, source/link checks, state reduction, integrity dispositions, registries, health rules, and report generation.
- **Replay:** deterministic reconstruction from accepted event evidence using a replay-relative clock.
- **Runtime:** physical hardware mode, live WebSocket connection, soak timing, packet-rate observation, topology status, and exported JSON evidence.
- **Git:** phase-scoped commits provide implementation and review traceability.

### 10.2 Current verification performed for this report

| Check | Result |
|---|---|
| Frontend TypeScript/Vite production build | PASS |
| Backend Pi-time and RTC-protocol suite | PASS, 15 tests |
| MAIN ESP32-S3 PlatformIO release build | PASS; 6.3% RAM, 9.5% flash |
| SUB ESP32-S3 PlatformIO release build | PASS; 5.8% RAM, 8.7% flash |
| Successful 10-minute soak artifact | PASS |
| Successful 30-minute soak artifact | PASS |
| Post-fix 30-minute health artifact | PASS with five expected warnings |
| Latest reviewed packet-integrity summary | All tracked counters zero |

The latest June 18 report is a short 43-second in-progress snapshot rather than a replacement for the completed soak evidence. It confirms current RTC integration, live physical transport, 3/3 healthy and synchronized links, no live/replay differences, and zero integrity anomalies. Its overall health is `WARNING` because five known limitations remain; it contains no failed or critical health rules.

## 11. Risk Analysis

| Risk or limitation | Current control | Remaining work |
|---|---|---|
| Browser event store is bounded | Capacity increased to 20,000; reports disclose dropped records; live soak counters are separate | Persistent or streamed evidence storage for longer runs |
| Incorrect Pi time could poison RTC | NTP, plausible-year, monotonic observation, jump detection, fail-closed CLI | Operational hardening and repeated Pi-side validation |
| RTC OSF is set | RTC classified invalid and excluded from authority | Trusted sync, readback, OSF handling, retention and drift validation |
| Inbound RTC path could become a generic command channel | Exact preview schema, `RTC_ONLY`, no SUB forwarding, no send option | Bounded MAIN parser, rejection telemetry, single-purpose writer, local authorization |
| ADS1115 values may be misinterpreted | `ADC_RAW_DEBUG`, null rail fields, explicit report limitations | Dedicated sense hardware, divider validation, calibration and thresholds |
| Telemetry loss during longer runs | Integrity counters, event dispositions, soak metrics, replay comparison | Longer endurance testing and persistent backend storage |
| Frontend state is memory-resident | Deterministic replay and export | Restart recovery and durable event ingestion |
| No safety interlock/watchdog evidence | Actuation and command paths remain disabled | Separate safety phases before any control enablement |
| RTC request hash is not authentication | Preview-only local tooling and exact schema | Local IPC permissions, operator authorization, replay protection and audit persistence |

## 12. Current Project Status

Completed and validated within the reporting scope:

- Phase 7.0C soak stabilization.
- Phase 7.0D event capacity and 30-minute soak preparation.
- Phase 7.0D WebSocket freshness and replay topology fixes.
- Phase 7.1A ADS1115 raw debug telemetry.
- Phase 7.1B channel-mapping investigation.
- Phase 7.2A RTC authority and synchronization investigation.
- Phase 7.2B read-only DS3231 telemetry.
- Phase 7.2C RTC validity classification and report evidence.
- Phase 7.2E-1 Pi time trust gate.
- Phase 7.2E-2A RTC request preview protocol.

The system is ready to design and implement a bounded MAIN-side RTC request parser. It is not ready to transmit RTC synchronization requests, set RTC time, clear OSF, use RTC timestamps, or claim calibrated power-rail monitoring.

Before production-grade telemetry confidence, the project still needs durable evidence storage, longer endurance and restart tests, RTC synchronization/retention/drift validation, calibrated rail sensing, deployment-level access control, watchdog and fail-safe evidence, security review, and operational monitoring of backend resource use.

## 13. Next Phases

### Phase 7.2E-3 - Bounded MAIN request parser

**Purpose:** Establish a safe inbound boundary before any state change.  
**Expected implementation:** Fixed-size UART buffer, exact `RTC_SESSION_SYNC_REQUEST` parser, strict allowlist, expiry structure checks, duplicate-session protection, rejection telemetry, and unconditional prohibition of SUB forwarding.  
**Validation goals:** Malformed, unknown, duplicate, untrusted, and unsafe frames are rejected without affecting telemetry.  
**Risks:** Accidentally creating a generic command dispatcher or disturbing UART telemetry throughput.

### Phase 7.2E-4 - DS3231 synchronization transaction

**Purpose:** Set RTC time from trusted Pi UTC under a controlled transaction.  
**Expected implementation:** Read-before evidence, contiguous time-register write, readback comparison, OSF clear only after successful readback, final status read, and failure-safe state transitions.  
**Validation goals:** Readback delta no greater than two seconds; OSF remains set on any failed write or verification.  
**Risks:** Wrong source time, partial register writes, incorrect BCD conversion, or premature OSF clearing.

### Phase 7.2E-5 - Result telemetry and report integration

**Purpose:** Make each synchronization attempt observable and auditable.  
**Expected implementation:** `RTC_SYNC_RESULT_TELEMETRY`, session correlation, backend result handling, frontend evidence, and `rtc_sync_summary` export.  
**Validation goals:** Every attempt has a unique ID, trust evidence, write/readback result, OSF transition, error state, and unchanged timestamp authority.  
**Risks:** Missing result correlation or UI/report language implying premature RTC authority.

### Phase 7.2F - Runtime synchronization validation

**Purpose:** Validate the complete one-purpose synchronization path in hardware mode.  
**Expected implementation:** Backend-local operator trigger using the running backend's serial ownership; no frontend trigger.  
**Validation goals:** Trusted-time gate passes, one request is sent, one result is received, delta is within two seconds, packet integrity stays clean, and no control side effects occur.  
**Risks:** Serial ownership conflicts, request replay, telemetry corruption, or timeout ambiguity.

### Phase 7.2G - Retention and continuity validation

**Purpose:** Demonstrate that RTC evidence survives loss of primary power.  
**Expected implementation:** Controlled power-off interval, reboot, status collection, and comparison with Pi UTC.  
**Validation goals:** Time advances plausibly, OSF remains false, backup continuity is established, and classification reaches at most `RTC_VALIDATION_READY` pending longer drift evidence.  
**Risks:** Battery/contact faults, unnoticed oscillator stops, excessive drift, or an overconfident validity transition.

## Key Achievements This Week

- Converted long-duration telemetry from an informal observation into a measured, exportable soak-validation process.
- Corrected freshness and replay semantics so live and reconstructed topology agree.
- Demonstrated clean 10-minute and 30-minute packet integrity under physical hardware telemetry.
- Added two new evidence domains, raw analog acquisition and RTC status, without overstating what either proves.
- Established an explicit timestamp-authority model and a fail-closed path toward RTC synchronization.
- Introduced deterministic backend tests for time trust and synchronization protocol safety.

## Lessons Learned

1. Data acquisition and data interpretation are separate validation problems. A working ADC path does not prove rail voltage.
2. Freshness must reflect the cadence and semantics of each source; one global timeout creates false failures.
3. Bounded storage must disclose evidence loss. Long-run aggregates and raw replay completeness should be reported separately.
4. Replay is a design test for state ownership. Missing derivations become visible when state must be rebuilt from events alone.
5. Time is a trust domain. RTC values, OS clock values, synchronization evidence, and timestamp authority require explicit boundaries.
6. State-changing interfaces should be introduced in stages: trust gate, preview protocol, reject-only parser, controlled transaction, and only then runtime validation.

## Next Week Objectives

- Implement and test the bounded MAIN-side RTC request parser without RTC writes.
- Add rejection telemetry and duplicate-session safeguards.
- Design the single-owner backend writer and local-only trigger around the running serial bridge.
- Implement the DS3231 transaction only after the parser boundary is validated.
- Extend report evidence for synchronization attempts while keeping Pi/backend UTC authoritative.
- Prepare retention, continuity, and drift-validation procedures for Phases 7.2F and 7.2G.
