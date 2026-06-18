#include "ds3231_rtc_reader.h"

#include <Wire.h>

#include "board_config.h"

namespace {
static constexpr uint8_t DS3231_SECONDS_REGISTER = 0x00;
static constexpr uint8_t DS3231_STATUS_REGISTER = 0x0F;
static constexpr uint8_t DS3231_OSF_MASK = 0x80;

bool readRegister(uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const uint8_t bytesRequested = 1;
  if (Wire.requestFrom(DS3231_RTC_ADDRESS, bytesRequested) != bytesRequested) {
    return false;
  }
  if (Wire.available() < bytesRequested) {
    return false;
  }

  value = static_cast<uint8_t>(Wire.read());
  return true;
}

bool readTimeRegisters(Ds3231BcdTime &time) {
  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  Wire.write(DS3231_SECONDS_REGISTER);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const uint8_t bytesRequested = 7;
  if (Wire.requestFrom(DS3231_RTC_ADDRESS, bytesRequested) != bytesRequested) {
    return false;
  }
  if (Wire.available() < bytesRequested) {
    return false;
  }

  time.seconds_bcd = static_cast<uint8_t>(Wire.read());
  time.minutes_bcd = static_cast<uint8_t>(Wire.read());
  time.hours_bcd = static_cast<uint8_t>(Wire.read());
  time.day_bcd = static_cast<uint8_t>(Wire.read());
  time.date_bcd = static_cast<uint8_t>(Wire.read());
  time.month_bcd = static_cast<uint8_t>(Wire.read());
  time.year_bcd = static_cast<uint8_t>(Wire.read());
  return true;
}

uint8_t bcdToDecimal(uint8_t value) {
  return static_cast<uint8_t>(((value >> 4) * 10) + (value & 0x0F));
}

bool isValidBcd(uint8_t value, uint8_t maxHighNibble, uint8_t maxValue) {
  const uint8_t low = value & 0x0F;
  const uint8_t high = (value >> 4) & 0x0F;
  if (low > 9 || high > maxHighNibble) {
    return false;
  }
  return bcdToDecimal(value) <= maxValue;
}

bool decodeTime(const Ds3231BcdTime &raw, Ds3231DecodedTime &decoded) {
  const uint8_t seconds = raw.seconds_bcd & 0x7F;
  const uint8_t minutes = raw.minutes_bcd & 0x7F;
  const uint8_t hours = raw.hours_bcd;
  const uint8_t date = raw.date_bcd & 0x3F;
  const uint8_t month = raw.month_bcd & 0x1F;
  const uint8_t year = raw.year_bcd;

  if (!isValidBcd(seconds, 5, 59) || !isValidBcd(minutes, 5, 59)) {
    return false;
  }
  if ((hours & 0x40) != 0) {
    return false;
  }
  if (!isValidBcd(hours & 0x3F, 2, 23)) {
    return false;
  }
  if (!isValidBcd(raw.day_bcd & 0x07, 0, 7)) {
    return false;
  }
  if (!isValidBcd(date, 3, 31) || bcdToDecimal(date) == 0) {
    return false;
  }
  if (!isValidBcd(month, 1, 12) || bcdToDecimal(month) == 0) {
    return false;
  }
  if (!isValidBcd(year, 9, 99)) {
    return false;
  }

  decoded.year = static_cast<uint16_t>(2000 + bcdToDecimal(year));
  decoded.month = bcdToDecimal(month);
  decoded.date = bcdToDecimal(date);
  decoded.hour = bcdToDecimal(hours & 0x3F);
  decoded.minute = bcdToDecimal(minutes);
  decoded.second = bcdToDecimal(seconds);
  return true;
}
}  // namespace

bool readDs3231RtcStatus(Ds3231RtcStatus &status) {
  status = {};

  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  status.detected = Wire.endTransmission() == 0;
  if (!status.detected) {
    return false;
  }

  status.status_register_read_ok =
      readRegister(DS3231_STATUS_REGISTER, status.status_register);
  if (status.status_register_read_ok) {
    status.oscillator_stop_flag =
        (status.status_register & DS3231_OSF_MASK) != 0;
  }

  status.time_register_read_ok = readTimeRegisters(status.raw_time);
  if (status.time_register_read_ok) {
    status.twelve_hour_mode = (status.raw_time.hours_bcd & 0x40) != 0;
    status.decoded_time_ok = decodeTime(status.raw_time, status.decoded_time);
  }

  status.register_read_ok =
      status.status_register_read_ok && status.time_register_read_ok;
  return status.register_read_ok;
}

const char *classifyDs3231RtcStatus(const Ds3231RtcStatus &status) {
  if (!status.detected) {
    return "RTC_NOT_DETECTED";
  }
  if (!status.register_read_ok) {
    return "RTC_REGISTER_READ_ERROR";
  }
  if (status.oscillator_stop_flag) {
    return "RTC_OSCILLATOR_STOPPED";
  }
  if (status.twelve_hour_mode) {
    return "RTC_12H_MODE_UNSUPPORTED";
  }
  if (!status.decoded_time_ok) {
    return "RTC_TIME_READ_ERROR";
  }
  return "RTC_TIME_VALIDATION_PENDING";
}

const char *describeDs3231RtcStatus(const Ds3231RtcStatus &status) {
  if (!status.detected) {
    return "Read-only RTC telemetry: DS3231 not detected; not timestamp authority";
  }
  if (!status.register_read_ok) {
    return "Read-only RTC telemetry: DS3231 register read failed; not timestamp authority";
  }
  if (status.oscillator_stop_flag) {
    return "Read-only RTC telemetry: oscillator stop flag set; time invalid; not timestamp authority";
  }
  if (status.twelve_hour_mode) {
    return "Read-only RTC telemetry: 12-hour mode unsupported; not timestamp authority";
  }
  if (!status.decoded_time_ok) {
    return "Read-only RTC telemetry: RTC time could not be decoded; not timestamp authority";
  }
  return "Read-only RTC telemetry: battery configured; time unverified; not timestamp authority";
}
