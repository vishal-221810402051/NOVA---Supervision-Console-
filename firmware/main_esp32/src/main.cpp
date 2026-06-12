#include <Arduino.h>
#include <Wire.h>

#include "board_config.h"
#include "sub_uart_forwarder.h"
#include "telemetry_scheduler.h"

HardwareSerial PiTelemetrySerial(MAIN_PI_UART_PORT);
TelemetryScheduler telemetryScheduler(PiTelemetrySerial);

void setup() {
  Serial.begin(115200);
  const uint32_t serialAttachStartMs = millis();
  while (!Serial && millis() - serialAttachStartMs < 3000) {
    delay(10);
  }

  delay(500);
  Serial.println("NOVA SC MAIN ESP32 telemetry firmware boot");
  Serial.println("Phase 6.3 dry validation mode");
  Serial.println("USB debug active");
  Serial.println("Telemetry UART active on NOVA B1 J2 PI_CTRL_IF");
  Serial.flush();

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(I2C_TIMEOUT_MS);

  PiTelemetrySerial.begin(
      MAIN_PI_UART_BAUD,
      SERIAL_8N1,
      MAIN_PI_UART_RX_PIN,
      MAIN_PI_UART_TX_PIN);
  setupSubTelemetryUart();

  telemetryScheduler.begin();
}

void loop() {
  processSubTelemetryForwarding();
  telemetryScheduler.update();
}
