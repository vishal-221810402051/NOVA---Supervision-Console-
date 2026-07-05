import { useTelemetryStore } from "../store/telemetryStore";
import type { RtcDecodedTime } from "../types/telemetry";
import {
  deriveRtcDriftEvidence,
  deriveRtcRetentionEvidence,
  deriveRtcValidity,
} from "../state/rtcValidity";

export function RtcStatus() {
  const rtc = useTelemetryStore((state) => state.rtcStatus);
  const latestRtcStatusPacket = useTelemetryStore((state) => state.latestRtcStatusPacket);
  const latestRtcSyncResult = useTelemetryStore((state) => state.latestRtcSyncResult);
  const eventStore = useTelemetryStore((state) => state.eventStore);
  const isTelemetryStale = useTelemetryStore((state) => state.isTelemetryStale);
  const validity = deriveRtcValidity(rtc);
  const retention = deriveRtcRetentionEvidence({
    latestRtcStatusPacket,
    latestRtcSyncResult,
  });
  const drift = deriveRtcDriftEvidence({
    latestRtcSyncResult,
    eventStore,
  });
  const syncPayload = latestRtcSyncResult?.payload ?? null;

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        DS3231 RTC Status
      </h2>
      <div className="mb-4 border border-amber-500/60 bg-amber-950/20 px-3 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
        Read-only RTC telemetry. DS3231 is not timestamp authority in Phase 7.2B.
      </div>
      <section className="mb-4 border border-amber-500/40 bg-amber-950/10 p-3">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-300">
          Phase 7.2C Validity Evidence
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="RTC Validity Class" value={validity.rtc_validity_class} />
          <Metric label="Timestamp Authority" value={validity.timestamp_authority} />
          <Metric label="Authority Source" value={validity.timestamp_authority_source} />
          <Metric label="RTC Can Be Authority" value={formatBoolean(validity.rtc_can_be_timestamp_authority)} />
          <Metric label="Required Next Action" value={validity.required_next_action} />
          <Metric label="Phase 7.2C Verdict" value={validity.phase_7_2c_verdict} />
          <Metric label="Validity Reason" value={validity.rtc_validity_reason} />
          <Metric label="Evidence Note" value={validity.evidence_note} />
        </div>
      </section>
      <section className="mb-4 border border-cyan-500/40 bg-cyan-950/10 p-3">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-300">
          Phase 7.2E RTC Sync Result Evidence
        </h3>
        <div className="mb-3 space-y-1 text-xs uppercase tracking-widest text-slate-400">
          <div>RTC synchronized; retention validation pending.</div>
          <div>Pi/backend UTC remains timestamp authority.</div>
          <div>RTC_VALIDATED is not assigned in this phase.</div>
        </div>
        {!syncPayload || !latestRtcSyncResult ? (
          <div className="text-sm text-slate-500">
            No RTC sync result received in this session.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Sync Result" value={syncPayload.result} />
            <Metric label="Session Sync ID" value={syncPayload.session_sync_id} />
            <Metric label="Accepted" value={formatBoolean(syncPayload.accepted)} />
            <Metric label="Write OK" value={formatBoolean(syncPayload.write_ok)} />
            <Metric label="Readback OK" value={formatBoolean(syncPayload.readback_ok)} />
            <Metric label="Readback Delta" value={formatNullableNumber(syncPayload.readback_delta_ms, " ms")} />
            <Metric label="OSF Before -> After" value={`${formatNullableBoolean(syncPayload.osf_before)} -> ${formatNullableBoolean(syncPayload.osf_after)}`} />
            <Metric label="OSF Cleared" value={formatBoolean(syncPayload.osf_cleared)} />
            <Metric label="RTC Validity After Sync" value={syncPayload.rtc_validity_class_after_sync} />
            <Metric label="Timestamp Authority After Sync" value={syncPayload.timestamp_authority_after_sync} />
            <Metric label="Safety Scope" value={syncPayload.safety_scope} />
            <Metric label="Forwarded To SUB" value={formatBoolean(syncPayload.forwarded_to_sub)} />
            <Metric label="Control Output Touched" value={formatBoolean(syncPayload.control_output_touched)} />
            <Metric label="Result Received UTC" value={latestRtcSyncResult.timestamp_utc} />
            <Metric label="Status Message" value={syncPayload.status_message} />
          </div>
        )}
      </section>
      <section className="mb-4 border border-emerald-500/40 bg-emerald-950/10 p-3">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-300">
          Phase 7.2F RTC Retention Evidence
        </h3>
        <div className="mb-3 space-y-1 text-xs uppercase tracking-widest text-slate-400">
          <div>Pi/backend UTC remains timestamp authority.</div>
          <div>RTC_VALIDATED is not assigned in Phase 7.2F.</div>
          <div>Retention evidence does not enable command/control or actuation.</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Retention Status" value={retention.retention_status} />
          <Metric label="Check Available" value={formatBoolean(retention.retention_check_available)} />
          <Metric label="Last Sync Session ID" value={retention.last_sync_session_id ?? "NONE"} />
          <Metric label="Last Sync Result UTC" value={retention.last_sync_result_utc ?? "UNKNOWN"} />
          <Metric label="Current RTC UTC" value={retention.current_rtc_time_utc ?? "UNKNOWN"} />
          <Metric label="Current Pi/Backend UTC" value={retention.current_pi_utc ?? "UNKNOWN"} />
          <Metric label="RTC/Pi Delta" value={formatNullableNumber(retention.rtc_pi_delta_ms, " ms")} />
          <Metric label="Current OSF" value={formatNullableBoolean(retention.oscillator_stop_flag)} />
          <Metric label="Battery Present" value={formatNullableBoolean(retention.backup_battery_present)} />
          <Metric label="Battery Configured" value={formatNullableBoolean(retention.backup_battery_configured)} />
          <Metric label="Time Advanced Since Sync" value={formatNullableBoolean(retention.rtc_time_advanced_since_sync)} />
          <Metric label="Timestamp Authority" value={retention.timestamp_authority} />
          <Metric label="RTC Validated" value={formatBoolean(retention.rtc_validated)} />
          <Metric label="Required Next Action" value={retention.required_next_action} />
          <Metric label="Evidence Note" value={retention.evidence_note} />
        </div>
      </section>
      <section className="mb-4 border border-fuchsia-500/40 bg-fuchsia-950/10 p-3">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-fuchsia-300">
          Phase 7.2G RTC Drift Evidence
        </h3>
        <div className="mb-3 space-y-1 text-xs uppercase tracking-widest text-slate-400">
          <div>{getDriftMissingReason(drift.drift_status)}</div>
          <div>Pi/backend UTC remains timestamp authority.</div>
          <div>RTC_VALIDATED is not assigned in Phase 7.2G.</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Drift Status" value={drift.drift_status} />
          <Metric label="Check Available" value={formatBoolean(drift.drift_check_available)} />
          <Metric label="Observation Target" value={`${drift.observation_window_target_seconds} s`} />
          <Metric label="Observation Elapsed" value={formatNullableNumber(drift.observation_elapsed_seconds, " s")} />
          <Metric label="Sample Count" value={`${drift.sample_count}`} />
          <Metric label="Baseline Min Settle" value={`${drift.baseline_min_settle_seconds} s`} />
          <Metric label="Baseline Selected After Sync" value={formatNullableNumber(drift.baseline_selected_after_sync_seconds, " s")} />
          <Metric label="Sync Readback Delta" value={formatNullableNumber(drift.sync_readback_delta_ms, " ms")} />
          <Metric label="Baseline Delta vs Readback" value={formatNullableNumber(drift.baseline_delta_vs_sync_readback_ms, " ms")} />
          <Metric label="Baseline Candidate Count" value={`${drift.baseline_candidate_count}`} />
          <Metric label="Baseline Rejected Count" value={`${drift.baseline_rejected_count}`} />
          <Metric label="Baseline Rejection Reason" value={drift.baseline_rejection_reason ?? "NONE"} />
          <Metric label="Baseline Source" value={drift.baseline_source ?? "UNKNOWN"} />
          <Metric label="Baseline RTC UTC" value={drift.baseline_rtc_time_utc ?? "UNKNOWN"} />
          <Metric label="Baseline Pi/Backend UTC" value={drift.baseline_pi_utc ?? "UNKNOWN"} />
          <Metric label="Baseline RTC/Pi Delta" value={formatNullableNumber(drift.baseline_rtc_pi_delta_ms, " ms")} />
          <Metric label="Current RTC UTC" value={drift.current_rtc_time_utc ?? "UNKNOWN"} />
          <Metric label="Current Pi/Backend UTC" value={drift.current_pi_utc ?? "UNKNOWN"} />
          <Metric label="Current RTC/Pi Delta" value={formatNullableNumber(drift.current_rtc_pi_delta_ms, " ms")} />
          <Metric label="Drift" value={formatNullableNumber(drift.drift_ms, " ms")} />
          <Metric label="Absolute Drift" value={formatNullableNumber(drift.drift_abs_ms, " ms")} />
          <Metric label="Drift Rate" value={formatNullableNumber(drift.drift_rate_ms_per_hour, " ms/hour")} />
          <Metric label="Drift Rate PPM" value={formatNullableNumber(drift.drift_rate_ppm, " ppm")} />
          <Metric label="Tolerance" value={`${drift.tolerance_ms} ms`} />
          <Metric label="OSF" value={formatNullableBoolean(drift.oscillator_stop_flag)} />
          <Metric label="RTC Time Advanced" value={formatNullableBoolean(drift.rtc_time_advanced)} />
          <Metric label="Timestamp Authority" value={drift.timestamp_authority} />
          <Metric label="RTC Validated" value={formatBoolean(drift.rtc_validated)} />
          <Metric label="Required Next Action" value={drift.required_next_action} />
          <Metric label="Evidence Note" value={drift.evidence_note} />
        </div>
      </section>
      {isTelemetryStale && (
        <div className="mb-4 text-xs uppercase tracking-widest text-amber-300">
          Telemetry is stale; values are last known state.
        </div>
      )}
      {!rtc ? (
        <div className="text-sm text-slate-500">Waiting for RTC status telemetry...</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Detected" value={formatBoolean(rtc.rtc_detected)} />
          <Metric label="Register Read" value={formatBoolean(rtc.rtc_register_read_ok)} />
          <Metric label="Oscillator Stop Flag" value={formatNullableBoolean(rtc.oscillator_stop_flag)} />
          <Metric label="Battery Configured" value={formatBoolean(rtc.backup_battery_configured ?? rtc.backup_battery_present)} />
          <Metric label="Battery Present" value={formatBoolean(rtc.backup_battery_present)} />
          <Metric label="RTC Status" value={rtc.rtc_status} />
          <Metric label="Time Valid" value={formatBoolean(rtc.rtc_time_valid)} />
          <Metric label="Time Source" value={rtc.time_source} />
          <Metric label="Sync Source" value={rtc.sync_source ?? "NONE"} />
          <Metric label="Source Uptime" value={`${Math.round(rtc.source_uptime_ms)} ms`} />
          <Metric label="Raw / Unverified Time" value={formatRtcTime(rtc.rtc_time)} />
          <Metric label="Status Message" value={rtc.status_message} />
        </div>
      )}
    </section>
  );
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

function getDriftMissingReason(status: string) {
  switch (status) {
    case "DRIFT_SYNC_RESULT_MISSING":
      return "Missing reason: RTC_SYNC_SUCCESS has not been captured in this frontend session.";
    case "DRIFT_SETTLING_AFTER_SYNC":
      return "Missing reason: waiting for the 30-second post-sync baseline settle window.";
    case "DRIFT_BASELINE_PENDING":
      return "Missing reason: hardened baseline is selected; waiting for another valid RTC_STATUS_TELEMETRY sample.";
    case "DRIFT_BASELINE_UNSTABLE":
      return "Missing reason: no stable baseline passed the 30-second settle and sync-readback consistency gates.";
    case "DRIFT_OBSERVATION_IN_PROGRESS":
      return "Missing reason: the 30-minute drift observation window is still in progress.";
    case "DRIFT_OSF_REASSERTED":
      return "Missing reason: DS3231 oscillator stop flag reasserted during drift observation.";
    case "DRIFT_TIME_NOT_ADVANCING":
      return "Missing reason: DS3231 time did not advance after the baseline sample.";
    case "DRIFT_EXCEEDS_TOLERANCE":
      return "Missing reason: DS3231 short-window drift exceeded tolerance.";
    case "DRIFT_INSUFFICIENT_EVIDENCE":
      return "Missing reason: drift comparison does not have valid timestamp evidence.";
    case "DRIFT_EVIDENCE_READY":
      return "Drift evidence is ready for Phase 7.2G report export.";
    default:
      return "Missing reason: drift evidence status is unknown.";
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="break-words font-mono text-cyan-100">{value}</div>
    </div>
  );
}
