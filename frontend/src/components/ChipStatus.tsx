import { useTelemetryStore } from "../store/telemetryStore";
import { StatusBadge } from "./StatusBadge";

export function ChipStatus() {
  const data = useTelemetryStore((s) => s.chipStatus);

  if (!data) return <Panel title="Chip Status">Waiting for chip telemetry...</Panel>;

  const devices = [...data.i2c_devices, ...data.spi_devices];

  return (
    <Panel title="Connected Chip Status">
      <div className="grid grid-cols-3 gap-3">
        {devices.map((d: any) => (
          <StatusBadge
            key={d.name}
            label={`${d.name} / ${d.bus} / ${d.address ?? d.chip_select}`}
            state={d.status}
          />
        ))}
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
