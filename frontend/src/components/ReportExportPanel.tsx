import { useTelemetryStore } from "../store/telemetryStore";
import {
  buildNovaScValidationReport,
  downloadJsonReport,
} from "../state/reportBuilder";

export function ReportExportPanel() {
  const deviceRegistry = useTelemetryStore((s) => s.deviceRegistry);
  const globalHealth = useTelemetryStore((s) => s.globalHealth);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);
  const packetCount = useTelemetryStore((s) => s.packetCount);
  const packetRateHz = useTelemetryStore((s) => s.packetRateHz);
  const lastSequenceNumber = useTelemetryStore((s) => s.lastSequenceNumber);
  const missedPackets = useTelemetryStore((s) => s.missedPackets);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);
  const logs = useTelemetryStore((s) => s.logs);

  const handleDownload = () => {
    const report = buildNovaScValidationReport({
      deviceRegistry,
      globalHealth,
      connectionState,
      isTelemetryStale,
      packetCount,
      packetRateHz,
      lastSequenceNumber,
      missedPackets,
      lastPacketAt,
      logs,
    });

    downloadJsonReport(report);
  };

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            V1 Validation Report Export
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Export current health check, device registry, telemetry stats, and logs
          </p>
        </div>

        <button
          onClick={handleDownload}
          className="border border-cyan-500 bg-cyan-950/30 px-5 py-3 text-xs font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-900/40"
        >
          Download JSON Report
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 text-xs">
        <Metric label="Report Type" value="V1 Health Check" />
        <Metric label="Format" value="JSON" />
        <Metric label="Scope" value="Health + Chip Status" />
        <Metric label="Includes Logs" value="Last 50 Events" />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="font-mono text-cyan-100">{value}</div>
    </div>
  );
}
