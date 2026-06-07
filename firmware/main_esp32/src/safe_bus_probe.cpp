#include "safe_bus_probe.h"

#include <Wire.h>

#include "board_config.h"

bool isI2cDeviceDetected(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

void appendI2cDevice(JsonArray devices, const char *name, uint8_t address) {
  JsonObject device = devices.add<JsonObject>();
  char addressText[8];
  snprintf(addressText, sizeof(addressText), "0x%02X", address);

  device["name"] = name;
  device["bus"] = "I2C";
  device["address"] = addressText;
  device["status"] = isI2cDeviceDetected(address) ? "DETECTED" : "MISSING";
}

void appendFramPlaceholder(JsonArray devices) {
  JsonObject fram = devices.add<JsonObject>();
  fram["name"] = "MB85RS256B_FRAM";
  fram["bus"] = "SPI";
  fram["chip_select"] = FRAM_CHIP_SELECT_LABEL;
  fram["status"] = "BLOCKED_WRONG_IC_PENDING";
}
