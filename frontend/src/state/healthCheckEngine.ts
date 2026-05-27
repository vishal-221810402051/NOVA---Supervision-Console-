import type {
  DeviceRegistryEntry,
  HealthCheckResult,
  HealthCheckRule,
} from "../types/telemetry";
import type { DeviceRegistry } from "./deviceRegistry";
import { DEVICE_IDS } from "./deviceRegistry";

export function evaluateV1HealthCheck(
  registry: DeviceRegistry,
  isTelemetryStale: boolean
): {
  overall: HealthCheckResult;
  rules: HealthCheckRule[];
} {
  const rules: HealthCheckRule[] = [
    requiredHealthy(
      "MAIN_MCU_HEALTH",
      "MAIN ESP32-S3 health",
      registry[DEVICE_IDS.MAIN_MCU]
    ),
    requiredHealthy(
      "SUB_MCU_HEALTH",
      "SUB ESP32-S3 health",
      registry[DEVICE_IDS.SUB_MCU]
    ),
    requiredHealthy(
      "WIFI_LINK_ACTIVE",
      "WiFi telemetry link",
      registry[DEVICE_IDS.WIFI_LINK]
    ),
    requiredHealthy(
      "MAIN_SUB_UART_ACTIVE",
      "MAIN / SUB UART link",
      registry[DEVICE_IDS.MAIN_SUB_UART]
    ),
    requiredHealthy(
      "ADS1115_DETECTED",
      "ADS1115 ADC detected at 0x48",
      registry[DEVICE_IDS.ADS1115]
    ),
    requiredHealthy(
      "DS3231_DETECTED",
      "DS3231 RTC detected at 0x68",
      registry[DEVICE_IDS.DS3231]
    ),
    requiredHealthy(
      "PCA9685_1_DETECTED",
      "PCA9685 #1 detected at 0x40",
      registry[DEVICE_IDS.PCA9685_1]
    ),
    requiredHealthy(
      "PCA9685_2_DETECTED",
      "PCA9685 #2 detected at 0x41",
      registry[DEVICE_IDS.PCA9685_2]
    ),
    requiredHealthy(
      "PCA9685_ALLCALL_DETECTED",
      "PCA9685 AllCall detected at 0x70",
      registry[DEVICE_IDS.PCA9685_ALLCALL]
    ),
    requiredHealthy(
      "VIN_PRESENT",
      "VIN protected rail present",
      registry[DEVICE_IDS.VIN_PROTECTED]
    ),
    requiredHealthy(
      "RAIL_5V_VALID",
      "+5V logic rail valid",
      registry[DEVICE_IDS.RAIL_5V]
    ),
    requiredHealthy(
      "RAIL_3V3_VALID",
      "+3V3 logic rail valid",
      registry[DEVICE_IDS.RAIL_3V3]
    ),
    warningExpected(
      "FRAM_SPI_PENDING",
      "FRAM SPI validation pending",
      registry[DEVICE_IDS.FRAM]
    ),
    staleTelemetryRule(isTelemetryStale),
  ];

  const hasFail = rules.some((r) => r.result === "FAIL");
  const hasWarning = rules.some((r) => r.result === "WARNING");

  return {
    overall: hasFail ? "FAIL" : hasWarning ? "WARNING" : "PASS",
    rules,
  };
}

function requiredHealthy(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined
): HealthCheckRule {
  if (!device) {
    return {
      rule_id,
      label,
      result: "FAIL",
      details: "Device missing from registry",
    };
  }

  if (device.health_state === "HEALTHY") {
    return {
      rule_id,
      label,
      result: "PASS",
      details: device.status_message,
    };
  }

  return {
    rule_id,
    label,
    result: "FAIL",
    details: `${device.display_name} is ${device.health_state}: ${device.status_message}`,
  };
}

function warningExpected(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined
): HealthCheckRule {
  if (!device) {
    return {
      rule_id,
      label,
      result: "WARNING",
      details: "FRAM entry missing from registry",
    };
  }

  if (device.health_state === "DEGRADED") {
    return {
      rule_id,
      label,
      result: "WARNING",
      details: "Expected V1 warning: correct SPI FRAM installation/validation pending",
    };
  }

  if (device.health_state === "HEALTHY") {
    return {
      rule_id,
      label,
      result: "PASS",
      details: "FRAM SPI device validated",
    };
  }

  return {
    rule_id,
    label,
    result: "WARNING",
    details: `FRAM state: ${device.health_state}`,
  };
}

function staleTelemetryRule(isTelemetryStale: boolean): HealthCheckRule {
  return {
    rule_id: "TELEMETRY_FRESHNESS",
    label: "Telemetry freshness",
    result: isTelemetryStale ? "FAIL" : "PASS",
    details: isTelemetryStale
      ? "Telemetry is stale; values are last known state"
      : "Telemetry stream is live",
  };
}
