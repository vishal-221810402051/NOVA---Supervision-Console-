#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "telemetry_packet.h"

class TelemetryScheduler {
 public:
  explicit TelemetryScheduler(Stream &telemetryPort);

  void begin();
  void update();

 private:
  void maybeEmit(uint32_t nowMs, uint32_t &lastMs, uint32_t intervalMs, void (TelemetryScheduler::*emitter)());
  void emitNodeHealth();
  void emitLinkHeartbeat();
  void emitLinkSync();
  void emitChipStatus();
  void emitPowerHealth();
  void emitRtcStatus();

  Stream &telemetryPort_;
  TelemetryPacketBuilder packetBuilder_;
  uint32_t heartbeatSequenceNumber_;
  uint32_t lastNodeHealthMs_;
  uint32_t lastLinkHeartbeatMs_;
  uint32_t lastLinkSyncMs_;
  uint32_t lastChipStatusMs_;
  uint32_t lastPowerHealthMs_;
  uint32_t lastRtcStatusMs_;
};
