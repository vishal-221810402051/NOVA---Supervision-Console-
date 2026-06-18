#include "telemetry_scheduler.h"

#include <Wire.h>

#include "ads1115_raw_reader.h"
#include "board_config.h"
#include "ds3231_rtc_reader.h"
#include "safe_bus_probe.h"

namespace {
void writeHexByte(JsonObject object, const char *key, uint8_t value) {
  char text[5];
  snprintf(text, sizeof(text), "0x%02X", value);
  object[key] = text;
}
}  // namespace

TelemetryScheduler::TelemetryScheduler(Stream &telemetryPort)
    : telemetryPort_(telemetryPort),
      heartbeatSequenceNumber_(1),
      lastNodeHealthMs_(0),
      lastLinkHeartbeatMs_(0),
      lastLinkSyncMs_(0),
      lastChipStatusMs_(0),
      lastPowerHealthMs_(0),
      lastRtcStatusMs_(0) {}

void TelemetryScheduler::begin() {
  const uint32_t nowMs = millis();
  lastNodeHealthMs_ = nowMs - NODE_HEALTH_INTERVAL_MS;
  lastLinkHeartbeatMs_ = nowMs - LINK_HEARTBEAT_INTERVAL_MS;
  lastLinkSyncMs_ = nowMs - LINK_SYNC_INTERVAL_MS;
  lastChipStatusMs_ = nowMs - CHIP_STATUS_INTERVAL_MS;
  lastPowerHealthMs_ = nowMs - POWER_HEALTH_INTERVAL_MS;
  lastRtcStatusMs_ = nowMs - RTC_STATUS_INTERVAL_MS;
}

void TelemetryScheduler::update() {
  const uint32_t nowMs = millis();
  maybeEmit(nowMs, lastLinkHeartbeatMs_, LINK_HEARTBEAT_INTERVAL_MS, &TelemetryScheduler::emitLinkHeartbeat);
  maybeEmit(nowMs, lastNodeHealthMs_, NODE_HEALTH_INTERVAL_MS, &TelemetryScheduler::emitNodeHealth);
  maybeEmit(nowMs, lastLinkSyncMs_, LINK_SYNC_INTERVAL_MS, &TelemetryScheduler::emitLinkSync);
  maybeEmit(nowMs, lastPowerHealthMs_, POWER_HEALTH_INTERVAL_MS, &TelemetryScheduler::emitPowerHealth);
  maybeEmit(nowMs, lastChipStatusMs_, CHIP_STATUS_INTERVAL_MS, &TelemetryScheduler::emitChipStatus);
  maybeEmit(nowMs, lastRtcStatusMs_, RTC_STATUS_INTERVAL_MS, &TelemetryScheduler::emitRtcStatus);
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

void TelemetryScheduler::emitRtcStatus() {
  JsonDocument doc;
  packetBuilder_.beginPacket(doc, "RTC_STATUS");
  JsonObject payload = doc["payload"].as<JsonObject>();
  Ds3231RtcStatus rtcStatus;
  readDs3231RtcStatus(rtcStatus);

  payload["rtc_device"] = "DS3231";
  payload["rtc_address"] = "0x68";
  payload["rtc_detected"] = rtcStatus.detected;
  payload["rtc_register_read_ok"] = rtcStatus.register_read_ok;
  payload["rtc_time_utc"] = nullptr;
  payload["rtc_time_valid"] = false;
  payload["rtc_status"] = classifyDs3231RtcStatus(rtcStatus);
  if (rtcStatus.status_register_read_ok) {
    payload["oscillator_stop_flag"] = rtcStatus.oscillator_stop_flag;
  } else {
    payload["oscillator_stop_flag"] = nullptr;
  }
  payload["backup_battery_present"] = DS3231_BACKUP_BATTERY_CONFIGURED;
  payload["backup_battery_configured"] = DS3231_BACKUP_BATTERY_CONFIGURED;
  payload["time_source"] = "DS3231_UNVERIFIED";
  payload["sync_source"] = nullptr;
  payload["source_uptime_ms"] = millis();
  payload["status_message"] = describeDs3231RtcStatus(rtcStatus);

  if (rtcStatus.time_register_read_ok) {
    JsonObject raw = payload["rtc_time_raw"].to<JsonObject>();
    writeHexByte(raw, "seconds_bcd", rtcStatus.raw_time.seconds_bcd);
    writeHexByte(raw, "minutes_bcd", rtcStatus.raw_time.minutes_bcd);
    writeHexByte(raw, "hours_bcd", rtcStatus.raw_time.hours_bcd);
    writeHexByte(raw, "day_bcd", rtcStatus.raw_time.day_bcd);
    writeHexByte(raw, "date_bcd", rtcStatus.raw_time.date_bcd);
    writeHexByte(raw, "month_bcd", rtcStatus.raw_time.month_bcd);
    writeHexByte(raw, "year_bcd", rtcStatus.raw_time.year_bcd);
  } else {
    payload["rtc_time_raw"] = nullptr;
  }

  if (rtcStatus.decoded_time_ok) {
    JsonObject time = payload["rtc_time"].to<JsonObject>();
    time["year"] = rtcStatus.decoded_time.year;
    time["month"] = rtcStatus.decoded_time.month;
    time["date"] = rtcStatus.decoded_time.date;
    time["hour"] = rtcStatus.decoded_time.hour;
    time["minute"] = rtcStatus.decoded_time.minute;
    time["second"] = rtcStatus.decoded_time.second;
  } else {
    payload["rtc_time"] = nullptr;
  }

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
  Ads1115RawChannels channels;
  const bool hasRawAdc = readAds1115RawChannels(channels);
  const bool adcDetected = hasRawAdc || probeI2cAddressStable(ADS1115_ADDRESS, 1);

  payload["vin_protected_v"] = nullptr;
  payload["rail_5v_v"] = nullptr;
  payload["rail_3v3_v"] = nullptr;
  payload["brownout_detected"] = false;
  payload["power_state"] = "UNKNOWN";
  payload["measurement_status"] =
      hasRawAdc ? "ADC_RAW_DEBUG" : (adcDetected ? "ADC_READ_ERROR" : "ADC_NOT_DETECTED");
  payload["adc_source"] = "ADS1115";
  payload["adc_address"] = "0x48";
  payload["adc_mode"] = "RAW_SINGLE_ENDED_DEBUG";

  JsonObject rawChannels = payload["ads1115_channels"].to<JsonObject>();
  if (channels.ain0_ok) {
    rawChannels["ain0_v"] = channels.ain0_v;
  } else {
    rawChannels["ain0_v"] = nullptr;
  }
  if (channels.ain1_ok) {
    rawChannels["ain1_v"] = channels.ain1_v;
  } else {
    rawChannels["ain1_v"] = nullptr;
  }
  if (channels.ain2_ok) {
    rawChannels["ain2_v"] = channels.ain2_v;
  } else {
    rawChannels["ain2_v"] = nullptr;
  }
  if (channels.ain3_ok) {
    rawChannels["ain3_v"] = channels.ain3_v;
  } else {
    rawChannels["ain3_v"] = nullptr;
  }

  packetBuilder_.emitPacket(doc, telemetryPort_);
}
