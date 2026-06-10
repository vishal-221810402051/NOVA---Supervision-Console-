import type {
  ChipDeviceStatus,
  ChipStatusPayload,
  DeviceRegistryEntry,
  HealthState,
  NodeHealthPayload,
  PowerMeasurementStatus,
  PowerHealthPayload,
  SystemHealthPayload,
} from "../types/telemetry";
import { normalizeNodeId, isAcceptedNodeId } from "../types/telemetry";

export const DEVICE_IDS = {
  LAPTOP_CONSOLE: "laptop_console",
  PI_GATEWAY: "pi_gateway",
  MAIN_MCU: "main_mcu",
  SUB_MCU: "sub_mcu",
  WIFI_LINK: "wifi_link",
  MAIN_SUB_UART: "main_sub_uart",
  ADS1115: "ads1115",
  DS3231: "ds3231_rtc",
  PCA9685_1: "pca9685_1",
  PCA9685_2: "pca9685_2",
  PCA9685_ALLCALL: "pca9685_allcall",
  FRAM: "fram_mb85rs256b",
  VIN_PROTECTED: "vin_protected",
  RAIL_5V: "rail_5v_logic",
  RAIL_3V3: "rail_3v3_logic",
} as const;

export type DeviceRegistry = Record<string, DeviceRegistryEntry>;

export function createInitialDeviceRegistry(): DeviceRegistry {
  return {
    [DEVICE_IDS.LAPTOP_CONSOLE]: nodeDevice(
      DEVICE_IDS.LAPTOP_CONSOLE,
      "Laptop Console",
      "laptop_console"
    ),
    [DEVICE_IDS.PI_GATEWAY]: nodeDevice(
      DEVICE_IDS.PI_GATEWAY,
      "Pi Gateway",
      "pi_gateway"
    ),
    [DEVICE_IDS.MAIN_MCU]: nodeDevice(DEVICE_IDS.MAIN_MCU, "MAIN ESP32-S3", "esp32_main"),
    [DEVICE_IDS.SUB_MCU]: nodeDevice(DEVICE_IDS.SUB_MCU, "SUB ESP32-S3", "esp32_sub"),
    [DEVICE_IDS.WIFI_LINK]: linkDevice(DEVICE_IDS.WIFI_LINK, "WiFi Link", "WIFI"),
    [DEVICE_IDS.MAIN_SUB_UART]: linkDevice(DEVICE_IDS.MAIN_SUB_UART, "MAIN / SUB UART", "UART"),

    [DEVICE_IDS.ADS1115]: i2cDevice(DEVICE_IDS.ADS1115, "ADS1115 ADC", "0x48"),
    [DEVICE_IDS.DS3231]: i2cDevice(DEVICE_IDS.DS3231, "DS3231 RTC", "0x68"),
    [DEVICE_IDS.PCA9685_1]: i2cDevice(DEVICE_IDS.PCA9685_1, "PCA9685 #1", "0x40"),
    [DEVICE_IDS.PCA9685_2]: i2cDevice(DEVICE_IDS.PCA9685_2, "PCA9685 #2", "0x41"),
    [DEVICE_IDS.PCA9685_ALLCALL]: i2cDevice(DEVICE_IDS.PCA9685_ALLCALL, "PCA9685 AllCall", "0x70"),

    [DEVICE_IDS.FRAM]: {
      device_id: DEVICE_IDS.FRAM,
      display_name: "MB85RS256B FRAM",
      kind: "SPI_DEVICE",
      bus: "SPI",
      chip_select: "FRAM_CS_GPIO10",
      health_state: "DEGRADED",
      last_seen_utc: null,
      heartbeat_age_ms: null,
      online: false,
      status_message: "Blocked until correct SPI FRAM is installed",
    },

    [DEVICE_IDS.VIN_PROTECTED]: powerRail(DEVICE_IDS.VIN_PROTECTED, "VIN Protected"),
    [DEVICE_IDS.RAIL_5V]: powerRail(DEVICE_IDS.RAIL_5V, "+5V Logic"),
    [DEVICE_IDS.RAIL_3V3]: powerRail(DEVICE_IDS.RAIL_3V3, "+3V3 Logic"),
  };
}

function nodeDevice(
  device_id: string,
  display_name: string,
  node_id: string
): DeviceRegistryEntry {
  return {
    device_id,
    display_name,
    kind: "NODE",
    node_id,
    health_state: "OFFLINE",
    last_seen_utc: null,
    heartbeat_age_ms: null,
    online: false,
    status_message: "Awaiting telemetry",
  };
}

function linkDevice(
  device_id: string,
  display_name: string,
  bus: "UART" | "WIFI"
): DeviceRegistryEntry {
  return {
    device_id,
    display_name,
    kind: "NODE",
    bus,
    health_state: "OFFLINE",
    last_seen_utc: null,
    heartbeat_age_ms: null,
    online: false,
    status_message: "Awaiting link telemetry",
  };
}

function i2cDevice(
  device_id: string,
  display_name: string,
  address: string
): DeviceRegistryEntry {
  return {
    device_id,
    display_name,
    kind: "I2C_DEVICE",
    bus: "I2C",
    address,
    health_state: "OFFLINE",
    last_seen_utc: null,
    heartbeat_age_ms: null,
    online: false,
    status_message: "Awaiting I2C scan",
  };
}

function powerRail(device_id: string, display_name: string): DeviceRegistryEntry {
  return {
    device_id,
    display_name,
    kind: "POWER_RAIL",
    bus: "POWER",
    health_state: "OFFLINE",
    last_seen_utc: null,
    heartbeat_age_ms: null,
    online: false,
    status_message: "Awaiting power telemetry",
  };
}

export function updateRegistryFromSystemHealth(
  registry: DeviceRegistry,
  payload: SystemHealthPayload,
  timestamp_utc: string
): DeviceRegistry {
  const next = { ...registry };

  next[DEVICE_IDS.MAIN_MCU] = updateEntry(next[DEVICE_IDS.MAIN_MCU], {
    health_state: payload.main_mcu.health_state,
    online: payload.main_mcu.health_state !== "OFFLINE",
    last_seen_utc: timestamp_utc,
    status_message: `Firmware ${payload.main_mcu.firmware_version}`,
  });

  next[DEVICE_IDS.SUB_MCU] = updateEntry(next[DEVICE_IDS.SUB_MCU], {
    health_state: payload.sub_mcu.health_state,
    online: payload.sub_mcu.health_state !== "OFFLINE",
    last_seen_utc: timestamp_utc,
    status_message: `Firmware ${payload.sub_mcu.firmware_version}`,
  });

  next[DEVICE_IDS.WIFI_LINK] = updateEntry(next[DEVICE_IDS.WIFI_LINK], {
    health_state: payload.wifi.connection_state === "CONNECTED" ? "HEALTHY" : "OFFLINE",
    online: payload.wifi.connection_state === "CONNECTED",
    last_seen_utc: timestamp_utc,
    status_message: `${payload.wifi.rssi_dbm} dBm / ${payload.wifi.latency_ms} ms`,
  });

  next[DEVICE_IDS.MAIN_SUB_UART] = updateEntry(next[DEVICE_IDS.MAIN_SUB_UART], {
    health_state: payload.main_sub_uart.link_state === "ACTIVE" ? "HEALTHY" : "OFFLINE",
    online: payload.main_sub_uart.link_state === "ACTIVE",
    last_seen_utc: timestamp_utc,
    status_message: `TX ${payload.main_sub_uart.tx_packets} / RX ${payload.main_sub_uart.rx_packets}`,
  });

  return next;
}

export function updateRegistryFromChipStatus(
  registry: DeviceRegistry,
  payload: ChipStatusPayload,
  timestamp_utc: string
): DeviceRegistry {
  const next = { ...registry };

  for (const device of [...payload.i2c_devices, ...payload.spi_devices]) {
    const id = mapChipNameToDeviceId(device.name);
    if (!id || !next[id]) continue;

    const chipState = chipStatusToRegistryState(device.status);

    next[id] = updateEntry(next[id], {
      health_state: chipState.health_state,
      online: chipState.online,
      last_seen_utc: timestamp_utc,
      status_message: chipState.status_message,
    });
  }

  return next;
}

function chipStatusToRegistryState(status: ChipDeviceStatus): {
  health_state: HealthState;
  online: boolean;
  status_message: string;
} {
  if (status === "DETECTED") {
    return {
      health_state: "HEALTHY",
      online: true,
      status_message: "Validated detected",
    };
  }

  if (status === "MISSING") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "Missing",
    };
  }

  if (status === "NOT_VALIDATED") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "Not validated",
    };
  }

  if (status === "VALIDATION_DISABLED") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "Validation disabled",
    };
  }

  if (status === "DETECTED_UNCONFIRMED") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "Detected but unconfirmed",
    };
  }

  if (status === "BUS_NOT_READY") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "I2C bus not ready",
    };
  }

  if (status === "BLOCKED_WRONG_IC_PENDING") {
    return {
      health_state: "DEGRADED",
      online: false,
      status_message: "BLOCKED_WRONG_IC_PENDING",
    };
  }

  return {
    health_state: "DEGRADED",
    online: false,
    status_message: "Unknown",
  };
}

export function updateRegistryFromPowerHealth(
  registry: DeviceRegistry,
  payload: PowerHealthPayload,
  timestamp_utc: string
): DeviceRegistry {
  const next = { ...registry };
  const measurementStatus = payload.measurement_status ?? "MEASURED";

  next[DEVICE_IDS.VIN_PROTECTED] = updateEntry(next[DEVICE_IDS.VIN_PROTECTED], {
    health_state: getPowerRailHealth(
      payload.vin_protected_v,
      measurementStatus,
      (value) => value >= 5.0
    ),
    online: true,
    last_seen_utc: timestamp_utc,
    status_message: formatPowerMeasurement(
      payload.vin_protected_v,
      measurementStatus,
      2
    ),
  });

  next[DEVICE_IDS.RAIL_5V] = updateEntry(next[DEVICE_IDS.RAIL_5V], {
    health_state: getPowerRailHealth(
      payload.rail_5v_v,
      measurementStatus,
      (value) => value >= 4.75 && value <= 5.25
    ),
    online: true,
    last_seen_utc: timestamp_utc,
    status_message: formatPowerMeasurement(
      payload.rail_5v_v,
      measurementStatus,
      3
    ),
  });

  next[DEVICE_IDS.RAIL_3V3] = updateEntry(next[DEVICE_IDS.RAIL_3V3], {
    health_state: getPowerRailHealth(
      payload.rail_3v3_v,
      measurementStatus,
      (value) => value >= 3.135 && value <= 3.465
    ),
    online: true,
    last_seen_utc: timestamp_utc,
    status_message: formatPowerMeasurement(
      payload.rail_3v3_v,
      measurementStatus,
      3
    ),
  });

  return next;
}

function getPowerRailHealth(
  value: number | null,
  measurementStatus: PowerMeasurementStatus,
  isHealthy: (value: number) => boolean
): HealthState {
  if (value === null) return "DEGRADED";
  if (measurementStatus !== "MEASURED") return "DEGRADED";
  return isHealthy(value) ? "HEALTHY" : "DEGRADED";
}

function formatPowerMeasurement(
  value: number | null,
  measurementStatus: PowerMeasurementStatus,
  precision: number
) {
  if (value !== null) return `${value.toFixed(precision)} V`;
  if (measurementStatus === "ADC_NOT_CONFIGURED") {
    return "Not measured: ADC_NOT_CONFIGURED";
  }
  if (measurementStatus === "SENSOR_UNAVAILABLE") {
    return "Unavailable";
  }
  if (measurementStatus === "INVALID_READING") {
    return "Invalid reading";
  }
  return "Not measured";
}

export function updateRegistryFromNodeHealth(
  registry: DeviceRegistry,
  payload: NodeHealthPayload,
  timestamp_utc: string
): DeviceRegistry {
  const id = mapNodeIdToDeviceId(payload.node_id);
  if (!id || !registry[id]) return registry;

  return {
    ...registry,
    [id]: updateEntry(registry[id], {
      health_state: payload.health_state,
      online: payload.health_state !== "OFFLINE",
      last_seen_utc: timestamp_utc,
      status_message: payload.status_message,
    }),
  };
}

function updateEntry(
  entry: DeviceRegistryEntry,
  updates: Partial<DeviceRegistryEntry>
): DeviceRegistryEntry {
  return {
    ...entry,
    ...updates,
    heartbeat_age_ms: 0,
  };
}

function mapChipNameToDeviceId(name: string): string | null {
  const map: Record<string, string> = {
    ADS1115: DEVICE_IDS.ADS1115,
    DS3231_RTC: DEVICE_IDS.DS3231,
    PCA9685_1: DEVICE_IDS.PCA9685_1,
    PCA9685_2: DEVICE_IDS.PCA9685_2,
    PCA9685_ALLCALL: DEVICE_IDS.PCA9685_ALLCALL,
    MB85RS256B_FRAM: DEVICE_IDS.FRAM,
  };

  return map[name] ?? null;
}

function mapNodeIdToDeviceId(nodeId: string): string | null {
  const canonicalNodeId = isAcceptedNodeId(nodeId) ? normalizeNodeId(nodeId) : nodeId;
  const map: Record<string, string> = {
    laptop_console: DEVICE_IDS.LAPTOP_CONSOLE,
    pi_gateway: DEVICE_IDS.PI_GATEWAY,
    esp32_main: DEVICE_IDS.MAIN_MCU,
    esp32_sub: DEVICE_IDS.SUB_MCU,
  };

  return map[canonicalNodeId] ?? null;
}

export function getRegistrySummary(registry: DeviceRegistry) {
  const devices = Object.values(registry);
  const healthy = devices.filter((d) => d.health_state === "HEALTHY").length;
  const degraded = devices.filter((d) => d.health_state === "DEGRADED").length;
  const offline = devices.filter((d) => d.health_state === "OFFLINE").length;
  const failSafe = devices.filter((d) => d.health_state === "FAIL_SAFE").length;

  return {
    total: devices.length,
    healthy,
    degraded,
    offline,
    failSafe,
  };
}

export function ageDeviceRegistry(
  registry: DeviceRegistry,
  nowMs: number = Date.now()
): DeviceRegistry {
  const next: DeviceRegistry = {};

  for (const [id, device] of Object.entries(registry)) {
    if (!device.last_seen_utc) {
      next[id] = device;
      continue;
    }

    const lastSeenMs = new Date(device.last_seen_utc).getTime();
    const heartbeatAgeMs = Math.max(0, nowMs - lastSeenMs);

    let healthState: HealthState = device.health_state;
    let online = device.online;
    let statusMessage = device.status_message;

    if (device.device_id === DEVICE_IDS.FRAM) {
      next[id] = {
        ...device,
        heartbeat_age_ms: heartbeatAgeMs,
      };
      continue;
    }

    if (heartbeatAgeMs > 6000) {
      healthState = "OFFLINE";
      online = false;
      statusMessage = `Telemetry timeout > 6000 ms`;
    } else if (heartbeatAgeMs > 3000) {
      healthState = "DEGRADED";
      online = true;
      statusMessage = `Telemetry stale > 3000 ms`;
    }

    next[id] = {
      ...device,
      heartbeat_age_ms: heartbeatAgeMs,
      health_state: healthState,
      online,
      status_message: statusMessage,
    };
  }

  return next;
}

export function getGlobalSystemHealth(registry: DeviceRegistry): HealthState {
  const devices = Object.values(registry);

  const hasFailSafe = devices.some((d) => d.health_state === "FAIL_SAFE");
  if (hasFailSafe) return "FAIL_SAFE";

  const criticalIds = [
    DEVICE_IDS.MAIN_MCU,
    DEVICE_IDS.SUB_MCU,
    DEVICE_IDS.WIFI_LINK,
    DEVICE_IDS.MAIN_SUB_UART,
    DEVICE_IDS.RAIL_5V,
    DEVICE_IDS.RAIL_3V3,
  ];

  const criticalDevices = criticalIds.map((id) => registry[id]);

  const criticalOffline = criticalDevices.some(
    (d) => d?.health_state === "OFFLINE"
  );
  if (criticalOffline) return "OFFLINE";

  const hasDegraded = devices.some((d) => d.health_state === "DEGRADED");
  if (hasDegraded) return "DEGRADED";

  return "HEALTHY";
}
