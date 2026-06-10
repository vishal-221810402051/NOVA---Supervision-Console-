#include "safe_bus_probe.h"

#include <Wire.h>

#include "board_config.h"

static bool hasStableI2cAck(uint8_t address) {
  for (uint8_t attempt = 0; attempt < I2C_CONFIRMATION_READS; ++attempt) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() != 0) {
      return false;
    }
    delay(I2C_PROBE_RETRY_DELAY_MS);
  }

  return true;
}

const char *classifyI2cDeviceStatus(uint8_t address) {
  if (!ENABLE_I2C_CHIP_VALIDATION) {
    return REPORT_I2C_AS_NOT_VALIDATED_WHEN_DISABLED
               ? ChipStatus::NOT_VALIDATED
               : ChipStatus::VALIDATION_DISABLED;
  }

  const bool stableAck = hasStableI2cAck(address);
  if (!stableAck) {
    return ChipStatus::MISSING;
  }

  // Address ACK alone is intentionally not enough for DETECTED. Future strict
  // validation should add device-specific functional register reads.
  if (I2C_REQUIRE_FUNCTIONAL_READ) {
    return ChipStatus::DETECTED_UNCONFIRMED;
  }

  return ChipStatus::DETECTED_UNCONFIRMED;
}

void appendI2cDevice(JsonArray devices, const char *name, uint8_t address) {
  JsonObject device = devices.add<JsonObject>();
  char addressText[8];
  snprintf(addressText, sizeof(addressText), "0x%02X", address);

  device["name"] = name;
  device["bus"] = "I2C";
  device["address"] = addressText;
  device["status"] = classifyI2cDeviceStatus(address);
}

void appendFramPlaceholder(JsonArray devices) {
  JsonObject fram = devices.add<JsonObject>();
  fram["name"] = "MB85RS256B_FRAM";
  fram["bus"] = "SPI";
  fram["chip_select"] = FRAM_CHIP_SELECT_LABEL;
  fram["status"] = ChipStatus::BLOCKED_WRONG_IC_PENDING;
}
