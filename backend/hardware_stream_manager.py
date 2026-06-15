from __future__ import annotations

import asyncio
from typing import Any, Callable

from gateway_state import GatewayState


class HardwareStreamManager:
    def __init__(
        self,
        *,
        source_queue: asyncio.Queue[dict[str, Any]],
        gateway_state: GatewayState,
        gateway_health_builder: Callable[[GatewayState], dict[str, Any]],
        gateway_interval_seconds: float = 1.0,
        subscriber_queue_size: int = 500,
    ) -> None:
        self.source_queue = source_queue
        self.gateway_state = gateway_state
        self.gateway_health_builder = gateway_health_builder
        self.gateway_interval_seconds = gateway_interval_seconds
        self.subscriber_queue_size = subscriber_queue_size
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._subscribers_lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return

        self._running = True
        self._task = asyncio.create_task(self._run())
        print("Hardware stream manager started", flush=True)

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        async with self._subscribers_lock:
            self._subscribers.clear()
        print("Hardware stream manager stopped", flush=True)

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
            maxsize=self.subscriber_queue_size
        )
        async with self._subscribers_lock:
            self._subscribers.add(queue)
            subscriber_count = len(self._subscribers)
        print(
            f"Hardware stream subscriber connected count={subscriber_count}",
            flush=True,
        )
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._subscribers_lock:
            self._subscribers.discard(queue)
            subscriber_count = len(self._subscribers)
        print(
            f"Hardware stream subscriber disconnected count={subscriber_count}",
            flush=True,
        )

    async def _run(self) -> None:
        next_gateway_health_at = 0.0

        while self._running:
            try:
                packet = self.source_queue.get_nowait()
            except asyncio.QueueEmpty:
                packet = None

            if packet is not None:
                await self._broadcast(packet)
                continue

            loop_time = asyncio.get_running_loop().time()

            if loop_time >= next_gateway_health_at:
                await self._broadcast(self.gateway_health_builder(self.gateway_state))
                next_gateway_health_at = loop_time + self.gateway_interval_seconds
                continue

            try:
                timeout = max(0.0, min(0.1, next_gateway_health_at - loop_time))
                packet = await asyncio.wait_for(self.source_queue.get(), timeout=timeout)
            except asyncio.TimeoutError:
                continue

            await self._broadcast(packet)

    async def _broadcast(self, packet: dict[str, Any]) -> None:
        async with self._subscribers_lock:
            subscribers = list(self._subscribers)

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(packet)
            except asyncio.QueueFull:
                # Slow clients lose their own copy only; the hardware stream keeps moving.
                pass
