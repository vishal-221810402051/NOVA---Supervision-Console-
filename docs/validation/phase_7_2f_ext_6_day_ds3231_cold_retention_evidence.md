# Phase 7.2F-EXT — 6-Day DS3231 Cold-Retention Evidence Report

## 1. Executive Summary

This report documents Phase 7.2F-EXT for NOVA SC: a 6-day DS3231 cold-retention observation after an approximately 6-day powered-off interval.

The exported NOVA SC hardware telemetry report captured a readable DS3231 time candidate with oscillator stop flag clear, backup battery evidence present/configured, clean packet integrity, and a manual RTC/Pi delta of `-1532.685 ms`.

Validation result:

```text
PHASE_7_2F_EXT_6_DAY_DS3231_COLD_RETENTION_EVIDENCE: CAPTURED / PASS
```

This result confirms battery-backed DS3231 retention at evidence level. Pi/backend UTC remains timestamp authority. `rtc_validated` remains `false`.

## 2. Objective

The objective was to capture and document DS3231 cold-retention evidence after approximately 6 days powered off.

The purpose was not to promote the DS3231 to timestamp authority, and not to mark the RTC as validated. The purpose was to determine whether the RTC retained plausible UTC time across the unpowered interval.

## 3. Test Context

| Field | Value |
|---|---|
| Project | NOVA SC |
| Platform | NOVA B1 / NOVA SC hardware telemetry chain |
| Hardware chain | Laptop console → Raspberry Pi gateway → MAIN ESP32-S3 → SUB ESP32-S3 |
| RTC device | DS3231 |
| Validation extension | Phase 7.2F-EXT |
| Purpose | Cold-retention observation after approximately 6 days powered off |

## 4. Reference Time Authority

The reference time authority for this observation was Pi/backend UTC.

Pi time authority evidence:

| Field | Value |
|---|---|
| Command | `timedatectl status` |
| Local time | Sun 2026-07-12 12:50:13 CEST |
| Universal time | Sun 2026-07-12 10:50:13 UTC |
| Time zone | Europe/Paris (CEST, +0200) |
| System clock synchronized | yes |
| NTP service | active |
| RTC in local TZ | no |
| RTC time | n/a |

Pi/backend UTC remains the timestamp authority for NOVA SC telemetry.

## 5. NOVA SC Telemetry Environment

NOVA SC exported report evidence:

| Field | Value |
|---|---|
| report_type | NOVA_SC_SUPERVISORY_VALIDATION_REPORT |
| report_version | v1.1 |
| generated_at_utc | 2026-07-12T10:50:34.261Z |
| baseline_status | VALIDATED_BASELINE |
| simulator_mode | false |
| hardware_connected | true |
| physical_hardware_validation | true |
| active_stream_id | PI_STREAM_20260712T104800Z |
| backend_stream_id | PI_STREAM_20260712T104800Z |
| transport_kind | WEBSOCKET |
| transport_simulated | false |
| connection_state | CONNECTED |
| telemetry_stale | false |
| packet_count | 1174 |
| packet_rate_hz | 9.2 |
| duplicate_packets | 0 |
| out_of_order_packets | 0 |
| sequence_gaps | 0 |
| sequence_resets | 0 |
| missed_packets | 0 |
| malformed_packets | 0 |
| schema_rejected_packets | 0 |
| stream_switches | 0 |

Topology evidence:

| Field | Value |
|---|---|
| canonical_chain | laptop_console, pi_gateway, esp32_main, esp32_sub |
| reachable | true |
| links_healthy_count | 3 |
| links_synced_count | 3 |
| offline_links | [] |
| desynced_links | [] |

Health-check evidence:

| Field | Value |
|---|---|
| overall | WARNING |
| pass | 40 |
| warning | 5 |
| fail | 0 |
| critical | 0 |

Expected warning context:

- Global health remains DEGRADED / WARNING due to expected unfinished V1 items.
- Expected warnings include PCA9685 AllCall validation pending, raw ADC rail mapping pending, and FRAM SPI validation pending.
- These warnings do not invalidate the RTC cold-retention observation.

## 6. DS3231 RTC Evidence

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
| rtc_time | 2026-07-12 10:50:27 |
| rtc_time_utc | null |
| rtc_validity_class | RTC_PRESENT_TIME_CANDIDATE |
| timestamp_authority | PI_BACKEND_UTC |
| timestamp_authority_source | PI_GATEWAY_SYSTEM_CLOCK |
| rtc_can_be_timestamp_authority | false |
| required_next_action | COMPARE_RTC_WITH_PI_UTC |
| status_message | Read-only RTC telemetry: battery configured; time unverified; not timestamp authority |

Retention summary evidence:

| Field | Value |
|---|---|
| retention_check_available | false |
| retention_status | RETENTION_CHECK_PENDING |
| last_sync_session_id | null |
| last_sync_result_utc | null |
| current_rtc_time_utc | 2026-07-12T10:50:27.000Z |
| current_pi_utc | 2026-07-12T10:50:28.532685+00:00 |
| rtc_pi_delta_ms | null |
| oscillator_stop_flag | false |
| backup_battery_present | true |
| backup_battery_configured | true |
| rtc_time_advanced_since_sync | null |
| timestamp_authority | PI_BACKEND_UTC |
| rtc_validated | false |
| required_next_action | CAPTURE_RTC_SYNC_SUCCESS |
| tolerance_ms | 5000 |
| evidence_note | No RTC_SYNC_SUCCESS result is available in this frontend session; run or capture RTC_SYNC_SUCCESS before retention comparison. |

## 7. Manual RTC/Pi Delta Calculation

Manual calculation inputs:

| Field | Value |
|---|---|
| RTC UTC | 2026-07-12T10:50:27.000Z |
| Pi/backend UTC | 2026-07-12T10:50:28.532685+00:00 |
| RTC/Pi delta | -1532.685 ms |

Calculation:

```text
RTC/Pi delta = RTC UTC - Pi/backend UTC
RTC/Pi delta = 2026-07-12T10:50:27.000Z - 2026-07-12T10:50:28.532685+00:00
RTC/Pi delta = -1532.685 ms
```

Interpretation:

The RTC was approximately `1.53 seconds` behind Pi/backend UTC after roughly 6 days powered off.

## 8. Validation Result

```text
PHASE_7_2F_EXT_6_DAY_DS3231_COLD_RETENTION_EVIDENCE: CAPTURED / PASS
```

Measured evidence supports the following:

- DS3231 retained plausible UTC time across the unpowered interval.
- Battery-backed RTC operation is confirmed at evidence level.
- OSF did not reassert.
- Pi/backend UTC remains timestamp authority.
- `rtc_validated` remains `false`.

## 9. Engineering Interpretation

The DS3231 RTC presented a readable time candidate after the cold-retention interval. The oscillator stop flag was false, backup battery evidence was present/configured, and packet integrity was clean.

The manual RTC/Pi delta of `-1532.685 ms` is within the Phase 7.2F retention tolerance context of `5000 ms`, but the formal frontend Phase 7.2F retention algorithm did not mark this as same-session retention validation because the earlier `RTC_SYNC_SUCCESS` event was not available in the new frontend session.

This evidence should therefore be interpreted as a 6-day cold-retention observation and extension, not automatic same-session retention validation.

## 10. Limitations

- The formal frontend retention summary reported `RETENTION_CHECK_PENDING`.
- `last_sync_session_id` was `null`.
- `last_sync_result_utc` was `null`.
- The previous `RTC_SYNC_SUCCESS` event was not available in this new frontend session.
- `rtc_pi_delta_ms` in the retention summary was `null`; the delta in this report is a manual calculation from captured RTC UTC and Pi/backend UTC evidence.
- `rtc_time_valid` remained `false`.
- `rtc_validated` remained `false`.
- DS3231 remained `DS3231_UNVERIFIED`.
- This report does not promote DS3231 to timestamp authority.

## 11. Safety and Authority Boundary

This report is documentation only.

No backend code, frontend code, firmware, RTC sync logic, telemetry parsing, report generation code, command/control paths, actuator behavior, PWM behavior, or GPIO behavior is modified by this report.

Authority boundary:

- Pi/backend UTC remains timestamp authority.
- DS3231 remains evidence only.
- `rtc_can_be_timestamp_authority` remains `false`.
- `rtc_validated` remains `false`.
- `RTC_VALIDATED` is not assigned.

## 12. Final Status

Correct final claim:

DS3231 synchronization, short retention evidence, 6-day cold-retention observation, and 30-minute drift evidence are validated/captured at evidence level. Pi/backend UTC remains timestamp authority. `rtc_validated` remains `false`. 1-hour drift validation is still required.

## 13. Next Step

Next phase:

```text
Phase 7.2G-B — 1-Hour Drift Readiness Implementation
```

Required next implementation direction:

- Update the drift target from `1800 seconds` to `3600 seconds`.
- Preserve a session-stored baseline to survive event-store rollover.
- Continue preserving Pi/backend UTC as timestamp authority.
- Continue keeping `rtc_validated=false` until a later approved validation phase explicitly changes that state.
