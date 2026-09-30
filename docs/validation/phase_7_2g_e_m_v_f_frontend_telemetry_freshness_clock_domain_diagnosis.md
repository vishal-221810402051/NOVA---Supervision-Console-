# Phase 7.2G-E-M-V-F-A - Frontend Telemetry Freshness Clock-Domain Diagnosis

## 1. Executive Summary

This phase inspected the current committed NOVA SC frontend freshness path without changing runtime behavior.

The source code contains a confirmed cross-machine clock-domain subtraction:

```text
browser Date.now()
    -
packet.timestamp_utc generated from Raspberry Pi backend UTC
```

Accepted packets copy `packet.timestamp_utc` into `lastPacketAt` and immediately set `isTelemetryStale=false`. A one-second aging timer later compares that remote timestamp with the browser wall clock and marks telemetry stale when the result exceeds `3000 ms`. This implementation can produce a Live -> Delayed -> Live cycle when the Windows clock is sufficiently ahead of the Pi clock, even if packets arrive normally.

Phase V-F-A2 restored the missing runtime evidence. The Pi backend at `10.212.83.193:8000` was healthy in hardware mode with `SERIAL_CONNECTED`. A second browser WebSocket captured `551` packets over `62.020 s`; the maximum local monotonic inter-arrival gap was `375.5 ms`, while every remote timestamp age exceeded the `3000 ms` stale threshold. A separate high-frequency UI observation captured `28` Delayed pulses in 30 seconds while connection remained Connected, packet count advanced, and no WebSocket closure occurred.

Primary root-cause classification:

```text
REMOTE_TIMESTAMP_VS_LOCAL_CLOCK_SKEW_CONFIRMED
```

Final phase status:

```text
READY_FOR_REVIEW_PHASE_7_2G_E_M_V_F_A
```

No frontend runtime code, backend code, protocol, firmware, or tests were modified.

## Runtime Evidence Completion

Phase V-F-A2 completed the live-runtime evidence on 2026-09-30 using:

- Raspberry Pi backend: `10.212.83.193:8000`
- Windows/browser client: `10.212.83.140`
- Backend mode: `hardware`
- Serial bridge: `SERIAL_CONNECTED`, `/dev/serial0`, `115200`
- Stream: `PI_STREAM_20260930T031752Z`
- Frontend: local Vite runtime at `http://127.0.0.1:5173/`
- Browser: Microsoft Edge with DevTools Protocol observation

The independent diagnostic WebSocket and actual NOVA frontend were observed without modifying repository source. The evidence distinguishes local packet silence from remote timestamp age and confirms that clock skew, not transport interruption, drives the visible flicker.

## 2. Baseline

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `6e9ad80725d71d61eec19e386514f3bd5113e813` |
| origin/main | `6e9ad80725d71d61eec19e386514f3bd5113e813` |
| HEAD subject | `Fix NOVA SC desktop topology responsiveness` |
| Initial `git diff --check` | PASS |

Pre-existing unrelated worktree changes were left untouched:

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

## 3. Current Freshness Architecture

The current architecture uses one field for two different time concepts:

| Concept | Current representation | Problem |
|---|---|---|
| Event/evidence time | `lastPacketAt = packet.timestamp_utc` | Correct for authoritative backend UTC |
| Browser transport freshness | `Date.now() - Date.parse(lastPacketAt)` | Incorrectly compares clocks from different machines |

The WebSocket hook owns the connection and one-second aging timer. The Zustand telemetry store owns `lastPacketAt`, `isTelemetryStale`, accepted-packet ingestion, registry aging, and the stale calculation.

## 4. Source Code Trace

Verified current path:

```text
useTelemetrySocket socket.onmessage
  frontend/src/hooks/useTelemetrySocket.ts:72
    -> handleRawTelemetryMessage(...)
       frontend/src/transport/ingestionPipeline.ts:8
    -> decode JSON and validateTelemetryPacket(...)
       frontend/src/transport/ingestionPipeline.ts:17-27
    -> ingestPacket(result.packet) only when validation succeeds
       frontend/src/transport/ingestionPipeline.ts:27-29
    -> telemetryStore.ingestPacket(...)
       frontend/src/store/telemetryStore.ts:572
    -> lastPacketAt = packet.timestamp_utc
       frontend/src/store/telemetryStore.ts:855
    -> isTelemetryStale = false
       frontend/src/store/telemetryStore.ts:902
```

Independent aging path:

```text
useTelemetrySocket.ensureAgingTimer()
  frontend/src/hooks/useTelemetrySocket.ts:40
    -> setInterval(..., 1000)
       frontend/src/hooks/useTelemetrySocket.ts:43-45
    -> telemetryStore.ageRegistry()
       frontend/src/store/telemetryStore.ts:369
    -> Date.now() - new Date(lastPacketAt).getTime() > 3000
       frontend/src/store/telemetryStore.ts:373-376
    -> update isTelemetryStale
       frontend/src/store/telemetryStore.ts:378-382
```

Packet timestamps are validated as parseable timestamps before ingestion at `frontend/src/state/packetValidator.ts:209-216`. Rejected frames call `recordPacketRejection` and do not reach `ingestPacket`.

The hardware backend generates the canonical received timestamp in `backend/protocol.py:57-81`: `received_utc = utc_now()`, then both `supervisor_received_utc` and `timestamp_utc` receive that backend value.

## 5. Clock-Domain Classification

| Value | Classification | Authority / process |
|---|---|---|
| `packet.timestamp_utc` | `REMOTE_WALL_CLOCK` | Raspberry Pi backend UTC |
| `packet.supervisor_received_utc` | `REMOTE_WALL_CLOCK` | Raspberry Pi backend UTC |
| Backend `utc_now()` | `REMOTE_WALL_CLOCK` | Raspberry Pi system clock |
| Pi `date -u` | `REMOTE_WALL_CLOCK` | Raspberry Pi system clock |
| Browser `Date.now()` | `LOCAL_WALL_CLOCK` | Windows/browser system clock |
| PowerShell Windows UTC | `LOCAL_WALL_CLOCK` | Windows system clock |
| Browser `performance.now()` | `LOCAL_MONOTONIC_CLOCK` | Current browser page/time origin |

The current freshness subtraction mixes `REMOTE_WALL_CLOCK` and `LOCAL_WALL_CLOCK` from two machines. This is statically confirmed. The magnitude and runtime effect of the current offset were not measured in this phase.

## 6. Stale Threshold / Aging Cadence

| Property | Current value |
|---|---|
| Stale threshold | `3000 ms` |
| Definition | Hard-coded expression in `telemetryStore.ageRegistry` |
| Evaluation location | `frontend/src/store/telemetryStore.ts:373-376` |
| Evaluation cadence | Every `1000 ms` |
| Timer location | `frontend/src/hooks/useTelemetrySocket.ts:40-45` |

Because evaluation occurs every second and uses a strict `> 3000` comparison, observed transition latency can extend approximately one timer period beyond the threshold. No evidence currently supports changing the threshold.

## 7. Live Runtime Measurements

| Check | Result |
|---|---|
| Pi address | `10.212.83.193` |
| Windows/browser address | `10.212.83.140` |
| TCP port `8000` | Reachable |
| `/health` | `200 OK`, backend `HEALTHY` |
| Backend mode | `hardware` |
| Serial bridge | `SERIAL_CONNECTED` |
| Hardware connected | `true` |
| Stream ID | `PI_STREAM_20260930T031752Z` |
| Diagnostic duration | `62.020 s` |
| Packets captured | `551` |
| Parse errors | `0` |
| Diagnostic socket errors / closes | `0 / 0` before intentional close |

The observed diagnostic packet rate was approximately `8.88 Hz`, consistent with the frontend's visible range of `7.6-10.4 Hz` during the correlated UI window.

## 8. WebSocket Arrival Gap Evidence

Arrival gaps were measured in the browser using `performance.now()`.

| Measurement | Result |
|---|---:|
| Gap samples | `550` |
| Minimum local arrival gap | `0.0 ms` |
| Average local arrival gap | `112.059 ms` |
| Maximum local arrival gap | `375.5 ms` |
| Gaps greater than `3000 ms` | `0` |

The `0.0 ms` minimum reflects multiple frames dispatched within the timer resolution of one browser event-loop turn. It does not indicate missing packets. No local monotonic silence approached the stale threshold.

## 9. Remote Timestamp Age Evidence

Remote timestamp age was measured as `Date.now() - Date.parse(packet.timestamp_utc)` for every captured packet.

| Measurement | Result |
|---|---:|
| Timestamp-age samples | `551` |
| Minimum age | `3456 ms` |
| Average age | `3470.508 ms` |
| Maximum age | `3587 ms` |
| Ages greater than `3000 ms` | `551` |

Representative samples:

| Global sequence | Backend timestamp UTC | Browser receipt UTC | Remote age |
|---:|---|---|---:|
| 23387 | `2026-09-30T04:02:50.013499+00:00` | `2026-09-30T04:02:53.515Z` | `3502 ms` |
| 23388 | `2026-09-30T04:02:50.077323+00:00` | `2026-09-30T04:02:53.558Z` | `3481 ms` |
| 23389 | `2026-09-30T04:02:50.139822+00:00` | `2026-09-30T04:02:53.603Z` | `3464 ms` |
| 23936 | `2026-09-30T04:03:51.618166+00:00` | `2026-09-30T04:03:55.097Z` | `3479 ms` |
| 23937 | `2026-09-30T04:03:51.685640+00:00` | `2026-09-30T04:03:55.147Z` | `3462 ms` |

Every packet arrived locally within `375.5 ms` of the previous packet, but every remote timestamp appeared more than three seconds old to the browser.

## 10. Pi/Windows Clock Comparison

Windows UTC was captured as `2026-09-30T04:00:49.9269866+00:00` before runtime sampling. Windows Time Service reported:

```text
Leap Indicator: 3 (not synchronized)
Stratum: 0 (unspecified)
Last Successful Sync Time: unspecified
Source: Local CMOS Clock
```

Direct Pi shell output from `date -u` and `timedatectl status` could not be captured because SSH authentication rejected the available non-interactive connection (`Permission denied (publickey,password)`). The backend itself remained reachable and supplied canonical Pi/backend UTC continuously through packet timestamps and the HTTP `Date` header.

The measured effective Windows-minus-Pi/backend offset was approximately `+3471 ms`, with network and scheduling delay included. Pi synchronization state remains unknown. This missing shell metadata does not weaken the freshness diagnosis because the browser packet sample directly measured the two operands used by the faulty subtraction.

## 11. Flicker Sequence Reconstruction

The current code permits this exact sequence:

```text
accepted packet arrives
    -> lastPacketAt receives remote Pi UTC
    -> isTelemetryStale=false
    -> UI displays Live

next one-second aging tick
    -> browser Date.now() - remote lastPacketAt > 3000 ms
    -> isTelemetryStale=true
    -> UI displays Delayed

next accepted packet arrives
    -> isTelemetryStale=false
    -> UI displays Live
```

Runtime matched this sequence repeatedly. In a 30-second high-frequency UI observation, Data Status entered Delayed `28` times and returned to Live after the next accepted packet. Delayed pulses lasted approximately `24-205 ms` in captured transitions. Throughout that window:

- connection remained `Connected`;
- packet count advanced from `264` to `530`;
- packet rate remained `7.6-10.4 Hz`;
- CDP observed `267` WebSocket frames;
- no WebSocket close was observed;
- reconnect attempts remained `0`;
- last transport error remained `NONE`;
- frontend malformed/rejected counters remained `0`;
- backend dropped-packet count remained `0`.

## 12. Root Cause

```text
REMOTE_TIMESTAMP_VS_LOCAL_CLOCK_SKEW_CONFIRMED
```

Confirmed source finding:

```text
CROSS_MACHINE_WALL_CLOCK_SUBTRACTION_CONFIRMED_IN_SOURCE
```

Confirmed runtime root cause:

```text
REMOTE_TIMESTAMP_VS_LOCAL_CLOCK_SKEW_CONFIRMED
```

The confirmation criteria are satisfied: accepted packets continued arriving, all local monotonic gaps stayed below `3000 ms`, all remote timestamp ages exceeded `3000 ms`, the WebSocket remained connected, no reconnect or transport failure coincided with Delayed, the source still mixes local and remote wall clocks, and the next accepted packet cleared each Delayed pulse.

## 13. Alternative Explanations Considered

| Alternative | Current assessment |
|---|---|
| Transport gaps exceed `3000 ms` | Ruled out in the sample: maximum `375.5 ms`, zero gaps above threshold |
| WebSocket reconnect cycle | Ruled out during transitions: Connected throughout, zero closes, zero reconnect attempts, no transport error |
| Frontend timer/state defect independent of clock skew | State transitions match the source-defined mixed-clock cycle exactly |
| Backend timestamp generation defect | No defect indicated; timestamps were monotonic and internally consistent, with a stable approximately `3.47 s` host offset |
| Invalid/malformed packets | Frontend session counters remained zero; validation still precedes accepted ingestion |
| Threshold too short | No evidence against `3000 ms`; increasing it would mask, not remove, mixed-clock behavior |

## 14. Recommended Architecture

Separate the two concepts explicitly:

```text
packet.timestamp_utc
    -> authoritative event/evidence timestamp
    -> retained as lastPacketAt or equivalent UTC field

local accepted-packet receipt marker
    -> browser-local monotonic timestamp
    -> used only for transport freshness
```

Event/evidence time answers, "When did the backend say this event occurred?" Transport freshness answers, "How long has this browser gone without accepting a packet?" They must not share a subtraction clock domain.

## 15. Local Receipt Clock Choice

| Property | `Date.now()` at receipt | `performance.now()` at receipt |
|---|---|---|
| Clock domain | Local wall clock | Local monotonic clock |
| Same-machine age calculation | Yes | Yes |
| Sensitive to manual/NTP wall-clock jumps | Yes | No |
| Persists meaningfully across reload | Wall-clock value does | No, page lifetime only |
| Appropriate for session transport freshness | Acceptable | Preferred |
| Deterministic testing | Easy with fake system time | Easy with injected/faked monotonic clock |
| Browser support | Universal for target | Universal for target |

Recommendation: use `performance.now()` for the receipt marker and all freshness age comparisons. Its page-local lifetime is appropriate because WebSocket freshness is session state, not persistent evidence.

## 16. Store / Hook Ownership Recommendation

Recommended owner: `telemetryStore`.

Reasons:

- The store already owns `isTelemetryStale`, accepted ingestion, and `ageRegistry`.
- It provides one source of truth to all pages and health/report consumers.
- A store action can accept or obtain an injected monotonic time for deterministic tests.
- The hook should remain responsible for WebSocket lifecycle and timer scheduling, not duplicate freshness state.
- Storing only a number does not add periodic rerenders beyond the existing stale state update.

Capture the monotonic marker at the accepted-ingestion boundary, as close to receipt as practical. Do not export it as evidence or a UTC timestamp.

## 17. Disconnect/Reconnect Behavior

Recommended future semantics:

| State transition | Local receipt marker | Visible freshness behavior |
|---|---|---|
| Initial startup | `null` | No Live claim until first accepted packet; connection state remains authoritative |
| First accepted packet | Set to local monotonic now | Live |
| Normal accepted packet | Replace with local monotonic now | Live |
| WebSocket disconnect/error | Clear marker and mark stale | Delayed, while connection separately reports reconnect/offline |
| Reconnect before first accepted packet | Remain clear/stale | Delayed |
| First accepted packet after reconnect | Set marker | Live |
| Stream switch carried by accepted packet | Set marker | Live; existing stream-switch accounting preserved |
| Malformed/rejected packet | Do not update marker | No freshness refresh |

The initial-startup display policy should be asserted in tests because current initial state is `false`, while the first aging tick with `lastPacketAt=null` changes it to stale.

## 18. Accepted-Packet Boundary

Recommended boundary: the existing successful `validateTelemetryPacket` -> `ingestPacket(result.packet)` path.

Do not refresh freshness for:

- arbitrary WebSocket frames;
- invalid JSON;
- unsupported frame types;
- schema-invalid packets;
- unknown event/node/link packets rejected by the validator;
- duplicate or out-of-order packets that the store ignores before its accepted update.

The final detail matters: the monotonic marker should be committed only after the store's integrity checks decide the packet is accepted, not merely at function entry.

## 19. Threshold Recommendation

Preserve `3000 ms` for the first implementation. Preserve the `1000 ms` aging cadence unless tests expose a separate requirement.

The threshold should be reevaluated only from measured same-machine arrival gaps after clock-domain correction. It must not be increased merely to conceal Pi/Windows clock offset.

## 20. Backend Impact

```text
NO BACKEND CHANGE RECOMMENDED
```

Backend/Pi UTC remains the timestamp authority. The packet schema, WebSocket endpoint, canonical normalization, serial bridge, persistent writer, and replay engine do not need to change for browser transport freshness.

## 21. Report/Evidence Impact

The proposed correction must preserve:

- report schema `v1.2`;
- `last_packet_at_utc` and packet `timestamp_utc` values;
- `persistent_evidence_summary`;
- `persistent_replay_summary`;
- `persistent_replay_capture`;
- RTC evidence and timestamp-authority rules;
- persistent NDJSON event timestamps and ordering.

Existing report fields derived from `isTelemetryStale` will become more accurate: `system_status.telemetry_stale`, `topology_summary.telemetry_stale`, `stream_metadata.telemetry_freshness`, health-rule results, and the laptop-console summary. No schema change is required.

Replay freshness is independently derived in `frontend/src/state/replayReducer.ts:197-216` from replay content and replay clock. The local monotonic marker must remain out of replay artifacts.

## 22. Health Consumer Impact

Current direct consumers of `isTelemetryStale` include:

- `GlobalStatusBar`: visible Live/Delayed status.
- `SystemOverview`, `ChipStatus`, `PowerHealth`, and `RtcStatus`: stale-data notices.
- `TopologyView`: summary freshness, raw freshness, and chain-health presentation.
- `HealthCheckPanel` and `healthCheckEngine`: topology reachability, laptop supervision, laptop/Pi link freshness, and `TELEMETRY_FRESHNESS`.
- `ReportExportPanel` and `reportBuilder`: health evaluation, topology reachability, report status, and stream freshness.

`globalHealth` is calculated from the device registry rather than directly from `isTelemetryStale`. The soak verdict does not directly consume `isTelemetryStale`; it consumes connection, registry, link, integrity, and event-store state. The correction may still remove false health/topology failures because those paths consume stale directly.

## 23. Implementation File Impact

Minimal likely implementation files for V-F-B1/B2:

| File | Expected future change |
|---|---|
| `frontend/src/store/telemetryStore.ts` | Add local monotonic accepted-receipt state; use it for stale aging; define reset semantics |
| `frontend/src/store/telemetryStore.test.ts` or equivalent focused test file | Add deterministic freshness and acceptance-boundary tests |
| `frontend/src/hooks/useTelemetrySocket.ts` | Only if disconnect/reconnect needs an explicit store reset action or receipt time is passed from the hook |
| `frontend/src/transport/ingestionPipeline.test.ts` | Extend only if acceptance-boundary coverage is best placed at pipeline level |

No backend, protocol, report-schema, persistent evidence, persistent replay, firmware, control, PWM, GPIO, or visible UI wording changes are required.

## 24. Unit Test Plan

Use fake or injected monotonic time; avoid real sleeps.

1. An accepted packet sets the local marker and keeps freshness Live inside `3000 ms`.
2. A packet with remote `timestamp_utc` several seconds or minutes old remains Live when locally received recently.
3. Advancing local monotonic time beyond `3000 ms` without another accepted packet sets Delayed.
4. The next accepted packet clears Delayed.
5. Invalid JSON and schema-rejected packets do not refresh the marker.
6. Duplicate/out-of-order packets ignored by store integrity logic do not refresh the marker.
7. Disconnect clears freshness; reconnect alone does not restore Live; first accepted packet does.
8. Stream-switch packets retain existing integrity behavior and refresh after acceptance.
9. `packet.timestamp_utc`, logs, event records, and `lastPacketAt` remain byte-for-byte unchanged.
10. Report v1.2 UTC fields and persistent evidence/replay fields remain unchanged.
11. Startup-before-first-packet behavior is explicit and stable.

## 25. Runtime Validation Plan

For V-F-V, with the Pi backend listening:

1. Record Windows UTC, Pi `date -u`, and `timedatectl status` without altering either clock.
2. Observe at least 60 seconds of WebSocket frames in browser DevTools.
3. For each accepted packet, record local `performance.now()`, local `Date.now()`, `packet.timestamp_utc`, stream ID, and sequence numbers.
4. Calculate local inter-arrival gaps and remote timestamp ages separately.
5. Record minimum, median/typical, maximum, and count of local gaps greater than `3000 ms`.
6. Observe connection state, ready state, packet count/rate, reconnect attempts, last error, malformed count, and dropped count through at least one formerly reproducible flicker interval.
7. Demonstrate that remote timestamp age may exceed `3000 ms` while normal local arrival gaps remain below it and UI stays continuously Live after correction.
8. Stop backend packet delivery in a controlled way; verify Delayed only after local silence exceeds the threshold.
9. Resume valid packets; verify Live returns on the first accepted packet.
10. Export a report and verify backend UTC evidence and report v1.2 contracts are unchanged.

## 26. Failure Injection Plan

Use a controlled software-layer interruption:

- Prefer stopping the Pi backend service or closing the browser WebSocket from DevTools.
- Record the exact stop time with local monotonic and UTC clocks.
- Leave ESP32 wiring and serial electrical connections untouched.
- Restore the same backend service and verify reconnection plus first-accepted-packet recovery.

Do not manipulate hardware wiring solely for this frontend test.

## 27. Risks

| Risk | Mitigation |
|---|---|
| Marker updated before integrity acceptance | Commit it only in the accepted return path |
| Marker survives reconnect and creates a false Live interval | Clear it on disconnect/new session |
| `performance.now()` used as evidence time | Keep it private to transient store freshness state |
| Existing reports accidentally export the monotonic value | Do not add it to report/event schemas |
| Tests depend on wall time or sleeps | Inject/fake the monotonic clock |
| Hidden secondary remote/local aging remains | Device and hardware-link aging have `SAME_CLOCK_DOMAIN_RISK`; audit separately and do not broaden V-F-B1 |
| Runtime conclusion based only on UI text | Capture frames, timestamps, sequences, and transport counters together |

## 28. Non-Goals

This phase does not:

- implement the freshness correction;
- redesign Live/Delayed wording;
- change backend timestamp authority;
- synchronize or configure Pi/Windows clocks;
- change the `3000 ms` threshold;
- change report schema v1.2;
- modify persistent evidence or persistent replay;
- address `UI_V_FINDING_C1` or `UI_V_FINDING_C2`;
- change backend, firmware, RTC, control, actuator, PWM, GPIO, or PCA9685 behavior.

## 29. Acceptance Criteria for Implementation

V-F-B1/B2 should be accepted only when:

- event/evidence UTC and local transport freshness are separate;
- freshness uses one local monotonic clock domain;
- the marker updates only for accepted packets;
- rejected, duplicate, and ignored packets cannot hold Live;
- disconnect/reconnect/startup behavior is deterministic;
- `3000 ms` remains unchanged unless independent evidence justifies another value;
- report v1.2, persistent evidence, persistent replay, RTC, protocol, and backend contracts remain unchanged;
- focused fake-time tests pass;
- existing frontend tests and build pass;
- real Pi/browser validation proves normal local packet gaps remain Live;
- controlled silence greater than the threshold produces Delayed and valid resumption restores Live;
- `git diff --check` passes.

## 30. Final Recommendation

Runtime evidence confirms the clock-domain defect. Proceed in this order:

```text
V-F-B1 - Local receipt freshness state implementation
V-F-B2 - Focused unit regression tests
V-F-V  - Real Pi/browser runtime validation
```

The intended correction is small: retain backend UTC unchanged for evidence, add a browser-local monotonic accepted-receipt marker for transport freshness, and preserve the existing threshold. Device registry aging at `frontend/src/state/deviceRegistry.ts:461-505` and hardware-link heartbeat aging at `frontend/src/state/healthCheckEngine.ts:1046-1048` also subtract local `Date.now()` from backend UTC and are classified `SAME_CLOCK_DOMAIN_RISK`; they require a separate audit and are not part of V-F-B1.

The correct phase status is:

```text
READY_FOR_REVIEW_PHASE_7_2G_E_M_V_F_A
```
