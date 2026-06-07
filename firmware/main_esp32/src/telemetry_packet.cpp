#include "telemetry_packet.h"

#include "board_config.h"
#include "esp_system.h"

TelemetryPacketBuilder::TelemetryPacketBuilder() : sourceSequenceNumber_(1) {}

void TelemetryPacketBuilder::beginPacket(JsonDocument &doc, const char *packetType) {
  doc.clear();
  doc["schema_version"] = HW_SCHEMA_VERSION;
  doc["packet_type"] = packetType;
  doc["source_node_id"] = SOURCE_NODE_ID;
  doc["target_node_id"] = TARGET_NODE_ID;
  doc["source_sequence_number"] = nextSequenceNumber();
  doc["producer_timestamp_ms"] = millis();
  doc["payload"].to<JsonObject>();
}

void TelemetryPacketBuilder::emitPacket(JsonDocument &doc, Stream &telemetryPort) {
  serializeJson(doc, telemetryPort);
  telemetryPort.print('\n');

#if TELEMETRY_MIRROR_TO_USB
  // TELEMETRY_MIRROR_TO_USB is temporary for Phase 6.3 dry validation only.
  serializeJson(doc, Serial);
  Serial.print('\n');
#endif
}

uint32_t TelemetryPacketBuilder::nextSequenceNumber() {
  return sourceSequenceNumber_++;
}

const char *resetReasonToString() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:
      return "POWER_ON_RESET";
    case ESP_RST_SW:
      return "SOFTWARE_RESET";
    case ESP_RST_PANIC:
      return "PANIC_RESET";
    case ESP_RST_INT_WDT:
      return "INTERRUPT_WATCHDOG_RESET";
    case ESP_RST_TASK_WDT:
      return "TASK_WATCHDOG_RESET";
    case ESP_RST_WDT:
      return "WATCHDOG_RESET";
    case ESP_RST_DEEPSLEEP:
      return "DEEP_SLEEP_RESET";
    case ESP_RST_BROWNOUT:
      return "BROWNOUT_RESET";
    default:
      return "UNKNOWN_RESET";
  }
}
