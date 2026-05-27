export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "FAIL_SAFE";

export type TelemetryPacket = {
  schema_version: string;
  timestamp_utc: string;
  sequence_number: number;
  run_id: string;
  node_id: string;
  event_type:
    | "SYSTEM_HEALTH_TELEMETRY"
    | "CHIP_STATUS_TELEMETRY"
    | "POWER_HEALTH_TELEMETRY";
  payload: any;
};
