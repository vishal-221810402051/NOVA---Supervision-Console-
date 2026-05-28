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
  const activeStreamId = useTelemetryStore((s) => s.activeStreamId);
  const streamSwitches = useTelemetryStore((s) => s.streamSwitches);
  const activeTelemetrySource = useTelemetryStore((s) => s.activeTelemetrySource);

  return (
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
      <Metric label="Last Packet UTC" value={lastPacketAt ?? "NO PACKET"} />
      <Metric label="Healthy Devices" value={registrySummary.healthy.toString()} />
      <Metric label="Offline Devices" value={registrySummary.offline.toString()} />
    </section>
  );
}

function shortStreamId(streamId: string | null) {
  if (!streamId) return "N/A";
  return streamId.length > 18 ? `${streamId.slice(0, 18)}...` : streamId;
}

function shortValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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
