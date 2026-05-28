import { useEffect } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import { handleRawTelemetryMessage } from "../transport/ingestionPipeline";
import { SIMULATOR_WEBSOCKET_SOURCE } from "../transport/telemetrySource";

const TELEMETRY_WS_URL = SIMULATOR_WEBSOCKET_SOURCE.endpoint;
const RECONNECT_DELAY_MS = 2000;

let activeSocket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let agingTimer: number | null = null;
let activeSessionId = 0;
let subscriberCount = 0;

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

  useTelemetryStore.getState().setTelemetrySourceConnectionState("CONNECTING");

  const socket = new WebSocket(TELEMETRY_WS_URL);
  activeSocket = socket;

  socket.onopen = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    useTelemetryStore.getState().resetConnectionStats();
    useTelemetryStore.getState().resetTelemetrySourceReconnectAttempts();
    useTelemetryStore.getState().setTelemetrySourceConnectionState("CONNECTED");
  };

  socket.onmessage = (event) => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    const store = useTelemetryStore.getState();

    handleRawTelemetryMessage({
      raw: event.data,
      sourceContext: {
        source_id: SIMULATOR_WEBSOCKET_SOURCE.source_id,
        transport_kind: SIMULATOR_WEBSOCKET_SOURCE.transport_kind,
        endpoint: TELEMETRY_WS_URL,
        is_simulated: SIMULATOR_WEBSOCKET_SOURCE.is_simulated,
      },
      ingestPacket: store.ingestPacket,
      recordPacketRejection: store.recordPacketRejection,
    });
  };

  socket.onerror = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    useTelemetryStore.getState().setTelemetrySourceError("WebSocket transport error");
    useTelemetryStore.getState().setTelemetrySourceConnectionState("RECONNECTING");
  };

  socket.onclose = () => {
    if (sessionId !== activeSessionId || socket !== activeSocket) return;

    activeSocket = null;
    useTelemetryStore.getState().setTelemetrySourceConnectionState("RECONNECTING");
    useTelemetryStore.getState().incrementTelemetrySourceReconnectAttempts();
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
        useTelemetryStore.getState().setTelemetrySourceConnectionState("OFFLINE");
      }
    };
  }, []);
}
