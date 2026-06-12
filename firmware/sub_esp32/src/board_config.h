#pragma once

#include <Arduino.h>

static constexpr uint32_t USB_SERIAL_BAUD = 115200;

static constexpr const char *HW_SCHEMA_VERSION = "hw.v1";
static constexpr const char *SOURCE_NODE_ID = "esp32_sub";
static constexpr const char *TARGET_NODE_ID = "esp32_main";
static constexpr const char *NODE_ROLE = "SAFETY_QC";
static constexpr const char *FIRMWARE_VERSION = "sub-fw-hw-0.1.0";

static constexpr const char *LINK_MAIN_SUB = "link_main_sub";
static constexpr uint32_t NODE_HEALTH_INTERVAL_MS = 1000;
static constexpr uint32_t LINK_HEARTBEAT_INTERVAL_MS = 500;
static constexpr uint32_t LINK_SYNC_INTERVAL_MS = 2000;
static constexpr uint32_t LINK_TIMEOUT_MS = 3000;
static constexpr uint32_t MISSED_HEARTBEAT_THRESHOLD = 3;
