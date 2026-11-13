"""L1Chain: read side of `ChainPort` over web3.py against the deployed contracts (CHN-001).

`snapshot()` reads every value at one pinned block, so the snapshot is internally consistent.
`events_since(block)` decodes registry, vault, Council and Tx AllowList logs. `subscribe()` polls.
Write methods (spend, dry-run, Council, receipts, error mapping) live in `writes.py` (CHN-002).

What the chain cannot give (labels, seed ids, declared edges, the C-Chain treasury) comes from the
optional seed metadata, matched by address; anything missing falls back to on-chain data.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

from eth_utils import to_checksum_address
from web3 import Web3
from web3.exceptions import BadFunctionCallOutput, ContractLogicError

from guardian.chain import contracts as cx
from guardian.chain import precompiles
from guardian.chain.base import ChainEvent, ProposalState
from guardian.chain.client import ChainReadError, make_web3
from guardian.chain.errors import require_hex
from guardian.chain.l1.deployments import Deployments, load_deployments
from guardian.chain.l1.events import EventDecoder, bytes32_to_id
from guardian.chain.l1.signers import SignerRegistry, signer_env
from guardian.chain.l1.writes import L1Writes
from guardian.domain.snapshot import (
    CouncilMember,
    DeclaredEdge,
    KeyState,
    PolicySnapshot,
    PrincipalState,
    Protocol,
    Recipient,
    Token,
)

log = logging.getLogger(__name__)

DAY = 86400
KIND_NAMES = ("HUMAN", "AGENT", "SERVICE")
MAX_COUNCIL_MEMBERS = 16
ZERO_SELECTOR = "0x00000000"
# Seed protocol seed_id -> Deployments attribute holding its deployed address.
DEX_SEED_IDS = {"mock_dex": "mock_dex", "evil_dex": "evil_dex"}


class L1Chain(L1Writes):
    def __init__(
        self,
        w3: Web3,
        deployments: Deployments,
        seed: dict[str, Any] | None = None,
        *,
        signers: SignerRegistry | None = None,
        poll_interval: float = 2.0,
        log_chunk: int = 2000,
    ):
        self.w3 = w3
        self.dep = deployments
        self._seed = seed or {}
        self.signers = signers or SignerRegistry()
        self._poll_interval = poll_interval
        self._log_chunk = log_chunk
        c = cx.bind(w3, deployments.registry, deployments.vault, deployments.council)
        self.registry, self.vault, self.council = c.registry, c.vault, c.council
        self.txallow = precompiles.tx_allowlist(w3, deployments.tx_allowlist)
        self._decoder = EventDecoder.from_abis(
            w3,
            {
                "IPrincipalRegistry": deployments.registry,
                "IPolicyVault": deployments.vault,
                "IGuardianCouncil": deployments.council,
            },
        )
        self._log_addresses = [a for a in (deployments.registry, deployments.vault) if a]
        if deployments.council:
            self._log_addresses.append(deployments.council)
        self._log_addresses.append(deployments.tx_allowlist)
        # Incremental index of what only logs can tell: principal labels, allow-list candidates.
        self._index_lock = threading.Lock()
        self._indexed_to = deployments.deploy_block - 1
        self._labels: dict[str, str] = {}
        self._cand_tokens: dict[str, None] = {}
        self._cand_recipients: dict[str, None] = {}
        self._cand_protocols: dict[tuple[str, str], None] = {}
        self._token_meta: dict[str, tuple[str, int]] = {}
        # Polling subscription
        self._subs: list[Callable[[ChainEvent], None]] = []
        self._sub_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._init_writes()

    @classmethod
    def from_settings(cls, settings: Any, seed: dict[str, Any] | None = None) -> L1Chain:
        """`CHAIN_MODE=l1`: `L1_RPC_URL` + `DEPLOYMENTS_FILE`."""
        from guardian.chain.sim.engine import load_seed  # labels/edges the chain cannot hold

        seed = seed if seed is not None else load_seed()
        dep = load_deployments(settings.deployments_file)
        w3 = make_web3(settings.l1_rpc_url)
        if dep.chain_id is not None and w3.eth.chain_id != dep.chain_id:
            raise ChainReadError(
                f"RPC chain id {w3.eth.chain_id} != deployments chainId {dep.chain_id}"
            )
        return cls(
            w3,
            dep,
            seed,
            signers=SignerRegistry.from_env(seed, signer_env()),
            poll_interval=settings.l1_poll_interval_seconds,
        )

    # ------------------------------------------------------------------ logs
    def _block_ts(self, cache: dict[int, int], number: int) -> int:
        if number not in cache:
            cache[number] = int(self.w3.eth.get_block(number)["timestamp"])
        return cache[number]

    def _events_between(self, first: int, last: int) -> list[ChainEvent]:
        out: list[tuple[int, int, ChainEvent]] = []
        ts_cache: dict[int, int] = {}
        for lo in range(first, last + 1, self._log_chunk):
            hi = min(lo + self._log_chunk - 1, last)
            logs = self.w3.eth.get_logs(
                {"fromBlock": lo, "toBlock": hi, "address": self._log_addresses}
            )
            for lg in logs:
                ev = self._decoder.decode(
                    lg, self._block_ts(ts_cache, int(lg["blockNumber"])), self.dep.tx_allowlist
                )
                if ev is not None:
                    out.append((ev.block, ev.log_index, ev))
        out.sort(key=lambda t: (t[0], t[1]))
        return [e for _, _, e in out]

    def events_since(self, block: int) -> list[ChainEvent]:
        """Events with event.block > block, oldest first, up to the current head."""
        head = int(self.w3.eth.block_number)
        first = max(block + 1, 0)
        return self._events_between(first, head) if first <= head else []

    def _sync_index(self, head: int) -> None:
        with self._index_lock:
            if head <= self._indexed_to:
                return
            for ev in self._events_between(max(self._indexed_to + 1, 0), head):
                p = ev.payload
                if ev.name == "PrincipalCreated":
                    self._labels[p["id"]] = p["label"]
                elif ev.name == "AllowChanged":
                    if p["kind"] == "token":
                        self._cand_tokens[p["subject"]] = None
                    elif p["kind"] == "recipient":
                        self._cand_recipients[p["subject"]] = None
                    else:
                        self._cand_protocols[(p["subject"], p["selector"])] = None
            self._indexed_to = head

    # ------------------------------------------------------------- subscribe
    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]:
        """Polling subscription: new blocks are decoded every `poll_interval` seconds."""
        with self._sub_lock:
            self._subs.append(callback)
            if self._thread is None or not self._thread.is_alive():
                self._stop.clear()
                start = int(self.w3.eth.block_number)
                self._thread = threading.Thread(
                    target=self._poll, args=(start,), name="l1-poller", daemon=True
                )
                self._thread.start()

        def unsubscribe() -> None:
            with self._sub_lock:
                if callback in self._subs:
                    self._subs.remove(callback)
                if not self._subs:
                    self._stop.set()

        return unsubscribe

    def poll_once(self, last_block: int) -> tuple[int, list[ChainEvent]]:
        """One poll step: (new last block, events in blocks > last_block). Used by the loop and tests."""
        head = int(self.w3.eth.block_number)
        if head <= last_block:
            return last_block, []
        return head, self._events_between(last_block + 1, head)

    def _poll(self, last: int) -> None:
        while not self._stop.wait(self._poll_interval):
            try:
                last, events = self.poll_once(last)
            except Exception:  # RPC hiccup: keep polling, retry the same range
                log.exception("l1 poll failed")
                continue
            for ev in events:
                with self._sub_lock:
                    subs = list(self._subs)
                for cb in subs:
                    try:
                        cb(ev)
                    except Exception:
                        log.exception("l1 subscriber failed")

    def close(self) -> None:
        self._stop.set()

    # ------------------------------------------------------- small reads
    @property
    def vault_addr(self) -> str:
        return self.dep.vault

    def balance(self, holder: str, token: str) -> int:
        """ERC-20 balance of `holder` in `token` (hex addresses only)."""
        return int(
            cx.erc20(self.w3, require_hex(token)).functions.balanceOf(require_hex(holder)).call()
        )

    def proposal_state(self, proposal_id: int) -> ProposalState:
        """Council proposal and who approved it. Raises KeyError for an id never proposed."""
        council = self._need_council()
        try:
            p = council.functions.getProposal(int(proposal_id)).call()
        except (ContractLogicError, BadFunctionCallOutput):
            raise KeyError(proposal_id) from None
        subject = bytes(p[2])
        approved = [
            addr
            for addr in self._member_addresses()
            if council.functions.approvedBy(int(proposal_id), addr).call()
        ]
        return ProposalState(
            id=int(p[0]),
            proposer=to_checksum_address(p[1]),
            subject_principal=bytes32_to_id(subject) if any(subject) else None,
            approvals=int(p[6]),
            approved_by=sorted(approved),
            executed=bool(p[7]),
            cancelled=bool(p[8]),
        )

    def _member_addresses(self, at: dict[str, int] | None = None) -> list[str]:
        out: list[str] = []
        if self.council is None:
            return out
        for i in range(MAX_COUNCIL_MEMBERS):
            try:
                out.append(
                    to_checksum_address(self.council.functions.members(i).call(**(at or {})))
                )
            except (ContractLogicError, BadFunctionCallOutput):
                break
        return out

    # -------------------------------------------------------------- snapshot
    def snapshot(self) -> PolicySnapshot:
        head = int(self.w3.eth.block_number)
        ts = int(self.w3.eth.get_block(head)["timestamp"])
        day = ts // DAY
        self._sync_index(head)
        reg, vault = self.registry.functions, self.vault.functions
        at = {"block_identifier": head}

        keys: dict[str, KeyState] = {}
        principals: dict[str, PrincipalState] = {}
        seed_principals = {p["id"]: p for p in self._seed.get("principals", [])}
        seed_keys = {k["address"].lower(): k for k in self._seed.get("keys", [])}
        for raw_id in reg.principalIds().call(**at):
            pid = bytes32_to_id(raw_id)
            key_addrs = [to_checksum_address(a) for a in reg.keysOf(raw_id).call(**at)]
            kinds: list[str] = []
            for addr in key_addrs:
                _, kind, active, label = reg.keyInfo(addr).call(**at)
                kinds.append(KIND_NAMES[kind])
                keys[addr] = KeyState(
                    address=addr,
                    seed_id=seed_keys.get(addr.lower(), {}).get("seed_id", addr),
                    label=label,
                    kind=KIND_NAMES[kind],  # type: ignore[arg-type]
                    principal_id=bytes32_to_id(reg.principalOf(addr).call(**at)),
                    active=bool(active),
                    daily_cap=int(vault.keyDailyCap(addr).call(**at)),
                    spent_today=int(vault.keySpent(addr, day).call(**at)),
                    allow_listed=precompiles.read_role(self.txallow, addr, head) != 0,
                )
            seed_p = seed_principals.get(pid, {})
            principals[pid] = PrincipalState(
                id=pid,
                label=self._labels.get(pid) or seed_p.get("label") or pid,
                kind=seed_p.get("kind") or (kinds[0] if kinds else "HUMAN"),
                daily_cap=int(vault.principalDailyCap(raw_id).call(**at)),
                spent_today=int(vault.principalSpent(raw_id, day).call(**at)),
                locked=bool(vault.principalLocked(raw_id).call(**at)),
                keys=key_addrs,
            )

        tokens = self._tokens(head)
        value_token = self.dep.value_token
        vault_balance = (
            int(cx.erc20(self.w3, value_token).functions.balanceOf(self.dep.vault).call(**at))
            if value_token
            else 0
        )
        return PolicySnapshot(
            policy_version=int(vault.policyVersion().call(**at)),
            block=head,
            day_index=day,
            paused=bool(vault.paused().call(**at)),
            vault_balance=vault_balance,
            main_treasury=int(self._seed.get("main_treasury", 0)),
            principals=principals,
            keys=keys,
            declared_edges=[
                DeclaredEdge(
                    e["id"],
                    e["from_principal"],
                    e["to"],
                    e["relation"],
                    e["note"],
                    e.get("source", "declared"),
                )
                for e in self._seed.get("declared_edges", [])
            ],
            council=self._council(at),
            recipients=self._recipients(at),
            protocols=self._protocols(at),
            tokens=tokens,
            policy_baseline=self.dep.policy_baseline,
        )

    def _council(self, at: dict[str, int]) -> list[CouncilMember]:
        if self.council is None:
            return []
        seed = {m["address"].lower(): m for m in self._seed.get("council", [])}
        out: list[CouncilMember] = []
        for i in range(MAX_COUNCIL_MEMBERS):
            try:
                addr = to_checksum_address(self.council.functions.members(i).call(**at))
            except (ContractLogicError, BadFunctionCallOutput):
                break  # past the end of the public `members` array
            raw = self.council.functions.memberPrincipal(addr).call(**at)
            principal = bytes32_to_id(raw) if any(raw) else None
            meta = seed.get(addr.lower(), {})
            out.append(
                CouncilMember(
                    id=meta.get("id", addr[:10]),
                    label=meta.get("label", addr),
                    address=addr,
                    principal_id=principal,
                )
            )
        return out

    def _recipients(self, at: dict[str, int]) -> list[Recipient]:
        vault = self.vault.functions
        seen: dict[str, tuple[str, str]] = {}
        for r in self._seed.get("recipients", []):
            seen[to_checksum_address(r["address"])] = (r["seed_id"], r["label"])
        for a in self._cand_recipients:
            seen.setdefault(a, (a, a))
        return [
            Recipient(a, sid, label, bool(vault.recipientAllowed(a).call(**at)))
            for a, (sid, label) in seen.items()
        ]

    def _protocols(self, at: dict[str, int]) -> list[Protocol]:
        vault = self.vault.functions
        rows: dict[tuple[str, str], tuple[str, str]] = {}
        for p in self._seed.get("protocols", []):
            attr = DEX_SEED_IDS.get(p["seed_id"])
            deployed = getattr(self.dep, attr) if attr else None
            addr = to_checksum_address(deployed or p["address"])
            rows[(addr, p["selector"].lower())] = (p["seed_id"], p["label"])
        for addr, sel in self._cand_protocols:
            rows.setdefault((addr, (sel or ZERO_SELECTOR).lower()), (addr, addr))
        return [
            Protocol(
                a,
                sid,
                label,
                sel,
                bool(vault.protocolAllowed(a, bytes.fromhex(sel[2:])).call(**at)),
            )
            for (a, sel), (sid, label) in rows.items()
        ]

    def _tokens(self, head: int) -> list[Token]:
        vault = self.vault.functions
        addrs: dict[str, str] = {a: s for s, a in self.dep.tokens.items()}
        for a in self._cand_tokens:
            addrs.setdefault(a, "")
        out: list[Token] = []
        for addr in addrs:
            if addr not in self._token_meta:
                t = cx.erc20(self.w3, addr).functions
                self._token_meta[addr] = (str(t.symbol().call()), int(t.decimals().call()))
            symbol, decimals = self._token_meta[addr]
            allowed = bool(vault.tokenAllowed(addr).call(block_identifier=head))
            out.append(Token(addr, symbol, decimals, allowed))
        return out
