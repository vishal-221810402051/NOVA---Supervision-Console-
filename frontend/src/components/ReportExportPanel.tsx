import { useTelemetryStore } from "../store/telemetryStore";
import {
  buildNovaScValidationReport,
  downloadJsonReport,
} from "../state/reportBuilder";

export function ReportExportPanel() {
  const deviceRegistry = useTelemetryStore((s) => s.deviceRegistry);
  const linkRegistry = useTelemetryStore((s) => s.linkRegistry);
  const linkRegistrySummary = useTelemetryStore((s) => s.linkRegistrySummary);
  const gatewayHealth = useTelemetryStore((s) => s.gatewayHealth);
  const powerHealth = useTelemetryStore((s) => s.powerHealth);
  const rtcStatus = useTelemetryStore((s) => s.rtcStatus);
  const latestRtcStatusPacket = useTelemetryStore((s) => s.latestRtcStatusPacket);
  const latestRtcSyncResult = useTelemetryStore((s) => s.latestRtcSyncResult);
  const rtcDriftBaseline = useTelemetryStore((s) => s.rtcDriftBaseline);
  const persistentEvidenceSummary = useTelemetryStore((s) => s.persistentEvidenceSummary);
  const activeTelemetrySource = useTelemetryStore((s) => s.activeTelemetrySource);
  const globalHealth = useTelemetryStore((s) => s.globalHealth);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);
  const activeStreamId = useTelemetryStore((s) => s.activeStreamId);
  const streamSwitches = useTelemetryStore((s) => s.streamSwitches);
  const sourceSequences = useTelemetryStore((s) => s.sourceSequences);
  const packetCount = useTelemetryStore((s) => s.packetCount);
  const packetRateHz = useTelemetryStore((s) => s.packetRateHz);
  const lastSequenceNumber = useTelemetryStore((s) => s.lastSequenceNumber);
  const missedPackets = useTelemetryStore((s) => s.missedPackets);
  const duplicatePackets = useTelemetryStore((s) => s.duplicatePackets);
  const outOfOrderPackets = useTelemetryStore((s) => s.outOfOrderPackets);
  const sequenceResets = useTelemetryStore((s) => s.sequenceResets);
  const sequenceGaps = useTelemetryStore((s) => s.sequenceGaps);
  const schemaRejectedPackets = useTelemetryStore((s) => s.schemaRejectedPackets);
  const malformedPackets = useTelemetryStore((s) => s.malformedPackets);
  const unknownEventPackets = useTelemetryStore((s) => s.unknownEventPackets);
  const unknownNodePackets = useTelemetryStore((s) => s.unknownNodePackets);
  const unknownLinkPackets = useTelemetryStore((s) => s.unknownLinkPackets);
  const eventStore = useTelemetryStore((s) => s.eventStore);
  const eventStoreSummary = useTelemetryStore((s) => s.eventStoreSummary);
  const eventStoreDroppedOldEvents = useTelemetryStore((s) => s.eventStoreDroppedOldEvents);
  const eventStoreMaxEvents = useTelemetryStore((s) => s.eventStoreMaxEvents);
  const soakMetrics = useTelemetryStore((s) => s.soakMetrics);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);
  const logs = useTelemetryStore((s) => s.logs);

  const handleDownload = () => {
    const eventStoreRecent = eventStore.slice(-50);

    const report = buildNovaScValidationReport({
      deviceRegistry,
      linkRegistry,
      linkRegistrySummary,
      gatewayHealth,
      persistentEvidenceSummary,
      powerHealth,
      rtcStatus,
      latestRtcStatusPacket,
      latestRtcSyncResult,
      rtcDriftBaseline,
      activeTelemetrySource,
      globalHealth,
      connectionState,
      isTelemetryStale,
      activeStreamId,
      streamSwitches,
      sourceSequences,
      packetCount,
      packetRateHz,
      lastSequenceNumber,
      missedPackets,
      duplicatePackets,
      outOfOrderPackets,
      sequenceResets,
      sequenceGaps,
      schemaRejectedPackets,
      malformedPackets,
      unknownEventPackets,
      unknownNodePackets,
      unknownLinkPackets,
      eventStoreSummary,
      eventStoreRecent,
      eventStore,
      eventStoreDroppedOldEvents,
      eventStoreMaxEvents,
      soakMetrics,
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
            V1+ Supervisory Report Export
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Topology, gateway, link, stream, integrity, validation, and registry evidence
          </p>
        </div>

        <button
          onClick={handleDownload}
          className="border border-cyan-500 bg-cyan-950/30 px-5 py-3 text-xs font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-900/40"
        >
          Download Supervisory JSON Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Report Type" value="Supervisory Validation" />
        <Metric label="Format" value="JSON" />
        <Metric label="Scope" value="Topology + Gateway + Links + Stream + Devices" />
        <Metric label="Includes Logs" value="Last 50 Events" />
        <Metric label="Includes Event Store" value="Last 50 Event Records" />
        <Metric label="Replay Reconstruction" value="Included" />
        <Metric label="Persistent Evidence" value={persistentEvidenceSummary?.persistent_evidence_enabled ? "Backend Enabled" : "Backend Disabled"} />
        <Metric label="Soak Summary" value="Included" />
        <Metric label="Soak Verdict" value={soakMetrics.verdict.status} />
        <Metric label="Simulator Mode" value={activeTelemetrySource.is_simulated ? "TRUE" : "FALSE"} />
        <Metric label="Hardware Connected" value={activeTelemetrySource.is_simulated ? "FALSE" : "TRUE"} />
        <Metric label="Physical Hardware Validation" value={activeTelemetrySource.is_simulated ? "FALSE" : "TRUE"} />
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
