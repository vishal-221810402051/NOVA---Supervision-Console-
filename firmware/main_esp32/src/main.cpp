#include <Arduino.h>
#include <Wire.h>

#include "board_config.h"
#include "telemetry_scheduler.h"

HardwareSerial PiTelemetrySerial(MAIN_PI_UART_PORT);
TelemetryScheduler telemetryScheduler(PiTelemetrySerial);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("NOVA SC MAIN ESP32 telemetry firmware starting on USB debug serial.");
  Serial.println("Pi UART emits newline-delimited JSON telemetry only.");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  PiTelemetrySerial.begin(
      MAIN_PI_UART_BAUD,
      SERIAL_8N1,
      MAIN_PI_UART_RX_PIN,
      MAIN_PI_UART_TX_PIN);

  telemetryScheduler.begin();
}

void loop() {
  telemetryScheduler.update();
}
