"""SimPayroll: PayrollVault + FloatPolicy + LadderScheduler + PayrollExecutor + PayrollGovernor + MockVenue
in memory (PAYROLL.md section 6.2). Same rules, order of checks, rounding, event and error names as the
Solidity set; the Foundry tests are the source of truth and the conformance suite compares both.

No import of `engine.py`, no Runtime import. Failed txs come back as `PayrollTxResult` (never raised); a
revert rolls back every state change of the tx (all or nothing) and emits no event.
"""

from __future__ import annotations

import copy
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from eth_utils import keccak, to_checksum_address

from guardian.chain.base import ChainEvent, ProposalState
from guardian.chain.errors import ChainRevert, is_blocked_at_protocol, require_hex
from guardian.chain.payroll_base import PayrollTxResult
from guardian.chain.sim.allowlist import TxAllowList
from guardian.chain.sim.tokens import Ledger
from guardian.domain.payroll_snapshot import (
    PayeeState,
    PayrollPhase,
    PayrollSnapshot,
    RungState,
    VenueState,
)
from guardian.shared.payroll_reasons import PAYROLL_ERROR_TO_REASON, PayrollReason

DAY = 86400
MAX_VENUE_BPS = 4000
MIN_BUFFER_BPS = 500
MAX_VENUES = 8
MAX_PAYEES = 10
THRESHOLD = 2
BPS = 10_000
BLOCKED_MSG = "transaction sender is not allow listed (Tx AllowList role is None)"
DEFAULT_RUNGS: tuple[tuple[int, int], ...] = (
    (14, 6000),
    (7, 3000),
    (3, 1000),
    (0, 0),
)  # (days, bps)


def _addr(label: str) -> str:
    return to_checksum_address("0x" + keccak(text=f"guardian:payroll:{label}")[-20:].hex())


# Deterministic addresses of the sim deployment (public: tests, API wiring and conformance use them).
PAYROLL_VAULT = _addr("vault")
PAYROLL_TOKEN = _addr("token")
PAYROLL_TREASURY = _addr("treasury")
PAYROLL_COMPANY = _addr("company")  # funds the vault in the demo (deposit / fundReserve)
PAYROLL_AGENT = _addr("agent")
PAYROLL_KEEPER = _addr("keeper")
VENUE_A = _addr("venue-a")
VENUE_B = _addr("venue-b")
EVIL_VENUE = _addr("evil-venue")  # never whitelisted
VENUE_ADMIN = _addr("venue-admin")
PAYEES: tuple[str, ...] = tuple(_addr(f"payee-{i}") for i in range(MAX_PAYEES))
DEFAULT_MEMBERS: tuple[str, ...] = (_addr("member-trang"), _addr("member-lan"), _addr("member-huy"))

_TARGETS = ("vault", "policy", "scheduler", "executor")
KNOWN_FNS: dict[str, frozenset[str]] = {
    "vault": frozenset(
        {"setRoster", "removePayee", "startCycle", "returnReserve", "withdrawSurplus"}
    ),
    "policy": frozenset(
        {
            "setVenue",
            "setVenueCapBps",
            "setBufferBps",
            "setDeadlineLead",
            "setFaultTolerance",
            "clearImpaired",
            "resetKill",
        }
    ),
    "scheduler": frozenset({"setRungs", "setAgent", "lowerRung", "killSwitch"}),
    "executor": frozenset(),
}
_ROSTER_FNS = frozenset({"setRoster", "removePayee", "startCycle"})


def _ceil_div(a: int, b: int) -> int:
    return -(-a // b)


def _pad32(value: str | int) -> str:
    if isinstance(value, int):
        return "0x" + format(value, "064x")
    return "0x" + value[2:].lower().rjust(64, "0")


@dataclass
class _Tx:
    sender: str
    fn: str
    block: int
    ts: int
    tx_hash: str
    events: list[ChainEvent] = field(default_factory=list)

    def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append(
            ChainEvent(name, self.block, self.tx_hash, len(self.events), payload, self.ts, True)
        )


@dataclass
class _Venue:
    admin: str
    label: str
    frozen: bool = False
    yield_bps: int = 0
    haircut_bps: int = 0  # sim-only fault: pays out less without reverting
    pool: int = 0  # funded yield
    pos: dict[str, list[int]] = field(
        default_factory=dict
    )  # account -> [principal, accrued, last_ts]


@dataclass
class _Proposal:
    id: int
    proposer: str
    calls: list[dict[str, Any]]
    risk_report_hash: str
    title: str
    approvals: int = 0
    approved_by: set[str] = field(default_factory=set)
    executed: bool = False
    cancelled: bool = False
    created_at: int = 0


@dataclass
class _State:
    ledger: Ledger = field(default_factory=Ledger)
    allow: TxAllowList = field(default_factory=TxAllowList)
    venues: dict[str, _Venue] = field(default_factory=dict)
    # vault
    cycle_id: int = 1
    payday: int = 0
    paid: bool = False
    roster: list[tuple[str, int]] = field(default_factory=list)
    principal: int = 0
    reserve: int = 0
    deployed: dict[str, int] = field(default_factory=dict)
    venue_list: list[str] = field(default_factory=list)
    yield_realized: int = 0
    paid_out: set[str] = field(default_factory=set)
    # policy
    allowed: dict[str, bool] = field(default_factory=dict)
    cap_bps: dict[str, int] = field(default_factory=dict)
    impaired: set[str] = field(default_factory=set)
    frozen_hint: set[str] = field(default_factory=set)
    buffer_bps: int = MIN_BUFFER_BPS
    deadline_lead: int = DAY
    fault_tolerance: int = 1
    killed: bool = False
    kill_reason: int = 0
    # scheduler
    rungs: list[tuple[int, int]] = field(default_factory=list)  # (beforeDeadline seconds, maxBps)
    agents: set[str] = field(default_factory=set)
    finalized: bool = False
    # executor
    executed: bool = False
    # governor
    proposals: dict[int, _Proposal] = field(default_factory=dict)
    next_proposal: int = 1


class SimPayroll:
    """PayrollPort + PayrollDemoControls. Build with `SimPayroll(...)` (empty, explicit params) or
    `SimPayroll.demo()` (the PAYROLL.md section 8 scenario, ready to run)."""

    def __init__(
        self,
        *,
        clock: Callable[[], int] | None = None,
        day_unit: int = DAY,
        members: tuple[str, str, str] | list[str] | None = None,
        payday: int | None = None,
        rungs: list[tuple[int, int]] | None = None,
        buffer_bps: int = MIN_BUFFER_BPS,
        fault_tolerance: int = 1,
        deadline_lead: int | None = None,
        agent: str = PAYROLL_AGENT,
        keeper: str = PAYROLL_KEEPER,
        company: str = PAYROLL_COMPANY,
        treasury: str = PAYROLL_TREASURY,
        seeder: Callable[[SimPayroll], None] | None = None,
    ) -> None:
        """Empty deployment: no venues, no roster, nothing deposited. `rungs` is `[(beforeDeadline_seconds,
        maxDeployedBps)]` (default: the 14d/7d/3d/0 ladder scaled by `day_unit`). `payday` defaults to now+30
        day units. `seeder(self)` runs after every (re)load, so `reset()` restores the same scenario."""
        self._clock = clock or (lambda: int(time.time()))
        self._offset = 0
        self._subs: list[Callable[[ChainEvent], None]] = []
        self.day_unit = day_unit
        self.members: tuple[str, ...] = tuple(require_hex(m) for m in (members or DEFAULT_MEMBERS))
        assert len(self.members) == 3
        self.treasury = require_hex(treasury)
        self.vault_addr = PAYROLL_VAULT
        self.token = PAYROLL_TOKEN
        self.company = require_hex(company)
        self.agent = require_hex(agent)
        self.keeper = require_hex(keeper)
        self._params = {
            "payday": payday,
            "rungs": rungs,
            "buffer_bps": buffer_bps,
            "fault_tolerance": fault_tolerance,
            "deadline_lead": deadline_lead,
        }
        self._seeder = seeder
        self._load()

    # ------------------------------------------------------------------ setup
    def _load(self) -> None:
        p = self._params
        self.block = 1
        self._nonce = 0
        self._offset = 0
        self.events: list[ChainEvent] = []
        s = _State()
        s.ledger.add_token(self.token, "tUSDC", 6)
        s.payday = p["payday"] if p["payday"] is not None else self._real_now() + 30 * self.day_unit
        s.buffer_bps = p["buffer_bps"]
        s.fault_tolerance = p["fault_tolerance"]
        s.deadline_lead = p["deadline_lead"] if p["deadline_lead"] is not None else self.day_unit
        s.rungs = (
            [tuple(r) for r in p["rungs"]]  # type: ignore[misc]
            if p["rungs"] is not None
            else [(d * self.day_unit, bps) for d, bps in DEFAULT_RUNGS]
        )
        s.agents.add(self.agent)
        for a in (*self.members, self.agent, self.keeper, self.company):
            s.allow.set_enabled(a)
        self.s = s
        if self._seeder:
            self._seeder(self)

    def reset(self) -> None:
        """Back to the freshly seeded deployment (subscribers are kept)."""
        self._load()

    @classmethod
    def demo(
        cls, *, clock: Callable[[], int] | None = None, members: list[str] | None = None
    ) -> SimPayroll:
        """PAYROLL.md section 8: P = 30,000 tUSDC for 10 payees, Pr = P deposited, R = 40% P funded, venues
        A and B (cap 40%, yield 8 / 6 bps per day), k = 1, buffer 5%, ladder 14d/7d/3d/0, payday = now + 30d."""
        if members is None:
            try:  # reuse the May Labs Council so the demo runs under the same three people
                from guardian.chain.sim.engine import load_seed

                members = [m["address"] for m in load_seed()["council"]]
            except Exception:  # noqa: BLE001 - seed optional
                members = None
        return cls(clock=clock, members=members, seeder=_seed_demo)  # type: ignore[arg-type]

    # genesis helpers (no tx, no event): used by seeders and tests
    def mint(self, holder: str, amount: int) -> None:
        self.s.ledger.mint(require_hex(holder), self.token, amount)

    def balance(self, holder: str) -> int:
        return self.s.ledger.balance(require_hex(holder), self.token)

    def add_venue(
        self,
        addr: str,
        label: str,
        *,
        cap_bps: int = MAX_VENUE_BPS,
        yield_bps_per_day: int = 0,
        allowed: bool = True,
        fund_yield: int = 0,
    ) -> str:
        addr = require_hex(addr)
        s = self.s
        s.venues[addr] = _Venue(VENUE_ADMIN, label, yield_bps=yield_bps_per_day)
        s.venue_list.append(addr)
        s.allowed[addr] = allowed
        s.cap_bps[addr] = min(cap_bps, MAX_VENUE_BPS)
        if fund_yield:
            self.fund_venue_yield(addr, fund_yield)
        return addr

    def set_roster_genesis(self, roster: list[tuple[str, int]]) -> None:
        self.s.roster = [(require_hex(a), amt) for a, amt in roster]

    def set_tx_allowed(self, addr: str, allowed: bool) -> None:
        """Tx AllowList role of a key (the real set goes through a GuardianCouncil proposal)."""
        (self.s.allow.set_enabled if allowed else self.s.allow.set_none)(require_hex(addr))

    def fund_venue_yield(self, venue: str, amount: int) -> None:
        v = self.s.venues[require_hex(venue)]
        self.s.ledger.mint(v.admin, self.token, amount)
        self.s.ledger.transfer(v.admin, venue, self.token, amount)
        v.pool += amount

    # ------------------------------------------------------------ time / demo
    def _real_now(self) -> int:
        return int(self._clock())

    @property
    def now(self) -> int:
        return self._real_now() + self._offset

    def advance_time(self, seconds: int) -> None:
        adv = getattr(self._clock, "advance", None)
        if callable(adv):
            adv(seconds)
        else:
            self._offset += seconds

    def set_venue_frozen(self, venue: str, frozen: bool) -> None:
        self.s.venues[require_hex(venue)].frozen = frozen

    def set_venue_yield(self, venue: str, bps_per_day: int) -> None:
        v = self.s.venues[require_hex(venue)]
        self._v_settle_all(v)
        v.yield_bps = bps_per_day

    def set_venue_haircut(self, venue: str, bps: int) -> None:
        """Sim-only fault: the venue pays `bps`/10000 less on withdraw without reverting (decision 10)."""
        self.s.venues[require_hex(venue)].haircut_bps = bps

    # ------------------------------------------------------------ venue (mock)
    def _v_accrued_now(self, v: _Venue, acct: str) -> int:
        principal, accrued, last = v.pos.get(acct, [0, 0, self.now])
        return accrued + principal * v.yield_bps * max(0, self.now - last) // (BPS * DAY)

    def _v_settle(self, v: _Venue, acct: str) -> None:
        if acct in v.pos:
            v.pos[acct][1] = self._v_accrued_now(v, acct)
            v.pos[acct][2] = self.now

    def _v_settle_all(self, v: _Venue) -> None:
        for acct in list(v.pos):
            self._v_settle(v, acct)

    def _v_assets_of(self, venue: str, acct: str) -> int:
        v = self.s.venues[venue]
        if acct not in v.pos:
            return 0
        return v.pos[acct][0] + min(self._v_accrued_now(v, acct), v.pool)

    def _v_deposit(self, venue: str, acct: str, amount: int) -> None:
        v = self.s.venues.get(venue)
        if v is None:  # a whitelisted address that is not a venue contract: the call fails
            raise ChainRevert("InsufficientAssets")
        self.s.ledger.transfer(acct, venue, self.token, amount)
        if acct not in v.pos:
            v.pos[acct] = [0, 0, self.now]
        self._v_settle(v, acct)
        v.pos[acct][0] += amount

    def _v_withdraw(self, venue: str, acct: str, amount: int) -> None:
        v = self.s.venues.get(venue)
        if v is None:  # an address that is not a venue contract
            raise ChainRevert("InsufficientAssets")
        if v.frozen:
            raise ChainRevert("Frozen")
        self._v_settle(v, acct)
        if amount > self._v_assets_of(venue, acct):
            raise ChainRevert("InsufficientAssets")
        pos = v.pos[acct]
        take_p = min(amount, pos[0])
        take_y = amount - take_p
        pos[0] -= take_p
        pos[1] -= take_y
        v.pool -= take_y
        pay = amount - amount * v.haircut_bps // BPS
        self.s.ledger.transfer(venue, acct, self.token, pay)

    # ------------------------------------------------------------ tx plumbing
    def _transact(self, sender: str, fn: str, body: Callable[[_Tx], Any]) -> PayrollTxResult:
        sender = require_hex(sender)
        if not self.s.allow.is_allowed(sender):
            assert is_blocked_at_protocol(BLOCKED_MSG)
            return PayrollTxResult(
                "blocked_at_protocol",
                PayrollReason.BLOCKED_AT_PROTOCOL,
                None,
                None,
                [],
                BLOCKED_MSG,
            )
        self.block += 1
        self._nonce += 1
        h = "0x" + keccak(text=f"sim-payroll:{self._nonce}:{sender}:{fn}").hex()
        tx = _Tx(sender, fn, self.block, self.now, h)
        saved = copy.deepcopy(self.s)
        try:
            body(tx)
        except ChainRevert as e:
            self.s = saved
            return PayrollTxResult(
                "reverted", PAYROLL_ERROR_TO_REASON.get(e.name), h, tx.block, [], e.name
            )
        self.events.extend(tx.events)
        res = PayrollTxResult("ok", None, h, tx.block, list(tx.events), None)
        for e in tx.events:
            for cb in list(self._subs):
                cb(e)
        return res

    def _dry(self, sender: str, body: Callable[[_Tx], Any]) -> str | None:
        """eth_call: the revert name or None; never changes state (ignores the Tx AllowList)."""
        tx = _Tx(sender, "call", self.block, self.now, "0x")
        saved = copy.deepcopy(self.s)
        try:
            body(tx)
        except ChainRevert as e:
            return e.name
        finally:
            self.s = saved
        return None

    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]:
        self._subs.append(callback)
        return lambda: self._subs.remove(callback) if callback in self._subs else None

    def events_since(self, block: int) -> list[ChainEvent]:
        """Events with event.block > block."""
        return [e for e in self.events if e.block > block]

    def proposal_state(self, proposal_id: int) -> ProposalState:
        p = self.s.proposals[proposal_id]  # KeyError: never proposed
        return ProposalState(
            p.id, p.proposer, None, p.approvals, sorted(p.approved_by), p.executed, p.cancelled
        )

    # ----------------------------------------------------- policy: views / math
    @property
    def deadline(self) -> int:
        return self.s.payday - self.s.deadline_lead

    def idle(self) -> int:
        return self.balance(self.vault_addr) - self.s.reserve

    def deployed_total(self) -> int:
        return sum(self.s.deployed.values())

    def payroll_total(self) -> int:
        return sum(a for _, a in self.s.roster)

    def buffer_amount(self) -> int:
        return self.s.buffer_bps * self.s.principal // BPS

    def venue_cap_amount(self, venue: str) -> int:
        return min(self.s.cap_bps.get(venue, 0), MAX_VENUE_BPS) * self.s.principal // BPS

    def coverage(self) -> int:
        return max(0, self.s.principal + self.s.reserve - self.payroll_total())

    def _top_k(self, extra_venue: str | None = None, extra: int = 0) -> int:
        d = dict(self.s.deployed)
        if extra_venue is not None:
            d[extra_venue] = d.get(extra_venue, 0) + extra
        vals = sorted((v for v in d.values() if v > 0), reverse=True)
        return sum(vals[: self.s.fault_tolerance])

    def exposure_at_risk(self) -> int:
        return self._top_k()

    def ceiling_bps_at(self, ts: int) -> int:
        s = self.s
        dl = self.deadline
        if not s.rungs or ts < dl - s.rungs[0][0]:
            return BPS - s.buffer_bps
        bps = BPS - s.buffer_bps
        for before, max_bps in s.rungs:
            if ts >= dl - before:
                bps = max_bps
        return bps

    def ceiling_amount(self, ts: int) -> int:
        return self.ceiling_bps_at(ts) * self.s.principal // BPS

    def next_rung_at(self) -> int:
        starts = [self.deadline - b for b, _ in self.s.rungs if self.deadline - b > self.now]
        return min(starts) if starts else 0

    def _healthy_total(self) -> int:
        return sum(d for v, d in self.s.deployed.items() if v not in self.s.impaired)

    def due_amount(self, venue: str) -> int:
        s = self.s
        if venue in s.impaired or s.deployed.get(venue, 0) == 0:
            return 0
        healthy = self._healthy_total()
        excess = max(0, healthy - self.ceiling_amount(self.now))
        return _ceil_div(excess * s.deployed[venue], healthy)

    def _assert_can_deploy(self, venue: str, amount: int) -> None:
        """PAYROLL.md 2.3.1: fixed order, decides the revert reason."""
        s = self.s
        if s.killed:
            raise ChainRevert("KillSwitchActive")
        if self.now >= self.deadline:
            raise ChainRevert("DeadlinePassed")
        if not s.allowed.get(venue, False):
            raise ChainRevert("VenueNotAllowed")
        if venue in s.impaired:
            raise ChainRevert("VenueImpairedError")
        if self.deployed_total() + amount > self.ceiling_amount(self.now):
            raise ChainRevert("LadderCeilingExceeded")
        if self.idle() < amount + self.buffer_amount():
            raise ChainRevert("BufferBreached")
        if s.deployed.get(venue, 0) + amount > self.venue_cap_amount(venue):
            raise ChainRevert("VenueCapExceeded")
        if self._top_k(venue, amount) > self.coverage():
            raise ChainRevert("CoverageInsufficient")

    def _assert_coverage(self) -> None:
        if self.exposure_at_risk() > self.coverage():
            raise ChainRevert("CoverageInsufficient")

    # ----------------------------------------------------- policy: actions
    def _kill(self, tx: _Tx, reason: int) -> None:
        if self.s.killed:
            return
        self.s.killed = True
        self.s.kill_reason = reason
        tx.emit("KillSwitch", {"reason": reason, "by": tx.sender})

    def _mark_impaired(self, tx: _Tx, venue: str) -> None:
        if venue in self.s.impaired:
            return
        self.s.impaired.add(venue)
        tx.emit("VenueImpaired", {"venue": venue, "deployedAtRisk": self.s.deployed.get(venue, 0)})

    # ----------------------------------------------------- vault: money paths
    def _deploy_to_venue(self, tx: _Tx, venue: str, amount: int) -> None:
        s = self.s
        self._assert_can_deploy(venue, amount)
        s.deployed[venue] = s.deployed.get(venue, 0) + amount
        if venue not in s.venue_list:
            s.venue_list.append(venue)
        self._v_deposit(venue, self.vault_addr, amount)
        tx.emit(
            "Deployed",
            {
                "venue": venue,
                "amount": amount,
                "deployedAfter": s.deployed[venue],
                "idleAfter": self.idle(),
            },
        )

    def _recall(self, tx: _Tx, venue: str, amount: int) -> tuple[int, bool]:
        """vault.recallFromVenue: (received, bad). Never reverts; `bad` = venue failed or paid less."""
        s = self.s
        before = self.balance(self.vault_addr)
        try:
            self._v_withdraw(venue, self.vault_addr, amount)
        except ChainRevert:
            tx.emit("RecallFailed", {"venue": venue, "requested": amount})
            s.frozen_hint.add(venue)
            return 0, True
        received = self.balance(self.vault_addr) - before
        principal_part = min(received, s.deployed.get(venue, 0))
        yield_part = received - principal_part
        s.deployed[venue] = s.deployed.get(venue, 0) - principal_part
        s.yield_realized += yield_part
        if received > 0:
            s.frozen_hint.discard(venue)
        tx.emit(
            "Recalled",
            {
                "venue": venue,
                "requested": amount,
                "received": received,
                "principalPart": principal_part,
                "yieldPart": yield_part,
            },
        )
        if received < amount:
            tx.emit("Haircut", {"venue": venue, "requested": amount, "received": received})
        return received, received < amount

    def _release_reserve(self, tx: _Tx, amount: int) -> None:
        if amount > self.s.reserve:
            raise ChainRevert("InsufficientIdle")
        self.s.reserve -= amount
        tx.emit("ReserveReleased", {"amount": amount, "reserveAfter": self.s.reserve})

    def _pay_out(self, tx: _Tx, to: str) -> int:
        s = self.s
        amount = dict(s.roster).get(to)
        if amount is None:
            raise ChainRevert("NotPayee")
        if to in s.paid_out:
            raise ChainRevert("AlreadyPaid")
        s.paid_out.add(to)
        self.s.ledger.transfer(self.vault_addr, to, self.token, amount)
        tx.emit("PaidOut", {"payee": to, "amount": amount, "cycleId": s.cycle_id})
        return amount

    def _recall_all(self, tx: _Tx) -> None:
        for v in list(self.s.venue_list):
            if self.s.deployed.get(v, 0) > 0:
                _, bad = self._recall(tx, v, self._v_assets_of(v, self.vault_addr))
                if bad:
                    self._mark_impaired(tx, v)

    # ----------------------------------------------------- scheduler
    def _need_agent(self, tx: _Tx) -> None:
        if tx.sender not in self.s.agents:
            raise ChainRevert("NotAgent")

    def _allocate(self, tx: _Tx, venue: str, amount: int) -> None:
        self._need_agent(tx)
        if amount == 0:
            raise ChainRevert("ZeroAmount")
        self._deploy_to_venue(tx, venue, amount)
        tx.emit(
            "Allocated",
            {
                "agent": tx.sender,
                "venue": venue,
                "amount": amount,
                "deployedTotalAfter": self.deployed_total(),
                "ceiling": self.ceiling_amount(self.now),
            },
        )

    def _unwind_venue(self, tx: _Tx, venue: str, amount: int) -> int:
        received, bad = self._recall(tx, venue, amount)
        if bad:
            self._mark_impaired(tx, venue)
        tx.emit(
            "Unwound",
            {"by": tx.sender, "venue": venue, "requested": amount, "received": received},
        )
        return received

    def _unwind(self, tx: _Tx, venue: str, amount: int) -> None:
        self._need_agent(tx)
        if amount == 0:
            raise ChainRevert("ZeroAmount")
        if amount > self.s.deployed.get(venue, 0):
            raise ChainRevert("ExceedsDeployed")
        self._unwind_venue(tx, venue, amount)

    def _unwind_due(self, tx: _Tx, venue: str) -> None:
        due = self.due_amount(venue)
        if due == 0:
            raise ChainRevert("NothingDue")
        self._unwind_venue(tx, venue, due)

    def _finalize(self, tx: _Tx) -> None:
        s = self.s
        if self.now < self.deadline:
            raise ChainRevert("DeadlineNotReached")
        self._kill(tx, 2)
        self._recall_all(tx)
        total = self.payroll_total()
        shortfall = max(0, total - self.idle())
        released = min(shortfall, s.reserve)
        if released > 0:
            self._release_reserve(tx, released)
        if self.idle() < total:
            tx.emit("Underfunded", {"idleAfter": self.idle(), "payrollTotal": total})
        s.finalized = True
        tx.emit(
            "Finalized",
            {
                "idleAfter": self.idle(),
                "shortfall": shortfall,
                "reserveReleased": released,
                "stuckAtVenues": self.deployed_total(),
            },
        )

    # ----------------------------------------------------- executor
    def _execute(self, tx: _Tx) -> None:
        s = self.s
        if s.executed:
            raise ChainRevert("AlreadyExecuted")
        if self.now < s.payday:
            raise ChainRevert("PaydayNotReached")
        if not s.roster:
            raise ChainRevert("EmptyRoster")
        self._finalize(tx)
        total = self.payroll_total()
        if self.idle() < total:
            raise ChainRevert("InsufficientFunds")
        for account, _ in list(s.roster):
            self._pay_out(tx, account)
        s.paid = True
        s.executed = True
        tx.emit(
            "PayrollExecuted",
            {"cycleId": s.cycle_id, "total": total, "payeeCount": len(s.roster), "by": tx.sender},
        )

    # ----------------------------------------------------- governed (governor-only) fns
    def _check_roster(self, roster: list[tuple[str, int]]) -> None:
        if self.now >= self.deadline:
            raise ChainRevert("RosterLocked")
        if len(roster) > MAX_PAYEES:
            raise ChainRevert("RosterTooLarge")
        seen: set[str] = set()
        for a, amt in roster:
            if int(a, 16) == 0 or amt <= 0 or a in seen:
                raise ChainRevert("RosterInvalid")
            seen.add(a)

    def _validate_rungs(self, rungs: list[tuple[int, int]]) -> None:
        if not rungs or len(rungs) > MAX_VENUES:
            raise ChainRevert("LadderInvalid")
        for i, (before, bps) in enumerate(rungs):
            if bps > BPS or (i > 0 and (before >= rungs[i - 1][0] or bps > rungs[i - 1][1])):
                raise ChainRevert("LadderInvalid")
        if rungs[-1] != (0, 0):
            raise ChainRevert("LadderInvalid")

    def _apply_call(self, tx: _Tx, call: dict[str, Any]) -> None:
        """Run an admin fn as the governor. Hard floors hold on every path (also 2/3)."""
        target, fn, a = call.get("target"), call.get("fn"), call.get("args") or {}
        if target not in _TARGETS:
            raise ChainRevert("TargetNotAllowed")
        if fn not in KNOWN_FNS[target]:
            raise ChainRevert("UnknownCall")
        s = self.s
        try:
            if fn == "setVenue":
                venue, allowed, cap = require_hex(a["venue"]), bool(a["allowed"]), int(a["capBps"])
                if int(venue, 16) == 0:
                    raise ChainRevert("ZeroAddress")
                if cap > MAX_VENUE_BPS:
                    raise ChainRevert("BpsOutOfRange")
                if venue not in s.venue_list:
                    if len(s.venue_list) >= MAX_VENUES:
                        raise ChainRevert("TooManyVenues")
                    s.venue_list.append(venue)
                s.allowed[venue] = allowed
                s.cap_bps[venue] = cap
                tx.emit("VenueSet", {"venue": venue, "allowed": allowed, "capBps": cap})
            elif fn == "setVenueCapBps":
                venue, new = require_hex(a["venue"]), int(a["capBps"])
                if new > MAX_VENUE_BPS:
                    raise ChainRevert("BpsOutOfRange")
                old = s.cap_bps.get(venue, 0)
                s.cap_bps[venue] = new
                tx.emit("VenueCapChanged", {"venue": venue, "oldBps": old, "newBps": new})
            elif fn == "setBufferBps":
                new = int(a["bps"])
                if new < MIN_BUFFER_BPS or new > BPS:
                    raise ChainRevert("BpsOutOfRange")
                old, s.buffer_bps = s.buffer_bps, new
                tx.emit("BufferChanged", {"oldBps": old, "newBps": new})
            elif fn == "setDeadlineLead":
                new = int(a["lead"])
                if new < self.day_unit:
                    raise ChainRevert("BpsOutOfRange")
                old, s.deadline_lead = s.deadline_lead, new
                tx.emit("DeadlineLeadChanged", {"oldLead": old, "newLead": new})
            elif fn == "setFaultTolerance":
                new = int(a["k"])
                if new < 1 or new > MAX_VENUES:
                    raise ChainRevert("BpsOutOfRange")
                old, s.fault_tolerance = s.fault_tolerance, new
                tx.emit("FaultToleranceChanged", {"oldK": old, "newK": new})
            elif fn == "clearImpaired":
                venue = require_hex(a["venue"])
                if venue in s.impaired:
                    s.impaired.discard(venue)
                    tx.emit("ImpairedCleared", {"venue": venue})
            elif fn == "resetKill":
                s.killed = False
                s.kill_reason = 0
                tx.emit("KillReset", {})
            elif fn == "setRungs":
                rungs = [_rung(r) for r in a["rungs"]]
                self._validate_rungs(rungs)
                s.rungs = rungs
                tx.emit("RungsSet", {"count": len(rungs)})
            elif fn == "lowerRung":
                idx, new = int(a["index"]), int(a["maxBps"])
                rungs = list(s.rungs)
                rungs[idx] = (rungs[idx][0], new)
                self._validate_rungs(rungs)
                s.rungs = rungs
                tx.emit("RungsSet", {"count": len(rungs)})
            elif fn == "setAgent":
                key, active = require_hex(a["key"]), bool(a["active"])
                (s.agents.add if active else s.agents.discard)(key)
                tx.emit("AgentSet", {"key": key, "active": active})
            elif fn == "killSwitch":
                self._kill(tx, 1)
                self._recall_all(tx)  # no reserve release before the deadline
            elif fn == "setRoster":
                roster = [_payee(p) for p in a["roster"]]
                self._check_roster(roster)
                s.roster = roster
                tx.emit(
                    "RosterSet", {"payeeCount": len(roster), "payrollTotal": self.payroll_total()}
                )
                self._assert_coverage()
            elif fn == "removePayee":
                account = require_hex(a["account"])
                if self.now >= self.deadline:
                    raise ChainRevert("RosterLocked")
                if account not in dict(s.roster):
                    raise ChainRevert("NotPayee")
                s.roster = [(x, m) for x, m in s.roster if x != account]
                tx.emit(
                    "PayeeRemoved", {"account": account, "payrollTotalAfter": self.payroll_total()}
                )
            elif fn == "startCycle":
                new_payday = int(a["newPayday"])
                if not s.paid or self.deployed_total() != 0:
                    raise ChainRevert("CycleNotSettled")
                if new_payday <= self.now:
                    raise ChainRevert("BpsOutOfRange")
                s.cycle_id += 1
                s.payday = new_payday
                s.paid = False
                s.executed = False
                s.finalized = False
                s.paid_out = set()
                s.principal = 0
                tx.emit("CycleStarted", {"cycleId": s.cycle_id, "payday": new_payday})
            elif fn == "returnReserve":
                amount = int(a["amount"])
                if amount > s.reserve:
                    raise ChainRevert("InsufficientIdle")
                s.reserve -= amount
                s.ledger.transfer(self.vault_addr, self.treasury, self.token, amount)
                tx.emit("ReserveReturned", {"amount": amount})
                self._assert_coverage()
            elif fn == "withdrawSurplus":
                amount = int(a["amount"])
                if not s.paid:
                    raise ChainRevert("CycleNotSettled")
                if amount > self.idle():
                    raise ChainRevert("InsufficientIdle")
                s.ledger.transfer(self.vault_addr, self.treasury, self.token, amount)
                tx.emit("SurplusWithdrawn", {"amount": amount})
        except (KeyError, TypeError, ValueError) as e:
            raise ChainRevert("BadCallArgs") from e

    def _is_tightening(self, call: dict[str, Any]) -> bool:
        """Mirror of the Governor's classification (PAYROLL.md section 4)."""
        s = self.s
        fn, a = call.get("fn"), call.get("args") or {}
        try:
            if fn == "killSwitch":
                return not s.killed
            if fn == "setVenue":
                return not a["allowed"] and s.allowed.get(require_hex(a["venue"]), False)
            if fn == "setVenueCapBps":
                return int(a["capBps"]) < s.cap_bps.get(require_hex(a["venue"]), 0)
            if fn == "setBufferBps":
                return int(a["bps"]) > s.buffer_bps
            if fn == "setDeadlineLead":
                return int(a["lead"]) > s.deadline_lead
            if fn == "setFaultTolerance":
                return int(a["k"]) > s.fault_tolerance
            if fn == "lowerRung":
                return int(a["maxBps"]) < s.rungs[int(a["index"])][1]
            if fn == "setAgent":
                return not a["active"] and require_hex(a["key"]) in s.agents
            if fn == "removePayee":
                return True  # NotPayee when absent
        except (KeyError, TypeError, ValueError, IndexError) as e:
            raise ChainRevert("BadCallArgs") from e
        return False

    def _need_member(self, tx: _Tx) -> None:
        if tx.sender not in self.members:
            raise ChainRevert("NotCouncilMember")

    def _subject(self, call: dict[str, Any]) -> str:
        a = call.get("args") or {}
        for k in ("venue", "key", "account"):
            if k in a:
                return _pad32(require_hex(a[k]))
        for k in ("capBps", "bps", "lead", "k", "maxBps"):
            if k in a:
                return _pad32(int(a[k]))
        return _pad32(0)

    def _direct(
        self, member: str, call: dict[str, Any], not_tightening: str = "NeedsThreshold"
    ) -> PayrollTxResult:
        """1-member path: only tightening calls; everything else needs 2/3."""

        def body(tx: _Tx) -> None:
            self._need_member(tx)
            if call.get("target") not in _TARGETS or call.get("fn") not in KNOWN_FNS.get(
                call.get("target"), frozenset()
            ):
                raise ChainRevert("UnknownCall")
            if call["fn"] == "removePayee" and require_hex(call["args"]["account"]) not in dict(
                self.s.roster
            ):
                raise ChainRevert("NotPayee")
            if not self._is_tightening(call):
                raise ChainRevert(not_tightening)
            self._apply_call(tx, call)
            tx.emit(
                "EmergencyAction",
                {"member": tx.sender, "action": call["fn"], "subject": self._subject(call)},
            )

        return self._transact(require_hex(member), call["fn"], body)

    def direct_call(self, member: str, call: dict[str, Any]) -> PayrollTxResult:
        """Test helper, not on PayrollPort: a member calls any admin fn on the 1-member path
        (a loosening call reverts NeedsThreshold)."""
        return self._direct(member, call)

    # ---------------------------------------------------------------- agent
    def allocate(self, signer: str, venue: str, amount: int) -> PayrollTxResult:
        venue = require_hex(venue)
        return self._transact(signer, "allocate", lambda tx: self._allocate(tx, venue, amount))

    def unwind(self, signer: str, venue: str, amount: int) -> PayrollTxResult:
        venue = require_hex(venue)
        return self._transact(signer, "unwind", lambda tx: self._unwind(tx, venue, amount))

    def simulate_allocate(self, signer: str, venue: str, amount: int) -> PayrollReason | None:
        """eth_call: the reason a coded revert gives, else None (also None for ZeroAmount, which has no code)."""
        signer, venue = require_hex(signer), require_hex(venue)
        name = self._dry(signer, lambda tx: self._allocate(tx, venue, amount))
        return PAYROLL_ERROR_TO_REASON.get(name) if name else None

    # ---------------------------------------------------------- permissionless
    def unwind_due(self, signer: str, venue: str) -> PayrollTxResult:
        venue = require_hex(venue)
        return self._transact(signer, "unwindDue", lambda tx: self._unwind_due(tx, venue))

    def finalize(self, signer: str) -> PayrollTxResult:
        return self._transact(signer, "finalize", self._finalize)

    def execute_payroll(self, signer: str) -> PayrollTxResult:
        return self._transact(signer, "execute", self._execute)

    def deposit(self, signer: str, amount: int) -> PayrollTxResult:
        def body(tx: _Tx) -> None:
            if self.s.paid:
                raise ChainRevert("AlreadyPaid")
            self.s.ledger.transfer(tx.sender, self.vault_addr, self.token, amount)
            self.s.principal += amount
            tx.emit(
                "Deposited",
                {"from": tx.sender, "amount": amount, "principalAfter": self.s.principal},
            )

        return self._transact(signer, "deposit", body)

    def fund_reserve(self, signer: str, amount: int) -> PayrollTxResult:
        def body(tx: _Tx) -> None:
            self.s.ledger.transfer(tx.sender, self.vault_addr, self.token, amount)
            self.s.reserve += amount
            tx.emit(
                "ReserveFunded",
                {"from": tx.sender, "amount": amount, "reserveAfter": self.s.reserve},
            )

        return self._transact(signer, "fundReserve", body)

    # ------------------------------------------------- Council: tighten (1 member)
    def kill_switch(self, member: str) -> PayrollTxResult:
        return self._direct(member, _c("scheduler", "killSwitch"), "NotTightening")

    def remove_venue(self, member: str, venue: str) -> PayrollTxResult:
        return self._direct(
            member,
            _c("policy", "setVenue", venue=require_hex(venue), allowed=False, capBps=0),
            "NotTightening",
        )

    def lower_venue_cap(self, member: str, venue: str, new_bps: int) -> PayrollTxResult:
        return self._direct(
            member,
            _c("policy", "setVenueCapBps", venue=require_hex(venue), capBps=new_bps),
            "NotTightening",
        )

    def raise_buffer(self, member: str, new_bps: int) -> PayrollTxResult:
        return self._direct(member, _c("policy", "setBufferBps", bps=new_bps), "NotTightening")

    def raise_deadline_lead(self, member: str, new_lead: int) -> PayrollTxResult:
        return self._direct(member, _c("policy", "setDeadlineLead", lead=new_lead), "NotTightening")

    def raise_fault_tolerance(self, member: str, new_k: int) -> PayrollTxResult:
        return self._direct(member, _c("policy", "setFaultTolerance", k=new_k), "NotTightening")

    def lower_rung(self, member: str, index: int, new_max_bps: int) -> PayrollTxResult:
        return self._direct(
            member,
            _c("scheduler", "lowerRung", index=index, maxBps=new_max_bps),
            "NotTightening",
        )

    def revoke_agent(self, member: str, key: str) -> PayrollTxResult:
        return self._direct(
            member,
            _c("scheduler", "setAgent", key=require_hex(key), active=False),
            "NotTightening",
        )

    def remove_payee(self, member: str, account: str) -> PayrollTxResult:
        return self._direct(
            member, _c("vault", "removePayee", account=require_hex(account)), "NotTightening"
        )

    # ------------------------------------------------------ Council: loosen (2/3)
    def propose(
        self, member: str, title: str, calls: list[dict[str, Any]], risk_report_hash: str
    ) -> PayrollTxResult:
        box: list[int] = []

        def body(tx: _Tx) -> None:
            self._need_member(tx)
            if not calls:
                raise ChainRevert("BadCallArgs")
            for c in calls:
                if c.get("target") not in _TARGETS:
                    raise ChainRevert("TargetNotAllowed")
                if c.get("fn") not in KNOWN_FNS[c["target"]]:
                    raise ChainRevert("UnknownCall")
            pid = self.s.next_proposal
            self.s.next_proposal += 1
            self.s.proposals[pid] = _Proposal(
                pid, tx.sender, copy.deepcopy(calls), risk_report_hash, title, created_at=tx.ts
            )
            box.append(pid)
            tx.emit(
                "Proposed",
                {
                    "id": pid,
                    "proposer": tx.sender,
                    "title": title,
                    "riskReportHash": risk_report_hash,
                },
            )

        res = self._transact(member, "propose", body)
        if res.status == "ok":
            res.proposal_id = box[0]
        return res

    def _conflicted(self, member: str, p: _Proposal) -> bool:
        """Decision 4: a payee may not approve a change of roster, amounts or payday."""
        touched: set[str] = set()
        roster_change = False
        for c in p.calls:
            if c["fn"] in _ROSTER_FNS:
                roster_change = True
            if c["fn"] == "setRoster":
                for item in (c.get("args") or {}).get("roster", []):
                    touched.add(_payee(item)[0])
        return roster_change and (member in dict(self.s.roster) or member in touched)

    def approve(self, member: str, proposal_id: int) -> PayrollTxResult:
        def body(tx: _Tx) -> None:
            self._need_member(tx)
            p = self.s.proposals.get(proposal_id)
            if p is None:
                raise ChainRevert("UnknownProposal")
            if p.executed or p.cancelled:
                raise ChainRevert("ProposalNotOpen")
            if self._conflicted(tx.sender, p):
                raise ChainRevert("ConflictOfInterest")
            if tx.sender in p.approved_by:
                raise ChainRevert("AlreadyApproved")
            p.approved_by.add(tx.sender)
            p.approvals += 1
            tx.emit("Approved", {"id": p.id, "member": tx.sender})
            if p.approvals >= THRESHOLD:
                for c in p.calls:
                    self._apply_call(tx, c)
                p.executed = True
                tx.emit("Executed", {"id": p.id})

        return self._transact(member, "approve", body)

    def cancel(self, member: str, proposal_id: int) -> PayrollTxResult:
        def body(tx: _Tx) -> None:
            self._need_member(tx)
            p = self.s.proposals.get(proposal_id)
            if p is None:
                raise ChainRevert("UnknownProposal")
            if p.proposer != tx.sender:
                raise ChainRevert("NotProposer")
            if p.executed or p.cancelled:
                raise ChainRevert("ProposalNotOpen")
            p.cancelled = True
            tx.emit("Cancelled", {"id": p.id})

        return self._transact(member, "cancel", body)

    # ---------------------------------------------------------------- snapshot
    def _phase(self) -> PayrollPhase:
        s = self.s
        if s.paid:
            return "paid"
        if self.now >= s.payday:
            return "payday"
        if self.now >= self.deadline:
            return "deadline"
        if s.rungs and self.now >= self.deadline - s.rungs[0][0]:
            return "unwinding"
        return "accruing"

    def snapshot(self) -> PayrollSnapshot:
        s = self.s
        venues = [
            VenueState(
                addr=v,
                label=s.venues[v].label if v in s.venues else v,
                allowed=s.allowed.get(v, False),
                impaired=v in s.impaired,
                frozen_hint=v in s.frozen_hint,
                deployed=s.deployed.get(v, 0),
                cap_amount=self.venue_cap_amount(v),
                due=self.due_amount(v),
                assets_of=self._v_assets_of(v, self.vault_addr) if v in s.venues else 0,
                yield_bps_per_day=s.venues[v].yield_bps if v in s.venues else 0,
            )
            for v in s.venue_list
        ]
        cov, exp = self.coverage(), self.exposure_at_risk()
        return PayrollSnapshot(
            now=self.now,
            cycle_id=s.cycle_id,
            payday=s.payday,
            deadline=self.deadline,
            phase=self._phase(),
            payroll_total=self.payroll_total(),
            principal=s.principal,
            reserve=s.reserve,
            idle=self.idle(),
            deployed_total=self.deployed_total(),
            yield_realized=s.yield_realized,
            buffer_amount=self.buffer_amount(),
            ceiling_amount=self.ceiling_amount(self.now),
            next_rung_at=self.next_rung_at(),
            killed=s.killed,
            kill_reason=s.kill_reason,
            coverage=cov,
            exposure_at_risk=exp,
            coverage_ok=exp <= cov,
            fault_tolerance=s.fault_tolerance,
            buffer_bps=s.buffer_bps,
            day_unit=self.day_unit,
            venues=venues,
            rungs=[RungState(b, m) for b, m in s.rungs],
            roster=[PayeeState(a, m) for a, m in s.roster],
            agents=sorted(s.agents),
            executed=s.executed,
        )


def _c(target: str, fn: str, **args: Any) -> dict[str, Any]:
    return {"target": target, "fn": fn, "args": args}


def _rung(r: Any) -> tuple[int, int]:
    if isinstance(r, dict):
        return int(r["beforeDeadline"]), int(r["maxDeployedBps"])
    return int(r[0]), int(r[1])


def _payee(p: Any) -> tuple[str, int]:
    if isinstance(p, dict):
        return require_hex(p["account"]), int(p["amount"])
    return require_hex(p[0]), int(p[1])


def _seed_demo(sim: SimPayroll) -> None:
    u = 1_000_000
    sim.add_venue(VENUE_A, "Quỹ An Tâm", yield_bps_per_day=8, fund_yield=500 * u)
    sim.add_venue(VENUE_B, "Quỹ Linh Hoạt", yield_bps_per_day=6, fund_yield=500 * u)
    sim.set_roster_genesis([(p, 3_000 * u) for p in PAYEES])
    sim.mint(sim.company, 100_000 * u)
    sim.deposit(sim.company, 30_000 * u)
    sim.fund_reserve(sim.company, 12_000 * u)
