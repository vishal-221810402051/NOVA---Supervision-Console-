import type {
  RtcDriftEvidence,
  RtcDriftStatus,
  RtcRetentionEvidence,
  RtcRetentionStatus,
  RtcStatusPayload,
  TelemetryPacket,
} from "../types/telemetry";
import type { TelemetryEventRecord } from "./eventStore";

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

export const PHASE_7_2G_DRIFT_TARGET_SECONDS = 1800;
export const PHASE_7_2G_DRIFT_TOLERANCE_MS = 3000;
export const PHASE_7_2G_BASELINE_MIN_SETTLE_SECONDS = 30;
export const PHASE_7_2G_BASELINE_READBACK_TOLERANCE_MS = 3000;

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

type ValidDriftSample = {
  packet: RtcStatusPacket;
  piUtc: string;
  piMs: number;
  rtcUtc: string;
  rtcMs: number;
};

type BaselineSelection = {
  baseline: ValidDriftSample | null;
  samplesAfterBaseline: ValidDriftSample[];
  candidateCount: number;
  rejectedCount: number;
  rejectionReason: string | null;
  selectedAfterSyncSeconds: number | null;
  deltaVsSyncReadbackMs: number | null;
  hasPostSyncEvidencePastSettle: boolean;
};

export function deriveRtcDriftEvidence({
  latestRtcSyncResult,
  eventStore = [],
  rtcStatusPackets,
  observationWindowTargetSeconds = PHASE_7_2G_DRIFT_TARGET_SECONDS,
  toleranceMs = PHASE_7_2G_DRIFT_TOLERANCE_MS,
}: {
  latestRtcSyncResult: RtcSyncResultPacket | null;
  eventStore?: TelemetryEventRecord[];
  rtcStatusPackets?: RtcStatusPacket[];
  observationWindowTargetSeconds?: number;
  toleranceMs?: number;
}): RtcDriftEvidence {
  const latestSyncPayload = latestRtcSyncResult?.payload ?? null;

  if (
    !latestRtcSyncResult ||
    !latestSyncPayload ||
    latestSyncPayload.result !== "RTC_SYNC_SUCCESS" ||
    latestSyncPayload.accepted !== true
  ) {
    return driftEvidence({
      drift_check_available: false,
      drift_status: "DRIFT_SYNC_RESULT_MISSING",
      required_next_action: "CAPTURE_RTC_SYNC_SUCCESS",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence is blocked because no RTC_SYNC_SUCCESS is available."
      ),
      observationWindowTargetSeconds,
      toleranceMs,
    });
  }

  const syncUtc = getPacketTimestampUtc(latestRtcSyncResult);
  const syncMs = syncUtc ? Date.parse(syncUtc) : NaN;
  const syncReadbackDeltaMs =
    typeof latestSyncPayload.readback_delta_ms === "number" &&
    Number.isFinite(latestSyncPayload.readback_delta_ms)
      ? latestSyncPayload.readback_delta_ms
      : null;
  if (!syncUtc || !Number.isFinite(syncMs)) {
    return driftEvidence({
      drift_check_available: false,
      drift_status: "DRIFT_INSUFFICIENT_EVIDENCE",
      required_next_action: "CAPTURE_VALID_RTC_SYNC_TIMESTAMP",
      evidence_note:
        buildDriftEvidenceNote(
          "Phase 7.2G-A drift evidence cannot use the latest RTC_SYNC_SUCCESS because packet timestamp_utc is missing or invalid."
        ),
      observationWindowTargetSeconds,
      toleranceMs,
      sync_readback_delta_ms: syncReadbackDeltaMs,
    });
  }

  const selection = selectDriftBaseline({
    syncPacket: latestRtcSyncResult,
    syncMs,
    syncReadbackDeltaMs,
    eventStore,
    rtcStatusPackets,
  });

  const baselineDiagnostics = {
    baseline_candidate_count: selection.candidateCount,
    baseline_rejected_count: selection.rejectedCount,
    baseline_rejection_reason: selection.rejectionReason,
    baseline_selected_after_sync_seconds: selection.selectedAfterSyncSeconds,
    baseline_delta_vs_sync_readback_ms: selection.deltaVsSyncReadbackMs,
    sync_readback_delta_ms: syncReadbackDeltaMs,
  };

  if (!selection.hasPostSyncEvidencePastSettle) {
    return driftEvidence({
      drift_check_available: false,
      drift_status: "DRIFT_SETTLING_AFTER_SYNC",
      sample_count: selection.candidateCount,
      ...baselineDiagnostics,
      required_next_action: "WAIT_FOR_30S_BASELINE_SETTLE",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence is waiting for the 30-second post-sync baseline settle window."
      ),
      observationWindowTargetSeconds,
      toleranceMs,
    });
  }

  if (!selection.baseline) {
    return driftEvidence({
      drift_check_available: false,
      drift_status: "DRIFT_BASELINE_UNSTABLE",
      sample_count: selection.candidateCount,
      ...baselineDiagnostics,
      required_next_action: "INVESTIGATE_RTC_BASELINE_STABILITY",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence found post-settle RTC_STATUS candidates, but no stable baseline passed the hardening gates."
      ),
      observationWindowTargetSeconds,
      toleranceMs,
    });
  }

  const baseline = selection.baseline;
  const samples = [baseline, ...selection.samplesAfterBaseline];

  if (samples.length < 2) {
    return driftEvidence({
      drift_check_available: false,
      drift_status: "DRIFT_BASELINE_PENDING",
      sample_count: samples.length,
      baseline_source: buildBaselineSource(baseline.packet),
      baseline_rtc_time_utc: baseline.rtcUtc,
      baseline_pi_utc: baseline.piUtc,
      baseline_rtc_pi_delta_ms: baseline.rtcMs - baseline.piMs,
      oscillator_stop_flag: baseline.packet.payload.oscillator_stop_flag,
      rtc_time_advanced: null,
      ...baselineDiagnostics,
      required_next_action: "WAIT_FOR_RTC_STATUS_AFTER_BASELINE",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence selected a hardened baseline and is waiting for another valid RTC_STATUS sample after baseline."
      ),
      observationWindowTargetSeconds,
      toleranceMs,
    });
  }

  const current = samples[samples.length - 1];
  const observationElapsedSeconds = Math.max(
    0,
    Math.floor((current.piMs - baseline.piMs) / 1000)
  );
  const baselineDeltaMs = baseline.rtcMs - baseline.piMs;
  const currentDeltaMs = current.rtcMs - current.piMs;
  const driftMs = currentDeltaMs - baselineDeltaMs;
  const driftAbsMs = Math.abs(driftMs);
  const elapsedMs = current.piMs - baseline.piMs;
  const driftRateMsPerHour =
    elapsedMs > 0 ? driftMs / (elapsedMs / 3600000) : null;
  const driftRatePpm = elapsedMs > 0 ? (driftMs / elapsedMs) * 1000000 : null;
  const rtcTimeAdvanced = current.rtcMs > baseline.rtcMs;

  const common = {
    drift_check_available: true,
    sample_count: samples.length,
    observation_elapsed_seconds: observationElapsedSeconds,
    baseline_source: buildBaselineSource(baseline.packet),
    baseline_rtc_time_utc: baseline.rtcUtc,
    baseline_pi_utc: baseline.piUtc,
    baseline_rtc_pi_delta_ms: baselineDeltaMs,
    current_rtc_time_utc: current.rtcUtc,
    current_pi_utc: current.piUtc,
    current_rtc_pi_delta_ms: currentDeltaMs,
    drift_ms: driftMs,
    drift_abs_ms: driftAbsMs,
    drift_rate_ms_per_hour: roundNullable(driftRateMsPerHour, 3),
    drift_rate_ppm: roundNullable(driftRatePpm, 3),
    oscillator_stop_flag: current.packet.payload.oscillator_stop_flag,
    rtc_time_advanced: rtcTimeAdvanced,
    observationWindowTargetSeconds,
    toleranceMs,
    ...baselineDiagnostics,
  };

  if (current.packet.payload.oscillator_stop_flag === true) {
    return driftEvidence({
      ...common,
      drift_status: "DRIFT_OSF_REASSERTED",
      required_next_action: "INVESTIGATE_RTC_OSF",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence observed DS3231 OSF reassertion, so drift evidence is not accepted."
      ),
    });
  }

  if (!rtcTimeAdvanced) {
    return driftEvidence({
      ...common,
      drift_status: "DRIFT_TIME_NOT_ADVANCING",
      required_next_action: "INVESTIGATE_RTC_TIME_ADVANCE",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence shows RTC time did not advance after the hardened baseline sample."
      ),
    });
  }

  if (observationElapsedSeconds < observationWindowTargetSeconds) {
    return driftEvidence({
      ...common,
      drift_status: "DRIFT_OBSERVATION_IN_PROGRESS",
      required_next_action: "CONTINUE_30_MIN_DRIFT_OBSERVATION",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence is collecting the 30-minute observation window from a hardened baseline."
      ),
    });
  }

  if (driftAbsMs > toleranceMs) {
    return driftEvidence({
      ...common,
      drift_status: "DRIFT_EXCEEDS_TOLERANCE",
      required_next_action: "INVESTIGATE_RTC_DRIFT",
      evidence_note: buildDriftEvidenceNote(
        "Phase 7.2G-A drift evidence exceeded the configured drift tolerance after hardened baseline selection."
      ),
    });
  }

  return driftEvidence({
    ...common,
    drift_status: "DRIFT_EVIDENCE_READY",
    required_next_action: "PROCEED_TO_LONGER_DRIFT_VALIDATION",
    evidence_note: buildDriftEvidenceNote(
      "Phase 7.2G-A drift evidence is ready within the configured tolerance after hardened baseline selection."
    ),
  });
}

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

function selectDriftBaseline({
  syncPacket,
  syncMs,
  syncReadbackDeltaMs,
  eventStore,
  rtcStatusPackets,
}: {
  syncPacket: RtcSyncResultPacket;
  syncMs: number;
  syncReadbackDeltaMs: number | null;
  eventStore: TelemetryEventRecord[];
  rtcStatusPackets?: RtcStatusPacket[];
}): BaselineSelection {
  const packets = rtcStatusPackets ?? extractRtcStatusPackets(eventStore);
  const sortedPackets = [...packets].sort((a, b) => {
    const aUtc = getPacketTimestampUtc(a);
    const bUtc = getPacketTimestampUtc(b);
    return (aUtc ? Date.parse(aUtc) : 0) - (bUtc ? Date.parse(bUtc) : 0);
  });
  let candidateCount = 0;
  let rejectedCount = 0;
  let rejectionReason: string | null = null;
  let hasPostSyncEvidencePastSettle = false;
  let baseline: ValidDriftSample | null = null;
  let selectedAfterSyncSeconds: number | null = null;
  let deltaVsSyncReadbackMs: number | null = null;

  const reject = (reason: string) => {
    rejectedCount += 1;
    rejectionReason = reason;
  };

  for (const packet of sortedPackets) {
    const piUtc = getPacketTimestampUtc(packet);
    if (!piUtc) {
      continue;
    }

    const piMs = Date.parse(piUtc);
    if (!Number.isFinite(piMs) || piMs <= syncMs) {
      continue;
    }

    candidateCount += 1;
    const secondsAfterSync = (piMs - syncMs) / 1000;

    if (secondsAfterSync < PHASE_7_2G_BASELINE_MIN_SETTLE_SECONDS) {
      reject("WAITING_FOR_30S_SETTLE_WINDOW");
      continue;
    }

    hasPostSyncEvidencePastSettle = true;

    if (packet.stream_id !== syncPacket.stream_id) {
      reject("RTC_STATUS_STREAM_MISMATCH");
      continue;
    }
    if (packet.source_node_id !== "esp32_main") {
      reject("RTC_STATUS_SOURCE_NOT_MAIN");
      continue;
    }

    const sample = toValidDriftSample(packet);
    if (!sample) {
      reject(getInvalidRtcStatusReason(packet));
      continue;
    }
    if (packet.payload.oscillator_stop_flag === true) {
      reject("RTC_STATUS_OSF_TRUE");
      continue;
    }

    const sampleDeltaMs = sample.rtcMs - sample.piMs;
    const readbackDelta =
      syncReadbackDeltaMs !== null
        ? sampleDeltaMs - syncReadbackDeltaMs
        : null;
    if (
      readbackDelta !== null &&
      Math.abs(readbackDelta) > PHASE_7_2G_BASELINE_READBACK_TOLERANCE_MS
    ) {
      reject("BASELINE_DELTA_READBACK_MISMATCH");
      continue;
    }

    baseline = sample;
    selectedAfterSyncSeconds = Math.floor(secondsAfterSync);
    deltaVsSyncReadbackMs = readbackDelta;
    rejectionReason = null;
    break;
  }

  if (!baseline && hasPostSyncEvidencePastSettle && rejectionReason === null) {
    rejectionReason = "NO_STABLE_BASELINE_FOUND";
  }

  const samplesAfterBaseline = baseline
    ? sortedPackets
        .map(toValidDriftSample)
        .filter((sample): sample is ValidDriftSample => {
          if (sample === null) return false;
          return (
            sample.piMs > baseline!.piMs &&
            sample.packet.stream_id === syncPacket.stream_id &&
            sample.packet.source_node_id === "esp32_main"
          );
        })
        .sort((a, b) => a.piMs - b.piMs)
    : [];

  return {
    baseline,
    samplesAfterBaseline,
    candidateCount,
    rejectedCount,
    rejectionReason,
    selectedAfterSyncSeconds,
    deltaVsSyncReadbackMs,
    hasPostSyncEvidencePastSettle,
  };
}

function extractRtcStatusPackets(
  eventStore: TelemetryEventRecord[]
): RtcStatusPacket[] {
  return eventStore
    .filter((event) => event.disposition === "ACCEPTED")
    .map((event) => event.packet)
    .filter(
      (packet): packet is RtcStatusPacket =>
        packet?.event_type === "RTC_STATUS_TELEMETRY"
    );
}

function toValidDriftSample(packet: RtcStatusPacket): ValidDriftSample | null {
  const rtcStatus = packet.payload;
  if (!rtcStatus.rtc_detected || !rtcStatus.rtc_register_read_ok) return null;

  const piUtc = getPacketTimestampUtc(packet);
  const rtcUtc = deriveRtcTimeUtc(rtcStatus);
  if (!piUtc || !rtcUtc) return null;

  const piMs = Date.parse(piUtc);
  const rtcMs = Date.parse(rtcUtc);
  if (!Number.isFinite(piMs) || !Number.isFinite(rtcMs)) return null;

  return { packet, piUtc, piMs, rtcUtc, rtcMs };
}

function getInvalidRtcStatusReason(packet: RtcStatusPacket) {
  const rtcStatus = packet.payload;
  if (!rtcStatus.rtc_detected || !rtcStatus.rtc_register_read_ok) {
    return "RTC_STATUS_NOT_READABLE";
  }
  if (!getPacketTimestampUtc(packet)) {
    return "RTC_STATUS_TIMESTAMP_INVALID";
  }
  if (!deriveRtcTimeUtc(rtcStatus)) {
    return "RTC_STATUS_TIME_MISSING";
  }
  return "NO_STABLE_BASELINE_FOUND";
}

function driftEvidence(
  input: Partial<RtcDriftEvidence> & {
    drift_check_available: boolean;
    drift_status: RtcDriftStatus;
    required_next_action: string;
    evidence_note: string;
    observationWindowTargetSeconds?: number;
    toleranceMs?: number;
  }
): RtcDriftEvidence {
  return {
    drift_check_available: input.drift_check_available,
    drift_status: input.drift_status,
    observation_window_target_seconds:
      input.observationWindowTargetSeconds ??
      input.observation_window_target_seconds ??
      PHASE_7_2G_DRIFT_TARGET_SECONDS,
    observation_elapsed_seconds: input.observation_elapsed_seconds ?? null,
    sample_count: input.sample_count ?? 0,
    baseline_min_settle_seconds:
      input.baseline_min_settle_seconds ??
      PHASE_7_2G_BASELINE_MIN_SETTLE_SECONDS,
    baseline_candidate_count: input.baseline_candidate_count ?? 0,
    baseline_rejected_count: input.baseline_rejected_count ?? 0,
    baseline_rejection_reason: input.baseline_rejection_reason ?? null,
    baseline_source: input.baseline_source ?? null,
    baseline_rtc_time_utc: input.baseline_rtc_time_utc ?? null,
    baseline_pi_utc: input.baseline_pi_utc ?? null,
    baseline_rtc_pi_delta_ms: input.baseline_rtc_pi_delta_ms ?? null,
    baseline_delta_vs_sync_readback_ms:
      input.baseline_delta_vs_sync_readback_ms ?? null,
    sync_readback_delta_ms: input.sync_readback_delta_ms ?? null,
    baseline_selected_after_sync_seconds:
      input.baseline_selected_after_sync_seconds ?? null,
    current_rtc_time_utc: input.current_rtc_time_utc ?? null,
    current_pi_utc: input.current_pi_utc ?? null,
    current_rtc_pi_delta_ms: input.current_rtc_pi_delta_ms ?? null,
    drift_ms: input.drift_ms ?? null,
    drift_abs_ms: input.drift_abs_ms ?? null,
    drift_rate_ms_per_hour: input.drift_rate_ms_per_hour ?? null,
    drift_rate_ppm: input.drift_rate_ppm ?? null,
    oscillator_stop_flag: input.oscillator_stop_flag ?? null,
    rtc_time_advanced: input.rtc_time_advanced ?? null,
    timestamp_authority: "PI_BACKEND_UTC",
    rtc_validated: false,
    required_next_action: input.required_next_action,
    evidence_note: input.evidence_note,
    tolerance_ms:
      input.toleranceMs ?? input.tolerance_ms ?? PHASE_7_2G_DRIFT_TOLERANCE_MS,
  };
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

function getPacketTimestampUtc(packet: TelemetryPacket): string | null {
  if (isValidTimestamp(packet.timestamp_utc)) return packet.timestamp_utc;
  return null;
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

function buildBaselineSource(packet: RtcStatusPacket) {
  return `${packet.stream_id}:${packet.source_node_id}:RTC_STATUS_TELEMETRY:${packet.source_sequence_number}`;
}

function roundNullable(value: number | null, digits: number) {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function buildDriftEvidenceNote(summary: string) {
  return `${summary} Phase 7.2G-A uses a hardened 30-second post-sync baseline settle rule. Baseline is rejected if inconsistent with sync readback by more than ${PHASE_7_2G_BASELINE_READBACK_TOLERANCE_MS} ms. Pi/backend UTC remains timestamp authority; rtc_validated remains false; RTC_VALIDATED is not assigned.`;
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
