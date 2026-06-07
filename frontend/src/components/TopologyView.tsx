import { useTelemetryStore } from "../store/telemetryStore";
import type { DeviceRegistryEntry } from "../types/telemetry";
import { isAcceptedNodeId, normalizeNodeId } from "../types/telemetry";

type Severity = "healthy" | "warning" | "critical" | "neutral";

const nodeMeta: Record<string, { label: string; role: string }> = {
  laptop_console: {
    label: "Laptop Console",
    role: "SUPERVISION_CONSOLE",
  },
  pi_gateway: {
    label: "Pi Gateway",
    role: "GATEWAY",
  },
  esp32_main: {
    label: "MAIN ESP32-S3",
    role: "MOTION_CONTROL",
  },
  esp32_sub: {
    label: "SUB ESP32-S3",
    role: "SAFETY_QC",
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
    return (
    Object.values(deviceRegistry).find(
      (device) =>
        device.device_id === canonicalNodeId ||
        device.node_id === canonicalNodeId ||
        (isAcceptedNodeId(device.node_id) && normalizeNodeId(device.node_id) === canonicalNodeId)
    )
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
    <section className="grid gap-4">
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GatewayHealthCard gatewayHealth={gatewayHealth} />
        <MiniIntegrityPanel
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
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <StatusPill label="Chain Health" value={chainHealth} state={chainHealth} />
      <StatusPill label="Links Healthy" value={linksHealthy} state={linksHealthy.startsWith("3/") ? "HEALTHY" : "DEGRADED"} />
      <StatusPill label="Links Synced" value={linksSynced} state={linksSynced.startsWith("3/") ? "SYNCED" : "UNKNOWN"} />
      <StatusPill label="Telemetry Freshness" value={telemetryFreshness} state={telemetryFreshness} />
      <StatusPill label="Packet Integrity" value={packetIntegrity} state={packetIntegrity} />
    </section>
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
    <section className="border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            Mission Topology Chain
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Laptop / Pi Gateway / MAIN / SUB
          </p>
        </div>
        <StatusPill label="WS State" value={connectionState} state={connectionState} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_0.9fr_1fr_0.9fr_1fr_0.9fr_1fr]">
        <NodeCard nodeId="laptop_console" device={laptop} connectionState={connectionState} />
        <LinkCard link={linkLaptopPi} />
        <NodeCard nodeId="pi_gateway" device={piGateway} />
        <LinkCard link={linkPiMain} />
        <NodeCard nodeId="esp32_main" device={main} />
        <LinkCard link={linkMainSub} />
        <NodeCard nodeId="esp32_sub" device={sub} />
      </div>
    </section>
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
  const meta = nodeMeta[nodeId] ?? { label: nodeId, role: "UNKNOWN" };
  const fallbackHealth =
    nodeId === "laptop_console" && connectionState === "CONNECTED"
      ? "HEALTHY"
      : "OFFLINE";
  const healthState = device?.health_state ?? fallbackHealth;
  const statusMessage =
    device?.status_message ??
    (nodeId === "laptop_console" && connectionState === "CONNECTED"
      ? "Console connected to telemetry stream"
      : "Awaiting node health");
  const version = getVersionText(device);

  return (
    <article className={`border bg-black p-4 ${borderClass(healthState)}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold uppercase tracking-widest text-cyan-100">
            {meta.label}
          </div>
          <div className="font-mono text-xs text-slate-500">{nodeId}</div>
        </div>
        <StatusPill label="Health" value={healthState} state={healthState} />
      </div>

      <div className="grid gap-2">
        <MetricTile label="Role" value={meta.role} />
        <MetricTile
          label="Heartbeat Age"
          value={
            device?.heartbeat_age_ms === null || device?.heartbeat_age_ms === undefined
              ? "-"
              : `${Math.round(device.heartbeat_age_ms)} ms`
          }
        />
        <MetricTile label="Version" value={version} />
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Status
          </div>
          <div className="text-sm text-slate-300">{statusMessage}</div>
        </div>
      </div>
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
    <article className={`border bg-slate-900 p-4 ${severityBorderClass(severity)}`}>
      <div className="mb-3 flex items-center gap-2">
        <HeartbeatDot state={link.link_state} />
        <div>
          <div className="text-sm font-bold uppercase tracking-widest text-slate-200">
            {link.display_name}
          </div>
          <div className="font-mono text-xs text-slate-500">{link.link_id}</div>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <StatusPill label="Link" value={link.link_state} state={link.link_state} />
          <StatusPill label="Sync" value={link.sync_state} state={link.sync_state} />
        </div>
        <MetricTile label="Transport" value={link.transport} />
        <MetricTile
          label="Latency"
          value={
            link.round_trip_latency_ms === null
              ? "-"
              : `${link.round_trip_latency_ms} ms`
          }
        />
        <MetricTile
          label="Heartbeat Age"
          value={
            link.heartbeat_age_ms === null
              ? "-"
              : `${Math.round(link.heartbeat_age_ms)} ms`
          }
        />
        <MetricTile label="Missed Heartbeats" value={link.missed_heartbeat_count.toString()} />
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Status
          </div>
          <div className="text-sm text-slate-300">{link.status_message}</div>
        </div>
      </div>
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
    <section className="border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            Gateway Health
          </h2>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Simulated Gateway Telemetry
          </p>
        </div>
        <StatusPill
          label="Pi Gateway"
          value={gatewayHealth?.health_state ?? "OFFLINE"}
          state={gatewayHealth?.health_state ?? "OFFLINE"}
        />
      </div>

      {gatewayHealth ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Uptime" value={formatDuration(gatewayHealth.uptime_ms)} />
          <MetricTile
            label="CPU"
            value={`${gatewayHealth.cpu_percent}%`}
            severity={metricSeverity(gatewayHealth.cpu_percent, 70, 85)}
          />
          <MetricTile
            label="Memory"
            value={`${gatewayHealth.memory_used_percent}%`}
            severity={metricSeverity(gatewayHealth.memory_used_percent, 75, 90)}
          />
          <MetricTile
            label="Disk"
            value={`${gatewayHealth.disk_used_percent}%`}
            severity={metricSeverity(gatewayHealth.disk_used_percent, 80, 90)}
          />
          <MetricTile
            label="Buffer Depth"
            value={gatewayHealth.buffer_depth.toString()}
            severity={metricSeverity(gatewayHealth.buffer_depth, 11, 50)}
          />
          <MetricTile
            label="Dropped Packets"
            value={gatewayHealth.dropped_packets.toString()}
            severity={gatewayHealth.dropped_packets > 0 ? "warning" : "healthy"}
          />
          <div className="md:col-span-2">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              Status
            </div>
            <div className="text-sm text-slate-300">{gatewayHealth.status_message}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">
          Waiting for gateway health telemetry...
        </div>
      )}
    </section>
  );
}

function MiniIntegrityPanel({
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
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        Stream Integrity Compact
      </h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Active Stream" value={shortStreamId(activeStreamId)} />
        <MetricTile label="Packet Rate" value={`${packetRateHz.toFixed(2)} Hz`} />
        <StatusPill
          label="Freshness"
          value={isTelemetryStale ? "STALE" : "LIVE"}
          state={isTelemetryStale ? "STALE" : "LIVE"}
        />
        <MetricTile
          label="Duplicate Packets"
          value={duplicatePackets.toString()}
          severity={duplicatePackets > 0 ? "warning" : "healthy"}
        />
        <MetricTile
          label="Out-of-Order"
          value={outOfOrderPackets.toString()}
          severity={outOfOrderPackets > 0 ? "critical" : "healthy"}
        />
        <MetricTile
          label="Sequence Gaps"
          value={sequenceGaps.toString()}
          severity={sequenceGaps > 0 ? "warning" : "healthy"}
        />
        <MetricTile
          label="Stream Switches"
          value={streamSwitches.toString()}
          severity={streamSwitches > 0 ? "warning" : "healthy"}
        />
      </div>
    </section>
  );
}

function DetailedLinkRegistry({ links }: { links: LinkCardData[] }) {
  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        Detailed Link Registry
      </h2>

      <div className="grid gap-2">
        {links.map((link) => (
          <div
            key={link.link_id}
            className={`grid grid-cols-1 gap-2 border bg-slate-900 p-3 text-sm md:grid-cols-4 xl:grid-cols-8 ${severityBorderClass(getLinkSeverity(link))}`}
          >
            <div>
              <div className="font-semibold text-cyan-100">{link.display_name}</div>
              <div className="font-mono text-xs text-slate-500">{link.link_id}</div>
            </div>
            <div className="text-slate-400">{link.transport}</div>
            <StatusPill label="Link" value={link.link_state} state={link.link_state} />
            <StatusPill label="Sync" value={link.sync_state} state={link.sync_state} />
            <div className="font-mono text-slate-400">
              {link.round_trip_latency_ms === null ? "-" : `${link.round_trip_latency_ms} ms`}
            </div>
            <div className="font-mono text-slate-400">
              {link.heartbeat_age_ms === null ? "-" : `${Math.round(link.heartbeat_age_ms)} ms`}
            </div>
            <div className="font-mono text-slate-400">
              missed={link.missed_heartbeat_count}
            </div>
            <div className="text-slate-400">{link.status_message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: string;
}) {
  return (
    <div className={`border px-3 py-2 ${stateClass(state)}`}>
      <div className="text-xs uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono text-sm font-bold">{value}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  severity = "neutral",
}: {
  label: string;
  value: string;
  severity?: Severity;
}) {
  return (
    <div className={`border bg-slate-900 p-3 ${metricClass(severity)}`}>
      <div className="text-xs uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="font-mono text-sm text-cyan-100">{value}</div>
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
    <span className="relative flex h-3 w-3">
      {pulse && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
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

function shortStreamId(streamId: string | null) {
  if (!streamId) return "N/A";
  return streamId.length > 20 ? `${streamId.slice(0, 20)}...` : streamId;
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
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
  if (severity === "healthy") return "border-emerald-500/40";
  if (severity === "warning") return "border-amber-500/60";
  if (severity === "critical") return "border-red-500/70";
  return "border-slate-800";
}

function stateClass(state: string) {
  if (
    state === "HEALTHY" ||
    state === "CONNECTED" ||
    state === "LIVE" ||
    state === "SYNCED" ||
    state === "LINK_HEALTHY" ||
    state === "CLEAN"
  ) {
    return "border-emerald-500 bg-emerald-950/20 text-emerald-300";
  }

  if (
    state === "DEGRADED" ||
    state === "RECONNECTING" ||
    state === "STALE" ||
    state === "UNKNOWN" ||
    state === "LINK_DEGRADED" ||
    state === "LINK_RECOVERING" ||
    state === "WARNING"
  ) {
    return "border-amber-500 bg-amber-950/20 text-amber-300";
  }

  if (
    state === "FAIL_SAFE" ||
    state === "OFFLINE" ||
    state === "DESYNCED" ||
    state === "LINK_OFFLINE" ||
    state === "ERROR"
  ) {
    return "border-red-500 bg-red-950/20 text-red-300";
  }

  return "border-slate-700 bg-slate-950 text-slate-300";
}
