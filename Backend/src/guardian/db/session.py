"""Async engine/session factory and FastAPI dependency. Nothing is created at import time."""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from guardian.core.config import get_settings


@cache
def get_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True)


@cache
def get_sessionmaker(url: str) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(url), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    async with get_sessionmaker(url)() as session:
        yield session
