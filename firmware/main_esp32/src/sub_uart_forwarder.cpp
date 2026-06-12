#include "sub_uart_forwarder.h"

#include "board_config.h"

extern HardwareSerial PiTelemetrySerial;

HardwareSerial SubTelemetrySerial(MAIN_SUB_UART_PORT);

static char subLineBuffer[SUB_FORWARD_MAX_LINE_LENGTH + 1];
static size_t subLineIndex = 0;
static bool discardUntilNewline = false;
static uint32_t subForwardedLineCount = 0;
static uint32_t subDroppedLineCount = 0;
static uint32_t subOverlongLineCount = 0;

static void resetSubForwardBuffer();
static void handleSubTelemetryByte(char c);
static void forwardSubTelemetryLine(const char *line);

void setupSubTelemetryUart() {
  if (!SUB_FORWARDING_ENABLED) {
    return;
  }

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

  while (SubTelemetrySerial.available() > 0) {
    const char c = static_cast<char>(SubTelemetrySerial.read());
    handleSubTelemetryByte(c);
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
