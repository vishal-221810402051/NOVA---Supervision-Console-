import type { ReactNode } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import { MetricCard } from "./ui/MetricCard";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip, type StatusTone } from "./ui/StatusChip";

export function SystemOverview() {
  const data = useTelemetryStore((s) => s.systemHealth);
  const isTelemetryStale = useTelemetryStore((s) => s.isTelemetryStale);

  if (!data) {
    return (
      <SectionCard
        title="System Overview"
        description="Controller, network, and internal link status"
      >
        <p className="text-sm text-slate-400">Waiting for telemetry...</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="System Overview"
      description="Controller, network, and internal link status"
    >
      {isTelemetryStale && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          Data is delayed. Values below show the last known state.
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <OverviewGroup title="Controllers">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <SystemStateCard
              label="Main Controller"
              state={data.main_mcu.health_state}
              detailLabel="Free memory"
              detailValue={`${data.main_mcu.free_heap_bytes} B`}
            />
            <SystemStateCard
              label="Secondary Controller"
              state={data.sub_mcu.health_state}
              detailLabel="Free memory"
              detailValue={`${data.sub_mcu.free_heap_bytes} B`}
            />
          </div>
        </OverviewGroup>

        <OverviewGroup title="Network">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <span className="text-sm text-slate-400">Wi-Fi connection</span>
            <StatusChip tone={toneForState(data.wifi.connection_state)}>
              {humanizeState(data.wifi.connection_state)}
            </StatusChip>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard label="Signal Strength" value={`${data.wifi.rssi_dbm} dBm`} />
            <MetricCard label="Latency" value={`${data.wifi.latency_ms} ms`} />
          </div>
        </OverviewGroup>

        <OverviewGroup title="Internal Link">
          <SystemStateCard
            label="Main to Secondary UART"
            state={data.main_sub_uart.link_state}
          />
        </OverviewGroup>
      </div>
    </SectionCard>
  );
}

function OverviewGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg bg-slate-950/55 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{title}</h3>
      {children}
    </section>
  );
}

function SystemStateCard({
  label,
  state,
  detailLabel,
  detailValue,
}: {
  label: string;
  state: string;
  detailLabel?: string;
  detailValue?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-slate-900/80 p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <StatusChip tone={toneForState(state)}>{humanizeState(state)}</StatusChip>
      </div>
      {detailLabel && detailValue && (
        <div className="mt-3 min-w-0">
          <div className="text-xs text-slate-500">{detailLabel}</div>
          <div className="mt-0.5 break-words text-sm font-semibold text-slate-200">
            {detailValue}
          </div>
        </div>
      )}
    </div>
  );
}

function humanizeState(state: string) {
  const labels: Record<string, string> = {
    HEALTHY: "Healthy",
    DEGRADED: "Needs attention",
    FAIL_SAFE: "Fail-safe",
    CONNECTED: "Connected",
    RECONNECTING: "Reconnecting",
    OFFLINE: "Offline",
    LINK_HEALTHY: "Healthy",
    LINK_DEGRADED: "Needs attention",
    LINK_RECOVERING: "Recovering",
    LINK_OFFLINE: "Offline",
  };
  return labels[state] ?? state;
}

function toneForState(state: string): StatusTone {
  if (state === "HEALTHY" || state === "CONNECTED" || state === "LINK_HEALTHY") {
    return "healthy";
  }
  if (
    state === "DEGRADED" ||
    state === "RECONNECTING" ||
    state === "LINK_DEGRADED" ||
    state === "LINK_RECOVERING"
  ) {
    return "attention";
  }
  if (state === "FAIL_SAFE" || state === "OFFLINE" || state === "LINK_OFFLINE") {
    return "fault";
  }
  return "neutral";
}
