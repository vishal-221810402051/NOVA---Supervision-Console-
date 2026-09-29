import { useTelemetryStore } from "../store/telemetryStore";
import type { DeviceRegistryEntry } from "../types/telemetry";
import { isAcceptedNodeId, normalizeNodeId } from "../types/telemetry";
import { MetricCard } from "./ui/MetricCard";
import { ResponsiveMetricGrid } from "./ui/ResponsiveMetricGrid";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

type Severity = "healthy" | "warning" | "critical" | "neutral";

const nodeMeta: Record<string, { label: string; role: string; rawRole: string }> = {
  laptop_console: {
    label: "Operator Console",
    role: "Supervision interface",
    rawRole: "SUPERVISION_CONSOLE",
  },
  pi_gateway: {
    label: "Gateway",
    role: "Telemetry gateway",
    rawRole: "GATEWAY",
  },
  esp32_main: {
    label: "Main Controller",
    role: "Primary telemetry processor",
    rawRole: "MOTION_CONTROL",
  },
  esp32_sub: {
    label: "Secondary Controller",
    role: "Secondary telemetry processor",
    rawRole: "SAFETY_QC",
  },
};

export function TopologyView() {
  const linkRegistry = useTelemetryStore((s) => s.linkRegistry);
  const linkRegistrySummary = useTelemetryStore((s) => s.linkRegistrySummary);
  const deviceRegistry = useTelemetryStore((s) => s.deviceRegistry);
  const gatewayHealth = useTelemetryStore((s) => s.gatewayHealth);
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);
  const activeStreamId = useTelemetryStore((s) => s.activeStreamId);
  const packetRateHz = useTelemetryStore((s) => s.packetRateHz);
  const duplicatePackets = useTelemetryStore((s) => s.duplicatePackets);
  const outOfOrderPackets = useTelemetryStore((s) => s.outOfOrderPackets);
  const sequenceGaps = useTelemetryStore((s) => s.sequenceGaps);
  const streamSwitches = useTelemetryStore((s) => s.streamSwitches);

  const links = Object.values(linkRegistry);
  const getNode = (nodeId: string) => {
    const canonicalNodeId = isAcceptedNodeId(nodeId) ? normalizeNodeId(nodeId) : nodeId;
    return Object.values(deviceRegistry).find(
      (device) =>
        device.device_id === canonicalNodeId ||
        device.node_id === canonicalNodeId ||
        (isAcceptedNodeId(device.node_id) && normalizeNodeId(device.node_id) === canonicalNodeId)
    );
  };

  const integrityState =
    outOfOrderPackets > 0
      ? "ERROR"
      : duplicatePackets > 0 || sequenceGaps > 0
        ? "WARNING"
        : "CLEAN";
  const chainHealth = getChainHealth({
    linkRegistrySummary,
    connectionState,
    isTelemetryStale,
    duplicatePackets,
    sequenceGaps,
    streamSwitches,
  });

  return (
    <section className="grid min-w-0 gap-4">
      <TopologySummaryStrip
        chainHealth={chainHealth}
        linksHealthy={`${linkRegistrySummary.healthy}/${linkRegistrySummary.total}`}
        linksSynced={`${linkRegistrySummary.synced}/${linkRegistrySummary.total}`}
        telemetryFreshness={isTelemetryStale ? "STALE" : "LIVE"}
        packetIntegrity={integrityState}
      />

      <TopologyChain
        laptop={getNode("laptop_console")}
        piGateway={getNode("pi_gateway")}
        main={getNode("esp32_main")}
        sub={getNode("esp32_sub")}
        connectionState={connectionState}
        linkLaptopPi={linkRegistry.link_laptop_pi}
        linkPiMain={linkRegistry.link_pi_main}
        linkMainSub={linkRegistry.link_main_sub}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <GatewayHealthCard gatewayHealth={gatewayHealth} />
        <DataIntegrityPanel
          activeStreamId={activeStreamId}
          packetRateHz={packetRateHz}
          isTelemetryStale={isTelemetryStale}
          duplicatePackets={duplicatePackets}
          outOfOrderPackets={outOfOrderPackets}
          sequenceGaps={sequenceGaps}
          streamSwitches={streamSwitches}
        />
      </section>

      <DetailedLinkRegistry links={links} />
    </section>
  );
}

function TopologySummaryStrip({
  chainHealth,
  linksHealthy,
  linksSynced,
  telemetryFreshness,
  packetIntegrity,
}: {
  chainHealth: string;
  linksHealthy: string;
  linksSynced: string;
  telemetryFreshness: string;
  packetIntegrity: string;
}) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <SummaryCard label="System Path" value={humanizeState(chainHealth)} state={chainHealth} />
      <SummaryCard label="Healthy Links" value={linksHealthy} state={linksHealthy.startsWith("3/") ? "HEALTHY" : "DEGRADED"} />
      <SummaryCard label="Synchronized Links" value={linksSynced} state={linksSynced.startsWith("3/") ? "SYNCED" : "UNKNOWN"} />
      <SummaryCard label="Data Status" value={telemetryFreshness === "LIVE" ? "Live" : "Delayed"} state={telemetryFreshness} />
      <SummaryCard label="Data Integrity" value={humanizeState(packetIntegrity)} state={packetIntegrity} />
    </section>
  );
}

function SummaryCard({ label, value, state }: { label: string; value: string; state: string }) {
  return (
    <MetricCard
      label={label}
      value={<StatusChip tone={toneForState(state)}>{value}</StatusChip>}
    />
  );
}

function TopologyChain({
  laptop,
  piGateway,
  main,
  sub,
  connectionState,
  linkLaptopPi,
  linkPiMain,
  linkMainSub,
}: {
  laptop: DeviceRegistryEntry | undefined;
  piGateway: DeviceRegistryEntry | undefined;
  main: DeviceRegistryEntry | undefined;
  sub: DeviceRegistryEntry | undefined;
  connectionState: string;
  linkLaptopPi: LinkCardData;
  linkPiMain: LinkCardData;
  linkMainSub: LinkCardData;
}) {
  return (
    <SectionCard
      title="System Communication Path"
      description="Operator console to gateway and telemetry processors"
      action={<StatusChip tone={toneForState(connectionState)}>{humanizeState(connectionState)}</StatusChip>}
    >
      <div className="grid min-w-0 grid-cols-1 gap-3 [min-width:1366px]:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
        <NodeCard nodeId="laptop_console" device={laptop} connectionState={connectionState} />
        <LinkCard link={linkLaptopPi} />
        <NodeCard nodeId="pi_gateway" device={piGateway} />
        <LinkCard link={linkPiMain} />
        <NodeCard nodeId="esp32_main" device={main} />
        <LinkCard link={linkMainSub} />
        <NodeCard nodeId="esp32_sub" device={sub} />
      </div>
    </SectionCard>
  );
}

function NodeCard({
  nodeId,
  device,
  connectionState,
}: {
  nodeId: string;
  device: DeviceRegistryEntry | undefined;
  connectionState?: string;
}) {
  const meta = nodeMeta[nodeId] ?? { label: nodeId, role: "Unknown role", rawRole: "UNKNOWN" };
  const fallbackHealth =
    nodeId === "laptop_console" && connectionState === "CONNECTED" ? "HEALTHY" : "OFFLINE";
  const healthState = device?.health_state ?? fallbackHealth;
  const statusMessage =
    device?.status_message ??
    (nodeId === "laptop_console" && connectionState === "CONNECTED"
      ? "Console connected to telemetry stream"
      : "Awaiting node health");

  return (
    <article className={`min-w-0 rounded-md border bg-slate-950/80 p-4 ${borderClass(healthState)}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-slate-100">{meta.label}</h3>
          <p className="mt-1 break-words text-xs text-slate-400">{meta.role}</p>
        </div>
        <StatusChip tone={toneForState(healthState)} className="shrink-0">
          {humanizeState(healthState)}
        </StatusChip>
      </div>

      <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 [min-width:1366px]:grid-cols-1">
        <CompactMetric
          label="Heartbeat"
          value={device?.heartbeat_age_ms == null ? "Not available" : `${Math.round(device.heartbeat_age_ms)} ms ago`}
        />
        <CompactMetric label="Version" value={getVersionText(device)} />
      </dl>

      <p className="mt-4 break-words text-sm text-slate-300">{statusMessage}</p>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical details
        </summary>
        <dl className="mt-3 grid min-w-0 gap-2 text-slate-400">
          <TechnicalRow label="Node ID" value={nodeId} />
          <TechnicalRow label="Raw role" value={meta.rawRole} />
          <TechnicalRow label="Raw health" value={healthState} />
        </dl>
      </details>
    </article>
  );
}

type LinkCardData = {
  link_id: string;
  display_name: string;
  transport: string;
  link_state: string;
  sync_state: string;
  heartbeat_age_ms: number | null;
  round_trip_latency_ms: number | null;
  missed_heartbeat_count: number;
  status_message: string;
};

function LinkCard({ link }: { link: LinkCardData }) {
  const severity = getLinkSeverity(link);

  return (
    <article className={`min-w-0 rounded-md border bg-slate-900/75 p-4 ${severityBorderClass(severity)}`}>
      <div className="flex min-w-0 items-start gap-3">
        <HeartbeatDot state={link.link_state} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold text-slate-100">{link.display_name}</h3>
          <p className="mt-1 text-xs text-slate-400">Communication link</p>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        <StatusChip tone={toneForState(link.link_state)}>{humanizeState(link.link_state)}</StatusChip>
        <StatusChip tone={toneForState(link.sync_state)}>{humanizeState(link.sync_state)}</StatusChip>
      </div>

      <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 [min-width:1366px]:grid-cols-1">
        <CompactMetric label="Latency" value={link.round_trip_latency_ms == null ? "Not available" : `${link.round_trip_latency_ms} ms`} />
        <CompactMetric label="Heartbeat" value={link.heartbeat_age_ms == null ? "Not available" : `${Math.round(link.heartbeat_age_ms)} ms ago`} />
      </dl>

      <p className="mt-4 break-words text-sm text-slate-300">{link.status_message}</p>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical details
        </summary>
        <dl className="mt-3 grid min-w-0 gap-2 text-slate-400">
          <TechnicalRow label="Link ID" value={link.link_id} />
          <TechnicalRow label="Transport" value={link.transport} />
          <TechnicalRow label="Raw link state" value={link.link_state} />
          <TechnicalRow label="Raw sync state" value={link.sync_state} />
          <TechnicalRow label="Missed heartbeats" value={link.missed_heartbeat_count.toString()} />
        </dl>
      </details>
    </article>
  );
}

function GatewayHealthCard({
  gatewayHealth,
}: {
  gatewayHealth:
    | {
        health_state: string;
        uptime_ms: number;
        cpu_percent: number;
        memory_used_percent: number;
        disk_used_percent: number;
        buffer_depth: number;
        dropped_packets: number;
        status_message: string;
      }
    | null;
}) {
  return (
    <SectionCard
      title="Gateway Health"
      description="Telemetry gateway resources and delivery state"
      action={
        <StatusChip tone={toneForState(gatewayHealth?.health_state ?? "OFFLINE")}>
          {humanizeState(gatewayHealth?.health_state ?? "OFFLINE")}
        </StatusChip>
      }
    >
      {gatewayHealth ? (
        <>
          <ResponsiveMetricGrid className="xl:grid-cols-3">
            <MetricCard label="Uptime" value={formatDuration(gatewayHealth.uptime_ms)} />
            <MetricCard label="CPU" value={`${gatewayHealth.cpu_percent}%`} className={metricClass(metricSeverity(gatewayHealth.cpu_percent, 70, 85))} />
            <MetricCard label="Memory" value={`${gatewayHealth.memory_used_percent}%`} className={metricClass(metricSeverity(gatewayHealth.memory_used_percent, 75, 90))} />
            <MetricCard label="Disk" value={`${gatewayHealth.disk_used_percent}%`} className={metricClass(metricSeverity(gatewayHealth.disk_used_percent, 80, 90))} />
            <MetricCard label="Buffer Depth" value={gatewayHealth.buffer_depth.toString()} className={metricClass(metricSeverity(gatewayHealth.buffer_depth, 11, 50))} />
            <MetricCard label="Dropped Packets" value={gatewayHealth.dropped_packets.toString()} className={metricClass(gatewayHealth.dropped_packets > 0 ? "warning" : "healthy")} />
          </ResponsiveMetricGrid>
          <p className="mt-4 break-words text-sm text-slate-300">{gatewayHealth.status_message}</p>
        </>
      ) : (
        <p className="text-sm text-slate-400">Waiting for gateway health telemetry...</p>
      )}
    </SectionCard>
  );
}

function DataIntegrityPanel({
  activeStreamId,
  packetRateHz,
  isTelemetryStale,
  duplicatePackets,
  outOfOrderPackets,
  sequenceGaps,
  streamSwitches,
}: {
  activeStreamId: string | null;
  packetRateHz: number;
  isTelemetryStale: boolean;
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceGaps: number;
  streamSwitches: number;
}) {
  return (
    <SectionCard
      title="Data Integrity"
      description="Live stream quality and ordering counters"
      action={
        <StatusChip tone={isTelemetryStale ? "attention" : "healthy"}>
          {isTelemetryStale ? "Delayed" : "Live"}
        </StatusChip>
      }
    >
      <ResponsiveMetricGrid className="xl:grid-cols-3">
        <MetricCard label="Packet Rate" value={`${packetRateHz.toFixed(2)} Hz`} />
        <MetricCard label="Duplicate Packets" value={duplicatePackets.toString()} className={metricClass(duplicatePackets > 0 ? "warning" : "healthy")} />
        <MetricCard label="Out-of-Order" value={outOfOrderPackets.toString()} className={metricClass(outOfOrderPackets > 0 ? "critical" : "healthy")} />
        <MetricCard label="Sequence Gaps" value={sequenceGaps.toString()} className={metricClass(sequenceGaps > 0 ? "warning" : "healthy")} />
        <MetricCard label="Stream Switches" value={streamSwitches.toString()} className={metricClass(streamSwitches > 0 ? "warning" : "healthy")} />
      </ResponsiveMetricGrid>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical details
        </summary>
        <dl className="mt-3 grid min-w-0 gap-2 text-slate-400">
          <TechnicalRow label="Active stream" value={activeStreamId ?? "N/A"} />
          <TechnicalRow label="Raw freshness" value={isTelemetryStale ? "STALE" : "LIVE"} />
        </dl>
      </details>
    </SectionCard>
  );
}

function DetailedLinkRegistry({ links }: { links: LinkCardData[] }) {
  return (
    <SectionCard title="Connection Details" description="Per-link synchronization, latency, and heartbeat evidence">
      <div className="grid min-w-0 gap-3">
        {links.map((link) => (
          <article key={link.link_id} className={`min-w-0 rounded-md border bg-slate-900/70 p-4 ${severityBorderClass(getLinkSeverity(link))}`}>
            <div className="grid min-w-0 gap-4 [min-width:1366px]:grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(8rem,0.7fr))] [min-width:1366px]:items-center">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold text-slate-100">{link.display_name}</h3>
                <p className="mt-1 break-words text-xs text-slate-400">{link.status_message}</p>
              </div>
              <LabeledStatus label="Link state" value={link.link_state} />
              <LabeledStatus label="Synchronization" value={link.sync_state} />
              <CompactMetric label="Latency" value={link.round_trip_latency_ms == null ? "Not available" : `${link.round_trip_latency_ms} ms`} />
              <CompactMetric label="Heartbeat" value={link.heartbeat_age_ms == null ? "Not available" : `${Math.round(link.heartbeat_age_ms)} ms ago`} />
            </div>
            <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
              <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                Technical details
              </summary>
              <dl className="mt-3 grid min-w-0 gap-2 text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
                <TechnicalRow label="Link ID" value={link.link_id} />
                <TechnicalRow label="Transport" value={link.transport} />
                <TechnicalRow label="Missed heartbeats" value={link.missed_heartbeat_count.toString()} />
              </dl>
            </details>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

function LabeledStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <StatusChip tone={toneForState(value)}>{humanizeState(value)}</StatusChip>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-200">{value}</dd>
    </div>
  );
}

function TechnicalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words font-mono text-slate-300">{value}</dd>
    </div>
  );
}

function HeartbeatDot({ state }: { state: string }) {
  const pulse = state === "LINK_HEALTHY";
  const color =
    state === "LINK_HEALTHY"
      ? "bg-emerald-400"
      : state === "LINK_DEGRADED" || state === "LINK_RECOVERING"
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <span className="relative mt-1 flex h-3 w-3 shrink-0">
      {pulse && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 motion-safe:animate-ping" />
      )}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
    </span>
  );
}

function getChainHealth({
  linkRegistrySummary,
  connectionState,
  isTelemetryStale,
  duplicatePackets,
  sequenceGaps,
  streamSwitches,
}: {
  linkRegistrySummary: {
    total: number;
    healthy: number;
    degraded: number;
    offline: number;
    recovering: number;
    synced: number;
    unknown: number;
  };
  connectionState: string;
  isTelemetryStale: boolean;
  duplicatePackets: number;
  sequenceGaps: number;
  streamSwitches: number;
}) {
  if (
    linkRegistrySummary.offline > 0 ||
    connectionState === "OFFLINE" ||
    connectionState === "RECONNECTING"
  ) {
    return "OFFLINE";
  }

  if (
    linkRegistrySummary.degraded > 0 ||
    linkRegistrySummary.recovering > 0 ||
    isTelemetryStale ||
    linkRegistrySummary.unknown > 0 ||
    duplicatePackets > 0 ||
    sequenceGaps > 0 ||
    streamSwitches > 0
  ) {
    return "DEGRADED";
  }

  if (
    linkRegistrySummary.healthy === linkRegistrySummary.total &&
    linkRegistrySummary.synced === linkRegistrySummary.total &&
    connectionState === "CONNECTED"
  ) {
    return "HEALTHY";
  }

  return "DEGRADED";
}

function getVersionText(device: DeviceRegistryEntry | undefined) {
  const status = device?.status_message ?? "";
  const firmwareMatch = status.match(/Firmware\s+(.+)/);
  if (firmwareMatch?.[1]) return firmwareMatch[1];
  return "-";
}

function getLinkSeverity(link: LinkCardData): Severity {
  if (link.sync_state === "DESYNCED" || link.link_state === "LINK_OFFLINE") {
    return "critical";
  }

  if (
    link.link_state === "LINK_DEGRADED" ||
    link.link_state === "LINK_RECOVERING" ||
    link.sync_state === "UNKNOWN"
  ) {
    return "warning";
  }

  return "healthy";
}

function metricSeverity(value: number, warningAt: number, criticalAt: number): Severity {
  if (value > criticalAt) return "critical";
  if (value >= warningAt) return "warning";
  return "healthy";
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function humanizeState(state: string) {
  const labels: Record<string, string> = {
    HEALTHY: "Healthy",
    DEGRADED: "Needs attention",
    OFFLINE: "Offline",
    FAIL_SAFE: "Fail-safe",
    CONNECTED: "Connected",
    CONNECTING: "Connecting",
    RECONNECTING: "Reconnecting",
    LIVE: "Live",
    STALE: "Delayed",
    SYNCED: "Synchronized",
    DESYNCED: "Not synchronized",
    UNKNOWN: "Unknown",
    LINK_HEALTHY: "Healthy",
    LINK_DEGRADED: "Needs attention",
    LINK_RECOVERING: "Recovering",
    LINK_OFFLINE: "Offline",
    CLEAN: "Clean",
    WARNING: "Needs attention",
    ERROR: "Error",
  };

  return labels[state] ?? state;
}

function toneForState(state: string): StatusTone {
  if (["HEALTHY", "CONNECTED", "LIVE", "SYNCED", "LINK_HEALTHY", "CLEAN"].includes(state)) {
    return "healthy";
  }
  if (["DEGRADED", "RECONNECTING", "STALE", "LINK_DEGRADED", "LINK_RECOVERING", "WARNING"].includes(state)) {
    return "attention";
  }
  if (["FAIL_SAFE", "OFFLINE", "DESYNCED", "LINK_OFFLINE", "ERROR"].includes(state)) {
    return "fault";
  }
  return "neutral";
}

function borderClass(state: string) {
  if (state === "HEALTHY") return "border-emerald-500/70";
  if (state === "DEGRADED") return "border-amber-500/70";
  if (state === "FAIL_SAFE" || state === "OFFLINE") return "border-red-500/70";
  return "border-slate-800";
}

function severityBorderClass(severity: Severity) {
  if (severity === "healthy") return "border-emerald-500/70";
  if (severity === "warning") return "border-amber-500/70";
  if (severity === "critical") return "border-red-500/70";
  return "border-slate-800";
}

function metricClass(severity: Severity) {
  if (severity === "healthy") return "border border-emerald-500/40";
  if (severity === "warning") return "border border-amber-500/60";
  if (severity === "critical") return "border border-red-500/70";
  return "border border-slate-800";
}
