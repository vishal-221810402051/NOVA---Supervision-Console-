import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PersistentReplaySummary,
  ReplayValidationStatus,
} from "../types/telemetry";
import {
  capturePersistentReplaySummary,
  deriveBackendHealthUrl,
} from "./backendHealth";

const CAPTURED_AT = "2026-09-28T12:00:00.000Z";

function makeSummary(
  status: ReplayValidationStatus = "PASS"
): PersistentReplaySummary {
  return {
    summary_schema_version: "1.0",
    replay_validation_status: status,
    persistent_replay_validated: status === "PASS",
    artifact_selected: status !== "PENDING",
    artifact_present: status !== "PENDING",
    artifact_valid: status === "PENDING" ? null : true,
    artifact_schema_version: status === "PENDING" ? null : "1.0",
    artifact_type:
      status === "PENDING" ? null : "NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT",
    validation_scope:
      status === "PENDING" ? null : "BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY",
    artifact_reference:
      status === "PENDING" ? null : "replay_results/replay_result.json",
    phase_id: status === "PENDING" ? null : "PHASE_7_2G_E_F_B",
    run_id: status === "PENDING" ? null : "EVIDENCE_TEST_RUN",
    identity_bound: status !== "PENDING",
    run_identity_match: status === "PENDING" ? null : status === "PASS",
    phase_identity_match: status === "PENDING" ? null : true,
    replay_result_generated_utc: status === "PENDING" ? null : CAPTURED_AT,
    replay_started_utc: status === "PENDING" ? null : CAPTURED_AT,
    replay_completed_utc: status === "PENDING" ? null : CAPTURED_AT,
    summary_generated_utc: CAPTURED_AT,
    segment_count: status === "PENDING" ? null : 9,
    total_events: status === "PENDING" ? null : 44074,
    summary_events_written: status === "PENDING" ? null : 44074,
    malformed_lines: status === "PENDING" ? null : 0,
    writer_errors: status === "PENDING" ? null : 0,
    persistent_events_dropped: status === "PENDING" ? null : 0,
    segment_filename_continuity: status === "PENDING" ? null : true,
    deterministic_order_verified: status === "PENDING" ? null : true,
    hash_verified: status === "PENDING" ? null : true,
    run_root_match: status === "PENDING" ? null : true,
    run_root_sha256: status === "PENDING" ? null : "a".repeat(64),
    failure_reasons: status === "FAIL" ? ["REPLAY_RUN_ID_MISMATCH"] : [],
    limitations: ["Hash verification is integrity detection only."],
    non_claims: {
      tamper_proof_storage: false,
      cryptographic_attestation: false,
      production_archive_certification: false,
      frontend_report_integration: false,
      fram_validation: false,
      actuator_control_readiness: false,
      clinical_readiness: false,
    },
    required_next_action: status === "PASS" ? null : "REVIEW_REPLAY_ARTIFACT_FAILURES",
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function captureWith(
  body: unknown,
  fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body))
) {
  return capturePersistentReplaySummary("ws://pi.local:8000/ws/telemetry", {
    fetchImpl: fetchImpl as typeof fetch,
    now: () => CAPTURED_AT,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("deriveBackendHealthUrl", () => {
  it("converts ws endpoints to http health URLs", () => {
    expect(deriveBackendHealthUrl("ws://pi.local:8000/ws/telemetry")).toBe(
      "http://pi.local:8000/health"
    );
  });

  it("converts wss endpoints to https health URLs", () => {
    expect(deriveBackendHealthUrl("wss://nova.example/ws/telemetry")).toBe(
      "https://nova.example/health"
    );
  });

  it("strips query and hash components", () => {
    expect(deriveBackendHealthUrl("ws://pi.local:8000/socket?q=1#fragment")).toBe(
      "http://pi.local:8000/health"
    );
  });

  it("rejects malformed endpoints", async () => {
    const fetchImpl = vi.fn();
    const result = await capturePersistentReplaySummary("not a URL", {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => CAPTURED_AT,
    });
    expect(result.report_data_status).toBe("REPORT_DATA_UNAVAILABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unsupported protocols", async () => {
    const fetchImpl = vi.fn();
    const result = await capturePersistentReplaySummary("https://pi.local/health", {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => CAPTURED_AT,
    });
    expect(result.report_data_status).toBe("REPORT_DATA_UNAVAILABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("capturePersistentReplaySummary", () => {
  it("maps network failures to unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network failed"));
    const result = await capturePersistentReplaySummary(
      "ws://pi.local:8000/ws/telemetry",
      { fetchImpl: fetchImpl as typeof fetch, now: () => CAPTURED_AT }
    );
    expect(result).toMatchObject({
      report_data_status: "REPORT_DATA_UNAVAILABLE",
      error_reason: "HEALTH_REQUEST_FAILED",
    });
  });

  it("aborts a request after 3000 ms", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      })
    );
    const capture = capturePersistentReplaySummary(
      "ws://pi.local:8000/ws/telemetry",
      { fetchImpl: fetchImpl as typeof fetch, now: () => CAPTURED_AT }
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(capture).resolves.toMatchObject({
      report_data_status: "REPORT_DATA_UNAVAILABLE",
      error_reason: "HEALTH_REQUEST_FAILED",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps non-2xx responses to unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const result = await capturePersistentReplaySummary(
      "ws://pi.local:8000/ws/telemetry",
      { fetchImpl: fetchImpl as typeof fetch, now: () => CAPTURED_AT }
    );
    expect(result).toMatchObject({ error_reason: "HEALTH_REQUEST_FAILED" });
  });

  it("maps invalid JSON to an invalid health response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
    });
    const result = await capturePersistentReplaySummary(
      "ws://pi.local:8000/ws/telemetry",
      { fetchImpl: fetchImpl as typeof fetch, now: () => CAPTURED_AT }
    );
    expect(result).toMatchObject({ error_reason: "HEALTH_RESPONSE_INVALID" });
  });

  it("reports a missing persistent replay summary", async () => {
    const result = await captureWith({ backend: "HEALTHY" });
    expect(result).toMatchObject({ error_reason: "REPLAY_SUMMARY_MISSING" });
  });

  it("rejects unsupported replay summary schemas", async () => {
    const result = await captureWith({
      persistent_replay_summary: {
        ...makeSummary(),
        summary_schema_version: "2.0",
      },
    });
    expect(result).toMatchObject({
      error_reason: "UNSUPPORTED_REPLAY_SUMMARY_SCHEMA",
    });
  });

  it.each(["PASS", "FAIL", "PENDING"] as ReplayValidationStatus[])(
    "accepts a structurally valid %s summary",
    async (status) => {
      const summary = makeSummary(status);
      const result = await captureWith({ persistent_replay_summary: summary });
      expect(result.report_data_status).toBe("AVAILABLE");
      if (result.report_data_status === "AVAILABLE") {
        expect(result.summary).toBe(summary);
        expect(result.summary.replay_validation_status).toBe(status);
      }
    }
  );

  it("tolerates additional unknown backend fields", async () => {
    const result = await captureWith({
      persistent_replay_summary: {
        ...makeSummary(),
        future_backend_field: { enabled: true },
      },
    });
    expect(result.report_data_status).toBe("AVAILABLE");
  });

  it("does not recompute the backend replay status", async () => {
    const summary = {
      ...makeSummary("FAIL"),
      persistent_replay_validated: true,
      hash_verified: true,
      run_root_match: true,
    };
    const result = await captureWith({ persistent_replay_summary: summary });
    expect(result.report_data_status).toBe("AVAILABLE");
    if (result.report_data_status === "AVAILABLE") {
      expect(result.summary.replay_validation_status).toBe("FAIL");
      expect(result.summary.persistent_replay_validated).toBe(true);
    }
  });
});
