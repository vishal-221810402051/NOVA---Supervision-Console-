import type {
  EventType,
  HealthState,
  ChipDeviceStatus,
  LinkId,
  LinkState,
  LogSeverity,
  NodeId,
  NodeRole,
  PowerMeasurementStatus,
  PowerState,
  PacketRejectionReason,
  PacketValidationResult,
  PacketValidationWarning,
  SyncState,
  TelemetryPacket,
} from "../types/telemetry";
import { isAcceptedNodeId, isCanonicalNodeId, normalizeNodeId } from "../types/telemetry";

const ALLOWED_SCHEMA_VERSIONS = ["v1.0"] as const;
const ALLOWED_NODE_IDS: NodeId[] = [
  "laptop_console",
  "pi_gateway",
  "esp32_main",
  "esp32_sub",
];
const ALLOWED_LINK_IDS: LinkId[] = [
  "link_laptop_pi",
  "link_pi_main",
  "link_main_sub",
];
const ALLOWED_EVENT_TYPES: EventType[] = [
  "GATEWAY_HEALTH_TELEMETRY",
  "NODE_HEALTH_TELEMETRY",
  "LINK_HEARTBEAT_TELEMETRY",
  "LINK_SYNC_TELEMETRY",
  "SYSTEM_HEALTH_TELEMETRY",
  "CHIP_STATUS_TELEMETRY",
  "POWER_HEALTH_TELEMETRY",
  "RTC_STATUS_TELEMETRY",
  "RTC_SYNC_RESULT_TELEMETRY",
  "TELEMETRY_INTEGRITY_EVENT",
];
const HEALTH_STATES: HealthState[] = ["HEALTHY", "DEGRADED", "OFFLINE", "FAIL_SAFE"];
const POWER_STATES: PowerState[] = [
  "HEALTHY",
  "DEGRADED",
  "OFFLINE",
  "FAIL_SAFE",
  "UNKNOWN",
];
const POWER_MEASUREMENT_STATUSES: PowerMeasurementStatus[] = [
  "MEASURED",
  "ADC_NOT_CONFIGURED",
  "ADC_RAW_DEBUG",
  "ADC_NOT_DETECTED",
  "ADC_READ_ERROR",
  "SENSOR_UNAVAILABLE",
  "INVALID_READING",
];
const LINK_STATES: LinkState[] = [
  "LINK_HEALTHY",
  "LINK_DEGRADED",
  "LINK_OFFLINE",
  "LINK_RECOVERING",
];
const SYNC_STATES: SyncState[] = ["SYNCED", "DESYNCED", "UNKNOWN"];
const NODE_ROLES: NodeRole[] = [
  "SUPERVISION_CONSOLE",
  "GATEWAY",
  "MOTION_CONTROL",
  "SAFETY_QC",
];
const LOG_SEVERITIES: LogSeverity[] = ["INFO", "WARNING", "ERROR", "CRITICAL"];
const CHIP_DEVICE_STATUSES: ChipDeviceStatus[] = [
  "DETECTED",
  "MISSING",
  "UNKNOWN",
  "NOT_VALIDATED",
  "VALIDATION_DISABLED",
  "BUS_NOT_READY",
  "DETECTED_UNCONFIRMED",
  "BLOCKED_WRONG_IC_PENDING",
];
const RTC_STATUSES = [
  "RTC_NOT_DETECTED",
  "RTC_REGISTER_READ_ERROR",
  "RTC_OSCILLATOR_STOPPED",
  "RTC_TIME_VALIDATION_PENDING",
  "RTC_TIME_READ_ERROR",
  "RTC_12H_MODE_UNSUPPORTED",
  "RTC_DETECTED_UNVALIDATED",
] as const;
const RTC_SYNC_RESULTS = ["RTC_SYNC_SUCCESS", "RTC_SYNC_FAILED", "REJECTED"] as const;
const RTC_SYNC_VALIDITY_CLASSES = [
  "RTC_NOT_PRESENT",
  "RTC_READ_ERROR",
  "RTC_PRESENT_TIME_INVALID_OSF",
  "RTC_PRESENT_TIME_UNVALIDATED",
  "RTC_PRESENT_SESSION_ONLY",
  "RTC_PRESENT_TIME_CANDIDATE",
  "RTC_VALIDATION_READY",
] as const;

const LINK_TOPOLOGY: Record<LinkId, { source: NodeId; target: NodeId }> = {
  link_laptop_pi: { source: "pi_gateway", target: "laptop_console" },
  link_pi_main: { source: "pi_gateway", target: "esp32_main" },
  link_main_sub: { source: "esp32_main", target: "esp32_sub" },
};

type PacketRecord = Record<string, unknown>;

export function validateTelemetryPacket(raw: unknown): PacketValidationResult {
  const warnings: PacketValidationWarning[] = [];

  if (!isRecord(raw)) {
    return reject("MISSING_REQUIRED_FIELD", "Telemetry packet is not an object", "ERROR", raw);
  }

  const normalizedRaw = normalizeTelemetryRecord(raw);
  const baseResult = validateBaseMetadata(normalizedRaw, warnings);
  if (!baseResult.ok) return baseResult;

  const packet = normalizedRaw;
  const payload = packet.payload as PacketRecord;
  const eventType = packet.event_type as EventType;
  const sourceNodeId = packet.source_node_id as NodeId;

  const payloadResult = validatePayload(eventType, payload, sourceNodeId, normalizedRaw);
  if (!payloadResult.ok) return payloadResult;

  return {
    ok: true,
    packet: packet as TelemetryPacket,
    warnings,
  };
}

function normalizeTelemetryRecord(raw: PacketRecord): PacketRecord {
  const normalized: PacketRecord = {
    ...raw,
  };

  normalized.source_node_id = normalizeNodeField(raw.source_node_id);
  normalized.node_id = normalizeNodeField(raw.node_id);

  if (isRecord(raw.payload)) {
    normalized.payload = normalizePayloadNodeFields(raw.event_type, raw.payload);
  }

  return normalized;
}

function normalizePayloadNodeFields(eventType: unknown, payload: PacketRecord): PacketRecord {
  const normalizedPayload: PacketRecord = { ...payload };

  normalizedPayload.node_id = normalizeNodeField(payload.node_id);
  normalizedPayload.source_node_id = normalizeNodeField(payload.source_node_id);
  normalizedPayload.target_node_id = normalizeNodeField(payload.target_node_id);
  normalizedPayload.affected_source_node_id = normalizeNodeField(payload.affected_source_node_id);

  if (eventType === "SYSTEM_HEALTH_TELEMETRY") {
    if (isRecord(payload.main_mcu)) {
      normalizedPayload.main_mcu = {
        ...payload.main_mcu,
        node_id: normalizeNodeField(payload.main_mcu.node_id),
      };
    }

    if (isRecord(payload.sub_mcu)) {
      normalizedPayload.sub_mcu = {
        ...payload.sub_mcu,
        node_id: normalizeNodeField(payload.sub_mcu.node_id),
      };
    }
  }

  return normalizedPayload;
}

function normalizeNodeField(value: unknown) {
  return isAcceptedNodeId(value) ? normalizeNodeId(value) : value;
}

function validateBaseMetadata(
  packet: PacketRecord,
  warnings: PacketValidationWarning[]
): PacketValidationResult {
  const schemaVersion = packet.schema_version;
  if (!isNonEmptyString(schemaVersion)) {
    return reject("MISSING_REQUIRED_FIELD", "schema_version is required", "ERROR", packet);
  }
  if (!ALLOWED_SCHEMA_VERSIONS.includes(schemaVersion as "v1.0")) {
    return reject("INVALID_SCHEMA_VERSION", `Unsupported schema_version ${schemaVersion}`, "ERROR", packet);
  }

  if (!isNonEmptyString(packet.stream_id)) {
    return reject("MISSING_REQUIRED_FIELD", "stream_id must be a nonempty string", "ERROR", packet);
  }
  if (!isNonNegativeInteger(packet.global_sequence_number)) {
    return reject("INVALID_NUMERIC_RANGE", "global_sequence_number must be a nonnegative integer", "ERROR", packet);
  }
  if (!isKnownNodeId(packet.source_node_id)) {
    return reject("UNKNOWN_SOURCE_NODE", "source_node_id is missing or unknown", "ERROR", packet);
  }
  if (!isNonNegativeInteger(packet.source_sequence_number)) {
    return reject("INVALID_NUMERIC_RANGE", "source_sequence_number must be a nonnegative integer", "ERROR", packet);
  }
  if (!isValidTimestamp(packet.producer_timestamp_utc)) {
    return reject("INVALID_TIMESTAMP", "producer_timestamp_utc must be a valid timestamp", "ERROR", packet);
  }
  if (!isValidTimestamp(packet.supervisor_received_utc)) {
    return reject("INVALID_TIMESTAMP", "supervisor_received_utc must be a valid timestamp", "ERROR", packet);
  }
  if (!isValidTimestamp(packet.timestamp_utc)) {
    return reject("INVALID_TIMESTAMP", "timestamp_utc must be a valid timestamp", "ERROR", packet);
  }
  if (!isNonNegativeInteger(packet.sequence_number)) {
    return reject("INVALID_NUMERIC_RANGE", "sequence_number must be a nonnegative integer", "ERROR", packet);
  }
  if (packet.sequence_number !== packet.global_sequence_number) {
    return reject(
      "INVALID_NUMERIC_RANGE",
      "sequence_number must match global_sequence_number",
      "ERROR",
      packet
    );
  }
  if (!isNonEmptyString(packet.run_id)) {
    return reject("MISSING_REQUIRED_FIELD", "run_id must be a nonempty string", "ERROR", packet);
  }
  if (!isNonEmptyString(packet.node_id)) {
    return reject("MISSING_REQUIRED_FIELD", "node_id must be a nonempty string", "ERROR", packet);
  }
  if (packet.node_id !== packet.source_node_id) {
    warnings.push(
      warning(
        "NODE_ID_SOURCE_MISMATCH",
        "node_id differs from source_node_id; packet accepted for compatibility"
      )
    );
  }
  if (!isKnownEventType(packet.event_type)) {
    return reject("UNKNOWN_EVENT_TYPE", "event_type is missing or unknown", "ERROR", packet);
  }
  if (!isRecord(packet.payload)) {
    return reject("INVALID_PAYLOAD_SHAPE", "payload must be an object", "ERROR", packet);
  }

  return {
    ok: true,
    packet: packet as TelemetryPacket,
    warnings,
  };
}

function validatePayload(
  eventType: EventType,
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (eventType === "GATEWAY_HEALTH_TELEMETRY") {
    return validateGatewayHealth(payload, packetSourceNodeId, raw);
  }
  if (eventType === "NODE_HEALTH_TELEMETRY") {
    return validateNodeHealth(payload, packetSourceNodeId, raw);
  }
  if (eventType === "LINK_HEARTBEAT_TELEMETRY") {
    return validateLinkHeartbeat(payload, packetSourceNodeId, raw);
  }
  if (eventType === "LINK_SYNC_TELEMETRY") {
    return validateLinkSync(payload, packetSourceNodeId, raw);
  }
  if (eventType === "SYSTEM_HEALTH_TELEMETRY") {
    return validateSystemHealth(payload, raw);
  }
  if (eventType === "CHIP_STATUS_TELEMETRY") {
    return validateChipStatus(payload, raw);
  }
  if (eventType === "POWER_HEALTH_TELEMETRY") {
    return validatePowerHealth(payload, raw);
  }
  if (eventType === "RTC_STATUS_TELEMETRY") {
    return validateRtcStatusPayload(payload, packetSourceNodeId, raw);
  }
  if (eventType === "RTC_SYNC_RESULT_TELEMETRY") {
    return validateRtcSyncResultPayload(payload, packetSourceNodeId, raw);
  }
  return validateTelemetryIntegrityEvent(payload, raw);
}

function validateGatewayHealth(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (packetSourceNodeId !== "pi_gateway" || payload.node_id !== "pi_gateway") {
    return reject("EVENT_SOURCE_MISMATCH", "Gateway health must originate from pi_gateway", "ERROR", raw);
  }
  if (!isHealthState(payload.health_state)) return invalidPayload("Invalid gateway health_state", raw);
  if (!isNonNegativeNumber(payload.uptime_ms)) return invalidNumeric("Invalid gateway uptime_ms", raw);
  if (!isNumberInRange(payload.cpu_percent, 0, 100)) return invalidNumeric("Invalid gateway cpu_percent", raw);
  if (!isNumberInRange(payload.memory_used_percent, 0, 100)) {
    return invalidNumeric("Invalid gateway memory_used_percent", raw);
  }
  if (!isNumberInRange(payload.disk_used_percent, 0, 100)) {
    return invalidNumeric("Invalid gateway disk_used_percent", raw);
  }
  if (!isNonNegativeInteger(payload.buffer_depth)) return invalidNumeric("Invalid gateway buffer_depth", raw);
  if (!isNonNegativeInteger(payload.dropped_packets)) return invalidNumeric("Invalid gateway dropped_packets", raw);
  if (typeof payload.status_message !== "string") return invalidPayload("Gateway status_message must be a string", raw);
  return ok(raw);
}

function validateNodeHealth(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (!isKnownNodeId(payload.node_id)) return reject("UNKNOWN_SOURCE_NODE", "Node health node_id is unknown", "ERROR", raw);
  if (payload.node_id !== packetSourceNodeId) {
    return reject("EVENT_SOURCE_MISMATCH", "Node health payload node_id must match packet source_node_id", "ERROR", raw);
  }
  if (!isNodeRole(payload.role)) return invalidPayload("Invalid node role", raw);
  if (!isHealthState(payload.health_state)) return invalidPayload("Invalid node health_state", raw);
  if (!isNonNegativeNumber(payload.uptime_ms)) return invalidNumeric("Invalid node uptime_ms", raw);
  if (typeof payload.status_message !== "string") return invalidPayload("Node status_message must be a string", raw);
  if (payload.firmware_version !== undefined && typeof payload.firmware_version !== "string") {
    return invalidPayload("firmware_version must be a string when present", raw);
  }
  if (payload.software_version !== undefined && typeof payload.software_version !== "string") {
    return invalidPayload("software_version must be a string when present", raw);
  }
  if (payload.reset_reason !== undefined && typeof payload.reset_reason !== "string") {
    return invalidPayload("reset_reason must be a string when present", raw);
  }
  return ok(raw);
}

function validateLinkHeartbeat(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  const linkResult = validateLinkIdentity(payload, packetSourceNodeId, raw);
  if (!linkResult.ok) return linkResult;

  if (!isNonNegativeInteger(payload.heartbeat_sequence_number)) {
    return invalidNumeric("Invalid heartbeat_sequence_number", raw);
  }
  if (!isPositiveNumber(payload.heartbeat_interval_ms)) return invalidNumeric("Invalid heartbeat_interval_ms", raw);
  if (!isPositiveNumber(payload.timeout_ms)) return invalidNumeric("Invalid timeout_ms", raw);
  if (!isNonNegativeInteger(payload.missed_heartbeat_count)) {
    return invalidNumeric("Invalid missed_heartbeat_count", raw);
  }
  if (!isNonNegativeInteger(payload.missed_heartbeat_threshold)) {
    return invalidNumeric("Invalid missed_heartbeat_threshold", raw);
  }
  if (!isLinkState(payload.link_state)) return invalidPayload("Invalid link_state", raw);
  if (!isSyncState(payload.sync_state)) return invalidPayload("Invalid sync_state", raw);
  if (payload.last_seen_utc !== null && !isValidTimestamp(payload.last_seen_utc)) {
    return reject("INVALID_TIMESTAMP", "Invalid last_seen_utc", "ERROR", raw);
  }
  if (payload.round_trip_latency_ms !== null && !isNonNegativeNumber(payload.round_trip_latency_ms)) {
    return invalidNumeric("Invalid round_trip_latency_ms", raw);
  }
  return ok(raw);
}

function validateLinkSync(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  const linkResult = validateLinkIdentity(payload, packetSourceNodeId, raw);
  if (!linkResult.ok) return linkResult;

  if (!isSyncState(payload.sync_state)) return invalidPayload("Invalid sync_state", raw);
  if (payload.clock_skew_ms !== null && !isFiniteNumber(payload.clock_skew_ms)) {
    return invalidNumeric("Invalid clock_skew_ms", raw);
  }
  if (typeof payload.stream_consistent !== "boolean") {
    return invalidPayload("stream_consistent must be boolean", raw);
  }
  if (typeof payload.source_sequence_continuous !== "boolean") {
    return invalidPayload("source_sequence_continuous must be boolean", raw);
  }
  return ok(raw);
}

function validateSystemHealth(payload: PacketRecord, raw: unknown): PacketValidationResult {
  if (!isRecord(payload.main_mcu) || !isRecord(payload.sub_mcu)) {
    return invalidPayload("Legacy system health requires main_mcu and sub_mcu", raw);
  }
  if (!isRecord(payload.wifi) || !isRecord(payload.main_sub_uart)) {
    return invalidPayload("Legacy system health requires wifi and main_sub_uart", raw);
  }
  const mainResult = validateMcuHealth(payload.main_mcu, raw);
  if (!mainResult.ok) return mainResult;
  const subResult = validateMcuHealth(payload.sub_mcu, raw);
  if (!subResult.ok) return subResult;

  if (payload.wifi.connection_state !== "CONNECTED" && payload.wifi.connection_state !== "LOST") {
    return invalidPayload("Invalid wifi.connection_state", raw);
  }
  if (!isFiniteNumber(payload.wifi.rssi_dbm)) return invalidNumeric("Invalid wifi.rssi_dbm", raw);
  if (!isNonNegativeNumber(payload.wifi.latency_ms)) return invalidNumeric("Invalid wifi.latency_ms", raw);

  if (payload.main_sub_uart.link_state !== "ACTIVE" && payload.main_sub_uart.link_state !== "FAILED") {
    return invalidPayload("Invalid main_sub_uart.link_state", raw);
  }
  if (!isNonNegativeNumber(payload.main_sub_uart.tx_packets)) return invalidNumeric("Invalid main_sub_uart.tx_packets", raw);
  if (!isNonNegativeNumber(payload.main_sub_uart.rx_packets)) return invalidNumeric("Invalid main_sub_uart.rx_packets", raw);
  return ok(raw);
}

function validateMcuHealth(payload: PacketRecord, raw: unknown): PacketValidationResult {
  if (!isHealthState(payload.health_state)) return invalidPayload("Invalid MCU health_state", raw);
  if (payload.firmware_version !== undefined && typeof payload.firmware_version !== "string") {
    return invalidPayload("MCU firmware_version must be a string when present", raw);
  }
  if (payload.uptime_ms !== undefined && !isNonNegativeNumber(payload.uptime_ms)) {
    return invalidNumeric("Invalid MCU uptime_ms", raw);
  }
  return ok(raw);
}

function validateChipStatus(payload: PacketRecord, raw: unknown): PacketValidationResult {
  if (!Array.isArray(payload.i2c_devices)) return invalidPayload("i2c_devices must be an array", raw);
  if (!Array.isArray(payload.spi_devices)) return invalidPayload("spi_devices must be an array", raw);

  for (const device of payload.i2c_devices) {
    if (!validateChipDevice(device, "I2C")) return invalidPayload("Invalid I2C device entry", raw);
  }
  for (const device of payload.spi_devices) {
    if (!validateChipDevice(device, "SPI")) return invalidPayload("Invalid SPI device entry", raw);
  }
  return ok(raw);
}

function validateChipDevice(device: unknown, expectedBus: "I2C" | "SPI") {
  if (!isRecord(device)) return false;
  if (typeof device.name !== "string") return false;
  if (device.bus !== expectedBus) return false;
  if (!CHIP_DEVICE_STATUSES.includes(device.status as ChipDeviceStatus)) {
    return false;
  }
  if (expectedBus === "I2C" && typeof device.address !== "string") return false;
  if (expectedBus === "SPI" && typeof device.chip_select !== "string") return false;
  return true;
}

function validatePowerHealth(payload: PacketRecord, raw: unknown): PacketValidationResult {
  const voltageResults = [
    validatePowerVoltage(payload.vin_protected_v, 0, 30),
    validatePowerVoltage(payload.rail_5v_v, 0, 8),
    validatePowerVoltage(payload.rail_3v3_v, 0, 6),
  ];

  if (voltageResults[0] === "invalid") return invalidNumeric("Invalid vin_protected_v", raw);
  if (voltageResults[1] === "invalid") return invalidNumeric("Invalid rail_5v_v", raw);
  if (voltageResults[2] === "invalid") return invalidNumeric("Invalid rail_3v3_v", raw);

  const hasNullVoltage = voltageResults.includes("null");
  if (hasNullVoltage && !isPowerMeasurementStatus(payload.measurement_status)) {
    return invalidPayload("measurement_status is required when a power voltage is null", raw);
  }
  if (
    payload.measurement_status !== undefined &&
    !isPowerMeasurementStatus(payload.measurement_status)
  ) {
    return invalidPayload("Invalid measurement_status", raw);
  }
  if (typeof payload.brownout_detected !== "boolean") return invalidPayload("brownout_detected must be boolean", raw);
  if (!isPowerState(payload.power_state)) return invalidPayload("Invalid power_state", raw);
  if (
    payload.ads1115_channels !== undefined &&
    !validateAds1115RawChannels(payload.ads1115_channels)
  ) {
    return invalidPayload("Invalid ads1115_channels", raw);
  }
  return ok(raw);
}

function validateRtcStatusPayload(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (packetSourceNodeId !== "esp32_main") {
    return reject("EVENT_SOURCE_MISMATCH", "RTC status must originate from esp32_main", "ERROR", raw);
  }
  if (payload.rtc_device !== "DS3231") return invalidPayload("rtc_device must be DS3231", raw);
  if (payload.rtc_address !== "0x68") return invalidPayload("rtc_address must be 0x68", raw);
  if (typeof payload.rtc_detected !== "boolean") return invalidPayload("rtc_detected must be boolean", raw);
  if (typeof payload.rtc_register_read_ok !== "boolean") {
    return invalidPayload("rtc_register_read_ok must be boolean", raw);
  }
  if (payload.rtc_time_raw !== null && !validateRtcRawTime(payload.rtc_time_raw)) {
    return invalidPayload("Invalid rtc_time_raw", raw);
  }
  if (payload.rtc_time !== null && !validateRtcDecodedTime(payload.rtc_time)) {
    return invalidPayload("Invalid rtc_time", raw);
  }
  if (payload.rtc_time_utc !== null && !isValidTimestamp(payload.rtc_time_utc)) {
    return reject("INVALID_TIMESTAMP", "Invalid rtc_time_utc", "ERROR", raw);
  }
  if (typeof payload.rtc_time_valid !== "boolean") return invalidPayload("rtc_time_valid must be boolean", raw);
  if (!RTC_STATUSES.includes(payload.rtc_status as (typeof RTC_STATUSES)[number])) {
    return invalidPayload("Invalid rtc_status", raw);
  }
  if (
    payload.oscillator_stop_flag !== null &&
    typeof payload.oscillator_stop_flag !== "boolean"
  ) {
    return invalidPayload("oscillator_stop_flag must be boolean or null", raw);
  }
  if (typeof payload.backup_battery_present !== "boolean") {
    return invalidPayload("backup_battery_present must be boolean", raw);
  }
  if (
    payload.backup_battery_configured !== undefined &&
    typeof payload.backup_battery_configured !== "boolean"
  ) {
    return invalidPayload("backup_battery_configured must be boolean when present", raw);
  }
  if (typeof payload.time_source !== "string" || payload.time_source.length === 0) {
    return invalidPayload("time_source must be a nonempty string", raw);
  }
  if (payload.sync_source !== null && typeof payload.sync_source !== "string") {
    return invalidPayload("sync_source must be string or null", raw);
  }
  if (!isNonNegativeNumber(payload.source_uptime_ms)) {
    return invalidNumeric("Invalid source_uptime_ms", raw);
  }
  if (typeof payload.status_message !== "string") return invalidPayload("status_message must be string", raw);
  if (payload.rtc_time_valid) {
    return invalidPayload("rtc_time_valid must remain false in Phase 7.2B", raw);
  }
  return ok(raw);
}

function validateRtcSyncResultPayload(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (packetSourceNodeId !== "esp32_main") {
    return reject("EVENT_SOURCE_MISMATCH", "RTC sync result must originate from esp32_main", "ERROR", raw);
  }
  if (payload.message_type !== "RTC_SYNC_RESULT") return invalidPayload("message_type must be RTC_SYNC_RESULT", raw);
  if (payload.request_message_type !== "RTC_SESSION_SYNC_REQUEST") {
    return invalidPayload("request_message_type must be RTC_SESSION_SYNC_REQUEST", raw);
  }
  if (payload.protocol_version !== 1) return invalidPayload("protocol_version must be 1", raw);
  if (!isRtcSyncSessionId(payload.session_sync_id)) {
    return invalidPayload("Invalid session_sync_id", raw);
  }
  if (typeof payload.accepted !== "boolean") return invalidPayload("accepted must be boolean", raw);
  if (!RTC_SYNC_RESULTS.includes(payload.result as (typeof RTC_SYNC_RESULTS)[number])) {
    return invalidPayload("Invalid RTC sync result", raw);
  }
  if (payload.reason_code !== null && typeof payload.reason_code !== "string") {
    return invalidPayload("reason_code must be string or null", raw);
  }
  if (payload.reason_detail !== null && typeof payload.reason_detail !== "string") {
    return invalidPayload("reason_detail must be string or null", raw);
  }
  if (payload.safety_scope !== "RTC_ONLY") return invalidPayload("safety_scope must be RTC_ONLY", raw);
  if (payload.no_forward_to_sub !== true) return invalidPayload("no_forward_to_sub must be true", raw);
  if (payload.forwarded_to_sub !== false) return invalidPayload("forwarded_to_sub must be false", raw);
  if (payload.control_output_touched !== false) {
    return invalidPayload("control_output_touched must be false", raw);
  }
  if (payload.timestamp_authority_after_sync !== "PI_BACKEND_UTC") {
    return invalidPayload("timestamp_authority_after_sync must be PI_BACKEND_UTC", raw);
  }
  if (!RTC_SYNC_VALIDITY_CLASSES.includes(payload.rtc_validity_class_after_sync as (typeof RTC_SYNC_VALIDITY_CLASSES)[number])) {
    return invalidPayload("Invalid rtc_validity_class_after_sync", raw);
  }
  if (payload.rtc_validity_class_after_sync === "RTC_VALIDATED") {
    return invalidPayload("RTC_VALIDATED is not accepted in Phase 7.2E-5", raw);
  }
  if (typeof payload.rtc_write_attempted !== "boolean") {
    return invalidPayload("rtc_write_attempted must be boolean", raw);
  }
  if (typeof payload.osf_clear_attempted !== "boolean") {
    return invalidPayload("osf_clear_attempted must be boolean", raw);
  }
  if (!isNonNegativeNumber(payload.source_uptime_ms)) {
    return invalidNumeric("Invalid source_uptime_ms", raw);
  }
  if (typeof payload.write_ok !== "boolean") return invalidPayload("write_ok must be boolean", raw);
  if (typeof payload.readback_ok !== "boolean") return invalidPayload("readback_ok must be boolean", raw);
  if (payload.readback_delta_ms !== null && !isFiniteNumber(payload.readback_delta_ms)) {
    return invalidNumeric("readback_delta_ms must be number or null", raw);
  }
  if (payload.osf_before !== null && typeof payload.osf_before !== "boolean") {
    return invalidPayload("osf_before must be boolean or null", raw);
  }
  if (payload.osf_after !== null && typeof payload.osf_after !== "boolean") {
    return invalidPayload("osf_after must be boolean or null", raw);
  }
  if (typeof payload.osf_cleared !== "boolean") return invalidPayload("osf_cleared must be boolean", raw);
  if (typeof payload.status_message !== "string") return invalidPayload("status_message must be string", raw);

  if (payload.result === "RTC_SYNC_SUCCESS") {
    if (payload.accepted !== true) return invalidPayload("Successful sync must be accepted", raw);
    if (payload.write_ok !== true) return invalidPayload("Successful sync must have write_ok=true", raw);
    if (payload.readback_ok !== true) return invalidPayload("Successful sync must have readback_ok=true", raw);
    if (!isFiniteNumber(payload.readback_delta_ms)) {
      return invalidNumeric("Successful sync must include numeric readback_delta_ms", raw);
    }
    if (Math.abs(payload.readback_delta_ms) > 2000) {
      return invalidNumeric("Successful sync readback_delta_ms exceeds tolerance", raw);
    }
    if (payload.osf_cleared !== true) return invalidPayload("Successful sync must clear OSF", raw);
    if (payload.rtc_validity_class_after_sync !== "RTC_VALIDATION_READY") {
      return invalidPayload("Successful sync must end at RTC_VALIDATION_READY", raw);
    }
  }

  return ok(raw);
}

function validateRtcRawTime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isHexByteString(value.seconds_bcd) &&
    isHexByteString(value.minutes_bcd) &&
    isHexByteString(value.hours_bcd) &&
    isHexByteString(value.day_bcd) &&
    isHexByteString(value.date_bcd) &&
    isHexByteString(value.month_bcd) &&
    isHexByteString(value.year_bcd)
  );
}

function validateRtcDecodedTime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNumberInRange(value.year, 2000, 2099) &&
    isNumberInRange(value.month, 1, 12) &&
    isNumberInRange(value.date, 1, 31) &&
    isNumberInRange(value.hour, 0, 23) &&
    isNumberInRange(value.minute, 0, 59) &&
    isNumberInRange(value.second, 0, 59)
  );
}

function isHexByteString(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9A-Fa-f]{2}$/.test(value);
}

function isRtcSyncSessionId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^RTC_SYNC_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
  );
}

function validateAds1115RawChannels(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    validateRawAdcVoltage(value.ain0_v) &&
    validateRawAdcVoltage(value.ain1_v) &&
    validateRawAdcVoltage(value.ain2_v) &&
    validateRawAdcVoltage(value.ain3_v)
  );
}

function validateTelemetryIntegrityEvent(payload: PacketRecord, raw: unknown): PacketValidationResult {
  const anomalyTypes = [
    "DUPLICATE_PACKET",
    "OUT_OF_ORDER_PACKET",
    "SEQUENCE_GAP",
    "SEQUENCE_RESET",
    "SCHEMA_REJECTION",
    "UNKNOWN_SOURCE",
    "UNKNOWN_EVENT",
    "UNKNOWN_LINK",
    "MALFORMED_PACKET",
  ];
  if (!anomalyTypes.includes(payload.anomaly_type as string)) {
    return invalidPayload("Invalid telemetry integrity anomaly_type", raw);
  }
  if (!isLogSeverity(payload.severity)) return invalidPayload("Invalid telemetry integrity severity", raw);
  if (payload.affected_stream_id !== null && typeof payload.affected_stream_id !== "string") {
    return invalidPayload("affected_stream_id must be string or null", raw);
  }
  if (payload.affected_source_node_id !== null && !isKnownNodeId(payload.affected_source_node_id)) {
    return reject("UNKNOWN_SOURCE_NODE", "affected_source_node_id is unknown", "ERROR", raw);
  }
  if (payload.affected_sequence_number !== null && !isFiniteNumber(payload.affected_sequence_number)) {
    return invalidNumeric("affected_sequence_number must be number or null", raw);
  }
  if (typeof payload.details !== "string") return invalidPayload("Telemetry integrity details must be a string", raw);
  return ok(raw);
}

function validateLinkIdentity(
  payload: PacketRecord,
  packetSourceNodeId: NodeId,
  raw: unknown
): PacketValidationResult {
  if (!isKnownLinkId(payload.link_id)) {
    return reject("UNKNOWN_LINK_ID", "link_id is missing or unknown", "ERROR", raw);
  }
  if (!isKnownNodeId(payload.source_node_id)) {
    return reject("UNKNOWN_SOURCE_NODE", "payload source_node_id is missing or unknown", "ERROR", raw);
  }
  if (!isKnownNodeId(payload.target_node_id)) {
    return reject("UNKNOWN_SOURCE_NODE", "payload target_node_id is missing or unknown", "ERROR", raw);
  }
  if (payload.source_node_id !== packetSourceNodeId) {
    return reject("EVENT_SOURCE_MISMATCH", "payload source_node_id must match packet source_node_id", "ERROR", raw);
  }

  const topology = LINK_TOPOLOGY[payload.link_id];
  const endpointsMatchTopology =
    (payload.source_node_id === topology.source && payload.target_node_id === topology.target) ||
    (payload.source_node_id === topology.target && payload.target_node_id === topology.source);

  if (!endpointsMatchTopology) {
    return reject("EVENT_SOURCE_MISMATCH", "link source/target pair does not match canonical topology", "ERROR", raw);
  }

  return ok(raw);
}

function ok(raw: unknown): PacketValidationResult {
  return {
    ok: true,
    packet: raw as TelemetryPacket,
    warnings: [],
  };
}

function reject(
  reason: PacketRejectionReason,
  details: string,
  severity: LogSeverity,
  raw: unknown
): PacketValidationResult {
  return {
    ok: false,
    reason,
    severity,
    details,
    raw,
  };
}

function invalidPayload(details: string, raw: unknown) {
  return reject("INVALID_PAYLOAD_SHAPE", details, "ERROR", raw);
}

function invalidNumeric(details: string, raw: unknown) {
  return reject("INVALID_NUMERIC_RANGE", details, "ERROR", raw);
}

function warning(code: string, details: string): PacketValidationWarning {
  return { code, details };
}

function isRecord(value: unknown): value is PacketRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isHealthState(value: unknown): value is HealthState {
  return HEALTH_STATES.includes(value as HealthState);
}

function isPowerState(value: unknown): value is PowerState {
  return POWER_STATES.includes(value as PowerState);
}

function isPowerMeasurementStatus(value: unknown): value is PowerMeasurementStatus {
  return POWER_MEASUREMENT_STATUSES.includes(value as PowerMeasurementStatus);
}

function validatePowerVoltage(
  value: unknown,
  min: number,
  max: number
): "number" | "null" | "invalid" {
  if (value === null) return "null";
  return isNumberInRange(value, min, max) ? "number" : "invalid";
}

function validateRawAdcVoltage(value: unknown): boolean {
  return value === null || isNumberInRange(value, 0, 4.096);
}

function isLinkState(value: unknown): value is LinkState {
  return LINK_STATES.includes(value as LinkState);
}

function isSyncState(value: unknown): value is SyncState {
  return SYNC_STATES.includes(value as SyncState);
}

function isNodeRole(value: unknown): value is NodeRole {
  return NODE_ROLES.includes(value as NodeRole);
}

function isLogSeverity(value: unknown): value is LogSeverity {
  return LOG_SEVERITIES.includes(value as LogSeverity);
}

function isKnownNodeId(value: unknown): value is NodeId {
  return isCanonicalNodeId(value) && ALLOWED_NODE_IDS.includes(value);
}

function isKnownLinkId(value: unknown): value is LinkId {
  return ALLOWED_LINK_IDS.includes(value as LinkId);
}

function isKnownEventType(value: unknown): value is EventType {
  return ALLOWED_EVENT_TYPES.includes(value as EventType);
}
