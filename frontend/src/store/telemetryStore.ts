import { create } from "zustand";
import type {
  ChipStatusPayload,
  ConnectionState,
  EngineeringLog,
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
  updateRegistryFromPowerHealth,
  updateRegistryFromSystemHealth,
  type DeviceRegistry,
} from "../state/deviceRegistry";

type TelemetryState = {
  connectionState: ConnectionState;
  lastPacketAt: string | null;
  packetCount: number;
  packetRateHz: number;
  packetWindow: number[];
  lastSequenceNumber: number | null;
  lastAcceptedSequenceNumber: number | null;
  missedPackets: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceResets: number;
  sequenceGaps: number;
  recentPacketKeys: string[];
  systemHealth: SystemHealthPayload | null;
  chipStatus: ChipStatusPayload | null;
  powerHealth: PowerHealthPayload | null;
  deviceRegistry: DeviceRegistry;
  registrySummary: ReturnType<typeof getRegistrySummary>;
  globalHealth: ReturnType<typeof getGlobalSystemHealth>;
  isTelemetryStale: boolean;
  logs: EngineeringLog[];

  setConnectionState: (state: ConnectionState) => void;
  ingestPacket: (packet: TelemetryPacket) => void;
  ageRegistry: () => void;
  resetPacketStats: () => void;
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
  missedPackets: 0,
  duplicatePackets: 0,
  outOfOrderPackets: 0,
  sequenceResets: 0,
  sequenceGaps: 0,
  recentPacketKeys: [],
  systemHealth: null,
  chipStatus: null,
  powerHealth: null,
  deviceRegistry: createInitialDeviceRegistry(),
  registrySummary: getRegistrySummary(createInitialDeviceRegistry()),
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

  ingestPacket: (packet) =>
    set((state) => {
      const now = Date.now();
      const packetWindow = [...state.packetWindow, now].filter(
        (timestamp) => now - timestamp <= 5000
      );

      const packetRateHz = packetWindow.length / 5;
      const packetKey = getPacketKey(packet);
      const duplicateDetected = state.recentPacketKeys.includes(packetKey);
      const sequenceResetDetected =
        state.lastAcceptedSequenceNumber !== null &&
        packet.sequence_number <= 5 &&
        state.lastAcceptedSequenceNumber > 20;
      const outOfOrderDetected =
        !sequenceResetDetected &&
        state.lastAcceptedSequenceNumber !== null &&
        packet.sequence_number < state.lastAcceptedSequenceNumber;

      const baseObservedUpdate = {
        packetCount: state.packetCount + 1,
        packetWindow,
        packetRateHz,
        lastSequenceNumber: packet.sequence_number,
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
        state.lastAcceptedSequenceNumber === null || sequenceResetDetected
          ? packet.sequence_number
          : state.lastAcceptedSequenceNumber + 1;

      const gap =
        packet.sequence_number > expectedNext
          ? packet.sequence_number - expectedNext
          : 0;

      let deviceRegistry = state.deviceRegistry;

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

      const normalLog: EngineeringLog = {
        timestamp_utc: packet.timestamp_utc,
        node_id: packet.node_id,
        event_type: packet.event_type,
        sequence_number: packet.sequence_number,
        severity: getSeverity(packet),
        message: `${packet.event_type} received from ${packet.node_id}`,
      };

      const anomalyLogs: EngineeringLog[] = [];

      if (sequenceResetDetected) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `SEQUENCE_RESET_DETECTED accepted=${state.lastAcceptedSequenceNumber} new=${packet.sequence_number}`
          )
        );
      }

      if (gap > 0) {
        anomalyLogs.push(
          buildAnomalyLog(
            packet,
            "WARNING",
            `SEQUENCE_GAP_DETECTED gap=${gap} expected=${expectedNext} received=${packet.sequence_number}`
          )
        );
      }

      const recentPacketKeys = sequenceResetDetected
        ? [packetKey]
        : [...state.recentPacketKeys, packetKey].slice(-300);

      return {
        ...baseObservedUpdate,
        lastPacketAt: packet.timestamp_utc,
        lastAcceptedSequenceNumber: packet.sequence_number,
        missedPackets: state.missedPackets + gap,
        duplicatePackets: state.duplicatePackets,
        outOfOrderPackets: state.outOfOrderPackets,
        sequenceResets: sequenceResetDetected
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
        deviceRegistry,
        registrySummary: getRegistrySummary(deviceRegistry),
        globalHealth: getGlobalSystemHealth(deviceRegistry),
        isTelemetryStale: false,
        logs: [...anomalyLogs, normalLog, ...state.logs].slice(0, 100),
      };
    }),
}));

function getPacketKey(packet: TelemetryPacket) {
  return `${packet.run_id}:${packet.node_id}:${packet.event_type}:${packet.sequence_number}`;
}

function buildAnomalyLog(
  packet: TelemetryPacket,
  severity: EngineeringLog["severity"],
  message: string
): EngineeringLog {
  return {
    timestamp_utc: packet.timestamp_utc,
    node_id: packet.node_id,
    event_type: packet.event_type,
    sequence_number: packet.sequence_number,
    severity,
    message,
  };
}
