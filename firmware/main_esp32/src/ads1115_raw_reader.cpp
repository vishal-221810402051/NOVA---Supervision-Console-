#include "ads1115_raw_reader.h"

#include <Wire.h>

#include "board_config.h"

namespace {
static constexpr uint8_t ADS1115_CONVERSION_REGISTER = 0x00;
static constexpr uint8_t ADS1115_CONFIG_REGISTER = 0x01;
static constexpr uint16_t ADS1115_OS_NOT_BUSY = 0x8000;
static constexpr uint32_t ADS1115_CONVERSION_TIMEOUT_MS = 20;

// Single-shot, PGA +/-4.096V, 128 SPS, comparator disabled.
static constexpr uint16_t ADS1115_CONFIG_AIN0 = 0xC383;
static constexpr uint16_t ADS1115_CONFIG_AIN1 = 0xD383;
static constexpr uint16_t ADS1115_CONFIG_AIN2 = 0xE383;
static constexpr uint16_t ADS1115_CONFIG_AIN3 = 0xF383;
static constexpr float ADS1115_FSR_VOLTS = 4.096f;
static constexpr float ADS1115_COUNTS = 32768.0f;

bool writeConfig(uint16_t config) {
  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(ADS1115_CONFIG_REGISTER);
  Wire.write(static_cast<uint8_t>((config >> 8) & 0xFF));
  Wire.write(static_cast<uint8_t>(config & 0xFF));
  return Wire.endTransmission() == 0;
}

bool readRegister16(uint8_t reg, uint16_t &value) {
  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const uint8_t bytesRequested = 2;
  if (Wire.requestFrom(ADS1115_ADDRESS, bytesRequested) != bytesRequested) {
    return false;
  }
  if (Wire.available() < bytesRequested) {
    return false;
  }

  const uint8_t msb = static_cast<uint8_t>(Wire.read());
  const uint8_t lsb = static_cast<uint8_t>(Wire.read());
  value = (static_cast<uint16_t>(msb) << 8) | lsb;
  return true;
}

bool waitForConversionReady() {
  const uint32_t startedMs = millis();
  uint16_t config = 0;

  while (millis() - startedMs < ADS1115_CONVERSION_TIMEOUT_MS) {
    if (!readRegister16(ADS1115_CONFIG_REGISTER, config)) {
      return false;
    }
    if ((config & ADS1115_OS_NOT_BUSY) != 0) {
      return true;
    }
    delay(1);
  }

  return false;
}

bool readSingleEnded(uint16_t config, float &volts) {
  if (!writeConfig(config)) {
    return false;
  }

  if (!waitForConversionReady()) {
    return false;
  }

  uint16_t rawUnsigned = 0;
  if (!readRegister16(ADS1115_CONVERSION_REGISTER, rawUnsigned)) {
    return false;
  }

  const int16_t rawSigned = static_cast<int16_t>(rawUnsigned);
  float measuredVolts =
      static_cast<float>(rawSigned) * ADS1115_FSR_VOLTS / ADS1115_COUNTS;
  if (measuredVolts < 0.0f && measuredVolts > -0.001f) {
    measuredVolts = 0.0f;
  }
  if (measuredVolts < 0.0f) {
    return false;
  }

  volts = measuredVolts;
  return true;
}
}  // namespace

bool readAds1115RawChannels(Ads1115RawChannels &channels) {
  channels = {};
  channels.ain0_ok = readSingleEnded(ADS1115_CONFIG_AIN0, channels.ain0_v);
  channels.ain1_ok = readSingleEnded(ADS1115_CONFIG_AIN1, channels.ain1_v);
  channels.ain2_ok = readSingleEnded(ADS1115_CONFIG_AIN2, channels.ain2_v);
  channels.ain3_ok = readSingleEnded(ADS1115_CONFIG_AIN3, channels.ain3_v);

  return channels.ain0_ok || channels.ain1_ok || channels.ain2_ok || channels.ain3_ok;
}
