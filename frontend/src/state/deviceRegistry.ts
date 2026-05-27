import type {
  ChipStatusPayload,
  DeviceRegistryEntry,
  HealthState,
  PowerHealthPayload,
  SystemHealthPayload,
} from "../types/telemetry";

export const DEVICE_IDS = {
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
    [DEVICE_IDS.MAIN_MCU]: nodeDevice("MAIN ESP32-S3", "esp32_motion"),
    [DEVICE_IDS.SUB_MCU]: nodeDevice("SUB ESP32-S3", "esp32_qc"),
    [DEVICE_IDS.WIFI_LINK]: linkDevice("WiFi Link", "WIFI"),
    [DEVICE_IDS.MAIN_SUB_UART]: linkDevice("MAIN↔SUB UART", "UART"),

    [DEVICE_IDS.ADS1115]: i2cDevice("ADS1115 ADC", "0x48"),
    [DEVICE_IDS.DS3231]: i2cDevice("DS3231 RTC", "0x68"),
    [DEVICE_IDS.PCA9685_1]: i2cDevice("PCA9685 #1", "0x40"),
    [DEVICE_IDS.PCA9685_2]: i2cDevice("PCA9685 #2", "0x41"),
    [DEVICE_IDS.PCA9685_ALLCALL]: i2cDevice("PCA9685 AllCall", "0x70"),

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

    [DEVICE_IDS.VIN_PROTECTED]: powerRail("VIN Protected"),
    [DEVICE_IDS.RAIL_5V]: powerRail("+5V Logic"),
    [DEVICE_IDS.RAIL_3V3]: powerRail("+3V3 Logic"),
  };
}

function nodeDevice(display_name: string, node_id: string): DeviceRegistryEntry {
  return {
    device_id: node_id,
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
  display_name: string,
  bus: "UART" | "WIFI"
): DeviceRegistryEntry {
  return {
    device_id: display_name.toLowerCase().replaceAll(" ", "_"),
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

function i2cDevice(display_name: string, address: string): DeviceRegistryEntry {
  return {
    device_id: display_name.toLowerCase().replaceAll(" ", "_"),
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

function powerRail(display_name: string): DeviceRegistryEntry {
  return {
    device_id: display_name.toLowerCase().replaceAll(" ", "_"),
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

    const isBlocked = device.status === "BLOCKED_WRONG_IC_PENDING";
    const isDetected = device.status === "DETECTED";

    next[id] = updateEntry(next[id], {
      health_state: isDetected ? "HEALTHY" : isBlocked ? "DEGRADED" : "OFFLINE",
      online: isDetected,
      last_seen_utc: timestamp_utc,
      status_message: device.status,
    });
  }

  return next;
}

export function updateRegistryFromPowerHealth(
  registry: DeviceRegistry,
  payload: PowerHealthPayload,
  timestamp_utc: string
): DeviceRegistry {
  const next = { ...registry };

  next[DEVICE_IDS.VIN_PROTECTED] = updateEntry(next[DEVICE_IDS.VIN_PROTECTED], {
    health_state: payload.vin_protected_v >= 5.0 ? "HEALTHY" : "DEGRADED",
    online: payload.vin_protected_v >= 5.0,
    last_seen_utc: timestamp_utc,
    status_message: `${payload.vin_protected_v.toFixed(2)} V`,
  });

  next[DEVICE_IDS.RAIL_5V] = updateEntry(next[DEVICE_IDS.RAIL_5V], {
    health_state:
      payload.rail_5v_v >= 4.75 && payload.rail_5v_v <= 5.25
        ? "HEALTHY"
        : "DEGRADED",
    online: true,
    last_seen_utc: timestamp_utc,
    status_message: `${payload.rail_5v_v.toFixed(3)} V`,
  });

  next[DEVICE_IDS.RAIL_3V3] = updateEntry(next[DEVICE_IDS.RAIL_3V3], {
    health_state:
      payload.rail_3v3_v >= 3.135 && payload.rail_3v3_v <= 3.465
        ? "HEALTHY"
        : "DEGRADED",
    online: true,
    last_seen_utc: timestamp_utc,
    status_message: `${payload.rail_3v3_v.toFixed(3)} V`,
  });

  return next;
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
