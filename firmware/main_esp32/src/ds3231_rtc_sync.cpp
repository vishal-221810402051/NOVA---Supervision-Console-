#include "ds3231_rtc_sync.h"

#include <Wire.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "board_config.h"
#include "ds3231_rtc_reader.h"

namespace {
static constexpr uint8_t DS3231_SECONDS_REGISTER = 0x00;
static constexpr uint8_t DS3231_STATUS_REGISTER = 0x0F;
static constexpr uint8_t DS3231_OSF_MASK = 0x80;
static constexpr long READBACK_TOLERANCE_MS = 2000;
static constexpr int MIN_YEAR = 2026;
static constexpr int MAX_YEAR = 2099;

struct ParsedUtc {
  int year;
  int month;
  int day;
  int hour;
  int minute;
  int second;
  int millisecond;
};

void resetResult(Ds3231SyncResult &result);
void failResult(
    Ds3231SyncResult &result,
    const char *syncError,
    const char *statusMessage);
bool parseUtc(const char *value, ParsedUtc &parsed);
bool parseTwoDigits(const char *value, size_t offset, int &out);
bool parseThreeDigits(const char *value, size_t offset, int &out);
bool parseFourDigits(const char *value, size_t offset, int &out);
bool isLeapYear(int year);
int daysInMonth(int year, int month);
uint8_t decimalToBcd(int value);
uint8_t dayOfWeekForDs3231(const ParsedUtc &value);
long daysFromCivil(int year, unsigned month, unsigned day);
long long utcToSeconds(const ParsedUtc &value);
long absoluteLong(long value);
bool readStatusRegister(uint8_t &statusRegister);
bool writeStatusRegister(uint8_t statusRegister);
bool writeTimeRegisters(const ParsedUtc &sourceUtc);
bool readbackTime(ParsedUtc &readbackUtc);
bool decodeReadbackTime(const Ds3231RtcStatus &status, ParsedUtc &readbackUtc);
}  // namespace

bool performDs3231SessionSync(const char *sourceUtc, Ds3231SyncResult &result) {
  resetResult(result);

  ParsedUtc parsedSource;
  if (!parseUtc(sourceUtc, parsedSource)) {
    failResult(
        result,
        "INVALID_SOURCE_UTC",
        "RTC sync source UTC is invalid; no DS3231 write attempted");
    return false;
  }

  uint8_t statusBefore = 0;
  if (!readStatusRegister(statusBefore)) {
    failResult(
        result,
        "STATUS_READ_FAILED",
        "DS3231 status register read failed before sync; no write attempted");
    return false;
  }
  result.osf_before = (statusBefore & DS3231_OSF_MASK) != 0;
  result.osf_before_available = true;

  result.write_attempted = true;
  result.write_ok = writeTimeRegisters(parsedSource);
  if (!result.write_ok) {
    failResult(
        result,
        "TIME_WRITE_FAILED",
        "DS3231 time register write failed; OSF left unchanged");
    return false;
  }

  ParsedUtc readbackUtc;
  result.readback_attempted = true;
  result.readback_ok = readbackTime(readbackUtc);
  if (!result.readback_ok) {
    failResult(
        result,
        "READBACK_FAILED",
        "DS3231 readback failed after time write; OSF left unchanged");
    return false;
  }

  const long long readbackDeltaSeconds =
      utcToSeconds(readbackUtc) - utcToSeconds(parsedSource);
  const long readbackDeltaMs =
      static_cast<long>(readbackDeltaSeconds * 1000LL - parsedSource.millisecond);
  result.readback_delta_ms = readbackDeltaMs;
  result.readback_delta_available = true;
  if (absoluteLong(readbackDeltaMs) > READBACK_TOLERANCE_MS) {
    failResult(
        result,
        "READBACK_DELTA_EXCEEDED",
        "DS3231 readback delta exceeded tolerance; OSF left unchanged");
    return false;
  }

  result.osf_clear_attempted = true;
  const uint8_t statusAfterClear = static_cast<uint8_t>(statusBefore & ~DS3231_OSF_MASK);
  if (!writeStatusRegister(statusAfterClear)) {
    failResult(
        result,
        "OSF_CLEAR_FAILED",
        "DS3231 OSF clear write failed after successful readback");
    return false;
  }

  uint8_t statusAfter = 0;
  if (!readStatusRegister(statusAfter)) {
    failResult(
        result,
        "STATUS_REREAD_FAILED",
        "DS3231 status re-read failed after OSF clear attempt");
    return false;
  }

  result.osf_after = (statusAfter & DS3231_OSF_MASK) != 0;
  result.osf_after_available = true;
  result.osf_cleared = !result.osf_after;
  if (!result.osf_cleared) {
    failResult(
        result,
        "OSF_STILL_SET",
        "DS3231 OSF remained set after clear attempt");
    return false;
  }

  result.rtc_validity_class_after_sync = "RTC_VALIDATION_READY";
  result.sync_result = "SYNC_PREPARED";
  result.sync_error = nullptr;
  result.status_message =
      "DS3231 time write/readback succeeded; RTC is validation-ready, not timestamp authority";
  return true;
}

namespace {
void resetResult(Ds3231SyncResult &result) {
  result.write_attempted = false;
  result.write_ok = false;
  result.readback_attempted = false;
  result.readback_ok = false;
  result.readback_delta_available = false;
  result.readback_delta_ms = 0;
  result.osf_before_available = false;
  result.osf_before = false;
  result.osf_after_available = false;
  result.osf_after = false;
  result.osf_clear_attempted = false;
  result.osf_cleared = false;
  result.rtc_validity_class_after_sync = "RTC_NOT_VALIDATED";
  result.sync_result = "SYNC_FAILED";
  result.sync_error = nullptr;
  result.status_message = nullptr;
}

void failResult(
    Ds3231SyncResult &result,
    const char *syncError,
    const char *statusMessage) {
  result.osf_cleared = false;
  result.rtc_validity_class_after_sync =
      result.osf_before_available && result.osf_before
          ? "RTC_PRESENT_TIME_INVALID_OSF"
          : "RTC_PRESENT_TIME_UNVALIDATED";
  result.sync_result = "SYNC_FAILED";
  result.sync_error = syncError;
  result.status_message = statusMessage;
}

bool parseUtc(const char *value, ParsedUtc &parsed) {
  if (value == nullptr || strlen(value) != 24) {
    return false;
  }
  if (value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
      value[13] != ':' || value[16] != ':' || value[19] != '.' ||
      value[23] != 'Z') {
    return false;
  }
  if (!parseFourDigits(value, 0, parsed.year) ||
      !parseTwoDigits(value, 5, parsed.month) ||
      !parseTwoDigits(value, 8, parsed.day) ||
      !parseTwoDigits(value, 11, parsed.hour) ||
      !parseTwoDigits(value, 14, parsed.minute) ||
      !parseTwoDigits(value, 17, parsed.second) ||
      !parseThreeDigits(value, 20, parsed.millisecond)) {
    return false;
  }
  if (parsed.year < MIN_YEAR || parsed.year > MAX_YEAR) {
    return false;
  }
  return parsed.month >= 1 && parsed.month <= 12 &&
         parsed.day >= 1 && parsed.day <= daysInMonth(parsed.year, parsed.month) &&
         parsed.hour >= 0 && parsed.hour <= 23 &&
         parsed.minute >= 0 && parsed.minute <= 59 &&
         parsed.second >= 0 && parsed.second <= 59 &&
         parsed.millisecond >= 0 && parsed.millisecond <= 999;
}

bool parseTwoDigits(const char *value, size_t offset, int &out) {
  if (!isdigit(static_cast<unsigned char>(value[offset])) ||
      !isdigit(static_cast<unsigned char>(value[offset + 1]))) {
    return false;
  }
  out = ((value[offset] - '0') * 10) + (value[offset + 1] - '0');
  return true;
}

bool parseThreeDigits(const char *value, size_t offset, int &out) {
  out = 0;
  for (size_t i = 0; i < 3; i++) {
    if (!isdigit(static_cast<unsigned char>(value[offset + i]))) {
      return false;
    }
    out = (out * 10) + (value[offset + i] - '0');
  }
  return true;
}

bool parseFourDigits(const char *value, size_t offset, int &out) {
  out = 0;
  for (size_t i = 0; i < 4; i++) {
    if (!isdigit(static_cast<unsigned char>(value[offset + i]))) {
      return false;
    }
    out = (out * 10) + (value[offset + i] - '0');
  }
  return true;
}

bool isLeapYear(int year) {
  return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
}

int daysInMonth(int year, int month) {
  static constexpr int DAYS_BY_MONTH[] = {
      0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  };
  if (month == 2 && isLeapYear(year)) {
    return 29;
  }
  if (month < 1 || month > 12) {
    return 0;
  }
  return DAYS_BY_MONTH[month];
}

uint8_t decimalToBcd(int value) {
  return static_cast<uint8_t>(((value / 10) << 4) | (value % 10));
}

uint8_t dayOfWeekForDs3231(const ParsedUtc &value) {
  const long days = daysFromCivil(value.year, value.month, value.day);
  return static_cast<uint8_t>(((days + 4) % 7 + 7) % 7 + 1);
}

long daysFromCivil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(year - era * 400);
  const unsigned doy =
      (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097L + static_cast<long>(doe) - 719468L;
}

long long utcToSeconds(const ParsedUtc &value) {
  return static_cast<long long>(daysFromCivil(value.year, value.month, value.day)) * 86400LL +
         static_cast<long long>(value.hour) * 3600LL +
         static_cast<long long>(value.minute) * 60LL +
         static_cast<long long>(value.second);
}

long absoluteLong(long value) {
  return value < 0 ? -value : value;
}

bool readStatusRegister(uint8_t &statusRegister) {
  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  Wire.write(DS3231_STATUS_REGISTER);
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

  statusRegister = static_cast<uint8_t>(Wire.read());
  return true;
}

bool writeStatusRegister(uint8_t statusRegister) {
  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  Wire.write(DS3231_STATUS_REGISTER);
  Wire.write(statusRegister);
  return Wire.endTransmission() == 0;
}

bool writeTimeRegisters(const ParsedUtc &sourceUtc) {
  Wire.beginTransmission(DS3231_RTC_ADDRESS);
  Wire.write(DS3231_SECONDS_REGISTER);
  Wire.write(decimalToBcd(sourceUtc.second));
  Wire.write(decimalToBcd(sourceUtc.minute));
  Wire.write(decimalToBcd(sourceUtc.hour) & 0x3F);
  Wire.write(decimalToBcd(dayOfWeekForDs3231(sourceUtc)));
  Wire.write(decimalToBcd(sourceUtc.day));
  Wire.write(decimalToBcd(sourceUtc.month) & 0x1F);
  Wire.write(decimalToBcd(sourceUtc.year - 2000));
  return Wire.endTransmission() == 0;
}

bool readbackTime(ParsedUtc &readbackUtc) {
  Ds3231RtcStatus status;
  if (!readDs3231RtcStatus(status)) {
    return false;
  }
  return decodeReadbackTime(status, readbackUtc);
}

bool decodeReadbackTime(const Ds3231RtcStatus &status, ParsedUtc &readbackUtc) {
  if (!status.decoded_time_ok || status.twelve_hour_mode) {
    return false;
  }
  readbackUtc.year = status.decoded_time.year;
  readbackUtc.month = status.decoded_time.month;
  readbackUtc.day = status.decoded_time.date;
  readbackUtc.hour = status.decoded_time.hour;
  readbackUtc.minute = status.decoded_time.minute;
  readbackUtc.second = status.decoded_time.second;
  readbackUtc.millisecond = 0;
  return readbackUtc.year >= MIN_YEAR && readbackUtc.year <= MAX_YEAR;
}
}  // namespace
