"""Sync Postgres stores over the async repositories, through `DbBridge` (DB-002, DB-003).

Attempts, runs, proposals, agent runs, assistant logs, findings and sim runs are a write-through cache: loaded once at construction, reads come from memory,
every mutation also goes to the database. Events need no cache: the indexer is their only writer."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from guardian.chain.base import ChainEvent
from guardian.db.bridge import DbBridge
from guardian.models import AgentRun, AssistantLog, Finding, Proposal, SimRun
from guardian.repositories import records as rec
from guardian.repositories.events import EventRepo
from guardian.repositories.records import RecordRepo
from guardian.services.runtime import (
    AgentRunRec,
    AssistantLogRec,
    AttemptRec,
    FindingRec,
    InMemoryAttemptStore,
    InMemoryFindingStore,
    InMemoryRecStore,
    InMemoryScenarioRunStore,
    InMemorySimRunStore,
    ProposalRec,
    ScenarioRunRec,
    SimRunRec,
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
            if r.status == "running":  # its task died with the old process (killed, no shutdown)
                r.status, r.error = "failed", "interrupted"
                self._bridge.run(self._repo.save_run(r))
            self._items[r.id] = r

    def save(self, run: ScenarioRunRec) -> None:
        super().save(run)
        self._bridge.run(self._repo.save_run(run))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.clear_runs())


class PgProposalStore(InMemoryRecStore[ProposalRec]):
    def __init__(
        self, bridge: DbBridge, chain_view: Callable[[int], tuple[str, list[str]]]
    ) -> None:
        super().__init__()
        self._bridge, self._repo, self._view = bridge, RecordRepo(bridge.sessions), chain_view
        for r in bridge.run(self._repo.load(Proposal)):
            self._items[int(r.id)] = rec._proposal_rec(r)

    def add(self, r: ProposalRec) -> None:
        super().add(r)
        self.save(r)

    def save(self, r: ProposalRec) -> None:
        self._bridge.run(self._repo.save_proposal(r, *self._view(r.id)))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.wipe(Proposal))


class _PgWriteThrough[T](InMemoryRecStore[T]):
    """Agent runs and assistant logs: the whole rec travels in one jsonb column (`{"rec": {...}}`)."""

    model: Any
    column: str
    row: Callable[[Any], Any]
    cls: type[Any]

    def __init__(self, bridge: DbBridge) -> None:
        super().__init__()
        self._bridge, self._repo = bridge, RecordRepo(bridge.sessions)
        for r in bridge.run(self._repo.load(self.model)):
            x = self.cls(**getattr(r, self.column)["rec"])
            self._items[x.id] = x

    def add(self, r: T) -> None:
        super().add(r)
        self.save(r)

    def save(self, r: T) -> None:
        self._bridge.run(self._repo.put(type(self).row(r)))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.wipe(self.model))


class PgAgentRunStore(_PgWriteThrough[AgentRunRec]):
    model, column, cls = AgentRun, "decision", AgentRunRec
    row = staticmethod(rec._agent_run_row)


class PgAssistantLogStore(_PgWriteThrough[AssistantLogRec]):
    model, column, cls = AssistantLog, "answer", AssistantLogRec
    row = staticmethod(rec._assistant_row)


class PgFindingStore(InMemoryFindingStore):
    def __init__(self, bridge: DbBridge) -> None:
        super().__init__()
        self._bridge, self._repo = bridge, RecordRepo(bridge.sessions)
        for r in bridge.run(self._repo.load(Finding)):
            self._items[r.id] = rec._finding_rec(r)

    def _put(self, f: FindingRec) -> None:
        super()._put(f)
        self._bridge.run(self._repo.put(rec._finding_row(f)))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.wipe(Finding))


class PgSimRunStore(InMemorySimRunStore):
    def __init__(self, bridge: DbBridge) -> None:
        super().__init__()
        self._bridge, self._repo = bridge, RecordRepo(bridge.sessions)
        self._items = sorted(
            (rec._sim_rec(r) for r in bridge.run(self._repo.load(SimRun))), key=lambda x: int(x.id)
        )

    def add(self, r: SimRunRec) -> None:
        super().add(r)
        self._bridge.run(self._repo.put(rec._sim_row(r)))

    def clear(self) -> None:
        super().clear()
        self._bridge.run(self._repo.wipe(SimRun))


class PgMeta:
    """`meta` key/value (graph_version, policy_version); loaded once, written through."""

    def __init__(self, bridge: DbBridge) -> None:
        self._bridge, self._repo = bridge, EventRepo(bridge.sessions)

    def get(self, key: str) -> str | None:
        return self._bridge.run(self._repo.meta_get(key))

    def set(self, key: str, value: str) -> None:
        self._bridge.run(self._repo.meta_set(key, value))


class PgEventSink:
    """`EventSink` on the `events` table; `meta.last_block_l1` is the indexer cursor. `chain='sim'`: the sim
    chain's events (replayed at restart, DB-003); the cursor methods are only meaningful for 'l1'."""

    def __init__(self, bridge: DbBridge, chain: str = "l1") -> None:
        self._bridge, self._repo = bridge, EventRepo(bridge.sessions, chain)

    def clear(self) -> None:
        self._bridge.run(self._repo.clear())

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
