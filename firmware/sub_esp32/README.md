# NOVA SC SUB ESP32-S3 Telemetry Firmware

Phase 6.6 adds a standalone telemetry-only firmware foundation for the SUB
ESP32-S3. This phase validates SUB telemetry over USB serial before connecting
SUB to MAIN.

## Scope

- Telemetry only
- Source node: `esp32_sub`
- Target node: `esp32_main`
- Role: `SAFETY_QC`
- Raw schema: `hw.v1`
- Transport for Phase 6.7A: USB Serial plus physical TXD0 to MAIN
- Framing: one UTF-8 JSON object per line
- Baud: `115200`

## Safety Rules

Do not connect SUB to MAIN during Phase 6.6.

Do not connect actuator power.

This firmware does not implement:

- motor control
- servo control
- pump control
- valve control
- relay control
- heater control
- stepper driver enable
- PCA9685 output
- command parser
- command receiver logic
- GPIO actuator writes

## Phase 6.7A Physical UART Output

Phase 6.7A keeps the validated USB telemetry output and also emits the same
newline-delimited `hw.v1` JSON lines on the SUB physical TXD0 path.

Confirmed NOVA B1 routing:

```text
SUB U10 TXD0 / SUB_TO_MAIN_UART -> MAIN U9 GPIO47 / SUB_TO_MAIN_UART
```

Firmware configuration:

```text
SUB_MAIN_UART_PORT = 0
SUB_MAIN_UART_TX_PIN = 43
SUB_MAIN_UART_RX_PIN = -1
SUB_MAIN_UART_BAUD = 115200
```

SUB RX is intentionally disabled in this phase. No command path exists.

Phase 6.7A wiring:

```text
SUB TXD0 / SUB_TO_MAIN_UART -> MAIN GPIO47 / SUB_TO_MAIN_UART
SUB GND                     -> MAIN GND
```

Do not connect MAIN TX to SUB RX during Phase 6.7A. Do not connect actuator
power.

## Emitted Packet Types

- `LINK_HEARTBEAT` every 500 ms
- `NODE_HEALTH` every 1000 ms
- `LINK_SYNC` every 2000 ms

The firmware intentionally does not emit:

- `CHIP_STATUS`
- `POWER_HEALTH`
- sensor/QC telemetry
- actuator telemetry
- command responses

## Packet Envelope

Every emitted packet uses:

```json
{
  "schema_version": "hw.v1",
  "packet_type": "NODE_HEALTH",
  "source_node_id": "esp32_sub",
  "target_node_id": "esp32_main",
  "source_sequence_number": 1,
  "producer_timestamp_ms": 123456,
  "payload": {}
}
```

`source_sequence_number` starts at `1` on boot and increments once per emitted
packet.

## Expected USB Monitor Output

Expected properties:

- valid newline-delimited `hw.v1` JSON
- `source_node_id` is `esp32_sub`
- `target_node_id` is `esp32_main`
- `role` is `SAFETY_QC`
- `link_id` is `link_main_sub`
- no actuator packets
- no `CHIP_STATUS`
- no `POWER_HEALTH`

## Build

From this directory:

```powershell
python -m platformio run
```

Or from the repo root:

```powershell
python -m platformio run -d firmware/sub_esp32
```

## Upload

Identify the SUB ESP32-S3 COM port:

```powershell
python -m platformio device list
```

Upload:

```powershell
python -m platformio run -t upload --upload-port COMx
```

Replace `COMx` with the actual SUB ESP32-S3 port.

## Monitor

```powershell
python -m platformio device monitor -p COMx -b 115200
```

## Next Phase

Phase 6.7 should add the MAIN forwarding bridge so MAIN can receive complete
SUB newline-delimited JSON packets and forward them to the Raspberry Pi gateway.
