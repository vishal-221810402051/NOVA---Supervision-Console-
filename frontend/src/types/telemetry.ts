export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "FAIL_SAFE";

export type PowerMeasurementStatus =
  | "MEASURED"
  | "ADC_NOT_CONFIGURED"
  | "ADC_RAW_DEBUG"
  | "ADC_NOT_DETECTED"
  | "ADC_READ_ERROR"
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
  | "RTC_STATUS_TELEMETRY"
  | "RTC_SYNC_RESULT_TELEMETRY"
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
  adc_source?: string;
  adc_address?: string;
  adc_mode?: string;
  ads1115_channels?: {
    ain0_v: number | null;
    ain1_v: number | null;
    ain2_v: number | null;
    ain3_v: number | null;
  };
};

export type RtcStatus =
  | "RTC_NOT_DETECTED"
  | "RTC_REGISTER_READ_ERROR"
  | "RTC_OSCILLATOR_STOPPED"
  | "RTC_TIME_VALIDATION_PENDING"
  | "RTC_TIME_READ_ERROR"
  | "RTC_12H_MODE_UNSUPPORTED"
  | "RTC_DETECTED_UNVALIDATED";

export type RtcRawTime = {
  seconds_bcd: string;
  minutes_bcd: string;
  hours_bcd: string;
  day_bcd: string;
  date_bcd: string;
  month_bcd: string;
  year_bcd: string;
};

export type RtcDecodedTime = {
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
  second: number;
};

export type RtcStatusPayload = {
  rtc_device: "DS3231";
  rtc_address: "0x68";
  rtc_detected: boolean;
  rtc_register_read_ok: boolean;
  rtc_time_raw: RtcRawTime | null;
  rtc_time: RtcDecodedTime | null;
  rtc_time_utc: string | null;
  rtc_time_valid: boolean;
  rtc_status: RtcStatus;
  oscillator_stop_flag: boolean | null;
  backup_battery_present: boolean;
  backup_battery_configured?: boolean;
  time_source: string;
  sync_source: string | null;
  source_uptime_ms: number;
  status_message: string;
};

export type RtcSyncResultValue =
  | "RTC_SYNC_SUCCESS"
  | "RTC_SYNC_FAILED"
  | "REJECTED";

export type RtcSyncValidityClass =
  | "RTC_NOT_PRESENT"
  | "RTC_READ_ERROR"
  | "RTC_PRESENT_TIME_INVALID_OSF"
  | "RTC_PRESENT_TIME_UNVALIDATED"
  | "RTC_PRESENT_SESSION_ONLY"
  | "RTC_PRESENT_TIME_CANDIDATE"
  | "RTC_VALIDATION_READY";

export type RtcSyncResultPayload = {
  message_type: "RTC_SYNC_RESULT";
  protocol_version: 1;
  request_message_type: "RTC_SESSION_SYNC_REQUEST";
  session_sync_id: string;
  accepted: boolean;
  result: RtcSyncResultValue;
  reason_code: string | null;
  reason_detail: string | null;
  safety_scope: "RTC_ONLY";
  no_forward_to_sub: true;
  rtc_write_attempted: boolean;
  osf_clear_attempted: boolean;
  forwarded_to_sub: false;
  control_output_touched: false;
  source_uptime_ms: number;
  write_ok: boolean;
  readback_ok: boolean;
  readback_delta_ms: number | null;
  osf_before: boolean | null;
  osf_after: boolean | null;
  osf_cleared: boolean;
  rtc_validity_class_after_sync: RtcSyncValidityClass;
  timestamp_authority_after_sync: "PI_BACKEND_UTC";
  status_message: string;
};

export type RtcRetentionStatus =
  | "RETENTION_NOT_CHECKED"
  | "RETENTION_CHECK_PENDING"
  | "RETENTION_EVIDENCE_READY"
  | "RETENTION_OSF_REASSERTED"
  | "RETENTION_TIME_NOT_ADVANCING"
  | "RETENTION_DELTA_TOO_LARGE"
  | "RETENTION_INSUFFICIENT_EVIDENCE";

export type RtcRetentionEvidence = {
  retention_check_available: boolean;
  retention_status: RtcRetentionStatus;
  last_sync_session_id: string | null;
  last_sync_result_utc: string | null;
  current_rtc_time_utc: string | null;
  current_pi_utc: string | null;
  rtc_pi_delta_ms: number | null;
  oscillator_stop_flag: boolean | null;
  backup_battery_present: boolean | null;
  backup_battery_configured: boolean | null;
  rtc_time_advanced_since_sync: boolean | null;
  timestamp_authority: "PI_BACKEND_UTC";
  rtc_validated: false;
  required_next_action: string;
  evidence_note: string;
};

export type RtcDriftStatus =
  | "DRIFT_SYNC_RESULT_MISSING"
  | "DRIFT_SETTLING_AFTER_SYNC"
  | "DRIFT_BASELINE_PENDING"
  | "DRIFT_BASELINE_UNSTABLE"
  | "DRIFT_OBSERVATION_IN_PROGRESS"
  | "DRIFT_EVIDENCE_READY"
  | "DRIFT_EXCEEDS_TOLERANCE"
  | "DRIFT_OSF_REASSERTED"
  | "DRIFT_TIME_NOT_ADVANCING"
  | "DRIFT_INSUFFICIENT_EVIDENCE";

export type RtcDriftEvidence = {
  drift_check_available: boolean;
  drift_status: RtcDriftStatus;
  observation_window_target_seconds: number;
  observation_elapsed_seconds: number | null;
  sample_count: number;
  baseline_persisted_in_session: boolean;
  raw_event_store_capacity: number | null;
  raw_event_store_current_events: number | null;
  raw_event_store_dropped_old_events: number | null;
  baseline_min_settle_seconds: number;
  baseline_candidate_count: number;
  baseline_rejected_count: number;
  baseline_rejection_reason: string | null;
  baseline_source: string | null;
  baseline_rtc_time_utc: string | null;
  baseline_pi_utc: string | null;
  baseline_rtc_pi_delta_ms: number | null;
  baseline_delta_vs_sync_readback_ms: number | null;
  sync_readback_delta_ms: number | null;
  baseline_selected_after_sync_seconds: number | null;
  current_rtc_time_utc: string | null;
  current_pi_utc: string | null;
  current_rtc_pi_delta_ms: number | null;
  drift_ms: number | null;
  drift_abs_ms: number | null;
  drift_rate_ms_per_hour: number | null;
  drift_rate_ppm: number | null;
  oscillator_stop_flag: boolean | null;
  rtc_time_advanced: boolean | null;
  timestamp_authority: "PI_BACKEND_UTC";
  rtc_validated: false;
  required_next_action: string;
  evidence_note: string;
  tolerance_ms: number;
};

export type RtcDriftBaseline = {
  baseline_source: string;
  baseline_rtc_time_utc: string;
  baseline_pi_utc: string;
  baseline_rtc_pi_delta_ms: number;
  baseline_selected_after_sync_seconds: number;
  baseline_delta_vs_sync_readback_ms: number | null;
  sync_readback_delta_ms: number | null;
  sync_session_id: string;
  sync_timestamp_utc: string;
  stream_id: string;
  source_node_id: string;
  baseline_min_settle_seconds: number;
  created_at_report_only_utc: string;
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
      event_type: "RTC_STATUS_TELEMETRY";
      payload: RtcStatusPayload;
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
      event_type: "RTC_SYNC_RESULT_TELEMETRY";
      payload: RtcSyncResultPayload;
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
