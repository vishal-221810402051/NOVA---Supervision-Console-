#include <Arduino.h>

#include "board_config.h"
#include "telemetry_scheduler.h"

class DualTelemetryStream : public Stream {
 public:
  DualTelemetryStream(Stream &primary, Stream &secondary)
      : primary_(primary), secondary_(secondary), secondaryEnabled_(false) {}

  void setSecondaryEnabled(bool enabled) {
    secondaryEnabled_ = enabled;
  }

  int available() override {
    return 0;
  }

  int read() override {
    return -1;
  }

  int peek() override {
    return -1;
  }

  void flush() override {
    primary_.flush();
    if (secondaryEnabled_) {
      secondary_.flush();
    }
  }

  size_t write(uint8_t value) override {
    const size_t primaryWritten = primary_.write(value);
    if (secondaryEnabled_) {
      secondary_.write(value);
    }
    return primaryWritten;
  }

  size_t write(const uint8_t *buffer, size_t size) override {
    const size_t primaryWritten = primary_.write(buffer, size);
    if (secondaryEnabled_) {
      secondary_.write(buffer, size);
    }
    return primaryWritten;
  }

 private:
  Stream &primary_;
  Stream &secondary_;
  bool secondaryEnabled_;
};

HardwareSerial SubMainTelemetrySerial(SUB_MAIN_UART_PORT);
DualTelemetryStream telemetryOutput(Serial, SubMainTelemetrySerial);
TelemetryScheduler telemetryScheduler(telemetryOutput);

void setup() {
  Serial.begin(USB_SERIAL_BAUD);
  const uint32_t serialAttachStartMs = millis();
  while (!Serial && millis() - serialAttachStartMs < 3000) {
    delay(10);
  }

  delay(500);
  if (SUB_UART_OUTPUT_ENABLED) {
    SubMainTelemetrySerial.begin(
        SUB_MAIN_UART_BAUD,
        SERIAL_8N1,
        SUB_MAIN_UART_RX_PIN,
        SUB_MAIN_UART_TX_PIN);
    telemetryOutput.setSecondaryEnabled(true);
  }

  telemetryScheduler.begin();
}

void loop() {
  telemetryScheduler.update();
}
