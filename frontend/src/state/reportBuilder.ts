import { evaluateV1HealthCheck } from "./healthCheckEngine";
import type { DeviceRegistry } from "./deviceRegistry";
import type {
  ConnectionState,
  EngineeringLog,
  HealthCheckResult,
  HealthCheckRule,
  HealthState,
} from "../types/telemetry";

export type NovaScValidationReport = {
  report_type: "NOVA_SC_V1_HEALTH_CHECK_REPORT";
  report_version: "v1.0";
  generated_at_utc: string;
  project: {
    name: "NOVA SC";
    phase: "PHASE_4_6";
    scope: "V1_HEALTH_CHECK_AND_CHIP_STATUS";
  };
  system_status: {
    global_health: HealthState;
    connection_state: ConnectionState;
    telemetry_stale: boolean;
    packet_count: number;
    packet_rate_hz: number;
    last_sequence_number: number | null;
    missed_packets: number;
    last_packet_at_utc: string | null;
  };
  health_check: {
    overall: HealthCheckResult;
    rules: HealthCheckRule[];
  };
  device_registry: DeviceRegistry;
  recent_logs: EngineeringLog[];
};

export function buildNovaScValidationReport(params: {
  deviceRegistry: DeviceRegistry;
  globalHealth: HealthState;
  connectionState: ConnectionState;
  isTelemetryStale: boolean;
  packetCount: number;
  packetRateHz: number;
  lastSequenceNumber: number | null;
  missedPackets: number;
  lastPacketAt: string | null;
  logs: EngineeringLog[];
}): NovaScValidationReport {
  const healthCheck = evaluateV1HealthCheck(
    params.deviceRegistry,
    params.isTelemetryStale
  );

  return {
    report_type: "NOVA_SC_V1_HEALTH_CHECK_REPORT",
    report_version: "v1.0",
    generated_at_utc: new Date().toISOString(),
    project: {
      name: "NOVA SC",
      phase: "PHASE_4_6",
      scope: "V1_HEALTH_CHECK_AND_CHIP_STATUS",
    },
    system_status: {
      global_health: params.globalHealth,
      connection_state: params.connectionState,
      telemetry_stale: params.isTelemetryStale,
      packet_count: params.packetCount,
      packet_rate_hz: Number(params.packetRateHz.toFixed(2)),
      last_sequence_number: params.lastSequenceNumber,
      missed_packets: params.missedPackets,
      last_packet_at_utc: params.lastPacketAt,
    },
    health_check: healthCheck,
    device_registry: params.deviceRegistry,
    recent_logs: params.logs.slice(0, 50),
  };
}

export function downloadJsonReport(report: NovaScValidationReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replaceAll(":", "-");

  const link = document.createElement("a");
  link.href = url;
  link.download = `nova_sc_v1_health_report_${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
