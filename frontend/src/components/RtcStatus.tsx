import type { ReactNode } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import type { RtcDecodedTime } from "../types/telemetry";
import {
  deriveRtcDriftEvidence,
  deriveRtcRetentionEvidence,
  deriveRtcValidity,
} from "../state/rtcValidity";
import { MetricCard } from "./ui/MetricCard";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function RtcStatus() {
  const rtc = useTelemetryStore((state) => state.rtcStatus);
  const latestRtcStatusPacket = useTelemetryStore((state) => state.latestRtcStatusPacket);
  const latestRtcSyncResult = useTelemetryStore((state) => state.latestRtcSyncResult);
  const rtcDriftBaseline = useTelemetryStore((state) => state.rtcDriftBaseline);
  const eventStore = useTelemetryStore((state) => state.eventStore);
  const eventStoreMaxEvents = useTelemetryStore((state) => state.eventStoreMaxEvents);
  const eventStoreSummary = useTelemetryStore((state) => state.eventStoreSummary);
  const eventStoreDroppedOldEvents = useTelemetryStore((state) => state.eventStoreDroppedOldEvents);
  const isTelemetryStale = useTelemetryStore((state) => state.isTelemetryStale);
  const validity = deriveRtcValidity(rtc);
  const retention = deriveRtcRetentionEvidence({
    latestRtcStatusPacket,
    latestRtcSyncResult,
  });
  const drift = deriveRtcDriftEvidence({
    latestRtcSyncResult,
    eventStore,
    storedBaseline: rtcDriftBaseline,
    rawEventStoreCapacity: eventStoreMaxEvents,
    rawEventStoreCurrentEvents: eventStoreSummary.current_events,
    rawEventStoreDroppedOldEvents: eventStoreDroppedOldEvents,
  });
  const syncPayload = latestRtcSyncResult?.payload ?? null;

  return (
    <SectionCard
      title="Clock Status"
      description="Current clock condition, synchronization, retention, and drift evidence"
      action={
        <StatusChip tone={clockTone(validity.rtc_validity_class)}>
          {humanizeClockValue(validity.rtc_validity_class)}
        </StatusChip>
      }
    >
      {isTelemetryStale && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Data is delayed. Values show the last known state.
        </div>
      )}

      <div className="mb-5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
        Gateway UTC remains the time authority. RTC evidence does not grant validation or enable control or actuation.
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Clock Detected" value={rtc ? formatYesNo(rtc.rtc_detected) : "Waiting for data"} />
        <SummaryMetric label="Clock Condition" value={humanizeClockValue(validity.rtc_validity_class)} />
        <SummaryMetric label="Time Authority" value={humanizeClockValue(validity.timestamp_authority)} />
        <SummaryMetric label="Synchronization" value={syncPayload ? humanizeClockValue(syncPayload.result) : "Not recorded"} />
        <SummaryMetric label="Retention" value={humanizeClockValue(retention.retention_status)} />
        <SummaryMetric label="Drift & Stability" value={humanizeClockValue(drift.drift_status)} />
        <SummaryMetric label="Required Next Action" value={humanizeClockValue(validity.required_next_action)} />
      </div>

      <div className="mt-5 grid min-w-0 gap-3">
        <EvidenceDisclosure title="Synchronization">
          <p className="mb-4 text-sm text-slate-400">
            Gateway UTC remains authoritative. A synchronization result does not automatically validate the RTC.
          </p>
          {!syncPayload || !latestRtcSyncResult ? (
            <p className="text-sm text-slate-400">No RTC synchronization result was received in this session.</p>
          ) : (
            <EvidenceGrid>
              <RawMetric label="Sync Result" value={syncPayload.result} />
              <RawMetric label="Session Sync ID" value={syncPayload.session_sync_id} />
              <RawMetric label="Accepted" value={formatBoolean(syncPayload.accepted)} />
              <RawMetric label="Write OK" value={formatBoolean(syncPayload.write_ok)} />
              <RawMetric label="Readback OK" value={formatBoolean(syncPayload.readback_ok)} />
              <RawMetric label="Readback Delta" value={formatNullableNumber(syncPayload.readback_delta_ms, " ms")} />
              <RawMetric label="OSF Before to After" value={`${formatNullableBoolean(syncPayload.osf_before)} -> ${formatNullableBoolean(syncPayload.osf_after)}`} />
              <RawMetric label="OSF Cleared" value={formatBoolean(syncPayload.osf_cleared)} />
              <RawMetric label="RTC Validity After Sync" value={syncPayload.rtc_validity_class_after_sync} />
              <RawMetric label="Timestamp Authority After Sync" value={syncPayload.timestamp_authority_after_sync} />
              <RawMetric label="Safety Scope" value={syncPayload.safety_scope} />
              <RawMetric label="Forwarded To SUB" value={formatBoolean(syncPayload.forwarded_to_sub)} />
              <RawMetric label="Control Output Touched" value={formatBoolean(syncPayload.control_output_touched)} />
              <RawMetric label="Result Received UTC" value={latestRtcSyncResult.timestamp_utc} />
              <RawMetric label="Status Message" value={syncPayload.status_message} />
            </EvidenceGrid>
          )}
        </EvidenceDisclosure>

        <EvidenceDisclosure title="Retention">
          <p className="mb-4 text-sm text-slate-400">
            Retention evidence does not change timestamp authority or enable command, control, or actuation.
          </p>
          <EvidenceGrid>
            <RawMetric label="Retention Status" value={retention.retention_status} />
            <RawMetric label="Check Available" value={formatBoolean(retention.retention_check_available)} />
            <RawMetric label="Last Sync Session ID" value={retention.last_sync_session_id ?? "NONE"} />
            <RawMetric label="Last Sync Result UTC" value={retention.last_sync_result_utc ?? "UNKNOWN"} />
            <RawMetric label="Current RTC UTC" value={retention.current_rtc_time_utc ?? "UNKNOWN"} />
            <RawMetric label="Current Gateway UTC" value={retention.current_pi_utc ?? "UNKNOWN"} />
            <RawMetric label="RTC/Gateway Delta" value={formatNullableNumber(retention.rtc_pi_delta_ms, " ms")} />
            <RawMetric label="Current OSF" value={formatNullableBoolean(retention.oscillator_stop_flag)} />
            <RawMetric label="Battery Present" value={formatNullableBoolean(retention.backup_battery_present)} />
            <RawMetric label="Battery Configured" value={formatNullableBoolean(retention.backup_battery_configured)} />
            <RawMetric label="Time Advanced Since Sync" value={formatNullableBoolean(retention.rtc_time_advanced_since_sync)} />
            <RawMetric label="Timestamp Authority" value={retention.timestamp_authority} />
            <RawMetric label="RTC Validated" value={formatBoolean(retention.rtc_validated)} />
            <RawMetric label="Required Next Action" value={retention.required_next_action} />
            <RawMetric label="Evidence Note" value={retention.evidence_note} />
          </EvidenceGrid>
        </EvidenceDisclosure>

        <EvidenceDisclosure title="Drift & Stability">
          <p className="mb-4 text-sm text-slate-400">{getDriftStatusNote(drift.drift_status)}</p>
          <EvidenceGrid>
            <RawMetric label="Drift Status" value={drift.drift_status} />
            <RawMetric label="Check Available" value={formatBoolean(drift.drift_check_available)} />
            <RawMetric label="Target Window" value={`${drift.observation_window_target_seconds} seconds / 1 hour`} />
            <RawMetric label="Observation Elapsed" value={formatNullableNumber(drift.observation_elapsed_seconds, " s")} />
            <RawMetric label="Sample Count" value={`${drift.sample_count}`} />
            <RawMetric label="Baseline Persisted In Session" value={formatBoolean(drift.baseline_persisted_in_session)} />
            <RawMetric label="Raw Event Store Capacity" value={formatNullableNumber(drift.raw_event_store_capacity)} />
            <RawMetric label="Raw Event Store Current Events" value={formatNullableNumber(drift.raw_event_store_current_events)} />
            <RawMetric label="Raw Event Store Dropped Old Events" value={formatNullableNumber(drift.raw_event_store_dropped_old_events)} />
            <RawMetric label="Baseline Min Settle" value={`${drift.baseline_min_settle_seconds} s`} />
            <RawMetric label="Baseline Selected After Sync" value={formatNullableNumber(drift.baseline_selected_after_sync_seconds, " s")} />
            <RawMetric label="Sync Readback Delta" value={formatNullableNumber(drift.sync_readback_delta_ms, " ms")} />
            <RawMetric label="Baseline Delta vs Readback" value={formatNullableNumber(drift.baseline_delta_vs_sync_readback_ms, " ms")} />
            <RawMetric label="Baseline Candidate Count" value={`${drift.baseline_candidate_count}`} />
            <RawMetric label="Baseline Rejected Count" value={`${drift.baseline_rejected_count}`} />
            <RawMetric label="Baseline Rejection Reason" value={drift.baseline_rejection_reason ?? "NONE"} />
            <RawMetric label="Baseline Source" value={drift.baseline_source ?? "UNKNOWN"} />
            <RawMetric label="Baseline RTC UTC" value={drift.baseline_rtc_time_utc ?? "UNKNOWN"} />
            <RawMetric label="Baseline Gateway UTC" value={drift.baseline_pi_utc ?? "UNKNOWN"} />
            <RawMetric label="Baseline RTC/Gateway Delta" value={formatNullableNumber(drift.baseline_rtc_pi_delta_ms, " ms")} />
            <RawMetric label="Current RTC UTC" value={drift.current_rtc_time_utc ?? "UNKNOWN"} />
            <RawMetric label="Current Gateway UTC" value={drift.current_pi_utc ?? "UNKNOWN"} />
            <RawMetric label="Current RTC/Gateway Delta" value={formatNullableNumber(drift.current_rtc_pi_delta_ms, " ms")} />
            <RawMetric label="Drift" value={formatNullableNumber(drift.drift_ms, " ms")} />
            <RawMetric label="Absolute Drift" value={formatNullableNumber(drift.drift_abs_ms, " ms")} />
            <RawMetric label="Drift Rate" value={formatNullableNumber(drift.drift_rate_ms_per_hour, " ms/hour")} />
            <RawMetric label="Drift Rate PPM" value={formatNullableNumber(drift.drift_rate_ppm, " ppm")} />
            <RawMetric label="Tolerance" value={`${drift.tolerance_ms} ms`} />
            <RawMetric label="OSF" value={formatNullableBoolean(drift.oscillator_stop_flag)} />
            <RawMetric label="RTC Time Advanced" value={formatNullableBoolean(drift.rtc_time_advanced)} />
            <RawMetric label="Timestamp Authority" value={drift.timestamp_authority} />
            <RawMetric label="RTC Validated" value={formatBoolean(drift.rtc_validated)} />
            <RawMetric label="Required Next Action" value={drift.required_next_action} />
            <RawMetric label="Evidence Note" value={drift.evidence_note} />
          </EvidenceGrid>
        </EvidenceDisclosure>

        <EvidenceDisclosure title="Technical Clock Details">
          <EvidenceGrid>
            <RawMetric label="RTC Validity Class" value={validity.rtc_validity_class} />
            <RawMetric label="Timestamp Authority" value={validity.timestamp_authority} />
            <RawMetric label="Authority Source" value={validity.timestamp_authority_source} />
            <RawMetric label="RTC Can Be Authority" value={formatBoolean(validity.rtc_can_be_timestamp_authority)} />
            <RawMetric label="Required Next Action" value={validity.required_next_action} />
            <RawMetric label="Raw Validation Verdict" value={validity.phase_7_2c_verdict} />
            <RawMetric label="Validity Reason" value={validity.rtc_validity_reason} />
            <RawMetric label="Evidence Note" value={validity.evidence_note} />
            {rtc ? (
              <>
                <RawMetric label="Detected" value={formatBoolean(rtc.rtc_detected)} />
                <RawMetric label="Register Read" value={formatBoolean(rtc.rtc_register_read_ok)} />
                <RawMetric label="Oscillator Stop Flag" value={formatNullableBoolean(rtc.oscillator_stop_flag)} />
                <RawMetric label="Battery Configured" value={formatBoolean(rtc.backup_battery_configured ?? rtc.backup_battery_present)} />
                <RawMetric label="Battery Present" value={formatBoolean(rtc.backup_battery_present)} />
                <RawMetric label="RTC Status" value={rtc.rtc_status} />
                <RawMetric label="Time Valid" value={formatBoolean(rtc.rtc_time_valid)} />
                <RawMetric label="Time Source" value={rtc.time_source} />
                <RawMetric label="Sync Source" value={rtc.sync_source ?? "NONE"} />
                <RawMetric label="Source Uptime" value={`${Math.round(rtc.source_uptime_ms)} ms`} />
                <RawMetric label="Raw / Unverified Time" value={formatRtcTime(rtc.rtc_time)} />
                <RawMetric label="Status Message" value={rtc.status_message} />
              </>
            ) : (
              <p className="text-sm text-slate-400">Waiting for RTC status telemetry...</p>
            )}
          </EvidenceGrid>
        </EvidenceDisclosure>
      </div>
    </SectionCard>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}

function EvidenceDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="min-w-0 rounded-md border border-slate-800 bg-slate-950/60 p-4">
      <summary className="cursor-pointer rounded-sm text-sm font-semibold text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        {title}
      </summary>
      <div className="mt-4 min-w-0">{children}</div>
    </details>
  );
}

function EvidenceGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function RawMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-900/80 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function formatBoolean(value: boolean) {
  return value ? "TRUE" : "FALSE";
}

function formatNullableBoolean(value: boolean | null) {
  return value === null ? "UNKNOWN" : formatBoolean(value);
}

function formatNullableNumber(value: number | null, suffix = "") {
  return value === null ? "UNKNOWN" : `${value}${suffix}`;
}

function formatRtcTime(time: RtcDecodedTime | null) {
  if (!time) return "UNAVAILABLE";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.year}-${pad(time.month)}-${pad(time.date)} ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
}

function humanizeClockValue(value: string) {
  const labels: Record<string, string> = {
    RTC_NOT_PRESENT: "Clock not detected",
    RTC_READ_ERROR: "Clock read error",
    RTC_PRESENT_TIME_INVALID_OSF: "Clock detected - time invalid",
    RTC_PRESENT_TIME_UNVALIDATED: "Clock detected - time not validated",
    RTC_PRESENT_SESSION_ONLY: "Clock available for this session",
    RTC_PRESENT_TIME_CANDIDATE: "Clock time awaiting validation",
    RTC_VALIDATION_READY: "Clock ready for validation",
    RTC_VALIDATED: "Clock validated",
    PI_BACKEND_UTC: "Gateway UTC",
    PI_GATEWAY_SYSTEM_CLOCK: "Gateway system clock",
    PI_TO_RTC_SESSION_SYNC_REQUIRED: "Clock synchronization required",
    CHECK_RTC_HARDWARE_CONNECTION: "Check clock hardware connection",
    RESTORE_RTC_REGISTER_READ: "Restore clock register access",
    VERIFY_RTC_BACKUP_BATTERY: "Verify clock backup battery",
    RTC_TIME_INITIALIZATION_OR_VALIDATION_REQUIRED: "Initialize or validate clock time",
    COMPARE_RTC_WITH_PI_UTC: "Compare clock with Gateway UTC",
    RUN_RTC_VALIDATION: "Run clock validation",
    NONE: "No action required",
    RTC_SYNC_SUCCESS: "Synchronized",
    RTC_SYNC_FAILED: "Synchronization failed",
    REJECTED: "Synchronization rejected",
    RETENTION_NOT_CHECKED: "Retention not checked",
    RETENTION_CHECK_PENDING: "Retention check pending",
    RETENTION_EVIDENCE_READY: "Retention evidence available",
    RETENTION_OSF_REASSERTED: "Clock stop flag returned",
    RETENTION_TIME_NOT_ADVANCING: "Clock time is not advancing",
    RETENTION_DELTA_TOO_LARGE: "Retention delta exceeds tolerance",
    RETENTION_INSUFFICIENT_EVIDENCE: "Insufficient retention evidence",
    DRIFT_SYNC_RESULT_MISSING: "Synchronization result required",
    DRIFT_SETTLING_AFTER_SYNC: "Clock settling after synchronization",
    DRIFT_BASELINE_PENDING: "Drift baseline pending",
    DRIFT_BASELINE_UNSTABLE: "Drift baseline unstable",
    DRIFT_OBSERVATION_IN_PROGRESS: "Drift observation in progress",
    DRIFT_EVIDENCE_READY: "Drift evidence available",
    DRIFT_EXCEEDS_TOLERANCE: "Drift exceeds tolerance",
    DRIFT_OSF_REASSERTED: "Clock stop flag returned",
    DRIFT_TIME_NOT_ADVANCING: "Clock time is not advancing",
    DRIFT_INSUFFICIENT_EVIDENCE: "Insufficient drift evidence",
  };

  return labels[value] ?? "Unknown status";
}

function clockTone(value: string): StatusTone {
  if (["RTC_VALIDATED", "RTC_SYNC_SUCCESS", "RETENTION_EVIDENCE_READY", "DRIFT_EVIDENCE_READY"].includes(value)) return "healthy";
  if (["RTC_NOT_PRESENT", "RTC_READ_ERROR", "RTC_PRESENT_TIME_INVALID_OSF", "RTC_SYNC_FAILED", "REJECTED", "RETENTION_OSF_REASSERTED", "RETENTION_TIME_NOT_ADVANCING", "RETENTION_DELTA_TOO_LARGE", "DRIFT_EXCEEDS_TOLERANCE", "DRIFT_OSF_REASSERTED", "DRIFT_TIME_NOT_ADVANCING"].includes(value)) return "fault";
  if (value.startsWith("RTC_") || value.startsWith("RETENTION_") || value.startsWith("DRIFT_")) return "attention";
  return "neutral";
}

function getDriftStatusNote(status: string) {
  switch (status) {
    case "DRIFT_SYNC_RESULT_MISSING":
      return "A successful clock synchronization has not been captured in this frontend session.";
    case "DRIFT_SETTLING_AFTER_SYNC":
      return "Waiting for the hardened 30-second post-sync drift baseline.";
    case "DRIFT_BASELINE_PENDING":
      return "The hardened baseline is selected; another valid clock telemetry sample is required.";
    case "DRIFT_BASELINE_UNSTABLE":
      return "No stable baseline passed the settle and synchronization-readback consistency gates.";
    case "DRIFT_OBSERVATION_IN_PROGRESS":
      return "The one-hour drift observation window is still in progress.";
    case "DRIFT_OSF_REASSERTED":
      return "The oscillator stop flag returned during drift observation.";
    case "DRIFT_TIME_NOT_ADVANCING":
      return "Clock time did not advance after the baseline sample.";
    case "DRIFT_EXCEEDS_TOLERANCE":
      return "Short-window clock drift exceeded tolerance.";
    case "DRIFT_INSUFFICIENT_EVIDENCE":
      return "The drift comparison does not have valid timestamp evidence.";
    case "DRIFT_EVIDENCE_READY":
      return "Drift evidence is available for report export.";
    default:
      return "The drift evidence status is unknown. See the raw status below.";
  }
}
