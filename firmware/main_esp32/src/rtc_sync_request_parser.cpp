#include "rtc_sync_request_parser.h"

#include <ArduinoJson.h>
#include <ctype.h>
#include <string.h>

#include "board_config.h"
#include "ds3231_rtc_sync.h"
#include "telemetry_scheduler.h"

extern HardwareSerial PiTelemetrySerial;
extern TelemetryScheduler telemetryScheduler;

namespace {
static constexpr const char *MESSAGE_TYPE = "RTC_SESSION_SYNC_REQUEST";
static constexpr const char *SOURCE = "PI_BACKEND";
static constexpr const char *PI_TIME_STATUS = "PI_TIME_TRUSTED";
static constexpr const char *SAFETY_SCOPE = "RTC_ONLY";
static constexpr const char *SESSION_PREFIX = "RTC_SYNC_";
static constexpr int PROTOCOL_VERSION = 1;
static constexpr int EXPIRY_WINDOW_SECONDS = 10;
static constexpr int MIN_YEAR = 2026;
static constexpr int MAX_YEAR = 2099;
static constexpr size_t EXPECTED_FIELD_COUNT = 10;

static char lineBuffer[PI_RTC_SYNC_MAX_FRAME_LENGTH + 1];
static size_t lineIndex = 0;
static bool discardUntilNewline = false;
static bool overlongResultPending = false;
static char recentSessionIds[PI_RTC_SYNC_SESSION_CACHE_SIZE][PI_RTC_SYNC_SESSION_ID_MAX_LENGTH];
static size_t recentSessionWriteIndex = 0;

struct ParsedUtc {
  int year;
  int month;
  int day;
  int hour;
  int minute;
  int second;
  int millisecond;
};

bool isAllowedField(const char *key);
bool containsForbiddenConcept(const char *key);
bool hasForbiddenField(JsonObject object);
bool hasExactFieldSet(JsonObject object);
bool hasAllRequiredFields(JsonObject object);
bool hasField(JsonObject object, const char *key);
bool isScalar(JsonVariant value);
bool fieldsAreScalar(JsonObject object);
bool getString(JsonObject object, const char *key, const char *&value);
bool validateSessionId(const char *sessionId);
bool isDuplicateSessionId(const char *sessionId);
void rememberSessionId(const char *sessionId);
bool parseUtc(const char *value, ParsedUtc &parsed);
bool validateExpiryWindow(const ParsedUtc &source, const ParsedUtc &expires);
bool isLeapYear(int year);
int daysInMonth(int year, int month);
long daysFromCivil(int year, unsigned month, unsigned day);
long long utcToSeconds(const ParsedUtc &value);
void resetLineBuffer();
void handlePiByte(char c);
void handlePiLine(const char *line);
void emitResult(
    const char *reasonCode,
    const char *reasonDetail,
    const char *requestMessageType = nullptr,
    const char *sessionSyncId = nullptr,
    const char *safetyScope = nullptr);
void emitTransactionResult(
    const Ds3231SyncResult &syncResult,
    const char *requestMessageType,
    const char *sessionSyncId,
    const char *safetyScope);
}  // namespace

void processPiRtcSyncRequests() {
  if (overlongResultPending) {
    emitResult("OVERLONG_FRAME", "Pi RTC sync frame exceeded 512 bytes");
    overlongResultPending = false;
  }

  size_t bytesProcessed = 0;
  while (
      PiTelemetrySerial.available() > 0 &&
      bytesProcessed < PI_RTC_SYNC_MAX_BYTES_PER_LOOP) {
    const int value = PiTelemetrySerial.read();
    if (value < 0) {
      break;
    }

    handlePiByte(static_cast<char>(value));
    bytesProcessed++;
  }
}

namespace {
bool isAllowedField(const char *key) {
  return strcmp(key, "message_type") == 0 ||
         strcmp(key, "protocol_version") == 0 ||
         strcmp(key, "session_sync_id") == 0 ||
         strcmp(key, "source") == 0 ||
         strcmp(key, "source_utc") == 0 ||
         strcmp(key, "expires_at_utc") == 0 ||
         strcmp(key, "pi_time_status") == 0 ||
         strcmp(key, "pi_ntp_synchronized") == 0 ||
         strcmp(key, "safety_scope") == 0 ||
         strcmp(key, "no_forward_to_sub") == 0;
}

bool containsForbiddenConcept(const char *key) {
  if (strcmp(key, "no_forward_to_sub") == 0) {
    return false;
  }

  static constexpr const char *FORBIDDEN[] = {
      "command", "target", "gpio", "pwm", "actuator", "sub", "motor",
      "servo", "stepper", "pump", "valve", "relay", "heater", "output",
  };

  char lowered[64];
  size_t index = 0;
  while (key[index] != '\0' && index < sizeof(lowered) - 1) {
    lowered[index] = static_cast<char>(tolower(static_cast<unsigned char>(key[index])));
    index++;
  }
  lowered[index] = '\0';

  for (const char *token : FORBIDDEN) {
    if (strstr(lowered, token) != nullptr) {
      return true;
    }
  }
  return false;
}

bool hasForbiddenField(JsonObject object) {
  for (JsonPair field : object) {
    const char *key = field.key().c_str();
    if (!isAllowedField(key) && containsForbiddenConcept(key)) {
      return true;
    }
  }
  return false;
}

bool hasExactFieldSet(JsonObject object) {
  size_t count = 0;
  for (JsonPair field : object) {
    count++;
    if (!isAllowedField(field.key().c_str())) {
      return false;
    }
  }
  return count == EXPECTED_FIELD_COUNT;
}

bool hasAllRequiredFields(JsonObject object) {
  return hasField(object, "message_type") &&
         hasField(object, "protocol_version") &&
         hasField(object, "session_sync_id") &&
         hasField(object, "source") &&
         hasField(object, "source_utc") &&
         hasField(object, "expires_at_utc") &&
         hasField(object, "pi_time_status") &&
         hasField(object, "pi_ntp_synchronized") &&
         hasField(object, "safety_scope") &&
         hasField(object, "no_forward_to_sub");
}

bool hasField(JsonObject object, const char *key) {
  for (JsonPair field : object) {
    if (strcmp(field.key().c_str(), key) == 0) {
      return true;
    }
  }
  return false;
}

bool isScalar(JsonVariant value) {
  return value.is<const char *>() ||
         value.is<int>() ||
         value.is<bool>() ||
         value.isNull();
}

bool fieldsAreScalar(JsonObject object) {
  for (JsonPair field : object) {
    if (!isScalar(field.value())) {
      return false;
    }
  }
  return true;
}

bool getString(JsonObject object, const char *key, const char *&value) {
  if (!object[key].is<const char *>()) {
    return false;
  }
  value = object[key].as<const char *>();
  return value != nullptr;
}

bool validateSessionId(const char *sessionId) {
  if (sessionId == nullptr) {
    return false;
  }
  const size_t prefixLength = strlen(SESSION_PREFIX);
  if (strncmp(sessionId, SESSION_PREFIX, prefixLength) != 0) {
    return false;
  }

  const char *uuid = sessionId + prefixLength;
  if (strlen(uuid) != 36) {
    return false;
  }

  for (size_t i = 0; i < 36; i++) {
    const char c = uuid[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') {
        return false;
      }
      continue;
    }
    if (!isxdigit(static_cast<unsigned char>(c))) {
      return false;
    }
  }

  if (uuid[14] != '4') {
    return false;
  }

  const char variant = static_cast<char>(tolower(static_cast<unsigned char>(uuid[19])));
  return variant == '8' || variant == '9' || variant == 'a' || variant == 'b';
}

bool isDuplicateSessionId(const char *sessionId) {
  for (size_t i = 0; i < PI_RTC_SYNC_SESSION_CACHE_SIZE; i++) {
    if (recentSessionIds[i][0] != '\0' && strcmp(recentSessionIds[i], sessionId) == 0) {
      return true;
    }
  }
  return false;
}

void rememberSessionId(const char *sessionId) {
  strncpy(
      recentSessionIds[recentSessionWriteIndex],
      sessionId,
      PI_RTC_SYNC_SESSION_ID_MAX_LENGTH - 1);
  recentSessionIds[recentSessionWriteIndex][PI_RTC_SYNC_SESSION_ID_MAX_LENGTH - 1] = '\0';
  recentSessionWriteIndex =
      (recentSessionWriteIndex + 1) % PI_RTC_SYNC_SESSION_CACHE_SIZE;
}

bool parseTwoDigits(const char *value, size_t offset, int &out) {
  if (!isdigit(static_cast<unsigned char>(value[offset])) ||
      !isdigit(static_cast<unsigned char>(value[offset + 1]))) {
    return false;
  }
  out = ((value[offset] - '0') * 10) + (value[offset + 1] - '0');
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
  if (parsed.month < 1 || parsed.month > 12 ||
      parsed.day < 1 || parsed.day > daysInMonth(parsed.year, parsed.month) ||
      parsed.hour < 0 || parsed.hour > 23 ||
      parsed.minute < 0 || parsed.minute > 59 ||
      parsed.second < 0 || parsed.second > 59 ||
      parsed.millisecond < 0 || parsed.millisecond > 999) {
    return false;
  }
  return true;
}

bool validateExpiryWindow(const ParsedUtc &source, const ParsedUtc &expires) {
  if (source.millisecond != expires.millisecond) {
    return false;
  }
  return utcToSeconds(expires) - utcToSeconds(source) == EXPIRY_WINDOW_SECONDS;
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

void resetLineBuffer() {
  lineIndex = 0;
  lineBuffer[0] = '\0';
}

void handlePiByte(char c) {
  if (c == '\r') {
    return;
  }

  if (discardUntilNewline) {
    if (c == '\n') {
      discardUntilNewline = false;
      resetLineBuffer();
      overlongResultPending = true;
    }
    return;
  }

  if (c == '\n') {
    lineBuffer[lineIndex] = '\0';
    if (lineIndex > 0) {
      handlePiLine(lineBuffer);
    }
    resetLineBuffer();
    return;
  }

  if (lineIndex >= PI_RTC_SYNC_MAX_FRAME_LENGTH) {
    discardUntilNewline = true;
    resetLineBuffer();
    return;
  }

  lineBuffer[lineIndex++] = c;
}

void handlePiLine(const char *line) {
  if (line[0] != '{') {
    emitResult("MALFORMED_JSON", "Pi RTC sync frame must be a JSON object");
    return;
  }

  StaticJsonDocument<768> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error) {
    emitResult("MALFORMED_JSON", "Pi RTC sync frame was not valid JSON");
    return;
  }
  if (!doc.is<JsonObject>()) {
    emitResult("MALFORMED_JSON", "Pi RTC sync frame root must be a JSON object");
    return;
  }

  JsonObject object = doc.as<JsonObject>();
  if (hasForbiddenField(object)) {
    emitResult("FORBIDDEN_FIELD", "Request contains a forbidden control or forwarding field");
    return;
  }
  if (!hasExactFieldSet(object)) {
    bool missing = !hasAllRequiredFields(object);
    emitResult(
        missing ? "MISSING_FIELD" : "EXTRA_FIELD",
        missing ? "Request is missing one or more required fields"
                : "Request contains fields outside the allowlist");
    return;
  }
  if (!fieldsAreScalar(object)) {
    emitResult("MALFORMED_JSON", "Request fields must be scalar values");
    return;
  }

  const char *requestMessageType = nullptr;
  const char *sessionSyncId = nullptr;
  const char *source = nullptr;
  const char *sourceUtc = nullptr;
  const char *expiresAtUtc = nullptr;
  const char *piTimeStatus = nullptr;
  const char *safetyScope = nullptr;

  if (!getString(object, "message_type", requestMessageType) ||
      strcmp(requestMessageType, MESSAGE_TYPE) != 0) {
    emitResult(
        "UNKNOWN_MESSAGE_TYPE",
        "Only RTC_SESSION_SYNC_REQUEST is accepted",
        requestMessageType);
    return;
  }

  if (!object["protocol_version"].is<int>() ||
      object["protocol_version"].as<int>() != PROTOCOL_VERSION) {
    emitResult(
        "BAD_PROTOCOL_VERSION",
        "protocol_version must be 1",
        requestMessageType);
    return;
  }

  if (!getString(object, "session_sync_id", sessionSyncId) ||
      !validateSessionId(sessionSyncId)) {
    emitResult(
        "BAD_SESSION_SYNC_ID",
        "session_sync_id must be RTC_SYNC_ followed by a UUID4",
        requestMessageType);
    return;
  }
  if (isDuplicateSessionId(sessionSyncId)) {
    emitResult(
        "DUPLICATE_SESSION_SYNC_ID",
        "session_sync_id was already observed",
        requestMessageType,
        sessionSyncId);
    return;
  }
  rememberSessionId(sessionSyncId);

  if (!getString(object, "source", source) || strcmp(source, SOURCE) != 0) {
    emitResult(
        "BAD_SOURCE",
        "source must be PI_BACKEND",
        requestMessageType,
        sessionSyncId);
    return;
  }

  if (!getString(object, "pi_time_status", piTimeStatus) ||
      strcmp(piTimeStatus, PI_TIME_STATUS) != 0) {
    emitResult(
        "BAD_PI_TIME_STATUS",
        "pi_time_status must be PI_TIME_TRUSTED",
        requestMessageType,
        sessionSyncId);
    return;
  }

  if (!object["pi_ntp_synchronized"].is<bool>() ||
      object["pi_ntp_synchronized"].as<bool>() != true) {
    emitResult(
        "NTP_NOT_SYNCHRONIZED",
        "pi_ntp_synchronized must be true",
        requestMessageType,
        sessionSyncId);
    return;
  }

  if (!getString(object, "safety_scope", safetyScope) ||
      strcmp(safetyScope, SAFETY_SCOPE) != 0) {
    emitResult(
        "BAD_SAFETY_SCOPE",
        "safety_scope must be RTC_ONLY",
        requestMessageType,
        sessionSyncId);
    return;
  }

  if (!object["no_forward_to_sub"].is<bool>() ||
      object["no_forward_to_sub"].as<bool>() != true) {
    emitResult(
        "FORWARD_TO_SUB_NOT_ALLOWED",
        "no_forward_to_sub must be true",
        requestMessageType,
        sessionSyncId,
        safetyScope);
    return;
  }

  ParsedUtc parsedSource;
  ParsedUtc parsedExpires;
  if (!getString(object, "source_utc", sourceUtc) ||
      !getString(object, "expires_at_utc", expiresAtUtc) ||
      !parseUtc(sourceUtc, parsedSource) ||
      !parseUtc(expiresAtUtc, parsedExpires)) {
    emitResult(
        "BAD_UTC_FORMAT",
        "source_utc and expires_at_utc must use YYYY-MM-DDTHH:MM:SS.mmmZ",
        requestMessageType,
        sessionSyncId,
        safetyScope);
    return;
  }
  if (!validateExpiryWindow(parsedSource, parsedExpires)) {
    emitResult(
        "BAD_EXPIRY_WINDOW",
        "expires_at_utc must be exactly 10 seconds after source_utc",
        requestMessageType,
        sessionSyncId,
        safetyScope);
    return;
  }

  Ds3231SyncResult syncResult;
  performDs3231SessionSync(sourceUtc, syncResult);
  emitTransactionResult(syncResult, requestMessageType, sessionSyncId, safetyScope);
}

void emitResult(
    const char *reasonCode,
    const char *reasonDetail,
    const char *requestMessageType,
    const char *sessionSyncId,
    const char *safetyScope) {
  RtcSyncResultTelemetry result = {
      requestMessageType,
      sessionSyncId,
      false,
      "REJECTED",
      reasonCode,
      reasonDetail,
      safetyScope,
      false,
      false,
      false,
      false,
      false,
      false,
      0,
      false,
      false,
      false,
      false,
      false,
      nullptr,
      nullptr,
  };
  telemetryScheduler.emitRtcSyncResult(result);
}

void emitTransactionResult(
    const Ds3231SyncResult &syncResult,
    const char *requestMessageType,
    const char *sessionSyncId,
    const char *safetyScope) {
  const bool success =
      syncResult.write_ok &&
      syncResult.readback_ok &&
      syncResult.osf_cleared &&
      strcmp(syncResult.rtc_validity_class_after_sync, "RTC_VALIDATION_READY") == 0;
  RtcSyncResultTelemetry result = {
      requestMessageType,
      sessionSyncId,
      success,
      success ? "RTC_SYNC_SUCCESS" : "RTC_SYNC_FAILED",
      success ? nullptr : syncResult.sync_error,
      success ? nullptr : syncResult.status_message,
      safetyScope,
      syncResult.write_attempted,
      syncResult.osf_clear_attempted,
      true,
      syncResult.write_ok,
      syncResult.readback_ok,
      syncResult.readback_delta_available,
      syncResult.readback_delta_ms,
      syncResult.osf_before_available,
      syncResult.osf_before,
      syncResult.osf_after_available,
      syncResult.osf_after,
      syncResult.osf_cleared,
      syncResult.rtc_validity_class_after_sync,
      success ? "RTC synchronized; retention validation pending" : syncResult.status_message,
  };
  telemetryScheduler.emitRtcSyncResult(result);
}
}  // namespace
