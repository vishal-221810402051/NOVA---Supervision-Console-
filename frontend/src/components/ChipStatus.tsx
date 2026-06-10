import { useTelemetryStore } from "../store/telemetryStore";
import { StatusBadge } from "./StatusBadge";

export function ChipStatus() {
  const data = useTelemetryStore((s) => s.chipStatus);

  if (!data) return <Panel title="Chip Status">Waiting for chip telemetry...</Panel>;

  const devices = [...data.i2c_devices, ...data.spi_devices];

  return (
    <Panel title="Chip Validation Status">
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
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  return (
    <section
      className={`border p-4 ${
        isTelemetryStale
          ? "border-amber-500/70 bg-amber-950/10 opacity-70"
          : "border-slate-800 bg-slate-950"
      }`}
    >
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-cyan-300">{title}</h2>
      {isTelemetryStale && (
        <div className="mb-3 border border-amber-500 bg-amber-950/30 px-3 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
          STALE TELEMETRY - VALUES ARE LAST KNOWN STATE
        </div>
      )}
      {children}
    </section>
  );
}
