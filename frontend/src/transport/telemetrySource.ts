import type { ConnectionState } from "../types/telemetry";

export type TelemetrySourceKind =
  | "WEBSOCKET"
  | "UART"
  | "REPLAY_FILE"
  | "EVENT_STORE_REPLAY"
  | "TCP"
  | "SIMULATOR";

export type TelemetrySourceStatus = {
  source_id: string;
  display_name: string;
  transport_kind: TelemetrySourceKind;
  connection_state: ConnectionState;
  endpoint: string;
  is_simulated: boolean;
  last_connected_utc: string | null;
  last_error: string | null;
  reconnect_attempts: number;
};

export type RawTelemetrySourceContext = {
  source_id: string;
  transport_kind: TelemetrySourceKind;
  endpoint: string;
  is_simulated: boolean;
};

export const DEFAULT_TELEMETRY_WS_URL =
  "ws://127.0.0.1:8000/ws/telemetry";

function resolveTelemetryWsUrl() {
  const configuredUrl = import.meta.env.VITE_NOVA_SC_WS_URL?.trim();

  if (!configuredUrl) {
    return DEFAULT_TELEMETRY_WS_URL;
  }

  try {
    const parsedUrl = new URL(configuredUrl);

    if (parsedUrl.protocol === "ws:" || parsedUrl.protocol === "wss:") {
      return configuredUrl;
    }
  } catch {
    return DEFAULT_TELEMETRY_WS_URL;
  }

  return DEFAULT_TELEMETRY_WS_URL;
}

function isLocalTelemetryEndpoint(endpoint: string) {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

const resolvedEndpoint = resolveTelemetryWsUrl();
const isLocalEndpoint = isLocalTelemetryEndpoint(resolvedEndpoint);

export const SIMULATOR_WEBSOCKET_SOURCE: Omit<
  TelemetrySourceStatus,
  "connection_state" | "last_connected_utc" | "last_error" | "reconnect_attempts"
> = {
  source_id: isLocalEndpoint ? "simulator_websocket" : "pi_hardware_websocket",
  display_name: isLocalEndpoint ? "Simulator WebSocket" : "Pi Hardware WebSocket",
  transport_kind: "WEBSOCKET",
  endpoint: resolvedEndpoint,
  is_simulated: isLocalEndpoint,
};
