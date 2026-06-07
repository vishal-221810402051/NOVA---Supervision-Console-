import type {
  LinkHeartbeatPayload,
  LinkId,
  LinkState,
  LinkSyncPayload,
  NodeId,
  SyncState,
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
  payload: LinkHeartbeatPayload
): LinkRegistry {
  const current = registry[payload.link_id];
  if (!current) return registry;

  return {
    ...registry,
    [payload.link_id]: {
      ...current,
      source_node_id: normalizeNodeId(payload.source_node_id),
      target_node_id: normalizeNodeId(payload.target_node_id),
      link_state: payload.link_state,
      sync_state: payload.sync_state,
      last_heartbeat_utc: payload.last_seen_utc,
      heartbeat_age_ms: 0,
      round_trip_latency_ms: payload.round_trip_latency_ms,
      missed_heartbeat_count: payload.missed_heartbeat_count,
      status_message: `${payload.link_state} / ${payload.sync_state}`,
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
      source_node_id: normalizeNodeId(payload.source_node_id),
      target_node_id: normalizeNodeId(payload.target_node_id),
      sync_state: payload.sync_state,
      status_message: statusMessage,
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
