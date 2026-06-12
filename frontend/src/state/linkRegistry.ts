import type {
  LinkHeartbeatPayload,
  LinkId,
  LinkState,
  LinkSyncPayload,
  NodeId,
  SyncState,
  ConnectionState,
  TransportKind,
} from "../types/telemetry";
import { normalizeNodeId } from "../types/telemetry";

export const LINK_IDS = {
  LAPTOP_PI: "link_laptop_pi",
  PI_MAIN: "link_pi_main",
  MAIN_SUB: "link_main_sub",
} as const;

export type LinkRegistryEntry = {
  link_id: LinkId;
  display_name: string;
  source_node_id: NodeId;
  target_node_id: NodeId;
  transport: TransportKind;
  link_state: LinkState;
  sync_state: SyncState;
  last_heartbeat_utc: string | null;
  heartbeat_age_ms: number | null;
  round_trip_latency_ms: number | null;
  missed_heartbeat_count: number;
  dropped_packet_count: number;
  retry_count: number;
  status_message: string;
};

export type LinkRegistry = Record<LinkId, LinkRegistryEntry>;

export function createInitialLinkRegistry(): LinkRegistry {
  return {
    [LINK_IDS.LAPTOP_PI]: linkEntry(
      LINK_IDS.LAPTOP_PI,
      "Laptop / Pi Gateway",
      "laptop_console",
      "pi_gateway",
      "WEBSOCKET"
    ),
    [LINK_IDS.PI_MAIN]: linkEntry(
      LINK_IDS.PI_MAIN,
      "Pi Gateway / MAIN ESP32",
      "pi_gateway",
      "esp32_main",
      "UART"
    ),
    [LINK_IDS.MAIN_SUB]: linkEntry(
      LINK_IDS.MAIN_SUB,
      "MAIN ESP32 / SUB ESP32",
      "esp32_main",
      "esp32_sub",
      "UART"
    ),
  };
}

export function updateLinkRegistryFromHeartbeat(
  registry: LinkRegistry,
  payload: LinkHeartbeatPayload,
  observedAtUtc?: string
): LinkRegistry {
  const current = registry[payload.link_id];
  if (!current) return registry;
  const heartbeatUtc = payload.last_seen_utc ?? observedAtUtc ?? new Date().toISOString();

  return {
    ...registry,
    [payload.link_id]: {
      ...current,
      link_state: payload.link_state,
      sync_state: payload.sync_state,
      last_heartbeat_utc: heartbeatUtc,
      heartbeat_age_ms: 0,
      round_trip_latency_ms: payload.round_trip_latency_ms,
      missed_heartbeat_count: payload.missed_heartbeat_count,
      status_message: `${payload.link_state} / ${payload.sync_state} reported by ${normalizeNodeId(payload.source_node_id)}`,
    },
  };
}

export function updateLinkRegistryFromSync(
  registry: LinkRegistry,
  payload: LinkSyncPayload
): LinkRegistry {
  const current = registry[payload.link_id];
  if (!current) return registry;

  const statusMessage =
    payload.sync_state === "SYNCED"
      ? "Stream synchronized"
      : payload.sync_state === "DESYNCED"
        ? "Stream synchronization fault"
        : "Stream synchronization unknown";

  return {
    ...registry,
    [payload.link_id]: {
      ...current,
      sync_state: payload.sync_state,
      status_message: `${statusMessage} reported by ${normalizeNodeId(payload.source_node_id)}`,
    },
  };
}

export function updateLinkRegistryFromWebSocket(
  registry: LinkRegistry,
  connectionState: ConnectionState,
  observedAtUtc: string
): LinkRegistry {
  const current = registry[LINK_IDS.LAPTOP_PI];
  if (!current) return registry;

  const connected = connectionState === "CONNECTED";
  const recovering = connectionState === "CONNECTING" || connectionState === "RECONNECTING";

  return {
    ...registry,
    [LINK_IDS.LAPTOP_PI]: {
      ...current,
      link_state: connected
        ? "LINK_HEALTHY"
        : recovering
          ? "LINK_RECOVERING"
          : "LINK_OFFLINE",
      sync_state: connected ? "SYNCED" : "UNKNOWN",
      last_heartbeat_utc: connected ? observedAtUtc : current.last_heartbeat_utc,
      heartbeat_age_ms: connected ? 0 : current.heartbeat_age_ms,
      missed_heartbeat_count: connected ? 0 : current.missed_heartbeat_count,
      status_message: connected
        ? "WebSocket-supervised laptop / Pi link is connected"
        : recovering
          ? `WebSocket-supervised laptop / Pi link is ${connectionState.toLowerCase()}`
          : "WebSocket-supervised laptop / Pi link is offline",
    },
  };
}

export function getLinkRegistrySummary(registry: LinkRegistry) {
  const links = Object.values(registry);

  return {
    total: links.length,
    healthy: links.filter((l) => l.link_state === "LINK_HEALTHY").length,
    degraded: links.filter((l) => l.link_state === "LINK_DEGRADED").length,
    offline: links.filter((l) => l.link_state === "LINK_OFFLINE").length,
    recovering: links.filter((l) => l.link_state === "LINK_RECOVERING").length,
    synced: links.filter((l) => l.sync_state === "SYNCED").length,
    desynced: links.filter((l) => l.sync_state === "DESYNCED").length,
    unknown: links.filter((l) => l.sync_state === "UNKNOWN").length,
  };
}

function linkEntry(
  link_id: LinkId,
  display_name: string,
  source_node_id: NodeId,
  target_node_id: NodeId,
  transport: TransportKind
): LinkRegistryEntry {
  return {
    link_id,
    display_name,
    source_node_id,
    target_node_id,
    transport,
    link_state: "LINK_OFFLINE",
    sync_state: "UNKNOWN",
    last_heartbeat_utc: null,
    heartbeat_age_ms: null,
    round_trip_latency_ms: null,
    missed_heartbeat_count: 0,
    dropped_packet_count: 0,
    retry_count: 0,
    status_message: "Awaiting heartbeat",
  };
}
