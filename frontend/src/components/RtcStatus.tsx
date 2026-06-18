import { useTelemetryStore } from "../store/telemetryStore";
import type { RtcDecodedTime } from "../types/telemetry";

export function RtcStatus() {
  const rtc = useTelemetryStore((state) => state.rtcStatus);
  const isTelemetryStale = useTelemetryStore((state) => state.isTelemetryStale);

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        DS3231 RTC Status
      </h2>
      <div className="mb-4 border border-amber-500/60 bg-amber-950/20 px-3 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
        Read-only RTC telemetry. DS3231 is not timestamp authority in Phase 7.2B.
      </div>
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
