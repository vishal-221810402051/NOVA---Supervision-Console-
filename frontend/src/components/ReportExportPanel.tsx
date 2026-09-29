import { useRef, useState } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import {
  buildNovaScValidationReport,
  downloadJsonReport,
} from "../state/reportBuilder";
import { capturePersistentReplaySummary } from "../transport/backendHealth";
import type { PersistentReplayCapture } from "../types/telemetry";
import { MetricCard } from "./ui/MetricCard";
import { SectionCard } from "./ui/SectionCard";
import type { StatusTone } from "./ui/StatusChip";

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
  const captureError =
    lastReplayCapture?.report_data_status === "REPORT_DATA_UNAVAILABLE"
      ? lastReplayCapture.error_reason
      : null;

  return (
    <SectionCard>
      <header className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-100">Reports</h2>
          <p className="mt-1 break-words text-sm text-slate-400">
            Export the current supervisory system report and validation evidence.
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={isExporting}
          className="w-full shrink-0 rounded-md border border-cyan-500/60 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-50 lg:w-auto"
        >
          {isExporting ? "Preparing report..." : "Export Report"}
        </button>
      </header>

      <section className="min-w-0" aria-labelledby="report-summary-heading">
        <h3 id="report-summary-heading" className="mb-3 text-sm font-semibold text-slate-200">
          Report Summary
        </h3>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Availability" value={isExporting ? "Preparing report" : "Ready to export"} />
          <MetricCard label="Format" value="JSON" />
          <MetricCard label="Operating Mode" value={activeTelemetrySource.is_simulated ? "Simulation" : "Hardware telemetry"} />
          <MetricCard label="Stability Test" value={humanizeStabilityStatus(soakMetrics.verdict.status)} />
        </div>
      </section>

      <section className="mt-5 min-w-0" aria-labelledby="evidence-status-heading">
        <h3 id="evidence-status-heading" className="mb-3 text-sm font-semibold text-slate-200">
          Evidence Status
        </h3>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatusMetric
            label="Saved Evidence"
            value={persistentEvidenceSummary?.persistent_evidence_enabled ? "Enabled" : "Not enabled"}
            tone={persistentEvidenceSummary?.persistent_evidence_enabled ? "healthy" : "neutral"}
          />
          <StatusMetric
            label="Evidence Verification"
            value={humanizeReplayStatus(persistentReplayStatus)}
            tone={replayStatusTone(persistentReplayStatus)}
          />
          <StatusMetric
            label="Verification Data"
            value={captureError ? humanizeCaptureError(captureError) : lastReplayCapture ? "Available" : "Not checked this session"}
            tone={captureError ? "attention" : lastReplayCapture ? "healthy" : "neutral"}
          />
        </div>

        {captureError && (
          <p className="mt-3 break-words rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {humanizeCaptureError(captureError)}. The exported report records this as unavailable, not as a failed verification.
          </p>
        )}
      </section>

      <details className="mt-5 min-w-0 rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <summary className="cursor-pointer rounded-sm text-sm font-semibold text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical report details
        </summary>
        <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <TechnicalField label="Report type" value="Supervisory Validation" />
          <TechnicalField label="Included scope" value="Topology + Gateway + Links + Stream + Devices" />
          <TechnicalField label="Included logs" value="Last 50 Events" />
          <TechnicalField label="Included event store" value="Last 50 Event Records" />
          <TechnicalField label="Replay reconstruction" value="Included" />
          <TechnicalField label="Persistent evidence enabled" value={formatBoolean(persistentEvidenceSummary?.persistent_evidence_enabled ?? false)} />
          <TechnicalField label="Persistent evidence active" value={formatBoolean(persistentEvidenceSummary?.persistent_evidence_active ?? false)} />
          <TechnicalField label="Raw replay status" value={persistentReplayStatus} />
          <TechnicalField label="Report data status" value={lastReplayCapture?.report_data_status ?? "NOT_CAPTURED"} />
          <TechnicalField label="Raw capture error" value={captureError ?? "NONE"} />
          <TechnicalField label="Captured at UTC" value={lastReplayCapture?.captured_at_utc ?? "NOT_CAPTURED"} />
          <TechnicalField label="Raw stability-test verdict" value={soakMetrics.verdict.status} />
          <TechnicalField label="Source simulated flag" value={formatBoolean(activeTelemetrySource.is_simulated)} />
        </dl>
      </details>
    </SectionCard>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-900/80 p-4">
      <div className="mb-2 text-xs font-medium text-slate-400">{label}</div>
      <div className={`inline-flex max-w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold ${statusToneClass(tone)}`}>
        <span className="break-words">{value}</span>
      </div>
    </div>
  );
}

function TechnicalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-900/80 p-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm text-slate-300">{value}</dd>
    </div>
  );
}

function humanizeReplayStatus(status: string) {
  if (status === "NOT CAPTURED") return "Not checked this session";
  if (status === "PASS") return "Verified";
  if (status === "FAIL") return "Verification failed";
  if (status === "PENDING") return "Not configured";
  if (status === "REPORT_DATA_UNAVAILABLE") return "Verification data unavailable";
  return "Unknown status";
}

function replayStatusTone(status: string): StatusTone {
  if (status === "PASS") return "healthy";
  if (status === "FAIL") return "fault";
  if (status === "PENDING" || status === "REPORT_DATA_UNAVAILABLE") return "attention";
  return "neutral";
}

function statusToneClass(tone: StatusTone) {
  if (tone === "healthy") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (tone === "attention") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (tone === "fault") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-slate-700 bg-slate-800/70 text-slate-200";
}

function humanizeCaptureError(reason: string) {
  if (reason === "HEALTH_REQUEST_FAILED") return "Verification service unavailable";
  if (reason === "HEALTH_RESPONSE_INVALID") return "Verification response could not be read";
  if (reason === "REPLAY_SUMMARY_MISSING") return "Verification summary unavailable";
  if (reason === "UNSUPPORTED_REPLAY_SUMMARY_SCHEMA") return "Verification data format is unsupported";
  return "Verification status is unknown";
}

function humanizeStabilityStatus(status: string) {
  if (status === "PASS") return "Passed";
  if (status === "WARNING") return "Needs attention";
  if (status === "FAIL") return "Failed";
  if (status === "IN_PROGRESS") return "In progress";
  return "Unknown status";
}

function formatBoolean(value: boolean) {
  return value ? "TRUE" : "FALSE";
}
