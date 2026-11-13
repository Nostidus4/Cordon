"""Process-wide Runtime: a ChainPort (SimChain, or L1Chain for CHAIN_MODE=l1) + in-memory stores +
SSE event bus + graph version.

Persistence: with `DATABASE_URL` set, attempts/scenario_runs/events live in Postgres (DB-002; write-through
cache, see `repositories/pg.py`); proposals/agent_runs/assistant_logs are still in memory only (DB-003).

Concurrency: route handlers are `async def` and call the sync SimChain without awaiting in the
middle of a chain operation, so chain access is serialised by the event loop. SimChain
subscriber callbacks are bridged to SSE through `EventBus.publish` (thread-safe).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

from eth_utils import to_checksum_address

from guardian.chain.base import ChainEvent, DemoChain
from guardian.chain.factory import new_sim_chain
from guardian.core.config import Settings
from guardian.core.demo_guard import DemoGuard, ensure_test_chain
from guardian.domain.address_book import build_address_book
from guardian.domain.snapshot import KeyState, PolicySnapshot
from guardian.graph.findings import compute_findings
from guardian.services import views
from guardian.services.event_bus import EventBus
from guardian.workers.health import BlockWatch, LatencyStats
from guardian.workers.indexer import Indexer

if TYPE_CHECKING:
    from guardian.db.bridge import DbBridge

EVENT_LOG_SIZE = 5000
RESPONDER_EVENTS = frozenset({"Paused", "Executed"})
log = logging.getLogger("guardian.runtime")


def _on_loop(loop: asyncio.AbstractEventLoop) -> bool:
    try:
        return asyncio.get_running_loop() is loop
    except RuntimeError:
        return False


@dataclass
class AttemptRec:
    id: int
    scenario_run_id: str | None
    step: int | None
    display_time: str | None
    signer: str  # seed id (key_*, council_*)
    signer_label: str
    principal_id: str | None
    action: str  # pay | swap | lock | raw_call
    outcome: str  # ok | reverted | blocked_at_protocol | blocked (simulate said no, not sent)
    reason_code: str | None
    tx_hash: str | None
    error_raw: str | None
    block: int | None
    ts: int
    amount: dict[str, str] | None = None
    token: str | None = None
    to: str | None = None
    to_label: str | None = None
    principal_spent_after: dict[str, str] | None = None
    key_spent_after: dict[str, str] | None = None
    simulated: bool = True
    source: str = "server"  # server | agent | external | copilot


@dataclass
class ScenarioRunRec:
    id: str
    status: str  # running | waiting_lock | completed | failed
    delay: float
    started_at: int
    policy_version: int
    finished_at: int | None = None
    error: str | None = None


@dataclass
class ProposalRec:
    id: int
    title: str
    subject_principal: str | None
    change: dict[str, Any] | None
    calls: list[dict[str, Any]]  # graph vocabulary (what describe_vi / the UI read)
    description_vi: list[str]
    risk_report: dict[str, Any]  # raw graph.risk_report dict, frozen at proposal time
    risk_report_hash: str
    proposer: str
    created_at: int
    finding_id: str | None = None
    report_basis: str = "live"  # live | policy_v2_reference (seeded request #12)
    executed_at: int | None = None
    executed_tx_hash: str | None = None


@dataclass
class AgentRunRec:
    id: int
    ts: int
    outcome: str  # swapped | blocked | no_action | reverted
    decision: dict[str, Any] | None
    reason_text: str | None
    reason_source: str | None
    reason_hash: str | None
    tx_hash: str | None
    reason_code: str | None
    attempt_id: int | None
    balances: dict[str, Any] = field(default_factory=dict)
    steps: list[dict[str, Any]] = field(default_factory=list)  # AgentStep dicts (CITY_OPS §2)
    untrusted_input: str | None = None
    injection_ignored: bool | None = None
    # CITY-005: the LLM sentence that failed the guardrail (we stored the template instead)
    rejected_reason_text: str | None = None


@dataclass
class AssistantLogRec:
    id: int
    ts: int
    question_id: str | None
    question: str
    answer: str
    numbers_verified: bool
    screen: str | None = None
    flagged_untrusted: bool = False  # set by the responder (B02): answer marked as not trustworthy


@dataclass
class IncidentRec:
    """One responder incident (CITY_OPS §4). `internal` holds the responder's own bookkeeping."""

    id: int
    building: str
    title_vi: str
    status: str  # detected | contained | awaiting_council | recovering | resolved
    opened_at: int
    kind: str  # attempts | agent | conflict | assistant | paused
    fault_id: str | None = None
    resolved_at: int | None = None
    principal_id: str | None = None
    key: str | None = None
    trigger: dict[str, Any] = field(default_factory=dict)
    steps: list[dict[str, Any]] = field(default_factory=list)
    proposal_id: int | None = None
    internal: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConflictRec:
    ts: int
    member: str
    proposal_id: int


class AttemptStore(Protocol):
    def add(self, rec: AttemptRec) -> None: ...
    def save(self, rec: AttemptRec) -> None:
        """Persist an in-place mutation of a rec that was added before."""
        ...

    def all(self) -> list[AttemptRec]: ...  # id order
    def clear(self) -> None: ...


class ScenarioRunStore(Protocol):
    def save(self, run: ScenarioRunRec) -> None: ...  # upsert
    def get(self, run_id: str) -> ScenarioRunRec | None: ...
    def all(self) -> list[ScenarioRunRec]: ...  # start order
    def latest(self) -> ScenarioRunRec | None: ...
    def clear(self) -> None: ...


class InMemoryAttemptStore:
    def __init__(self) -> None:
        self._items: list[AttemptRec] = []

    def add(self, rec: AttemptRec) -> None:
        self._items.append(rec)

    def save(self, rec: AttemptRec) -> None:
        pass  # the rec is the stored object

    def all(self) -> list[AttemptRec]:
        return list(self._items)

    def clear(self) -> None:
        self._items.clear()


class InMemoryScenarioRunStore:
    def __init__(self) -> None:
        self._items: dict[str, ScenarioRunRec] = {}

    def save(self, run: ScenarioRunRec) -> None:
        self._items[run.id] = run

    def get(self, run_id: str) -> ScenarioRunRec | None:
        return self._items.get(run_id)

    def all(self) -> list[ScenarioRunRec]:
        return list(self._items.values())

    def latest(self) -> ScenarioRunRec | None:
        return next(reversed(self._items.values()), None)

    def clear(self) -> None:
        self._items.clear()


class Stores:
    """Attempts and scenario runs are in memory or Postgres (`database_url`, DB-002); the rest is in memory (DB-003)."""

    def __init__(self, database_url: str = "") -> None:
        self.bridge: DbBridge | None = None
        self.attempts: AttemptStore = InMemoryAttemptStore()
        self.runs: ScenarioRunStore = InMemoryScenarioRunStore()
        if database_url:
            from guardian.db.bridge import DbBridge
            from guardian.repositories.pg import PgAttemptStore, PgScenarioRunStore

            self.bridge = DbBridge(database_url)
            self.attempts, self.runs = PgAttemptStore(self.bridge), PgScenarioRunStore(self.bridge)
        self._reset_rest()
        # never collide with persisted ids
        self._ids = max((a.id for a in self.attempts.all()), default=0)

    def _reset_rest(self) -> None:
        self.proposals: dict[int, ProposalRec] = {}
        self.agent_runs: list[AgentRunRec] = []
        self.assistant_logs: list[AssistantLogRec] = []
        self.conflicts: list[ConflictRec] = []
        self.incidents: list[IncidentRec] = []
        self.fault_attempts: dict[
            int, str
        ] = {}  # attempt id -> fault id (CITY-005 violations board)
        self.copilot_drafts: dict[
            int, Any
        ] = {}  # CopilotDraftRec (assistant/copilot/models.py), CITY-004
        self.tx_checks: dict[int, Any] = {}  # B05 Tx Guardian checks (TxCheckOut), CITY-003
        self._ids = 0
        self._incident_ids = 0
        self._txcheck_ids = 0

    def clear(self) -> None:
        self.attempts.clear()  # before runs: attempts reference them
        self.runs.clear()
        self._reset_rest()

    def next_id(self) -> int:
        self._ids += 1
        return self._ids

    def next_incident_id(self) -> int:
        self._incident_ids += 1
        return self._incident_ids

    def next_txcheck_id(self) -> int:
        self._txcheck_ids += 1
        return self._txcheck_ids


class Runtime:
    def __init__(
        self,
        settings: Settings,
        chain: DemoChain | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.settings = settings
        self.clock = clock
        self.is_l1 = settings.chain_mode == "l1"
        if chain is None:
            if self.is_l1:
                from guardian.chain.l1.startup import build_l1_chain

                chain = build_l1_chain(settings)  # L1StartupError: clear, no traceback to read
            else:
                chain = new_sim_chain()
        self.chain: Any = chain  # ChainPort + the extras both implementations have (balance...)
        if self.is_l1:
            ensure_test_chain(settings, int(self.chain.w3.eth.chain_id))
        self.bus = EventBus()
        self.guard = DemoGuard(settings)
        self.stores = Stores(settings.database_url)
        self.llm_client: Any = None  # built lazily by core.llm.open_session; tests inject a fake
        self.graph_version = 1
        self._book: dict[str, str] | None = None
        self.scenario_tasks: dict[str, asyncio.Task[None]] = {}
        self.event_log: deque[ChainEvent] = deque(maxlen=EVENT_LOG_SIZE)
        self.indexer: Indexer | None = None
        # sim mints a block per tx only, so an idle sim demo is not a stall
        self.block_watch = BlockWatch(self.clock, stall_after=60.0 if self.is_l1 else None)
        self.sse_latency = LatencyStats()
        self._live = not self.is_l1  # L1: the backfill at startup is recorded, not streamed
        self._last_city: list[tuple[str, str, str]] | None = None
        self._in_responder = False  # set by responder.react
        self._responder_task: asyncio.Task[None] | None = None
        self._unsubscribe: Callable[[], None] = lambda: None
        if self.is_l1:
            self._start_indexer()
        else:
            self._unsubscribe = self.chain.subscribe(self._on_chain_event)

    def _start_indexer(self) -> None:
        """L1 event bridge: the idempotent indexer reads the chain and feeds the SSE bus.

        The first cycle (backfill from the deployment block) runs synchronously so `event_log` is
        complete before the first request; after it, only new events reach SSE."""
        from guardian.workers.indexer import Indexer, InMemoryEventSink, L1ChainSource

        s = self.settings
        sink: Any = InMemoryEventSink()
        if self.stores.bridge is not None:
            from guardian.repositories.pg import PgEventSink

            sink = PgEventSink(self.stores.bridge)
            if not self.event_log:  # history survives a restart (a reload keeps the log it has)
                self.event_log.extend(sink.recent(EVENT_LOG_SIZE))
        self.indexer = Indexer(
            L1ChainSource(self.chain),
            sink,
            publish=self._on_chain_event,
            poll_interval=s.l1_poll_interval_seconds,
            reorg_window=s.indexer_reorg_window,
            confirmations=s.indexer_confirmations,
        )
        self.indexer.sync_once()
        self._live = True
        self.indexer.start()

    def reload_deployment(self) -> None:
        """L1 only (demo-reset, OPS-003): switch to the deployment the deployments file holds NOW, no restart.

        Builds the new `L1Chain` first (a bad file raises before anything is touched), then stops the old
        indexer, swaps the chain and starts a new indexer at the new deployment block. `event_log` is kept:
        the events of the old deployments stay in the store (spec 14.2 "keep events"); the new deployment's
        events are appended after the backfill, which is recorded, not streamed."""
        from guardian.chain.l1.startup import build_l1_chain

        new_chain = build_l1_chain(self.settings)
        ensure_test_chain(self.settings, int(new_chain.w3.eth.chain_id))
        if self.indexer is not None:
            self.indexer.stop()
            self.indexer = None
        old = self.chain
        self._live = False
        self.chain = new_chain
        self._last_city = None
        self._book = None  # L1 addresses change with the deployment
        close = getattr(old, "close", None)
        if close is not None:
            close()
        self._start_indexer()

    # ------------------------------------------------------------------ lifecycle
    def bind_loop(self, loop: asyncio.AbstractEventLoop | None) -> None:
        self.bus.bind_loop(loop)

    def start_responder_ticker(self, interval: float = 2.0) -> None:
        """Time-based incident transitions (recovering -> resolved) need a clock tick, not only events."""
        if self._responder_task is not None or not self.settings.responder_enabled:
            return

        async def loop() -> None:
            while True:
                await asyncio.sleep(interval)
                try:
                    self.responder_tick()
                except Exception:
                    log.exception("responder tick failed")

        self._responder_task = asyncio.get_running_loop().create_task(loop())

    async def shutdown(self) -> None:
        if self._responder_task is not None:
            self._responder_task.cancel()
            self._responder_task = None
        tasks = list(self.scenario_tasks.values())
        for t in tasks:
            t.cancel()
        # let their `finally` (runs.save) finish while the DB bridge is still open
        await asyncio.gather(*tasks, return_exceptions=True)
        self._unsubscribe()
        if self.indexer is not None:
            self.indexer.stop()
        close = getattr(self.chain, "close", None)
        if close is not None:
            close()
        if self.stores.bridge is not None:
            self.stores.bridge.close()

    # ------------------------------------------------------------------ helpers
    def now(self) -> int:
        return int(self.clock())

    def snapshot(self) -> PolicySnapshot:
        return self.chain.snapshot()

    def addr(self, ref: str) -> str:
        """Id (`key_minh`, `lan`, `tUSDC`, `vault`...) or hex -> the checksum address ChainPort wants (CHN-004)."""
        if ref.startswith("0x") and len(ref) == 42:
            return to_checksum_address(ref)
        if self._book is None or ref not in self._book:  # (re)build: a key may be added at runtime
            self._book = build_address_book(self.chain.snapshot(), self.chain.vault_addr)
        if ref in self._book:
            return self._book[ref]
        raise KeyError(f"unknown address ref {ref!r}")

    def findings(self) -> list[dict[str, Any]]:
        return compute_findings(self.snapshot())

    def token_decimals(self) -> dict[str, int]:
        return {t.address: t.decimals for t in self.snapshot().tokens}

    def key_by_seed(self, seed_id: str, snap: PolicySnapshot | None = None) -> KeyState:
        for k in (snap or self.snapshot()).keys.values():
            if k.seed_id == seed_id:
                return k
        raise KeyError(seed_id)

    def label_of(self, address_or_seed: str) -> str:
        snap = self.snapshot()
        for k in snap.keys.values():
            if k.seed_id == address_or_seed or k.address == address_or_seed:
                return k.label
        for m in snap.council:
            if address_or_seed in (m.id, m.address, f"council_{m.id}"):
                return m.label
        for r in snap.recipients:
            if address_or_seed in (r.seed_id, r.address):
                return r.label
        return address_or_seed

    # ------------------------------------------------------------------ SSE bridge
    def _on_chain_event(self, ev: ChainEvent) -> None:
        self.event_log.append(ev)
        if self._live:
            t0 = time.perf_counter()
            item = views.api_event(ev, self.token_decimals())

            def publish_and_record() -> None:
                self.bus.publish("event", item)
                self.sse_latency.record(time.perf_counter() - t0)

            # bus.publish hops threads itself; measure receipt -> fan-out by running it on the loop
            loop = self.bus._loop
            if loop is not None and not loop.is_closed() and not _on_loop(loop):
                loop.call_soon_threadsafe(publish_and_record)
            else:
                publish_and_record()
            if ev.name in RESPONDER_EVENTS:
                self._schedule_responder_tick()

    def _schedule_responder_tick(self) -> None:
        """Chain events can arrive from the indexer thread (L1) or inside a chain call (sim): never act
        there, hop to the event loop and let the responder look at the stores."""
        loop = self.bus._loop
        if loop is not None and not loop.is_closed() and self.settings.responder_enabled:
            loop.call_soon_threadsafe(self.responder_tick)

    def responder_tick(self, publish: bool = True) -> Any:
        """Run the responder once (idempotent, never re-entrant). With `publish`, a change it made is announced
        (graph/proposal/city/incident SSE) through `notify_state_changed`."""
        if not self.settings.responder_enabled:
            return None
        from guardian.services import responder

        res = responder.react(self)
        if publish and (res.changed or res.chain_touched):
            self.notify_state_changed(graph=res.chain_touched)
        return res

    def publish(self, event_type: str, data: dict[str, Any]) -> None:
        self.bus.publish(event_type, data)

    def city_states(self) -> dict[str, Any]:
        from guardian.services.city_state import compute_city_states

        return compute_city_states(self)

    def notify_state_changed(
        self, proposal_ids: tuple[int, ...] = (), force_city: bool = False, graph: bool = True
    ) -> None:
        """Call after any state-changing operation: graph_updated, proposal_updated, city_updated."""
        from guardian.services.proposal_service import proposal_out

        # the responder may add chain effects (containment): city/graph below already see them
        react = self.responder_tick(publish=False)
        graph = graph or bool(react and react.chain_touched)
        if graph:
            self.graph_version += 1
            snap = self.snapshot()
            self.publish(
                "graph_updated",
                {
                    "graphVersion": self.graph_version,
                    "policyVersion": snap.policy_version,
                    "policyLabel": snap.policy_label,
                    "block": snap.block,
                },
            )
        for pid in proposal_ids:
            self.publish("proposal_updated", proposal_out(self, pid))
        city = self.city_states()
        comparable = [(b["id"], b["state"], b["reasonVi"]) for b in city["buildings"]]
        if force_city or self._last_city != comparable:
            self._last_city = comparable
            self.publish("city_updated", city)
