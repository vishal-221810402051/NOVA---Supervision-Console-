import type {
  ConnectionState,
  GatewayHealthPayload,
  HealthCheckResult,
  HealthCheckRule,
  TelemetryPacket,
} from "../types/telemetry";
import { isAcceptedNodeId, normalizeNodeId } from "../types/telemetry";
import {
  createInitialDeviceRegistry,
  getGlobalSystemHealth,
  getRegistrySummary,
  updateRegistryFromChipStatus,
  updateRegistryFromNodeHealth,
  updateRegistryFromPowerHealth,
  updateRegistryFromSystemHealth,
  type DeviceRegistry,
} from "./deviceRegistry";
import {
  createInitialLinkRegistry,
  getLinkRegistrySummary,
  updateLinkRegistryFromHeartbeat,
  updateLinkRegistryFromSync,
  type LinkRegistry,
} from "./linkRegistry";
import { evaluateV1PlusHealthCheck } from "./healthCheckEngine";
import type {
  TelemetryEventDisposition,
  TelemetryEventRecord,
} from "./eventStore";

export type ReplayMetadata = {
  replay_generated_at_utc: string;
  replay_clock_utc: string;
  input_event_count: number;
  first_event_store_sequence: number | null;
  last_event_store_sequence: number | null;
  dropped_old_events: number;
  replay_complete: boolean;
  limitations: string[];
};

export type ReplayCounters = {
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceGaps: number;
  sequenceResets: number;
  streamSwitches: number;
  missedPackets: number;
  schemaRejectedPackets: number;
  malformedPackets: number;
  unknownEventPackets: number;
  unknownNodePackets: number;
  unknownLinkPackets: number;
};

export type ReplayReconstructedState = {
  deviceRegistry: DeviceRegistry;
  registrySummary: ReturnType<typeof getRegistrySummary>;
  linkRegistry: LinkRegistry;
  linkRegistrySummary: ReturnType<typeof getLinkRegistrySummary>;
  gatewayHealth: GatewayHealthPayload | null;
  globalHealth: ReturnType<typeof getGlobalSystemHealth>;
  activeStreamId: string | null;
  sourceSequences: Record<string, number>;
  lastAcceptedSequenceNumber: number | null;
  packetCount: number;
  packetRateHz: number;
  connectionState: ConnectionState;
  isTelemetryStale: boolean;
  integrityCounters: ReplayCounters;
};

export type ReplayDispositionSummary = {
  by_disposition: Record<TelemetryEventDisposition, number>;
  accepted: number;
  rejected: number;
  ignored: number;
  anomalies: number;
};

export type LiveVsReplaySummary = {
  live_vs_replay_supported: boolean;
  differences: string[];
  live_active_stream_id?: string | null;
  replay_active_stream_id?: string | null;
  live_gateway_health?: string | null;
  replay_gateway_health?: string | null;
  live_integrity_counters?: {
    duplicatePackets: number;
    outOfOrderPackets: number;
    sequenceGaps: number;
    sequenceResets: number;
    streamSwitches: number;
  };
  replay_integrity_counters?: {
    duplicatePackets: number;
    outOfOrderPackets: number;
    sequenceGaps: number;
    sequenceResets: number;
    streamSwitches: number;
  };
};

export type ReplaySnapshot = {
  replay_metadata: ReplayMetadata;
  reconstructed_state: ReplayReconstructedState;
  validation: {
    engine: "V1_PLUS_TOPOLOGY_AWARE_REPLAY";
    overall: HealthCheckResult;
    summary: {
      pass: number;
      warning: number;
      fail: number;
      critical: number;
    };
    rules: HealthCheckRule[];
  };
  event_disposition_summary: ReplayDispositionSummary;
  comparison: LiveVsReplaySummary;
};

type ReplayWorkingState = {
  deviceRegistry: DeviceRegistry;
  linkRegistry: LinkRegistry;
  gatewayHealth: GatewayHealthPayload | null;
  activeStreamId: string | null;
  sourceSequences: Record<string, number>;
  lastAcceptedSequenceNumber: number | null;
  packetCount: number;
  acceptedPacketTimestamps: number[];
  counters: ReplayCounters;
};

const ALL_DISPOSITIONS: TelemetryEventDisposition[] = [
  "ACCEPTED",
  "SCHEMA_REJECTED",
  "DUPLICATE_REJECTED",
  "OUT_OF_ORDER_REJECTED",
  "SEQUENCE_GAP_ACCEPTED",
  "SEQUENCE_RESET_ACCEPTED",
  "STREAM_SWITCH_ACCEPTED",
  "UNKNOWN_NODE_REJECTED",
  "UNKNOWN_EVENT_REJECTED",
  "UNKNOWN_LINK_REJECTED",
  "MALFORMED_REJECTED",
];

export function buildReplaySnapshot(params: {
  events: TelemetryEventRecord[];
  droppedOldEvents: number;
  maxEvents: number;
  liveState?: {
    deviceRegistry: DeviceRegistry;
    linkRegistry: LinkRegistry;
    gatewayHealth: GatewayHealthPayload | null;
    activeStreamId: string | null;
    duplicatePackets: number;
    outOfOrderPackets: number;
    sequenceGaps: number;
    sequenceResets: number;
    streamSwitches: number;
  };
}): ReplaySnapshot {
  const orderedEvents = [...params.events].sort(
    (a, b) => a.event_store_sequence - b.event_store_sequence
  );
  const replayClockUtc = getReplayClockUtc(orderedEvents);
  const replayClockMs = new Date(replayClockUtc).getTime();
  const state = createInitialReplayState();
  const dispositionSummary = createInitialDispositionSummary();

  for (const event of orderedEvents) {
    dispositionSummary.by_disposition[event.disposition] += 1;
    applyReplayEvent(event, state);
  }

  dispositionSummary.accepted =
    dispositionSummary.by_disposition.ACCEPTED +
    dispositionSummary.by_disposition.SEQUENCE_GAP_ACCEPTED +
    dispositionSummary.by_disposition.SEQUENCE_RESET_ACCEPTED +
    dispositionSummary.by_disposition.STREAM_SWITCH_ACCEPTED;
  dispositionSummary.rejected =
    dispositionSummary.by_disposition.SCHEMA_REJECTED +
    dispositionSummary.by_disposition.UNKNOWN_NODE_REJECTED +
    dispositionSummary.by_disposition.UNKNOWN_EVENT_REJECTED +
    dispositionSummary.by_disposition.UNKNOWN_LINK_REJECTED +
    dispositionSummary.by_disposition.MALFORMED_REJECTED;
  dispositionSummary.ignored =
    dispositionSummary.by_disposition.DUPLICATE_REJECTED +
    dispositionSummary.by_disposition.OUT_OF_ORDER_REJECTED;
  dispositionSummary.anomalies =
    orderedEvents.length - dispositionSummary.by_disposition.ACCEPTED;

  const packetRateHz = estimatePacketRateHz(state.acceptedPacketTimestamps);
  const connectionState: ConnectionState =
    state.packetCount > 0 ? "CONNECTED" : "OFFLINE";
  const isTelemetryStale = state.packetCount === 0;
  const deviceRegistry = state.deviceRegistry;
  const linkRegistry = state.linkRegistry;
  const validation = evaluateV1PlusHealthCheck(
    {
      deviceRegistry,
      linkRegistry,
      gatewayHealth: state.gatewayHealth,
      connectionState,
      isTelemetryStale,
      activeStreamId: state.activeStreamId,
      packetRateHz,
      duplicatePackets: state.counters.duplicatePackets,
      outOfOrderPackets: state.counters.outOfOrderPackets,
      sequenceGaps: state.counters.sequenceGaps,
      sequenceResets: state.counters.sequenceResets,
      streamSwitches: state.counters.streamSwitches,
    },
    { nowMs: replayClockMs }
  );

  return {
    replay_metadata: {
      replay_generated_at_utc: new Date().toISOString(),
      replay_clock_utc: replayClockUtc,
      input_event_count: orderedEvents.length,
      first_event_store_sequence:
        orderedEvents[0]?.event_store_sequence ?? null,
      last_event_store_sequence:
        orderedEvents.at(-1)?.event_store_sequence ?? null,
      dropped_old_events: params.droppedOldEvents,
      replay_complete: params.droppedOldEvents === 0,
      limitations: buildReplayLimitations(params.droppedOldEvents),
    },
    reconstructed_state: {
      deviceRegistry,
      registrySummary: getRegistrySummary(deviceRegistry),
      linkRegistry,
      linkRegistrySummary: getLinkRegistrySummary(linkRegistry),
      gatewayHealth: state.gatewayHealth,
      globalHealth: getGlobalSystemHealth(deviceRegistry),
      activeStreamId: state.activeStreamId,
      sourceSequences: state.sourceSequences,
      lastAcceptedSequenceNumber: state.lastAcceptedSequenceNumber,
      packetCount: state.packetCount,
      packetRateHz,
      connectionState,
      isTelemetryStale,
      integrityCounters: state.counters,
    },
    validation: {
      engine: "V1_PLUS_TOPOLOGY_AWARE_REPLAY",
      overall: validation.overall,
      summary: validation.summary,
      rules: validation.rules,
    },
    event_disposition_summary: dispositionSummary,
    comparison: buildLiveVsReplaySummary(params.liveState, state),
  };
}

function createInitialReplayState(): ReplayWorkingState {
  return {
    deviceRegistry: createInitialDeviceRegistry(),
    linkRegistry: createInitialLinkRegistry(),
    gatewayHealth: null,
    activeStreamId: null,
    sourceSequences: {},
    lastAcceptedSequenceNumber: null,
    packetCount: 0,
    acceptedPacketTimestamps: [],
    counters: {
      duplicatePackets: 0,
      outOfOrderPackets: 0,
      sequenceGaps: 0,
      sequenceResets: 0,
      streamSwitches: 0,
      missedPackets: 0,
      schemaRejectedPackets: 0,
      malformedPackets: 0,
      unknownEventPackets: 0,
      unknownNodePackets: 0,
      unknownLinkPackets: 0,
    },
  };
}

function applyReplayEvent(
  event: TelemetryEventRecord,
  state: ReplayWorkingState
) {
  if (event.disposition === "DUPLICATE_REJECTED") {
    state.counters.duplicatePackets += 1;
    return;
  }

  if (event.disposition === "OUT_OF_ORDER_REJECTED") {
    state.counters.outOfOrderPackets += 1;
    return;
  }

  if (event.disposition === "SCHEMA_REJECTED") {
    state.counters.schemaRejectedPackets += 1;
    return;
  }

  if (event.disposition === "UNKNOWN_NODE_REJECTED") {
    state.counters.schemaRejectedPackets += 1;
    state.counters.unknownNodePackets += 1;
    return;
  }

  if (event.disposition === "UNKNOWN_EVENT_REJECTED") {
    state.counters.schemaRejectedPackets += 1;
    state.counters.unknownEventPackets += 1;
    return;
  }

  if (event.disposition === "UNKNOWN_LINK_REJECTED") {
    state.counters.schemaRejectedPackets += 1;
    state.counters.unknownLinkPackets += 1;
    return;
  }

  if (event.disposition === "MALFORMED_REJECTED") {
    state.counters.schemaRejectedPackets += 1;
    state.counters.malformedPackets += 1;
    return;
  }

  if (!event.packet) return;

  if (event.disposition === "SEQUENCE_GAP_ACCEPTED") {
    state.counters.sequenceGaps += 1;
    state.counters.missedPackets += 1;
  }
  if (event.disposition === "SEQUENCE_RESET_ACCEPTED") {
    state.counters.sequenceResets += 1;
  }
  if (event.disposition === "STREAM_SWITCH_ACCEPTED") {
    state.counters.streamSwitches += 1;
  }

  applyAcceptedPacketToReplayState(event.packet, state);
}

function applyAcceptedPacketToReplayState(
  packet: TelemetryPacket,
  state: ReplayWorkingState
) {
  const replayPacket = normalizeReplayPacket(packet);
  state.packetCount += 1;
  state.activeStreamId = replayPacket.stream_id;
  state.sourceSequences[`${replayPacket.stream_id}:${replayPacket.source_node_id}`] =
    replayPacket.source_sequence_number;
  state.lastAcceptedSequenceNumber =
    replayPacket.global_sequence_number ?? replayPacket.sequence_number;

  const packetTimestampMs = new Date(replayPacket.timestamp_utc).getTime();
  if (Number.isFinite(packetTimestampMs)) {
    state.acceptedPacketTimestamps.push(packetTimestampMs);
  }

  if (replayPacket.event_type === "SYSTEM_HEALTH_TELEMETRY") {
    state.deviceRegistry = updateRegistryFromSystemHealth(
      state.deviceRegistry,
      replayPacket.payload,
      replayPacket.timestamp_utc
    );
  }

  if (replayPacket.event_type === "CHIP_STATUS_TELEMETRY") {
    state.deviceRegistry = updateRegistryFromChipStatus(
      state.deviceRegistry,
      replayPacket.payload,
      replayPacket.timestamp_utc
    );
  }

  if (replayPacket.event_type === "POWER_HEALTH_TELEMETRY") {
    state.deviceRegistry = updateRegistryFromPowerHealth(
      state.deviceRegistry,
      replayPacket.payload,
      replayPacket.timestamp_utc
    );
  }

  if (replayPacket.event_type === "NODE_HEALTH_TELEMETRY") {
    state.deviceRegistry = updateRegistryFromNodeHealth(
      state.deviceRegistry,
      replayPacket.payload,
      replayPacket.timestamp_utc
    );
  }

  if (replayPacket.event_type === "GATEWAY_HEALTH_TELEMETRY") {
    state.gatewayHealth = replayPacket.payload;
  }

  if (replayPacket.event_type === "LINK_HEARTBEAT_TELEMETRY") {
    state.linkRegistry = updateLinkRegistryFromHeartbeat(
      state.linkRegistry,
      replayPacket.payload
    );
  }

  if (replayPacket.event_type === "LINK_SYNC_TELEMETRY") {
    state.linkRegistry = updateLinkRegistryFromSync(
      state.linkRegistry,
      replayPacket.payload
    );
  }
}

function normalizeReplayPacket(packet: TelemetryPacket): TelemetryPacket {
  const normalizedPacket = {
    ...packet,
    source_node_id: normalizeReplayNodeField(packet.source_node_id),
    node_id: normalizeReplayNodeField(packet.node_id),
    payload: normalizeReplayPayload(packet),
  };

  return normalizedPacket as TelemetryPacket;
}

function normalizeReplayPayload(packet: TelemetryPacket) {
  const payload = { ...packet.payload } as Record<string, unknown>;

  payload.node_id = normalizeReplayNodeField(payload.node_id);
  payload.source_node_id = normalizeReplayNodeField(payload.source_node_id);
  payload.target_node_id = normalizeReplayNodeField(payload.target_node_id);
  payload.affected_source_node_id = normalizeReplayNodeField(payload.affected_source_node_id);

  if (packet.event_type === "SYSTEM_HEALTH_TELEMETRY") {
    payload.main_mcu = {
      ...packet.payload.main_mcu,
      node_id: normalizeReplayNodeField(packet.payload.main_mcu.node_id),
    };
    payload.sub_mcu = {
      ...packet.payload.sub_mcu,
      node_id: normalizeReplayNodeField(packet.payload.sub_mcu.node_id),
    };
  }

  return payload;
}

function normalizeReplayNodeField(value: unknown) {
  return isAcceptedNodeId(value) ? normalizeNodeId(value) : value;
}

function createInitialDispositionSummary(): ReplayDispositionSummary {
  return {
    by_disposition: Object.fromEntries(
      ALL_DISPOSITIONS.map((disposition) => [disposition, 0])
    ) as Record<TelemetryEventDisposition, number>,
    accepted: 0,
    rejected: 0,
    ignored: 0,
    anomalies: 0,
  };
}

function getReplayClockUtc(events: TelemetryEventRecord[]) {
  const latestAcceptedPacket = [...events]
    .reverse()
    .find((event) => event.packet?.timestamp_utc);

  if (latestAcceptedPacket?.packet?.timestamp_utc) {
    return latestAcceptedPacket.packet.timestamp_utc;
  }

  return events.at(-1)?.event_timestamp_utc ?? new Date().toISOString();
}

function estimatePacketRateHz(timestamps: number[]) {
  if (timestamps.length <= 1) return timestamps.length;

  const first = Math.min(...timestamps);
  const last = Math.max(...timestamps);
  const durationSeconds = (last - first) / 1000;

  if (durationSeconds <= 0) return timestamps.length;
  return Number((timestamps.length / durationSeconds).toFixed(2));
}

function buildReplayLimitations(droppedOldEvents: number) {
  const limitations = [
    "Replay is reconstructed from the bounded in-memory event store.",
    "Freshness is evaluated relative to replay clock, not wall clock.",
    "packetRateHz is approximate.",
    "Sequence gap size is approximate because Phase 5.8 stores gap details as text.",
  ];

  if (droppedOldEvents > 0) {
    limitations.push(
      `${droppedOldEvents} old event(s) were dropped before replay; reconstruction is partial.`
    );
  }

  return limitations;
}

function buildLiveVsReplaySummary(
  liveState: Parameters<typeof buildReplaySnapshot>[0]["liveState"],
  replayState: ReplayWorkingState
): LiveVsReplaySummary {
  if (!liveState) {
    return {
      live_vs_replay_supported: false,
      differences: [],
    };
  }

  const differences: string[] = [];
  const liveGatewayHealth = liveState.gatewayHealth?.health_state ?? null;
  const replayGatewayHealth = replayState.gatewayHealth?.health_state ?? null;

  addDifference(
    differences,
    "activeStreamId",
    liveState.activeStreamId,
    replayState.activeStreamId
  );
  addDifference(
    differences,
    "gatewayHealth",
    liveGatewayHealth,
    replayGatewayHealth
  );
  addDifference(
    differences,
    "duplicatePackets",
    liveState.duplicatePackets,
    replayState.counters.duplicatePackets
  );
  addDifference(
    differences,
    "outOfOrderPackets",
    liveState.outOfOrderPackets,
    replayState.counters.outOfOrderPackets
  );
  addDifference(
    differences,
    "sequenceGaps",
    liveState.sequenceGaps,
    replayState.counters.sequenceGaps
  );
  addDifference(
    differences,
    "sequenceResets",
    liveState.sequenceResets,
    replayState.counters.sequenceResets
  );
  addDifference(
    differences,
    "streamSwitches",
    liveState.streamSwitches,
    replayState.counters.streamSwitches
  );

  return {
    live_vs_replay_supported: true,
    differences,
    live_active_stream_id: liveState.activeStreamId,
    replay_active_stream_id: replayState.activeStreamId,
    live_gateway_health: liveGatewayHealth,
    replay_gateway_health: replayGatewayHealth,
    live_integrity_counters: {
      duplicatePackets: liveState.duplicatePackets,
      outOfOrderPackets: liveState.outOfOrderPackets,
      sequenceGaps: liveState.sequenceGaps,
      sequenceResets: liveState.sequenceResets,
      streamSwitches: liveState.streamSwitches,
    },
    replay_integrity_counters: {
      duplicatePackets: replayState.counters.duplicatePackets,
      outOfOrderPackets: replayState.counters.outOfOrderPackets,
      sequenceGaps: replayState.counters.sequenceGaps,
      sequenceResets: replayState.counters.sequenceResets,
      streamSwitches: replayState.counters.streamSwitches,
    },
  };
}

function addDifference(
  differences: string[],
  label: string,
  liveValue: unknown,
  replayValue: unknown
) {
  if (liveValue !== replayValue) {
    differences.push(`${label}: live=${String(liveValue)} replay=${String(replayValue)}`);
  }
}
