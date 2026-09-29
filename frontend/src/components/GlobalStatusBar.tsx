import { useTelemetryStore } from "../store/telemetryStore";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function GlobalStatusBar() {
  const globalHealth = useTelemetryStore((s) => s.globalHealth);
  const registrySummary = useTelemetryStore((s) => s.registrySummary);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  return (
    <section
      aria-label="Current system status"
      className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      <StatusMetric
        label="System Health"
        value={humanizeHealth(globalHealth)}
        tone={toneForState(globalHealth)}
      />
      <StatusMetric
        label="Connection"
        value={humanizeConnection(connectionState)}
        tone={toneForState(connectionState)}
      />
      <StatusMetric
        label="Healthy Devices"
        value={registrySummary.healthy.toString()}
        tone="healthy"
      />
      <StatusMetric
        label="Needs Attention"
        value={registrySummary.degraded.toString()}
        tone={registrySummary.degraded > 0 ? "attention" : "healthy"}
      />
      <StatusMetric
        label="Data Status"
        value={isTelemetryStale ? "Delayed" : "Live"}
        tone={isTelemetryStale ? "attention" : "healthy"}
      />
    </section>
  );
}

function StatusMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="min-w-0 text-sm font-medium text-slate-400">{label}</div>
      <StatusChip tone={tone}>{value}</StatusChip>
    </div>
  );
}

function humanizeHealth(state: string) {
  if (state === "HEALTHY") return "Healthy";
  if (state === "DEGRADED") return "Needs attention";
  if (state === "FAIL_SAFE") return "Fail-safe";
  if (state === "OFFLINE") return "Offline";
  return state;
}

function humanizeConnection(state: string) {
  if (state === "CONNECTED") return "Connected";
  if (state === "RECONNECTING") return "Reconnecting";
  if (state === "OFFLINE") return "Offline";
  return state;
}

function toneForState(state: string): StatusTone {
  if (state === "HEALTHY" || state === "CONNECTED" || state === "LIVE") {
    return "healthy";
  }
  if (state === "DEGRADED" || state === "RECONNECTING" || state === "STALE") {
    return "attention";
  }
  if (state === "FAIL_SAFE" || state === "OFFLINE") {
    return "fault";
  }
  return "neutral";
}
