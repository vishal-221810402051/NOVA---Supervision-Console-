# NOVA SC - Supervision Console

NOVA SC is a simulation-first supervisory telemetry console for a future distributed embedded system.

The current implementation is a React + TypeScript frontend connected to a FastAPI WebSocket simulator. It models a Pi-gateway-centered telemetry architecture, validates incoming packets, supervises topology health, records append-only ingestion evidence, and reconstructs replay state for report export.

Current project phase: **PHASE 5.9 - Replay Reducer**

## Target Architecture

```text
Laptop NOVA SC
  <-> Raspberry Pi 4 Gateway
      <-> MAIN ESP32-S3
          <-> SUB ESP32-S3
```

NOVA SC currently runs in **simulation mode**. It does not connect to real hardware yet.

## Current Scope

Implemented:

- FastAPI WebSocket telemetry simulator
- React + TypeScript supervision console
- Zustand telemetry store
- deterministic telemetry metadata
- strict packet schema validation
- Pi Gateway topology model
- DeviceRegistry and LinkRegistry
- V1+ topology-aware health check
- packet integrity counters
- supervisory JSON report export
- bounded append-only event store
- pure replay reducer for report reconstruction
- backend WebSocket disconnect hardening

Not implemented yet:

- real Raspberry Pi Gateway hardware connection
- real ESP32 UART telemetry
- real actuator control
- motor, servo, stepper, pump, or valve commands
- persistent event database
- replay UI timeline
- physical hardware validation

## Telemetry Flow

```text
TelemetrySource
  -> ingestionPipeline
  -> packetValidator
  -> telemetryStore
  -> DeviceRegistry / LinkRegistry / HealthCheck
  -> EventStore
  -> ReplayReducer
  -> ReportExport
```

The frontend accepts telemetry only after schema validation. Invalid packets are rejected before they can update live reducers.

## Main Frontend Modules

```text
frontend/src/App.tsx
  Main application shell and page routing.

frontend/src/hooks/useTelemetrySocket.ts
  WebSocket lifecycle, singleton ownership, reconnect logic, and telemetry aging timer.

frontend/src/transport/
  Telemetry source metadata and raw ingestion pipeline.

frontend/src/state/packetValidator.ts
  Strict packet schema validator.

frontend/src/store/telemetryStore.ts
  Live telemetry state, counters, registries, logs, event store integration.

frontend/src/state/deviceRegistry.ts
  Canonical device registry and health aging.

frontend/src/state/linkRegistry.ts
  Canonical topology link registry.

frontend/src/state/healthCheckEngine.ts
  V1 and V1+ supervisory health validation.

frontend/src/state/eventStore.ts
  Bounded append-only event evidence model.

frontend/src/state/replayReducer.ts
  Pure replay reconstruction from event store records.

frontend/src/state/reportBuilder.ts
  Supervisory JSON report generation and download.

frontend/src/components/
  Operator panels for topology, health, telemetry stats, logs, power, chips, registry, and reports.
```

## Backend Simulator

The backend simulator is located in:

```text
backend/main.py
```

It emits synthetic telemetry for:

- `GATEWAY_HEALTH_TELEMETRY`
- `NODE_HEALTH_TELEMETRY`
- `LINK_HEARTBEAT_TELEMETRY`
- `LINK_SYNC_TELEMETRY`
- `SYSTEM_HEALTH_TELEMETRY`
- `CHIP_STATUS_TELEMETRY`
- `POWER_HEALTH_TELEMETRY`

The WebSocket endpoint is:

```text
ws://127.0.0.1:8000/ws/telemetry
```

The HTTP health endpoint is:

```text
http://127.0.0.1:8000/health
```

## Setup

### Backend

From the project root:

```powershell
cd backend
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
```

Run the backend:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --ws websockets
```

### Frontend

From the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

## Build

Run a production build:

```powershell
cd frontend
npm run build
```

Preview the production build:

```powershell
npm run preview
```

## Validation Checklist

Expected simulator behavior:

- WebSocket state becomes `CONNECTED`
- packet count increases
- packet schema rejection counters remain `0`
- unknown event/node/link counters remain `0`
- topology page shows Laptop / Pi / MAIN / SUB chain
- all simulated links show healthy/synced
- V1+ Health Check is expected to be `WARNING`, not `FAIL`
- FRAM remains an expected warning until real validation exists
- Report Export downloads a JSON supervisory report
- replay snapshot is included in the report
- `hardware_connected` remains `false`
- `physical_hardware_validation` remains `false`

## Report Export

The report export includes:

- report metadata
- topology summary
- node summary
- link summary
- gateway health
- stream metadata
- packet integrity counters
- schema rejection counters
- event store summary
- recent event records
- replay snapshot
- replay validation result
- live vs replay summary
- recent engineering logs

Reports are JSON only. PDF export is not implemented.

## Safety Boundaries

NOVA SC currently has no actuator authority.

This project does not currently implement:

- motor commands
- servo commands
- stepper commands
- pump commands
- valve commands
- hardware command routing
- real experiment execution

All current telemetry is simulated unless explicitly stated otherwise in a future phase.

## Next Planned Direction

The next architectural direction is **PHASE 6.0 - Hardware Bridge Diagnosis**.

Planned focus:

- Raspberry Pi Gateway protocol
- UART framing
- hardware telemetry packet format
- heartbeat timing
- Pi Gateway forwarding rules
- MAIN ESP32 telemetry ownership
- fault recovery behavior

Real hardware integration should begin with telemetry-only Pi Gateway and MAIN ESP32 communication before any actuator-related work.
