#pragma once

#include <Arduino.h>

// NOVA B1 routes PI_CTRL_IF J2 through the ESP32-S3-WROOM-1 UART0 pads:
// MCU_UART_TX -> ESP32-S3 U0TXD / TXD0, MCU_UART_RX -> ESP32-S3 U0RXD / RXD0.
// In the Arduino ESP32-S3 core, the default UART0 pads are GPIO43 (TXD0) and
// GPIO44 (RXD0). Native USB CDC remains on USB Serial for debug output.
static constexpr int MAIN_PI_UART_PORT = 0;
static constexpr int MAIN_PI_UART_TX_PIN = 43;
static constexpr int MAIN_PI_UART_RX_PIN = 44;
static constexpr uint32_t MAIN_PI_UART_BAUD = 115200;

static constexpr const char *HW_SCHEMA_VERSION = "hw.v1";
static constexpr const char *SOURCE_NODE_ID = "esp32_main";
static constexpr const char *TARGET_NODE_ID = "pi_gateway";
static constexpr const char *MAIN_ROLE = "MOTION_CONTROL";
static constexpr const char *FIRMWARE_VERSION = "main-fw-hw-0.1.0";

static constexpr const char *LINK_PI_MAIN = "link_pi_main";
static constexpr uint32_t NODE_HEALTH_INTERVAL_MS = 1000;
static constexpr uint32_t LINK_HEARTBEAT_INTERVAL_MS = 500;
static constexpr uint32_t LINK_SYNC_INTERVAL_MS = 2000;
static constexpr uint32_t CHIP_STATUS_INTERVAL_MS = 5000;
static constexpr uint32_t POWER_HEALTH_INTERVAL_MS = 2000;
static constexpr uint32_t LINK_TIMEOUT_MS = 3000;
static constexpr uint32_t MISSED_HEARTBEAT_THRESHOLD = 3;

// Candidate I2C pins for safe bus probing. Confirm against the final board pin
// map before hardware validation.
static constexpr uint8_t I2C_SDA_PIN = 8;
static constexpr uint8_t I2C_SCL_PIN = 9;

static constexpr uint8_t ADS1115_ADDRESS = 0x48;
static constexpr uint8_t DS3231_RTC_ADDRESS = 0x68;
static constexpr uint8_t PCA9685_1_ADDRESS = 0x40;
static constexpr uint8_t PCA9685_2_ADDRESS = 0x41;
static constexpr uint8_t PCA9685_ALLCALL_ADDRESS = 0x70;

static constexpr const char *FRAM_CHIP_SELECT_LABEL = "FRAM_CS_GPIO10";
