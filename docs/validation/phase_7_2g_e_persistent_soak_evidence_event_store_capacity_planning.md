# Phase 7.2G-E — Persistent Soak Evidence / Event-Store Capacity Planning

## 1. Executive Summary

This document locks the Phase 7.2G-E architecture direction for NOVA SC persistent long-duration soak evidence storage and event-store capacity planning.

Phase 7.2G-D completed a 1-hour soak without reproducing the prior approximately 30-second heartbeat-gap failure. However, the soak result remained `WARNING` because the bounded frontend raw event store rolled over:

- `raw_event_store_capacity`: `20000`
- `raw_event_store_current_events`: `20000`
- `raw_event_store_dropped_old_events`: `49807`
- `raw_event_replay_complete`: `false`
- `replay_limitation_reason`: Raw event replay is partial because older bounded event records were dropped; live soak summary counters are preserved.

Architecture decision:

```text
Use Raspberry Pi backend append-only persistent evidence logging
as the primary full-soak evidence store.
```

The recommended V1 evidence format is append-only NDJSON event segments with a run manifest, summary file, and SHA-256 integrity metadata. The frontend bounded event store remains useful for live supervision, but it should not be the only long-duration raw evidence store.

MAIN ESP32-S3 SPI FRAM is not selected as primary full-soak evidence storage. FRAM remains a future secondary embedded checkpoint / black-box storage mechanism after a separate FRAM validation phase.

This is an architecture/planning lock only. No runtime evidence writer is implemented by this document.

## 2. Objective

The objective of Phase 7.2G-E is to plan persistent long-duration soak evidence storage and event-store capacity strategy for NOVA SC.

The planning goals are:

- Preserve complete long-duration raw evidence beyond frontend browser memory limits.
- Preserve evidence across frontend refresh or browser close.
- Support future 1-hour, 6-hour, and 24-hour soak validation runs.
- Preserve backend accepted/rejected packet disposition and backend UTC context.
- Provide run manifests, segment metadata, and hash-based file integrity checks.
- Avoid introducing a database dependency for V1.
- Keep actuator/control/PWM/GPIO behavior untouched.
- Keep FRAM firmware behavior untouched.

## 3. Problem Statement

The current bounded frontend event store is suitable for live supervision but not sufficient as the only long-duration raw evidence store.

During Phase 7.2G-D, live counters were preserved, but raw replay became partial because old events were dropped. Longer soaks will increase this problem.

Phase 7.2G-D evidence:

| Field | Value |
|---|---|
| soak_elapsed_seconds | 3696 |
| target_duration_minutes | 60 |
| verdict | WARNING |
| failure_reasons | [] |
| warning_reasons | Raw event replay partial; live soak summary counters preserved |
| raw_event_replay_complete | false |
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 49807 |
| replay_limitation_reason | Raw event replay is partial because older bounded event records were dropped; live soak summary counters are preserved. |
| total_packets | 32892 |
| packets_per_minute | 533.96 |

The observed issue is not a heartbeat-gap failure. It is a raw evidence retention limitation in the bounded frontend event store.

## 4. Evidence From Phase 7.2G-D

Source phase:

| Field | Value |
|---|---|
| Source phase | Phase 7.2G-D — Heartbeat-Gap / Soak Stability Diagnosis |
| Result | VALIDATED_WITH_REPLAY_WARNING |
| 1-hour soak outcome | Completed without reproducing the previous heartbeat-gap failure |
| Remaining warning | Bounded event-store replay truncation |

Heartbeat-gap evidence:

| Metric | Value |
|---|---:|
| link_pi_main max heartbeat gap | 1019 ms |
| link_main_sub max heartbeat gap | 864 ms |
| link_pi_main dropout_count | 0 |
| link_main_sub dropout_count | 0 |

Reset evidence:

| Node | Reset Count |
|---|---:|
| esp32_main | 0 |
| esp32_sub | 0 |
| pi_gateway | 0 |

Packet integrity evidence:

| Counter | Value |
|---|---:|
| duplicate_packets | 0 |
| out_of_order_packets | 0 |
| sequence_gaps | 0 |
| sequence_resets | 0 |
| missed_packets | 0 |
| stream_switches | 0 |

Engineering interpretation:

The 1-hour soak stability signal was clean for heartbeat gaps, dropouts, resets, packet integrity, and stream continuity. The warning came from bounded raw replay truncation, not from a telemetry health failure.

## 5. Architecture Decision

Primary storage:

- Raspberry Pi backend filesystem
- Append-only NDJSON event segments
- `manifest.json`
- `summary.json`
- `integrity.json` or manifest-integrated SHA-256 hashes

Secondary future storage:

- MAIN ESP32-S3 SPI FRAM
- Not used for full raw soak logs
- Reserved for a later FRAM validation phase
- Intended future use: compact embedded black-box/checkpoint storage only

Architecture decision:

```text
Backend persistent logging is the primary full-soak evidence mechanism.
Frontend bounded event storage remains a live-supervision cache.
MAIN SPI FRAM remains a future compact embedded checkpoint mechanism.
```

## 6. Why Backend Persistent Logging Is Required

Backend persistent logging is required because:

- The backend receives the accepted telemetry stream.
- The backend owns trusted UTC timestamp context.
- The backend can write to disk without browser memory limits.
- Backend evidence survives frontend refresh or close.
- The backend can preserve full evidence for long-duration validation.
- The backend can compute run manifests, segment hashes, and integrity metadata.
- The backend can record accepted/rejected packet disposition and writer errors.

The Raspberry Pi backend is therefore the correct V1 location for full-soak evidence capture.

## 7. Why Frontend Event-Store Expansion Alone Is Not Enough

Expanding the frontend event store alone is not sufficient because:

- Browser memory is limited.
- Refresh or close loses browser-only evidence.
- `20000` events already overflowed during a 1-hour soak.
- Longer 6-hour and 24-hour soaks will overflow again.
- Increasing the number only delays rollover.
- Frontend memory does not provide strong auditability.
- Frontend memory does not provide durable hash integrity.

The frontend event store should remain optimized for live supervision and UI responsiveness. It should not be treated as the primary long-duration raw evidence archive.

## 8. Why MAIN SPI FRAM Is Not Primary Soak Evidence Storage

MAIN SPI FRAM is not selected as primary full-soak evidence storage because:

- FRAM is connected to MAIN ESP32-S3, not directly to the Pi backend.
- FRAM is useful for compact embedded persistent state.
- FRAM is not suitable for full raw long-duration telemetry logs.
- Typical FRAM capacity is much smaller than full JSON/NDJSON soak evidence requirements.
- FRAM cannot naturally store backend accepted/rejected packet disposition.
- FRAM cannot naturally store backend received UTC.
- FRAM cannot naturally store report-side replay metadata.
- FRAM is currently not validated and must remain a future phase item.

FRAM future use:

- Boot counter
- Reset counter
- Brownout counter
- Last reset reason snapshot
- Last RTC sync session ID hash
- Last RTC readback delta summary
- Compact heartbeat-gap record
- Compact fault/event ring buffer
- Small black-box checkpoint records

FRAM is therefore a future secondary embedded checkpoint mechanism, not the primary full-soak evidence store.

## 9. Recommended Persistent Evidence Format

Recommended V1 format:

```text
NDJSON
```

Format properties:

- One accepted telemetry event per line
- Append-only
- Recoverable after crash
- Human inspectable
- Easy to hash
- Easy to compress
- No database dependency for V1

Each NDJSON line should represent a complete persisted telemetry evidence event, including the backend-side context required for later replay and validation. The exact line schema should be locked in the implementation planning phase before code is written.

## 10. Recommended Directory Structure

Recommended directory structure:

```text
backend/evidence/soak_runs/
  YYYY-MM-DD/
    <phase_id>_<run_id>/
      manifest.json
      events_000001.ndjson
      events_000002.ndjson
      summary.json
      integrity.json
```

Directory intent:

- Date partitioning keeps evidence runs navigable.
- `<phase_id>_<run_id>` gives each run a unique evidence boundary.
- Segment files preserve append-only raw event evidence.
- `manifest.json` records run metadata and segment metadata.
- `summary.json` records finalized run summary metrics.
- `integrity.json` records hashes if hashes are not embedded directly in the manifest.

## 11. Manifest Schema Planning

Manifest fields to plan:

- `phase_id`
- `run_id`
- `stream_id`
- `backend_git_commit`
- `frontend_git_commit` if available
- `start_time_utc`
- `end_time_utc`
- `target_duration_minutes`
- `backend_mode`
- `serial_port`
- `serial_baud`
- `hardware_connected`
- `transport_kind`
- `transport_simulated`
- `packet_count`
- `accepted_events`
- `rejected_events`
- `persistent_events_written`
- `persistent_events_dropped`
- `writer_errors`
- `segment_count`
- `segment_filenames`
- `segment_start_timestamps`
- `segment_end_timestamps`
- `segment_start_sequence_numbers`
- `segment_end_sequence_numbers`
- `segment_sha256_hashes`
- `disk_free_start_bytes`
- `disk_free_end_bytes`
- `finalized`

Manifest purpose:

- Identify the run.
- Identify the software/hardware context.
- Identify whether the run finalized cleanly.
- Identify the evidence files that belong to the run.
- Identify whether persistent writer errors or dropped persistent events occurred.
- Support later report export and validation replay.

## 12. Segment Rotation Planning

Recommended rotation policy:

```text
Rotate every 10 minutes
or rotate every 50 MB
whichever comes first.
```

Rotation goals:

- Keep individual evidence files manageable.
- Limit data loss scope if a segment is corrupted.
- Make hashing and inspection practical.
- Allow long-duration runs to accumulate evidence without a single very large file.

The implementation plan should define exact rotation timing, byte-size measurement, and finalization behavior before writing runtime code.

## 13. Integrity and Hashing Plan

Integrity plan:

- Compute SHA-256 per segment.
- Store hashes in `manifest.json` or `integrity.json`.
- Optionally compute a run-level root hash from ordered segment hashes.
- Record whether each segment hash was finalized.
- Record writer errors separately from packet validation errors.

Claim boundary:

- This provides file integrity detection.
- This does not provide tamper-proof storage.
- This should not be described as cryptographic attestation.

Correct integrity claim:

```text
Segment SHA-256 hashes can detect evidence file changes after finalization.
```

Claims not made:

- Tamper-proof storage
- Chain-of-custody guarantee
- Cryptographic attestation
- Hardware-rooted trust

## 14. Report Integration Plan

Future validation reports should include:

- `persistent_evidence_enabled`
- `evidence_run_id`
- `evidence_manifest_path`
- `evidence_segments_written`
- `persistent_events_written`
- `persistent_events_dropped`
- `persistent_writer_errors`
- `persistent_replay_complete`
- `persistent_hash_available`
- `frontend_raw_replay_complete`
- `frontend_event_store_dropped_old_events`

Correct future report claim:

```text
Frontend raw replay may be partial.
Backend persistent replay can be complete if evidence writer is enabled and finalized.
```

Report integration should clearly distinguish:

- Frontend bounded event replay completeness
- Backend persistent evidence completeness
- Live summary counters
- Persistent writer errors
- Packet validation errors
- Hash availability

## 15. Safety Boundary

This phase is documentation/planning only.

No actuator readiness is claimed.

No command/control behavior is enabled.

This document does not enable or document activation of:

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

This document does not modify backend code, frontend code, firmware, RTC sync logic, telemetry parsing, report generation code, command/control paths, actuator behavior, PWM behavior, GPIO behavior, PCA9685 behavior, or FRAM firmware behavior.

## 16. Implementation Phasing

Recommended implementation phasing:

| Phase | Scope |
|---|---|
| Phase 7.2G-E-A | Architecture lock document only |
| Phase 7.2G-E-B | Backend evidence writer implementation plan |
| Phase 7.2G-E-C | Backend NDJSON writer implementation |
| Phase 7.2G-E-D | Manifest finalization and hash validation |
| Phase 7.2G-E-E | 1-hour soak using persistent backend evidence |
| Later separate phase | MAIN SPI FRAM validation and compact black-box checkpoint design |

Phasing principle:

Backend persistent evidence should be implemented and validated before longer soak claims depend on full raw replay completeness.

FRAM validation should remain separate from backend persistent evidence implementation.

## 17. Validation Criteria

Future implementation should be considered ready only when:

- Persistent evidence survives frontend refresh.
- Persistent evidence survives frontend event-store rollover.
- Every run has a unique evidence run ID.
- Segment files are created.
- Manifest is created.
- Segment hashes are computed.
- Writer errors are visible.
- Persistent dropped event count is visible.
- Final report references persistent evidence path.
- No actuator/control/PWM/GPIO behavior is touched.

Additional validation should confirm:

- Persistent evidence can be replayed independently of the frontend bounded event store.
- A partially finalized run is detectable.
- A finalized run records segment count and segment hashes.
- Persistent writer failures are visible in summary/report evidence.

## 18. Limitations

Known limitations of this planning phase:

- This document does not implement the backend evidence writer.
- This document does not change frontend event-store capacity.
- This document does not modify report generation code.
- This document does not validate persistent evidence replay.
- This document does not validate FRAM.
- This document does not implement FRAM checkpoint records.
- This document does not prove 6-hour or 24-hour soak readiness.
- This document does not enable actuator/control/PWM/GPIO behavior.

Evidence limitation from Phase 7.2G-D:

- Raw event replay was partial due bounded event-store capacity.
- Live soak summary counters were preserved.
- The soak verdict was `WARNING`, not `PASS`, because raw replay was partial.

## 19. Final Status

```text
PHASE_7_2G_E_PERSISTENT_SOAK_EVIDENCE_EVENT_STORE_CAPACITY_PLANNING: ARCHITECTURE_LOCK_READY
```

Final architecture position:

- Raspberry Pi backend append-only persistent evidence logging is selected as the primary full-soak evidence store.
- Frontend bounded event storage remains live-supervision storage, not primary long-duration evidence storage.
- MAIN SPI FRAM remains future secondary compact checkpoint / embedded black-box storage only.
- NDJSON segment files, manifest metadata, summary evidence, and SHA-256 file integrity metadata are the recommended V1 direction.
- No runtime implementation is claimed by this document.

## 20. Next Step

Next phase:

```text
Phase 7.2G-E-B — Backend Persistent Evidence Writer Implementation Plan
```

The next phase should define the backend writer insertion point, event schema, lifecycle, finalization behavior, error handling, validation commands, and safety checks before implementation begins.
