import { evaluateV1PlusHealthCheck } from "./healthCheckEngine";
import { DEVICE_IDS, type DeviceRegistry } from "./deviceRegistry";
import type { LinkRegistry } from "./linkRegistry";
import type {
  ConnectionState,
  EngineeringLog,
  GatewayHealthPayload,
  HealthCheckResult,
  HealthCheckRule,
  HealthState,
} from "../types/telemetry";
import type { TelemetrySourceStatus } from "../transport/telemetrySource";
import type {
  EventStoreSummary,
  TelemetryEventRecord,
} from "./eventStore";
import {
  buildReplaySnapshot,
  type LiveVsReplaySummary,
  type ReplaySnapshot,
} from "./replayReducer";

export type NovaScValidationReport = {
  report_type: "NOVA_SC_SUPERVISORY_VALIDATION_REPORT";
  report_version: "v1.1";
  generated_at_utc: string;
  report_metadata: {
    report_type: "NOVA_SC_SUPERVISORY_VALIDATION_REPORT";
    report_schema_version: "v1.1";
    generated_at_utc: string;
    app_name: "NOVA SC";
    nova_sc_phase: "PHASE_6_8_REAL_FULL_TOPOLOGY_VALIDATION";
    validation_engine_version: "V1_PLUS_TOPOLOGY_AWARE";
    simulator_mode: boolean;
    hardware_connected: boolean;
    validation_scope: "SUPERVISORY_SIMULATION" | "PHASE_6_8_REAL_FULL_TOPOLOGY";
    physical_hardware_validation: boolean;
    active_stream_id: string | null;
    backend_stream_id: string | null;
    active_source_id: string;
    transport_kind: string;
    transport_simulated: boolean;
    run_id: null;
  };
  project: {
    name: "NOVA SC";
    phase: "PHASE_6_8";
    scope: "REAL_FULL_TOPOLOGY_VALIDATION";
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
    engine: "V1_PLUS_TOPOLOGY_AWARE";
    overall: HealthCheckResult;
    summary: {
      pass: number;
      warning: number;
      fail: number;
      critical: number;
    };
    rules: HealthCheckRule[];
  };
  topology_summary: {
    canonical_chain: string[];
    canonical_links: string[];
    reachable: boolean;
    connection_state: ConnectionState;
    telemetry_stale: boolean;
    links_healthy_count: number;
    links_synced_count: number;
    offline_links: string[];
    desynced_links: string[];
  };
  node_summary: Record<string, unknown>;
  link_summary: {
    total: number;
    healthy: number;
    degraded: number;
    offline: number;
    recovering: number;
    synced: number;
    desynced: number;
    unknown: number;
    offline_links: string[];
    desynced_links: string[];
  };
  link_registry_snapshot: LinkRegistry;
  gateway_health: (GatewayHealthPayload & { telemetry_mode: "SIMULATED" | "HARDWARE" }) | null;
  stream_metadata: {
    active_stream_id: string | null;
    stream_switches: number;
    packet_count: number;
    packet_rate_hz: number;
    last_sequence_number: number | null;
    last_packet_at_utc: string | null;
    source_sequences: Record<string, number>;
    connection_state: ConnectionState;
    telemetry_freshness: "LIVE" | "STALE";
  };
  packet_integrity_summary: {
    duplicate_packets: number;
    out_of_order_packets: number;
    sequence_gaps: number;
    sequence_resets: number;
    missed_packets: number;
    stream_switches: number;
    schema_rejected_packets: number;
    malformed_packets: number;
    unknown_event_packets: number;
    unknown_node_packets: number;
    unknown_link_packets: number;
  };
  event_store_summary: EventStoreSummary;
  event_store_recent: TelemetryEventRecord[];
  replay_snapshot: ReplaySnapshot;
  replay_validation_result: ReplaySnapshot["validation"];
  live_vs_replay_summary: LiveVsReplaySummary;
  transport_metadata: {
    active_source_id: string;
    display_name: string;
    transport_kind: string;
    endpoint: string;
    is_simulated: boolean;
    connection_state: ConnectionState;
    last_connected_utc: string | null;
    last_error: string | null;
    reconnect_attempts: number;
  };
  chip_status_summary: Record<string, unknown>;
  power_health_summary: Record<string, unknown>;
  expected_warnings: HealthCheckRule[];
  known_limitations: string[];
  device_registry: DeviceRegistry;
  recent_logs: EngineeringLog[];
  engineering_logs_recent: EngineeringLog[];
};

export function buildNovaScValidationReport(params: {
  deviceRegistry: DeviceRegistry;
  linkRegistry: LinkRegistry;
  linkRegistrySummary: {
    total: number;
    healthy: number;
    degraded: number;
    offline: number;
    recovering: number;
    synced: number;
    desynced: number;
    unknown: number;
  };
  gatewayHealth: GatewayHealthPayload | null;
  activeTelemetrySource: TelemetrySourceStatus;
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
  schemaRejectedPackets: number;
  malformedPackets: number;
  unknownEventPackets: number;
  unknownNodePackets: number;
  unknownLinkPackets: number;
  eventStoreSummary: EventStoreSummary;
  eventStoreRecent: TelemetryEventRecord[];
  eventStore: TelemetryEventRecord[];
  eventStoreDroppedOldEvents: number;
  eventStoreMaxEvents: number;
  lastPacketAt: string | null;
  logs: EngineeringLog[];
}): NovaScValidationReport {
  const generatedAtUtc = new Date().toISOString();
  const healthCheck = evaluateV1PlusHealthCheck({
    deviceRegistry: params.deviceRegistry,
    linkRegistry: params.linkRegistry,
    gatewayHealth: params.gatewayHealth,
    connectionState: params.connectionState,
    isTelemetryStale: params.isTelemetryStale,
    activeStreamId: params.activeStreamId,
    packetRateHz: params.packetRateHz,
    duplicatePackets: params.duplicatePackets,
    outOfOrderPackets: params.outOfOrderPackets,
    sequenceGaps: params.sequenceGaps,
    sequenceResets: params.sequenceResets,
    streamSwitches: params.streamSwitches,
    hardwareBringupMode: !params.activeTelemetrySource.is_simulated,
  });
  const links = Object.values(params.linkRegistry);
  const offlineLinks = links
    .filter((link) => link.link_state === "LINK_OFFLINE")
    .map((link) => link.link_id);
  const desyncedLinks = links
    .filter((link) => link.sync_state === "DESYNCED")
    .map((link) => link.link_id);
  const topologyReachable =
    params.connectionState === "CONNECTED" &&
    !params.isTelemetryStale &&
    links.every((link) => link.link_state === "LINK_HEALTHY") &&
    links.every((link) => link.sync_state === "SYNCED");
  const replaySnapshot = buildReplaySnapshot({
    events: params.eventStore,
    droppedOldEvents: params.eventStoreDroppedOldEvents,
    maxEvents: params.eventStoreMaxEvents,
    liveState: {
      deviceRegistry: params.deviceRegistry,
      linkRegistry: params.linkRegistry,
      gatewayHealth: params.gatewayHealth,
      activeStreamId: params.activeStreamId,
      duplicatePackets: params.duplicatePackets,
      outOfOrderPackets: params.outOfOrderPackets,
      sequenceGaps: params.sequenceGaps,
      sequenceResets: params.sequenceResets,
      streamSwitches: params.streamSwitches,
    },
  });

  return {
    report_type: "NOVA_SC_SUPERVISORY_VALIDATION_REPORT",
    report_version: "v1.1",
    generated_at_utc: generatedAtUtc,
    report_metadata: {
      report_type: "NOVA_SC_SUPERVISORY_VALIDATION_REPORT",
      report_schema_version: "v1.1",
      generated_at_utc: generatedAtUtc,
      app_name: "NOVA SC",
      nova_sc_phase: "PHASE_6_8_REAL_FULL_TOPOLOGY_VALIDATION",
      validation_engine_version: "V1_PLUS_TOPOLOGY_AWARE",
      simulator_mode: params.activeTelemetrySource.is_simulated,
      hardware_connected: !params.activeTelemetrySource.is_simulated,
      validation_scope: params.activeTelemetrySource.is_simulated
        ? "SUPERVISORY_SIMULATION"
        : "PHASE_6_8_REAL_FULL_TOPOLOGY",
      physical_hardware_validation: !params.activeTelemetrySource.is_simulated,
      active_stream_id: params.activeStreamId,
      backend_stream_id: params.activeStreamId,
      active_source_id: params.activeTelemetrySource.source_id,
      transport_kind: params.activeTelemetrySource.transport_kind,
      transport_simulated: params.activeTelemetrySource.is_simulated,
      run_id: null,
    },
    project: {
      name: "NOVA SC",
      phase: "PHASE_6_8",
      scope: "REAL_FULL_TOPOLOGY_VALIDATION",
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
    health_check: {
      engine: "V1_PLUS_TOPOLOGY_AWARE",
      overall: healthCheck.overall,
      summary: healthCheck.summary,
      rules: healthCheck.rules,
    },
    topology_summary: {
      canonical_chain: [
        "laptop_console",
        "pi_gateway",
        "esp32_main",
        "esp32_sub",
      ],
      canonical_links: [
        "link_laptop_pi",
        "link_pi_main",
        "link_main_sub",
      ],
      reachable: topologyReachable,
      connection_state: params.connectionState,
      telemetry_stale: params.isTelemetryStale,
      links_healthy_count: params.linkRegistrySummary.healthy,
      links_synced_count: params.linkRegistrySummary.synced,
      offline_links: offlineLinks,
      desynced_links: desyncedLinks,
    },
    node_summary: buildNodeSummary(params),
    link_summary: {
      ...params.linkRegistrySummary,
      offline_links: offlineLinks,
      desynced_links: desyncedLinks,
    },
    link_registry_snapshot: params.linkRegistry,
    gateway_health: params.gatewayHealth
      ? {
          ...params.gatewayHealth,
          telemetry_mode: params.activeTelemetrySource.is_simulated ? "SIMULATED" : "HARDWARE",
        }
      : null,
    stream_metadata: {
      active_stream_id: params.activeStreamId,
      stream_switches: params.streamSwitches,
      packet_count: params.packetCount,
      packet_rate_hz: Number(params.packetRateHz.toFixed(2)),
      last_sequence_number: params.lastSequenceNumber,
      last_packet_at_utc: params.lastPacketAt,
      source_sequences: params.sourceSequences,
      connection_state: params.connectionState,
      telemetry_freshness: params.isTelemetryStale ? "STALE" : "LIVE",
    },
    packet_integrity_summary: {
      duplicate_packets: params.duplicatePackets,
      out_of_order_packets: params.outOfOrderPackets,
      sequence_gaps: params.sequenceGaps,
      sequence_resets: params.sequenceResets,
      missed_packets: params.missedPackets,
      stream_switches: params.streamSwitches,
      schema_rejected_packets: params.schemaRejectedPackets,
      malformed_packets: params.malformedPackets,
      unknown_event_packets: params.unknownEventPackets,
      unknown_node_packets: params.unknownNodePackets,
      unknown_link_packets: params.unknownLinkPackets,
    },
    event_store_summary: params.eventStoreSummary,
    event_store_recent: params.eventStoreRecent,
    replay_snapshot: replaySnapshot,
    replay_validation_result: replaySnapshot.validation,
    live_vs_replay_summary: replaySnapshot.comparison,
    transport_metadata: {
      active_source_id: params.activeTelemetrySource.source_id,
      display_name: params.activeTelemetrySource.display_name,
      transport_kind: params.activeTelemetrySource.transport_kind,
      endpoint: params.activeTelemetrySource.endpoint,
      is_simulated: params.activeTelemetrySource.is_simulated,
      connection_state: params.activeTelemetrySource.connection_state,
      last_connected_utc: params.activeTelemetrySource.last_connected_utc,
      last_error: params.activeTelemetrySource.last_error,
      reconnect_attempts: params.activeTelemetrySource.reconnect_attempts,
    },
    chip_status_summary: buildChipStatusSummary(params.deviceRegistry),
    power_health_summary: buildPowerHealthSummary(params.deviceRegistry),
    expected_warnings: healthCheck.rules.filter(
      (rule) =>
        rule.category === "EXPECTED_WARNING" || rule.rule_id.includes("FRAM")
    ),
    known_limitations: buildKnownLimitations(),
    device_registry: params.deviceRegistry,
    recent_logs: params.logs.slice(0, 50),
    engineering_logs_recent: params.logs.slice(0, 50),
  };
}

function buildKnownLimitations() {
  return [
    "PCA9685_ALLCALL is NOT_VALIDATED because it is not an independent physical device validation.",
    "MB85RS256B_FRAM is BLOCKED_WRONG_IC_PENDING.",
    "POWER_HEALTH is ADC_NOT_CONFIGURED.",
    "MAIN_TO_SUB_UART is disabled.",
    "No command path exists.",
    "No actuator power/control has been validated.",
    "No PCA9685 PWM output has been enabled.",
    "No motor/servo/stepper/pump/valve/relay/heater validation has been performed.",
  ];
}

function buildNodeSummary(params: {
  deviceRegistry: DeviceRegistry;
  gatewayHealth: GatewayHealthPayload | null;
  connectionState: ConnectionState;
  isTelemetryStale: boolean;
  activeStreamId: string | null;
}) {
  const piGateway = params.deviceRegistry[DEVICE_IDS.PI_GATEWAY];
  const mainMcu = params.deviceRegistry[DEVICE_IDS.MAIN_MCU];
  const subMcu = params.deviceRegistry[DEVICE_IDS.SUB_MCU];

  return {
    laptop_console: {
      role: "SUPERVISION_CONSOLE",
      validation_model: "STREAM_AND_TOPOLOGY_CONTEXT",
      connection_state: params.connectionState,
      active_stream_id: params.activeStreamId,
      telemetry_stale: params.isTelemetryStale,
    },
    pi_gateway: {
      role: "GATEWAY",
      device_id: DEVICE_IDS.PI_GATEWAY,
      health_state: params.gatewayHealth?.health_state ?? piGateway?.health_state ?? null,
      last_seen_utc: piGateway?.last_seen_utc ?? null,
      heartbeat_age_ms: piGateway?.heartbeat_age_ms ?? null,
      status_message:
        params.gatewayHealth?.status_message ?? piGateway?.status_message ?? null,
    },
    esp32_main: summarizeNode("MOTION_CONTROL", DEVICE_IDS.MAIN_MCU, mainMcu),
    esp32_sub: summarizeNode("SAFETY_QC", DEVICE_IDS.SUB_MCU, subMcu),
  };
}

function summarizeNode(
  role: string,
  deviceId: string,
  device: DeviceRegistry[string] | undefined
) {
  return {
    role,
    device_id: deviceId,
    health_state: device?.health_state ?? null,
    last_seen_utc: device?.last_seen_utc ?? null,
    heartbeat_age_ms: device?.heartbeat_age_ms ?? null,
    status_message: device?.status_message ?? null,
  };
}

function buildChipStatusSummary(registry: DeviceRegistry) {
  return {
    ads1115: registry[DEVICE_IDS.ADS1115],
    ds3231: registry[DEVICE_IDS.DS3231],
    pca9685_1: registry[DEVICE_IDS.PCA9685_1],
    pca9685_2: registry[DEVICE_IDS.PCA9685_2],
    pca9685_allcall: registry[DEVICE_IDS.PCA9685_ALLCALL],
    fram: registry[DEVICE_IDS.FRAM],
  };
}

function buildPowerHealthSummary(registry: DeviceRegistry) {
  return {
    vin_protected: registry[DEVICE_IDS.VIN_PROTECTED],
    rail_5v_logic: registry[DEVICE_IDS.RAIL_5V],
    rail_3v3_logic: registry[DEVICE_IDS.RAIL_3V3],
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
