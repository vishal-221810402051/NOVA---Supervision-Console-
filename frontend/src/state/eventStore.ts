import type {
  LogSeverity,
  PacketRejectionReason,
  TelemetryPacket,
} from "../types/telemetry";

export type TelemetryEventDisposition =
  | "ACCEPTED"
  | "SCHEMA_REJECTED"
  | "DUPLICATE_REJECTED"
  | "OUT_OF_ORDER_REJECTED"
  | "SEQUENCE_GAP_ACCEPTED"
  | "SEQUENCE_RESET_ACCEPTED"
  | "STREAM_SWITCH_ACCEPTED"
  | "UNKNOWN_NODE_REJECTED"
  | "UNKNOWN_EVENT_REJECTED"
  | "UNKNOWN_LINK_REJECTED"
  | "MALFORMED_REJECTED";

export type TelemetryEventKind =
  | "TELEMETRY_PACKET"
  | "PACKET_REJECTION"
  | "INTEGRITY_ANOMALY";

export type TelemetryEventSourceType =
  | "TRANSPORT"
  | "VALIDATOR"
  | "STORE_INTEGRITY";

export type TelemetryEventRecord = {
  event_id: string;
  event_store_sequence: number;
  event_timestamp_utc: string;
  event_kind: TelemetryEventKind;
  disposition: TelemetryEventDisposition;
  source_type: TelemetryEventSourceType;
  stream_id: string | null;
  source_node_id: string | null;
  global_sequence_number: number | null;
  source_sequence_number: number | null;
  event_type: string | null;
  packet?: TelemetryPacket;
  rejection_reason?: PacketRejectionReason;
  severity: LogSeverity;
  details: string;
  integrity_flags?: string[];
};

export type EventStoreSummary = {
  max_events: number;
  current_events: number;
  latest_event_store_sequence: number;
  dropped_old_events: number;
  accepted: number;
  rejected: number;
  ignored: number;
  by_disposition: Record<TelemetryEventDisposition, number>;
};

export type TelemetryEventInput = Omit<
  TelemetryEventRecord,
  "event_id" | "event_store_sequence" | "event_timestamp_utc"
>;

export const DEFAULT_EVENT_STORE_MAX_EVENTS = 5000;

const EMPTY_DISPOSITION_COUNTS: Record<TelemetryEventDisposition, number> = {
  ACCEPTED: 0,
  SCHEMA_REJECTED: 0,
  DUPLICATE_REJECTED: 0,
  OUT_OF_ORDER_REJECTED: 0,
  SEQUENCE_GAP_ACCEPTED: 0,
  SEQUENCE_RESET_ACCEPTED: 0,
  STREAM_SWITCH_ACCEPTED: 0,
  UNKNOWN_NODE_REJECTED: 0,
  UNKNOWN_EVENT_REJECTED: 0,
  UNKNOWN_LINK_REJECTED: 0,
  MALFORMED_REJECTED: 0,
};

export function createTelemetryEventRecord(params: {
  sequence: number;
  input: TelemetryEventInput;
  timestampUtc?: string;
}): TelemetryEventRecord {
  const eventTimestampUtc = params.timestampUtc ?? new Date().toISOString();

  return {
    ...params.input,
    event_id: `EVT_${params.sequence}_${eventTimestampUtc}`,
    event_store_sequence: params.sequence,
    event_timestamp_utc: eventTimestampUtc,
  };
}

export function appendBoundedEvent(params: {
  events: TelemetryEventRecord[];
  event: TelemetryEventRecord;
  maxEvents: number;
  droppedOldEvents: number;
}): {
  events: TelemetryEventRecord[];
  droppedOldEvents: number;
} {
  const nextEvents = [...params.events, params.event];
  const overflow = Math.max(0, nextEvents.length - params.maxEvents);

  if (overflow === 0) {
    return {
      events: nextEvents,
      droppedOldEvents: params.droppedOldEvents,
    };
  }

  return {
    events: nextEvents.slice(overflow),
    droppedOldEvents: params.droppedOldEvents + overflow,
  };
}

export function getEventStoreSummary(params: {
  events: TelemetryEventRecord[];
  maxEvents: number;
  latestSequence: number;
  droppedOldEvents: number;
}): EventStoreSummary {
  const byDisposition = { ...EMPTY_DISPOSITION_COUNTS };

  for (const event of params.events) {
    byDisposition[event.disposition] += 1;
  }

  return {
    max_events: params.maxEvents,
    current_events: params.events.length,
    latest_event_store_sequence: params.latestSequence,
    dropped_old_events: params.droppedOldEvents,
    accepted:
      byDisposition.ACCEPTED +
      byDisposition.SEQUENCE_GAP_ACCEPTED +
      byDisposition.SEQUENCE_RESET_ACCEPTED +
      byDisposition.STREAM_SWITCH_ACCEPTED,
    rejected:
      byDisposition.SCHEMA_REJECTED +
      byDisposition.UNKNOWN_NODE_REJECTED +
      byDisposition.UNKNOWN_EVENT_REJECTED +
      byDisposition.UNKNOWN_LINK_REJECTED +
      byDisposition.MALFORMED_REJECTED,
    ignored:
      byDisposition.DUPLICATE_REJECTED +
      byDisposition.OUT_OF_ORDER_REJECTED,
    by_disposition: byDisposition,
  };
}
