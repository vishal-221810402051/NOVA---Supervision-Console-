# Phase 7.2G-D — Heartbeat-Gap / Soak Stability Diagnosis Report

## 1. Executive Summary

This report documents NOVA SC Phase 7.2G-D: heartbeat-gap / soak stability diagnosis after a previous RTC validation report observed approximately 30-second heartbeat gaps.

The 1-hour soak completed without reproducing the previous heartbeat-gap failure. Both observed maximum heartbeat gaps were below the `3000 ms` timeout threshold:

| Link | Max Heartbeat Gap | Threshold | Result |
|---|---:|---:|---|
| link_pi_main | 1019 ms | 3000 ms | PASS |
| link_main_sub | 864 ms | 3000 ms | PASS |

No link dropout, node reset, packet-integrity failure, stream switch, sequence gap, or missed-packet condition was observed.

The validation result is:

```text
PHASE_7_2G_D_HEARTBEAT_GAP_SOAK_STABILITY_DIAGNOSIS: VALIDATED_WITH_REPLAY_WARNING
```

The remaining warning is bounded event-store replay truncation. Raw replay is partial because `49807` old bounded event records were dropped, while live soak summary counters were preserved.

This report does not prove the root cause of the previous heartbeat-gap failure. It only documents that the failure was not reproduced during this 1-hour soak.

## 2. Objective

The objective of Phase 7.2G-D was to diagnose whether the previously observed approximately 30-second heartbeat-gap failure repeats during a clean 1-hour soak run.

The phase focused on:

- 1-hour soak duration completion.
- Maximum heartbeat gap evidence for `link_pi_main` and `link_main_sub`.
- Link dropout counters.
- Node reset counters.
- Packet integrity counters.
- Topology continuity.
- Event-store rollover and replay limitations.

This was a telemetry-only diagnosis phase. It did not evaluate actuator readiness, control readiness, PWM behavior, GPIO behavior, or PCA9685 behavior.

## 3. Test Context

| Field | Value |
|---|---|
| Project | NOVA SC |
| Platform | NOVA B1 / NOVA SC hardware telemetry chain |
| Hardware chain | Laptop console → Raspberry Pi gateway → MAIN ESP32-S3 → SUB ESP32-S3 |
| Validation phase | Phase 7.2G-D |
| Purpose | Diagnose whether the previously observed approximately 30-second heartbeat-gap failure repeats during a clean 1-hour soak run |

Report metadata:

| Field | Value |
|---|---|
| report_type | NOVA_SC_SUPERVISORY_VALIDATION_REPORT |
| report_version | v1.1 |
| generated_at_utc | 2026-07-12T14:02:53.476Z |
| nova_sc_phase | PHASE_6_9_HARDWARE_TELEMETRY_BASELINE |
| baseline_status | VALIDATED_BASELINE |
| validation_engine_version | V1_PLUS_TOPOLOGY_AWARE |
| simulator_mode | false |
| hardware_connected | true |
| physical_hardware_validation | true |
| active_stream_id | PI_STREAM_20260712T110611Z |
| backend_stream_id | PI_STREAM_20260712T110611Z |
| transport_kind | WEBSOCKET |
| transport_simulated | false |

## 4. Reference Architecture

The observed hardware telemetry chain was:

```text
Laptop console
    |
    v
Raspberry Pi gateway
    |
    v
MAIN ESP32-S3
    |
    v
SUB ESP32-S3
```

Topology evidence:

| Field | Value |
|---|---|
| canonical_chain | laptop_console, pi_gateway, esp32_main, esp32_sub |
| connection_state | CONNECTED |
| telemetry_stale | false |
| reachable | true |
| links_healthy_count | 3 |
| links_synced_count | 3 |
| offline_links | [] |
| desynced_links | [] |

## 5. Runtime Environment

| Field | Value |
|---|---|
| global_health | DEGRADED |
| connection_state | CONNECTED |
| telemetry_stale | false |
| packet_count | 69807 |
| packet_rate_hz | 8.8 |
| last_sequence_number | 93217 |
| stream_switches | 0 |
| missed_packets | 0 |
| duplicate_packets | 0 |
| out_of_order_packets | 0 |
| sequence_resets | 0 |
| sequence_gaps | 0 |
| last_packet_at_utc | 2026-07-12T14:02:51.337327+00:00 |

Health-check evidence:

| Field | Value |
|---|---|
| overall | WARNING |
| pass | 40 |
| warning | 5 |
| fail | 0 |
| critical | 0 |

Expected warning context:

- Global health remains `DEGRADED` / `WARNING` due to expected unfinished V1 items.
- Expected warnings include PCA9685 AllCall validation pending, raw ADC rail mapping pending, and FRAM SPI validation pending.
- These expected warnings do not invalidate this heartbeat-gap soak stability diagnosis.

## 6. Soak-Test Summary

| Field | Value |
|---|---|
| soak_started_at_utc | 2026-07-12T13:01:17.223Z |
| soak_elapsed_seconds | 3696 |
| target_duration_minutes | 60 |
| is_soak_active | true |
| last_updated_at_utc | 2026-07-12T14:02:53.293Z |
| live_soak_summary_complete | true |
| raw_event_replay_complete | false |
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 49807 |
| replay_limitation_reason | Raw event replay is partial because older bounded event records were dropped; live soak summary counters are preserved. |
| verdict | WARNING |
| failure_reasons | [] |
| warning_reasons | Raw event replay partial; live soak summary counters preserved |
| total_packets | 32892 |
| packets_per_minute | 533.96 |

Packets by source node:

| Source Node | Packet Count |
|---|---:|
| esp32_main | 16263 |
| esp32_sub | 12935 |
| pi_gateway | 3694 |

Packets by event type:

| Event Type | Packet Count |
|---|---:|
| LINK_HEARTBEAT_TELEMETRY | 14785 |
| NODE_HEALTH_TELEMETRY | 7391 |
| GATEWAY_HEALTH_TELEMETRY | 3693 |
| LINK_SYNC_TELEMETRY | 3696 |
| POWER_HEALTH_TELEMETRY | 1848 |
| CHIP_STATUS_TELEMETRY | 739 |
| RTC_STATUS_TELEMETRY | 739 |
| TELEMETRY_INTEGRITY_EVENT | 1 |

Packets by link:

| Link | Packet Count |
|---|---:|
| link_pi_main | 9241 |
| link_main_sub | 9240 |

## 7. Heartbeat-Gap Evidence

| Link | Max Heartbeat Gap | Heartbeat Timeout Threshold | Result |
|---|---:|---:|---|
| link_pi_main | 1019 ms | 3000 ms | PASS |
| link_main_sub | 864 ms | 3000 ms | PASS |

Measured interpretation:

- `link_pi_main` maximum heartbeat gap was `1019 ms`, below the `3000 ms` threshold.
- `link_main_sub` maximum heartbeat gap was `864 ms`, below the `3000 ms` threshold.
- Both observed maximum heartbeat gaps pass the configured threshold.

Previous failure context:

- A previous RTC validation report had approximately 30-second heartbeat gaps.
- This clean 1-hour soak did not reproduce that failure.
- The root cause of the previous heartbeat-gap failure is not proven by this run.

Correct claim:

The previous heartbeat-gap failure was not reproduced during this 1-hour soak.

## 8. Dropout and Reset Evidence

Dropout evidence:

| Link | Dropout Count | Recovered Dropout Count | Result |
|---|---:|---:|---|
| link_pi_main | 0 | 0 | PASS |
| link_main_sub | 0 | 0 | PASS |

Node reset evidence:

| Node | Reset Count | Last Uptime ms | Reset Reason |
|---|---:|---:|---|
| esp32_main | 0 | 7866238 | POWER_ON_RESET |
| esp32_sub | 0 | 7866668 | POWER_ON_RESET |
| pi_gateway | 0 | 13 | null |

Engineering interpretation:

- No link dropouts were reported on either monitored hardware link.
- No recovered dropouts were reported.
- No node reset count increases were reported during the soak evidence window.

## 9. Packet Integrity Evidence

| Counter | Value |
|---|---:|
| duplicate_packets | 0 |
| out_of_order_packets | 0 |
| sequence_gaps | 0 |
| sequence_resets | 0 |
| missed_packets | 0 |
| stream_switches | 0 |
| schema_rejected_packets | 0 |
| malformed_packets | 0 |
| unknown_event_packets | 0 |
| unknown_node_packets | 0 |
| unknown_link_packets | 0 |

Engineering interpretation:

Packet integrity remained clean for the provided evidence. No duplicate packets, out-of-order packets, sequence gaps, sequence resets, missed packets, stream switches, schema rejections, malformed packets, unknown event packets, unknown node packets, or unknown link packets were reported.

## 10. Event-Store Rollover / Replay Limitation

Event-store summary:

| Field | Value |
|---|---|
| max_events | 20000 |
| current_events | 20000 |
| latest_event_store_sequence | 69807 |
| dropped_old_events | 49807 |
| accepted | 20000 |
| rejected | 0 |
| ignored | 0 |

Event-store interpretation:

- The bounded raw event store rolled over during the run.
- Raw replay is partial because `49807` old events were dropped.
- Live soak summary counters are preserved.
- Therefore, the soak verdict is `WARNING` rather than `PASS`.
- This is a replay/storage limitation, not a heartbeat-gap failure.

## 11. Health Warnings and Non-Blocking Items

The health-check result was `WARNING` with:

| Result Type | Count |
|---|---:|
| pass | 40 |
| warning | 5 |
| fail | 0 |
| critical | 0 |

Known non-blocking warning context for this heartbeat-gap diagnosis:

- PCA9685 AllCall validation pending.
- Raw ADC rail mapping pending.
- FRAM SPI validation pending.

These warnings do not invalidate the heartbeat-gap stability evidence because the heartbeat-gap diagnosis depends on topology continuity, heartbeat-gap metrics, dropout counters, node reset counters, packet integrity counters, and soak-summary counters.

## 12. Engineering Interpretation

The 1-hour soak completed without reproducing the prior approximately 30-second heartbeat-gap failure.

Measured evidence supports:

- 1-hour soak duration passed.
- `link_pi_main` heartbeat gap remained below threshold.
- `link_main_sub` heartbeat gap remained below threshold.
- Dropout counts remained zero.
- Recovered dropout counts remained zero.
- Node reset counts remained zero.
- Packet integrity counters remained clean.
- Topology remained connected, reachable, healthy, and synced.

The remaining warning is the bounded raw event-store replay limitation. Because the raw event store capacity is `20000` and `49807` old events were dropped, full raw replay is unavailable. The live soak summary counters are preserved, so the heartbeat-gap diagnosis can still be evaluated from the provided live summary evidence.

This run does not prove the root cause of the previous heartbeat-gap failure. It only shows that the previous failure was not reproduced during this 1-hour soak.

## 13. Safety Boundary

This phase is telemetry-only.

This report does not claim actuator readiness and does not document any activation of:

- MAIN_TO_SUB_UART command path
- command receiver
- command parser
- PCA9685 PWM
- actuator power control
- motors
- servos
- steppers
- pumps
- valves
- relays
- heaters

No backend code, frontend code, firmware, RTC sync logic, telemetry parsing, report generation code, command/control paths, actuator behavior, PWM behavior, GPIO behavior, or PCA9685 behavior is modified by this report.

## 14. Validation Result

| Validation Item | Result |
|---|---|
| PHASE_7_2G_D_HEARTBEAT_GAP_SOAK_STABILITY_DIAGNOSIS | VALIDATED_WITH_REPLAY_WARNING |
| 1-hour soak duration | PASS |
| Heartbeat gap threshold | PASS |
| Link dropout count | PASS |
| Node reset count | PASS |
| Packet integrity | PASS |
| Topology continuity | PASS |
| Raw replay completeness | WARNING |

Correct final claim:

The 1-hour soak completed without reproducing the previous heartbeat-gap failure. No link dropout, node reset, packet-integrity failure, stream switch, sequence gap, or missed-packet condition was observed. The remaining warning is bounded event-store replay truncation.

Claims not made:

- Full raw replay passed.
- Root cause of the previous heartbeat gap is proven.
- All long-duration validation is finished.
- Production-ready soak validation is complete.
- Actuator/control readiness is achieved.

## 15. Limitations

Known limitations:

- Raw event replay is partial due bounded event-store capacity.
- Longer soak validation requires persistent event storage or larger event capacity.
- Power rail calibrated ADC measurement is not implemented.
- FRAM remains BLOCKED_WRONG_IC_PENDING.
- PCA9685 AllCall remains NOT_VALIDATED.
- No safety interlock telemetry exists yet.
- No watchdog/fail-safe validation has been performed yet.
- This phase does not prove actuator/control readiness.
- This phase does not prove the root cause of the previous heartbeat-gap failure.

## 16. Final Status

```text
PHASE_7_2G_D_HEARTBEAT_GAP_SOAK_STABILITY_DIAGNOSIS: VALIDATED_WITH_REPLAY_WARNING
```

Final engineering status:

- The previous approximately 30-second heartbeat-gap failure was not reproduced during this 1-hour soak.
- Heartbeat-gap threshold evidence passed.
- Link dropout evidence passed.
- Node reset evidence passed.
- Packet integrity evidence passed.
- Topology continuity evidence passed.
- Raw replay completeness remains warning due bounded event-store rollover.
- This phase remains telemetry-only and does not establish actuator/control readiness.

## 17. Next Step

Next phase:

```text
Phase 7.2G-E — Persistent Soak Evidence / Event-Store Capacity Planning
```

This next phase should plan how to preserve complete long-duration raw evidence without enabling actuator/control/PWM/GPIO behavior.
