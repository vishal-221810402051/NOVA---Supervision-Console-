# NOVA SC - Phase 7.1 Power Rail ADC Telemetry

## Status

Current Phase Status: In Progress

Completed:

- Phase 7.1A - ADS1115 Raw Debug Telemetry
- Phase 7.1B - ADC Channel Mapping & Electrical Investigation

Next:

- Phase 7.1C - Power Rail Sense Hardware Strategy

## Objective

Introduce real analog telemetry into the NOVA SC hardware supervision stack using the ADS1115 external ADC.

The long-term goal is to provide reliable telemetry for:

- VIN_PROTECTED
- +5V_LOGIC
- +3V3_LOGIC

while maintaining the existing telemetry chain:

```text
MAIN ESP32-S3
    |
    v
Pi Gateway
    |
    v
Backend
    |
    v
WebSocket
    |
    v
Frontend
    |
    v
Report Export
```

## Phase 7.1A - ADS1115 Raw Debug Telemetry

### Goal

Validate that ADS1115 analog measurements can be:

- Read by MAIN ESP32-S3
- Emitted as POWER_HEALTH_TELEMETRY
- Transported through the telemetry chain
- Displayed in the frontend
- Exported in reports

### Implementation

Added:

- ADS1115 raw reader
- Single-ended AIN0-AIN3 measurements
- Raw ADC telemetry fields
- Frontend support
- Report export support

Telemetry fields:

```json
{
  "measurement_status": "ADC_RAW_DEBUG",
  "adc_source": "ADS1115",
  "adc_address": "0x48",
  "adc_mode": "RAW_SINGLE_ENDED_DEBUG",
  "ads1115_channels": {
    "ain0_v": 0.0,
    "ain1_v": 0.0,
    "ain2_v": 0.0,
    "ain3_v": 0.0
  }
}
```

### Validation Result

PASS

Verified:

- ADS1115 detected at 0x48
- Raw AIN0-AIN3 telemetry received
- Packet integrity remained clean
- Frontend displayed values correctly
- Report export contained raw ADC evidence

### Important Limitation

Phase 7.1A does NOT provide calibrated rail telemetry.

The reported voltages are only raw ADC input voltages.

## Phase 7.1B - ADC Channel Mapping & Electrical Investigation

### Goal

Determine whether ADS1115 channels are actually connected to:

- VIN_PROTECTED
- +5V_LOGIC
- +3V3_LOGIC

and identify the cause of observed voltage discrepancies.

### Investigation Findings

The hardware schematic shows:

```text
AIN0 -> ADC_AIN0 -> J9
AIN1 -> ADC_AIN1 -> J10
AIN2 -> ADC_AIN2 -> J11
AIN3 -> ADC_AIN3 -> J12
```

Each connector exports:

```text
Pin 1 = ADC signal
Pin 2 = GND
```

No resistor-divider network exists between:

- VIN_PROTECTED
- +5V_LOGIC
- +3V3_LOGIC

and the ADS1115 inputs.

### Conclusion

ADS1115 channels are currently:

- General-purpose external analog inputs

They are NOT:

- Power rail measurement channels

### Validation Result

PASS

Engineering conclusion:

- Raw ADC telemetry works.
- Real rail telemetry is not implemented in hardware.

### Observed Measurements

Runtime telemetry:

- AIN0 approximately 0.57 V
- AIN1 approximately 0.58 V
- AIN2 approximately 0.57 V
- AIN3 approximately 0.58 V

DMM measurements:

- AIN0 approximately 1.1 V
- AIN1 approximately 1.1 V
- AIN2 approximately 1.1 V
- AIN3 approximately 1.1 V

Interpretation:

The ADC channels appear to be floating, biased, or connected through external/backplane paths rather than dedicated rail-sense circuitry.

These values must NOT be interpreted as rail voltages.

## Current Engineering Position

Validated:

- ADS1115 hardware detected
- ADS1115 raw measurements
- Firmware integration
- Backend transport
- Frontend display
- Report export
- Packet integrity

Not Validated:

- VIN telemetry
- +5V telemetry
- +3V3 telemetry
- Divider ratios
- Calibration constants
- Rail thresholds
- Brownout detection based on ADC

## Future Hardware Strategy

Recommended future mapping:

```text
AIN0 = VIN_PROTECTED
AIN1 = +5V_LOGIC
AIN2 = +3V3_LOGIC
AIN3 = Spare
```

using dedicated resistor-divider networks.

Example concept:

```text
VIN_PROTECTED
      |
      v
 Divider
      |
      v
AIN0

+5V_LOGIC
      |
      v
 Divider
      |
      v
AIN1

+3V3_LOGIC
      |
      v
 Divider
      |
      v
AIN2
```

Implementation deferred to a future hardware revision or ECO.

## Final Verdict

Phase 7.1A:

ACCEPTED

Phase 7.1B:

ACCEPTED

Current status:

ADS1115 raw telemetry validated.

Real power rail telemetry requires hardware rail-sense implementation.
