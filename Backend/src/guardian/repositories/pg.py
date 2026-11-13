"""Sync Postgres stores over the async repositories, through `DbBridge` (DB-002).

Attempts and runs are a write-through cache: loaded once at construction, reads come from memory,
every mutation also goes to the database. Events need no cache: the indexer is their only writer."""

from __future__ import annotations

from guardian.chain.base import ChainEvent
from guardian.db.bridge import DbBridge
from guardian.repositories.events import EventRepo
from guardian.repositories.records import RecordRepo
from guardian.services.runtime import (
    AttemptRec,
    InMemoryAttemptStore,
    InMemoryScenarioRunStore,
    ScenarioRunRec,
)


class PgAttemptStore(InMemoryAttemptStore):
    def __init__(self, bridge: DbBridge) -> None:
        super().__init__()
        self._bridge, self._repo = bridge, RecordRepo(bridge.sessions)
        self._items = sorted(bridge.run(self._repo.attempts()), key=lambda a: a.id)

    def add(self, rec: AttemptRec) -> None:
        super().add(rec)
        self.save(rec)

    def save(self, rec: AttemptRec) -> None:
        self._bridge.run(self._repo.save_attempt(rec))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.clear_attempts())


class PgScenarioRunStore(InMemoryScenarioRunStore):
    def __init__(self, bridge: DbBridge) -> None:
        super().__init__()
        self._bridge, self._repo = bridge, RecordRepo(bridge.sessions)
        for r in sorted(
            bridge.run(self._repo.runs()), key=lambda r: int(r.id.removeprefix("run-"))
        ):
            self._items[r.id] = r

    def save(self, run: ScenarioRunRec) -> None:
        super().save(run)
        self._bridge.run(self._repo.save_run(run))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.clear_runs())


class PgEventSink:
    """`EventSink` on the `events` table; `meta.last_block_l1` is the indexer cursor."""

    def __init__(self, bridge: DbBridge) -> None:
        self._bridge, self._repo = bridge, EventRepo(bridge.sessions)

    def write(self, event: ChainEvent) -> bool:
        return self._bridge.run(self._repo.add(event))

    def last_block(self) -> int | None:
        v = self._bridge.run(self._repo.meta_get("last_block_l1"))
        return None if v is None else int(v)

    def last_block_c(self) -> int | None:
        v = self._bridge.run(self._repo.meta_get("last_block_c"))
        return None if v is None else int(v)

    def set_last_block(self, block: int) -> None:
        self._bridge.run(self._repo.meta_set("last_block_l1", str(block)))

    def events_in_range(self, first: int, last: int) -> list[ChainEvent]:
        return self._bridge.run(self._repo.in_range(first, last))

    def remove(self, tx_hash: str, log_index: int) -> bool:
        return self._bridge.run(self._repo.remove(tx_hash, log_index))

    def all(self) -> list[ChainEvent]:
        return self.events_in_range(0, 2**62)

    def recent(self, n: int) -> list[ChainEvent]:
        return self._bridge.run(self._repo.recent(n))
