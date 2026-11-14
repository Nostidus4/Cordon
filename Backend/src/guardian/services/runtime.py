"""Process-wide Runtime: a ChainPort (SimChain, or L1Chain for CHAIN_MODE=l1) + in-memory stores +
SSE event bus + graph version.

Persistence: with `DATABASE_URL` set, attempts/scenario_runs/events live in Postgres (DB-002; write-through
cache, see `repositories/pg.py`); DB-003 adds proposals, agent_runs, assistant_logs, findings, sim_runs and
`meta` (graph_version/policy_version). In sim mode the chain itself is in memory, so each sim ChainEvent is also
stored (`events.chain='sim'`) and replayed into a fresh SimChain at startup (`Runtime._restore_sim`). Only
`conflicts` and `incidents` stay in memory.

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


class RecStore[T](Protocol):
    """Proposals, agent runs and assistant logs (DB-003): keyed by int id, `all()` in id order (oldest first)."""

    def add(self, rec: T) -> None: ...
    def save(self, rec: T) -> None:
        """Persist an in-place mutation of a rec that was added before."""
        ...

    def get(self, rec_id: int) -> T | None: ...
    def all(self) -> list[T]: ...
    def clear(self) -> None: ...


@dataclass
class FindingRec:
    id: str
    rule_id: str
    principal_id: str
    severity: str
    data: dict[str, Any]  # the whole compute_findings dict
    created_at: int
    resolved_by_proposal: int | None = None


@dataclass
class SimRunRec:
    id: str
    input: dict[str, Any]
    output: dict[str, Any]
    graph_version: int
    ts: int


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


class InMemoryRecStore[T]:
    def __init__(self) -> None:
        self._items: dict[int, T] = {}

    def add(self, rec: T) -> None:
        self._items[rec.id] = rec  # type: ignore[attr-defined]

    def save(self, rec: T) -> None:
        pass  # the rec is the stored object

    def get(self, rec_id: int) -> T | None:
        return self._items.get(rec_id)

    def all(self) -> list[T]:
        return [self._items[i] for i in sorted(self._items)]

    def clear(self) -> None:
        self._items.clear()


class InMemoryFindingStore:
    """Findings are derived live from the snapshot; this keeps the record of what was seen (DB-003)."""

    def __init__(self) -> None:
        self._items: dict[str, FindingRec] = {}

    def sync(self, current: list[dict[str, Any]], now: int, resolver: int | None) -> None:
        """Upsert the current findings by id; one that disappeared is resolved by `resolver` (the latest executed
        proposal, if any)."""
        ids = {f["id"] for f in current}
        for f in current:
            old = self._items.get(f["id"])
            rec = FindingRec(
                f["id"], f["rule"], f["principal_id"], f["severity"], f,
                old.created_at if old else now, None,
            )  # fmt: skip
            if old != rec:
                self._put(rec)
        for fid, old in list(self._items.items()):
            if fid not in ids and old.resolved_by_proposal is None and resolver is not None:
                self._put(FindingRec(**{**old.__dict__, "resolved_by_proposal": resolver}))

    def _put(self, rec: FindingRec) -> None:
        self._items[rec.id] = rec

    def all(self) -> list[FindingRec]:
        return list(self._items.values())

    def clear(self) -> None:
        self._items.clear()


class InMemorySimRunStore:
    def __init__(self) -> None:
        self._items: list[SimRunRec] = []

    def add(self, rec: SimRunRec) -> None:
        self._items.append(rec)

    def all(self) -> list[SimRunRec]:
        return list(self._items)

    def clear(self) -> None:
        self._items.clear()


class InMemoryMeta:
    def __init__(self) -> None:
        self._items: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._items.get(key)

    def set(self, key: str, value: str) -> None:
        self._items[key] = value


class Stores:
    """Everything the services remember. Attempts, runs, proposals, agent runs, assistant logs, findings,
    sim runs and meta are in memory or Postgres (`database_url`, DB-002/003); `conflicts` and `incidents`
    stay in memory. `clear()` empties every DB-backed store except `events`."""

    def __init__(self, database_url: str = "") -> None:
        self.bridge: DbBridge | None = None
        self.attempts: AttemptStore = InMemoryAttemptStore()
        self.runs: ScenarioRunStore = InMemoryScenarioRunStore()
        self.proposals: RecStore[ProposalRec] = InMemoryRecStore()
        self.agent_runs: RecStore[AgentRunRec] = InMemoryRecStore()
        self.assistant_logs: RecStore[AssistantLogRec] = InMemoryRecStore()
        self.findings = InMemoryFindingStore()
        self.sim_runs = InMemorySimRunStore()
        self.meta: Any = InMemoryMeta()
        # proposal id -> (status, approvers) as the chain says; written to the proposals row (informational)
        self.chain_view: Callable[[int], tuple[str, list[str]]] = lambda _pid: ("open", [])
        if database_url:
            from guardian.db.bridge import DbBridge
            from guardian.repositories import pg

            self.bridge = b = DbBridge(database_url)
            self.attempts, self.runs = pg.PgAttemptStore(b), pg.PgScenarioRunStore(b)
            self.proposals = pg.PgProposalStore(b, lambda pid: self.chain_view(pid))
            self.agent_runs, self.assistant_logs = pg.PgAgentRunStore(b), pg.PgAssistantLogStore(b)
            self.findings, self.sim_runs, self.meta = (
                pg.PgFindingStore(b), pg.PgSimRunStore(b), pg.PgMeta(b),
            )  # fmt: skip
        self.conflicts: list[ConflictRec] = []
        self.incidents: list[IncidentRec] = []
        self.fault_attempts: dict[
            int, str
        ] = {}  # attempt id -> fault id (CITY-005 violations board)
        self.copilot_drafts: dict[
            int, Any
        ] = {}  # CopilotDraftRec (assistant/copilot/models.py), CITY-004
        self.tx_checks: dict[int, Any] = {}  # B05 Tx Guardian checks (TxCheckOut), CITY-003
        self._incident_ids = 0
        self._txcheck_ids = 0
        # never collide with persisted ids
        self._ids = max(
            [
                x.id
                for x in (*self.attempts.all(), *self.agent_runs.all(), *self.assistant_logs.all())
            ],
            default=0,
        )

    def clear(self) -> None:
        self.attempts.clear()  # before runs: attempts reference them
        self.runs.clear()
        for st in (
            self.proposals,
            self.agent_runs,
            self.assistant_logs,
            self.findings,
            self.sim_runs,
        ):
            st.clear()
        self.conflicts, self.incidents = [], []
        self.fault_attempts, self.copilot_drafts, self.tx_checks = {}, {}, {}
        self._ids = 0
        self._incident_ids = 0
        self._txcheck_ids = 0

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
                chain = new_sim_chain(settings.council_timelock_s)
        self.chain: Any = chain  # ChainPort + the extras both implementations have (balance...)
        if self.is_l1:
            ensure_test_chain(settings, int(self.chain.w3.eth.chain_id))
        self.bus = EventBus()
        self.guard = DemoGuard(settings)
        self.stores = Stores(settings.database_url)
        self.stores.chain_view = self._chain_view
        self.llm_client: Any = None  # built lazily by core.llm.open_session; tests inject a fake
        self._graph_version = int(self.stores.meta.get("graph_version") or 1)
        self.restored = False  # sim + database: the chain was rebuilt from the stored events
        self._sim_sink: Any = None
        self._book: dict[str, str] | None = None
        self.scenario_tasks: dict[str, asyncio.Task[None]] = {}
        self.event_log: deque[ChainEvent] = deque(maxlen=EVENT_LOG_SIZE)
        self.indexer: Indexer | None = None
        self.c_indexer: Indexer | None = None  # C-Chain top-up transfers (IDX-002); None = off
        self.c_sink: Any = None
        # sim mints a block per tx only, so an idle sim demo is not a stall
        self.block_watch = BlockWatch(self.clock, stall_after=60.0 if self.is_l1 else None)
        self.sse_latency = LatencyStats()
        self._live = not self.is_l1  # L1: the backfill at startup is recorded, not streamed
        self._last_city: list[tuple[str, str, str]] | None = None
        self._in_responder = False  # set by responder.react
        self._responder_task: asyncio.Task[None] | None = None
        self._keeper_task: asyncio.Task[None] | None = None
        self._unsubscribe: Callable[[], None] = lambda: None
        self._init_payroll()
        if self.is_l1:
            self._start_indexer()
        else:
            if self.stores.bridge is not None:
                from guardian.repositories.pg import PgEventSink

                self._sim_sink = PgEventSink(self.stores.bridge, chain="sim")
                self._restore_sim()
            self._unsubscribe = self.chain.subscribe(self._on_chain_event)

    def _init_payroll(self) -> None:
        """CITY-006: payroll float chain (separate from `chain`). Always the in-memory SimPayroll for now: there is
        no l1 PayrollPort adapter yet. Its events reach the SSE bus as `payroll_event`."""
        from guardian.chain.sim.payroll import SimPayroll
        from guardian.services import payroll_service

        members = tuple(m.address for m in self.chain.snapshot().council)
        self.payroll: Any = SimPayroll.demo(clock=lambda: int(self.clock()), members=members)
        self.payroll_state = payroll_service.PayrollState()
        self.payroll.subscribe(lambda ev: payroll_service.on_chain_event(self, ev))

    @property
    def graph_version(self) -> int:
        return self._graph_version

    @graph_version.setter
    def graph_version(self, v: int) -> None:
        self._graph_version = v
        self.stores.meta.set("graph_version", str(v))

    def _chain_view(self, pid: int) -> tuple[str, list[str]]:
        try:
            cp = self.chain.proposal_state(pid)
        except KeyError:
            return "open", []
        return cp.status, sorted(cp.approved_by)

    def _restore_sim(self) -> None:
        """The sim chain is in memory: rebuild it from the stored sim events (DB-003), if there are any."""
        from guardian.chain.sim.replay import replay

        events = self._sim_sink.all()
        if not events:
            return
        self.chain.reset()
        calls = {r.id: views.chain_calls(r.calls, self.addr) for r in self.stores.proposals.all()}
        replay(self.chain, events, calls)
        # reverted txs emit no event: never reuse the block (tx hash) of an attempt already stored
        self.chain.block = max(
            self.chain.block,
            max(
                (a.block for a in self.stores.attempts.all() if a.simulated and a.block), default=0
            ),
        )
        self.chain._nonce = self.chain.block - 1
        self.event_log.extend(events[-EVENT_LOG_SIZE:])
        self._book = None
        self.restored = True

    def _start_indexer(self) -> None:
        """L1 event bridge: the idempotent indexer reads the chain and feeds the SSE bus.

        The first cycle (backfill from the deployment block) runs synchronously so `event_log` is
        complete before the first request; after it, only new events reach SSE."""
        from guardian.workers.indexer import Indexer, InMemoryEventSink, L1ChainSource, l1_watcher

        s = self.settings
        sink: Any = InMemoryEventSink()
        if self.stores.bridge is not None:
            from guardian.repositories.pg import PgEventSink

            sink = PgEventSink(self.stores.bridge)
            if not self.event_log:  # history survives a restart (a reload keeps the log it has)
                self.event_log.extend(sink.recent(EVENT_LOG_SIZE))
        source = L1ChainSource(self.chain)
        self.indexer = Indexer(
            source,
            sink,
            watcher=l1_watcher(s, source),
            publish=self._on_chain_event,
            poll_interval=s.l1_poll_interval_seconds,
            reorg_window=s.indexer_reorg_window,
            confirmations=s.indexer_confirmations,
        )
        self.indexer.sync_once()
        self._live = True
        self.indexer.start()
        self._start_cchain_indexer()

    def _start_cchain_indexer(self) -> None:
        """IDX-002: follow the C-Chain treasury -> escrow transfer. Off unless CCHAIN_DEPLOYMENTS_FILE is set.
        A C-Chain that is down or still unconfigured never blocks the L1 side: the loop retries with back-off
        and the error shows up as `INDEXER_ERROR`-style state in its status."""
        s = self.settings
        if not s.cchain_deployments_file:
            return
        from guardian.chain.cchain import CChainSource, log_params
        from guardian.workers.indexer import Indexer, InMemoryEventSink
        from guardian.workers.ws_source import LogWatcher

        source = CChainSource.from_settings(
            s
        )  # a bad file raises at startup: clear, nothing half-started
        sink: Any = InMemoryEventSink()
        if self.stores.bridge is not None:
            from guardian.repositories.pg import PgEventSink

            sink = PgEventSink(self.stores.bridge, chain="c")
        ws_url = s.cchain_ws_url or source.ws_url
        self.c_sink = sink
        self.c_indexer = Indexer(
            source,
            sink,
            label="c",
            watcher=LogWatcher(ws_url, log_params(source.dep)) if ws_url else None,
            poll_interval=s.l1_poll_interval_seconds,
            reorg_window=s.indexer_reorg_window,
            confirmations=s.indexer_confirmations,
        )
        try:
            self.c_indexer.sync_once()
        except Exception:  # C-Chain RPC down at boot: the loop below keeps retrying
            log.exception("C-Chain initial sync failed; retrying in the background")
        self.c_indexer.start()

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
        if self.c_indexer is not None:
            self.c_indexer.stop()
            self.c_indexer = None
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

    def start_keeper(self, interval: float = 1.0) -> None:
        """Timelock keeper (#77): executes queued proposals once their eta passes (needs DEMO_MODE to sign)."""
        if self._keeper_task is not None or self.settings.council_timelock_s <= 0:
            return
        from guardian.services import timelock_keeper

        async def loop() -> None:
            while True:
                await asyncio.sleep(interval)
                try:
                    timelock_keeper.tick(self)
                except Exception:
                    log.exception("timelock keeper tick failed")

        self._keeper_task = asyncio.get_running_loop().create_task(loop())

    async def shutdown(self) -> None:
        if self._keeper_task is not None:
            self._keeper_task.cancel()
            self._keeper_task = None
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
        if self.c_indexer is not None:
            self.c_indexer.stop()
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
        if self._sim_sink is not None:
            self._sim_sink.write(ev)
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

    def _record_graph(self, snap: PolicySnapshot) -> None:
        """policy_version to meta, current findings to the findings record (a gone one: resolved by the latest
        executed proposal)."""
        self.stores.meta.set("policy_version", str(snap.policy_version))
        done = [p for p in self.stores.proposals.all() if p.executed_at is not None]
        last = max(done, key=lambda p: (p.executed_at or 0, p.id)).id if done else None
        self.stores.findings.sync(compute_findings(snap), self.now(), last)

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
            self._record_graph(snap)
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
