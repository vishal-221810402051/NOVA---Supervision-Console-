#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

namespace ChipStatus {
static constexpr const char *DETECTED = "DETECTED";
static constexpr const char *MISSING = "MISSING";
static constexpr const char *NOT_VALIDATED = "NOT_VALIDATED";
static constexpr const char *UNKNOWN = "UNKNOWN";
static constexpr const char *BUS_NOT_READY = "BUS_NOT_READY";
static constexpr const char *DETECTED_UNCONFIRMED = "DETECTED_UNCONFIRMED";
static constexpr const char *BLOCKED_WRONG_IC_PENDING = "BLOCKED_WRONG_IC_PENDING";
static constexpr const char *VALIDATION_DISABLED = "VALIDATION_DISABLED";
}  // namespace ChipStatus

bool probeI2cAddressStable(uint8_t address, uint8_t attempts);
bool readI2cRegister8(uint8_t address, uint8_t reg, uint8_t &outValue);
bool readI2cRegister16(uint8_t address, uint8_t reg, uint16_t &outValue);

const char *validateAds1115();
const char *validateDs3231();
const char *validatePca9685(uint8_t address);
const char *validatePca9685AllCall();
const char *classifyI2cDeviceStatus(uint8_t address);
void appendI2cDevice(JsonArray devices, const char *name, uint8_t address);
void appendFramPlaceholder(JsonArray devices);
