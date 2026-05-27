from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import asyncio
import random

app = FastAPI(title="NOVA SC Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HEALTH_STATES = ["HEALTHY", "DEGRADED", "OFFLINE", "FAIL_SAFE"]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def build_health_packet(sequence_number: int):
    return {
        "schema_version": "v1.0",
        "timestamp_utc": utc_now(),
        "sequence_number": sequence_number,
        "run_id": "NOVA_SC_PHASE_1",
        "node_id": "laptop_console",
        "event_type": "SYSTEM_HEALTH_TELEMETRY",
        "payload": {
            "main_mcu": {
                "node_id": "esp32_motion",
                "health_state": "HEALTHY",
                "uptime_ms": sequence_number * 1000,
                "firmware_version": "main-fw-sim-0.1.0",
                "free_heap_bytes": random.randint(210000, 280000),
                "reset_reason": "POWER_ON_RESET",
                "brownout_count": 0,
            },
            "sub_mcu": {
                "node_id": "esp32_qc",
                "health_state": "HEALTHY",
                "uptime_ms": sequence_number * 1000,
                "firmware_version": "sub-fw-sim-0.1.0",
                "free_heap_bytes": random.randint(210000, 280000),
                "reset_reason": "POWER_ON_RESET",
                "brownout_count": 0,
            },
            "wifi": {
                "connection_state": "CONNECTED",
                "rssi_dbm": random.randint(-62, -42),
                "latency_ms": random.randint(4, 25),
            },
            "main_sub_uart": {
                "link_state": "ACTIVE",
                "tx_packets": sequence_number,
                "rx_packets": sequence_number,
                "crc_errors": 0,
                "dropped_packets": 0,
            },
        },
    }


def build_chip_packet(sequence_number: int):
    return {
        "schema_version": "v1.0",
        "timestamp_utc": utc_now(),
        "sequence_number": sequence_number,
        "run_id": "NOVA_SC_PHASE_1",
        "node_id": "esp32_motion",
        "event_type": "CHIP_STATUS_TELEMETRY",
        "payload": {
            "i2c_devices": [
                {"name": "ADS1115", "bus": "I2C", "address": "0x48", "status": "DETECTED"},
                {"name": "DS3231_RTC", "bus": "I2C", "address": "0x68", "status": "DETECTED"},
                {"name": "PCA9685_1", "bus": "I2C", "address": "0x40", "status": "DETECTED"},
                {"name": "PCA9685_2", "bus": "I2C", "address": "0x41", "status": "DETECTED"},
                {"name": "PCA9685_ALLCALL", "bus": "I2C", "address": "0x70", "status": "DETECTED"},
            ],
            "spi_devices": [
                {
                    "name": "MB85RS256B_FRAM",
                    "bus": "SPI",
                    "chip_select": "FRAM_CS_GPIO10",
                    "status": "BLOCKED_WRONG_IC_PENDING",
                }
            ],
        },
    }


def build_power_packet(sequence_number: int):
    return {
        "schema_version": "v1.0",
        "timestamp_utc": utc_now(),
        "sequence_number": sequence_number,
        "run_id": "NOVA_SC_PHASE_1",
        "node_id": "esp32_motion",
        "event_type": "POWER_HEALTH_TELEMETRY",
        "payload": {
            "vin_protected_v": 7.0,
            "rail_5v_v": round(random.uniform(4.95, 5.05), 3),
            "rail_3v3_v": round(random.uniform(3.27, 3.34), 3),
            "brownout_detected": False,
            "power_state": "HEALTHY",
        },
    }


@app.get("/")
def root():
    return {"service": "NOVA SC Backend", "status": "HEALTHY"}


@app.get("/health")
def health():
    return {"backend": "HEALTHY", "websocket": "/ws/telemetry"}


@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    sequence_number = 0

    while True:
        packets = []

        sequence_number += 1
        packets.append(build_health_packet(sequence_number))

        sequence_number += 1
        packets.append(build_chip_packet(sequence_number))

        sequence_number += 1
        packets.append(build_power_packet(sequence_number))

        for packet in packets:
            await websocket.send_json(packet)

        await asyncio.sleep(1)
