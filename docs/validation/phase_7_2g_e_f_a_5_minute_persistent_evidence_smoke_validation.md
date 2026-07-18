# Phase 7.2G-E-F-A — 5-Minute Persistent Evidence Smoke Validation

## 1. Executive Summary

Phase 7.2G-E-F-A completed a 5-minute hardware-mode persistent evidence smoke validation for NOVA SC.

The validation result is:

```text
PHASE_7_2G_E_F_A_5_MINUTE_PERSISTENT_EVIDENCE_SMOKE_VALIDATION: PASS
```

During the run, the Raspberry Pi backend operated in hardware mode, remained connected to the MAIN ESP32-S3 over `/dev/serial0` at `115200` baud, and wrote persistent backend evidence to an append-only NDJSON segment. After clean backend shutdown, `manifest.json`, `summary.json`, and `integrity.json` were present, finalized, and internally consistent.

The integrity verification reported `VALIDATION_RESULT: PASS`, with `3521` NDJSON events matching both segment and summary counts. No persistent event drops and no writer errors were reported.

This phase validates the persistent evidence writer smoke path before longer soak validation. It does not claim persistent replay validation, tamper-proof storage, cryptographic attestation, production archive readiness, FRAM checkpoint validation, or actuator/control readiness.

## 2. Objective

The objective of Phase 7.2G-E-F-A was to validate backend persistent evidence logging during a real hardware telemetry run.

Specifically, this phase checked whether the Raspberry Pi backend could:

- Run in hardware telemetry mode.
- Receive canonical NOVA SC hardware telemetry.
- Persist telemetry evidence to backend filesystem storage.
- Produce an NDJSON event segment.
- Finalize manifest, summary, and integrity metadata after clean shutdown.
- Verify segment SHA-256 and run-root integrity metadata.
- Complete the 5-minute smoke target without writer errors or persistent event drops.

## 3. System Context

NOVA SC hardware telemetry chain:

```text
Laptop Supervisory Console → Raspberry Pi Gateway → MAIN ESP32-S3 → SUB ESP32-S3
```

The backend host for this validation was the Raspberry Pi Gateway. The backend was responsible for hardware serial ingestion from the MAIN ESP32-S3 and for persistent evidence logging on the backend filesystem.

Persistent evidence logging is intended to address the earlier frontend bounded event-store limitation. The frontend event store remains a live supervision and report cache, while backend evidence files provide filesystem-resident run evidence that can survive frontend refresh, browser close, and browser event-store rollover.

This validation only evaluates the backend persistent evidence smoke path. It does not evaluate persistent replay, long-duration soak completeness, FRAM checkpointing, command/control behavior, or actuator readiness.

## 4. Pre-Run Conditions

Pre-run conditions were satisfied:

| Condition | Evidence | Result |
|---|---|---|
| Pi repository had latest code pulled | Repository updated on Raspberry Pi before run | PASS |
| `backend/evidence_writer.py` existed | Backend persistent evidence writer present | PASS |
| `backend/test_evidence_writer.py` existed | Backend evidence writer tests present | PASS |
| Backend compile passed | Backend compile check completed before run | PASS |
| Targeted backend tests passed | `Ran 40 tests in 0.653s` / `OK` | PASS |

Targeted backend test evidence:

```text
Ran 40 tests in 0.653s
OK
```

## 5. Backend Runtime Configuration

The backend runtime configuration used for this smoke validation was:

| Environment Variable | Value |
|---|---|
| `NOVA_SC_BACKEND_MODE` | `hardware` |
| `NOVA_SC_SERIAL_PORT` | `/dev/serial0` |
| `NOVA_SC_SERIAL_BAUD` | `115200` |
| `NOVA_SC_EVIDENCE_ENABLED` | `true` |
| `NOVA_SC_EVIDENCE_ROOT` | `$(pwd)/evidence/soak_runs` |
| `NOVA_SC_EVIDENCE_PHASE_ID` | `PHASE_7_2G_E_F_A` |
| `NOVA_SC_EVIDENCE_TARGET_MINUTES` | `5` |
| `NOVA_SC_EVIDENCE_ROTATE_MINUTES` | `10` |
| `NOVA_SC_EVIDENCE_ROTATE_MB` | `50` |
| `NOVA_SC_EVIDENCE_FLUSH_INTERVAL_SECONDS` | `5` |
| `NOVA_SC_EVIDENCE_QUEUE_SIZE` | `10000` |

Backend runtime context:

| Field | Value |
|---|---|
| Platform | NOVA SC |
| Backend host | Raspberry Pi |
| Backend mode | hardware |
| Serial port | `/dev/serial0` |
| Serial baud | `115200` |
| Bridge status during run | `SERIAL_CONNECTED` |
| `serial_connected` | `true` |
| `hardware_connected` | `true` |
| Evidence phase ID | `PHASE_7_2G_E_F_A` |
| Evidence logging enabled | `true` |
| Evidence logging active during run | `true` |

## 6. Active Run Health Evidence

The active run `/health` check was captured after the minimum 5-minute target had elapsed.

| Field | Value |
|---|---|
| `backend_mode` | `hardware` |
| `bridge_status` | `SERIAL_CONNECTED` |
| `serial_port` | `/dev/serial0` |
| `baud` | `115200` |
| `serial_connected` | `true` |
| `hardware_connected` | `true` |
| `stream_id` | `PI_STREAM_20260718T121813Z` |
| `malformed_packet_count` | `0` |
| `dropped_packet_count` | `0` |
| `persistent_evidence_enabled` | `true` |
| `persistent_evidence_active` | `true` |
| `persistent_events_written` | `2976` |
| `persistent_events_dropped` | `0` |
| `persistent_writer_errors` | `0` |
| `finalized` | `false` |
| `hash_finalized` | `false` |
| `persistent_replay_validated` | `false` |
| `tamper_proof` | `false` |
| `cryptographic_attestation` | `false` |

Additional active run evidence:

| Field | Value |
|---|---|
| `evidence_segments_written` | `1` |
| `persistent_replay_validation_status` | `PENDING_SOAK_VALIDATION` |
| `required_next_action` during active run | `COMPLETE_AND_FINALIZE_PERSISTENT_EVIDENCE_RUN` |

Run duration evidence:

| Field | Value |
|---|---|
| Backend run started approximately at | `2026-07-18T12:18:13Z` |
| Active health check after minimum duration | `2026-07-18T12:23:48Z` |
| Elapsed duration | approximately 5 minutes 35 seconds |
| Minimum smoke validation target | 5 minutes |

The active run evidence shows that the backend evidence writer was enabled and active during the smoke interval, with hardware telemetry connected and no reported malformed packets, dropped gateway packets, persistent event drops, or writer errors at the active check.

## 7. Evidence Run Directory

Evidence run identifier:

```text
EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
```

Evidence run directory:

```text
backend/evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_A_EVIDENCE_20260718T121813Z_1b8f7f30-461c-424e-9aad-ddb28c7bc4c8
```

Evidence directory listing after clean backend shutdown:

| File | Evidence |
|---|---|
| `events_000001.ndjson` | present, approximately 5.1 MB |
| `manifest.json` | present |
| `summary.json` | present |
| `integrity.json` | present |

The presence of these files after clean shutdown confirms that the persistent evidence writer created the event segment and finalized the run metadata artifacts.

## 8. Integrity Verification

Integrity verification output:

| Field | Value |
|---|---|
| `segments` | `1` |
| `total_ndjson_events` | `3521` |
| `summary_events_written` | `3521` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |
| `run_root_sha256` | `5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167` |
| `VALIDATION_RESULT` | `PASS` |

Verification interpretation:

- One NDJSON evidence segment was produced.
- The NDJSON line count was `3521`.
- The summary event count was `3521`.
- Segment event count matched NDJSON line count.
- Summary event count matched NDJSON line count.
- Segment SHA-256 verification passed.
- A run-root SHA-256 was generated.
- No writer errors were reported.
- No persistent evidence events were dropped.

The SHA-256 evidence supports file-integrity detection for finalized evidence files. It does not establish tamper-proof storage or cryptographic attestation.

## 9. Validation Result Matrix

| Validation Item | Result |
|---|---|
| Evidence writer enabled in hardware mode | PASS |
| Hardware serial bridge connected | PASS |
| Hardware telemetry active | PASS |
| NDJSON segment written | PASS |
| `manifest.json` finalized | PASS |
| `summary.json` created | PASS |
| `integrity.json` created | PASS |
| SHA-256 verification passed | PASS |
| `run_root_sha256` generated | PASS |
| Event count consistency verified | PASS |
| `persistent_events_dropped = 0` | PASS |
| `writer_errors = 0` | PASS |
| Persistent replay validation | NOT CLAIMED |
| Tamper-proof evidence | NOT CLAIMED |
| Cryptographic attestation | NOT CLAIMED |

## 10. Engineering Interpretation

This phase is important because it validates the backend persistent evidence writer in a real hardware telemetry run before relying on it for longer soak evidence.

The smoke run demonstrates that backend persistent evidence logging can operate while the Raspberry Pi backend is connected to the MAIN ESP32-S3 over `/dev/serial0`. It also confirms that canonical hardware telemetry events can be written into an NDJSON segment and finalized into manifest, summary, and integrity artifacts after clean backend shutdown.

This directly addresses the earlier frontend event-store rollover limitation. Frontend bounded event storage remains useful for live supervision and report generation, but it is not sufficient as the only raw evidence store for longer runs. Backend filesystem evidence provides a more appropriate location for long-duration persistent telemetry evidence.

Phase 7.2G-E-F-A therefore prepares the project for Phase 7.2G-E-F-B: 1-hour persistent evidence soak validation.

## 11. Safety Boundary

This phase was a runtime validation and documentation phase only.

Safety boundary statements:

- No firmware was modified during this runtime validation.
- No RTC sync behavior was changed.
- No timestamp authority change occurred.
- Raspberry Pi backend UTC remains the trusted timestamp authority.
- No actuator behavior was modified.
- No control behavior was modified.
- No PWM behavior was modified.
- No GPIO behavior was modified.
- No PCA9685 behavior was modified.
- No FRAM behavior was modified.
- No command/control path was enabled.

This phase does not enable motors, servos, steppers, pumps, valves, relays, heaters, GPIO control, PCA9685 PWM output, or FRAM checkpoint storage.

## 12. Claims Allowed After This Phase

The following claims are supported by the provided evidence:

- 5-minute hardware-mode persistent evidence smoke validation passed.
- Backend persistent evidence logging produced finalized NDJSON evidence.
- `manifest.json`, `summary.json`, and `integrity.json` were generated.
- SHA-256 file-integrity verification passed.
- `run_root_sha256` was generated.
- No writer errors occurred.
- No persistent event drops occurred.
- Evidence finalization completed after clean backend shutdown.
- Persistent evidence files survived frontend/browser state because they were stored on the backend filesystem.

## 13. Claims Not Allowed After This Phase

The following claims are not supported by this phase:

- 1-hour persistent evidence soak validated.
- 6-hour persistent evidence soak validated.
- 24-hour persistent evidence soak validated.
- Persistent replay validated.
- Tamper-proof evidence storage.
- Cryptographic attestation.
- Production-grade evidence archive.
- FRAM checkpoint validation.
- Actuator/control readiness.
- Motor readiness.
- Servo readiness.
- Stepper readiness.
- Pump readiness.
- Valve readiness.
- Relay readiness.
- Heater readiness.
- GPIO control readiness.
- PCA9685 PWM output readiness.

## 14. Final Status

```text
PHASE_7_2G_E_F_A_5_MINUTE_PERSISTENT_EVIDENCE_SMOKE_VALIDATION: PASS
```

## 15. Next Step

Proceed to Phase 7.2G-E-F-B — 1-Hour Persistent Evidence Soak Validation.
