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

NOVA B1 J2 `PI_CTRL_IF` uses board-routed `MCU_UART_TX` / `MCU_UART_RX`
connected to the ESP32-S3 TXD0 / RXD0 UART0 path. For Phase 6.4C, the
Raspberry Pi RX must connect to the J2 Pi UART receive path, not the old
GPIO17 dry-validation candidate pin.

```text
Raspberry Pi TX GPIO14  -> J2 MCU_UART_RX / ESP32 RXD0
Raspberry Pi RX GPIO15  <- J2 MCU_UART_TX / ESP32 TXD0
Raspberry Pi GND        -> ESP32 GND
```

NOVA B1 ESP32-S3 UART0 telemetry pins:

```text
MAIN_PI_UART_TX_PIN = 43  // ESP32-S3 TXD0 / board-routed MCU_UART_TX
MAIN_PI_UART_RX_PIN = 44  // ESP32-S3 RXD0 / board-routed MCU_UART_RX
```

These pins are configured in `src/board_config.h` for NOVA B1 J2
`PI_CTRL_IF` routing. USB debug output remains on native USB CDC `Serial`.

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

## I2C Chip Validation Safety

Phase 6.4E enables controlled read-only I2C chip validation after confirming
NOVA B1 GPIO8/GPIO9 as SDA/SCL. `DETECTED` requires stable repeated ACKs plus a
safe functional register read. Address ACK alone is never enough to claim a chip
is detected.

Validation behavior:

- ADS1115 at `0x48`: reads config register `0x01`.
- DS3231 RTC at `0x68`: reads seconds register `0x00` and checks BCD range.
- PCA9685 at `0x40` / `0x41`: reads MODE1 register `0x00`.
- PCA9685 AllCall at `0x70`: remains `NOT_VALIDATED` because it is not an
  independent physical chip in this phase.
- MB85RS256B FRAM: remains `BLOCKED_WRONG_IC_PENDING`.

No writes are performed during I2C validation. The firmware does not set RTC
time, configure ADS1115 conversion mode, write PCA9685 MODE registers, enable
PWM output, or drive actuator hardware.

## Phase 6.7 MAIN / SUB UART Forwarding

Phase 6.7 adds a telemetry-only forwarding bridge from the SUB ESP32-S3 to the
Raspberry Pi stream through MAIN. MAIN receives complete newline-delimited
`hw.v1` JSON lines from SUB on the second UART and forwards each accepted line
unchanged to the Pi UART.

Confirmed NOVA B1 routing:

```text
SUB U10 TXD0 / SUB_TO_MAIN_UART -> MAIN U9 GPIO47 / SUB_TO_MAIN_UART
Future MAIN U9 GPIO46 / MAIN_TO_SUB_UART -> SUB U10 RXD0
```

Phase 6.7 uses one-way telemetry only:

```text
SUB TXD0 / SUB_TO_MAIN_UART -> MAIN GPIO47 / SUB_TO_MAIN_UART
SUB GND                     -> MAIN GND
```

`MAIN_SUB_UART_TX_PIN = -1`, so MAIN TX to SUB is intentionally disabled for
this phase. Do not connect MAIN TX to SUB RX during Phase 6.7.

Forwarding behavior:

- forwards only complete newline-delimited SUB JSON lines
- ignores carriage returns
- drops empty, malformed-boundary, or overlong lines
- does not parse or rewrite SUB JSON
- mirrors forwarded SUB lines to USB only when `TELEMETRY_MIRROR_TO_USB` is enabled
- does not add a command path
- does not add actuator logic
- does not require backend, frontend, or SUB firmware changes

Expected validation after wiring:

- Pi `/health` `last_esp32_main_packet_utc` updates
- Pi `/health` `last_esp32_sub_packet_utc` updates
- `malformed_packet_count = 0`
- `dropped_packet_count = 0`
- frontend `esp32_sub = HEALTHY`
- frontend `link_main_sub = LINK_HEALTHY / SYNCED`

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
