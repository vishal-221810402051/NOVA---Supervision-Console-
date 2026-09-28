import { useRef, useState } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import {
  buildNovaScValidationReport,
  downloadJsonReport,
} from "../state/reportBuilder";
import { capturePersistentReplaySummary } from "../transport/backendHealth";
import type { PersistentReplayCapture } from "../types/telemetry";

export function ReportExportPanel() {
  const persistentEvidenceSummary = useTelemetryStore((s) => s.persistentEvidenceSummary);
  const activeTelemetrySource = useTelemetryStore((s) => s.activeTelemetrySource);
  const soakMetrics = useTelemetryStore((s) => s.soakMetrics);
  const exportInProgress = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastReplayCapture, setLastReplayCapture] =
    useState<PersistentReplayCapture | null>(null);

  const handleDownload = async () => {
    if (exportInProgress.current) return;
    exportInProgress.current = true;
    setIsExporting(true);

    try {
      const persistentReplayCapture = await capturePersistentReplaySummary(
        activeTelemetrySource.endpoint
      );
      setLastReplayCapture(persistentReplayCapture);

      const state = useTelemetryStore.getState();
      const report = buildNovaScValidationReport({
        deviceRegistry: state.deviceRegistry,
        linkRegistry: state.linkRegistry,
        linkRegistrySummary: state.linkRegistrySummary,
        gatewayHealth: state.gatewayHealth,
        persistentEvidenceSummary: state.persistentEvidenceSummary,
        persistentReplayCapture,
        powerHealth: state.powerHealth,
        rtcStatus: state.rtcStatus,
        latestRtcStatusPacket: state.latestRtcStatusPacket,
        latestRtcSyncResult: state.latestRtcSyncResult,
        rtcDriftBaseline: state.rtcDriftBaseline,
        activeTelemetrySource: state.activeTelemetrySource,
        globalHealth: state.globalHealth,
        connectionState: state.connectionState,
        isTelemetryStale: state.isTelemetryStale,
        activeStreamId: state.activeStreamId,
        streamSwitches: state.streamSwitches,
        sourceSequences: state.sourceSequences,
        packetCount: state.packetCount,
        packetRateHz: state.packetRateHz,
        lastSequenceNumber: state.lastSequenceNumber,
        missedPackets: state.missedPackets,
        duplicatePackets: state.duplicatePackets,
        outOfOrderPackets: state.outOfOrderPackets,
        sequenceResets: state.sequenceResets,
        sequenceGaps: state.sequenceGaps,
        schemaRejectedPackets: state.schemaRejectedPackets,
        malformedPackets: state.malformedPackets,
        unknownEventPackets: state.unknownEventPackets,
        unknownNodePackets: state.unknownNodePackets,
        unknownLinkPackets: state.unknownLinkPackets,
        eventStoreSummary: state.eventStoreSummary,
        eventStoreRecent: state.eventStore.slice(-50),
        eventStore: state.eventStore,
        eventStoreDroppedOldEvents: state.eventStoreDroppedOldEvents,
        eventStoreMaxEvents: state.eventStoreMaxEvents,
        soakMetrics: state.soakMetrics,
        lastPacketAt: state.lastPacketAt,
        logs: state.logs,
      });

      downloadJsonReport(report);
    } finally {
      exportInProgress.current = false;
      setIsExporting(false);
    }
  };

  const persistentReplayStatus =
    lastReplayCapture === null
      ? "NOT CAPTURED"
      : lastReplayCapture.report_data_status === "AVAILABLE"
        ? lastReplayCapture.summary.replay_validation_status
        : "REPORT_DATA_UNAVAILABLE";

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
          disabled={isExporting}
          className="border border-cyan-500 bg-cyan-950/30 px-5 py-3 text-xs font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-900/40 disabled:cursor-wait disabled:opacity-50"
        >
          {isExporting ? "Preparing Report..." : "Download Supervisory JSON Report"}
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
        <Metric label="Persistent Replay" value={persistentReplayStatus} />
        <Metric label="Soak Summary" value="Included" />
        <Metric label="Soak Verdict" value={soakMetrics.verdict.status} />
        <Metric label="Simulator Mode" value={activeTelemetrySource.is_simulated ? "TRUE" : "FALSE"} />
        <Metric label="Hardware Connected" value={activeTelemetrySource.is_simulated ? "FALSE" : "TRUE"} />
        <Metric label="Physical Hardware Validation" value={activeTelemetrySource.is_simulated ? "FALSE" : "TRUE"} />
      </div>

      {lastReplayCapture?.report_data_status === "REPORT_DATA_UNAVAILABLE" && (
        <p className="mt-3 text-xs font-mono text-amber-300">
          Persistent replay report data unavailable: {lastReplayCapture.error_reason}
        </p>
      )}
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
