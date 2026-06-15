import { create } from "zustand";
import type {
  ChipStatusPayload,
  ConnectionState,
  EngineeringLog,
  GatewayHealthPayload,
  PacketValidationResult,
  PowerHealthPayload,
  SystemHealthPayload,
  TelemetryPacket,
} from "../types/telemetry";
import {
  ageDeviceRegistry,
  createInitialDeviceRegistry,
  getGlobalSystemHealth,
  getRegistrySummary,
  updateRegistryFromChipStatus,
  updateRegistryFromGatewayHealth,
  updateRegistryFromNodeHealth,
  updateRegistryFromPowerHealth,
  updateRegistryFromSystemHealth,
  type DeviceRegistry,
} from "../state/deviceRegistry";
import {
  createInitialLinkRegistry,
  getLinkRegistrySummary,
  updateLinkRegistryFromHeartbeat,
  updateLinkRegistryFromSync,
  updateLinkRegistryFromWebSocket,
  type LinkRegistry,
} from "../state/linkRegistry";
import {
  SIMULATOR_WEBSOCKET_SOURCE,
  type TelemetrySourceStatus,
} from "../transport/telemetrySource";
import {
  appendBoundedEvent,
  createTelemetryEventRecord,
  DEFAULT_EVENT_STORE_MAX_EVENTS,
  getEventStoreSummary,
  type EventStoreSummary,
  type TelemetryEventDisposition,
  type TelemetryEventInput,
  type TelemetryEventRecord,
} from "../state/eventStore";

type SoakVerdictStatus = "PASS" | "WARNING" | "FAIL" | "IN_PROGRESS";

type SoakVerdict = {
  status: SoakVerdictStatus;
  failureReasons: string[];
  warningReasons: string[];
};

type SoakLinkMetrics = {
  heartbeatCount: number;
  lastHeartbeatAtMs: number | null;
  previousHeartbeatAtMs: number | null;
  maxHeartbeatGapMs: number;
  averageHeartbeatIntervalMs: number | null;
  totalHeartbeatIntervalMs: number;
  dropoutCount: number;
  recoveredDropoutCount: number;
  currentLinkState: string | null;
  currentSyncState: string | null;
};

type SoakNodeMetrics = {
  lastSeenAtMs: number | null;
  lastHealthState: string | null;
  healthTransitionCount: number;
  healthTransitions: Record<string, number>;
  lastUptimeMs: number | null;
  resetReason: string | null;
  resetCount: number;
};

export type SoakMetrics = {
  soakStartedAtUtc: string | null;
  soakStartedAtMs: number | null;
  soakElapsedSeconds: number;
  lastUpdatedAtUtc: string | null;
  targetDurationMinutes: number | null;
  isSoakActive: boolean;
  totalPackets: number;
  packetsBySourceNode: Record<string, number>;
  packetsByEventType: Record<string, number>;
  packetsByLink: Record<string, number>;
  packetsPerMinute: number;
  linkStability: Record<string, SoakLinkMetrics>;
  nodeStability: Record<string, SoakNodeMetrics>;
  verdict: SoakVerdict;
};

type TelemetryState = {
  connectionState: ConnectionState;
  activeTelemetrySource: TelemetrySourceStatus;
  lastPacketAt: string | null;
  packetCount: number;
  packetRateHz: number;
  packetWindow: number[];
  lastSequenceNumber: number | null;
  lastAcceptedSequenceNumber: number | null;
  activeStreamId: string | null;
  streamSwitches: number;
  sourceSequences: Record<string, number>;
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
  eventStore: TelemetryEventRecord[];
  eventStoreLatestSequence: number;
  eventStoreDroppedOldEvents: number;
  eventStoreMaxEvents: number;
  eventStoreSummary: EventStoreSummary;
  recentPacketKeys: string[];
  systemHealth: SystemHealthPayload | null;
  chipStatus: ChipStatusPayload | null;
  powerHealth: PowerHealthPayload | null;
  gatewayHealth: GatewayHealthPayload | null;
  deviceRegistry: DeviceRegistry;
  registrySummary: ReturnType<typeof getRegistrySummary>;
  linkRegistry: LinkRegistry;
  linkRegistrySummary: ReturnType<typeof getLinkRegistrySummary>;
  globalHealth: ReturnType<typeof getGlobalSystemHealth>;
  isTelemetryStale: boolean;
  logs: EngineeringLog[];
  soakMetrics: SoakMetrics;

  setConnectionState: (state: ConnectionState) => void;
  setTelemetrySourceConnectionState: (state: ConnectionState) => void;
  setTelemetrySourceError: (error: string | null) => void;
  incrementTelemetrySourceReconnectAttempts: () => void;
  resetTelemetrySourceReconnectAttempts: () => void;
  ingestPacket: (packet: TelemetryPacket) => void;
  recordPacketRejection: (
    result: Extract<PacketValidationResult, { ok: false }>
  ) => void;
  startSoakSession: (targetDurationMinutes: number) => void;
  resetSoakSession: () => void;
  ageRegistry: () => void;
  resetPacketStats: () => void;
  resetConnectionStats: () => void;
};

function getSeverity(packet: TelemetryPacket): EngineeringLog["severity"] {
  if (
    packet.event_type === "CHIP_STATUS_TELEMETRY" &&
    packet.payload.spi_devices.some((d) => d.status.includes("BLOCKED"))
  ) {
    return "WARNING";
  }

  if (
    packet.event_type === "POWER_HEALTH_TELEMETRY" &&
    packet.payload.brownout_detected
  ) {
    return "CRITICAL";
  }

  return "INFO";
}

const REQUIRED_SOAK_NODES = ["pi_gateway", "esp32_main", "esp32_sub"];
const REQUIRED_SOAK_LINKS = ["link_laptop_pi", "link_pi_main", "link_main_sub"];
const HARDWARE_SOAK_LINKS = ["link_pi_main", "link_main_sub"];
const SUPPORTED_SOAK_TARGET_MINUTES = [10, 30, 60];

function createEmptySoakLinkMetrics(): SoakLinkMetrics {
  return {
    heartbeatCount: 0,
    lastHeartbeatAtMs: null,
    previousHeartbeatAtMs: null,
    maxHeartbeatGapMs: 0,
    averageHeartbeatIntervalMs: null,
    totalHeartbeatIntervalMs: 0,
    dropoutCount: 0,
    recoveredDropoutCount: 0,
    currentLinkState: null,
    currentSyncState: null,
  };
}

function createEmptySoakNodeMetrics(): SoakNodeMetrics {
  return {
    lastSeenAtMs: null,
    lastHealthState: null,
    healthTransitionCount: 0,
    healthTransitions: {},
    lastUptimeMs: null,
    resetReason: null,
    resetCount: 0,
  };
}

function createInitialSoakMetrics(): SoakMetrics {
  return {
    soakStartedAtUtc: null,
    soakStartedAtMs: null,
    soakElapsedSeconds: 0,
    lastUpdatedAtUtc: null,
    targetDurationMinutes: null,
    isSoakActive: false,
    totalPackets: 0,
    packetsBySourceNode: {},
    packetsByEventType: {},
    packetsByLink: {},
    packetsPerMinute: 0,
    linkStability: {},
    nodeStability: {},
    verdict: {
      status: "IN_PROGRESS",
      failureReasons: [],
      warningReasons: [],
    },
  };
}

function createStartedSoakMetrics(targetDurationMinutes: number, nowMs: number): SoakMetrics {
  return {
    ...createInitialSoakMetrics(),
    soakStartedAtUtc: new Date(nowMs).toISOString(),
    soakStartedAtMs: nowMs,
    lastUpdatedAtUtc: new Date(nowMs).toISOString(),
    targetDurationMinutes,
    isSoakActive: true,
  };
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  connectionState: "OFFLINE",
  activeTelemetrySource: {
    ...SIMULATOR_WEBSOCKET_SOURCE,
    connection_state: "OFFLINE",
    last_connected_utc: null,
    last_error: null,
    reconnect_attempts: 0,
  },
  lastPacketAt: null,
  packetCount: 0,
  packetRateHz: 0,
  packetWindow: [],
  lastSequenceNumber: null,
  lastAcceptedSequenceNumber: null,
  activeStreamId: null,
  streamSwitches: 0,
  sourceSequences: {},
  missedPackets: 0,
  duplicatePackets: 0,
  outOfOrderPackets: 0,
  sequenceResets: 0,
  sequenceGaps: 0,
  schemaRejectedPackets: 0,
  malformedPackets: 0,
  unknownEventPackets: 0,
  unknownNodePackets: 0,
  unknownLinkPackets: 0,
  eventStore: [],
  eventStoreLatestSequence: 0,
  eventStoreDroppedOldEvents: 0,
  eventStoreMaxEvents: DEFAULT_EVENT_STORE_MAX_EVENTS,
  eventStoreSummary: getEventStoreSummary({
    events: [],
    maxEvents: DEFAULT_EVENT_STORE_MAX_EVENTS,
    latestSequence: 0,
    droppedOldEvents: 0,
  }),
  recentPacketKeys: [],
  systemHealth: null,
  chipStatus: null,
  powerHealth: null,
  gatewayHealth: null,
  deviceRegistry: createInitialDeviceRegistry(),
  registrySummary: getRegistrySummary(createInitialDeviceRegistry()),
  linkRegistry: createInitialLinkRegistry(),
  linkRegistrySummary: getLinkRegistrySummary(createInitialLinkRegistry()),
  globalHealth: getGlobalSystemHealth(createInitialDeviceRegistry()),
  isTelemetryStale: false,
  logs: [],
  soakMetrics: createInitialSoakMetrics(),

  setConnectionState: (state) => set({ connectionState: state }),

  setTelemetrySourceConnectionState: (sourceState) =>
    set((state) => {
      const shouldProjectWebSocketLink = !state.activeTelemetrySource.is_simulated;
      const linkRegistry = shouldProjectWebSocketLink
        ? updateLinkRegistryFromWebSocket(
            state.linkRegistry,
            sourceState,
            new Date().toISOString()
          )
        : state.linkRegistry;

      return {
        connectionState: sourceState,
        activeTelemetrySource: {
          ...state.activeTelemetrySource,
          connection_state: sourceState,
          last_connected_utc:
            sourceState === "CONNECTED"
              ? new Date().toISOString()
              : state.activeTelemetrySource.last_connected_utc,
          last_error:
            sourceState === "CONNECTED"
              ? null
              : state.activeTelemetrySource.last_error,
        },
        linkRegistry,
        linkRegistrySummary: getLinkRegistrySummary(linkRegistry),
      };
    }),

  setTelemetrySourceError: (error) =>
    set((state) => ({
      activeTelemetrySource: {
        ...state.activeTelemetrySource,
        last_error: error,
      },
    })),

  incrementTelemetrySourceReconnectAttempts: () =>
    set((state) => ({
      activeTelemetrySource: {
        ...state.activeTelemetrySource,
        reconnect_attempts: state.activeTelemetrySource.reconnect_attempts + 1,
      },
    })),

  resetTelemetrySourceReconnectAttempts: () =>
    set((state) => ({
      activeTelemetrySource: {
        ...state.activeTelemetrySource,
        reconnect_attempts: 0,
      },
    })),

  ageRegistry: () =>
    set((state) => {
      const agedRegistry = ageDeviceRegistry(state.deviceRegistry);
      const globalHealth = getGlobalSystemHealth(agedRegistry);
      const isTelemetryStale =
        state.lastPacketAt === null
          ? true
          : Date.now() - new Date(state.lastPacketAt).getTime() > 3000;

      return {
        deviceRegistry: agedRegistry,
        registrySummary: getRegistrySummary(agedRegistry),
        globalHealth,
        isTelemetryStale,
        soakMetrics: refreshSoakMetrics(state.soakMetrics, {
          nowMs: Date.now(),
          connectionState: state.connectionState,
          deviceRegistry: agedRegistry,
          linkRegistry: state.linkRegistry,
          malformedPackets: state.malformedPackets,
          schemaRejectedPackets: state.schemaRejectedPackets,
          unknownEventPackets: state.unknownEventPackets,
          unknownNodePackets: state.unknownNodePackets,
          unknownLinkPackets: state.unknownLinkPackets,
          duplicatePackets: state.duplicatePackets,
          sequenceGaps: state.sequenceGaps,
          eventStoreDroppedOldEvents: state.eventStoreDroppedOldEvents,
        }),
      };
    }),

  resetPacketStats: () =>
    set({
      packetCount: 0,
      lastSequenceNumber: null,
      lastAcceptedSequenceNumber: null,
      activeStreamId: null,
      streamSwitches: 0,
      sourceSequences: {},
      missedPackets: 0,
      duplicatePackets: 0,
      outOfOrderPackets: 0,
      sequenceResets: 0,
      sequenceGaps: 0,
      schemaRejectedPackets: 0,
      malformedPackets: 0,
      unknownEventPackets: 0,
      unknownNodePackets: 0,
      unknownLinkPackets: 0,
      eventStore: [],
      eventStoreLatestSequence: 0,
      eventStoreDroppedOldEvents: 0,
      eventStoreSummary: getEventStoreSummary({
        events: [],
        maxEvents: DEFAULT_EVENT_STORE_MAX_EVENTS,
        latestSequence: 0,
        droppedOldEvents: 0,
      }),
      packetRateHz: 0,
      packetWindow: [],
      recentPacketKeys: [],
      logs: [],
      soakMetrics: createInitialSoakMetrics(),
    }),

  resetConnectionStats: () =>
    set({
      packetCount: 0,
      lastSequenceNumber: null,
      missedPackets: 0,
      duplicatePackets: 0,
      outOfOrderPackets: 0,
      sequenceGaps: 0,
      schemaRejectedPackets: 0,
      malformedPackets: 0,
      unknownEventPackets: 0,
      unknownNodePackets: 0,
      unknownLinkPackets: 0,
      eventStore: [],
      eventStoreLatestSequence: 0,
      eventStoreDroppedOldEvents: 0,
      eventStoreSummary: getEventStoreSummary({
        events: [],
        maxEvents: DEFAULT_EVENT_STORE_MAX_EVENTS,
        latestSequence: 0,
        droppedOldEvents: 0,
      }),
      packetRateHz: 0,
      packetWindow: [],
      logs: [],
    }),

  recordPacketRejection: (result) =>
    set((state) => {
      const malformed = isMalformedRejection(result.reason);
      const log = buildPacketRejectionLog(result, {
        activeStreamId: state.activeStreamId,
        lastSequenceNumber: state.lastSequenceNumber,
      });
      const eventUpdate = appendTelemetryEvent(state, {
        event_kind: "PACKET_REJECTION",
        disposition: mapRejectionDisposition(result.reason),
        source_type: "VALIDATOR",
        stream_id: state.activeStreamId,
        source_node_id: null,
        global_sequence_number: null,
        source_sequence_number: null,
        event_type: "TELEMETRY_INTEGRITY_EVENT",
        rejection_reason: result.reason,
        severity: result.severity,
        details: result.details,
        integrity_flags: ["SCHEMA_REJECTION"],
      });

      return {
        ...eventUpdate,
        schemaRejectedPackets: state.schemaRejectedPackets + 1,
        malformedPackets: malformed
          ? state.malformedPackets + 1
          : state.malformedPackets,
        unknownEventPackets:
          result.reason === "UNKNOWN_EVENT_TYPE"
            ? state.unknownEventPackets + 1
            : state.unknownEventPackets,
        unknownNodePackets:
          result.reason === "UNKNOWN_SOURCE_NODE"
            ? state.unknownNodePackets + 1
            : state.unknownNodePackets,
        unknownLinkPackets:
          result.reason === "UNKNOWN_LINK_ID"
            ? state.unknownLinkPackets + 1
            : state.unknownLinkPackets,
        soakMetrics: refreshSoakMetrics(state.soakMetrics, {
          nowMs: Date.now(),
          connectionState: state.connectionState,
          deviceRegistry: state.deviceRegistry,
          linkRegistry: state.linkRegistry,
          malformedPackets: state.malformedPackets + (malformed ? 1 : 0),
          schemaRejectedPackets: state.schemaRejectedPackets + 1,
          unknownEventPackets:
            result.reason === "UNKNOWN_EVENT_TYPE"
              ? state.unknownEventPackets + 1
              : state.unknownEventPackets,
          unknownNodePackets:
            result.reason === "UNKNOWN_SOURCE_NODE"
              ? state.unknownNodePackets + 1
              : state.unknownNodePackets,
          unknownLinkPackets:
            result.reason === "UNKNOWN_LINK_ID"
              ? state.unknownLinkPackets + 1
              : state.unknownLinkPackets,
          duplicatePackets: state.duplicatePackets,
          sequenceGaps: state.sequenceGaps,
          eventStoreDroppedOldEvents: state.eventStoreDroppedOldEvents,
        }),
        logs: [log, ...state.logs].slice(0, 100),
      };
    }),

  startSoakSession: (targetDurationMinutes) =>
    set((state) => {
      const safeTargetDurationMinutes = SUPPORTED_SOAK_TARGET_MINUTES.includes(
        targetDurationMinutes
      )
        ? targetDurationMinutes
        : 10;
      const nowMs = Date.now();
      const startedSoakMetrics = createStartedSoakMetrics(
        safeTargetDurationMinutes,
        nowMs
      );

      return {
        soakMetrics: refreshSoakMetrics(startedSoakMetrics, {
          nowMs,
          connectionState: state.connectionState,
          deviceRegistry: state.deviceRegistry,
          linkRegistry: state.linkRegistry,
          malformedPackets: state.malformedPackets,
          schemaRejectedPackets: state.schemaRejectedPackets,
          unknownEventPackets: state.unknownEventPackets,
          unknownNodePackets: state.unknownNodePackets,
          unknownLinkPackets: state.unknownLinkPackets,
          duplicatePackets: state.duplicatePackets,
          sequenceGaps: state.sequenceGaps,
          eventStoreDroppedOldEvents: state.eventStoreDroppedOldEvents,
        }),
      };
    }),

  resetSoakSession: () =>
    set({
      soakMetrics: createInitialSoakMetrics(),
    }),

  ingestPacket: (packet) =>
    set((state) => {
      const now = Date.now();
      const packetWindow = [...state.packetWindow, now].filter(
        (timestamp) => now - timestamp <= 5000
      );

      const packetRateHz = packetWindow.length / 5;
      const globalSequenceNumber = getGlobalSequenceNumber(packet);
      const packetKey = getPacketKey(packet);
      const streamSwitchDetected =
        state.activeStreamId !== null && packet.stream_id !== state.activeStreamId;
      const activeStreamId = packet.stream_id;
      const recentKeysForStream = streamSwitchDetected ? [] : state.recentPacketKeys;
      const duplicateDetected = recentKeysForStream.includes(packetKey);
      const sequenceResetDetected =
        !streamSwitchDetected &&
        state.lastAcceptedSequenceNumber !== null &&
        globalSequenceNumber <= 5 &&
        state.lastAcceptedSequenceNumber > 20;
      const outOfOrderDetected =
        !streamSwitchDetected &&
        !sequenceResetDetected &&
        state.lastAcceptedSequenceNumber !== null &&
        globalSequenceNumber < state.lastAcceptedSequenceNumber;
      const sourceSequenceKey = `${packet.stream_id}:${packet.source_node_id}`;
      const previousSourceSequence = streamSwitchDetected
        ? undefined
        : state.sourceSequences[sourceSequenceKey];
      const sourceSequenceResetDetected =
        previousSourceSequence !== undefined &&
        packet.source_sequence_number < previousSourceSequence;
      const sourceSequences = {
        ...(streamSwitchDetected ? {} : state.sourceSequences),
        [sourceSequenceKey]: packet.source_sequence_number,
      };

      const baseObservedUpdate = {
        packetCount: state.packetCount + 1,
        packetWindow,
        packetRateHz,
        lastSequenceNumber: globalSequenceNumber,
        activeStreamId,
        streamSwitches: streamSwitchDetected
          ? state.streamSwitches + 1
          : state.streamSwitches,
      };

      if (duplicateDetected) {
        const eventUpdate = appendTelemetryEvent(
          state,
          buildPacketEventInput(packet, {
            disposition: "DUPLICATE_REJECTED",
            eventKind: "INTEGRITY_ANOMALY",
            sourceType: "STORE_INTEGRITY",
            severity: "WARNING",
            details: "Duplicate packet ignored",
            integrityFlags: ["DUPLICATE_PACKET"],
          })
        );

        return {
          ...eventUpdate,
          ...baseObservedUpdate,
          duplicatePackets: state.duplicatePackets + 1,
          logs: [
            buildAnomalyLog(packet, "WARNING", `DUPLICATE_PACKET_IGNORED key=${packetKey}`),
            ...state.logs,
          ].slice(0, 100),
        };
      }

      if (outOfOrderDetected) {
        const eventUpdate = appendTelemetryEvent(
          state,
          buildPacketEventInput(packet, {
            disposition: "OUT_OF_ORDER_REJECTED",
            eventKind: "INTEGRITY_ANOMALY",
            sourceType: "STORE_INTEGRITY",
            severity: "ERROR",
            details: `Out-of-order packet ignored seq=${globalSequenceNumber} accepted=${state.lastAcceptedSequenceNumber}`,
            integrityFlags: ["OUT_OF_ORDER_PACKET"],
          })
        );

        return {
          ...eventUpdate,
          ...baseObservedUpdate,
          outOfOrderPackets: state.outOfOrderPackets + 1,
          logs: [
            buildAnomalyLog(
              packet,
              "ERROR",
              `OUT_OF_ORDER_PACKET_IGNORED seq=${packet.sequence_number} accepted=${state.lastAcceptedSequenceNumber}`
            ),
            ...state.logs,
          ].slice(0, 100),
        };
      }

      const expectedNext =
        state.lastAcceptedSequenceNumber === null || sequenceResetDetected || streamSwitchDetected
          ? globalSequenceNumber
          : state.lastAcceptedSequenceNumber + 1;

      const gap =
        globalSequenceNumber > expectedNext
          ? globalSequenceNumber - expectedNext
          : 0;

      let deviceRegistry = state.deviceRegistry;
      let linkRegistry = state.linkRegistry;

      if (packet.event_type === "SYSTEM_HEALTH_TELEMETRY") {
        deviceRegistry = updateRegistryFromSystemHealth(
          deviceRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "CHIP_STATUS_TELEMETRY") {
        deviceRegistry = updateRegistryFromChipStatus(
          deviceRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "POWER_HEALTH_TELEMETRY") {
        deviceRegistry = updateRegistryFromPowerHealth(
          deviceRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "NODE_HEALTH_TELEMETRY") {
        deviceRegistry = updateRegistryFromNodeHealth(
          deviceRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "GATEWAY_HEALTH_TELEMETRY") {
        deviceRegistry = updateRegistryFromGatewayHealth(
          deviceRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "LINK_HEARTBEAT_TELEMETRY") {
        linkRegistry = updateLinkRegistryFromHeartbeat(
          linkRegistry,
          packet.payload,
          packet.timestamp_utc
        );
      }

      if (packet.event_type === "LINK_SYNC_TELEMETRY") {
        linkRegistry = updateLinkRegistryFromSync(
          linkRegistry,
          packet.payload
        );
      }

      const normalLog: EngineeringLog = {
        timestamp_utc: packet.timestamp_utc,
        node_id: packet.node_id,
        source_node_id: packet.source_node_id,
        event_type: packet.event_type,
        sequence_number: globalSequenceNumber,
        global_sequence_number: globalSequenceNumber,
        source_sequence_number: packet.source_sequence_number,
        stream_id: packet.stream_id,
        severity: getSeverity(packet),
        message: `${packet.event_type} received from ${packet.source_node_id}`,
      };

      const anomalyLogs: EngineeringLog[] = [];

      if (streamSwitchDetected) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `STREAM_SWITCH_DETECTED previous=${state.activeStreamId} new=${packet.stream_id}`
          )
        );
      }

      if (sequenceResetDetected) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `SEQUENCE_RESET_DETECTED accepted=${state.lastAcceptedSequenceNumber} new=${globalSequenceNumber}`
          )
        );
      }

      if (sourceSequenceResetDetected) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `SOURCE_SEQUENCE_RESET_DETECTED source=${sourceSequenceKey} previous=${previousSourceSequence} new=${packet.source_sequence_number}`
          )
        );
      }

      if (gap > 0) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `SEQUENCE_GAP_DETECTED gap=${gap} expected=${expectedNext} received=${globalSequenceNumber}`
          )
        );
      }

      const recentPacketKeys = sequenceResetDetected || streamSwitchDetected
        ? [packetKey]
        : [...recentKeysForStream, packetKey].slice(-300);
      const acceptedEventUpdate = appendTelemetryEvent(
        state,
        buildAcceptedPacketEventInput(packet, {
          streamSwitchDetected,
          sequenceResetDetected:
            sequenceResetDetected || sourceSequenceResetDetected,
          gap,
          previousStreamId: state.activeStreamId,
          expectedNext,
        })
      );
      const soakMetrics = updateSoakMetricsForAcceptedPacket(
        state.soakMetrics,
        packet,
        {
          nowMs: now,
          connectionState: state.connectionState,
          deviceRegistry,
          linkRegistry,
          malformedPackets: state.malformedPackets,
          schemaRejectedPackets: state.schemaRejectedPackets,
          unknownEventPackets: state.unknownEventPackets,
          unknownNodePackets: state.unknownNodePackets,
          unknownLinkPackets: state.unknownLinkPackets,
          duplicatePackets: state.duplicatePackets,
          sequenceGaps: state.sequenceGaps + gap,
          eventStoreDroppedOldEvents: acceptedEventUpdate.eventStoreDroppedOldEvents,
        }
      );

      return {
        ...acceptedEventUpdate,
        ...baseObservedUpdate,
        lastPacketAt: packet.timestamp_utc,
        lastAcceptedSequenceNumber: globalSequenceNumber,
        sourceSequences,
        missedPackets: state.missedPackets + gap,
        duplicatePackets: state.duplicatePackets,
        outOfOrderPackets: state.outOfOrderPackets,
        sequenceResets: sequenceResetDetected || sourceSequenceResetDetected
          ? state.sequenceResets + 1
          : state.sequenceResets,
        sequenceGaps: state.sequenceGaps + gap,
        recentPacketKeys,
        systemHealth:
          packet.event_type === "SYSTEM_HEALTH_TELEMETRY"
            ? packet.payload
            : state.systemHealth,
        chipStatus:
          packet.event_type === "CHIP_STATUS_TELEMETRY"
            ? packet.payload
            : state.chipStatus,
        powerHealth:
          packet.event_type === "POWER_HEALTH_TELEMETRY"
            ? packet.payload
            : state.powerHealth,
        gatewayHealth:
          packet.event_type === "GATEWAY_HEALTH_TELEMETRY"
            ? packet.payload
            : state.gatewayHealth,
        deviceRegistry,
        registrySummary: getRegistrySummary(deviceRegistry),
        linkRegistry,
        linkRegistrySummary: getLinkRegistrySummary(linkRegistry),
        globalHealth: getGlobalSystemHealth(deviceRegistry),
        isTelemetryStale: false,
        soakMetrics,
        logs: [...anomalyLogs, normalLog, ...state.logs].slice(0, 100),
      };
    }),
}));

function getPacketKey(packet: TelemetryPacket) {
  return `${packet.stream_id}:${packet.source_node_id}:${packet.event_type}:${packet.source_sequence_number}:${getGlobalSequenceNumber(packet)}`;
}

function getGlobalSequenceNumber(packet: TelemetryPacket) {
  return packet.global_sequence_number ?? packet.sequence_number;
}

function buildAnomalyLog(
  packet: TelemetryPacket,
  severity: EngineeringLog["severity"],
  message: string
): EngineeringLog {
  return {
    timestamp_utc: packet.timestamp_utc,
    node_id: packet.node_id,
    source_node_id: packet.source_node_id,
    event_type: packet.event_type,
    sequence_number: getGlobalSequenceNumber(packet),
    global_sequence_number: getGlobalSequenceNumber(packet),
    source_sequence_number: packet.source_sequence_number,
    stream_id: packet.stream_id,
    severity,
    message,
  };
}

function buildPacketRejectionLog(
  result: Extract<PacketValidationResult, { ok: false }>,
  context: {
    activeStreamId: string | null;
    lastSequenceNumber: number | null;
  }
): EngineeringLog {
  return {
    timestamp_utc: new Date().toISOString(),
    node_id: "laptop_console",
    source_node_id: "laptop_console",
    event_type: "TELEMETRY_INTEGRITY_EVENT",
    sequence_number: context.lastSequenceNumber ?? 0,
    global_sequence_number: context.lastSequenceNumber ?? 0,
    source_sequence_number: 0,
    stream_id: context.activeStreamId ?? "UNKNOWN_STREAM",
    severity: result.severity,
    message: `SCHEMA_REJECTION: ${result.reason} - ${result.details}`,
  };
}

function isMalformedRejection(reason: Extract<PacketValidationResult, { ok: false }>["reason"]) {
  return (
    reason === "INVALID_JSON" ||
    reason === "MISSING_REQUIRED_FIELD" ||
    reason === "INVALID_PAYLOAD_SHAPE" ||
    reason === "INVALID_TIMESTAMP" ||
    reason === "INVALID_NUMERIC_RANGE"
  );
}

function appendTelemetryEvent(
  state: TelemetryState,
  input: TelemetryEventInput
) {
  const nextSequence = state.eventStoreLatestSequence + 1;
  const event = createTelemetryEventRecord({
    sequence: nextSequence,
    input,
  });
  const bounded = appendBoundedEvent({
    events: state.eventStore,
    event,
    maxEvents: state.eventStoreMaxEvents,
    droppedOldEvents: state.eventStoreDroppedOldEvents,
  });

  return {
    eventStore: bounded.events,
    eventStoreLatestSequence: nextSequence,
    eventStoreDroppedOldEvents: bounded.droppedOldEvents,
    eventStoreSummary: getEventStoreSummary({
      events: bounded.events,
      maxEvents: state.eventStoreMaxEvents,
      latestSequence: nextSequence,
      droppedOldEvents: bounded.droppedOldEvents,
    }),
  };
}

function buildAcceptedPacketEventInput(
  packet: TelemetryPacket,
  context: {
    streamSwitchDetected: boolean;
    sequenceResetDetected: boolean;
    gap: number;
    previousStreamId: string | null;
    expectedNext: number;
  }
): TelemetryEventInput {
  if (context.streamSwitchDetected) {
    return buildPacketEventInput(packet, {
      disposition: "STREAM_SWITCH_ACCEPTED",
      eventKind: "INTEGRITY_ANOMALY",
      sourceType: "STORE_INTEGRITY",
      severity: "WARNING",
      details: `Stream switch accepted previous=${context.previousStreamId} new=${packet.stream_id}`,
      integrityFlags: ["STREAM_SWITCH"],
    });
  }

  if (context.sequenceResetDetected) {
    return buildPacketEventInput(packet, {
      disposition: "SEQUENCE_RESET_ACCEPTED",
      eventKind: "INTEGRITY_ANOMALY",
      sourceType: "STORE_INTEGRITY",
      severity: "WARNING",
      details: `Sequence reset accepted seq=${getGlobalSequenceNumber(packet)}`,
      integrityFlags: ["SEQUENCE_RESET"],
    });
  }

  if (context.gap > 0) {
    return buildPacketEventInput(packet, {
      disposition: "SEQUENCE_GAP_ACCEPTED",
      eventKind: "INTEGRITY_ANOMALY",
      sourceType: "STORE_INTEGRITY",
      severity: "WARNING",
      details: `Sequence gap accepted gap=${context.gap} expected=${context.expectedNext} received=${getGlobalSequenceNumber(packet)}`,
      integrityFlags: ["SEQUENCE_GAP"],
    });
  }

  return buildPacketEventInput(packet, {
    disposition: "ACCEPTED",
    eventKind: "TELEMETRY_PACKET",
    sourceType: "TRANSPORT",
    severity: "INFO",
    details: "Telemetry packet accepted",
  });
}

function buildPacketEventInput(
  packet: TelemetryPacket,
  params: {
    disposition: TelemetryEventDisposition;
    eventKind: TelemetryEventInput["event_kind"];
    sourceType: TelemetryEventInput["source_type"];
    severity: TelemetryEventInput["severity"];
    details: string;
    integrityFlags?: string[];
  }
): TelemetryEventInput {
  return {
    event_kind: params.eventKind,
    disposition: params.disposition,
    source_type: params.sourceType,
    stream_id: packet.stream_id,
    source_node_id: packet.source_node_id,
    global_sequence_number: getGlobalSequenceNumber(packet),
    source_sequence_number: packet.source_sequence_number,
    event_type: packet.event_type,
    packet,
    severity: params.severity,
    details: params.details,
    integrity_flags: params.integrityFlags,
  };
}

function updateSoakMetricsForAcceptedPacket(
  current: SoakMetrics,
  packet: TelemetryPacket,
  context: {
    nowMs: number;
    connectionState: ConnectionState;
    deviceRegistry: DeviceRegistry;
    linkRegistry: LinkRegistry;
    malformedPackets: number;
    schemaRejectedPackets: number;
    unknownEventPackets: number;
    unknownNodePackets: number;
    unknownLinkPackets: number;
    duplicatePackets: number;
    sequenceGaps: number;
    eventStoreDroppedOldEvents: number;
  }
): SoakMetrics {
  const startedAtMs = current.soakStartedAtMs ?? context.nowMs;
  const startedAtUtc = current.soakStartedAtUtc ?? new Date(context.nowMs).toISOString();
  const elapsedSeconds = Math.max(0, Math.floor((context.nowMs - startedAtMs) / 1000));
  const totalPackets = current.totalPackets + 1;
  const packetsBySourceNode = incrementRecord(current.packetsBySourceNode, packet.source_node_id);
  const packetsByEventType = incrementRecord(current.packetsByEventType, packet.event_type);
  const packetsByLink = getPacketLinkId(packet)
    ? incrementRecord(current.packetsByLink, getPacketLinkId(packet)!)
    : current.packetsByLink;
  const linkStability = updateSoakLinkStability(current.linkStability, packet, context.nowMs);
  const nodeStability = updateSoakNodeStability(current.nodeStability, packet, context.nowMs);

  const next: SoakMetrics = {
    ...current,
    soakStartedAtUtc: startedAtUtc,
    soakStartedAtMs: startedAtMs,
    soakElapsedSeconds: elapsedSeconds,
    lastUpdatedAtUtc: new Date(context.nowMs).toISOString(),
    isSoakActive: true,
    totalPackets,
    packetsBySourceNode,
    packetsByEventType,
    packetsByLink,
    packetsPerMinute: elapsedSeconds > 0
      ? Number(((totalPackets / elapsedSeconds) * 60).toFixed(2))
      : totalPackets,
    linkStability,
    nodeStability,
  };

  return {
    ...next,
    verdict: deriveSoakVerdict(next, context),
  };
}

function refreshSoakMetrics(
  current: SoakMetrics,
  context: {
    nowMs: number;
    connectionState: ConnectionState;
    deviceRegistry: DeviceRegistry;
    linkRegistry: LinkRegistry;
    malformedPackets: number;
    schemaRejectedPackets: number;
    unknownEventPackets: number;
    unknownNodePackets: number;
    unknownLinkPackets: number;
    duplicatePackets: number;
    sequenceGaps: number;
    eventStoreDroppedOldEvents: number;
  }
): SoakMetrics {
  if (!current.soakStartedAtMs) {
    return {
      ...current,
      verdict: deriveSoakVerdict(current, context),
    };
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((context.nowMs - current.soakStartedAtMs) / 1000)
  );
  const next = {
    ...current,
    soakElapsedSeconds: elapsedSeconds,
    lastUpdatedAtUtc: new Date(context.nowMs).toISOString(),
    packetsPerMinute: elapsedSeconds > 0
      ? Number(((current.totalPackets / elapsedSeconds) * 60).toFixed(2))
      : current.totalPackets,
  };

  return {
    ...next,
    verdict: deriveSoakVerdict(next, context),
  };
}

function incrementRecord(record: Record<string, number>, key: string) {
  return {
    ...record,
    [key]: (record[key] ?? 0) + 1,
  };
}

function getPacketLinkId(packet: TelemetryPacket): string | null {
  if (
    packet.event_type === "LINK_HEARTBEAT_TELEMETRY" ||
    packet.event_type === "LINK_SYNC_TELEMETRY"
  ) {
    return packet.payload.link_id;
  }

  return null;
}

function updateSoakLinkStability(
  current: Record<string, SoakLinkMetrics>,
  packet: TelemetryPacket,
  nowMs: number
) {
  if (packet.event_type !== "LINK_HEARTBEAT_TELEMETRY") return current;

  const linkId = packet.payload.link_id;
  const previous = current[linkId] ?? createEmptySoakLinkMetrics();
  const previousHeartbeatAtMs = previous.lastHeartbeatAtMs;
  const intervalMs = previousHeartbeatAtMs === null
    ? null
    : Math.max(0, nowMs - previousHeartbeatAtMs);
  const heartbeatCount = previous.heartbeatCount + 1;
  const totalHeartbeatIntervalMs =
    previous.totalHeartbeatIntervalMs + (intervalMs ?? 0);
  const currentLinkState = packet.payload.link_state;
  const wasHealthy = previous.currentLinkState === "LINK_HEALTHY";
  const isHealthy = currentLinkState === "LINK_HEALTHY";
  const dropoutCount =
    wasHealthy && !isHealthy ? previous.dropoutCount + 1 : previous.dropoutCount;
  const recoveredDropoutCount =
    previous.currentLinkState !== null && !wasHealthy && isHealthy
      ? previous.recoveredDropoutCount + 1
      : previous.recoveredDropoutCount;

  return {
    ...current,
    [linkId]: {
      heartbeatCount,
      lastHeartbeatAtMs: nowMs,
      previousHeartbeatAtMs,
      maxHeartbeatGapMs: Math.max(previous.maxHeartbeatGapMs, intervalMs ?? 0),
      averageHeartbeatIntervalMs: heartbeatCount > 1
        ? Number((totalHeartbeatIntervalMs / (heartbeatCount - 1)).toFixed(2))
        : null,
      totalHeartbeatIntervalMs,
      dropoutCount,
      recoveredDropoutCount,
      currentLinkState,
      currentSyncState: packet.payload.sync_state,
    },
  };
}

function updateSoakNodeStability(
  current: Record<string, SoakNodeMetrics>,
  packet: TelemetryPacket,
  nowMs: number
) {
  if (packet.event_type === "NODE_HEALTH_TELEMETRY") {
    return updateOneSoakNode(current, packet.payload.node_id, {
      healthState: packet.payload.health_state,
      uptimeMs: packet.payload.uptime_ms,
      resetReason: packet.payload.reset_reason ?? null,
      nowMs,
    });
  }

  if (packet.event_type === "GATEWAY_HEALTH_TELEMETRY") {
    return updateOneSoakNode(current, packet.payload.node_id, {
      healthState: packet.payload.health_state,
      uptimeMs: packet.payload.uptime_ms,
      resetReason: null,
      nowMs,
    });
  }

  if (packet.event_type === "SYSTEM_HEALTH_TELEMETRY") {
    const afterMain = updateOneSoakNode(current, packet.payload.main_mcu.node_id, {
      healthState: packet.payload.main_mcu.health_state,
      uptimeMs: packet.payload.main_mcu.uptime_ms,
      resetReason: packet.payload.main_mcu.reset_reason,
      nowMs,
    });
    return updateOneSoakNode(afterMain, packet.payload.sub_mcu.node_id, {
      healthState: packet.payload.sub_mcu.health_state,
      uptimeMs: packet.payload.sub_mcu.uptime_ms,
      resetReason: packet.payload.sub_mcu.reset_reason,
      nowMs,
    });
  }

  return current;
}

function updateOneSoakNode(
  current: Record<string, SoakNodeMetrics>,
  nodeId: string,
  input: {
    healthState: string;
    uptimeMs: number;
    resetReason: string | null;
    nowMs: number;
  }
) {
  const previous = current[nodeId] ?? createEmptySoakNodeMetrics();
  const transitionKey =
    previous.lastHealthState && previous.lastHealthState !== input.healthState
      ? `${previous.lastHealthState}->${input.healthState}`
      : null;
  const uptimeReset =
    previous.lastUptimeMs !== null && input.uptimeMs < previous.lastUptimeMs;

  return {
    ...current,
    [nodeId]: {
      lastSeenAtMs: input.nowMs,
      lastHealthState: input.healthState,
      healthTransitionCount: transitionKey
        ? previous.healthTransitionCount + 1
        : previous.healthTransitionCount,
      healthTransitions: transitionKey
        ? incrementRecord(previous.healthTransitions, transitionKey)
        : previous.healthTransitions,
      lastUptimeMs: input.uptimeMs,
      resetReason: input.resetReason ?? previous.resetReason,
      resetCount: uptimeReset ? previous.resetCount + 1 : previous.resetCount,
    },
  };
}

function deriveSoakVerdict(
  soak: SoakMetrics,
  context: {
    connectionState: ConnectionState;
    deviceRegistry: DeviceRegistry;
    linkRegistry: LinkRegistry;
    malformedPackets: number;
    schemaRejectedPackets: number;
    unknownEventPackets: number;
    unknownNodePackets: number;
    unknownLinkPackets: number;
    duplicatePackets: number;
    sequenceGaps: number;
    eventStoreDroppedOldEvents: number;
  }
): SoakVerdict {
  const failureReasons: string[] = [];
  const warningReasons: string[] = [];

  if (context.malformedPackets > 0) failureReasons.push("Malformed packets observed");
  if (context.schemaRejectedPackets > 0) failureReasons.push("Schema rejections observed");
  if (context.unknownNodePackets > 0) failureReasons.push("Unknown node packets observed");
  if (context.unknownEventPackets > 0) failureReasons.push("Unknown event packets observed");
  if (context.unknownLinkPackets > 0) failureReasons.push("Unknown link packets observed");
  if (context.connectionState !== "CONNECTED") {
    failureReasons.push(`Frontend WebSocket is ${context.connectionState}`);
  }

  for (const nodeId of REQUIRED_SOAK_NODES) {
    const node = Object.values(context.deviceRegistry).find(
      (device) => device.node_id === nodeId || device.device_id === nodeId
    );
    if (!node || !node.last_seen_utc) {
      failureReasons.push(`Required node ${nodeId} has not been observed`);
    } else if (node.health_state === "OFFLINE" || node.health_state === "FAIL_SAFE") {
      failureReasons.push(`Required node ${nodeId} is ${node.health_state}`);
    }
  }

  for (const linkId of REQUIRED_SOAK_LINKS) {
    const link = context.linkRegistry[linkId as keyof LinkRegistry];
    if (!link) {
      failureReasons.push(`Required link ${linkId} is missing`);
      continue;
    }
    if (link.link_state !== "LINK_HEALTHY") {
      failureReasons.push(`Required link ${linkId} is ${link.link_state}`);
    }
    if (link.sync_state !== "SYNCED") {
      failureReasons.push(`Required link ${linkId} sync is ${link.sync_state}`);
    }
  }

  for (const linkId of HARDWARE_SOAK_LINKS) {
    const maxGap = soak.linkStability[linkId]?.maxHeartbeatGapMs ?? 0;
    if (maxGap > 3000) {
      failureReasons.push(`Hardware link ${linkId} max heartbeat gap ${maxGap} ms exceeds 3000 ms`);
    }
  }

  if (context.sequenceGaps > 0) warningReasons.push("Sequence gaps observed");
  if (context.duplicatePackets > 0) warningReasons.push("Duplicate packets observed");
  if (
    Object.values(soak.linkStability).some(
      (link) => link.recoveredDropoutCount > 0
    )
  ) {
    warningReasons.push("Transient link dropout recovered");
  }
  if (context.eventStoreDroppedOldEvents > 0) {
    warningReasons.push("Event store dropped old events; soak replay may be partial");
  }

  if (failureReasons.length > 0) {
    return { status: "FAIL", failureReasons, warningReasons };
  }

  const targetReached =
    soak.targetDurationMinutes !== null &&
    soak.soakElapsedSeconds >= soak.targetDurationMinutes * 60;
  if (!targetReached) {
    return { status: "IN_PROGRESS", failureReasons, warningReasons };
  }

  if (warningReasons.length > 0) {
    return { status: "WARNING", failureReasons, warningReasons };
  }

  return { status: "PASS", failureReasons, warningReasons };
}

function mapRejectionDisposition(
  reason: Extract<PacketValidationResult, { ok: false }>["reason"]
): TelemetryEventDisposition {
  if (reason === "INVALID_SCHEMA_VERSION") return "SCHEMA_REJECTED";
  if (reason === "UNKNOWN_EVENT_TYPE") return "UNKNOWN_EVENT_REJECTED";
  if (reason === "UNKNOWN_SOURCE_NODE") return "UNKNOWN_NODE_REJECTED";
  if (reason === "UNKNOWN_LINK_ID") return "UNKNOWN_LINK_REJECTED";
  return "MALFORMED_REJECTED";
}
