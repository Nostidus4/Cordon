"""Sync -> async bridge: services and the indexer thread are synchronous, the repositories are async.

Owns a daemon thread with its own event loop and its own engine (asyncpg connections are loop-bound,
so the shared `get_engine` cannot be used from here).
"""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Coroutine
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

T = TypeVar("T")


class DbBridge:
    def __init__(self, url: str, timeout: float = 30.0) -> None:
        self.timeout = timeout
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True, name="db-bridge").start()
        self._engine = create_async_engine(url, pool_pre_ping=True)
        self.sessions: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self._engine, expire_on_commit=False
        )

    def run(self, coro: Coroutine[Any, Any, T]) -> T:
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(self.timeout)

    def close(self) -> None:
        self.run(self._engine.dispose())
        self._loop.call_soon_threadsafe(self._loop.stop)
