#include <Arduino.h>

#include "board_config.h"
#include "telemetry_scheduler.h"

TelemetryScheduler telemetryScheduler(Serial);

void setup() {
  Serial.begin(USB_SERIAL_BAUD);
  const uint32_t serialAttachStartMs = millis();
  while (!Serial && millis() - serialAttachStartMs < 3000) {
    delay(10);
  }

  delay(500);
  telemetryScheduler.begin();
}

void loop() {
  telemetryScheduler.update();
}
