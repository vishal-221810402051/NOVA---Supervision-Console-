from __future__ import annotations

from typing import Any

from gateway_state import GatewayState
from hardware_validator import ValidatedHardwarePacket
from protocol import PACKET_TYPE_TO_EVENT_TYPE, build_packet_metadata


def normalize_hardware_packet(
    packet: ValidatedHardwarePacket,
    state: GatewayState,
) -> dict[str, Any]:
    event_type = PACKET_TYPE_TO_EVENT_TYPE[packet.packet_type]
    state.observe_source_packet(packet.source_node_id, packet.source_sequence_number)

    payload = dict(packet.payload)
    if packet.packet_type in {"NODE_HEALTH", "LINK_HEARTBEAT", "LINK_SYNC"}:
        payload.setdefault("source_node_id", packet.source_node_id)
        if packet.target_node_id:
            payload.setdefault("target_node_id", packet.target_node_id)
    if packet.packet_type == "NODE_HEALTH":
        payload.setdefault("node_id", packet.source_node_id)

    return {
        **build_packet_metadata(
            state=state,
            source_node_id=packet.source_node_id,
            source_sequence_number=packet.source_sequence_number,
        ),
        "event_type": event_type,
        "payload": payload,
    }
