import { validateTelemetryPacket } from "../state/packetValidator";
import type {
  PacketValidationResult,
  TelemetryPacket,
} from "../types/telemetry";
import type { RawTelemetrySourceContext } from "./telemetrySource";

export function handleRawTelemetryMessage(params: {
  raw: unknown;
  sourceContext: RawTelemetrySourceContext;
  ingestPacket: (packet: TelemetryPacket) => void;
  recordPacketRejection: (
    result: Extract<PacketValidationResult, { ok: false }>
  ) => void;
}): void {
  try {
    const decoded = decodeRawTelemetryMessage(params.raw, params.sourceContext);

    if (!decoded.ok) {
      params.recordPacketRejection(decoded.rejection);
      return;
    }

    const parsed = decoded.value;
    const result = validateTelemetryPacket(parsed);

    if (result.ok) {
      params.ingestPacket(result.packet);
      return;
    }

    params.recordPacketRejection(result);
  } catch {
    params.recordPacketRejection({
      ok: false,
      reason: "INVALID_JSON",
      severity: "ERROR",
      details: `Raw telemetry message from ${params.sourceContext.source_id} was not valid JSON`,
      raw: params.raw,
    });
  }
}

function decodeRawTelemetryMessage(
  raw: unknown,
  sourceContext: RawTelemetrySourceContext
):
  | { ok: true; value: unknown }
  | {
      ok: false;
      rejection: Extract<PacketValidationResult, { ok: false }>;
    } {
  if (typeof raw === "string") {
    return {
      ok: true,
      value: JSON.parse(raw),
    };
  }

  if (isRecord(raw)) {
    return {
      ok: true,
      value: raw,
    };
  }

  if (raw instanceof Blob || raw instanceof ArrayBuffer) {
    return unsupportedRawMessage(raw, sourceContext);
  }

  return unsupportedRawMessage(raw, sourceContext);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unsupportedRawMessage(
  raw: unknown,
  sourceContext: RawTelemetrySourceContext
): {
  ok: false;
  rejection: Extract<PacketValidationResult, { ok: false }>;
} {
  return {
    ok: false,
    rejection: {
      ok: false,
      reason: "INVALID_PAYLOAD_SHAPE",
      severity: "ERROR",
      details: `Unsupported raw telemetry message type from ${sourceContext.source_id}`,
      raw,
    },
  };
}
