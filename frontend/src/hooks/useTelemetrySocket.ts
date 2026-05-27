import { useEffect } from "react";
import { useTelemetryStore } from "../store/telemetryStore";
import type { TelemetryPacket } from "../types/telemetry";

export function useTelemetrySocket() {
  const setConnected = useTelemetryStore((s) => s.setConnected);
  const ingestPacket = useTelemetryStore((s) => s.ingestPacket);

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/telemetry");

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const packet: TelemetryPacket = JSON.parse(event.data);
      ingestPacket(packet);
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [setConnected, ingestPacket]);
}
