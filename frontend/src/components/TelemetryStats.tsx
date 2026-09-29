import { useTelemetryStore } from "../store/telemetryStore";
import { MetricCard } from "./ui/MetricCard";
import { ResponsiveMetricGrid } from "./ui/ResponsiveMetricGrid";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function TelemetryStats() {
  const packetCount = useTelemetryStore((s) => s.packetCount);
  const packetRateHz = useTelemetryStore((s) => s.packetRateHz);
  const lastSequenceNumber = useTelemetryStore((s) => s.lastSequenceNumber);
  const missedPackets = useTelemetryStore((s) => s.missedPackets);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);
  const registrySummary = useTelemetryStore((s) => s.registrySummary);
  const duplicatePackets = useTelemetryStore((s) => s.duplicatePackets);
  const outOfOrderPackets = useTelemetryStore((s) => s.outOfOrderPackets);
  const sequenceResets = useTelemetryStore((s) => s.sequenceResets);
  const sequenceGaps = useTelemetryStore((s) => s.sequenceGaps);
  const schemaRejectedPackets = useTelemetryStore((s) => s.schemaRejectedPackets);
  const malformedPackets = useTelemetryStore((s) => s.malformedPackets);
  const unknownEventPackets = useTelemetryStore((s) => s.unknownEventPackets);
  const unknownNodePackets = useTelemetryStore((s) => s.unknownNodePackets);
  const unknownLinkPackets = useTelemetryStore((s) => s.unknownLinkPackets);
  const eventStoreSummary = useTelemetryStore((s) => s.eventStoreSummary);
  const eventStoreDroppedOldEvents = useTelemetryStore((s) => s.eventStoreDroppedOldEvents);
  const activeStreamId = useTelemetryStore((s) => s.activeStreamId);
  const streamSwitches = useTelemetryStore((s) => s.streamSwitches);
  const activeTelemetrySource = useTelemetryStore((s) => s.activeTelemetrySource);
  const soakMetrics = useTelemetryStore((s) => s.soakMetrics);
  const startSoakSession = useTelemetryStore((s) => s.startSoakSession);
  const resetSoakSession = useTelemetryStore((s) => s.resetSoakSession);
  const soakStatus = getSoakStatus(soakMetrics);
  const soakProgressPercent = getSoakProgressPercent(soakMetrics);
  const devicesNeedingAttention =
    registrySummary.degraded + registrySummary.offline + registrySummary.failSafe;
  const integrityIssueCount =
    missedPackets +
    duplicatePackets +
    outOfOrderPackets +
    sequenceGaps +
    schemaRejectedPackets +
    malformedPackets;

  return (
    <div className="grid min-w-0 gap-4">
      <SectionCard
        title="Operational Summary"
        description="Current data source, system activity, and device state"
      >
        <ResponsiveMetricGrid>
          <MetricCard label="Data Source" value={activeTelemetrySource.display_name} />
          <MetricCard
            label="Operating Mode"
            value={
              activeTelemetrySource.is_simulated ? "Simulation" : "Hardware telemetry"
            }
          />
          <MetricCard label="Packet Rate" value={`${packetRateHz.toFixed(2)} Hz`} />
          <MetricCard
            label="Last Update"
            value={
              <span className="break-all font-mono text-sm">
                {lastPacketAt ?? "No data received"}
              </span>
            }
          />
          <MetricCard label="Healthy Devices" value={registrySummary.healthy.toString()} />
          <MetricCard
            label="Devices Needing Attention"
            value={devicesNeedingAttention.toString()}
          />
          <MetricCard
            label="Packet Integrity"
            value={integrityIssueCount === 0 ? "Clean" : "Review required"}
            supportingText={`${integrityIssueCount} recorded issue${integrityIssueCount === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="Stability Test"
            value={humanizeSoakStatus(soakStatus)}
            supportingText={
              soakMetrics.isSoakActive
                ? `${formatDuration(soakMetrics.soakElapsedSeconds)} elapsed`
                : "No active observation"
            }
          />
        </ResponsiveMetricGrid>
      </SectionCard>

      <SectionCard
        title="Data Integrity"
        description="Packet delivery and validation counters"
        action={
          <StatusChip tone={integrityIssueCount === 0 ? "healthy" : "attention"}>
            {integrityIssueCount === 0 ? "No issues" : "Attention needed"}
          </StatusChip>
        }
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Missed Packets" value={missedPackets.toString()} />
          <MetricCard label="Duplicates" value={duplicatePackets.toString()} />
          <MetricCard label="Out of Order" value={outOfOrderPackets.toString()} />
          <MetricCard label="Sequence Gaps" value={sequenceGaps.toString()} />
          <MetricCard
            label="Rejected or Malformed"
            value={(schemaRejectedPackets + malformedPackets).toString()}
            supportingText={`${schemaRejectedPackets} schema rejected, ${malformedPackets} malformed`}
          />
        </div>
      </SectionCard>

      <AdvancedDiagnostics
        activeTelemetrySource={activeTelemetrySource}
        activeStreamId={activeStreamId}
        streamSwitches={streamSwitches}
        packetCount={packetCount}
        lastSequenceNumber={lastSequenceNumber}
        sequenceResets={sequenceResets}
        schemaRejectedPackets={schemaRejectedPackets}
        malformedPackets={malformedPackets}
        unknownEventPackets={unknownEventPackets}
        unknownNodePackets={unknownNodePackets}
        unknownLinkPackets={unknownLinkPackets}
        eventStoreSummary={eventStoreSummary}
        eventStoreDroppedOldEvents={eventStoreDroppedOldEvents}
        lastPacketAt={lastPacketAt}
        registrySummary={registrySummary}
      />

      <StabilityTest
        soakMetrics={soakMetrics}
        soakStatus={soakStatus}
        soakProgressPercent={soakProgressPercent}
        startSoakSession={startSoakSession}
        resetSoakSession={resetSoakSession}
      />
    </div>
  );
}

function AdvancedDiagnostics({
  activeTelemetrySource,
  activeStreamId,
  streamSwitches,
  packetCount,
  lastSequenceNumber,
  sequenceResets,
  schemaRejectedPackets,
  malformedPackets,
  unknownEventPackets,
  unknownNodePackets,
  unknownLinkPackets,
  eventStoreSummary,
  eventStoreDroppedOldEvents,
  lastPacketAt,
  registrySummary,
}: {
  activeTelemetrySource: {
    transport_kind: string;
    endpoint: string;
    reconnect_attempts: number;
    last_error: string | null;
    is_simulated: boolean;
  };
  activeStreamId: string | null;
  streamSwitches: number;
  packetCount: number;
  lastSequenceNumber: number | null;
  sequenceResets: number;
  schemaRejectedPackets: number;
  malformedPackets: number;
  unknownEventPackets: number;
  unknownNodePackets: number;
  unknownLinkPackets: number;
  eventStoreSummary: {
    current_events: number;
    latest_event_store_sequence: number;
    dropped_old_events: number;
  };
  eventStoreDroppedOldEvents: number;
  lastPacketAt: string | null;
  registrySummary: { offline: number };
}) {
  return (
    <details className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/40">
      <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 marker:text-cyan-400 hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:px-5">
        Advanced diagnostics
      </summary>
      <div className="min-w-0 border-t border-slate-800/80 p-4 sm:p-5">
        <ResponsiveMetricGrid>
          <DiagnosticMetric label="Transport Kind" value={activeTelemetrySource.transport_kind} />
          <DiagnosticMetric label="Source Endpoint" value={activeTelemetrySource.endpoint} />
          <DiagnosticMetric
            label="Simulated Source"
            value={activeTelemetrySource.is_simulated ? "TRUE" : "FALSE"}
          />
          <DiagnosticMetric
            label="Reconnect Attempts"
            value={activeTelemetrySource.reconnect_attempts.toString()}
          />
          <DiagnosticMetric
            label="Last Transport Error"
            value={activeTelemetrySource.last_error ?? "NONE"}
          />
          <DiagnosticMetric label="Active Stream" value={activeStreamId ?? "N/A"} />
          <DiagnosticMetric label="Stream Switches" value={streamSwitches.toString()} />
          <DiagnosticMetric label="Packet Count" value={packetCount.toString()} />
          <DiagnosticMetric
            label="Last Sequence"
            value={lastSequenceNumber?.toString() ?? "N/A"}
          />
          <DiagnosticMetric label="Sequence Resets" value={sequenceResets.toString()} />
          <DiagnosticMetric
            label="Schema Rejected"
            value={schemaRejectedPackets.toString()}
          />
          <DiagnosticMetric label="Malformed" value={malformedPackets.toString()} />
          <DiagnosticMetric label="Unknown Events" value={unknownEventPackets.toString()} />
          <DiagnosticMetric label="Unknown Nodes" value={unknownNodePackets.toString()} />
          <DiagnosticMetric label="Unknown Links" value={unknownLinkPackets.toString()} />
          <DiagnosticMetric
            label="Event Store Count"
            value={eventStoreSummary.current_events.toString()}
          />
          <DiagnosticMetric
            label="Latest Event Sequence"
            value={eventStoreSummary.latest_event_store_sequence.toString()}
          />
          <DiagnosticMetric
            label="Dropped Old Events"
            value={eventStoreSummary.dropped_old_events.toString()}
          />
          <DiagnosticMetric
            label="Replay Snapshot"
            value={eventStoreSummary.current_events > 0 ? "AVAILABLE" : "EMPTY"}
          />
          <DiagnosticMetric
            label="Replay Complete"
            value={eventStoreDroppedOldEvents === 0 ? "YES" : "PARTIAL"}
          />
          <DiagnosticMetric
            label="Replay Events"
            value={eventStoreSummary.current_events.toString()}
          />
          <DiagnosticMetric label="Last Packet UTC" value={lastPacketAt ?? "NO PACKET"} />
          <DiagnosticMetric label="Offline Devices" value={registrySummary.offline.toString()} />
        </ResponsiveMetricGrid>
      </div>
    </details>
  );
}

function StabilityTest({
  soakMetrics,
  soakStatus,
  soakProgressPercent,
  startSoakSession,
  resetSoakSession,
}: {
  soakMetrics: ReturnType<typeof useTelemetryStore.getState>["soakMetrics"];
  soakStatus: string;
  soakProgressPercent: number;
  startSoakSession: (targetDurationMinutes: number) => void;
  resetSoakSession: () => void;
}) {
  return (
    <SectionCard
      title="Stability Test"
      description="Hardware telemetry stability observation"
    >
      <div className="mb-4 flex min-w-0 flex-wrap gap-2">
        <SoakButton label="Start 10 min" onClick={() => startSoakSession(10)} />
        <SoakButton label="Start 30 min" onClick={() => startSoakSession(30)} />
        <SoakButton label="Start 60 min" onClick={() => startSoakSession(60)} />
        <SoakButton label="Reset test" onClick={resetSoakSession} variant="danger" />
      </div>

      <ResponsiveMetricGrid>
        <MetricCard label="Test Status" value={humanizeSoakStatus(soakStatus)} />
        <MetricCard
          label="Target Duration"
          value={
            soakMetrics.targetDurationMinutes === null
              ? "Not set"
              : `${soakMetrics.targetDurationMinutes} min`
          }
        />
        <MetricCard label="Elapsed" value={formatDuration(soakMetrics.soakElapsedSeconds)} />
        <MetricCard label="Progress" value={`${soakProgressPercent.toFixed(1)}%`} />
        <MetricCard label="Current Verdict" value={soakMetrics.verdict.status} />
        <MetricCard label="Total Packets" value={soakMetrics.totalPackets.toString()} />
        <MetricCard
          label="Packets per Minute"
          value={soakMetrics.packetsPerMinute.toFixed(2)}
        />
      </ResponsiveMetricGrid>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <EvidenceBlock
          title="Failure Reasons"
          emptyText="None"
          values={soakMetrics.verdict.failureReasons}
          tone="fault"
        />
        <EvidenceBlock
          title="Warning Reasons"
          emptyText="None"
          values={soakMetrics.verdict.warningReasons}
          tone="attention"
        />
        <EvidenceBlock
          title="Node Health Transitions"
          emptyText="No transitions"
          values={Object.entries(soakMetrics.nodeStability).map(
            ([nodeId, node]) =>
              `${nodeId}: transitions=${node.healthTransitionCount}, resets=${node.resetCount}`
          )}
        />
      </div>

      <details className="mt-4 min-w-0 rounded-md bg-slate-950/55">
        <summary className="cursor-pointer rounded-md px-4 py-3 text-sm font-semibold text-slate-300 marker:text-cyan-400 hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Stability diagnostics
        </summary>
        <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-slate-800/80 p-4 xl:grid-cols-3">
          <RecordBlock title="Packets by Source" values={soakMetrics.packetsBySourceNode} />
          <RecordBlock title="Packets by Event Type" values={soakMetrics.packetsByEventType} />
          <RecordBlock title="Packets by Link" values={soakMetrics.packetsByLink} />
          <EvidenceBlock
            title="Maximum Heartbeat Gap by Link"
            emptyText="No heartbeat evidence"
            values={Object.entries(soakMetrics.linkStability).map(
              ([linkId, link]) => `${linkId}: ${link.maxHeartbeatGapMs} ms`
            )}
          />
          <EvidenceBlock
            title="Link Dropouts by Link"
            emptyText="No dropouts"
            values={Object.entries(soakMetrics.linkStability).map(
              ([linkId, link]) =>
                `${linkId}: dropouts=${link.dropoutCount}, recovered=${link.recoveredDropoutCount}`
            )}
          />
        </div>
      </details>
    </SectionCard>
  );
}

function DiagnosticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-950/60 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-all font-mono text-xs text-cyan-100">{value}</div>
    </div>
  );
}

function SoakButton({
  label,
  onClick,
  variant = "normal",
}: {
  label: string;
  onClick: () => void;
  variant?: "normal" | "danger";
}) {
  const className =
    variant === "danger"
      ? "min-h-10 rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      : "min-h-10 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}

function EvidenceBlock({
  title,
  values,
  emptyText,
  tone = "neutral",
}: {
  title: string;
  values: string[];
  emptyText: string;
  tone?: StatusTone;
}) {
  const hasValues = values.length > 0;
  return (
    <div className="min-w-0 rounded-md bg-slate-950/60 p-4">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-300">{title}</div>
        {hasValues && <StatusChip tone={tone}>{values.length}</StatusChip>}
      </div>
      {!hasValues ? (
        <div className="text-sm text-slate-500">{emptyText}</div>
      ) : (
        <ul className="space-y-1 text-sm text-slate-300">
          {values.map((value) => (
            <li key={value} className="break-words">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordBlock({ title, values }: { title: string; values: Record<string, number> }) {
  return (
    <EvidenceBlock
      title={title}
      emptyText="No packets"
      values={Object.entries(values).map(([key, value]) => `${key}: ${value}`)}
    />
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getSoakStatus(soakMetrics: {
  isSoakActive: boolean;
  targetDurationMinutes: number | null;
  soakElapsedSeconds: number;
  verdict: { status: string };
}) {
  if (soakMetrics.verdict.status === "FAIL") return "FAILED";
  if (!soakMetrics.isSoakActive) return "IDLE";
  if (
    soakMetrics.targetDurationMinutes !== null &&
    soakMetrics.soakElapsedSeconds >= soakMetrics.targetDurationMinutes * 60
  ) {
    return "COMPLETE";
  }
  return "ACTIVE";
}

function humanizeSoakStatus(status: string) {
  if (status === "FAILED") return "Failed";
  if (status === "IDLE") return "Not running";
  if (status === "COMPLETE") return "Complete";
  if (status === "ACTIVE") return "Running";
  return status;
}

function getSoakProgressPercent(soakMetrics: {
  targetDurationMinutes: number | null;
  soakElapsedSeconds: number;
}) {
  if (soakMetrics.targetDurationMinutes === null) return 0;
  const targetSeconds = soakMetrics.targetDurationMinutes * 60;
  if (targetSeconds <= 0) return 0;
  return Math.min(100, (soakMetrics.soakElapsedSeconds / targetSeconds) * 100);
}
