import { useTelemetryStore } from "../store/telemetryStore";

export function GlobalStatusBar() {
  const globalHealth = useTelemetryStore((s) => s.globalHealth);
  const registrySummary = useTelemetryStore((s) => s.registrySummary);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  return (
    <section className="grid grid-cols-5 gap-3">
      <StatusMetric label="Global Health" value={globalHealth} state={globalHealth} />
      <StatusMetric label="WS State" value={connectionState} state={connectionState} />
      <StatusMetric label="Healthy" value={registrySummary.healthy.toString()} state="HEALTHY" />
      <StatusMetric label="Degraded" value={registrySummary.degraded.toString()} state="DEGRADED" />
      <StatusMetric
        label="Telemetry Freshness"
        value={isTelemetryStale ? "STALE" : "LIVE"}
        state={isTelemetryStale ? "DEGRADED" : "HEALTHY"}
      />
    </section>
  );
}

function StatusMetric({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: string;
}) {
  return (
    <div className={`border p-3 ${stateClass(state)}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="font-mono text-sm font-bold">{value}</div>
    </div>
  );
}

function stateClass(state: string) {
  if (state === "HEALTHY" || state === "CONNECTED" || state === "LIVE") {
    return "border-emerald-500 bg-emerald-950/20 text-emerald-300";
  }

  if (state === "DEGRADED" || state === "RECONNECTING" || state === "STALE") {
    return "border-amber-500 bg-amber-950/20 text-amber-300";
  }

  if (state === "FAIL_SAFE" || state === "OFFLINE") {
    return "border-red-500 bg-red-950/20 text-red-300";
  }

  return "border-slate-700 bg-slate-950 text-slate-300";
}
