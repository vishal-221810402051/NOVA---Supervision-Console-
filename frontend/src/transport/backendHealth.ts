import type {
  PersistentReplayCapture,
  PersistentReplayCaptureErrorReason,
  PersistentReplayNonClaims,
  PersistentReplaySummary,
  ReplayValidationStatus,
} from "../types/telemetry";

const HEALTH_TIMEOUT_MS = 3000;
const SUPPORTED_REPLAY_SUMMARY_SCHEMA = "1.0";

const REPLAY_STATUSES: ReplayValidationStatus[] = ["PASS", "FAIL", "PENDING"];
const REQUIRED_NON_CLAIMS: Array<keyof PersistentReplayNonClaims> = [
  "tamper_proof_storage",
  "cryptographic_attestation",
  "production_archive_certification",
  "frontend_report_integration",
  "fram_validation",
  "actuator_control_readiness",
  "clinical_readiness",
];

type FetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasRequiredNonClaims(value: unknown): value is PersistentReplayNonClaims {
  if (!isRecord(value)) return false;
  return REQUIRED_NON_CLAIMS.every((key) => value[key] === false);
}

export function deriveBackendHealthUrl(websocketEndpoint: string): string | null {
  if (typeof websocketEndpoint !== "string" || websocketEndpoint.trim() === "") {
    return null;
  }

  try {
    const url = new URL(websocketEndpoint);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else {
      return null;
    }
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isPersistentReplaySummary(
  value: unknown
): value is PersistentReplaySummary {
  if (!isRecord(value)) return false;

  return (
    value.summary_schema_version === SUPPORTED_REPLAY_SUMMARY_SCHEMA &&
    typeof value.replay_validation_status === "string" &&
    REPLAY_STATUSES.includes(value.replay_validation_status as ReplayValidationStatus) &&
    typeof value.persistent_replay_validated === "boolean" &&
    typeof value.artifact_selected === "boolean" &&
    typeof value.artifact_present === "boolean" &&
    isBooleanOrNull(value.artifact_valid) &&
    isStringOrNull(value.artifact_schema_version) &&
    isStringOrNull(value.artifact_type) &&
    isStringOrNull(value.validation_scope) &&
    isStringOrNull(value.artifact_reference) &&
    isStringOrNull(value.phase_id) &&
    isStringOrNull(value.run_id) &&
    typeof value.identity_bound === "boolean" &&
    isBooleanOrNull(value.run_identity_match) &&
    isBooleanOrNull(value.phase_identity_match) &&
    isStringOrNull(value.replay_result_generated_utc) &&
    isStringOrNull(value.replay_started_utc) &&
    isStringOrNull(value.replay_completed_utc) &&
    typeof value.summary_generated_utc === "string" &&
    isNumberOrNull(value.segment_count) &&
    isNumberOrNull(value.total_events) &&
    isNumberOrNull(value.summary_events_written) &&
    isNumberOrNull(value.malformed_lines) &&
    isNumberOrNull(value.writer_errors) &&
    isNumberOrNull(value.persistent_events_dropped) &&
    isBooleanOrNull(value.segment_filename_continuity) &&
    isBooleanOrNull(value.deterministic_order_verified) &&
    isBooleanOrNull(value.hash_verified) &&
    isBooleanOrNull(value.run_root_match) &&
    isStringOrNull(value.run_root_sha256) &&
    isStringArray(value.failure_reasons) &&
    isStringArray(value.limitations) &&
    hasRequiredNonClaims(value.non_claims) &&
    isStringOrNull(value.required_next_action)
  );
}

function unavailableCapture(
  capturedAtUtc: string,
  errorReason: PersistentReplayCaptureErrorReason
): PersistentReplayCapture {
  return {
    report_data_status: "REPORT_DATA_UNAVAILABLE",
    source: "BACKEND_HEALTH",
    captured_at_utc: capturedAtUtc,
    error_reason: errorReason,
    summary: null,
  };
}

export async function capturePersistentReplaySummary(
  websocketEndpoint: string,
  options: FetchOptions = {}
): Promise<PersistentReplayCapture> {
  const capturedAtUtc = (options.now ?? (() => new Date().toISOString()))();
  const healthUrl = deriveBackendHealthUrl(websocketEndpoint);
  if (!healthUrl) {
    return unavailableCapture(capturedAtUtc, "HEALTH_REQUEST_FAILED");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await (options.fetchImpl ?? fetch)(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return unavailableCapture(capturedAtUtc, "HEALTH_REQUEST_FAILED");
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    return unavailableCapture(capturedAtUtc, "HEALTH_REQUEST_FAILED");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    clearTimeout(timeoutId);
    return unavailableCapture(
      capturedAtUtc,
      controller.signal.aborted ? "HEALTH_REQUEST_FAILED" : "HEALTH_RESPONSE_INVALID"
    );
  }
  clearTimeout(timeoutId);

  if (!isRecord(body)) {
    return unavailableCapture(capturedAtUtc, "HEALTH_RESPONSE_INVALID");
  }
  if (!("persistent_replay_summary" in body) || body.persistent_replay_summary == null) {
    return unavailableCapture(capturedAtUtc, "REPLAY_SUMMARY_MISSING");
  }

  const summary = body.persistent_replay_summary;
  if (!isRecord(summary)) {
    return unavailableCapture(capturedAtUtc, "HEALTH_RESPONSE_INVALID");
  }
  if (
    typeof summary.summary_schema_version === "string" &&
    summary.summary_schema_version !== SUPPORTED_REPLAY_SUMMARY_SCHEMA
  ) {
    return unavailableCapture(capturedAtUtc, "UNSUPPORTED_REPLAY_SUMMARY_SCHEMA");
  }
  if (!isPersistentReplaySummary(summary)) {
    return unavailableCapture(capturedAtUtc, "HEALTH_RESPONSE_INVALID");
  }

  return {
    report_data_status: "AVAILABLE",
    source: "BACKEND_HEALTH",
    captured_at_utc: capturedAtUtc,
    error_reason: null,
    summary,
  };
}
