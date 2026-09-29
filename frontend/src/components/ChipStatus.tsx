import { useTelemetryStore } from "../store/telemetryStore";
import type { ChipDevice, ChipDeviceStatus } from "../types/telemetry";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function ChipStatus() {
  const data = useTelemetryStore((s) => s.chipStatus);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  if (!data) {
    return (
      <SectionCard title="Hardware Status" description="Detected I2C and SPI devices">
        <p className="text-sm text-slate-400">Waiting for hardware telemetry...</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Hardware Status"
      description="Detection and validation state for connected I2C and SPI devices"
    >
      {isTelemetryStale && <StaleTelemetryNotice />}

      <div className="grid min-w-0 gap-5">
        <DeviceGroup title="I2C Devices" devices={data.i2c_devices} />
        <DeviceGroup title="SPI Devices" devices={data.spi_devices} />
      </div>
    </SectionCard>
  );
}

function DeviceGroup({ title, devices }: { title: string; devices: ChipDevice[] }) {
  const headingId = `${title.toLowerCase().replaceAll(" ", "-")}-heading`;

  return (
    <section className="min-w-0" aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-3 text-sm font-semibold text-slate-200">
        {title}
      </h3>

      {devices.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={`${device.bus}-${device.name}`} device={device} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          No {title} reported.
        </div>
      )}
    </section>
  );
}

function DeviceCard({ device }: { device: ChipDevice }) {
  return (
    <article className="min-w-0 rounded-md border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-semibold text-slate-100">{device.name}</h4>
          <p className="mt-1 text-xs text-slate-400">{device.bus} device</p>
        </div>
        <StatusChip tone={deviceStatusTone(device.status)} className="max-w-[11rem] shrink-0">
          {formatDeviceStatus(device.status)}
        </StatusChip>
      </div>

      <p className="mt-3 break-words text-sm text-slate-300">
        {deviceStatusDescription(device.status)}
      </p>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical details
        </summary>
        <dl className="mt-3 grid min-w-0 gap-2">
          <TechnicalRow label="Bus" value={device.bus} />
          {device.address && <TechnicalRow label="Address" value={device.address} />}
          {device.chip_select && <TechnicalRow label="Chip select" value={device.chip_select} />}
          <TechnicalRow label="Raw status" value={device.status} />
        </dl>
      </details>
    </article>
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

function StaleTelemetryNotice() {
  return (
    <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
      Telemetry is delayed. Values shown are the last known hardware state.
    </div>
  );
}

function formatDeviceStatus(status: ChipDeviceStatus) {
  const labels: Record<ChipDeviceStatus, string> = {
    DETECTED: "Detected",
    MISSING: "Missing",
    UNKNOWN: "Unknown status",
    NOT_VALIDATED: "Not validated",
    VALIDATION_DISABLED: "Validation disabled",
    BUS_NOT_READY: "Bus not ready",
    DETECTED_UNCONFIRMED: "Detection unconfirmed",
    BLOCKED_WRONG_IC_PENDING: "Blocked pending hardware",
  };

  return labels[status];
}

function deviceStatusDescription(status: ChipDeviceStatus) {
  if (status === "DETECTED") return "The device responded and is available to telemetry.";
  if (status === "MISSING") return "The expected device was not detected.";
  if (status === "NOT_VALIDATED") return "Detection is reported, but validation is not complete.";
  if (status === "VALIDATION_DISABLED") return "Automated validation is currently disabled.";
  if (status === "BUS_NOT_READY") return "The hardware bus is not ready for validation.";
  if (status === "DETECTED_UNCONFIRMED") return "A device response was observed but is not yet confirmed.";
  if (status === "BLOCKED_WRONG_IC_PENDING") return "Validation is blocked pending the correct hardware.";
  return "No confirmed validation state is available.";
}

function deviceStatusTone(status: ChipDeviceStatus): StatusTone {
  if (status === "DETECTED") return "healthy";
  if (status === "MISSING") return "fault";
  if (status === "UNKNOWN") return "neutral";
  return "attention";
}
