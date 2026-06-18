#pragma once

#include <Arduino.h>

struct Ds3231BcdTime {
  uint8_t seconds_bcd;
  uint8_t minutes_bcd;
  uint8_t hours_bcd;
  uint8_t day_bcd;
  uint8_t date_bcd;
  uint8_t month_bcd;
  uint8_t year_bcd;
};

struct Ds3231DecodedTime {
  uint16_t year;
  uint8_t month;
  uint8_t date;
  uint8_t hour;
  uint8_t minute;
  uint8_t second;
};

struct Ds3231RtcStatus {
  bool detected;
  bool register_read_ok;
  bool status_register_read_ok;
  bool time_register_read_ok;
  bool oscillator_stop_flag;
  bool twelve_hour_mode;
  bool decoded_time_ok;
  uint8_t status_register;
  Ds3231BcdTime raw_time;
  Ds3231DecodedTime decoded_time;
};

bool readDs3231RtcStatus(Ds3231RtcStatus &status);
const char *classifyDs3231RtcStatus(const Ds3231RtcStatus &status);
const char *describeDs3231RtcStatus(const Ds3231RtcStatus &status);
