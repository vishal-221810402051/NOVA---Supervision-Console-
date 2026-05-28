import { create } from "zustand";
import type {
  ChipStatusPayload,
  ConnectionState,
  EngineeringLog,
  GatewayHealthPayload,
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

type TelemetryState = {
  connectionState: ConnectionState;
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
  ingestPacket: (packet: TelemetryPacket) => void;
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
      packetRateHz: 0,
      packetWindow: [],
      logs: [],
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
        return {
          ...baseObservedUpdate,
          duplicatePackets: state.duplicatePackets + 1,
          logs: [
            buildAnomalyLog(packet, "WARNING", `DUPLICATE_PACKET_IGNORED key=${packetKey}`),
            ...state.logs,
          ].slice(0, 100),
        };
      }

      if (outOfOrderDetected) {
        return {
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
          packet.payload
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

      return {
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
