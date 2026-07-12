# Phase 7.2G-C — 1-Hour DS3231 RTC Drift Validation Report

## 1. Executive Summary

This report documents NOVA SC Phase 7.2G-C: 1-hour DS3231 RTC drift validation after Phase 7.2G-B introduced a `3600` second drift target and a session-stored hardened baseline.

The RTC-specific evidence is complete and supports a Phase 7.2G-C pass:

```text
PHASE_7_2G_C_ONE_HOUR_DS3231_RTC_DRIFT_VALIDATION: PASS / VALIDATED
```

Measured RTC drift over the 1-hour observation was `69 ms`, with an allowed tolerance of `3000 ms`. The observation window elapsed for `3609 seconds`, exceeding the required `3600 seconds`.

The DS3231 remains evidence only. Pi/backend UTC remains timestamp authority. `rtc_validated` remains `false`.

The general soak test is not clean because heartbeat-gap rules failed. That issue is documented separately in this report and should be investigated in the next phase. It does not invalidate the RTC-specific 1-hour drift result because the RTC drift evidence is complete, packet integrity counters are clean, and the RTC drift status is `DRIFT_EVIDENCE_READY`.

## 2. Objective

The objective of Phase 7.2G-C was to validate 1-hour DS3231 RTC drift evidence using the Phase 7.2G-B hardened drift-baseline design.

The specific goals were:

- Confirm that RTC sync succeeded before the drift run.
- Confirm that RTC retention evidence remained available during the 1-hour run.
- Confirm that the drift baseline was selected after the hardened minimum settle period.
- Confirm that the session-stored baseline survived bounded event-store rollover.
- Measure RTC/Pi drift over at least `3600 seconds`.
- Preserve Pi/backend UTC as timestamp authority.
- Avoid promoting DS3231 to timestamp authority.
- Avoid setting `RTC_VALIDATED` or `rtc_validated=true`.

## 3. Test Context

| Field | Value |
|---|---|
| Project | NOVA SC |
| Platform | NOVA B1 / NOVA SC hardware telemetry chain |
| Hardware chain | Laptop console → Raspberry Pi gateway → MAIN ESP32-S3 → SUB ESP32-S3 |
| RTC device | DS3231 |
| Validation phase | Phase 7.2G-C |
| Purpose | Validate 1-hour DS3231 RTC drift evidence after Phase 7.2G-B added a 3600-second target and session-stored hardened baseline |

Report metadata:

| Field | Value |
|---|---|
| report_type | NOVA_SC_SUPERVISORY_VALIDATION_REPORT |
| report_version | v1.1 |
| generated_at_utc | 2026-07-12T12:56:01.635Z |
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

The validated hardware telemetry chain was:

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

The DS3231 RTC is monitored by the MAIN ESP32-S3 and reported through the existing telemetry path. The Pi/backend system clock remains the timestamp authority for telemetry and validation comparison.

Authority boundary:

| Field | Value |
|---|---|
| timestamp_authority | PI_BACKEND_UTC |
| timestamp_authority_source | PI_GATEWAY_SYSTEM_CLOCK |
| rtc_can_be_timestamp_authority | false |
| rtc_validated | false |

## 5. Runtime Environment

| Field | Value |
|---|---|
| global_health | DEGRADED |
| connection_state | CONNECTED |
| telemetry_stale | false |
| packet_count | 34106 |
| packet_rate_hz | 8.8 |
| last_sequence_number | 57516 |
| stream_switches | 0 |
| missed_packets | 0 |
| duplicate_packets | 0 |
| out_of_order_packets | 0 |
| sequence_resets | 0 |
| sequence_gaps | 0 |
| last_packet_at_utc | 2026-07-12T12:55:59.633406+00:00 |

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
- These expected warnings do not invalidate the RTC-specific 1-hour drift validation.

## 6. RTC Sync Evidence

RTC status evidence:

| Field | Value |
|---|---|
| rtc_device | DS3231 |
| rtc_address | 0x68 |
| rtc_detected | true |
| rtc_register_read_ok | true |
| oscillator_stop_flag | false |
| backup_battery_present | true |
| backup_battery_configured | true |
| rtc_time_valid | false |
| rtc_status | RTC_TIME_VALIDATION_PENDING |
| time_source | DS3231_UNVERIFIED |
| sync_source | null |
| source_uptime_ms | 3854087 |
| rtc_time | 2026-07-12 12:55:58 |
| rtc_time_utc | null |
| rtc_validity_class | RTC_PRESENT_TIME_CANDIDATE |
| timestamp_authority | PI_BACKEND_UTC |
| timestamp_authority_source | PI_GATEWAY_SYSTEM_CLOCK |
| rtc_can_be_timestamp_authority | false |
| required_next_action | COMPARE_RTC_WITH_PI_UTC |
| phase_7_2c_verdict | RTC_TIME_CANDIDATE |
| evidence_note | DS3231 time is a validation candidate only. Pi/backend UTC remains timestamp authority. |

RTC sync result evidence:

| Field | Value |
|---|---|
| sync_result_received | true |
| session_sync_id | RTC_SYNC_270c3245-289a-407c-911e-1142bcc35c2f |
| result | RTC_SYNC_SUCCESS |
| accepted | true |
| write_ok | true |
| readback_ok | true |
| readback_delta_ms | -318 |
| osf_before | false |
| osf_after | false |
| osf_cleared | true |
| rtc_validity_class_after_sync | RTC_VALIDATION_READY |
| timestamp_authority_after_sync | PI_BACKEND_UTC |
| safety_scope | RTC_ONLY |
| no_forward_to_sub | true |
| forwarded_to_sub | false |
| control_output_touched | false |
| source_node_id | esp32_main |
| source_sequence_number | 896 |
| timestamp_utc | 2026-07-12T11:55:16.242067+00:00 |
| status_message | RTC synchronized; retention validation pending |

Engineering interpretation:

- RTC sync completed successfully.
- DS3231 write and readback succeeded.
- OSF was false before and after sync.
- The sync operation remained scoped to `RTC_ONLY`.
- The request was not forwarded to SUB.
- Control outputs were not touched.
- Timestamp authority remained `PI_BACKEND_UTC`.

## 7. RTC Retention Evidence During 1-Hour Run

| Field | Value |
|---|---|
| retention_check_available | true |
| retention_status | RETENTION_EVIDENCE_READY |
| last_sync_session_id | RTC_SYNC_270c3245-289a-407c-911e-1142bcc35c2f |
| last_sync_result_utc | 2026-07-12T11:55:16.242067+00:00 |
| current_rtc_time_utc | 2026-07-12T12:55:58.000Z |
| current_pi_utc | 2026-07-12T12:55:58.624253+00:00 |
| rtc_pi_delta_ms | -624 |
| oscillator_stop_flag | false |
| backup_battery_present | true |
| backup_battery_configured | true |
| rtc_time_advanced_since_sync | true |
| timestamp_authority | PI_BACKEND_UTC |
| rtc_validated | false |
| required_next_action | PROCEED_TO_RTC_DRIFT_VALIDATION |
| tolerance_ms | 5000 |

Engineering interpretation:

- The retention check was available during the 1-hour drift run.
- DS3231 time advanced after sync.
- OSF remained false.
- Backup battery evidence remained present and configured.
- RTC/Pi delta was `-624 ms`, within the retention tolerance context of `5000 ms`.
- This retention evidence supports proceeding to drift validation.
- `rtc_validated` remains `false`.

## 8. 1-Hour Drift Evidence

| Field | Value |
|---|---|
| drift_check_available | true |
| drift_status | DRIFT_EVIDENCE_READY |
| observation_window_target_seconds | 3600 |
| observation_elapsed_seconds | 3609 |
| sample_count | 451 |
| baseline_persisted_in_session | true |
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 14106 |
| baseline_min_settle_seconds | 30 |
| baseline_candidate_count | 1 |
| baseline_rejected_count | 0 |
| baseline_rejection_reason | null |
| baseline_source | PI_STREAM_20260712T110611Z:esp32_main:RTC_STATUS_TELEMETRY:1061 |
| baseline_rtc_time_utc | 2026-07-12T11:55:48.000Z |
| baseline_pi_utc | 2026-07-12T11:55:48.693876+00:00 |
| baseline_rtc_pi_delta_ms | -693 |
| baseline_delta_vs_sync_readback_ms | -375 |
| sync_readback_delta_ms | -318 |
| baseline_selected_after_sync_seconds | 32 |
| current_rtc_time_utc | 2026-07-12T12:55:58.000Z |
| current_pi_utc | 2026-07-12T12:55:58.624253+00:00 |
| current_rtc_pi_delta_ms | -624 |
| drift_ms | 69 |
| drift_abs_ms | 69 |
| drift_rate_ms_per_hour | 68.81 |
| drift_rate_ppm | 19.114 |
| oscillator_stop_flag | false |
| rtc_time_advanced | true |
| timestamp_authority | PI_BACKEND_UTC |
| rtc_validated | false |
| required_next_action | COMPLETE_1_HOUR_RTC_DRIFT_VALIDATION_REVIEW |
| tolerance_ms | 3000 |

Drift interpretation:

- The 1-hour target was `3600 seconds`.
- The observation elapsed for `3609 seconds`.
- Absolute RTC drift was `69 ms`.
- The allowed tolerance was `3000 ms`.
- The RTC-specific 1-hour drift evidence passes.
- `RTC_VALIDATED=true` is not claimed.
- DS3231 timestamp authority is not claimed.

## 9. Hardened Baseline and Session Persistence Evidence

| Field | Value |
|---|---|
| baseline_min_settle_seconds | 30 |
| baseline_selected_after_sync_seconds | 32 |
| baseline_candidate_count | 1 |
| baseline_rejected_count | 0 |
| baseline_rejection_reason | null |
| sync_readback_delta_ms | -318 |
| baseline_rtc_pi_delta_ms | -693 |
| baseline_delta_vs_sync_readback_ms | -375 |
| tolerance_ms | 3000 |
| baseline_persisted_in_session | true |

Hardened baseline interpretation:

- Baseline was selected `32 seconds` after sync.
- Required minimum settle time was `30 seconds`.
- Baseline candidate count was `1`.
- Rejected baseline count was `0`.
- Sync readback delta was `-318 ms`.
- Baseline RTC/Pi delta was `-693 ms`.
- Baseline delta vs sync readback was `-375 ms`.
- This is inside the `3000 ms` consistency gate.
- Hardened baseline selection passes.
- The baseline was persisted in session for rollover protection.

## 10. Event-Store Rollover Handling

| Field | Value |
|---|---|
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 14106 |
| replay_limitation_reason | Raw event replay is partial because older bounded event records were dropped; live soak summary counters are preserved. |
| baseline_persisted_in_session | true |

Engineering interpretation:

The raw event store rolled over during the 1-hour run. The store was at capacity with `20000` current events and `14106` older events dropped.

The session-stored RTC drift baseline survived this rollover. This validates the Phase 7.2G-B design requirement that the hardened baseline must survive bounded event-store rollover during long observations.

## 11. Packet Integrity and Topology Evidence

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

Packet integrity evidence:

| Field | Value |
|---|---|
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

Packet integrity counters remained clean during the captured report window. The topology chain remained reachable, connected, healthy, and synced according to the provided topology evidence.

## 12. Soak-Test Caveat

Soak-test evidence:

| Field | Value |
|---|---|
| soak_started_at_utc | 2026-07-12T11:52:06.161Z |
| soak_elapsed_seconds | 3835 |
| total_packets | 34106 |
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 14106 |
| verdict | FAIL |
| failure_reason_1 | Hardware link link_pi_main max heartbeat gap 30495 ms exceeds 3000 ms |
| failure_reason_2 | Hardware link link_main_sub max heartbeat gap 30617 ms exceeds 3000 ms |
| warning_reason | Raw event replay partial; live soak summary counters preserved |
| esp32_main reset_count | 0 |
| esp32_sub reset_count | 0 |
| pi_gateway reset_count | 0 |

Engineering interpretation:

The general soak test is not clean because heartbeat-gap rules failed. The reported maximum heartbeat gaps were approximately `30 seconds` on both `link_pi_main` and `link_main_sub`.

This must be diagnosed separately. It does not invalidate the RTC-specific 1-hour drift result because:

- RTC drift evidence is complete.
- RTC drift status is `DRIFT_EVIDENCE_READY`.
- Packet integrity counters are clean.
- `stream_switches` is `0`.
- `sequence_gaps` is `0`.
- `sequence_resets` is `0`.
- `missed_packets` is `0`.

The correct interpretation is that RTC-specific drift validation passed, while the broader soak-test result remains failed and requires follow-up diagnosis.

## 13. Safety and Authority Boundary

This report is documentation only.

Disabled features / safety boundary:

- MAIN_TO_SUB_UART command path
- command path
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

No source code behavior is modified by this report. No backend code, frontend code, firmware, RTC sync logic, telemetry parsing, report generation code, command/control paths, actuator behavior, PWM behavior, GPIO behavior, or PCA9685 behavior is changed.

Authority boundary:

- Pi/backend UTC remains timestamp authority.
- DS3231 remains evidence only.
- `rtc_can_be_timestamp_authority` remains `false`.
- `rtc_validated` remains `false`.
- `RTC_VALIDATED` is not assigned.
- DS3231 is not claimed as timestamp authority.

## 14. Validation Result

| Validation Item | Result |
|---|---|
| PHASE_7_2G_C_ONE_HOUR_DS3231_RTC_DRIFT_VALIDATION | PASS / VALIDATED |
| RTC_SYNC_SUCCESS | VALIDATED |
| RTC_RETENTION_DURING_1H_RUN | VALIDATED |
| HARDENED_BASELINE_SELECTION | VALIDATED |
| SESSION_STORED_BASELINE_ROLLOVER_PROTECTION | VALIDATED |
| RTC_1H_DRIFT_ABS_MS | 69 ms |
| RTC_1H_DRIFT_TOLERANCE_MS | 3000 ms |
| RTC_AUTHORITY_BOUNDARY | PRESERVED |

Not accepted:

| Item | Status |
|---|---|
| GENERAL_SOAK_TEST | NOT CLEAN / FAIL |
| RTC_VALIDATED | false |
| RTC_TIMESTAMP_AUTHORITY | not promoted |

Correct final claim:

DS3231 1-hour drift evidence is validated. Pi/backend UTC remains timestamp authority. `rtc_validated` remains `false`. General soak still has heartbeat-gap failures that must be diagnosed separately.

## 15. Limitations

Known limitations:

- Laptop node heartbeat is not implemented.
- Power rail calibrated ADC measurement is not implemented; Phase 7.1A may expose raw ADS1115 input debug voltage only.
- MB85RS256B_FRAM is BLOCKED_WRONG_IC_PENDING.
- PCA9685_ALLCALL is NOT_VALIDATED because it is not an independent physical device validation.
- No safety interlock telemetry exists yet.
- No watchdog/fail-safe validation has been performed yet.
- Long-runtime telemetry soak validation is still pending.
- The general soak test failed heartbeat-gap rules and requires separate diagnosis.
- This report does not claim DS3231 timestamp authority.
- This report does not set `rtc_validated=true`.

## 16. Final Status

```text
PHASE_7_2G_C_ONE_HOUR_DS3231_RTC_DRIFT_VALIDATION: PASS / VALIDATED
```

Final engineering status:

- DS3231 1-hour drift evidence is validated.
- RTC sync success is validated.
- RTC retention during the 1-hour run is validated.
- Hardened baseline selection is validated.
- Session-stored baseline rollover protection is validated.
- Pi/backend UTC remains timestamp authority.
- `rtc_validated` remains `false`.
- General soak test remains not clean due to heartbeat-gap failures.

## 17. Next Step

Next phase:

```text
Phase 7.2G-D — Heartbeat-Gap / Soak Stability Diagnosis
```

The next phase should investigate the repeated approximately 30-second heartbeat-gap failures without enabling actuator/control/PWM/GPIO behavior.
