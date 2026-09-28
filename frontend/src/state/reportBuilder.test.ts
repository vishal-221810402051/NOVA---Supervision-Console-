import { describe, expect, it } from "vitest";
import type {
  PersistentEvidenceSummary,
  PersistentReplayCapture,
  PersistentReplaySummary,
  ReplayValidationStatus,
} from "../types/telemetry";
import type { EventStoreSummary } from "./eventStore";
import {
  buildPersistentEvidenceSummary,
  buildPersistentReplayReportFields,
  NOVA_SC_REPORT_SCHEMA_VERSION,
  NOVA_SC_REPORT_VERSION,
} from "./reportBuilder";

const CAPTURED_AT = "2026-09-28T12:00:00.000Z";

function makeSummary(
  status: ReplayValidationStatus = "PASS"
): PersistentReplaySummary {
  return {
    summary_schema_version: "1.0",
    replay_validation_status: status,
    persistent_replay_validated: status === "PASS",
    artifact_selected: true,
    artifact_present: true,
    artifact_valid: true,
    artifact_schema_version: "1.0",
    artifact_type: "NOVA_SC_PERSISTENT_EVIDENCE_REPLAY_RESULT",
    validation_scope: "BACKEND_PERSISTENT_EVIDENCE_OFFLINE_REPLAY",
    artifact_reference: "replay_results/replay_result.json",
    phase_id: "PHASE_7_2G_E_F_B",
    run_id: "EVIDENCE_TEST_RUN",
    identity_bound: true,
    run_identity_match: status !== "FAIL",
    phase_identity_match: true,
    replay_result_generated_utc: CAPTURED_AT,
    replay_started_utc: CAPTURED_AT,
    replay_completed_utc: CAPTURED_AT,
    summary_generated_utc: CAPTURED_AT,
    segment_count: 9,
    total_events: 44074,
    summary_events_written: 44074,
    malformed_lines: 0,
    writer_errors: 0,
    persistent_events_dropped: 0,
    segment_filename_continuity: true,
    deterministic_order_verified: true,
    hash_verified: true,
    run_root_match: true,
    run_root_sha256: "b".repeat(64),
    failure_reasons: status === "FAIL" ? ["REPLAY_RUN_ID_MISMATCH"] : [],
    limitations: [
      "SHA-256 verification detects mismatch but is not cryptographic attestation.",
    ],
    non_claims: {
      tamper_proof_storage: false,
      cryptographic_attestation: false,
      production_archive_certification: false,
      frontend_report_integration: false,
      fram_validation: false,
      actuator_control_readiness: false,
      clinical_readiness: false,
    },
    required_next_action:
      status === "PASS" ? null : "REVIEW_REPLAY_ARTIFACT_FAILURES",
  };
}

function availableCapture(
  summary: PersistentReplaySummary
): PersistentReplayCapture {
  return {
    report_data_status: "AVAILABLE",
    source: "BACKEND_HEALTH",
    captured_at_utc: CAPTURED_AT,
    error_reason: null,
    summary,
  };
}

describe("buildPersistentReplayReportFields", () => {
  it("exports a PASS summary unchanged", () => {
    const summary = makeSummary("PASS");
    const fields = buildPersistentReplayReportFields(availableCapture(summary));
    expect(fields.persistent_replay_summary).toBe(summary);
    expect(fields.persistent_replay_summary?.replay_validation_status).toBe("PASS");
  });

  it("preserves FAIL reasons", () => {
    const summary = makeSummary("FAIL");
    const fields = buildPersistentReplayReportFields(availableCapture(summary));
    expect(fields.persistent_replay_summary?.failure_reasons).toEqual([
      "REPLAY_RUN_ID_MISMATCH",
    ]);
  });

  it("preserves the PENDING next action", () => {
    const summary = makeSummary("PENDING");
    const fields = buildPersistentReplayReportFields(availableCapture(summary));
    expect(fields.persistent_replay_summary?.replay_validation_status).toBe("PENDING");
    expect(fields.persistent_replay_summary?.required_next_action).toBe(
      "REVIEW_REPLAY_ARTIFACT_FAILURES"
    );
  });

  it("keeps unavailable report data separate from replay status", () => {
    const capture: PersistentReplayCapture = {
      report_data_status: "REPORT_DATA_UNAVAILABLE",
      source: "BACKEND_HEALTH",
      captured_at_utc: CAPTURED_AT,
      error_reason: "HEALTH_REQUEST_FAILED",
      summary: null,
    };
    const fields = buildPersistentReplayReportFields(capture);
    expect(fields.persistent_replay_summary).toBeNull();
    expect(fields.persistent_replay_capture).toEqual({
      report_data_status: "REPORT_DATA_UNAVAILABLE",
      source: "BACKEND_HEALTH",
      captured_at_utc: CAPTURED_AT,
      error_reason: "HEALTH_REQUEST_FAILED",
    });
  });

  it("preserves limitations and non-claims exactly", () => {
    const summary = makeSummary();
    const fields = buildPersistentReplayReportFields(availableCapture(summary));
    expect(fields.persistent_replay_summary?.limitations).toBe(summary.limitations);
    expect(fields.persistent_replay_summary?.non_claims).toBe(summary.non_claims);
  });

  it("copies run-root and hash fields without recomputation", () => {
    const summary = {
      ...makeSummary(),
      run_root_sha256: "not-recomputed",
      hash_verified: false,
    };
    const fields = buildPersistentReplayReportFields(availableCapture(summary));
    expect(fields.persistent_replay_summary?.run_root_sha256).toBe("not-recomputed");
    expect(fields.persistent_replay_summary?.hash_verified).toBe(false);
  });

  it("uses report schema version v1.2", () => {
    expect(NOVA_SC_REPORT_VERSION).toBe("v1.2");
    expect(NOVA_SC_REPORT_SCHEMA_VERSION).toBe("v1.2");
  });

  it("produces deterministic replay fields for one supplied snapshot", () => {
    const capture = availableCapture(makeSummary());
    expect(buildPersistentReplayReportFields(capture)).toEqual(
      buildPersistentReplayReportFields(capture)
    );
  });
});

describe("buildPersistentEvidenceSummary", () => {
  it("preserves the existing writer-summary behavior", () => {
    const backendSummary: PersistentEvidenceSummary = {
      persistent_evidence_enabled: true,
      persistent_evidence_active: false,
      evidence_run_id: "EVIDENCE_TEST_RUN",
      evidence_phase_id: "PHASE_TEST",
      evidence_run_dir: "evidence/run",
      evidence_manifest_path: "evidence/run/manifest.json",
      evidence_integrity_path: "evidence/run/integrity.json",
      evidence_summary_path: "evidence/run/summary.json",
      evidence_segments_written: 2,
      persistent_events_written: 100,
      persistent_events_dropped: 0,
      persistent_writer_errors: 0,
      finalized: true,
      hash_finalized: true,
      run_root_sha256: "c".repeat(64),
      integrity_scope: "file_integrity_detection_only",
      tamper_proof: false,
      cryptographic_attestation: false,
      persistent_hash_available: true,
      persistent_replay_validated: false,
      persistent_replay_validation_status: "PENDING_SOAK_VALIDATION",
      frontend_raw_replay_complete: true,
      frontend_event_store_capacity: 20000,
      frontend_event_store_current_events: 100,
      frontend_event_store_dropped_old_events: 0,
      required_next_action: "RUN_PHASE_7_2G_E_F_PERSISTENT_EVIDENCE_SOAK_VALIDATION",
    };
    const eventStoreSummary = {
      max_events: 20000,
      current_events: 100,
      latest_event_store_sequence: 100,
      dropped_old_events: 0,
      accepted: 100,
      rejected: 0,
      ignored: 0,
      by_disposition: {
        ACCEPTED: 100,
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
      },
    } satisfies EventStoreSummary;

    expect(
      buildPersistentEvidenceSummary({ backendSummary, eventStoreSummary })
    ).toEqual(backendSummary);
  });
});
