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
STREAM_ID = "SIM_STREAM_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
GLOBAL_SEQUENCE_NUMBER = 0
SOURCE_SEQUENCE_COUNTERS = {
    "laptop_console": 0,
    "esp32_motion": 0,
    "esp32_qc": 0,
}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def next_source_sequence(source_node_id: str):
    SOURCE_SEQUENCE_COUNTERS[source_node_id] = SOURCE_SEQUENCE_COUNTERS.get(source_node_id, 0) + 1
    return SOURCE_SEQUENCE_COUNTERS[source_node_id]


def next_global_sequence():
    global GLOBAL_SEQUENCE_NUMBER
    GLOBAL_SEQUENCE_NUMBER += 1
    return GLOBAL_SEQUENCE_NUMBER


def build_packet_metadata(global_sequence_number: int, source_node_id: str):
    producer_timestamp_utc = utc_now()
    supervisor_received_utc = utc_now()

    return {
        "schema_version": "v1.0",
        "stream_id": STREAM_ID,
        "global_sequence_number": global_sequence_number,
        "source_node_id": source_node_id,
        "source_sequence_number": next_source_sequence(source_node_id),
        "producer_timestamp_utc": producer_timestamp_utc,
        "supervisor_received_utc": supervisor_received_utc,
        "timestamp_utc": supervisor_received_utc,
        "sequence_number": global_sequence_number,
        "run_id": "NOVA_SC_PHASE_5_0C",
        "node_id": source_node_id,
    }


def build_health_packet(global_sequence_number: int):
    source_node_id = "laptop_console"
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "SYSTEM_HEALTH_TELEMETRY",
        "payload": {
            "main_mcu": {
                "node_id": "esp32_motion",
                "health_state": "HEALTHY",
                "uptime_ms": global_sequence_number * 1000,
                "firmware_version": "main-fw-sim-0.1.0",
                "free_heap_bytes": random.randint(210000, 280000),
                "reset_reason": "POWER_ON_RESET",
                "brownout_count": 0,
            },
            "sub_mcu": {
                "node_id": "esp32_qc",
                "health_state": "HEALTHY",
                "uptime_ms": global_sequence_number * 1000,
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
                "tx_packets": global_sequence_number,
                "rx_packets": global_sequence_number,
                "crc_errors": 0,
                "dropped_packets": 0,
            },
        },
    }


def build_chip_packet(global_sequence_number: int):
    source_node_id = "esp32_motion"
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
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


def build_power_packet(global_sequence_number: int):
    source_node_id = "esp32_motion"
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
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
    return {"backend": "HEALTHY", "websocket": "/ws/telemetry", "stream_id": STREAM_ID}


@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()

    while True:
        packets = []

        packets.append(build_health_packet(next_global_sequence()))

        packets.append(build_chip_packet(next_global_sequence()))

        packets.append(build_power_packet(next_global_sequence()))

        for packet in packets:
            await websocket.send_json(packet)

        await asyncio.sleep(1)
