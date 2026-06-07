#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

bool isI2cDeviceDetected(uint8_t address);
void appendI2cDevice(JsonArray devices, const char *name, uint8_t address);
void appendFramPlaceholder(JsonArray devices);
