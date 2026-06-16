#pragma once

#include <Arduino.h>

struct Ads1115RawChannels {
  bool ain0_ok;
  bool ain1_ok;
  bool ain2_ok;
  bool ain3_ok;
  float ain0_v;
  float ain1_v;
  float ain2_v;
  float ain3_v;
};

bool readAds1115RawChannels(Ads1115RawChannels &channels);

