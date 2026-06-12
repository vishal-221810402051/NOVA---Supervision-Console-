#pragma once

#include <Arduino.h>

void setupSubTelemetryUart();
void processSubTelemetryForwarding();

uint32_t getSubForwardedLineCount();
uint32_t getSubDroppedLineCount();
uint32_t getSubOverlongLineCount();
