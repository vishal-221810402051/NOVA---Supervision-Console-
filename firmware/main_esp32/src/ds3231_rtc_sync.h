#pragma once

#include <Arduino.h>

struct Ds3231SyncResult {
  bool write_attempted;
  bool write_ok;
  bool readback_attempted;
  bool readback_ok;
  bool readback_delta_available;
  long readback_delta_ms;
  bool osf_before_available;
  bool osf_before;
  bool osf_after_available;
  bool osf_after;
  bool osf_clear_attempted;
  bool osf_cleared;
  const char *rtc_validity_class_after_sync;
  const char *sync_result;
  const char *sync_error;
  const char *status_message;
};

bool performDs3231SessionSync(const char *sourceUtc, Ds3231SyncResult &result);
