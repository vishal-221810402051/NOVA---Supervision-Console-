#include "telemetry_scheduler.h"

#include "board_config.h"

TelemetryScheduler::TelemetryScheduler(Stream &telemetryPort)
    : telemetryPort_(telemetryPort),
      heartbeatSequenceNumber_(1),
      lastNodeHealthMs_(0),
      lastLinkHeartbeatMs_(0),
      lastLinkSyncMs_(0),
      lastTelemetryEmitMs_(0) {}

void TelemetryScheduler::begin() {
  const uint32_t nowMs = millis();
  lastNodeHealthMs_ = nowMs - NODE_HEALTH_INTERVAL_MS;
  lastLinkHeartbeatMs_ = nowMs - LINK_HEARTBEAT_INTERVAL_MS;
  lastLinkSyncMs_ = nowMs - LINK_SYNC_INTERVAL_MS;
  lastTelemetryEmitMs_ = nowMs - SUB_TELEMETRY_MIN_PACKET_SPACING_MS;
}

void TelemetryScheduler::update() {
  const uint32_t nowMs = millis();

  if (nowMs - lastTelemetryEmitMs_ < SUB_TELEMETRY_MIN_PACKET_SPACING_MS) {
    return;
  }

  if (nowMs - lastLinkHeartbeatMs_ >= LINK_HEARTBEAT_INTERVAL_MS) {
    lastLinkHeartbeatMs_ = nowMs;
    lastTelemetryEmitMs_ = nowMs;
    emitLinkHeartbeat();
    return;
  }

  if (nowMs - lastNodeHealthMs_ >= NODE_HEALTH_INTERVAL_MS) {
    lastNodeHealthMs_ = nowMs;
    lastTelemetryEmitMs_ = nowMs;
    emitNodeHealth();
    return;
  }

  if (nowMs - lastLinkSyncMs_ >= LINK_SYNC_INTERVAL_MS) {
    lastLinkSyncMs_ = nowMs;
    lastTelemetryEmitMs_ = nowMs;
    emitLinkSync();
    return;
  }
}

void TelemetryScheduler::maybeEmit(
    uint32_t nowMs,
    uint32_t &lastMs,
    uint32_t intervalMs,
    void (TelemetryScheduler::*emitter)()) {
  if (nowMs - lastMs < intervalMs) {
    return;
  }

  lastMs = nowMs;
  (this->*emitter)();
}

void TelemetryScheduler::emitNodeHealth() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "NODE_HEALTH");
  JsonObject payload = doc["payload"].as<JsonObject>();

  payload["node_id"] = SOURCE_NODE_ID;
  payload["role"] = NODE_ROLE;
  payload["health_state"] = "HEALTHY";
  payload["uptime_ms"] = millis();
  payload["firmware_version"] = FIRMWARE_VERSION;
  payload["reset_reason"] = resetReasonToString();
  payload["free_heap_bytes"] = ESP.getFreeHeap();
  payload["brownout_count"] = 0;
  payload["status_message"] = "SUB ESP32 telemetry firmware healthy";

  packetBuilder_.emitPacket(doc, telemetryPort_);
}

void TelemetryScheduler::emitLinkHeartbeat() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "LINK_HEARTBEAT");
  JsonObject payload = doc["payload"].as<JsonObject>();

  payload["link_id"] = LINK_MAIN_SUB;
  payload["source_node_id"] = SOURCE_NODE_ID;
  payload["target_node_id"] = TARGET_NODE_ID;
  payload["heartbeat_sequence_number"] = heartbeatSequenceNumber_++;
  payload["heartbeat_interval_ms"] = LINK_HEARTBEAT_INTERVAL_MS;
  payload["timeout_ms"] = LINK_TIMEOUT_MS;
  payload["missed_heartbeat_count"] = 0;
  payload["missed_heartbeat_threshold"] = MISSED_HEARTBEAT_THRESHOLD;
  payload["link_state"] = "LINK_HEALTHY";
  payload["sync_state"] = "SYNCED";
  payload["last_seen_utc"] = nullptr;
  payload["round_trip_latency_ms"] = nullptr;

  packetBuilder_.emitPacket(doc, telemetryPort_);
}

void TelemetryScheduler::emitLinkSync() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "LINK_SYNC");
  JsonObject payload = doc["payload"].as<JsonObject>();

  payload["link_id"] = LINK_MAIN_SUB;
  payload["source_node_id"] = SOURCE_NODE_ID;
  payload["target_node_id"] = TARGET_NODE_ID;
  payload["sync_state"] = "SYNCED";
  payload["clock_skew_ms"] = nullptr;
  payload["stream_consistent"] = true;
  payload["source_sequence_continuous"] = true;

  packetBuilder_.emitPacket(doc, telemetryPort_);
}
