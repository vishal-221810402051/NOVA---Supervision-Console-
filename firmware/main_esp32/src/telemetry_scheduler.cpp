#include "telemetry_scheduler.h"

#include <Wire.h>

#include "board_config.h"
#include "safe_bus_probe.h"

TelemetryScheduler::TelemetryScheduler(Stream &telemetryPort)
    : telemetryPort_(telemetryPort),
      heartbeatSequenceNumber_(1),
      lastNodeHealthMs_(0),
      lastLinkHeartbeatMs_(0),
      lastLinkSyncMs_(0),
      lastChipStatusMs_(0),
      lastPowerHealthMs_(0) {}

void TelemetryScheduler::begin() {
  const uint32_t nowMs = millis();
  lastNodeHealthMs_ = nowMs - NODE_HEALTH_INTERVAL_MS;
  lastLinkHeartbeatMs_ = nowMs - LINK_HEARTBEAT_INTERVAL_MS;
  lastLinkSyncMs_ = nowMs - LINK_SYNC_INTERVAL_MS;
  lastChipStatusMs_ = nowMs - CHIP_STATUS_INTERVAL_MS;
  lastPowerHealthMs_ = nowMs - POWER_HEALTH_INTERVAL_MS;
}

void TelemetryScheduler::update() {
  const uint32_t nowMs = millis();
  maybeEmit(nowMs, lastLinkHeartbeatMs_, LINK_HEARTBEAT_INTERVAL_MS, &TelemetryScheduler::emitLinkHeartbeat);
  maybeEmit(nowMs, lastNodeHealthMs_, NODE_HEALTH_INTERVAL_MS, &TelemetryScheduler::emitNodeHealth);
  maybeEmit(nowMs, lastLinkSyncMs_, LINK_SYNC_INTERVAL_MS, &TelemetryScheduler::emitLinkSync);
  maybeEmit(nowMs, lastPowerHealthMs_, POWER_HEALTH_INTERVAL_MS, &TelemetryScheduler::emitPowerHealth);
  maybeEmit(nowMs, lastChipStatusMs_, CHIP_STATUS_INTERVAL_MS, &TelemetryScheduler::emitChipStatus);
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
  payload["role"] = MAIN_ROLE;
  payload["health_state"] = "HEALTHY";
  payload["uptime_ms"] = millis();
  payload["firmware_version"] = FIRMWARE_VERSION;
  payload["reset_reason"] = resetReasonToString();
  payload["free_heap_bytes"] = ESP.getFreeHeap();
  payload["brownout_count"] = 0;
  payload["status_message"] = "MAIN ESP32 telemetry firmware healthy";

  packetBuilder_.emitPacket(doc, telemetryPort_);
}

void TelemetryScheduler::emitLinkHeartbeat() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "LINK_HEARTBEAT");
  JsonObject payload = doc["payload"].as<JsonObject>();

  payload["link_id"] = LINK_PI_MAIN;
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

  payload["link_id"] = LINK_PI_MAIN;
  payload["source_node_id"] = SOURCE_NODE_ID;
  payload["target_node_id"] = TARGET_NODE_ID;
  payload["sync_state"] = "SYNCED";
  payload["clock_skew_ms"] = nullptr;
  payload["stream_consistent"] = true;
  payload["source_sequence_continuous"] = true;

  packetBuilder_.emitPacket(doc, telemetryPort_);
}

void TelemetryScheduler::emitChipStatus() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "CHIP_STATUS");
  JsonObject payload = doc["payload"].as<JsonObject>();
  JsonArray i2cDevices = payload["i2c_devices"].to<JsonArray>();
  JsonArray spiDevices = payload["spi_devices"].to<JsonArray>();

  appendI2cDevice(i2cDevices, "ADS1115", ADS1115_ADDRESS);
  appendI2cDevice(i2cDevices, "DS3231_RTC", DS3231_RTC_ADDRESS);
  appendI2cDevice(i2cDevices, "PCA9685_1", PCA9685_1_ADDRESS);
  appendI2cDevice(i2cDevices, "PCA9685_2", PCA9685_2_ADDRESS);
  appendI2cDevice(i2cDevices, "PCA9685_ALLCALL", PCA9685_ALLCALL_ADDRESS);
  appendFramPlaceholder(spiDevices);

  packetBuilder_.emitPacket(doc, telemetryPort_);
}

void TelemetryScheduler::emitPowerHealth() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "POWER_HEALTH");
  JsonObject payload = doc["payload"].as<JsonObject>();

  payload["vin_protected_v"] = nullptr;
  payload["rail_5v_v"] = nullptr;
  payload["rail_3v3_v"] = nullptr;
  payload["brownout_detected"] = false;
  payload["power_state"] = "UNKNOWN";
  payload["measurement_status"] = "ADC_NOT_CONFIGURED";

  packetBuilder_.emitPacket(doc, telemetryPort_);
}
