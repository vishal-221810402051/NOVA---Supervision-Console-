#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class TelemetryPacketBuilder {
 public:
  TelemetryPacketBuilder();

  void beginPacket(JsonDocument &doc, const char *packetType);
  void emitPacket(JsonDocument &doc, Stream &telemetryPort);
  uint32_t nextSequenceNumber();
  uint32_t droppedSerializationCount() const;

 private:
  uint32_t sourceSequenceNumber_;
  uint32_t droppedSerializationCount_;
};

const char *resetReasonToString();
