import { useTelemetryStore } from "../store/telemetryStore";
import type { PowerMeasurementStatus } from "../types/telemetry";
import { StatusBadge } from "./StatusBadge";

export function PowerHealth() {
  const data = useTelemetryStore((s) => s.powerHealth);
  const rawChannels = data?.ads1115_channels;

  if (!data) return <Panel title="Power Health">Waiting for power telemetry...</Panel>;

  return (
    <Panel title="Power Health">
      <div className="grid grid-cols-4 gap-3">
        <Metric label="VIN Protected" value={formatVoltage(data.vin_protected_v, data.measurement_status)} />
        <Metric label="+5V Logic" value={formatVoltage(data.rail_5v_v, data.measurement_status)} />
        <Metric label="+3V3 Logic" value={formatVoltage(data.rail_3v3_v, data.measurement_status)} />
        <StatusBadge label="Power State" state={data.power_state} />
        <Metric label="Measurement Status" value={data.measurement_status ?? "MEASURED"} />
      </div>
      {rawChannels && (
        <div className="mt-4 border border-amber-500/40 bg-amber-950/10 p-3">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-300">
            Raw ADC input voltage - not calibrated rail voltage
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Metric label="ADS1115 AIN0" value={formatRawAdcVoltage(rawChannels.ain0_v)} />
            <Metric label="ADS1115 AIN1" value={formatRawAdcVoltage(rawChannels.ain1_v)} />
            <Metric label="ADS1115 AIN2" value={formatRawAdcVoltage(rawChannels.ain2_v)} />
            <Metric label="ADS1115 AIN3" value={formatRawAdcVoltage(rawChannels.ain3_v)} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Metric label="ADC Source" value={data.adc_source ?? "ADS1115"} />
            <Metric label="ADC Address" value={data.adc_address ?? "0x48"} />
            <Metric label="ADC Mode" value={data.adc_mode ?? "RAW_SINGLE_ENDED_DEBUG"} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function formatVoltage(
  value: number | null | undefined,
  measurementStatus: PowerMeasurementStatus | undefined
) {
  if (typeof value === "number") return `${value.toFixed(3)} V`;
  if (value === undefined) return "No data";
  if (measurementStatus === "ADC_NOT_CONFIGURED") return "Not measured";
  if (measurementStatus === "ADC_RAW_DEBUG") return "Raw ADC only";
  if (measurementStatus === "ADC_NOT_DETECTED") return "ADC not detected";
  if (measurementStatus === "ADC_READ_ERROR") return "ADC read error";
  if (measurementStatus === "SENSOR_UNAVAILABLE") return "Unavailable";
  if (measurementStatus === "INVALID_READING") return "Invalid reading";
  return "Not measured";
}

function formatRawAdcVoltage(value: number | null | undefined) {
  if (typeof value === "number") return `${value.toFixed(4)} V`;
  return "No reading";
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
