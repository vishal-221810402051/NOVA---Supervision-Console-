import { useTelemetryStore } from "../store/telemetryStore";
import type { RtcDecodedTime } from "../types/telemetry";
import { deriveRtcValidity } from "../state/rtcValidity";

export function RtcStatus() {
  const rtc = useTelemetryStore((state) => state.rtcStatus);
  const latestRtcSyncResult = useTelemetryStore((state) => state.latestRtcSyncResult);
  const isTelemetryStale = useTelemetryStore((state) => state.isTelemetryStale);
  const validity = deriveRtcValidity(rtc);
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="break-words font-mono text-cyan-100">{value}</div>
    </div>
  );
}
