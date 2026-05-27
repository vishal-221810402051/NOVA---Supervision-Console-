export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "FAIL_SAFE";

export type ConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "OFFLINE";

export type LogSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type EventType =
  | "SYSTEM_HEALTH_TELEMETRY"
  | "CHIP_STATUS_TELEMETRY"
  | "POWER_HEALTH_TELEMETRY";

export type MainMcuHealth = {
  node_id: "esp32_motion";
  health_state: HealthState;
  uptime_ms: number;
  firmware_version: string;
  free_heap_bytes: number;
  reset_reason: string;
  brownout_count: number;
};

export type SubMcuHealth = {
  node_id: "esp32_qc";
  health_state: HealthState;
  uptime_ms: number;
  firmware_version: string;
  free_heap_bytes: number;
  reset_reason: string;
  brownout_count: number;
};

export type SystemHealthPayload = {
  main_mcu: MainMcuHealth;
  sub_mcu: SubMcuHealth;
  wifi: {
    connection_state: "CONNECTED" | "LOST";
    rssi_dbm: number;
    latency_ms: number;
  };
  main_sub_uart: {
    link_state: "ACTIVE" | "FAILED";
    tx_packets: number;
    rx_packets: number;
    crc_errors: number;
    dropped_packets: number;
  };
};

export type ChipDevice = {
  name: string;
  bus: "I2C" | "SPI";
  address?: string;
  chip_select?: string;
  status: "DETECTED" | "MISSING" | "BLOCKED_WRONG_IC_PENDING";
};

export type ChipStatusPayload = {
  i2c_devices: ChipDevice[];
  spi_devices: ChipDevice[];
};

export type PowerHealthPayload = {
  vin_protected_v: number;
  rail_5v_v: number;
  rail_3v3_v: number;
  brownout_detected: boolean;
  power_state: HealthState;
};

export type TelemetryPacket =
  | {
      schema_version: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "SYSTEM_HEALTH_TELEMETRY";
      payload: SystemHealthPayload;
    }
  | {
      schema_version: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "CHIP_STATUS_TELEMETRY";
      payload: ChipStatusPayload;
    }
  | {
      schema_version: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "POWER_HEALTH_TELEMETRY";
      payload: PowerHealthPayload;
    };

export type EngineeringLog = {
  timestamp_utc: string;
  node_id: string;
  event_type: EventType;
  sequence_number: number;
  severity: LogSeverity;
  message: string;
};

export type DeviceKind = "NODE" | "I2C_DEVICE" | "SPI_DEVICE" | "POWER_RAIL";

export type DeviceRegistryEntry = {
  device_id: string;
  display_name: string;
  kind: DeviceKind;
  bus?: "I2C" | "SPI" | "UART" | "WIFI" | "POWER";
  address?: string;
  chip_select?: string;
  node_id?: string;
  health_state: HealthState;
  last_seen_utc: string | null;
  heartbeat_age_ms: number | null;
  online: boolean;
  status_message: string;
};
