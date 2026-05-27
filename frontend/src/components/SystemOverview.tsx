import { useTelemetryStore } from "../store/telemetryStore";
import { StatusBadge } from "./StatusBadge";

export function SystemOverview() {
  const data = useTelemetryStore((s) => s.systemHealth);

  if (!data) return <Panel title="System Overview">Waiting for telemetry...</Panel>;

  return (
    <Panel title="System Overview">
      <div className="grid grid-cols-4 gap-3">
        <StatusBadge label="MAIN MCU" state={data.main_mcu.health_state} />
        <StatusBadge label="SUB MCU" state={data.sub_mcu.health_state} />
        <StatusBadge label="WiFi" state={data.wifi.connection_state} />
        <StatusBadge label="MAIN / SUB UART" state={data.main_sub_uart.link_state} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
        <Metric label="MAIN Heap" value={`${data.main_mcu.free_heap_bytes} B`} />
        <Metric label="SUB Heap" value={`${data.sub_mcu.free_heap_bytes} B`} />
        <Metric label="RSSI" value={`${data.wifi.rssi_dbm} dBm`} />
        <Metric label="Latency" value={`${data.wifi.latency_ms} ms`} />
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

function Metric({ label, value }: any) {
  return (
    <div className="border border-slate-800 bg-slate-900 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-cyan-100">{value}</div>
    </div>
  );
}
