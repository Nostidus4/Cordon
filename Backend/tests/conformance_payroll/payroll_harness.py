"""Harness of the payroll conformance suite (PAYROLL.md section 6.3): the same scenario runs on `SimPayroll` and on the
real Foundry contracts deployed to a local anvil. `AnvilPayroll` is a TEST driver (not a production adapter): it speaks
the subset of `PayrollPort` the scenarios need, returns `PayrollTxResult`, and maps the sim's address constants to the
deployed contracts so both sides are driven with the same arguments.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from eth_utils import keccak, to_checksum_address
from web3 import Web3

from guardian.chain.base import ChainEvent
from guardian.chain.payroll_base import PayrollTxResult
from guardian.chain.sim import payroll as simp
from guardian.chain.sim.payroll import SimPayroll
from guardian.domain.payroll_snapshot import PayrollSnapshot
from guardian.shared.money import to_base
from guardian.shared.payroll_reasons import PAYROLL_ERROR_TO_REASON
from tests.chain_l1.anvil_env import OUT, REPO, Anvil

DAY = 86400
u = to_base
T0 = 1_800_000_000
ABI_DIR = REPO / "Backend" / "src" / "guardian" / "chain" / "abis" / "payroll"
PAYROLL_CONTRACTS = ("vault", "policy", "scheduler", "executor", "governor")


def _artifact(path: str) -> dict[str, Any]:
    return json.loads((OUT / path).read_text(encoding="utf-8"))


def _abis() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in sorted(ABI_DIR.glob("*.json")):
        out += json.loads(p.read_text(encoding="utf-8"))
    return out


def _sig(item: dict[str, Any]) -> str:
    def t(i: dict[str, Any]) -> str:
        if i["type"].startswith("tuple"):
            return "(" + ",".join(t(c) for c in i["components"]) + ")" + i["type"][5:]
        return str(i["type"])

    return f"{item['name']}({','.join(t(i) for i in item['inputs'])})"


ERROR_BY_SELECTOR: dict[str, str] = {}
EVENT_BY_TOPIC: dict[str, str] = {}
for _item in _abis():
    if _item["type"] == "error":
        ERROR_BY_SELECTOR["0x" + keccak(text=_sig(_item))[:4].hex()] = _item["name"]
    elif _item["type"] == "event":
        EVENT_BY_TOPIC["0x" + keccak(text=_sig(_item)).hex()] = _item["name"]


def norm(r: PayrollTxResult) -> dict[str, Any]:
    return {
        "status": r.status,
        "reason": r.reason_code.value if r.reason_code else None,
        "error": r.error_raw if r.status == "reverted" else None,
        "events": [e.name for e in r.events],
        "has_hash": (r.tx_hash is not None)
        if r.status == "ok"
        else None,  # a pre-checked revert sends no tx
    }


def view(s: PayrollSnapshot, label: dict[str, str]) -> dict[str, Any]:
    """Snapshot without absolute time, hashes or deployed addresses."""
    label = {k.lower(): v for k, v in label.items()}
    return {
        "phase": s.phase,
        "cycle_id": s.cycle_id,
        "payroll_total": s.payroll_total,
        "principal": s.principal,
        "reserve": s.reserve,
        "idle": s.idle,
        "deployed_total": s.deployed_total,
        "buffer_amount": s.buffer_amount,
        "ceiling_amount": s.ceiling_amount,
        "killed": s.killed,
        "kill_reason": s.kill_reason,
        "coverage": s.coverage,
        "exposure_at_risk": s.exposure_at_risk,
        "coverage_ok": s.coverage_ok,
        "executed": s.executed,
        "to_deadline_days": round((s.deadline - s.now) / DAY, 1),
        "venues": {
            label.get(v.addr.lower(), v.addr): {
                "allowed": v.allowed,
                "impaired": v.impaired,
                "deployed": v.deployed,
                "cap_amount": v.cap_amount,
                "due": v.due,
            }
            for v in s.venues
        },
        "roster": [(label.get(p.account.lower(), p.account.lower()), p.amount) for p in s.roster],
    }


@dataclass
class AnvilPayroll:
    anvil: Anvil
    w3: Web3
    deployer: str
    addr: dict[str, str] = field(
        default_factory=dict
    )  # vault/policy/scheduler/executor/governor/token/council/A/B
    contracts: dict[str, Any] = field(default_factory=dict)
    venue_map: dict[str, str] = field(
        default_factory=dict
    )  # sim venue constant -> deployed address

    # ------------------------------------------------------------------ deploy
    def _deploy(self, name: str, path: str, *args: Any) -> Any:
        art = _artifact(path)
        c = self.w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"]["object"])
        h = c.constructor(*args).transact({"from": self.deployer, "gas": 12_000_000})
        rc = self.w3.eth.wait_for_transaction_receipt(h)
        assert rc["status"] == 1, name
        inst = self.w3.eth.contract(address=rc["contractAddress"], abi=art["abi"])
        self.contracts[name] = inst
        self.addr[name] = rc["contractAddress"]
        return inst

    @classmethod
    def deploy(cls, anvil: Anvil) -> AnvilPayroll:
        w3 = anvil.w3
        me = cls(anvil, w3, w3.eth.accounts[0])
        payday = w3.eth.get_block("latest")["timestamp"] + 30 * DAY
        tok = me._deploy("token", "TestUSDC.sol/TestUSDC.json")
        me._deploy(
            "council",
            "CouncilStub.sol/CouncilStub.json",
            [to_checksum_address(m) for m in simp.DEFAULT_MEMBERS],
            [b"\x00" * 32] * 3,
        )
        for lbl in ("A", "B"):
            me._deploy(lbl, "MockVenue.sol/MockVenue.json", tok.address, me.deployer, DAY)
        me.venue_map = {simp.VENUE_A: me.addr["A"], simp.VENUE_B: me.addr["B"]}
        n = w3.eth.get_transaction_count(me.deployer)
        pred = {
            k: to_checksum_address(_create_address(me.deployer, n + i))
            for i, k in enumerate(PAYROLL_CONTRACTS)
        }
        roster = [(to_checksum_address(p), u(3000)) for p in simp.PAYEES]
        treasury = to_checksum_address(simp.PAYROLL_TREASURY)
        me._deploy(
            "vault",
            "PayrollVault.sol/PayrollVault.json",
            tok.address,
            (pred["governor"], pred["policy"], pred["scheduler"], pred["executor"], treasury),
            payday,
            roster,
        )
        venues = [me.addr["A"], me.addr["B"]]
        me._deploy(
            "policy",
            "FloatPolicy.sol/FloatPolicy.json",
            pred["vault"],
            pred["governor"],
            pred["scheduler"],
            DAY,
            500,
            DAY,
            1,
            venues,
            [4000, 4000],
        )
        rungs = [(d * DAY, bps) for d, bps in simp.DEFAULT_RUNGS]
        me._deploy(
            "scheduler",
            "LadderScheduler.sol/LadderScheduler.json",
            pred["vault"],
            pred["policy"],
            pred["governor"],
            rungs,
            [to_checksum_address(simp.PAYROLL_AGENT)],
        )
        me._deploy(
            "executor", "PayrollExecutor.sol/PayrollExecutor.json", pred["vault"], pred["scheduler"]
        )
        me._deploy(
            "governor",
            "PayrollGovernor.sol/PayrollGovernor.json",
            me.addr["council"],
            pred["vault"],
            pred["policy"],
            pred["scheduler"],
            pred["executor"],
        )
        for k in PAYROLL_CONTRACTS:
            assert me.addr[k] == pred[k], k
        # fund like the sim demo: 30.000 principal + 12.000 reserve from the company
        company = simp.PAYROLL_COMPANY
        me._send(me.deployer, tok.functions.mint(to_checksum_address(company), u(100_000)))
        me._send(company, tok.functions.approve(me.addr["vault"], 2**255))
        me._send(company, me.contracts["vault"].functions.deposit(u(30_000)))
        me._send(company, me.contracts["vault"].functions.fundReserve(u(12_000)))
        return me

    # ------------------------------------------------------------------ plumbing
    def _impersonate(self, who: str) -> None:
        p = self.w3.provider
        p.make_request("anvil_impersonateAccount", [who])  # type: ignore[attr-defined]
        p.make_request("anvil_setBalance", [who, hex(10**20)])  # type: ignore[attr-defined]

    @staticmethod
    def _revert_name(exc: Exception) -> str:
        blob = " ".join(str(a) for a in exc.args) + " " + str(getattr(exc, "data", ""))
        for sel, name in ERROR_BY_SELECTOR.items():
            if sel in blob:
                return name
        return f"unknown:{blob[:80]}"

    def _send(self, sender: str, fn: Any, *, expect_ok: bool = True) -> PayrollTxResult:
        sender = to_checksum_address(sender)
        self._impersonate(sender)
        try:
            fn.call({"from": sender, "gas": 12_000_000})
        except Exception as exc:  # noqa: BLE001 - web3 raises several ContractLogicError flavours
            name = self._revert_name(exc)
            assert not expect_ok or name, name
            return PayrollTxResult(
                "reverted", PAYROLL_ERROR_TO_REASON.get(name), None, None, [], name
            )
        h = fn.transact({"from": sender, "gas": 12_000_000})
        rc = self.w3.eth.wait_for_transaction_receipt(h)
        ours = {self.addr[k].lower() for k in PAYROLL_CONTRACTS}
        events = [
            ChainEvent(
                EVENT_BY_TOPIC[_topic(lg)], rc["blockNumber"], h.hex(), lg["logIndex"], {}, 0, False
            )
            for lg in rc["logs"]
            if lg["address"].lower() in ours and _topic(lg) in EVENT_BY_TOPIC
        ]
        if rc["status"] != 1:
            return PayrollTxResult("reverted", None, h.hex(), rc["blockNumber"], [], "reverted")
        return PayrollTxResult("ok", None, h.hex(), rc["blockNumber"], events, None, False)

    def _v(self, venue: str) -> str:
        return to_checksum_address(self.venue_map.get(venue, venue))

    # ------------------------------------------------------------------ PayrollPort subset
    def allocate(self, signer: str, venue: str, amount: int) -> PayrollTxResult:
        return self._send(
            signer, self.contracts["scheduler"].functions.allocate(self._v(venue), amount)
        )

    def unwind(self, signer: str, venue: str, amount: int) -> PayrollTxResult:
        return self._send(
            signer, self.contracts["scheduler"].functions.unwind(self._v(venue), amount)
        )

    def unwind_due(self, signer: str, venue: str) -> PayrollTxResult:
        return self._send(signer, self.contracts["scheduler"].functions.unwindDue(self._v(venue)))

    def finalize(self, signer: str) -> PayrollTxResult:
        return self._send(signer, self.contracts["scheduler"].functions.finalize())

    def execute_payroll(self, signer: str) -> PayrollTxResult:
        return self._send(signer, self.contracts["executor"].functions.execute())

    def kill_switch(self, member: str) -> PayrollTxResult:
        return self._send(member, self.contracts["governor"].functions.killSwitch())

    def revoke_agent(self, member: str, key: str) -> PayrollTxResult:
        return self._send(
            member, self.contracts["governor"].functions.revokeAgent(to_checksum_address(key))
        )

    def propose(
        self, member: str, title: str, calls: list[dict[str, Any]], risk_report_hash: str
    ) -> PayrollTxResult:
        enc = [(self.addr[c["target"]], self._encode(c)) for c in calls]
        res = self._send(
            member, self.contracts["governor"].functions.propose(title, enc, b"\x00" * 32)
        )
        if res.status == "ok":
            res.proposal_id = self.contracts["governor"].functions.proposalCount().call()
        return res

    def approve(self, member: str, proposal_id: int) -> PayrollTxResult:
        return self._send(member, self.contracts["governor"].functions.approve(proposal_id))

    def _encode(self, call: dict[str, Any]) -> bytes:
        target = {
            "vault": "vault",
            "policy": "policy",
            "scheduler": "scheduler",
            "executor": "executor",
        }[call["target"]]
        c = self.contracts[target]
        abi = next(a for a in c.abi if a.get("type") == "function" and a["name"] == call["fn"])
        args = []
        for inp in abi["inputs"]:
            v = call.get("args", {})[inp["name"]]
            args.append(self._conv(inp, v))
        return bytes.fromhex(c.encode_abi(call["fn"], args)[2:])

    def _conv(self, inp: dict[str, Any], v: Any) -> Any:
        t = inp["type"]
        if t.startswith("tuple"):
            names = [c["name"] for c in inp["components"]]

            def conv(x: Any) -> tuple[Any, ...]:
                return tuple(
                    self._conv(c, x[n]) for c, n in zip(inp["components"], names, strict=True)
                )

            return [conv(x) for x in v] if t.endswith("[]") else conv(v)
        if t == "address":
            return to_checksum_address(self._v(v))
        return v

    def snapshot_label(self) -> dict[str, str]:
        return {self.addr["A"]: "A", self.addr["B"]: "B", **{p: p for p in simp.PAYEES}}

    def snapshot(self) -> PayrollSnapshot:
        c, now = self.contracts, self.w3.eth.get_block("latest")["timestamp"]
        v, pol, sch = c["vault"].functions, c["policy"].functions, c["scheduler"].functions
        payday, deadline = v.payday().call(), pol.deadline().call()
        n = v.payeeCount().call()
        roster = [v.payeeAt(i).call() for i in range(n)]
        from guardian.domain.payroll_snapshot import PayeeState, VenueState

        venues = [
            VenueState(
                addr=a,
                label=lbl,
                allowed=pol.venueAllowed(a).call(),
                impaired=pol.venueImpaired(a).call(),
                frozen_hint=False,
                deployed=v.deployed(a).call(),
                cap_amount=pol.venueCapAmount(a).call(),
                due=sch.dueAmount(a).call(),
                assets_of=0,
            )
            for a, lbl in ((self.addr["A"], "A"), (self.addr["B"], "B"))
        ]
        cov, exp = pol.coverage().call(), pol.exposureAtRisk().call()
        return PayrollSnapshot(
            now=now,
            cycle_id=v.cycleId().call(),
            payday=payday,
            deadline=deadline,
            phase=_phase(
                now,
                payday,
                deadline,
                bool(v.paid().call()),
                sch.rungAt(0).call()[0] if sch.rungCount().call() else 0,
            ),
            payroll_total=v.payrollTotal().call(),
            principal=v.principal().call(),
            reserve=v.reserve().call(),
            idle=v.idle().call(),
            deployed_total=v.deployedTotal().call(),
            yield_realized=v.yieldRealized().call(),
            buffer_amount=pol.bufferAmount().call(),
            ceiling_amount=sch.ceilingAmount(now).call(),
            next_rung_at=0,
            killed=pol.killed().call(),
            kill_reason=pol.killReason().call(),
            coverage=cov,
            exposure_at_risk=exp,
            coverage_ok=exp <= cov,
            venues=venues,
            roster=[PayeeState(a, m) for a, m in roster],
            executed=c["executor"].functions.executed().call(),
        )

    # ------------------------------------------------------------------ demo controls
    def advance_time(self, seconds: int) -> None:
        p = self.w3.provider
        p.make_request("evm_increaseTime", [seconds])  # type: ignore[attr-defined]
        p.make_request("evm_mine", [])  # type: ignore[attr-defined]

    def set_venue_frozen(self, venue: str, frozen: bool) -> None:
        self._send(
            self.deployer,
            self.contracts["B" if self._v(venue) == self.addr["B"] else "A"].functions.setFrozen(
                frozen
            ),
        )


def _phase(now: int, payday: int, deadline: int, paid: bool, first_rung_before: int) -> Any:
    if paid:
        return "paid"
    if now >= payday:
        return "payday"
    if now >= deadline:
        return "deadline"
    return "unwinding" if now >= deadline - first_rung_before else "accruing"


def _topic(lg: Any) -> str:
    t = lg["topics"][0]
    h = t.hex() if hasattr(t, "hex") else str(t)
    return h if h.startswith("0x") else "0x" + h


def _create_address(sender: str, nonce: int) -> str:
    import rlp

    return "0x" + keccak(rlp.encode([bytes.fromhex(sender[2:]), nonce]))[12:].hex()


@dataclass
class PNet:
    kind: str  # "sim" | "l1"
    chain: Any  # SimPayroll | AnvilPayroll
    label: dict[str, str] = field(default_factory=dict)

    def snap(self) -> dict[str, Any]:
        return view(self.chain.snapshot(), self.label)

    def advance_days(self, days: float) -> None:
        self.chain.advance_time(int(days * DAY))

    def freeze_b(self, on: bool = True) -> None:
        self.chain.set_venue_frozen(simp.VENUE_B, on)


def make_sim_net() -> PNet:
    sim = SimPayroll.demo(clock=lambda: T0, members=list(simp.DEFAULT_MEMBERS))
    sim.set_venue_yield(simp.VENUE_A, 0)
    sim.set_venue_yield(simp.VENUE_B, 0)
    return PNet("sim", sim, {simp.VENUE_A: "A", simp.VENUE_B: "B", **{p: p for p in simp.PAYEES}})


def make_l1_net(anvil: Anvil) -> PNet:
    chain = AnvilPayroll.deploy(anvil)
    return PNet("l1", chain, {**chain.snapshot_label()})
