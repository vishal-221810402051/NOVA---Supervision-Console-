import { useTelemetryStore } from "../store/telemetryStore";
import type { DeviceRegistryEntry } from "../types/telemetry";

const nodeLabels: Record<string, string> = {
  laptop_console: "Laptop Console",
  pi_gateway: "Pi Gateway",
  esp32_motion: "MAIN ESP32-S3",
  esp32_qc: "SUB ESP32-S3",
};

export function TopologyView() {
  const linkRegistry = useTelemetryStore((s) => s.linkRegistry);
  const deviceRegistry = useTelemetryStore((s) => s.deviceRegistry);
  const gatewayHealth = useTelemetryStore((s) => s.gatewayHealth);
  const links = Object.values(linkRegistry);
  const getNode = (nodeId: string) =>
    Object.values(deviceRegistry).find(
      (device) => device.node_id === nodeId || device.device_id === nodeId
    );

  return (
    <section className="grid gap-4">
      <div className="border border-slate-800 bg-slate-950 p-4">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
          Pi Gateway Topology
        </h2>

        <div className="grid gap-3">
          <NodeCard nodeId="laptop_console" device={getNode("laptop_console")} />
          <LinkRow link={linkRegistry.link_laptop_pi} />
          <NodeCard nodeId="pi_gateway" device={getNode("pi_gateway")} />
          <LinkRow link={linkRegistry.link_pi_main} />
          <NodeCard nodeId="esp32_motion" device={getNode("esp32_motion")} />
          <LinkRow link={linkRegistry.link_main_sub} />
          <NodeCard nodeId="esp32_qc" device={getNode("esp32_qc")} />
        </div>
      </div>

      <div className="border border-slate-800 bg-slate-950 p-4">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
          Gateway Health
        </h2>

        {gatewayHealth ? (
          <div className="grid grid-cols-6 gap-3 text-xs">
            <Metric label="State" value={gatewayHealth.health_state} />
            <Metric label="CPU" value={`${gatewayHealth.cpu_percent}%`} />
            <Metric label="Memory" value={`${gatewayHealth.memory_used_percent}%`} />
            <Metric label="Disk" value={`${gatewayHealth.disk_used_percent}%`} />
            <Metric label="Buffer Depth" value={gatewayHealth.buffer_depth.toString()} />
            <Metric label="Dropped" value={gatewayHealth.dropped_packets.toString()} />
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            Waiting for gateway health telemetry...
          </div>
        )}
      </div>

      <div className="border border-slate-800 bg-slate-950 p-4">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
          Link Registry
        </h2>

        <div className="grid gap-2">
          {links.map((link) => (
            <div
              key={link.link_id}
              className="grid grid-cols-8 items-center border border-slate-800 bg-slate-900 p-3 text-xs"
            >
              <div className="font-semibold text-cyan-100">{link.display_name}</div>
              <div className="text-slate-400">{link.transport}</div>
              <div className={linkStateClass(link.link_state)}>{link.link_state}</div>
              <div className={syncStateClass(link.sync_state)}>{link.sync_state}</div>
              <div className="font-mono text-slate-400">
                {link.round_trip_latency_ms === null
                  ? "-"
                  : `${link.round_trip_latency_ms} ms`}
              </div>
              <div className="font-mono text-slate-400">
                {link.heartbeat_age_ms === null
                  ? "-"
                  : `${Math.round(link.heartbeat_age_ms)} ms`}
              </div>
              <div className="font-mono text-slate-400">
                missed={link.missed_heartbeat_count}
              </div>
              <div className="text-slate-400">{link.status_message}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NodeCard({
  nodeId,
  device,
}: {
  nodeId: string;
  device: DeviceRegistryEntry | undefined;
}) {
  return (
    <div className="border border-slate-800 bg-black p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">
        Node
      </div>
      <div className="grid grid-cols-4 items-center gap-3">
        <div>
          <div className="font-mono text-sm font-bold text-cyan-100">
            {nodeLabels[nodeId] ?? nodeId}
          </div>
          <div className="font-mono text-xs text-slate-500">{nodeId}</div>
        </div>
        <div className={stateClass(device?.health_state ?? "OFFLINE")}>
          {device?.health_state ?? "OFFLINE"}
        </div>
        <div className="font-mono text-xs text-slate-400">
          age=
          {device?.heartbeat_age_ms === null || device?.heartbeat_age_ms === undefined
            ? "-"
            : `${Math.round(device.heartbeat_age_ms)} ms`}
        </div>
        <div className="text-xs text-slate-400">
          {device?.status_message ?? "Awaiting node health"}
        </div>
      </div>
    </div>
  );
}

function LinkRow({
  link,
}: {
  link: {
    display_name: string;
    transport: string;
    link_state: string;
    sync_state: string;
    round_trip_latency_ms: number | null;
    heartbeat_age_ms: number | null;
    missed_heartbeat_count: number;
  };
}) {
  return (
    <div className="ml-6 border-l border-slate-700 py-2 pl-4">
      <div className="grid grid-cols-6 items-center gap-3 border border-slate-800 bg-slate-900 p-3 text-xs">
        <div className="font-semibold text-slate-300">{link.display_name}</div>
        <div className="text-slate-500">{link.transport}</div>
        <div className={linkStateClass(link.link_state)}>{link.link_state}</div>
        <div className={syncStateClass(link.sync_state)}>{link.sync_state}</div>
        <div className="font-mono text-slate-400">
          latency={link.round_trip_latency_ms === null ? "-" : `${link.round_trip_latency_ms} ms`}
        </div>
        <div className="font-mono text-slate-400">
          age={link.heartbeat_age_ms === null ? "-" : `${Math.round(link.heartbeat_age_ms)} ms`}
        </div>
      </div>
    </div>
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

function linkStateClass(state: string) {
  if (state === "LINK_HEALTHY") return "font-bold text-emerald-300";
  if (state === "LINK_DEGRADED" || state === "LINK_RECOVERING") {
    return "font-bold text-amber-300";
  }
  return "font-bold text-red-300";
}

function syncStateClass(state: string) {
  if (state === "SYNCED") return "font-bold text-emerald-300";
  if (state === "DESYNCED") return "font-bold text-red-300";
  return "font-bold text-slate-500";
}

function stateClass(state: string) {
  if (state === "HEALTHY") return "font-bold text-emerald-300";
  if (state === "DEGRADED") return "font-bold text-amber-300";
  if (state === "FAIL_SAFE") return "font-bold text-red-400";
  return "font-bold text-slate-500";
}
