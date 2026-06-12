# NOVA SC Phase 6.9 Hardware Telemetry Validation Baseline

STATUS: VALIDATED

Scope: Hardware telemetry only

No actuator/control path enabled

## Runtime Architecture

```text
Laptop NOVA SC frontend
-> WebSocket
-> Raspberry Pi FastAPI backend
-> /dev/serial0 UART 115200
-> MAIN ESP32-S3
-> SUB ESP32-S3 telemetry forwarded through MAIN
```

## Validated Nodes

- `laptop_console`
- `pi_gateway`
- `esp32_main`
- `esp32_sub`

## Validated Links

- `link_laptop_pi`
- `link_pi_main`
- `link_main_sub`

## Validated Packet Types

- `GATEWAY_HEALTH_TELEMETRY`
- `NODE_HEALTH_TELEMETRY`
- `LINK_HEARTBEAT_TELEMETRY`
- `LINK_SYNC_TELEMETRY`
- `POWER_HEALTH_TELEMETRY`
- `CHIP_STATUS_TELEMETRY`
- `TELEMETRY_INTEGRITY_EVENT`

## Current Known-Good Conditions

- Backend status is `HEALTHY`.
- Backend mode is hardware mode.
- Serial bridge status is `SERIAL_CONNECTED`.
- Serial connected is `true`.
- Hardware connected is `true`.
- Malformed packet count is `0`.
- Dropped packet count is `0`.
- Last backend error is `null`.
- MAIN timestamp is updating.
- SUB timestamp is updating.
- Packet Integrity is clean.
- Chain Health is healthy.
- Links Healthy is `3/3`.
- Links Synced is `3/3`.

## Firmware Versions

- MAIN: `main-fw-hw-0.1.0`
- SUB: `sub-fw-hw-0.1.0`

## Chip Status Baseline

- ADS1115 detected when connected.
- DS3231 RTC detected when connected.
- PCA9685 #1 detected when connected.
- PCA9685 #2 detected when connected.
- PCA9685 AllCall is not independently validated as a physical chip.
- FRAM is blocked/wrong IC pending.

## Power Health Baseline

- `POWER_HEALTH` telemetry exists.
- Voltage fields are currently `null`.
- `measurement_status = ADC_NOT_CONFIGURED`.
- No fake voltage values are emitted.

## Known Limitations

- Laptop node heartbeat is not implemented.
- Power rail ADC measurement is not implemented.
- FRAM is blocked/wrong IC pending.
- PCA9685 AllCall is not an independent physical chip validation.
- PCA9685 PWM is disabled.
- No actuator control is implemented.
- No command receiver is implemented.
- No command parser is implemented.
- MAIN-to-SUB command UART is disabled.
- No safety interlock telemetry exists yet.
- No watchdog/fail-safe validation has been performed yet.
- Long-runtime validation is still pending.
- Some UI/report labels may still require later cleanup if new phases rename surfaces.

## Explicit Disabled Features

- `MAIN_TO_SUB_UART` command path
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

## Acceptance Evidence

- `integrity_events = 0`
- `malformed_packet_count = 0`
- `dropped_packet_count = 0`
- `gateway_malformed_values = all 0`
- Source counts confirmed:
  - `esp32_main`
  - `esp32_sub`
  - `pi_gateway`
- SUB examples confirmed:
  - `esp32_sub::NODE_HEALTH_TELEMETRY`
  - `esp32_sub::LINK_HEARTBEAT_TELEMETRY`
  - `esp32_sub::LINK_SYNC_TELEMETRY`

## Next Phases Not Yet Enabled

- Long-duration telemetry soak test
- Real power rail ADC telemetry
- Safety interlock telemetry
- Watchdog/failsafe validation
- Command authorization layer
- Actuator supervision only after safety validation

## Baseline Lock Statement

This baseline locks the Phase 6.9 hardware telemetry state only. It does not validate actuator readiness, command authority, PCA9685 PWM output, motor output, servo output, pump output, valve output, relay output, heater output, or safety output actuation.
