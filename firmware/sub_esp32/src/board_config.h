#pragma once

#include <Arduino.h>

static constexpr uint32_t USB_SERIAL_BAUD = 115200;

// Phase 6.7A: SUB telemetry is mirrored to physical TXD0.
// U10 TXD0 / SUB_TO_MAIN_UART -> U9 MAIN IO47 / SUB_TO_MAIN_UART.
// RX is intentionally disabled. No command path exists.
static constexpr bool SUB_UART_OUTPUT_ENABLED = true;
static constexpr int SUB_MAIN_UART_PORT = 0;
static constexpr int SUB_MAIN_UART_TX_PIN = 43;
static constexpr int SUB_MAIN_UART_RX_PIN = -1;
static constexpr uint32_t SUB_MAIN_UART_BAUD = 115200;

// Phase 6.7C: prevent truncated NODE_HEALTH JSON from reaching USB/UART.
static constexpr size_t SUB_TELEMETRY_JSON_BUFFER_SIZE = 1536;
static constexpr size_t SUB_TELEMETRY_LINE_BUFFER_SIZE = 1536;

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
