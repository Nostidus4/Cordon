"""Async repository for `events` and `meta`. Idempotent on (tx_hash, log_index)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from guardian.chain.base import ChainEvent
from guardian.models import Event, Meta

Sessions = async_sessionmaker[AsyncSession]


def _to_event(r: Event) -> ChainEvent:
    return ChainEvent(
        r.name, r.block, r.tx_hash, r.log_index, r.payload, int(r.ts.timestamp()),
        simulated=r.chain in ("sim", "c"),  # c = simulated top-up transfers (IDX-002)
    )  # fmt: skip


class EventRepo:
    """Events of one chain: 'l1' (the indexer) or 'sim' (the in-memory chain, replayed at restart, DB-003).
    Every query filters on it so the L1 indexer never sees sim rows."""

    def __init__(self, sessions: Sessions, chain: str = "l1") -> None:
        self._s = sessions
        self._chain = chain

    async def add(self, ev: ChainEvent) -> bool:
        stmt = (
            insert(Event)
            .values(
                chain=self._chain,
                block=ev.block,
                tx_hash=ev.tx_hash,
                log_index=ev.log_index,
                name=ev.name,
                payload=ev.payload,
                ts=datetime.fromtimestamp(ev.ts, UTC),
            )
            .on_conflict_do_nothing(index_elements=["tx_hash", "log_index"])
            .returning(Event.id)
        )
        async with self._s.begin() as s:
            return (await s.execute(stmt)).first() is not None

    async def remove(self, tx_hash: str, log_index: int) -> bool:
        stmt = delete(Event).where(
            Event.chain == self._chain, Event.tx_hash == tx_hash, Event.log_index == log_index
        )
        async with self._s.begin() as s:
            return (await s.execute(stmt)).rowcount > 0  # type: ignore[attr-defined,no-any-return]

    async def in_range(self, first: int, last: int) -> list[ChainEvent]:
        stmt = (
            select(Event)
            .where(Event.chain == self._chain, Event.block >= first, Event.block <= last)
            .order_by(Event.block, Event.log_index)
        )
        async with self._s() as s:
            return [_to_event(r) for r in (await s.scalars(stmt)).all()]

    async def recent(self, n: int) -> list[ChainEvent]:
        stmt = (
            select(Event)
            .where(Event.chain == self._chain)
            .order_by(Event.block.desc(), Event.log_index.desc())
            .limit(n)
        )
        async with self._s() as s:
            return [_to_event(r) for r in reversed((await s.scalars(stmt)).all())]

    async def count(self) -> int:
        async with self._s() as s:
            return (
                await s.scalar(
                    select(func.count()).select_from(Event).where(Event.chain == self._chain)
                )
            ) or 0

    async def clear(self) -> None:
        async with self._s.begin() as s:
            await s.execute(delete(Event).where(Event.chain == self._chain))

    async def meta_get(self, key: str) -> str | None:
        async with self._s() as s:
            return await s.scalar(select(Meta.value).where(Meta.key == key))

    async def meta_set(self, key: str, value: str) -> None:
        stmt = insert(Meta).values(key=key, value=value)
        stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": value})
        async with self._s.begin() as s:
            await s.execute(stmt)
