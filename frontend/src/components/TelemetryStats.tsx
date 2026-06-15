import { useTelemetryStore } from "../store/telemetryStore";

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

  return (
    <>
      <section className="grid grid-cols-4 gap-3 xl:grid-cols-9">
        <Metric label="Active Source" value={activeTelemetrySource.display_name} />
        <Metric label="Transport Kind" value={activeTelemetrySource.transport_kind} />
        <Metric label="Source Endpoint" value={shortValue(activeTelemetrySource.endpoint, 24)} />
        <Metric label="Simulated Source" value={activeTelemetrySource.is_simulated ? "TRUE" : "FALSE"} />
        <Metric label="Reconnect Attempts" value={activeTelemetrySource.reconnect_attempts.toString()} />
        <Metric label="Last Transport Error" value={shortValue(activeTelemetrySource.last_error ?? "NONE", 24)} />
        <Metric label="Active Stream" value={shortStreamId(activeStreamId)} />
        <Metric label="Stream Switches" value={streamSwitches.toString()} />
        <Metric label="Packet Count" value={packetCount.toString()} />
        <Metric label="Packet Rate" value={`${packetRateHz.toFixed(2)} Hz`} />
        <Metric label="Last Sequence" value={lastSequenceNumber?.toString() ?? "N/A"} />
        <Metric label="Missed Packets" value={missedPackets.toString()} />
        <Metric label="Duplicate Packets" value={duplicatePackets.toString()} />
        <Metric label="Out-of-Order" value={outOfOrderPackets.toString()} />
        <Metric label="Sequence Resets" value={sequenceResets.toString()} />
        <Metric label="Sequence Gaps" value={sequenceGaps.toString()} />
        <Metric label="Schema Rejected" value={schemaRejectedPackets.toString()} />
        <Metric label="Malformed" value={malformedPackets.toString()} />
        <Metric label="Unknown Events" value={unknownEventPackets.toString()} />
        <Metric label="Unknown Nodes" value={unknownNodePackets.toString()} />
        <Metric label="Unknown Links" value={unknownLinkPackets.toString()} />
        <Metric label="Event Store Count" value={eventStoreSummary.current_events.toString()} />
        <Metric label="Latest Event Seq" value={eventStoreSummary.latest_event_store_sequence.toString()} />
        <Metric label="Dropped Old Events" value={eventStoreSummary.dropped_old_events.toString()} />
        <Metric label="Replay Snapshot" value={eventStoreSummary.current_events > 0 ? "AVAILABLE" : "EMPTY"} />
        <Metric label="Replay Complete" value={eventStoreDroppedOldEvents === 0 ? "YES" : "PARTIAL"} />
        <Metric label="Replay Events" value={eventStoreSummary.current_events.toString()} />
        <Metric label="Last Packet UTC" value={lastPacketAt ?? "NO PACKET"} />
        <Metric label="Healthy Devices" value={registrySummary.healthy.toString()} />
        <Metric label="Offline Devices" value={registrySummary.offline.toString()} />
        <Metric label="Soak Active" value={soakMetrics.isSoakActive ? "YES" : "NO"} />
        <Metric label="Soak Duration" value={formatDuration(soakMetrics.soakElapsedSeconds)} />
        <Metric label="Soak Verdict" value={soakMetrics.verdict.status} />
        <Metric label="Soak Packets" value={soakMetrics.totalPackets.toString()} />
        <Metric label="Soak Pkt/min" value={soakMetrics.packetsPerMinute.toFixed(2)} />
      </section>

      <section className="mt-3 border border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-300">
              Phase 7.0 Soak Test
            </h2>
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              Duration-scoped hardware telemetry evidence
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SoakButton label="Start 10 min" onClick={() => startSoakSession(10)} />
            <SoakButton label="Start 30 min" onClick={() => startSoakSession(30)} />
            <SoakButton label="Start 60 min" onClick={() => startSoakSession(60)} />
            <SoakButton label="Reset soak" onClick={resetSoakSession} variant="danger" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Soak Status" value={soakStatus} />
          <Metric
            label="Target Duration"
            value={
              soakMetrics.targetDurationMinutes === null
                ? "NOT SET"
                : `${soakMetrics.targetDurationMinutes} min`
            }
          />
          <Metric label="Elapsed" value={formatDuration(soakMetrics.soakElapsedSeconds)} />
          <Metric label="Progress" value={`${soakProgressPercent.toFixed(1)}%`} />
          <Metric label="Current Verdict" value={soakMetrics.verdict.status} />
          <Metric label="Total Packets" value={soakMetrics.totalPackets.toString()} />
          <Metric label="Packets/min" value={soakMetrics.packetsPerMinute.toFixed(2)} />
        </div>

        <div className="mt-4 grid gap-3 text-xs xl:grid-cols-3">
          <EvidenceBlock
            title="Failure Reasons"
            emptyText="None"
            values={soakMetrics.verdict.failureReasons}
          />
          <EvidenceBlock
            title="Warning Reasons"
            emptyText="None"
            values={soakMetrics.verdict.warningReasons}
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

        <div className="mt-3 grid gap-3 text-xs xl:grid-cols-3">
          <RecordBlock title="Packets By Source" values={soakMetrics.packetsBySourceNode} />
          <RecordBlock title="Packets By Event Type" values={soakMetrics.packetsByEventType} />
          <RecordBlock title="Packets By Link" values={soakMetrics.packetsByLink} />
        </div>

        <div className="mt-3 grid gap-3 text-xs xl:grid-cols-2">
          <EvidenceBlock
            title="Max Heartbeat Gap By Link"
            emptyText="No heartbeat evidence"
            values={Object.entries(soakMetrics.linkStability).map(
              ([linkId, link]) => `${linkId}: ${link.maxHeartbeatGapMs} ms`
            )}
          />
          <EvidenceBlock
            title="Link Dropouts By Link"
            emptyText="No dropouts"
            values={Object.entries(soakMetrics.linkStability).map(
              ([linkId, link]) =>
                `${linkId}: dropouts=${link.dropoutCount}, recovered=${link.recoveredDropoutCount}`
            )}
          />
        </div>
      </section>
    </>
  );
}

function shortStreamId(streamId: string | null) {
  if (!streamId) return "N/A";
  return streamId.length > 18 ? `${streamId.slice(0, 18)}...` : streamId;
}

function shortValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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

function getSoakProgressPercent(soakMetrics: {
  targetDurationMinutes: number | null;
  soakElapsedSeconds: number;
}) {
  if (soakMetrics.targetDurationMinutes === null) return 0;
  const targetSeconds = soakMetrics.targetDurationMinutes * 60;
  if (targetSeconds <= 0) return 0;
  return Math.min(100, (soakMetrics.soakElapsedSeconds / targetSeconds) * 100);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="font-mono text-sm text-cyan-100">{value}</div>
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
      ? "border border-rose-500 bg-rose-950/30 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-200 hover:bg-rose-900/40"
      : "border border-cyan-500 bg-cyan-950/30 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-900/40";

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
}: {
  title: string;
  values: string[];
  emptyText: string;
}) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">
        {title}
      </div>
      {values.length === 0 ? (
        <div className="font-mono text-xs text-cyan-100">{emptyText}</div>
      ) : (
        <ul className="space-y-1 font-mono text-xs text-cyan-100">
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordBlock({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <EvidenceBlock
      title={title}
      emptyText="No packets"
      values={Object.entries(values).map(([key, value]) => `${key}: ${value}`)}
    />
  );
}
