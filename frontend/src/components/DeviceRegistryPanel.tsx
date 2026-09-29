import { useTelemetryStore } from "../store/telemetryStore";
import type { DeviceRegistryEntry } from "../types/telemetry";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function DeviceRegistryPanel() {
  const registry = useTelemetryStore((s) => s.deviceRegistry);
  const devices = Object.values(registry);

  return (
    <SectionCard title="Devices" description="Current controller, peripheral, and power-rail telemetry">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [min-width:1366px]:grid-cols-1">
        {devices.map((device) => (
          <DeviceCard key={device.device_id} device={device} />
        ))}
      </div>
    </SectionCard>
  );
}

function DeviceCard({ device }: { device: DeviceRegistryEntry }) {
  return (
    <article className="min-w-0 rounded-md border border-slate-800 bg-slate-900/75 p-4">
      <div className="grid min-w-0 gap-4 [min-width:1366px]:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.6fr)_minmax(9rem,0.6fr)_minmax(16rem,1.5fr)] [min-width:1366px]:items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">Device</div>
          <h3 className="mt-1 break-words text-sm font-semibold text-slate-100">{device.display_name}</h3>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium text-slate-500">Health</div>
          <StatusChip tone={healthTone(device.health_state)}>{humanizeHealth(device.health_state)}</StatusChip>
        </div>
        <PrimaryField label="Device Type" value={humanizeKind(device.kind)} />
        <PrimaryField label="Current Status" value={device.status_message} />
      </div>

      <details className="mt-4 border-t border-slate-800 pt-3 text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          Technical details
        </summary>
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TechnicalField label="Device ID" value={device.device_id} />
          <TechnicalField label="Raw health" value={device.health_state} />
          <TechnicalField label="Bus" value={device.bus ?? "-"} />
          <TechnicalField label="Address / chip select / node ID" value={device.address ?? device.chip_select ?? device.node_id ?? "-"} />
          <TechnicalField label="Heartbeat age" value={formatHeartbeatAge(device.heartbeat_age_ms)} />
          <TechnicalField label="Last seen UTC" value={device.last_seen_utc ?? "-"} />
        </dl>
      </details>
    </article>
  );
}

function PrimaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm text-slate-300">{value}</div>
    </div>
  );
}

function TechnicalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-slate-300">{value}</dd>
    </div>
  );
}

function formatHeartbeatAge(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} ms`;
}

function humanizeHealth(state: string) {
  if (state === "HEALTHY") return "Healthy";
  if (state === "DEGRADED") return "Needs attention";
  if (state === "FAIL_SAFE") return "Fail-safe";
  if (state === "OFFLINE") return "Offline";
  return "Unknown status";
}

function healthTone(state: string): StatusTone {
  if (state === "HEALTHY") return "healthy";
  if (state === "DEGRADED") return "attention";
  if (state === "FAIL_SAFE" || state === "OFFLINE") return "fault";
  return "neutral";
}

function humanizeKind(kind: string) {
  if (kind === "NODE") return "Controller / node";
  if (kind === "I2C_DEVICE") return "I2C device";
  if (kind === "SPI_DEVICE") return "SPI device";
  if (kind === "POWER_RAIL") return "Power rail";
  return "Unknown device type";
}
