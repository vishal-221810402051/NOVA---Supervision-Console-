# Phase 7.2G-E-F-B — 1-Hour Persistent Evidence Soak Validation

## 1. Executive Summary

Phase 7.2G-E-F-B completed a 1-hour-plus hardware-mode persistent evidence soak validation for NOVA SC.

The validation result is:

```text
PHASE_7_2G_E_F_B_1_HOUR_PERSISTENT_EVIDENCE_SOAK_VALIDATION: PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED
```

The Raspberry Pi backend ran in hardware mode, maintained a `SERIAL_CONNECTED` bridge to the MAIN ESP32-S3 over `/dev/serial0` at `115200` baud, and kept backend persistent evidence logging active beyond the 60-minute target. The final active runtime was approximately 71 minutes 34 seconds.

After clean backend shutdown, the evidence run directory contained 9 NDJSON evidence segments plus finalized `manifest.json`, `summary.json`, and `integrity.json` files. Integrity verification reported `VALIDATION_RESULT: PASS`, with `44074` NDJSON events matching `summary_events_written`, `writer_errors` equal to `0`, and `persistent_events_dropped` equal to `0`.

Important caveat: a frontend report export was not captured before backend shutdown. This does not invalidate the backend persistent evidence validation, but it means this phase does not claim frontend report capture for the run.

This phase does not claim persistent replay validation, tamper-proof storage, cryptographic attestation, production archive readiness, FRAM checkpoint validation, or actuator/control readiness.

## 2. Objective

The objective of Phase 7.2G-E-F-B was to validate backend persistent evidence logging over a long real-hardware telemetry run.

The phase specifically evaluated whether the backend persistent evidence path could:

- Run in hardware mode for longer than 1 hour.
- Preserve canonical hardware telemetry evidence on the Raspberry Pi filesystem.
- Keep persistent evidence logging active during the run.
- Rotate NDJSON evidence segments.
- Finalize manifest, summary, and integrity artifacts after clean backend shutdown.
- Verify SHA-256 file-integrity metadata.
- Preserve event-count consistency across NDJSON and summary evidence.
- Complete without persistent event drops or writer errors.

## 3. System Context

NOVA SC hardware telemetry chain:

```text
Laptop Supervisory Console → Raspberry Pi Gateway → MAIN ESP32-S3 → SUB ESP32-S3
```

Runtime platform:

| Field | Value |
|---|---|
| Project | NOVA SC |
| Backend host | Raspberry Pi |
| Backend mode | hardware |
| Serial port | `/dev/serial0` |
| Serial baud | `115200` |
| Backend bridge status during run | `SERIAL_CONNECTED` |
| `serial_connected` | `true` |
| `hardware_connected` | `true` |
| Evidence phase ID | `PHASE_7_2G_E_F_B` |
| Evidence logging enabled | `true` |
| Evidence logging active during run | `true` |

Backend persistent evidence logging records accepted canonical telemetry to backend filesystem NDJSON files. This is separate from the frontend bounded event store, which remains a live supervision and report cache. The backend evidence directory is the persistent raw evidence source for this validation.

## 4. Preflight Investigation

Preflight readiness evidence:

| Check | Evidence | Result |
|---|---|---|
| Latest evidence code present on Raspberry Pi | Latest evidence code was pulled onto the Pi | PASS |
| Evidence writer module present | `backend/evidence_writer.py` existed | PASS |
| Evidence writer tests present | `backend/test_evidence_writer.py` existed | PASS |
| Backend compile readiness | Backend compile passed | PASS |
| Targeted backend tests | `Ran 40 tests in 0.653s` / `OK` | PASS |
| Prior smoke baseline | 5-minute persistent evidence smoke validation had already passed | PASS |
| Disk free before run | 49 GB available | PASS |
| Inode usage before run | 5% | PASS |
| Serial device present | `/dev/serial0` existed and resolved to `/dev/ttyS0` | PASS |
| Duplicate backend process check | No existing `uvicorn` / `main:app` backend process was running | PASS |
| Evidence directory Git boundary | Runtime evidence folder ignored locally using `backend/evidence/` | PASS |

Targeted backend test evidence:

```text
Ran 40 tests in 0.653s
OK
```

5-minute baseline used for planning:

| Field | Value |
|---|---:|
| `duration_seconds` | `395.905995` |
| `events` | `3521` |
| `events_per_sec` | `8.89` |
| `MB_per_hour_estimate` | `46.23` |
| `events_per_hour_estimate` | `32016` |
| `writer_errors` | `0` |
| `persistent_events_dropped` | `0` |

5-minute baseline `run_root_sha256`:

```text
5d872e585707b7a124d2fbde2c307e7932fc859ae2bccbe8b536c916339ac167
```

The preflight evidence indicated sufficient disk space, available serial hardware, no duplicate backend process, and a previously validated 5-minute persistent evidence baseline before starting the 1-hour soak.

## 5. Backend Runtime Configuration

The backend runtime configuration used for the 1-hour soak validation was:

| Environment Variable | Value |
|---|---|
| `NOVA_SC_BACKEND_MODE` | `hardware` |
| `NOVA_SC_SERIAL_PORT` | `/dev/serial0` |
| `NOVA_SC_SERIAL_BAUD` | `115200` |
| `NOVA_SC_EVIDENCE_ENABLED` | `true` |
| `NOVA_SC_EVIDENCE_ROOT` | `$(pwd)/evidence/soak_runs` |
| `NOVA_SC_EVIDENCE_PHASE_ID` | `PHASE_7_2G_E_F_B` |
| `NOVA_SC_EVIDENCE_TARGET_MINUTES` | `60` |
| `NOVA_SC_EVIDENCE_ROTATE_MINUTES` | `10` |
| `NOVA_SC_EVIDENCE_ROTATE_MB` | `50` |
| `NOVA_SC_EVIDENCE_FLUSH_INTERVAL_SECONDS` | `5` |
| `NOVA_SC_EVIDENCE_QUEUE_SIZE` | `10000` |

## 6. Active Run Health Evidence

Final active `/health` snapshot before backend shutdown:

| Field | Value |
|---|---|
| `stream_id` | `PI_STREAM_20260718T124428Z` |
| `backend_mode` | `hardware` |
| `bridge_status` | `SERIAL_CONNECTED` |
| `serial_port` | `/dev/serial0` |
| `baud` | `115200` |
| `serial_connected` | `true` |
| `hardware_connected` | `true` |
| `malformed_packet_count` | `0` |
| `dropped_packet_count` | `0` |
| `last_esp32_main_packet_utc` | `2026-07-18T13:56:02.260671+00:00` |
| `last_esp32_sub_packet_utc` | `2026-07-18T13:56:02.150336+00:00` |
| `persistent_evidence_enabled` | `true` |
| `persistent_evidence_active` | `true` |
| `evidence_run_id` | `EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7` |
| `evidence_phase_id` | `PHASE_7_2G_E_F_B` |
| `evidence_segments_written` during active snapshot | `8` |
| `persistent_events_written` during active snapshot | `38210` |
| `persistent_events_dropped` | `0` |
| `persistent_writer_errors` | `0` |
| `finalized` during active run | `false` |
| `hash_finalized` during active run | `false` |
| `persistent_replay_validated` | `false` |
| `persistent_replay_validation_status` | `PENDING_SOAK_VALIDATION` |
| `tamper_proof` | `false` |
| `cryptographic_attestation` | `false` |
| `required_next_action` during active run | `COMPLETE_AND_FINALIZE_PERSISTENT_EVIDENCE_RUN` |

The active health evidence shows that the backend was still connected, still receiving hardware telemetry, and still running persistent evidence logging before shutdown. At the active snapshot, finalization had not yet occurred, which was expected because finalization happens after clean backend shutdown.

## 7. Duration Assessment

Run timing evidence:

| Field | Value |
|---|---|
| Run start from evidence run ID | `2026-07-18T12:44:28Z` |
| Final active packet timestamp | `2026-07-18T13:56:02Z` |
| Final active observed runtime | approximately 71 minutes 34 seconds |
| Target duration | 60 minutes |
| Target duration requirement | exceeded |

The target was 60 minutes. The observed active runtime exceeded the target at approximately 71 minutes 34 seconds, so the duration requirement passed.

## 8. Evidence Run Directory

Evidence run directory:

```text
backend/evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
```

Evidence directory listing after clean backend shutdown:

| File | Evidence |
|---|---|
| `events_000001.ndjson` | 7.8 MB |
| `events_000002.ndjson` | 7.8 MB |
| `events_000003.ndjson` | 7.8 MB |
| `events_000004.ndjson` | 7.8 MB |
| `events_000005.ndjson` | 7.8 MB |
| `events_000006.ndjson` | 7.8 MB |
| `events_000007.ndjson` | 7.8 MB |
| `events_000008.ndjson` | 7.8 MB |
| `events_000009.ndjson` | 2.0 MB |
| `integrity.json` | present |
| `manifest.json` | present |
| `summary.json` | present |

Total evidence directory size:

```text
approximately 64 MB
```

## 9. Segment Rotation Result

The persistent evidence writer produced 9 NDJSON evidence segments during the run.

Segment rotation result:

- 8 full NDJSON segments were produced at approximately 7.8 MB each.
- 1 final NDJSON segment was produced at approximately 2.0 MB.
- `manifest.json` was created and finalized after clean backend shutdown.
- `summary.json` was created.
- `integrity.json` was created.

This confirms that segment rotation worked beyond the 5-minute smoke case and across a 1-hour-plus hardware telemetry run.

## 10. Integrity Verification

Integrity verification output:

```text
RUN_DIR: evidence/soak_runs/2026-07-18/PHASE_7_2G_E_F_B_EVIDENCE_20260718T124428Z_dd8e6248-59b0-44a4-8cd1-37c951a7d0f7
segments: 9
total_ndjson_events: 44074
summary_events_written: 44074
writer_errors: 0
persistent_events_dropped: 0
run_root_sha256: 88e6e9f7f51803ab8367ea6eea2dc41cf388286cc2481df4c6eb60ff3ac9c6be
VALIDATION_RESULT: PASS
```

Verification interpretation:

- 9 NDJSON segments were found.
- Total NDJSON event count was `44074`.
- `summary_events_written` was `44074`.
- Total NDJSON line count matched summary persistent event count.
- `writer_errors` remained `0`.
- `persistent_events_dropped` remained `0`.
- `run_root_sha256` was generated.
- SHA-256 file-integrity verification passed.

The SHA-256 evidence supports file-integrity detection for finalized evidence files. It does not establish tamper-proof storage or cryptographic attestation.

## 11. Validation Result Matrix

| Validation Item | Result |
|---|---|
| Hardware mode active | PASS |
| Serial bridge connected | PASS |
| Hardware telemetry active | PASS |
| Evidence logging enabled | PASS |
| Evidence logging active | PASS |
| 60-minute target exceeded | PASS |
| NDJSON segment rotation | PASS |
| 9 NDJSON segments produced | PASS |
| `manifest.json` finalized | PASS |
| `summary.json` created | PASS |
| `integrity.json` created | PASS |
| SHA-256 verification passed | PASS |
| `run_root_sha256` generated | PASS |
| Event count consistency verified | PASS |
| `persistent_events_dropped = 0` | PASS |
| `writer_errors = 0` | PASS |
| Frontend report export | NOT CAPTURED |
| Persistent replay validation | NOT CLAIMED |
| Tamper-proof evidence | NOT CLAIMED |
| Cryptographic attestation | NOT CLAIMED |

## 12. Engineering Interpretation

Phase 7.2G-E-F-B matters because it validates backend evidence persistence over a longer real-hardware telemetry run.

The run extends the prior 5-minute smoke validation by demonstrating that the persistent evidence writer can continue operating beyond the 60-minute target, rotate NDJSON segments, and finalize run metadata after clean backend shutdown. The final evidence includes 9 NDJSON segments, manifest metadata, summary metadata, integrity metadata, and a run-root SHA-256.

This also demonstrates that backend evidence storage can preserve raw NDJSON evidence independently of frontend browser state. The missing frontend report export is a documentation caveat, but it does not invalidate the backend filesystem evidence, because the backend evidence artifacts were finalized and independently verified.

This phase prepares the platform for later persistent evidence replay validation. It does not perform or claim that replay validation.

## 13. Safety Boundary

This was a backend evidence runtime validation and documentation phase.

Safety boundary statements:

- No firmware was modified.
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
- No frontend start/stop controls were added.

This phase does not enable or validate motors, servos, steppers, pumps, valves, relays, heaters, GPIO control, PCA9685 PWM output, or FRAM checkpoint storage.

## 14. Claims Allowed After This Phase

The following claims are supported by the provided evidence:

- 1-hour-plus hardware-mode persistent evidence soak validation passed.
- Backend persistent evidence logging produced finalized NDJSON evidence over a long run.
- 9 NDJSON segments were generated.
- 44,074 NDJSON events were preserved.
- `manifest.json`, `summary.json`, and `integrity.json` were generated.
- SHA-256 file-integrity verification passed.
- `run_root_sha256` was generated.
- No writer errors occurred.
- No persistent event drops occurred.
- Frontend report export was not captured, but backend evidence validation passed.

## 15. Claims Not Allowed After This Phase

The following claims are not supported by this phase:

- Persistent replay validated.
- Tamper-proof evidence storage.
- Cryptographic attestation.
- Production-grade evidence archive.
- FRAM checkpoint validation.
- Actuator/control readiness.
- 6-hour soak validation.
- 24-hour soak validation.
- Motor readiness.
- Servo readiness.
- Stepper readiness.
- Pump readiness.
- Valve readiness.
- Relay readiness.
- Heater readiness.
- GPIO control readiness.
- PCA9685 PWM output readiness.

## 16. Final Status

```text
PHASE_7_2G_E_F_B_1_HOUR_PERSISTENT_EVIDENCE_SOAK_VALIDATION: PASS_WITH_FRONTEND_REPORT_EXPORT_NOT_CAPTURED
```

## 17. Next Step

Proceed to Phase 7.2G-E-G — Persistent Evidence Replay Validation Planning.
