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
  missedPackets: number;
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
  missedPackets: 0,
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
      missedPackets: 0,
      packetRateHz: 0,
      packetWindow: [],
      logs: [],
    }),

  ingestPacket: (packet) =>
    set((state) => {
      const sequenceResetDetected =
        state.lastSequenceNumber !== null &&
        packet.sequence_number <= state.lastSequenceNumber;

      const expectedNext =
        state.lastSequenceNumber === null || sequenceResetDetected
          ? packet.sequence_number
          : state.lastSequenceNumber + 1;

      const missed =
        packet.sequence_number > expectedNext
          ? packet.sequence_number - expectedNext
          : 0;

      const log: EngineeringLog = {
        timestamp_utc: packet.timestamp_utc,
        node_id: packet.node_id,
        event_type: packet.event_type,
        sequence_number: packet.sequence_number,
        severity: getSeverity(packet),
        message: `${packet.event_type} received from ${packet.node_id}`,
      };

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

      const now = Date.now();
      const packetWindow = [...state.packetWindow, now].filter(
        (timestamp) => now - timestamp <= 5000
      );

      const packetRateHz = packetWindow.length / 5;

      return {
        lastPacketAt: packet.timestamp_utc,
        packetCount: state.packetCount + 1,
        packetWindow,
        packetRateHz,
        lastSequenceNumber: packet.sequence_number,
        missedPackets: sequenceResetDetected
          ? state.missedPackets
          : state.missedPackets + missed,
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
        logs: [log, ...state.logs].slice(0, 100),
      };
    }),
}));
