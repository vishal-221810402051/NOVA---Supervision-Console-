from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import asyncio
import os
import random

from gateway_state import GatewayState
from protocol import (
    build_gateway_health_packet as build_hardware_gateway_health_packet,
)
from serial_bridge import SerialBridge
from hardware_stream_manager import HardwareStreamManager

app = FastAPI(title="NOVA SC Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_MODE = os.getenv("NOVA_SC_BACKEND_MODE", "simulator").strip().lower()
if BACKEND_MODE not in {"simulator", "hardware"}:
    BACKEND_MODE = "simulator"

SERIAL_PORT = os.getenv("NOVA_SC_SERIAL_PORT")
try:
    SERIAL_BAUD = int(os.getenv("NOVA_SC_SERIAL_BAUD", "115200"))
except ValueError:
    SERIAL_BAUD = 115200

hardware_gateway_state = GatewayState(
    mode=BACKEND_MODE,
    stream_prefix="PI_STREAM",
    serial_port=SERIAL_PORT,
    baud=SERIAL_BAUD,
)
hardware_packet_queue: asyncio.Queue[dict] = asyncio.Queue()
serial_bridge: SerialBridge | None = None
hardware_stream_manager: HardwareStreamManager | None = None

NODE_IDS = {
    "LAPTOP_CONSOLE": "laptop_console",
    "PI_GATEWAY": "pi_gateway",
    "ESP32_MOTION": "esp32_motion",
    "ESP32_QC": "esp32_qc",
}
LINK_IDS = {
    "LAPTOP_PI": "link_laptop_pi",
    "PI_MAIN": "link_pi_main",
    "MAIN_SUB": "link_main_sub",
}
RUN_ID = "NOVA_SC_PHASE_5_2"
HEALTH_STATES = ["HEALTHY", "DEGRADED", "OFFLINE", "FAIL_SAFE"]
STREAM_ID = "SIM_STREAM_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
GLOBAL_SEQUENCE_NUMBER = 0
SOURCE_SEQUENCE_COUNTERS = {
    NODE_IDS["LAPTOP_CONSOLE"]: 0,
    NODE_IDS["PI_GATEWAY"]: 0,
    NODE_IDS["ESP32_MOTION"]: 0,
    NODE_IDS["ESP32_QC"]: 0,
}
LINK_HEARTBEAT_COUNTERS = {
    LINK_IDS["LAPTOP_PI"]: 0,
    LINK_IDS["PI_MAIN"]: 0,
    LINK_IDS["MAIN_SUB"]: 0,
}


@app.on_event("startup")
async def startup():
    global serial_bridge, hardware_stream_manager
    if BACKEND_MODE != "hardware":
        hardware_gateway_state.set_serial_status(
            serial_connected=False,
            hardware_connected=False,
            bridge_status="DISABLED",
        )
        return

    serial_bridge = SerialBridge(
        state=hardware_gateway_state,
        output_queue=hardware_packet_queue,
        serial_port=SERIAL_PORT,
        baud=SERIAL_BAUD,
    )
    hardware_stream_manager = HardwareStreamManager(
        source_queue=hardware_packet_queue,
        gateway_state=hardware_gateway_state,
        gateway_health_builder=build_hardware_gateway_health_packet,
        gateway_interval_seconds=1.0,
    )
    await hardware_stream_manager.start()
    serial_bridge.start()


@app.on_event("shutdown")
async def shutdown():
    if serial_bridge is not None:
        await serial_bridge.stop()
    if hardware_stream_manager is not None:
        await hardware_stream_manager.stop()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def next_source_sequence(source_node_id: str):
    SOURCE_SEQUENCE_COUNTERS[source_node_id] = SOURCE_SEQUENCE_COUNTERS.get(source_node_id, 0) + 1
    return SOURCE_SEQUENCE_COUNTERS[source_node_id]


def next_global_sequence():
    global GLOBAL_SEQUENCE_NUMBER
    GLOBAL_SEQUENCE_NUMBER += 1
    return GLOBAL_SEQUENCE_NUMBER


def next_link_heartbeat_sequence(link_id: str):
    LINK_HEARTBEAT_COUNTERS[link_id] = LINK_HEARTBEAT_COUNTERS.get(link_id, 0) + 1
    return LINK_HEARTBEAT_COUNTERS[link_id]


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
        "run_id": RUN_ID,
        "node_id": source_node_id,
    }


def build_gateway_health_packet(global_sequence_number: int):
    source_node_id = NODE_IDS["PI_GATEWAY"]
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "GATEWAY_HEALTH_TELEMETRY",
        "payload": {
            "node_id": NODE_IDS["PI_GATEWAY"],
            "health_state": "HEALTHY",
            "uptime_ms": global_sequence_number * 1000,
            "cpu_percent": round(random.uniform(8.0, 28.0), 2),
            "memory_used_percent": round(random.uniform(22.0, 48.0), 2),
            "disk_used_percent": round(random.uniform(12.0, 31.0), 2),
            "buffer_depth": random.randint(0, 3),
            "dropped_packets": 0,
            "status_message": "Gateway simulator healthy",
        },
    }


def build_node_health_packet(
    global_sequence_number: int,
    source_node_id: str,
    role: str,
    status_message: str,
    software_version: str | None = None,
    firmware_version: str | None = None,
    reset_reason: str | None = None,
):
    payload = {
        "node_id": source_node_id,
        "role": role,
        "health_state": "HEALTHY",
        "uptime_ms": global_sequence_number * 1000,
        "status_message": status_message,
    }

    if software_version:
        payload["software_version"] = software_version

    if firmware_version:
        payload["firmware_version"] = firmware_version

    if reset_reason:
        payload["reset_reason"] = reset_reason

    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "NODE_HEALTH_TELEMETRY",
        "payload": payload,
    }


def build_link_heartbeat_packet(
    global_sequence_number: int,
    link_id: str,
    source_node_id: str,
    target_node_id: str,
    heartbeat_interval_ms: int,
):
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "LINK_HEARTBEAT_TELEMETRY",
        "payload": {
            "link_id": link_id,
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
            "heartbeat_sequence_number": next_link_heartbeat_sequence(link_id),
            "heartbeat_interval_ms": heartbeat_interval_ms,
            "timeout_ms": 6000,
            "missed_heartbeat_count": 0,
            "missed_heartbeat_threshold": 3,
            "link_state": "LINK_HEALTHY",
            "sync_state": "SYNCED",
            "last_seen_utc": utc_now(),
            "round_trip_latency_ms": random.randint(2, 18),
        },
    }


def build_link_sync_packet(
    global_sequence_number: int,
    link_id: str,
    source_node_id: str,
    target_node_id: str,
):
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "LINK_SYNC_TELEMETRY",
        "payload": {
            "link_id": link_id,
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
            "sync_state": "SYNCED",
            "clock_skew_ms": random.randint(0, 4),
            "stream_consistent": True,
            "source_sequence_continuous": True,
        },
    }


def build_legacy_system_health_packet(global_sequence_number: int):
    source_node_id = NODE_IDS["PI_GATEWAY"]
    return {
        **build_packet_metadata(global_sequence_number, source_node_id),
        "event_type": "SYSTEM_HEALTH_TELEMETRY",
        "payload": {
            "main_mcu": {
                "node_id": NODE_IDS["ESP32_MOTION"],
                "health_state": "HEALTHY",
                "uptime_ms": global_sequence_number * 1000,
                "firmware_version": "main-fw-sim-0.1.0",
                "free_heap_bytes": random.randint(210000, 280000),
                "reset_reason": "POWER_ON_RESET",
                "brownout_count": 0,
            },
            "sub_mcu": {
                "node_id": NODE_IDS["ESP32_QC"],
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


def build_gateway_forwarded_chip_packet(global_sequence_number: int):
    source_node_id = NODE_IDS["ESP32_MOTION"]
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


def build_gateway_forwarded_power_packet(global_sequence_number: int):
    source_node_id = NODE_IDS["ESP32_MOTION"]
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
    hardware_status = hardware_gateway_state.to_health_status()
    active_stream_id = (
        hardware_status["stream_id"] if BACKEND_MODE == "hardware" else STREAM_ID
    )
    return {
        "backend": "HEALTHY",
        "websocket": "/ws/telemetry",
        "stream_id": active_stream_id,
        "backend_mode": BACKEND_MODE,
        "bridge_status": hardware_status["bridge_status"],
        "serial_port": hardware_status["serial_port"],
        "baud": hardware_status["baud"],
        "serial_connected": hardware_status["serial_connected"],
        "hardware_connected": hardware_status["hardware_connected"],
        "malformed_packet_count": hardware_status["malformed_packet_count"],
        "dropped_packet_count": hardware_status["dropped_packet_count"],
        "last_esp32_main_packet_utc": hardware_status["last_esp32_main_packet_utc"],
        "last_esp32_sub_packet_utc": hardware_status["last_esp32_sub_packet_utc"],
        "last_error": hardware_status["last_error"],
    }


async def stream_hardware_packets(websocket: WebSocket):
    if hardware_stream_manager is None:
        while True:
            await websocket.send_json(
                build_hardware_gateway_health_packet(hardware_gateway_state)
            )
            await asyncio.sleep(1)

    subscriber_queue = await hardware_stream_manager.subscribe()
    try:
        while True:
            packet = await subscriber_queue.get()
            await websocket.send_json(packet)
    finally:
        await hardware_stream_manager.unsubscribe(subscriber_queue)


@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()

    try:
        if BACKEND_MODE == "hardware":
            await stream_hardware_packets(websocket)
            return

        while True:
            packets = []

            packets.append(build_gateway_health_packet(next_global_sequence()))

            packets.append(
                build_node_health_packet(
                    next_global_sequence(),
                    NODE_IDS["PI_GATEWAY"],
                    "GATEWAY",
                    "Pi gateway simulator healthy",
                    software_version="pi-gateway-sim-0.1.0",
                )
            )
            packets.append(
                build_node_health_packet(
                    next_global_sequence(),
                    NODE_IDS["ESP32_MOTION"],
                    "MOTION_CONTROL",
                    "MAIN ESP32 simulator healthy",
                    firmware_version="main-fw-sim-0.1.0",
                    reset_reason="POWER_ON_RESET",
                )
            )
            packets.append(
                build_node_health_packet(
                    next_global_sequence(),
                    NODE_IDS["ESP32_QC"],
                    "SAFETY_QC",
                    "SUB ESP32 simulator healthy",
                    firmware_version="sub-fw-sim-0.1.0",
                    reset_reason="POWER_ON_RESET",
                )
            )

            packets.append(
                build_link_heartbeat_packet(
                    next_global_sequence(),
                    LINK_IDS["LAPTOP_PI"],
                    NODE_IDS["PI_GATEWAY"],
                    NODE_IDS["LAPTOP_CONSOLE"],
                    1000,
                )
            )
            packets.append(
                build_link_heartbeat_packet(
                    next_global_sequence(),
                    LINK_IDS["PI_MAIN"],
                    NODE_IDS["PI_GATEWAY"],
                    NODE_IDS["ESP32_MOTION"],
                    500,
                )
            )
            packets.append(
                build_link_heartbeat_packet(
                    next_global_sequence(),
                    LINK_IDS["MAIN_SUB"],
                    NODE_IDS["ESP32_MOTION"],
                    NODE_IDS["ESP32_QC"],
                    500,
                )
            )

            packets.append(
                build_link_sync_packet(
                    next_global_sequence(),
                    LINK_IDS["LAPTOP_PI"],
                    NODE_IDS["PI_GATEWAY"],
                    NODE_IDS["LAPTOP_CONSOLE"],
                )
            )
            packets.append(
                build_link_sync_packet(
                    next_global_sequence(),
                    LINK_IDS["PI_MAIN"],
                    NODE_IDS["PI_GATEWAY"],
                    NODE_IDS["ESP32_MOTION"],
                )
            )
            packets.append(
                build_link_sync_packet(
                    next_global_sequence(),
                    LINK_IDS["MAIN_SUB"],
                    NODE_IDS["ESP32_MOTION"],
                    NODE_IDS["ESP32_QC"],
                )
            )

            packets.append(build_legacy_system_health_packet(next_global_sequence()))

            packets.append(build_gateway_forwarded_chip_packet(next_global_sequence()))

            packets.append(build_gateway_forwarded_power_packet(next_global_sequence()))

            for packet in packets:
                await websocket.send_json(packet)

            await asyncio.sleep(1)
    except WebSocketDisconnect:
        print("Telemetry WebSocket client disconnected cleanly", flush=True)
    except asyncio.CancelledError:
        raise
