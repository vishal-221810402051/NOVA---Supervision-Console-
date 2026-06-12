#pragma once

#include <Arduino.h>

#include "telemetry_packet.h"

class TelemetryScheduler {
 public:
  explicit TelemetryScheduler(Stream &telemetryPort);

  void begin();
  void update();

 private:
  void maybeEmit(
      uint32_t nowMs,
      uint32_t &lastMs,
      uint32_t intervalMs,
      void (TelemetryScheduler::*emitter)());
  void emitNodeHealth();
  void emitLinkHeartbeat();
  void emitLinkSync();

  Stream &telemetryPort_;
  TelemetryPacketBuilder packetBuilder_;
  uint32_t heartbeatSequenceNumber_;
  uint32_t lastNodeHealthMs_;
  uint32_t lastLinkHeartbeatMs_;
  uint32_t lastLinkSyncMs_;
  uint32_t lastTelemetryEmitMs_;
};
