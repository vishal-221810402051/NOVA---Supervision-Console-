import { useTelemetryStore } from "../store/telemetryStore";

export function DeviceRegistryPanel() {
  const registry = useTelemetryStore((s) => s.deviceRegistry);
  const devices = Object.values(registry);

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">
        Device Registry Engine
      </h2>

      <div className="grid gap-2">
        {devices.map((device) => (
          <div
            key={device.device_id}
            className="grid grid-cols-7 items-center border border-slate-800 bg-slate-900 p-3 text-xs"
          >
            <div className="font-semibold text-cyan-100">{device.display_name}</div>
            <div className="text-slate-400">{device.kind}</div>
            <div className="text-slate-400">{device.bus ?? "-"}</div>
            <div className="font-mono text-slate-300">
              {device.address ?? device.chip_select ?? device.node_id ?? "-"}
            </div>
            <div className={stateClass(device.health_state)}>
              {device.health_state}
            </div>
            <div className="font-mono text-slate-400">
              {device.heartbeat_age_ms === null
                ? "-"
                : `${Math.round(device.heartbeat_age_ms)} ms`}
            </div>
            <div className="text-slate-400">{device.status_message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function stateClass(state: string) {
  if (state === "HEALTHY") return "font-bold text-emerald-300";
  if (state === "DEGRADED") return "font-bold text-amber-300";
  if (state === "FAIL_SAFE") return "font-bold text-red-400";
  return "font-bold text-slate-500";
}
