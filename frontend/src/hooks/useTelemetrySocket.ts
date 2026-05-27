import { useEffect } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import type { TelemetryPacket } from "../types/telemetry";

const TELEMETRY_WS_URL = "ws://127.0.0.1:8000/ws/telemetry";
const RECONNECT_DELAY_MS = 2000;

let activeSocket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let agingTimer: number | null = null;
let activeSessionId = 0;
let subscriberCount = 0;

function isValidTelemetryPacket(packet: unknown): packet is TelemetryPacket {
  if (!packet || typeof packet !== "object") return false;

  const p = packet as Partial<TelemetryPacket>;

  return (
    p.schema_version === "v1.0" &&
    typeof p.timestamp_utc === "string" &&
    typeof p.sequence_number === "number" &&
    typeof p.node_id === "string" &&
    typeof p.event_type === "string" &&
    typeof p.payload === "object"
  );
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeActiveSocket() {
  if (!activeSocket) return;

  activeSocket.onopen = null;
  activeSocket.onmessage = null;
  activeSocket.onerror = null;
  activeSocket.onclose = null;

  if (
    activeSocket.readyState === WebSocket.CONNECTING ||
    activeSocket.readyState === WebSocket.OPEN
  ) {
    activeSocket.close();
  }

  activeSocket = null;
}

function ensureAgingTimer() {
  if (agingTimer !== null) return;

  agingTimer = window.setInterval(() => {
    useTelemetryStore.getState().ageRegistry();
  }, 1000);
}

function stopAgingTimer() {
  if (agingTimer !== null) {
    window.clearInterval(agingTimer);
    agingTimer = null;
  }
}

function connectTelemetrySocket(sessionId: number) {
  clearReconnectTimer();
  closeActiveSocket();

  useTelemetryStore.getState().setConnectionState("CONNECTING");

  const socket = new WebSocket(TELEMETRY_WS_URL);
  activeSocket = socket;

  socket.onopen = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    useTelemetryStore.getState().resetPacketStats();
    useTelemetryStore.getState().setConnectionState("CONNECTED");
  };

  socket.onmessage = (event) => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    try {
      const parsed = JSON.parse(event.data);

      if (isValidTelemetryPacket(parsed)) {
        useTelemetryStore.getState().ingestPacket(parsed);
      }
    } catch {
      useTelemetryStore.getState().setConnectionState("RECONNECTING");
    }
  };

  socket.onerror = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    useTelemetryStore.getState().setConnectionState("RECONNECTING");
  };

  socket.onclose = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    activeSocket = null;
    useTelemetryStore.getState().setConnectionState("RECONNECTING");
    clearReconnectTimer();

    reconnectTimer = window.setTimeout(() => {
      if (sessionId === activeSessionId && subscriberCount > 0) {
        connectTelemetrySocket(sessionId);
      }
    }, RECONNECT_DELAY_MS);
  };
}

export function useTelemetrySocket() {
  useEffect(() => {
    subscriberCount += 1;

    if (subscriberCount === 1) {
      activeSessionId += 1;
      ensureAgingTimer();
      connectTelemetrySocket(activeSessionId);
    }

    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);

      if (subscriberCount === 0) {
        activeSessionId += 1;
        clearReconnectTimer();
        closeActiveSocket();
        stopAgingTimer();
        useTelemetryStore.getState().setConnectionState("OFFLINE");
      }
    };
  }, []);
}
