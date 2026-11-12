"""Write side of `ChainPort` for `L1Chain` (CHN-002): dry-run, send, receipts, real-chain errors.

Flow of every transaction (`_transact`):
1. `eth_call` from the sender: the revert data decodes to a `ReasonCode` (custom-error selector).
2. Send the real tx anyway (explicit gas when the dry run reverts, so a reverted tx still lands
   with a hash and shows up on an explorer). A node rejection "cannot issue transaction from
   non-allow listed address" means `blocked_at_protocol`: no hash, no event, `error_raw` = the RPC message.
3. Wait for the receipt. Status 1 -> `ok` with the decoded events. Status 0 -> `reverted`; the reason
   comes from an `eth_call` replay at the block of the receipt (fallback: the dry-run result).

Secrets: private keys live in `signers.py` only; this module never logs them, the RPC URL, or the
raw transport exceptions (they can contain the URL).
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Any

from eth_utils import keccak, to_checksum_address
from hexbytes import HexBytes
from web3 import Web3
from web3.contract import Contract
from web3.exceptions import ContractLogicError, TimeExhausted, Web3RPCError

from guardian.chain.base import ChainEvent, TxResult
from guardian.chain.client import ChainWriteError, quiet_transport_logs
from guardian.chain.errors import (
    ChainRevert,
    RevertInfo,
    decode_revert,
    is_blocked_at_protocol,
    rpc_error_tag,
)
from guardian.chain.l1.calls import (
    CallEncoder,
    address_to_bytes32,
    hash_to_bytes32,
    id_to_bytes32,
)
from guardian.chain.l1.deployments import Deployments
from guardian.chain.l1.events import EventDecoder
from guardian.chain.l1.signers import SignerRegistry
from guardian.shared.reason_codes import ReasonCode

log = logging.getLogger(__name__)

GAS_BUFFER_NUM, GAS_BUFFER_DEN = 13, 10  # estimate x 1.3
FALLBACK_GAS = (
    2_000_000  # used when the dry run reverts (the tx must still be sent) or estimating fails
)
RECEIPT_TIMEOUT = 60.0
ALLOW_KINDS = {"token": 0, "protocol": 1, "recipient": 2}
BLOCKED_REASON = ReasonCode.BLOCKED_AT_PROTOCOL
DEXES = frozenset({"mock_dex", "evil_dex"})  # seed protocol ids that are Deployments attributes


@dataclass
class DryRun:
    """Result of the `eth_call`: `reverted` False = it would succeed."""

    reverted: bool = False
    info: RevertInfo | None = None
    blocked_msg: str | None = None  # node rejected the call as a non-allow-listed sender

    @property
    def reason(self) -> ReasonCode | None:
        if self.blocked_msg is not None:
            return BLOCKED_REASON
        return self.info.reason if self.info else None


def _hex(value: Any) -> str:
    return HexBytes(value).to_0x_hex()


def _rpc_message(exc: BaseException) -> str | None:
    """The node's own message of an RPC-level error; None for transport errors (which may hold the URL)."""
    if isinstance(exc, Web3RPCError | ContractLogicError):
        resp = getattr(exc, "rpc_response", None)
        err = resp.get("error") if isinstance(resp, dict) else None
        if isinstance(err, dict) and "message" in err:
            return str(err["message"])  # web3 8: `.message` of Web3RPCError is the whole error dict
        msg = getattr(exc, "message", None)
        if isinstance(msg, dict):
            return str(msg.get("message", ""))
        return str(msg if msg is not None else exc)
    if isinstance(exc, ValueError) and exc.args and isinstance(exc.args[0], dict):
        return str(exc.args[0].get("message", ""))
    return None


def _revert_data(exc: BaseException) -> str | None:
    data = getattr(exc, "data", None)
    if isinstance(data, str) and data.startswith("0x"):
        return data
    if isinstance(data, bytes | bytearray):
        return "0x" + bytes(data).hex()
    resp = getattr(exc, "rpc_response", None)
    if isinstance(resp, dict):
        err = resp.get("error")
        if isinstance(err, dict) and isinstance(err.get("data"), str):
            return str(err["data"])
    if isinstance(exc, ValueError) and exc.args and isinstance(exc.args[0], dict):
        d = exc.args[0].get("data")
        if isinstance(d, str):
            return d
    return None


class L1Writes:
    """Mixin for `L1Chain`: needs `w3`, `dep`, `_seed`, `registry`, `vault`, `council`, `txallow`,
    `_decoder`, `signers` and `_block_ts` from the read side."""

    w3: Web3
    dep: Deployments
    _seed: dict[str, Any]
    registry: Contract
    vault: Contract
    council: Contract | None
    txallow: Contract
    _decoder: EventDecoder
    signers: SignerRegistry
    receipt_timeout: float

    # ------------------------------------------------------------------ setup
    def _init_writes(self) -> None:
        quiet_transport_logs()
        self._send_lock = threading.Lock()
        self.receipt_timeout = RECEIPT_TIMEOUT
        a: dict[str, str] = {
            "vault": self.dep.vault,
            "registry": self.dep.registry,
            "tx_allowlist": self.dep.tx_allowlist,
        }
        if self.dep.council:
            a["council"] = self.dep.council
        s = self._seed
        for k in s.get("keys", []):
            a[k["seed_id"]] = k["address"]
        for m in s.get("council", []):
            a[m["seed_id"]] = m["address"]
            a[m["id"]] = m["address"]
            a["council:" + m["id"]] = m["address"]
        for r in s.get("recipients", []):
            a[r["seed_id"]] = r["address"]
        for t in s.get("tokens", []):
            a[t["seed_id"]] = self.dep.tokens.get(t["seed_id"]) or t["address"]
        selectors: dict[str, str] = {}
        for p in s.get("protocols", []):
            deployed = getattr(self.dep, p["seed_id"], None) if p["seed_id"] in DEXES else None
            a[p["seed_id"]] = deployed or p["address"]
            selectors[to_checksum_address(a[p["seed_id"]])] = p["selector"]
        self._alias = {k: to_checksum_address(v) for k, v in a.items()}
        self._selectors = selectors
        self._encoder = CallEncoder(
            self.registry,
            self.vault,
            self.txallow,
            self._addr,
            lambda addr: self._selectors.get(to_checksum_address(addr)),
        )

    def _addr(self, ref: str) -> str:
        """Hex address or seed id (`key_minh`, `lan`, `council_lan`, `tUSDC`, `evil_dex`...)."""
        if ref.startswith("0x"):
            return to_checksum_address(ref)
        try:
            return self._alias[ref]
        except KeyError:
            raise KeyError(f"unknown seed id {ref!r}") from None

    # ------------------------------------------------------------ dry run
    def _classify(self, exc: BaseException) -> DryRun:
        """An exception from `eth_call`/`estimateGas` -> DryRun; transport errors become ChainWriteError."""
        msg = _rpc_message(exc)
        if msg is None:
            raise ChainWriteError(f"RPC call failed: {type(exc).__name__}") from None
        if is_blocked_at_protocol(msg):
            return DryRun(True, None, msg)
        data = _revert_data(exc)
        info = decode_revert(data)
        if data is None:  # node gave only text (e.g. a precompile error): keep it as the raw
            tag = rpc_error_tag(msg)
            info = RevertInfo(tag, None, msg)
        return DryRun(True, info)

    def _dry_run(self, call: dict[str, Any], block: int | str = "latest") -> DryRun:
        try:
            self.w3.eth.call(call, block_identifier=block)  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001 - any RPC/transport failure is classified below
            return self._classify(exc)
        return DryRun()

    # --------------------------------------------------------------- send
    def _blocked(self, message: str) -> TxResult:
        return TxResult("blocked_at_protocol", BLOCKED_REASON, None, None, [], message, False)

    def _gas(self, call: dict[str, Any], dry: DryRun) -> int:
        if dry.reverted:
            return FALLBACK_GAS
        try:
            est = int(self.w3.eth.estimate_gas(call))  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001 - estimate failure falls back to a fixed gas limit
            return FALLBACK_GAS
        return est * GAS_BUFFER_NUM // GAS_BUFFER_DEN

    def _transact(self, sender_ref: str, to: str, data: str | bytes) -> TxResult:
        sender = self._addr(sender_ref)
        signer = self.signers.get(sender)
        payload = data if isinstance(data, str) else "0x" + data.hex()
        call = {"from": sender, "to": to_checksum_address(to), "data": payload}
        dry = self._dry_run(call)
        if dry.blocked_msg is not None:
            return self._blocked(dry.blocked_msg)
        with self._send_lock:  # one in-flight tx at a time: nonces stay in order across a scene run
            try:
                tx = {
                    **call,
                    "value": 0,
                    "gas": self._gas(call, dry),
                    "gasPrice": self.w3.eth.gas_price * 5 // 4 + 1,
                    "nonce": self.w3.eth.get_transaction_count(sender, "pending"),
                    "chainId": self.w3.eth.chain_id,
                }
                tx_hash = signer.send(self.w3, tx)
            except Exception as exc:  # noqa: BLE001 - any RPC/transport failure is classified below
                msg = _rpc_message(exc)
                if msg is not None and is_blocked_at_protocol(msg):
                    return self._blocked(msg)
                raise ChainWriteError(
                    f"send failed: {msg}" if msg else f"send failed: {type(exc).__name__}"
                ) from None
            try:
                rc = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.receipt_timeout)
            except TimeExhausted:
                raise ChainWriteError(f"no receipt for {_hex(tx_hash)} in time") from None
            except Exception as exc:  # noqa: BLE001 - any RPC/transport failure is classified below
                raise ChainWriteError(f"receipt failed: {type(exc).__name__}") from None
        return self._result(rc, call, dry)

    def _result(self, rc: Any, call: dict[str, Any], dry: DryRun) -> TxResult:
        tx_hash, block = _hex(rc["transactionHash"]), int(rc["blockNumber"])
        if int(rc["status"]) == 1:
            ts = int(self.w3.eth.get_block(block)["timestamp"])
            events: list[ChainEvent] = []
            for lg in rc["logs"]:
                ev = self._decoder.decode(lg, ts, self.dep.tx_allowlist)
                if ev is not None:
                    events.append(ev)
            events.sort(key=lambda e: e.log_index)
            return TxResult("ok", None, tx_hash, block, events, None, False)
        replay = self._dry_run(call, block)  # same block: the state the tx saw
        info = replay.info if replay.reverted and replay.info else dry.info
        if info is None:
            info = RevertInfo(None, None, "execution reverted")
        return TxResult("reverted", info.reason, tx_hash, block, [], info.raw, False)

    def _simulate(self, sender_ref: str, to: str, data: str) -> ReasonCode | None:
        call = {"from": self._addr(sender_ref), "to": to_checksum_address(to), "data": data}
        return self._dry_run(call).reason

    # ---------------------------------------------------------------- spend
    def _pay_data(self, token: str, to: str, amount: int, memo: str) -> str:
        return self.vault.encode_abi(
            "pay", args=[self._addr(token), self._addr(to), int(amount), keccak(text=memo)]
        )

    def _swap_data(
        self,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        reason: str,
    ) -> str:
        return self.vault.encode_abi(
            "swap",
            args=[
                self._addr(dex),
                bytes.fromhex(selector.removeprefix("0x")),
                self._addr(token_in),
                self._addr(token_out),
                int(amount_in),
                int(min_out),
                keccak(text=reason),
            ],
        )

    def pay(self, signer: str, token: str, to: str, amount: int, memo: str = "") -> TxResult:
        return self._transact(signer, self.vault.address, self._pay_data(token, to, amount, memo))

    def swap(
        self,
        signer: str,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        reason: str = "",
    ) -> TxResult:
        data = self._swap_data(dex, selector, token_in, token_out, amount_in, min_out, reason)
        return self._transact(signer, self.vault.address, data)

    def simulate_pay(self, signer: str, token: str, to: str, amount: int) -> ReasonCode | None:
        """`eth_call` only. Reverts that carry no reason code (e.g. a non-council caller) give None."""
        return self._simulate(signer, self.vault.address, self._pay_data(token, to, amount, ""))

    def simulate_swap(
        self,
        signer: str,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
    ) -> ReasonCode | None:
        data = self._swap_data(dex, selector, token_in, token_out, amount_in, min_out, "")
        return self._simulate(signer, self.vault.address, data)

    def raw_call(self, signer: str, target: str, data: str) -> TxResult:
        """Arbitrary tx to any contract (the Tx AllowList is the gate that matters)."""
        return self._transact(
            signer, self._addr(target), data if data.startswith("0x") else "0x" + data
        )

    # -------------------------------------------------------------- council
    def _need_council(self) -> Contract:
        if self.council is None:
            raise ChainWriteError("deployments file has no council address")
        return self.council

    def _council_tx(self, member: str, fn: str, *args: Any) -> TxResult:
        c = self._need_council()
        return self._transact(member, c.address, c.encode_abi(fn, args=list(args)))

    def emergency_lock(self, member: str, principal_id: str) -> TxResult:
        return self._council_tx(member, "emergencyLock", id_to_bytes32(principal_id))

    def emergency_pause(self, member: str) -> TxResult:
        return self._council_tx(member, "emergencyPause")

    def lower_key_cap(self, member: str, key: str, new_cap: int) -> TxResult:
        return self._council_tx(
            member, "lowerCap", 0, address_to_bytes32(self._addr(key)), int(new_cap)
        )

    def lower_district_cap(self, member: str, principal_id: str, new_cap: int) -> TxResult:
        return self._council_tx(member, "lowerCap", 1, id_to_bytes32(principal_id), int(new_cap))

    def revoke_allow(
        self, member: str, kind: str, subject: str, selector: str | None = None
    ) -> TxResult:
        addr = self._addr(subject)
        sel = selector
        if kind == "protocol" and not sel:
            sel = self._selectors.get(addr)
        raw_sel = bytes.fromhex((sel or "0x00000000").removeprefix("0x"))
        return self._council_tx(
            member, "revokeAllow", ALLOW_KINDS[kind], address_to_bytes32(addr), raw_sel
        )

    def deactivate_key(self, member: str, key: str) -> TxResult:
        return self._council_tx(member, "deactivateKey", self._addr(key))

    def propose(
        self,
        member: str,
        title: str,
        subject_principal: str | None,
        calls: list[dict[str, Any]],
        risk_report_hash: str,
    ) -> int:
        """Proposal id from the `Proposed` event; raises `ChainRevert` on a revert or a blocked sender."""
        encoded = self._encoder.encode(
            calls
        )  # raises ChainRevert (TargetNotAllowed...) like the sim
        subject = id_to_bytes32(subject_principal) if subject_principal else bytes(32)
        res = self._council_tx(
            member,
            "propose",
            title,
            subject,
            [(t, d) for t, d in encoded],
            hash_to_bytes32(risk_report_hash),
        )
        if res.status != "ok":
            raise ChainRevert(res.error_raw or "reverted", res.reason_code)
        for ev in res.events:
            if ev.name == "Proposed":
                return int(ev.payload["id"])
        raise ChainWriteError("propose succeeded but emitted no Proposed event")

    def approve(self, member: str, proposal_id: int) -> TxResult:
        return self._council_tx(member, "approve", int(proposal_id))

    def cancel(self, member: str, proposal_id: int) -> TxResult:
        return self._council_tx(member, "cancel", int(proposal_id))

    def apply_policy_v2(self) -> list[TxResult]:
        """Seed policy v2 via propose + the approvals listed in the seed (same as `SimChain`)."""
        v2 = self._seed["policy_v2"]
        pid = self.propose(
            v2["approvers"][0],
            v2["title"],
            v2["subject_principal"],
            v2["calls"],
            "0x" + keccak(text="policy_v2").hex(),
        )
        return [self.approve(m, pid) for m in v2["approvers"]]
