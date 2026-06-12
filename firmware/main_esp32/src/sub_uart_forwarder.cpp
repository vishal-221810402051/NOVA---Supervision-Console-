#include "sub_uart_forwarder.h"

#include "board_config.h"

#include <string.h>

extern HardwareSerial PiTelemetrySerial;

HardwareSerial SubTelemetrySerial(MAIN_SUB_UART_PORT);

static char subLineBuffer[SUB_FORWARD_MAX_LINE_LENGTH + 1];
static size_t subLineIndex = 0;
static bool discardUntilNewline = false;
static uint32_t subForwardedLineCount = 0;
static uint32_t subDroppedLineCount = 0;
static uint32_t subOverlongLineCount = 0;
static uint32_t subCorruptLineCount = 0;

static void resetSubForwardBuffer();
static void handleSubTelemetryByte(char c);
static void forwardSubTelemetryLine(const char *line);
static bool isSubTelemetryLineSane(const char *line);
static bool containsToken(const char *line, const char *token);

void setupSubTelemetryUart() {
  if (!SUB_FORWARDING_ENABLED) {
    return;
  }

  SubTelemetrySerial.setRxBufferSize(SUB_FORWARD_RX_BUFFER_SIZE);
  SubTelemetrySerial.begin(
      MAIN_SUB_UART_BAUD,
      SERIAL_8N1,
      MAIN_SUB_UART_RX_PIN,
      MAIN_SUB_UART_TX_PIN);

  resetSubForwardBuffer();
}

void processSubTelemetryForwarding() {
  if (!SUB_FORWARDING_ENABLED) {
    return;
  }

  size_t bytesProcessed = 0;
  while (
      SubTelemetrySerial.available() > 0 &&
      bytesProcessed < SUB_FORWARD_MAX_BYTES_PER_LOOP) {
    const int value = SubTelemetrySerial.read();
    if (value < 0) {
      break;
    }

    const char c = static_cast<char>(value);
    handleSubTelemetryByte(c);
    bytesProcessed++;
  }
}

uint32_t getSubForwardedLineCount() {
  return subForwardedLineCount;
}

uint32_t getSubDroppedLineCount() {
  return subDroppedLineCount;
}

uint32_t getSubOverlongLineCount() {
  return subOverlongLineCount;
}

static void resetSubForwardBuffer() {
  subLineIndex = 0;
  subLineBuffer[0] = '\0';
}

static void handleSubTelemetryByte(char c) {
  if (c == '\r') {
    return;
  }

  if (discardUntilNewline) {
    if (c == '\n') {
      discardUntilNewline = false;
      resetSubForwardBuffer();
    }
    return;
  }

  if (c == '\n') {
    subLineBuffer[subLineIndex] = '\0';

    if (subLineIndex == 0) {
      resetSubForwardBuffer();
      return;
    }

    if (subLineBuffer[0] != '{' || subLineBuffer[subLineIndex - 1] != '}') {
      subDroppedLineCount++;
      resetSubForwardBuffer();
      return;
    }

    if (!isSubTelemetryLineSane(subLineBuffer)) {
      subDroppedLineCount++;
      subCorruptLineCount++;
      Serial.println("[MAIN][SUB_UART][WARN] dropped corrupt SUB telemetry line");
      resetSubForwardBuffer();
      return;
    }

    forwardSubTelemetryLine(subLineBuffer);
    resetSubForwardBuffer();
    return;
  }

  if (subLineIndex >= SUB_FORWARD_MAX_LINE_LENGTH) {
    subOverlongLineCount++;
    discardUntilNewline = true;
    resetSubForwardBuffer();
    return;
  }

  subLineBuffer[subLineIndex++] = c;
}

static void forwardSubTelemetryLine(const char *line) {
  PiTelemetrySerial.println(line);

#if TELEMETRY_MIRROR_TO_USB
  Serial.println(line);
#endif

  subForwardedLineCount++;
}

static bool isSubTelemetryLineSane(const char *line) {
  if (!containsToken(line, "\"schema_version\":\"hw.v1\"")) {
    return false;
  }
  if (!containsToken(line, "\"source_node_id\":\"esp32_sub\"")) {
    return false;
  }
  if (!containsToken(line, "\"packet_type\":")) {
    return false;
  }

  if (containsToken(line, "\"packet_type\":\"NODE_HEALTH\"")) {
    return containsToken(line, "\"firmware_version\"") &&
           containsToken(line, "\"reset_reason\"") &&
           containsToken(line, "\"free_heap_bytes\"") &&
           containsToken(line, "\"brownout_count\"") &&
           containsToken(line, "\"status_message\"") &&
           !containsToken(line, "\"sync_state\"");
  }

  if (containsToken(line, "\"packet_type\":\"LINK_SYNC\"")) {
    return containsToken(line, "\"sync_state\"") &&
           containsToken(line, "\"stream_consistent\"") &&
           containsToken(line, "\"source_sequence_continuous\"");
  }

  if (containsToken(line, "\"packet_type\":\"LINK_HEARTBEAT\"")) {
    return containsToken(line, "\"heartbeat_sequence_number\"") &&
           containsToken(line, "\"heartbeat_interval_ms\"") &&
           containsToken(line, "\"link_state\"");
  }

  return false;
}

static bool containsToken(const char *line, const char *token) {
  return strstr(line, token) != nullptr;
}
