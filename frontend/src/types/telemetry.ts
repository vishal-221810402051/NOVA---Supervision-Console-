export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "FAIL_SAFE";

export type PowerMeasurementStatus =
  | "MEASURED"
  | "ADC_NOT_CONFIGURED"
  | "SENSOR_UNAVAILABLE"
  | "INVALID_READING";

export type PowerState = HealthState | "UNKNOWN";

export type ConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "OFFLINE";

export type LogSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type NodeId =
  | "laptop_console"
  | "pi_gateway"
  | "esp32_main"
  | "esp32_sub";

export type LegacyNodeId =
  | "esp32_motion"
  | "esp32_qc";

export type AcceptedNodeId = NodeId | LegacyNodeId;

export const LEGACY_NODE_ALIASES: Record<LegacyNodeId, NodeId> = {
  esp32_motion: "esp32_main",
  esp32_qc: "esp32_sub",
};

export function normalizeNodeId(nodeId: AcceptedNodeId): NodeId {
  return LEGACY_NODE_ALIASES[nodeId as LegacyNodeId] ?? (nodeId as NodeId);
}

export function isCanonicalNodeId(value: unknown): value is NodeId {
  return (
    value === "laptop_console" ||
    value === "pi_gateway" ||
    value === "esp32_main" ||
    value === "esp32_sub"
  );
}

export function isAcceptedNodeId(value: unknown): value is AcceptedNodeId {
  return (
    isCanonicalNodeId(value) ||
    value === "esp32_motion" ||
    value === "esp32_qc"
  );
}

export type NodeRole =
  | "SUPERVISION_CONSOLE"
  | "GATEWAY"
  | "MOTION_CONTROL"
  | "SAFETY_QC";

export type LinkId =
  | "link_laptop_pi"
  | "link_pi_main"
  | "link_main_sub";

export type LinkState =
  | "LINK_HEALTHY"
  | "LINK_DEGRADED"
  | "LINK_OFFLINE"
  | "LINK_RECOVERING";

export type SyncState =
  | "SYNCED"
  | "DESYNCED"
  | "UNKNOWN";

export type TransportKind =
  | "WEBSOCKET"
  | "UART"
  | "WIFI"
  | "UNKNOWN";

export type EventType =
  | "SYSTEM_HEALTH_TELEMETRY"
  | "CHIP_STATUS_TELEMETRY"
  | "POWER_HEALTH_TELEMETRY"
  | "GATEWAY_HEALTH_TELEMETRY"
  | "LINK_HEARTBEAT_TELEMETRY"
  | "LINK_SYNC_TELEMETRY"
  | "NODE_HEALTH_TELEMETRY"
  | "TELEMETRY_INTEGRITY_EVENT";

export type MainMcuHealth = {
  node_id: AcceptedNodeId;
  health_state: HealthState;
  uptime_ms: number;
  firmware_version: string;
  free_heap_bytes: number;
  reset_reason: string;
  brownout_count: number;
};

export type SubMcuHealth = {
  node_id: AcceptedNodeId;
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
  status: ChipDeviceStatus;
};

export type ChipDeviceStatus =
  | "DETECTED"
  | "MISSING"
  | "UNKNOWN"
  | "NOT_VALIDATED"
  | "VALIDATION_DISABLED"
  | "BUS_NOT_READY"
  | "DETECTED_UNCONFIRMED"
  | "BLOCKED_WRONG_IC_PENDING";

export type ChipStatusPayload = {
  i2c_devices: ChipDevice[];
  spi_devices: ChipDevice[];
};

export type PowerHealthPayload = {
  vin_protected_v: number | null;
  rail_5v_v: number | null;
  rail_3v3_v: number | null;
  brownout_detected: boolean;
  power_state: PowerState;
  measurement_status?: PowerMeasurementStatus;
};

export type GatewayHealthPayload = {
  node_id: "pi_gateway";
  health_state: HealthState;
  uptime_ms: number;
  cpu_percent: number;
  memory_used_percent: number;
  disk_used_percent: number;
  buffer_depth: number;
  dropped_packets: number;
  status_message: string;
};

export type LinkHeartbeatPayload = {
  link_id: LinkId;
  source_node_id: NodeId;
  target_node_id: NodeId;
  heartbeat_sequence_number: number;
  heartbeat_interval_ms: number;
  timeout_ms: number;
  missed_heartbeat_count: number;
  missed_heartbeat_threshold: number;
  link_state: LinkState;
  sync_state: SyncState;
  last_seen_utc: string | null;
  round_trip_latency_ms: number | null;
};

export type LinkSyncPayload = {
  link_id: LinkId;
  source_node_id: NodeId;
  target_node_id: NodeId;
  sync_state: SyncState;
  clock_skew_ms: number | null;
  stream_consistent: boolean;
  source_sequence_continuous: boolean;
};

export type NodeHealthPayload = {
  node_id: NodeId;
  role: NodeRole;
  health_state: HealthState;
  uptime_ms: number;
  software_version?: string;
  firmware_version?: string;
  reset_reason?: string;
  status_message: string;
};

export type PacketRejectionReason =
  | "INVALID_JSON"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "UNKNOWN_EVENT_TYPE"
  | "UNKNOWN_SOURCE_NODE"
  | "UNKNOWN_LINK_ID"
  | "INVALID_PAYLOAD_SHAPE"
  | "INVALID_TIMESTAMP"
  | "INVALID_NUMERIC_RANGE"
  | "EVENT_SOURCE_MISMATCH";

export type PacketValidationWarning = {
  code: string;
  details: string;
};

export type TelemetryIntegrityEventPayload = {
  anomaly_type:
    | "DUPLICATE_PACKET"
    | "OUT_OF_ORDER_PACKET"
    | "SEQUENCE_GAP"
    | "SEQUENCE_RESET"
    | "SCHEMA_REJECTION"
    | "UNKNOWN_SOURCE"
    | "UNKNOWN_EVENT"
    | "UNKNOWN_LINK"
    | "MALFORMED_PACKET";
  severity: LogSeverity;
  affected_stream_id: string | null;
  affected_source_node_id: NodeId | null;
  affected_sequence_number: number | null;
  details: string;
};

export type TelemetryPacket =
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "SYSTEM_HEALTH_TELEMETRY";
      payload: SystemHealthPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "CHIP_STATUS_TELEMETRY";
      payload: ChipStatusPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "POWER_HEALTH_TELEMETRY";
      payload: PowerHealthPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "GATEWAY_HEALTH_TELEMETRY";
      payload: GatewayHealthPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "LINK_HEARTBEAT_TELEMETRY";
      payload: LinkHeartbeatPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "LINK_SYNC_TELEMETRY";
      payload: LinkSyncPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "NODE_HEALTH_TELEMETRY";
      payload: NodeHealthPayload;
    }
  | {
      schema_version: string;
      stream_id: string;
      global_sequence_number: number;
      source_node_id: string;
      source_sequence_number: number;
      producer_timestamp_utc: string;
      supervisor_received_utc: string;
      timestamp_utc: string;
      sequence_number: number;
      run_id: string;
      node_id: string;
      event_type: "TELEMETRY_INTEGRITY_EVENT";
      payload: TelemetryIntegrityEventPayload;
    };

export type PacketValidationResult =
  | {
      ok: true;
      packet: TelemetryPacket;
      warnings: PacketValidationWarning[];
    }
  | {
      ok: false;
      reason: PacketRejectionReason;
      severity: LogSeverity;
      details: string;
      raw?: unknown;
    };

export type EngineeringLog = {
  timestamp_utc: string;
  node_id: string;
  source_node_id?: string;
  event_type: EventType;
  sequence_number: number;
  global_sequence_number?: number;
  source_sequence_number?: number;
  stream_id?: string;
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

export type HealthCheckResult = "PASS" | "FAIL" | "WARNING";

export type HealthCheckCategory =
  | "TOPOLOGY"
  | "GATEWAY"
  | "LINK"
  | "NODE"
  | "STREAM"
  | "INTEGRITY"
  | "CHIP"
  | "POWER"
  | "EXPECTED_WARNING"
  | "LEGACY";

export type HealthCheckSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type HealthCheckRule = {
  rule_id: string;
  label: string;
  result: HealthCheckResult;
  details: string;
  category?: HealthCheckCategory;
  severity?: HealthCheckSeverity;
  evidence?: {
    source: string;
    timestamp_utc?: string | null;
    value?: string | number | boolean | null;
  };
};
