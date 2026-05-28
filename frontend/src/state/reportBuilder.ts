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
    phase: "PHASE_5_0C";
    scope: "MULTI_DOMAIN_TELEMETRY_METADATA";
  };
  system_status: {
    global_health: HealthState;
    connection_state: ConnectionState;
    telemetry_stale: boolean;
    active_stream_id: string | null;
    stream_switches: number;
    source_sequences: Record<string, number>;
    packet_count: number;
    packet_rate_hz: number;
    last_sequence_number: number | null;
    missed_packets: number;
    duplicate_packets: number;
    out_of_order_packets: number;
    sequence_resets: number;
    sequence_gaps: number;
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
  activeStreamId: string | null;
  streamSwitches: number;
  sourceSequences: Record<string, number>;
  packetCount: number;
  packetRateHz: number;
  lastSequenceNumber: number | null;
  missedPackets: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceResets: number;
  sequenceGaps: number;
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
      phase: "PHASE_5_0C",
      scope: "MULTI_DOMAIN_TELEMETRY_METADATA",
    },
    system_status: {
      global_health: params.globalHealth,
      connection_state: params.connectionState,
      telemetry_stale: params.isTelemetryStale,
      active_stream_id: params.activeStreamId,
      stream_switches: params.streamSwitches,
      source_sequences: params.sourceSequences,
      packet_count: params.packetCount,
      packet_rate_hz: Number(params.packetRateHz.toFixed(2)),
      last_sequence_number: params.lastSequenceNumber,
      missed_packets: params.missedPackets,
      duplicate_packets: params.duplicatePackets,
      out_of_order_packets: params.outOfOrderPackets,
      sequence_resets: params.sequenceResets,
      sequence_gaps: params.sequenceGaps,
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
