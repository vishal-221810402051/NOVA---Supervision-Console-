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

export const SIMULATOR_WEBSOCKET_SOURCE: Omit<
  TelemetrySourceStatus,
  "connection_state" | "last_connected_utc" | "last_error" | "reconnect_attempts"
> = {
  source_id: "simulator_websocket",
  display_name: "Simulator WebSocket",
  transport_kind: "WEBSOCKET",
  endpoint: "ws://127.0.0.1:8000/ws/telemetry",
  is_simulated: true,
};
