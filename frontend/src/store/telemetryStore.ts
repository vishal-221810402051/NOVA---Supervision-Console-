import { create } from "zustand";
import type { TelemetryPacket } from "../types/telemetry";

type TelemetryState = {
  connected: boolean;
  lastPacketAt: string | null;
  systemHealth: any | null;
  chipStatus: any | null;
  powerHealth: any | null;
  logs: TelemetryPacket[];
  setConnected: (state: boolean) => void;
  ingestPacket: (packet: TelemetryPacket) => void;
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  connected: false,
  lastPacketAt: null,
  systemHealth: null,
  chipStatus: null,
  powerHealth: null,
  logs: [],

  setConnected: (state) => set({ connected: state }),

  ingestPacket: (packet) =>
    set((state) => {
      const updates: Partial<TelemetryState> = {
        lastPacketAt: packet.timestamp_utc,
        logs: [packet, ...state.logs].slice(0, 50),
      };

      if (packet.event_type === "SYSTEM_HEALTH_TELEMETRY") {
        updates.systemHealth = packet.payload;
      }

      if (packet.event_type === "CHIP_STATUS_TELEMETRY") {
        updates.chipStatus = packet.payload;
      }

      if (packet.event_type === "POWER_HEALTH_TELEMETRY") {
        updates.powerHealth = packet.payload;
      }

      return updates;
    }),
}));
