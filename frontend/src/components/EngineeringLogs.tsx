import { useTelemetryStore } from "../store/telemetryStore";
import type { EngineeringLog } from "../types/telemetry";
import { isAcceptedNodeId, normalizeNodeId } from "../types/telemetry";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function EngineeringLogs() {
  const logs = useTelemetryStore((s) => s.logs);

  return (
    <SectionCard title="Event Log" description="Recent supervisory and telemetry events">
      {logs.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
          No events received yet.
        </div>
      ) : (
        <div className="grid min-h-72 max-h-[65vh] min-w-0 gap-3 overflow-y-auto pr-1 lg:min-h-[26rem] lg:max-h-[32rem]">
          {logs.map((log) => (
            <EventCard
              key={`${log.event_type}-${log.sequence_number}-${log.timestamp_utc}`}
              log={log}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function EventCard({ log }: { log: EngineeringLog }) {
  const rawSourceNode = log.source_node_id ?? log.node_id;

  return (
    <article className="min-w-0 rounded-md border border-slate-800 bg-slate-950/80 p-4">
      <div className="grid min-w-0 gap-3 [min-width:1366px]:grid-cols-[auto_minmax(11rem,0.8fr)_minmax(10rem,0.8fr)_minmax(18rem,2fr)] [min-width:1366px]:items-start">
        <div className="flex min-w-0 items-start justify-between gap-3 [min-width:1366px]:contents">
          <div className="min-w-0">
            <div className="mb-1 text-xs font-medium text-slate-500">Severity</div>
            <StatusChip tone={severityTone(log.severity)}>{log.severity}</StatusChip>
          </div>
          <div className="min-w-0 text-right [min-width:1366px]:text-left">
            <div className="text-xs font-medium text-slate-500">Time</div>
            <div className="mt-1 break-words text-sm text-slate-300">{formatEventTime(log.timestamp_utc)}</div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">Source</div>
          <div className="mt-1 break-words text-sm font-medium text-slate-200">{displaySource(rawSourceNode)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">Message</div>
          <div className="mt-1 break-words text-sm text-slate-300">{log.message}</div>
        </div>
      </div>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical event details
        </summary>
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <TechnicalField label="Event type" value={log.event_type} />
          <TechnicalField label="Stream ID" value={log.stream_id ?? "N/A"} />
          <TechnicalField label="Global sequence" value={(log.global_sequence_number ?? log.sequence_number).toString()} />
          <TechnicalField label="Source sequence" value={log.source_sequence_number?.toString() ?? "N/A"} />
          <TechnicalField label="Packet sequence" value={log.sequence_number.toString()} />
          <TechnicalField label="Raw node ID" value={log.node_id} />
          <TechnicalField label="Raw source node ID" value={log.source_node_id ?? "N/A"} />
          <TechnicalField label="Timestamp UTC" value={log.timestamp_utc} />
        </dl>
      </details>
    </article>
  );
}

function TechnicalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-slate-300">{value}</dd>
    </div>
  );
}

function displaySource(nodeId: string | undefined) {
  if (!nodeId) return "Unknown source";
  const canonicalNodeId = isAcceptedNodeId(nodeId) ? normalizeNodeId(nodeId) : nodeId;
  const labels: Record<string, string> = {
    esp32_main: "Main Controller",
    esp32_sub: "Secondary Controller",
    pi_gateway: "Gateway",
    laptop_console: "Operator Console",
  };

  return labels[canonicalNodeId] ?? "Unknown source";
}

function formatEventTime(timestampUtc: string) {
  const match = timestampUtc.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ? `${match[1]} UTC` : timestampUtc;
}

function severityTone(severity: string): StatusTone {
  if (severity === "CRITICAL" || severity === "ERROR") return "fault";
  if (severity === "WARNING") return "attention";
  if (severity === "INFO") return "healthy";
  return "neutral";
}
