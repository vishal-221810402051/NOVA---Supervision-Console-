#include "safe_bus_probe.h"

#include <Wire.h>

#include "board_config.h"

bool probeI2cAddressStable(uint8_t address, uint8_t attempts) {
  for (uint8_t attempt = 0; attempt < attempts; ++attempt) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() != 0) {
      return false;
    }
    delay(I2C_PROBE_RETRY_DELAY_MS);
  }

  return true;
}

bool readI2cRegister8(uint8_t address, uint8_t reg, uint8_t &outValue) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const uint8_t bytesRequested = 1;
  if (Wire.requestFrom(address, bytesRequested) != bytesRequested) {
    return false;
  }
  if (Wire.available() < bytesRequested) {
    return false;
  }

  outValue = static_cast<uint8_t>(Wire.read());
  return true;
}

bool readI2cRegister16(uint8_t address, uint8_t reg, uint16_t &outValue) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const uint8_t bytesRequested = 2;
  if (Wire.requestFrom(address, bytesRequested) != bytesRequested) {
    return false;
  }
  if (Wire.available() < bytesRequested) {
    return false;
  }

  const uint8_t msb = static_cast<uint8_t>(Wire.read());
  const uint8_t lsb = static_cast<uint8_t>(Wire.read());
  outValue = (static_cast<uint16_t>(msb) << 8) | lsb;
  return true;
}

const char *validateAds1115() {
  if (!ENABLE_I2C_CHIP_VALIDATION) {
    return REPORT_I2C_AS_NOT_VALIDATED_WHEN_DISABLED
               ? ChipStatus::NOT_VALIDATED
               : ChipStatus::VALIDATION_DISABLED;
  }

  if (!probeI2cAddressStable(ADS1115_ADDRESS, I2C_CONFIRMATION_READS)) {
    return ChipStatus::MISSING;
  }

  uint16_t configRegister = 0;
  if (!readI2cRegister16(ADS1115_ADDRESS, 0x01, configRegister)) {
    return ChipStatus::DETECTED_UNCONFIRMED;
  }

  return ChipStatus::DETECTED;
}

const char *validateDs3231() {
  if (!ENABLE_I2C_CHIP_VALIDATION) {
    return REPORT_I2C_AS_NOT_VALIDATED_WHEN_DISABLED
               ? ChipStatus::NOT_VALIDATED
               : ChipStatus::VALIDATION_DISABLED;
  }

  if (!probeI2cAddressStable(DS3231_RTC_ADDRESS, I2C_CONFIRMATION_READS)) {
    return ChipStatus::MISSING;
  }

  uint8_t secondsRegister = 0;
  if (!readI2cRegister8(DS3231_RTC_ADDRESS, 0x00, secondsRegister)) {
    return ChipStatus::DETECTED_UNCONFIRMED;
  }

  const uint8_t lowerNibble = secondsRegister & 0x0F;
  const uint8_t upperNibble = (secondsRegister >> 4) & 0x07;
  if (lowerNibble > 9 || upperNibble > 5) {
    return ChipStatus::UNKNOWN;
  }

  return ChipStatus::DETECTED;
}

const char *validatePca9685(uint8_t address) {
  if (!ENABLE_I2C_CHIP_VALIDATION) {
    return REPORT_I2C_AS_NOT_VALIDATED_WHEN_DISABLED
               ? ChipStatus::NOT_VALIDATED
               : ChipStatus::VALIDATION_DISABLED;
  }

  if (!probeI2cAddressStable(address, I2C_CONFIRMATION_READS)) {
    return ChipStatus::MISSING;
  }

  uint8_t mode1Register = 0;
  if (!readI2cRegister8(address, 0x00, mode1Register)) {
    return ChipStatus::DETECTED_UNCONFIRMED;
  }

  return ChipStatus::DETECTED;
}

const char *validatePca9685AllCall() {
  // AllCall is not validated as an independent physical chip in Phase 6.4E.
  // Avoid writes and do not report DETECTED for address 0x70.
  return ChipStatus::NOT_VALIDATED;
}

const char *classifyI2cDeviceStatus(uint8_t address) {
  if (address == ADS1115_ADDRESS) {
    return validateAds1115();
  }
  if (address == DS3231_RTC_ADDRESS) {
    return validateDs3231();
  }
  if (address == PCA9685_1_ADDRESS || address == PCA9685_2_ADDRESS) {
    return validatePca9685(address);
  }
  if (address == PCA9685_ALLCALL_ADDRESS) {
    return validatePca9685AllCall();
  }

  return ChipStatus::UNKNOWN;
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
