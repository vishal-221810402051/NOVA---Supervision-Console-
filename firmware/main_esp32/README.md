# NOVA SC MAIN ESP32-S3 Telemetry Firmware

Phase 6.2 adds the telemetry-only firmware foundation for the MAIN ESP32-S3.

This firmware emits newline-delimited JSON packets to the Raspberry Pi Gateway. It does not receive commands and does not control any actuator hardware.

## Scope

- Telemetry only
- Source node: `esp32_main`
- Target node: `pi_gateway`
- Raw schema: `hw.v1`
- Transport: UART 115200 8N1
- Framing: one UTF-8 JSON object per line

## Safety Rules

Do not connect actuator power during Phase 6.2.

This firmware does not implement:

- motor control
- servo control
- pump control
- valve control
- relay control
- stepper driver enable
- command parser
- command receiver logic
- GPIO actuator writes

USB `Serial` is used for debug logs. The dedicated Pi UART emits JSON telemetry only.

## Wiring

Use 3.3V logic only.

```text
Raspberry Pi TX GPIO14  -> ESP32 RX
Raspberry Pi RX GPIO15  <- ESP32 TX
Raspberry Pi GND        -> ESP32 GND
```

Default candidate ESP32-S3 UART pins:

```text
MAIN_PI_UART_TX_PIN = 17
MAIN_PI_UART_RX_PIN = 18
```

These pins are configurable in `src/board_config.h` and must be confirmed against the final board pin map before hardware validation.

## Packet Envelope

Every emitted packet uses:

```json
{
  "schema_version": "hw.v1",
  "packet_type": "NODE_HEALTH",
  "source_node_id": "esp32_main",
  "target_node_id": "pi_gateway",
  "source_sequence_number": 1,
  "producer_timestamp_ms": 123456,
  "payload": {}
}
```

`source_sequence_number` starts at `1` on boot and increments once per emitted packet.

## Emitted Packet Types

- `LINK_HEARTBEAT` every 500 ms
- `NODE_HEALTH` every 1000 ms
- `LINK_SYNC` every 2000 ms
- `POWER_HEALTH` every 2000 ms
- `CHIP_STATUS` every 5000 ms

`POWER_HEALTH` intentionally uses `null` voltage values until ADC measurement hardware is configured. It does not fake voltage readings.

## Build

From this directory:

```powershell
platformio run
```

Or from the repo root:

```powershell
platformio run -d firmware/main_esp32
```

## Validation

Expected telemetry behavior:

- One JSON object per line on the Pi UART
- `schema_version` is `hw.v1`
- `source_node_id` is `esp32_main`
- `target_node_id` is `pi_gateway`
- Packet sequence starts at `1`
- No actuator command logic exists
- No fake power voltage values are emitted
