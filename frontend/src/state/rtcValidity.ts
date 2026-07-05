import type {
  RtcRetentionEvidence,
  RtcRetentionStatus,
  RtcStatusPayload,
  TelemetryPacket,
} from "../types/telemetry";

export type RtcValidityClass =
  | "RTC_NOT_PRESENT"
  | "RTC_READ_ERROR"
  | "RTC_PRESENT_TIME_INVALID_OSF"
  | "RTC_PRESENT_TIME_UNVALIDATED"
  | "RTC_PRESENT_SESSION_ONLY"
  | "RTC_PRESENT_TIME_CANDIDATE"
  | "RTC_VALIDATION_READY"
  | "RTC_VALIDATED";

export type RtcTimestampAuthority = "PI_BACKEND_UTC";

export type RtcRequiredNextAction =
  | "CHECK_RTC_HARDWARE_CONNECTION"
  | "RESTORE_RTC_REGISTER_READ"
  | "PI_TO_RTC_SESSION_SYNC_REQUIRED"
  | "VERIFY_RTC_BACKUP_BATTERY"
  | "RTC_TIME_INITIALIZATION_OR_VALIDATION_REQUIRED"
  | "COMPARE_RTC_WITH_PI_UTC"
  | "RUN_RTC_VALIDATION"
  | "NONE";

export type RtcPhaseVerdict =
  | "RTC_NOT_AVAILABLE"
  | "RTC_PRESENT_BUT_UNREADABLE"
  | "RTC_PRESENT_BUT_TIME_INVALID"
  | "RTC_PRESENT_SESSION_ONLY"
  | "RTC_PRESENT_BUT_TIME_UNVALIDATED"
  | "RTC_TIME_CANDIDATE"
  | "RTC_VALIDATION_READY"
  | "RTC_VALIDATED";

export type RtcValidityEvidence = {
  rtc_validity_class: RtcValidityClass;
  rtc_validity_reason: string;
  timestamp_authority: RtcTimestampAuthority;
  timestamp_authority_source: "PI_GATEWAY_SYSTEM_CLOCK";
  rtc_can_be_timestamp_authority: false;
  required_next_action: RtcRequiredNextAction;
  phase_7_2c_verdict: RtcPhaseVerdict;
  evidence_note: string;
};

const DEFAULT_AUTHORITY = {
  timestamp_authority: "PI_BACKEND_UTC",
  timestamp_authority_source: "PI_GATEWAY_SYSTEM_CLOCK",
  rtc_can_be_timestamp_authority: false,
} as const;

export function deriveRtcValidity(
  rtcStatus: RtcStatusPayload | null
): RtcValidityEvidence {
  if (!rtcStatus || !rtcStatus.rtc_detected) {
    return evidence(
      "RTC_NOT_PRESENT",
      "DS3231 RTC telemetry is unavailable or the device is not detected.",
      "CHECK_RTC_HARDWARE_CONNECTION",
      "RTC_NOT_AVAILABLE",
      "DS3231 is not available as RTC evidence. Pi/backend UTC remains timestamp authority."
    );
  }

  if (
    !rtcStatus.rtc_register_read_ok ||
    rtcStatus.rtc_status === "RTC_REGISTER_READ_ERROR" ||
    rtcStatus.rtc_status === "RTC_TIME_READ_ERROR" ||
    rtcStatus.rtc_status === "RTC_12H_MODE_UNSUPPORTED"
  ) {
    return evidence(
      "RTC_READ_ERROR",
      "DS3231 is detected, but its time/status evidence cannot be decoded reliably.",
      "RESTORE_RTC_REGISTER_READ",
      "RTC_PRESENT_BUT_UNREADABLE",
      "DS3231 is present but does not provide usable time evidence. Pi/backend UTC remains timestamp authority."
    );
  }

  if (rtcStatus.oscillator_stop_flag === true) {
    return evidence(
      "RTC_PRESENT_TIME_INVALID_OSF",
      "DS3231 is readable, but oscillator stop flag is set; RTC time continuity is invalid.",
      "PI_TO_RTC_SESSION_SYNC_REQUIRED",
      "RTC_PRESENT_BUT_TIME_INVALID",
      "DS3231 is detected and readable, but oscillator stop flag is set. RTC time is invalid and cannot be used as timestamp authority until synchronized and validated."
    );
  }

  const batteryConfigured =
    rtcStatus.backup_battery_configured ?? rtcStatus.backup_battery_present;
  if (!batteryConfigured || !rtcStatus.backup_battery_present) {
    return evidence(
      "RTC_PRESENT_SESSION_ONLY",
      "DS3231 is readable, but backup battery continuity is not established.",
      "VERIFY_RTC_BACKUP_BATTERY",
      "RTC_PRESENT_SESSION_ONLY",
      "DS3231 evidence is limited to the powered session. Pi/backend UTC remains timestamp authority."
    );
  }

  if (!rtcStatus.rtc_time) {
    return evidence(
      "RTC_PRESENT_TIME_UNVALIDATED",
      "DS3231 is readable and OSF is clear, but no parsed RTC time is available.",
      "RTC_TIME_INITIALIZATION_OR_VALIDATION_REQUIRED",
      "RTC_PRESENT_BUT_TIME_UNVALIDATED",
      "DS3231 is present without validated time evidence. Pi/backend UTC remains timestamp authority."
    );
  }

  if (rtcStatus.rtc_time_valid) {
    return evidence(
      "RTC_VALIDATED",
      "DS3231 time has been marked valid by a later validation phase.",
      "NONE",
      "RTC_VALIDATED",
      "RTC validation evidence exists, but this Phase 7.2C helper does not transfer timestamp authority."
    );
  }

  return evidence(
    "RTC_PRESENT_TIME_CANDIDATE",
    "DS3231 is readable, OSF is clear, and parsed time exists, but it has not been compared with Pi UTC.",
    "COMPARE_RTC_WITH_PI_UTC",
    "RTC_TIME_CANDIDATE",
    "DS3231 time is a validation candidate only. Pi/backend UTC remains timestamp authority."
  );
}

type RtcStatusPacket = Extract<
  TelemetryPacket,
  { event_type: "RTC_STATUS_TELEMETRY" }
>;

type RtcSyncResultPacket = Extract<
  TelemetryPacket,
  { event_type: "RTC_SYNC_RESULT_TELEMETRY" }
>;

export function deriveRtcRetentionEvidence({
  latestRtcStatusPacket,
  latestRtcSyncResult,
  toleranceMs = 5000,
}: {
  latestRtcStatusPacket: RtcStatusPacket | null;
  latestRtcSyncResult: RtcSyncResultPacket | null;
  toleranceMs?: number;
}): RtcRetentionEvidence {
  if (!latestRtcStatusPacket) {
    return retentionEvidence({
      retention_check_available: false,
      retention_status: "RETENTION_INSUFFICIENT_EVIDENCE",
      required_next_action: "CAPTURE_RTC_STATUS_TELEMETRY",
      evidence_note:
        "No RTC status telemetry packet is available for retention comparison.",
    });
  }

  const rtcStatus = latestRtcStatusPacket.payload;
  const currentPiUtc = getPacketUtc(latestRtcStatusPacket);
  const currentRtcTimeUtc = deriveRtcTimeUtc(rtcStatus);
  const latestSyncPayload = latestRtcSyncResult?.payload ?? null;
  const lastSyncResultUtc = latestRtcSyncResult
    ? getPacketUtc(latestRtcSyncResult)
    : null;
  const lastSyncSessionId = latestSyncPayload?.session_sync_id ?? null;
  const backupBatteryConfigured =
    rtcStatus.backup_battery_configured ?? rtcStatus.backup_battery_present;

  const base = {
    last_sync_session_id: lastSyncSessionId,
    last_sync_result_utc: lastSyncResultUtc,
    current_rtc_time_utc: currentRtcTimeUtc,
    current_pi_utc: currentPiUtc,
    oscillator_stop_flag: rtcStatus.oscillator_stop_flag,
    backup_battery_present: rtcStatus.backup_battery_present,
    backup_battery_configured: backupBatteryConfigured,
  };

  if (
    !latestSyncPayload ||
    latestSyncPayload.result !== "RTC_SYNC_SUCCESS" ||
    latestSyncPayload.accepted !== true
  ) {
    return retentionEvidence({
      ...base,
      retention_check_available: false,
      retention_status: "RETENTION_CHECK_PENDING",
      required_next_action: "CAPTURE_RTC_SYNC_SUCCESS",
      evidence_note:
        "No RTC_SYNC_SUCCESS result is available in this frontend session; run or capture RTC_SYNC_SUCCESS before retention comparison.",
    });
  }

  if (!rtcStatus.rtc_detected || !rtcStatus.rtc_register_read_ok) {
    return retentionEvidence({
      ...base,
      retention_check_available: false,
      retention_status: "RETENTION_INSUFFICIENT_EVIDENCE",
      required_next_action: "RESTORE_RTC_STATUS_TELEMETRY",
      evidence_note:
        "RTC status telemetry is present, but DS3231 detection or register read evidence is not sufficient for retention comparison.",
    });
  }

  if (rtcStatus.oscillator_stop_flag === true) {
    return retentionEvidence({
      ...base,
      retention_check_available: true,
      retention_status: "RETENTION_OSF_REASSERTED",
      required_next_action: "INVESTIGATE_RTC_BACKUP_POWER",
      evidence_note:
        "DS3231 oscillator stop flag is asserted after synchronization/restart; retention is not proven.",
    });
  }

  if (!currentRtcTimeUtc || !currentPiUtc) {
    return retentionEvidence({
      ...base,
      retention_check_available: false,
      retention_status: "RETENTION_INSUFFICIENT_EVIDENCE",
      required_next_action: "CAPTURE_VALID_RTC_AND_PI_TIMESTAMPS",
      evidence_note:
        "RTC status telemetry is present, but a valid RTC UTC value or Pi/backend UTC packet timestamp is missing.",
    });
  }

  const rtcMs = Date.parse(currentRtcTimeUtc);
  const piMs = Date.parse(currentPiUtc);
  const syncMs = lastSyncResultUtc ? Date.parse(lastSyncResultUtc) : NaN;
  const rtcPiDeltaMs =
    Number.isFinite(rtcMs) && Number.isFinite(piMs) ? rtcMs - piMs : null;
  const rtcTimeAdvancedSinceSync =
    Number.isFinite(rtcMs) && Number.isFinite(syncMs)
      ? rtcMs >= syncMs - toleranceMs
      : null;

  if (rtcTimeAdvancedSinceSync === false) {
    return retentionEvidence({
      ...base,
      retention_check_available: true,
      retention_status: "RETENTION_TIME_NOT_ADVANCING",
      rtc_pi_delta_ms: rtcPiDeltaMs,
      rtc_time_advanced_since_sync: rtcTimeAdvancedSinceSync,
      required_next_action: "VERIFY_RTC_TIME_ADVANCEMENT_AFTER_RESTART",
      evidence_note:
        "DS3231 time is readable and OSF is clear, but the RTC time has not advanced beyond the last sync result window.",
    });
  }

  if (rtcPiDeltaMs === null) {
    return retentionEvidence({
      ...base,
      retention_check_available: false,
      retention_status: "RETENTION_INSUFFICIENT_EVIDENCE",
      rtc_time_advanced_since_sync: rtcTimeAdvancedSinceSync,
      required_next_action: "CAPTURE_VALID_RTC_AND_PI_TIMESTAMPS",
      evidence_note:
        "RTC/Pi delta could not be computed from the available telemetry timestamps.",
    });
  }

  if (Math.abs(rtcPiDeltaMs) > toleranceMs) {
    return retentionEvidence({
      ...base,
      retention_check_available: true,
      retention_status: "RETENTION_DELTA_TOO_LARGE",
      rtc_pi_delta_ms: rtcPiDeltaMs,
      rtc_time_advanced_since_sync: rtcTimeAdvancedSinceSync,
      required_next_action: "CHECK_RTC_RETENTION_AND_DRIFT",
      evidence_note:
        "DS3231 time is readable and OSF is clear, but RTC/Pi delta exceeds Phase 7.2F tolerance.",
    });
  }

  return retentionEvidence({
    ...base,
    retention_check_available: true,
    retention_status: "RETENTION_EVIDENCE_READY",
    rtc_pi_delta_ms: rtcPiDeltaMs,
    rtc_time_advanced_since_sync: rtcTimeAdvancedSinceSync,
    required_next_action: "PROCEED_TO_RTC_DRIFT_VALIDATION",
    evidence_note:
      "DS3231 retained a plausible advancing time after synchronization and remains within Phase 7.2F tolerance. Pi/backend UTC remains timestamp authority; RTC_VALIDATED is not assigned.",
  });
}

function retentionEvidence(
  input: Partial<RtcRetentionEvidence> & {
    retention_check_available: boolean;
    retention_status: RtcRetentionStatus;
    required_next_action: string;
    evidence_note: string;
  }
): RtcRetentionEvidence {
  return {
    retention_check_available: input.retention_check_available,
    retention_status: input.retention_status,
    last_sync_session_id: input.last_sync_session_id ?? null,
    last_sync_result_utc: input.last_sync_result_utc ?? null,
    current_rtc_time_utc: input.current_rtc_time_utc ?? null,
    current_pi_utc: input.current_pi_utc ?? null,
    rtc_pi_delta_ms: input.rtc_pi_delta_ms ?? null,
    oscillator_stop_flag: input.oscillator_stop_flag ?? null,
    backup_battery_present: input.backup_battery_present ?? null,
    backup_battery_configured: input.backup_battery_configured ?? null,
    rtc_time_advanced_since_sync: input.rtc_time_advanced_since_sync ?? null,
    timestamp_authority: "PI_BACKEND_UTC",
    rtc_validated: false,
    required_next_action: input.required_next_action,
    evidence_note: input.evidence_note,
  };
}

function getPacketUtc(packet: TelemetryPacket): string | null {
  if (isValidTimestamp(packet.timestamp_utc)) return packet.timestamp_utc;
  if (isValidTimestamp(packet.supervisor_received_utc)) {
    return packet.supervisor_received_utc;
  }
  if (isValidTimestamp(packet.producer_timestamp_utc)) {
    return packet.producer_timestamp_utc;
  }
  return null;
}

function deriveRtcTimeUtc(rtcStatus: RtcStatusPayload): string | null {
  const time = rtcStatus.rtc_time;
  if (!time) return null;

  const utcMs = Date.UTC(
    time.year,
    time.month - 1,
    time.date,
    time.hour,
    time.minute,
    time.second
  );
  if (!Number.isFinite(utcMs)) return null;

  const date = new Date(utcMs);
  if (
    time.year < 2026 ||
    time.year > 2099 ||
    date.getUTCFullYear() !== time.year ||
    date.getUTCMonth() !== time.month - 1 ||
    date.getUTCDate() !== time.date ||
    date.getUTCHours() !== time.hour ||
    date.getUTCMinutes() !== time.minute ||
    date.getUTCSeconds() !== time.second
  ) {
    return null;
  }

  return date.toISOString();
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function evidence(
  rtc_validity_class: RtcValidityClass,
  rtc_validity_reason: string,
  required_next_action: RtcRequiredNextAction,
  phase_7_2c_verdict: RtcPhaseVerdict,
  evidence_note: string
): RtcValidityEvidence {
  return {
    rtc_validity_class,
    rtc_validity_reason,
    ...DEFAULT_AUTHORITY,
    required_next_action,
    phase_7_2c_verdict,
    evidence_note,
  };
}
