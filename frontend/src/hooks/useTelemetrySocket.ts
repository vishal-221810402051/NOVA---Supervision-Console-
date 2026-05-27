import { useEffect } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import type { TelemetryPacket } from "../types/telemetry";

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

export function useTelemetrySocket() {
  const setConnectionState = useTelemetryStore((s) => s.setConnectionState);
  const ingestPacket = useTelemetryStore((s) => s.ingestPacket);

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      setConnectionState("CONNECTING");
      socket = new WebSocket("ws://127.0.0.1:8000/ws/telemetry");

      socket.onopen = () => setConnectionState("CONNECTED");

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (isValidTelemetryPacket(parsed)) {
            ingestPacket(parsed);
          }
        } catch {
          setConnectionState("RECONNECTING");
        }
      };

      socket.onerror = () => {
        setConnectionState("RECONNECTING");
      };

      socket.onclose = () => {
        setConnectionState("RECONNECTING");

        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 2000);
      };
    };

    connect();

    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
      setConnectionState("OFFLINE");
    };
  }, [setConnectionState, ingestPacket]);
}
