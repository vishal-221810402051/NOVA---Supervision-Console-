import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState, TelemetryPacket } from "../types/telemetry";
import { useTelemetryStore } from "./telemetryStore";

const REMOTE_TIMESTAMP = "2020-01-01T00:00:00.000Z";
const initialState = useTelemetryStore.getInitialState();
let monotonicNowMs = 1000;

function makePacket({
  streamId = "PI_STREAM_A",
  globalSequenceNumber = 1,
  sourceSequenceNumber = globalSequenceNumber,
  timestampUtc = REMOTE_TIMESTAMP,
}: {
  streamId?: string;
  globalSequenceNumber?: number;
  sourceSequenceNumber?: number;
  timestampUtc?: string;
} = {}): TelemetryPacket {
  return {
    schema_version: "v1.0",
    stream_id: streamId,
    global_sequence_number: globalSequenceNumber,
    source_node_id: "esp32_main",
    source_sequence_number: sourceSequenceNumber,
    producer_timestamp_utc: timestampUtc,
    supervisor_received_utc: timestampUtc,
    timestamp_utc: timestampUtc,
    sequence_number: globalSequenceNumber,
    run_id: "TEST_RUN",
    node_id: "esp32_main",
    event_type: "NODE_HEALTH_TELEMETRY",
    payload: {
      node_id: "esp32_main",
      role: "MOTION_CONTROL",
      health_state: "HEALTHY",
      uptime_ms: 1000,
      firmware_version: "test-fw",
      status_message: "Healthy",
    },
  };
}

function accept(packet = makePacket()) {
  useTelemetryStore.getState().ingestPacket(packet);
}

function ageAt(nowMs: number) {
  monotonicNowMs = nowMs;
  useTelemetryStore.getState().ageRegistry();
}

beforeEach(() => {
  useTelemetryStore.setState(initialState, true);
  monotonicNowMs = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => monotonicNowMs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("telemetry transport freshness", () => {
  it("starts stale before an accepted packet", () => {
    const state = useTelemetryStore.getState();

    expect(state.isTelemetryStale).toBe(true);
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBeNull();
  });

  it("records local receipt time and preserves remote UTC for an accepted packet", () => {
    const timestampUtc = "2026-09-30T04:00:00.123456+00:00";
    accept(makePacket({ timestampUtc }));

    const state = useTelemetryStore.getState();
    expect(state.lastPacketAt).toBe(timestampUtc);
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(1000);
    expect(state.isTelemetryStale).toBe(false);
  });

  it("does not use an old remote timestamp to determine transport freshness", () => {
    accept(makePacket({ timestampUtc: "2000-01-01T00:00:00.000Z" }));
    ageAt(3999);

    expect(useTelemetryStore.getState().isTelemetryStale).toBe(false);
  });

  it("remains live through exactly 3000 ms of local monotonic silence", () => {
    accept();
    ageAt(4000);

    expect(useTelemetryStore.getState().isTelemetryStale).toBe(false);
  });

  it("becomes stale after more than 3000 ms of local monotonic silence", () => {
    accept();
    ageAt(4001);

    expect(useTelemetryStore.getState().isTelemetryStale).toBe(true);
  });

  it("returns live when the next packet is accepted after a timeout", () => {
    accept();
    ageAt(4001);
    monotonicNowMs = 5000;
    accept(makePacket({ globalSequenceNumber: 2 }));

    const state = useTelemetryStore.getState();
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(5000);
    expect(state.isTelemetryStale).toBe(false);
  });

  it("does not refresh freshness for a duplicate packet", () => {
    const packet = makePacket();
    accept(packet);
    ageAt(4001);
    monotonicNowMs = 5000;
    accept(packet);

    const state = useTelemetryStore.getState();
    expect(state.duplicatePackets).toBe(1);
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(1000);
    expect(state.isTelemetryStale).toBe(true);
  });

  it("does not refresh freshness for an out-of-order packet", () => {
    accept(makePacket({ globalSequenceNumber: 10 }));
    ageAt(4001);
    monotonicNowMs = 5000;
    accept(makePacket({ globalSequenceNumber: 9, sourceSequenceNumber: 11 }));

    const state = useTelemetryStore.getState();
    expect(state.outOfOrderPackets).toBe(1);
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(1000);
    expect(state.isTelemetryStale).toBe(true);
  });

  it.each([
    ["INVALID_JSON", "ERROR"],
    ["INVALID_SCHEMA_VERSION", "WARNING"],
  ] as const)("does not refresh freshness for %s rejection", (reason, severity) => {
    accept();
    ageAt(4001);
    monotonicNowMs = 5000;
    useTelemetryStore.getState().recordPacketRejection({
      ok: false,
      reason,
      severity,
      details: "Rejected test packet",
    });

    const state = useTelemetryStore.getState();
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(1000);
    expect(state.isTelemetryStale).toBe(true);
  });

  it.each(["CONNECTING", "RECONNECTING", "OFFLINE"] as ConnectionState[])(
    "invalidates freshness when connection state becomes %s",
    (connectionState) => {
      accept();
      useTelemetryStore.getState().setTelemetrySourceConnectionState(connectionState);

      const state = useTelemetryStore.getState();
      expect(state.lastAcceptedPacketReceiptMonotonicMs).toBeNull();
      expect(state.isTelemetryStale).toBe(true);
    }
  );

  it("does not become live from CONNECTED socket state alone", () => {
    useTelemetryStore.getState().setTelemetrySourceConnectionState("CONNECTED");

    const state = useTelemetryStore.getState();
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBeNull();
    expect(state.isTelemetryStale).toBe(true);
  });

  it("clears old receipt timing when connection statistics reset", () => {
    accept();
    useTelemetryStore.getState().resetConnectionStats();

    const state = useTelemetryStore.getState();
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBeNull();
    expect(state.isTelemetryStale).toBe(true);
  });

  it("returns live on the first accepted packet after reconnect", () => {
    accept();
    useTelemetryStore.getState().setTelemetrySourceConnectionState("RECONNECTING");
    useTelemetryStore.getState().resetConnectionStats();
    useTelemetryStore.getState().setTelemetrySourceConnectionState("CONNECTED");
    monotonicNowMs = 6000;
    accept(makePacket({ globalSequenceNumber: 2 }));

    const state = useTelemetryStore.getState();
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(6000);
    expect(state.isTelemetryStale).toBe(false);
  });

  it("refreshes freshness for an accepted packet that switches streams", () => {
    accept(makePacket({ streamId: "PI_STREAM_A", globalSequenceNumber: 10 }));
    ageAt(4001);
    monotonicNowMs = 5000;
    accept(makePacket({ streamId: "PI_STREAM_B", globalSequenceNumber: 1 }));

    const state = useTelemetryStore.getState();
    expect(state.streamSwitches).toBe(1);
    expect(state.lastAcceptedPacketReceiptMonotonicMs).toBe(5000);
    expect(state.isTelemetryStale).toBe(false);
  });
});
