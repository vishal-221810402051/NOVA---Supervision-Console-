# Phase 7.2G-E-B — Backend Persistent Evidence Writer Implementation Plan

## 1. Executive Summary

This document defines the implementation plan for a future NOVA SC backend persistent evidence writer. It is a planning document only. It does not implement the writer.

The prior architecture lock selected Raspberry Pi backend append-only persistent evidence logging as the primary full-soak evidence store. The recommended format is NDJSON segment files with a run manifest, summary, and SHA-256 file integrity metadata.

The current backend telemetry path was inspected. The safest future insertion point is after hardware packets are validated and normalized, and before or alongside WebSocket broadcast. In the current repository, that means the likely integration area is between:

- `backend/serial_bridge.py` — `SerialBridge._run()`, after `normalize_hardware_packet(...)`
- `backend/hardware_stream_manager.py` — `HardwareStreamManager._run()` / `_broadcast(...)`

The preferred future design is to give the evidence writer its own non-blocking queue so disk writes never block serial reading or WebSocket broadcast.

## 2. Objective

The objective of Phase 7.2G-E-B is to plan backend persistent evidence writer implementation before writing code.

The future writer should:

- Persist accepted telemetry evidence on the Raspberry Pi backend filesystem.
- Write append-only NDJSON event segments.
- Record backend received UTC context.
- Record stream/source/sequence metadata.
- Track writer errors.
- Track persistent events written and dropped.
- Rotate segment files.
- Finalize a manifest and summary on stop.
- Preserve evidence across frontend refresh, close, and frontend event-store rollover.

This phase does not implement the writer, create Python modules, create tests, or modify runtime behavior.

## 3. Prior Architecture Decision

Prior phase:

| Field | Value |
|---|---|
| Prior phase | Phase 7.2G-E — Persistent Soak Evidence / Event-Store Capacity Planning |
| Result | ARCHITECTURE_LOCK_READY |
| Primary evidence storage decision | Raspberry Pi backend append-only persistent evidence logging |
| Recommended format | NDJSON segments with manifest, summary, and SHA-256 integrity metadata |
| Frontend bounded event store | Live-supervision cache only |
| MAIN ESP32-S3 SPI FRAM | Future compact checkpoint / black-box storage only |

Architecture carried forward:

```text
Backend persistent logging is primary for full-soak evidence.
Frontend bounded event storage remains live supervision cache.
MAIN SPI FRAM remains future compact checkpoint storage only.
```

## 4. Current Problem

Phase 7.2G-D motivates this implementation plan.

Evidence from Phase 7.2G-D:

| Field | Value |
|---|---|
| 1-hour soak completed | true |
| Previous heartbeat-gap failure reproduced | false |
| Soak verdict | WARNING |
| Warning cause | Raw frontend replay was partial |
| raw_event_store_capacity | 20000 |
| raw_event_store_current_events | 20000 |
| raw_event_store_dropped_old_events | 49807 |
| raw_event_replay_complete | false |
| replay limitation | Raw event replay is partial because older bounded event records were dropped; live soak summary counters are preserved. |
| failure_reasons | [] |
| link_pi_main max heartbeat gap | 1019 ms |
| link_main_sub max heartbeat gap | 864 ms |
| packet integrity counters | clean |

The current bounded frontend event store is suitable for live supervision but not sufficient as the only long-duration raw evidence store. Longer 6-hour or 24-hour soaks will overflow browser memory-backed event history again.

The future solution should persist full-soak evidence at the Raspberry Pi backend.

## 5. Backend Insertion Point Investigation

Backend files inspected:

| File | Current role |
|---|---|
| `backend/main.py` | FastAPI app startup/shutdown, backend mode/env configuration, hardware object construction, WebSocket endpoint |
| `backend/serial_bridge.py` | Serial hardware ownership, UART line read, JSON parsing, hardware validation, normalization, output queue write |
| `backend/hardware_validator.py` | Raw hardware JSON parsing and schema validation |
| `backend/hardware_normalizer.py` | Converts validated hardware packets into canonical telemetry packets with stream/source/sequence metadata |
| `backend/protocol.py` | Packet type mapping and canonical packet metadata builders |
| `backend/hardware_stream_manager.py` | Consumes normalized hardware packet queue and broadcasts packets to WebSocket subscribers |
| `backend/gateway_state.py` | Gateway stream state, sequence counters, serial health counters |
| `backend/rtc_sync_service.py` | One-shot RTC sync result wait/correlation path; not the primary evidence writer insertion point |

Candidate functions/classes found:

| Candidate | File | Reason |
|---|---|---|
| `SerialBridge._run()` | `backend/serial_bridge.py` | Reads serial lines, validates packets, normalizes accepted packets, then queues normalized packets |
| `SerialBridge._emit_rejection(...)` | `backend/serial_bridge.py` | Emits integrity telemetry for malformed/schema-rejected packets |
| `validate_raw_hardware_packet(...)` | `backend/hardware_validator.py` | Determines valid vs rejected raw hardware packets |
| `normalize_hardware_packet(...)` | `backend/hardware_normalizer.py` | Assigns canonical event type and metadata through `build_packet_metadata(...)` |
| `build_packet_metadata(...)` | `backend/protocol.py` | Assigns `stream_id`, `global_sequence_number`, source sequence, received UTC, and canonical metadata |
| `HardwareStreamManager._run()` | `backend/hardware_stream_manager.py` | Consumes normalized packets from `source_queue` |
| `HardwareStreamManager._broadcast(...)` | `backend/hardware_stream_manager.py` | Fans packets out to subscriber queues |
| `startup()` / `shutdown()` | `backend/main.py` | Future owner construction/start/stop lifecycle |

Safest candidate insertion point:

```text
After normalize_hardware_packet(...) returns a canonical packet,
before or alongside HardwareStreamManager broadcast,
using a dedicated non-blocking evidence writer queue.
```

The exact implementation hook remains to be finalized in Phase 7.2G-E-C. Based on current structure, the cleanest future design is likely:

- Create the writer in `backend/main.py` startup.
- Inject the writer or writer queue into `HardwareStreamManager`.
- In `HardwareStreamManager._run()`, enqueue a copy of each normalized packet to the writer queue before `_broadcast(packet)`.

This keeps disk I/O out of `SerialBridge._run()` and avoids blocking serial reads.

Rejected primary insertion choices:

- Raw serial bytes in `SerialBridge._run()` before validation: not primary evidence because bytes are untrusted and lack canonical metadata/disposition.
- Direct disk writes inside `SerialBridge._run()`: risks blocking the serial read loop.
- Direct disk writes inside `_broadcast(...)`: risks blocking WebSocket broadcast.

## 6. Proposed Writer Ownership

Proposed future owner:

```text
Backend application lifecycle owns the evidence writer.
```

Planned ownership model:

- `backend/main.py` reads evidence configuration.
- `backend/main.py` constructs the evidence writer only when enabled.
- `backend/main.py` starts the writer during hardware backend startup.
- `backend/main.py` stops/finalizes the writer during shutdown.
- `HardwareStreamManager` receives an optional writer enqueue callback or queue.
- The writer owns its own async task and bounded queue.

Ownership rules:

- Backend-only.
- Explicitly enabled by configuration.
- Disabled by default unless a soak/evidence run is started.
- Non-blocking relative to serial read and WebSocket broadcast paths.
- Writer failures are counted and surfaced; they do not crash telemetry ingestion unless a later phase explicitly defines fail-closed behavior.

## 7. Evidence Run Lifecycle

Planned states:

| State | Meaning |
|---|---|
| IDLE | Writer is configured but no active evidence run exists |
| STARTING | Run ID and directory are being created |
| ACTIVE | Events are being accepted into writer queue and persisted |
| ROTATING_SEGMENT | Current NDJSON segment is closing and a new one is opening |
| FINALIZING | Current segment, hashes, summary, and manifest are being finalized |
| FINALIZED | Run finalized cleanly with `finalized=true` |
| ERROR | Writer encountered an error requiring operator visibility |

Run start behavior:

- Create evidence run ID.
- Create run directory.
- Create initial manifest.
- Record `start_time_utc`.
- Record backend mode.
- Record serial port and baud.
- Record active stream ID if available.
- Record target duration if provided.
- Open `events_000001.ndjson`.

Run active behavior:

- For each accepted telemetry event, serialize one NDJSON line.
- Avoid blocking the telemetry path.
- Flush periodically.
- Rotate on time or size threshold.
- Count writer errors.
- Preserve evidence even if frontend disconnects.

Run finalization behavior:

- Close current segment.
- Compute SHA-256 per segment.
- Write `summary.json`.
- Write finalized manifest.
- Mark `finalized=true`.
- Record `end_time_utc`.
- Record `persistent_events_written`.
- Record `persistent_events_dropped`.
- Record `writer_errors`.
- Record segment hashes.

Crash / interrupted run behavior:

- A partially finalized run must be detectable.
- `finalized=false` should indicate incomplete finalization.
- Existing segments should remain inspectable.
- Future implementation should avoid deleting partial evidence automatically.

## 8. NDJSON Event Schema Plan

Planned NDJSON event schema:

| Field | Purpose |
|---|---|
| `schema_version` | Evidence event schema version |
| `evidence_run_id` | Unique persistent evidence run ID |
| `phase_id` | Validation phase associated with run |
| `persisted_at_utc` | UTC timestamp when writer persisted the line |
| `backend_received_utc` | Backend packet received timestamp from canonical packet metadata |
| `stream_id` | Active stream ID |
| `source_node_id` | Canonical packet source node |
| `source_sequence_number` | Source packet sequence number |
| `global_sequence_number` | Backend global sequence number |
| `event_type` | Canonical telemetry event type |
| `disposition` | Event disposition, if available |
| `severity` | Packet/event severity, if available |
| `packet` | Full canonical telemetry packet |
| `validation_context` | Validation/disposition context available at enqueue time |
| `writer_context` | Writer segment/index/queue context |

Planned principles:

- One accepted telemetry event per line.
- Do not store raw untrusted serial bytes as primary validation evidence.
- Preserve the full canonical packet.
- Preserve backend received UTC.
- Preserve stream/source/sequence metadata.
- Keep schema explicit and versioned.

## 9. Manifest Schema Plan

Planned manifest fields:

- `schema_version`
- `phase_id`
- `evidence_run_id`
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
- `segment_rotation_policy`
- `packet_count`
- `accepted_events`
- `rejected_events`
- `persistent_events_written`
- `persistent_events_dropped`
- `writer_errors`
- `segment_count`
- `segments`
- `disk_free_start_bytes`
- `disk_free_end_bytes`
- `finalized`

Planned segment fields:

- `filename`
- `index`
- `start_time_utc`
- `end_time_utc`
- `first_global_sequence_number`
- `last_global_sequence_number`
- `event_count`
- `byte_count`
- `sha256`
- `finalized`

Manifest role:

- Describe the run.
- Describe environment and configuration.
- Describe evidence segment files.
- Identify whether finalization completed.
- Surface persistent writer errors and dropped persistent events.
- Support future report integration and independent replay.

## 10. Segment Rotation Plan

Recommended V1 rotation:

```text
Rotate every 10 minutes
or every 50 MB
whichever comes first.
```

Rotation plan:

- Track segment open time.
- Track approximate or exact bytes written.
- Rotate when either threshold is reached.
- Finalize metadata for the closing segment.
- Open the next `events_00000N.ndjson` file.
- Continue preserving monotonic segment indexes.

Rotation must not block serial ingestion or WebSocket broadcast. Any expensive file operations should run in the writer task.

## 11. Hashing and Integrity Plan

Hashing plan:

- Compute SHA-256 per finalized segment.
- Store hashes in `manifest.json` or `integrity.json`.
- Optionally compute a run root hash from ordered segment hashes.
- Record hash availability per segment.
- Record whether segment finalization completed.

Claim boundary:

- Claim only file integrity detection.
- Do not claim tamper-proof storage.
- Do not claim cryptographic attestation.
- Do not claim chain-of-custody guarantees.

Correct claim:

```text
Segment SHA-256 hashes can detect evidence file changes after finalization.
```

## 12. Writer Error Handling Plan

Writer error categories to plan:

- Run directory creation failed.
- Manifest write failed.
- Segment open failed.
- NDJSON serialization failed.
- Segment write failed.
- Flush failed.
- Rotation failed.
- Hash computation failed.
- Summary write failed.
- Final manifest write failed.
- Writer queue overflow.

Error handling principles:

- Do not block serial read loop.
- Do not block WebSocket broadcast path.
- Increment `writer_errors`.
- Increment `persistent_events_dropped` when the writer queue cannot accept an event.
- Keep existing telemetry ingestion alive where possible.
- Surface writer health in future gateway/report evidence.
- Preserve partial evidence rather than deleting it automatically.

Queue policy recommendation:

- Use a bounded queue to protect memory.
- Prefer dropping persistent evidence records with visible counters over blocking telemetry ingestion.
- Record persistent drops separately from packet drops and schema rejections.

## 13. Report Integration Plan

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

Report integration should distinguish:

- Frontend bounded event replay completeness
- Backend persistent evidence completeness
- Live summary counters
- Persistent writer errors
- Persistent dropped evidence events
- Packet validation errors
- Segment hash availability

Correct future report claim:

```text
Frontend raw replay may be partial.
Backend persistent replay can be complete if evidence writer is enabled and finalized.
```

## 14. Configuration Plan

Mandatory planned configuration settings from the phase brief:

| Setting | Default / Planned Value | Purpose |
|---|---|---|
| `NOVA_SC_EVIDENCE_ENABLED` | `false` by default | Enables persistent evidence writer |
| `NOVA_SC_EVIDENCE_ROOT` | `backend/evidence/soak_runs` | Evidence storage root |
| `NOVA_SC_EVIDENCE_ROTATE_MINUTES` | `10` | Time-based segment rotation |
| `NOVA_SC_EVIDENCE_ROTATE_MB` | `50` | Size-based segment rotation |

Additional settings to consider during implementation planning:

| Setting | Purpose |
|---|---|
| `NOVA_SC_EVIDENCE_PHASE_ID` | Explicit phase label for run directory and manifest |
| `NOVA_SC_EVIDENCE_TARGET_MINUTES` | Optional target duration metadata |
| `NOVA_SC_EVIDENCE_QUEUE_SIZE` | Bounded writer queue size |
| `NOVA_SC_EVIDENCE_FLUSH_SECONDS` | Periodic flush interval |

The attachment ended mid-bullet after `NOVA_SC_EVIDENCE`; therefore the additional settings above are proposed planning candidates, not provided evidence values.

## 15. File and Module Plan for Future Implementation

Future files likely to add:

| File | Purpose |
|---|---|
| `backend/evidence_writer.py` | Persistent evidence writer class, lifecycle, queue, segment writing, manifest finalization |
| `backend/test_evidence_writer.py` | Unit tests for writer lifecycle, rotation, manifest, error counters, hashing |

Future files likely to modify:

| File | Planned change |
|---|---|
| `backend/main.py` | Read evidence configuration; create/start/stop writer; inject writer enqueue hook into hardware stream path |
| `backend/hardware_stream_manager.py` | Optionally accept evidence enqueue callback/queue; enqueue normalized packets without blocking broadcast |
| `backend/protocol.py` | Only if a future gateway health/report field needs persistent writer health packet metadata |

Files not expected to modify for the writer:

| File | Reason |
|---|---|
| `backend/serial_bridge.py` | Avoid disk I/O in serial read loop unless later design chooses a narrow enqueue-only hook |
| `backend/hardware_validator.py` | Packet validation logic should remain unchanged |
| `backend/hardware_normalizer.py` | Packet normalization logic should remain unchanged unless schema metadata must be exposed |
| `backend/rtc_sync_service.py` | RTC sync behavior is outside persistent evidence writer scope |
| Firmware files | Persistent backend evidence is backend-only |
| Frontend files | Initial writer implementation should not require frontend changes |

Safest future insertion:

```text
main.py owns writer lifecycle.
hardware_stream_manager.py receives optional non-blocking evidence enqueue callback.
hardware_stream_manager.py enqueues accepted normalized packets before broadcast.
```

## 16. Validation Plan for Future Implementation

Future implementation validation should include:

- Unit test writer start/finalize lifecycle.
- Unit test manifest creation.
- Unit test one-event NDJSON append.
- Unit test segment rotation by time threshold.
- Unit test segment rotation by byte threshold.
- Unit test SHA-256 hash computation.
- Unit test writer queue overflow increments `persistent_events_dropped`.
- Unit test writer error increments `writer_errors`.
- Unit test interrupted run leaves `finalized=false`.
- Backend compile check.
- Backend pytest run.
- Hardware-mode dry run with short evidence session.
- Frontend refresh during evidence run confirms backend evidence persists.
- Event-store rollover confirms backend evidence remains complete.

Future validation commands to plan:

```text
python -m compileall backend
backend\.venv\Scripts\python.exe -m pytest
git diff --check
git status --short
```

Runtime validation checklist:

- Start backend in hardware mode.
- Start a short evidence run.
- Confirm `manifest.json` exists.
- Confirm `events_000001.ndjson` exists.
- Confirm events append while telemetry flows.
- Refresh frontend and confirm evidence continues.
- Stop/finalize run.
- Confirm `finalized=true`.
- Confirm segment SHA-256 exists.
- Confirm `persistent_events_written > 0`.
- Confirm `persistent_events_dropped == 0` for nominal run.
- Confirm WebSocket telemetry remains connected.
- Confirm no packet integrity counters regress.

## 17. Safety Boundary

This phase is documentation / implementation planning only.

This document does not modify:

- Backend code
- Frontend code
- Firmware
- RTC sync logic
- Telemetry parsing
- Report generation code
- Command/control paths
- Actuator behavior
- PWM behavior
- GPIO behavior
- PCA9685 behavior
- FRAM firmware behavior

The future writer must not:

- Write to UART.
- Send commands to MAIN or SUB.
- Touch actuator/control/PWM/GPIO behavior.
- Modify packet validation rules.
- Modify RTC sync behavior.
- Block serial read loop.
- Block WebSocket broadcast path.

## 18. FRAM Boundary

FRAM remains future secondary checkpoint storage only.

FRAM is not primary full-soak evidence storage because:

- It is connected to MAIN ESP32-S3, not directly to the Pi backend.
- It is better suited to compact embedded checkpoint records.
- It is not suitable for full raw JSON/NDJSON long-duration telemetry logs.
- It cannot naturally store backend accepted/rejected packet disposition.
- It cannot naturally store backend received UTC.
- It cannot naturally store report-side replay metadata.
- It remains unvalidated and must stay in a separate future phase.

Possible future FRAM checkpoint uses:

- Boot counter
- Reset counter
- Brownout counter
- Last reset reason snapshot
- Last RTC sync session ID hash
- Last RTC readback delta summary
- Compact heartbeat-gap record
- Compact fault/event ring buffer
- Small black-box checkpoint records

No FRAM firmware behavior is changed by this plan.

## 19. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Disk writes block telemetry path | Use a dedicated writer task and bounded queue |
| Writer queue overflows | Increment `persistent_events_dropped`; do not block serial ingestion |
| Segment grows too large | Rotate every 10 minutes or 50 MB |
| Backend exits before finalization | Leave `finalized=false`; preserve inspectable partial segments |
| Hash computation is slow | Compute in finalization path, outside serial read loop |
| Disk fills during long soak | Record disk free start/end; surface writer errors and dropped persistent events |
| Frontend replay is partial | Report frontend replay separately from backend persistent replay |
| Evidence claims are overstated | Claim file integrity detection only; do not claim tamper-proof storage |
| FRAM scope creeps into implementation | Keep FRAM as future secondary checkpoint planning only |

## 20. Implementation Phasing

Recommended phasing:

| Phase | Scope |
|---|---|
| Phase 7.2G-E-B | Backend persistent evidence writer implementation plan |
| Phase 7.2G-E-C | Backend NDJSON writer implementation |
| Phase 7.2G-E-D | Manifest finalization and hash validation |
| Phase 7.2G-E-E | 1-hour soak using persistent backend evidence |
| Later separate phase | MAIN SPI FRAM validation and compact black-box checkpoint design |

Phase 7.2G-E-C should remain backend-only unless a separate frontend/report integration phase is explicitly approved.

## 21. Final Status

```text
PHASE_7_2G_E_B_BACKEND_PERSISTENT_EVIDENCE_WRITER_IMPLEMENTATION_PLAN: READY_FOR_REVIEW
```

Planning conclusion:

- The preferred future writer owner is the backend application lifecycle.
- The safest packet capture point is after normalization and metadata assignment.
- The future writer should use a non-blocking queue and append-only NDJSON segments.
- Manifest, summary, rotation, and hash finalization should be implemented before long-duration validation depends on persistent replay.
- No runtime writer is implemented by this document.

## 22. Next Step

Next phase:

```text
Phase 7.2G-E-C — Backend NDJSON Writer Implementation
```

The next phase should implement the backend-only writer behind disabled-by-default configuration, with tests for lifecycle, segment creation, manifest creation, rotation, hashing, writer errors, and partial-run detectability.
