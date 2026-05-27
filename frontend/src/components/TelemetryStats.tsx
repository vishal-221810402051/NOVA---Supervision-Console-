import { useTelemetryStore } from "../store/telemetryStore";

export function TelemetryStats() {
  const packetCount = useTelemetryStore((s) => s.packetCount);
  const lastSequenceNumber = useTelemetryStore((s) => s.lastSequenceNumber);
  const missedPackets = useTelemetryStore((s) => s.missedPackets);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);
  const registrySummary = useTelemetryStore((s) => s.registrySummary);

  return (
    <section className="grid grid-cols-6 gap-3">
      <Metric label="Packet Count" value={packetCount.toString()} />
      <Metric label="Last Sequence" value={lastSequenceNumber?.toString() ?? "N/A"} />
      <Metric label="Missed Packets" value={missedPackets.toString()} />
      <Metric label="Last Packet UTC" value={lastPacketAt ?? "NO PACKET"} />
      <Metric label="Healthy Devices" value={registrySummary.healthy.toString()} />
      <Metric label="Offline Devices" value={registrySummary.offline.toString()} />
    </section>
  );
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
