# Phase 7.2G-E-M-V-F-V - Frontend Telemetry Freshness Validation

## 1. Baseline

Phase 7.2G-E-M-V-F-V validated the local-monotonic frontend telemetry freshness correction against the real NOVA SC Raspberry Pi and browser runtime.

| Field | Value |
|---|---|
| Validation date | 2026-09-30 |
| Local repository | `C:\Users\visha\Desktop\NOVA\nova-sc` |
| HEAD | `d3244c51e78f8bba97fe86289c418e6fdb9dd96f` |
| origin/main | `d3244c51e78f8bba97fe86289c418e6fdb9dd96f` |
| HEAD subject | `Fix frontend telemetry freshness clock domain` |
| Pi address | `10.212.83.193` |
| Frontend | `http://localhost:5173` |
| Backend | `http://10.212.83.193:8000` |

The freshness-fix commit was HEAD and matched `origin/main` before validation. Existing unrelated worktree items were recorded and left untouched:

- Modified: `docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md`
- Untracked: `docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md`

Initial `git diff --check` passed.

## 2. Locked Root Cause

The prior false-Delayed behavior compared two different clock domains:

```text
Date.now() - Date.parse(packet.timestamp_utc)
```

The hardware path delivered packets normally, but backend packet UTC was approximately 3.4 seconds behind browser wall-clock receipt. Applying the 3000 ms freshness threshold to that remote timestamp could therefore mark healthy traffic as delayed.

The locked correction separates evidence time from receipt freshness:

```text
Remote evidence time: packet.timestamp_utc
Local freshness time: performance.now()
Freshness age: performance.now() - lastAcceptedPacketReceiptMonotonicMs
```

## 3. Implemented Architecture

The implementation under test preserves `lastPacketAt` as backend UTC and separately records `lastAcceptedPacketReceiptMonotonicMs` after accepted packets. Freshness is stale when the local monotonic age is greater than `3000 ms`. Aging runs on the existing `1000 ms` cadence.

Rejected, duplicate, and out-of-order packets do not refresh the marker. Non-connected transport states invalidate freshness. A WebSocket open alone does not establish `Live`; the first accepted packet does.

## 4. Static Regression Results

| Check | Result |
|---|---|
| `npm test -- --run` | PASS - 3 files, 42 tests |
| `npm run build` | PASS - TypeScript and Vite production build |
| `npm run lint` | PASS |

No frontend or backend source was modified during this validation.

## 5. Runtime Environment

Pi connectivity and backend health were confirmed before and after the browser controls.

| Field | Value |
|---|---|
| TCP `10.212.83.193:8000` | Reachable |
| backend | `HEALTHY` |
| backend_mode | `hardware` |
| bridge_status | `SERIAL_CONNECTED` |
| serial_port | `/dev/serial0` |
| baud | `115200` |
| serial_connected | `true` |
| hardware_connected | `true` |
| stream_id | `PI_STREAM_20260930T031752Z` |
| dropped_packet_count | `0` |
| last_error | `null` |

The backend was already running normally, so no duplicate process was started. SSH key authentication was unavailable; all transport controls were therefore isolated to a dedicated browser runtime and did not disturb the Pi process, UART, or physical wiring.

The backend health endpoint reported a cumulative `malformed_packet_count` of `9` both before and after validation. The count did not increase during the campaign. Frontend malformed and schema-rejected counters remained zero during the normal observation.

## 6. 60-Second Normal-Traffic Observation

The corrected store instance was observed continuously for `64.036 seconds` with 100 ms state sampling.

| Field | Start | End |
|---|---:|---:|
| connection_state | `CONNECTED` | `CONNECTED` |
| packet_count | 3380 | 3951 |
| packet_rate_hz | 9.2 | 9.4 |
| reconnect_attempts | 0 | 0 |
| transport last_error | `null` | `null` |
| malformed_packets | 0 | 0 |
| schema_rejected_packets | 0 | 0 |
| duplicate_packets | 0 | 0 |
| out_of_order_packets | 0 | 0 |
| sequence_gaps | 0 | 0 |
| stream_switches | 0 | 0 |
| Data Status | `Live` | `Live` |

Packet rate ranged from `8.6 Hz` to `9.4 Hz`, with an average of `9.013 Hz`.

## 7. Local Inter-Arrival Statistics

Local accepted-packet gaps were measured from successive `lastAcceptedPacketReceiptMonotonicMs` values.

| Metric | Value |
|---|---:|
| Gap samples | 570 |
| Minimum | 4.6 ms |
| Average | 112.186 ms |
| Maximum | 403.5 ms |
| Gaps greater than 3000 ms | 0 |

The maximum local accepted-packet gap remained well below the freshness threshold.

## 8. Remote Timestamp-Age Statistics

Remote age was measured at browser WebSocket-frame receipt as:

```text
Date.now() - Date.parse(packet.timestamp_utc)
```

| Metric | Value |
|---|---:|
| Frame samples | 571 |
| Minimum | 3413 ms |
| Average | 3422.490 ms |
| Maximum | 3496 ms |
| Ages greater than 3000 ms | 571 |

All sampled remote timestamps were more than 3000 ms behind browser wall clock, while local accepted-packet gaps remained below 404 ms.

## 9. Continuous-Live Result

Across 600 normal-traffic state samples:

- `isTelemetryStale` remained `false`.
- The visible Data Status remained `Live`.
- False `Delayed` samples: `0`.
- Accepted packets advanced by `571`.
- Remote timestamp age exceeded 3000 ms for all `571` measured frames.

This is the central proof of the correction: remote timestamp age no longer drives frontend telemetry freshness.

## 10. Controlled Silence Result

A dedicated browser validation runtime installed a temporary pre-load WebSocket wrapper. The wrapper suppressed delivery of telemetry message callbacks while leaving the actual WebSocket open and `CONNECTED`. It did not modify application source, backend state, UART, or hardware wiring.

During silence:

- Packet count remained fixed at `20`.
- `lastAcceptedPacketReceiptMonotonicMs` remained fixed at `2373.2 ms`.
- Connection state remained `CONNECTED`.
- The socket remained open.
- Data Status transitioned from `Live` to `Delayed`.

## 11. Delayed Transition Timing

The measured silence-to-Delayed transition was:

```text
3589.1 ms
```

The transition is consistent with a strict greater-than-3000 ms threshold evaluated by the existing 1000 ms aging cadence. After approximately six seconds of suppressed delivery, the UI remained `Delayed` and no packet had been accepted.

When message delivery resumed, the next accepted packet restored `Live` in `63.8 ms`.

## 12. Reconnect Behavior

A separate browser-local reconnect control blocked creation of replacement WebSockets, then deliberately closed the active validation socket.

Observed blocked state after five seconds:

| Field | Value |
|---|---|
| connection_state | `RECONNECTING` |
| isTelemetryStale | `true` |
| monotonic marker | `null` |
| reconnect_attempts | 3 |
| packet_count | 574 |

After releasing the browser-local block, the store recorded a distinct WebSocket-open transition:

| Field | Value |
|---|---|
| connection_state | `CONNECTED` |
| isTelemetryStale | `true` |
| monotonic marker | `null` |
| packet_count | 0 |

Therefore, reconnect/open alone did not falsely establish `Live`.

## 13. First-Accepted-Packet Recovery

The first accepted packet arrived `80.4 ms` after the separate `CONNECTED`/stale transition.

At first acceptance:

- `lastAcceptedPacketReceiptMonotonicMs` became non-null.
- `isTelemetryStale` became `false`.
- Packet count became `1`.
- Data Status returned to `Live`.

The final recovery state was `CONNECTED`, `Live`, with normal telemetry advancing and reconnect attempts reset to zero.

## 14. Timestamp-Authority Preservation

Runtime correlation confirmed that store `lastPacketAt` exactly matched the accepted packet's `timestamp_utc`:

```text
lastPacketAt:          2026-09-30T04:34:10.664773+00:00
packet.timestamp_utc:  2026-09-30T04:34:10.664773+00:00
```

The corresponding monotonic marker was a separate numeric browser value. Backend/Pi UTC remains the displayed event and evidence timestamp authority.

## 15. Report and Evidence Leakage Check

A static search found `lastAcceptedPacketReceiptMonotonicMs` only in:

- `frontend/src/store/telemetryStore.ts`
- `frontend/src/store/telemetryStore.test.ts`

No matches were present in report generation, persistent evidence, persistent replay, RTC evidence, event records, frontend components, or backend code. Report v1.2 and evidence contracts remain unchanged.

## 16. Consumer Behavior

Existing consumers were inspected without redesign or code changes.

| Consumer | Observed result |
|---|---|
| Global Status / Overview | Connected, Data Status `Live` |
| Operational Summary | Packet rate approximately 9 Hz; backend UTC last update displayed |
| System Topology | Connected, system path healthy, Data Status `Live`, integrity clean |
| System Health telemetry freshness rule | Passed; `Telemetry stream is live` |
| Reports | Connected, Data Status `Live`, ready to export |

No stale banner appeared during normal traffic. Existing consumers received the corrected global stale state without source changes.

## 17. Remaining Separate Risks

The following were observed or retained as separate work and were not changed:

- `SAME_CLOCK_DOMAIN_RISK`: device registry aging.
- `SAME_CLOCK_DOMAIN_RISK`: link heartbeat aging.
- `UI_V_FINDING_C1`: ambiguous device attention aggregation.
- `UI_V_FINDING_C2`: operator-console connection versus registry-health ambiguity.

System Health continued to show separate Pi/MAIN and MAIN/SUB heartbeat-age warnings around 3.4 to 3.6 seconds while global telemetry freshness correctly remained `Live`. This confirms the requested scope boundary rather than invalidating the global freshness correction.

Browser console monitoring found no React exceptions, uncaught runtime exceptions, or unexpected state errors. WebSocket warnings/errors observed during deliberate blocking were expected validation-control effects. The application recovered cleanly.

## 18. Final Result

| Acceptance criterion | Result |
|---|---|
| WebSocket connected during normal traffic | PASS |
| Accepted packets continuously advanced | PASS |
| Local gaps below 3000 ms | PASS |
| Remote age above 3000 ms tolerated | PASS |
| Continuous `Live` under normal traffic | PASS |
| Zero false `Delayed` pulses | PASS |
| Controlled silence produced `Delayed` | PASS |
| Reconnect alone remained stale | PASS |
| First accepted packet restored `Live` | PASS |
| `packet.timestamp_utc` preserved | PASS |
| Monotonic state remained local-only | PASS |
| Report/evidence contracts unchanged | PASS |
| No unexpected browser exception | PASS |

```text
PHASE_7_2G_E_M_V_F_V_FRONTEND_TELEMETRY_FRESHNESS_VALIDATION: PASS
```

Final status:

```text
READY_FOR_REVIEW_PHASE_7_2G_E_M_V_F_V
```
