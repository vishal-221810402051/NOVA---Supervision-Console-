import { useTelemetryStore } from "../store/telemetryStore";
import type { PowerMeasurementStatus } from "../types/telemetry";
import { MetricCard } from "./ui/MetricCard";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function PowerHealth() {
  const data = useTelemetryStore((s) => s.powerHealth);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  if (!data) {
    return (
      <SectionCard title="Power Status" description="Supply rails and measurement availability">
        <p className="text-sm text-slate-400">Waiting for power telemetry...</p>
      </SectionCard>
    );
  }

  const measurementStatus = data.measurement_status ?? "MEASURED";
  const rawChannels = data.ads1115_channels;

  return (
    <SectionCard
      title="Power Status"
      description="Current supply state and available rail measurements"
      action={
        <StatusChip tone={powerStateTone(data.power_state)}>
          {formatPowerState(data.power_state)}
        </StatusChip>
      }
    >
      {isTelemetryStale && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Telemetry is delayed. Values shown are the last known power state.
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Input Supply" value={formatVoltage(data.vin_protected_v, data.measurement_status)} supportingText="Protected input rail" />
        <MetricCard label="5 V Rail" value={formatVoltage(data.rail_5v_v, data.measurement_status)} supportingText="Logic supply" />
        <MetricCard label="3.3 V Rail" value={formatVoltage(data.rail_3v3_v, data.measurement_status)} supportingText="Logic supply" />
        <MetricCard label="Overall Power State" value={formatPowerState(data.power_state)} supportingText={data.brownout_detected ? "Brownout detected" : "No brownout reported"} />
        <MetricCard label="Measurement Availability" value={formatMeasurementStatus(measurementStatus)} supportingText="Rail measurement capability" />
      </div>

      <details className="mt-5 rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <summary className="cursor-pointer rounded-sm text-sm font-semibold text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Advanced measurement diagnostics
        </summary>

        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Raw ADC inputs are diagnostic measurements and are not calibrated rail voltages.
        </div>

        {rawChannels ? (
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="ADS1115 AIN0" value={formatRawAdcVoltage(rawChannels.ain0_v)} />
            <MetricCard label="ADS1115 AIN1" value={formatRawAdcVoltage(rawChannels.ain1_v)} />
            <MetricCard label="ADS1115 AIN2" value={formatRawAdcVoltage(rawChannels.ain2_v)} />
            <MetricCard label="ADS1115 AIN3" value={formatRawAdcVoltage(rawChannels.ain3_v)} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No raw ADC channel readings are available.</p>
        )}

        <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TechnicalMetric label="ADC source" value={data.adc_source ?? "ADS1115"} />
          <TechnicalMetric label="ADC address" value={data.adc_address ?? "0x48"} />
          <TechnicalMetric label="ADC mode" value={data.adc_mode ?? "RAW_SINGLE_ENDED_DEBUG"} />
          <TechnicalMetric label="Raw measurement status" value={measurementStatus} />
        </dl>
      </details>
    </SectionCard>
  );
}

function TechnicalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-900/80 p-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm text-slate-300">{value}</dd>
    </div>
  );
}

function formatVoltage(value: number | null | undefined, measurementStatus: PowerMeasurementStatus | undefined) {
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

function formatMeasurementStatus(status: PowerMeasurementStatus) {
  const labels: Record<PowerMeasurementStatus, string> = {
    MEASURED: "Available",
    ADC_NOT_CONFIGURED: "Measurement not configured",
    ADC_RAW_DEBUG: "Diagnostic measurement only",
    ADC_NOT_DETECTED: "ADC not detected",
    ADC_READ_ERROR: "Measurement error",
    SENSOR_UNAVAILABLE: "Measurement unavailable",
    INVALID_READING: "Invalid measurement",
  };

  return labels[status] ?? "Unknown status";
}

function formatPowerState(state: string) {
  if (state === "HEALTHY") return "Healthy";
  if (state === "DEGRADED") return "Needs attention";
  if (state === "OFFLINE") return "Offline";
  if (state === "FAIL_SAFE") return "Fail-safe";
  return "Unknown status";
}

function powerStateTone(state: string): StatusTone {
  if (state === "HEALTHY") return "healthy";
  if (state === "DEGRADED") return "attention";
  if (state === "OFFLINE" || state === "FAIL_SAFE") return "fault";
  return "neutral";
}
