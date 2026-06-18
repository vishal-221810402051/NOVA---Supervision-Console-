import type { RtcStatusPayload } from "../types/telemetry";

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
