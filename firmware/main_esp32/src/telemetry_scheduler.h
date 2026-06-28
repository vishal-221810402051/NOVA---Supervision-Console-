#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "telemetry_packet.h"

struct RtcSyncResultTelemetry {
  const char *request_message_type;
  const char *session_sync_id;
  bool accepted;
  const char *result;
  const char *reason_code;
  const char *reason_detail;
  const char *safety_scope;
  bool rtc_write_attempted;
  bool osf_clear_attempted;
  bool transaction_evidence_present;
  bool write_ok;
  bool readback_ok;
  bool readback_delta_available;
  long readback_delta_ms;
  bool osf_before_available;
  bool osf_before;
  bool osf_after_available;
  bool osf_after;
  bool osf_cleared;
  const char *rtc_validity_class_after_sync;
  const char *status_message;
};

class TelemetryScheduler {
 public:
  explicit TelemetryScheduler(Stream &telemetryPort);

  void begin();
  void update();
  void emitRtcSyncResult(const RtcSyncResultTelemetry &result);

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
