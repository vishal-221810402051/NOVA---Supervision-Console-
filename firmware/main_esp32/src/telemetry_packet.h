#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class TelemetryPacketBuilder {
 public:
  TelemetryPacketBuilder();

  void beginPacket(JsonDocument &doc, const char *packetType);
  void emitPacket(JsonDocument &doc, Stream &telemetryPort);
  uint32_t nextSequenceNumber();

 private:
  uint32_t sourceSequenceNumber_;
};

const char *resetReasonToString();
