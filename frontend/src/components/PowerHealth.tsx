import { useTelemetryStore } from "../store/telemetryStore";
import { StatusBadge } from "./StatusBadge";

export function PowerHealth() {
  const data = useTelemetryStore((s) => s.powerHealth);

  if (!data) return <Panel title="Power Health">Waiting for power telemetry...</Panel>;

  return (
    <Panel title="Power Health">
      <div className="grid grid-cols-4 gap-3">
        <Metric label="VIN Protected" value={`${data.vin_protected_v} V`} />
        <Metric label="+5V Logic" value={`${data.rail_5v_v} V`} />
        <Metric label="+3V3 Logic" value={`${data.rail_3v3_v} V`} />
        <StatusBadge label="Power State" state={data.power_state} />
      </div>
    </Panel>
  );
}

function Panel({ title, children }: any) {
  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: any) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-cyan-100">{value}</div>
    </div>
  );
}
