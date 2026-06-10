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

  setConnectionState: (state: ConnectionState) => void;
  setTelemetrySourceConnectionState: (state: ConnectionState) => void;
  setTelemetrySourceError: (error: string | null) => void;
  incrementTelemetrySourceReconnectAttempts: () => void;
  resetTelemetrySourceReconnectAttempts: () => void;
  ingestPacket: (packet: TelemetryPacket) => void;
  recordPacketRejection: (
    result: Extract<PacketValidationResult, { ok: false }>
  ) => void;
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

  setConnectionState: (state) => set({ connectionState: state }),

  setTelemetrySourceConnectionState: (sourceState) =>
    set((state) => ({
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
    })),

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
        logs: [log, ...state.logs].slice(0, 100),
      };
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

function mapRejectionDisposition(
  reason: Extract<PacketValidationResult, { ok: false }>["reason"]
): TelemetryEventDisposition {
  if (reason === "INVALID_SCHEMA_VERSION") return "SCHEMA_REJECTED";
  if (reason === "UNKNOWN_EVENT_TYPE") return "UNKNOWN_EVENT_REJECTED";
  if (reason === "UNKNOWN_SOURCE_NODE") return "UNKNOWN_NODE_REJECTED";
  if (reason === "UNKNOWN_LINK_ID") return "UNKNOWN_LINK_REJECTED";
  return "MALFORMED_REJECTED";
}
