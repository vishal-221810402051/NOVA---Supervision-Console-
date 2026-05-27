import { create } from "zustand";
import type {
  ChipStatusPayload,
  ConnectionState,
  EngineeringLog,
  PowerHealthPayload,
  SystemHealthPayload,
  TelemetryPacket,
} from "../types/telemetry";

type TelemetryState = {
  connectionState: ConnectionState;
  lastPacketAt: string | null;
  packetCount: number;
  lastSequenceNumber: number | null;
  missedPackets: number;
  systemHealth: SystemHealthPayload | null;
  chipStatus: ChipStatusPayload | null;
  powerHealth: PowerHealthPayload | null;
  logs: EngineeringLog[];

  setConnectionState: (state: ConnectionState) => void;
  ingestPacket: (packet: TelemetryPacket) => void;
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
  lastSequenceNumber: null,
  missedPackets: 0,
  systemHealth: null,
  chipStatus: null,
  powerHealth: null,
  logs: [],

  setConnectionState: (state) => set({ connectionState: state }),

  ingestPacket: (packet) =>
    set((state) => {
      const expectedNext =
        state.lastSequenceNumber === null
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

      return {
        lastPacketAt: packet.timestamp_utc,
        packetCount: state.packetCount + 1,
        lastSequenceNumber: packet.sequence_number,
        missedPackets: state.missedPackets + missed,
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
        logs: [log, ...state.logs].slice(0, 100),
      };
    }),
}));
