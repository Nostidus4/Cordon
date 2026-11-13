"""B05 Tx Guardian service: check (simulate + rules + explanation), send, reject, list.

`check` only reads: it calls `ChainPort.simulate_pay/simulate_swap`, `balance` and `snapshot`, never a state-changing
method. `reject` never touches the chain. `send` goes through `attempt_service.run_spend`, the same path every other
signed spend takes, so the chain's own rules still decide and nothing here loosens them.
"""

from __future__ import annotations

import logging
from typing import Any

from eth_utils import to_checksum_address

from guardian.core.errors import ApiError
from guardian.domain.snapshot import PolicySnapshot
from guardian.schemas.common import Money
from guardian.schemas.txguard import (
    PreparedTx,
    SentTx,
    StateDiff,
    TxApproval,
    TxCheckOut,
    TxFinding,
    TxFlow,
)
from guardian.services import attempt_service as att
from guardian.services import views
from guardian.services.runtime import Runtime
from guardian.shared.reason_codes import ReasonCode
from guardian.txguard import explain as ex
from guardian.txguard import rules as rl

log = logging.getLogger("guardian.txguard")

APPROVE_SELECTOR = "0x095ea7b3"  # approve(address,uint256)
UINT256_MAX = 2**256 - 1
DEFAULT_DECIMALS = 18


def _bad(msg: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", msg)


def _int(name: str, v: str | None, required: bool = True) -> int | None:
    if v is None or v == "":
        if required:
            raise _bad(f"{name}: bắt buộc")
        return None
    if not v.isdigit():
        raise _bad(f"{name}: phải là số nguyên không âm")
    n = int(v)
    if n > UINT256_MAX:
        raise _bad(f"{name}: quá lớn")
    return n


def _addr(rt: Runtime, name: str, ref: str | None) -> str:
    if not ref:
        raise _bad(f"{name}: bắt buộc")
    try:
        return rt.addr(ref)
    except (KeyError, ValueError) as e:
        raise _bad(f"{name}: địa chỉ không hợp lệ") from e


def known_addresses(snap: PolicySnapshot, vault_addr: str) -> frozenset[str]:
    """Addresses the organisation trusts: allowed recipients / protocols / tokens, its keys, council and vault."""
    out = {vault_addr}
    out.update(k.address for k in snap.keys.values())
    out.update(m.address for m in snap.council)
    out.update(r.address for r in snap.recipients if r.allowed)
    out.update(p.address for p in snap.protocols if p.allowed)
    out.update(t.address for t in snap.tokens if t.allowed)
    return frozenset(a.lower() for a in out)


def _label(snap: PolicySnapshot, addr: str, vault_addr: str) -> str | None:
    a = addr.lower()
    if a == vault_addr.lower():
        return "Kho tiền"
    for k in snap.keys.values():
        if k.address.lower() == a:
            return k.label
    for m in snap.council:
        if m.address.lower() == a:
            return m.label
    others: list[Any] = [*snap.recipients, *snap.protocols]
    for x in others:
        if x.address.lower() == a:
            return str(x.label)
    return None


def _token_info(snap: PolicySnapshot, addr: str) -> tuple[str, int]:
    for t in snap.tokens:
        if t.address.lower() == addr.lower():
            return t.symbol, t.decimals
    return addr, DEFAULT_DECIMALS


def _ref(snap: PolicySnapshot, addr: str) -> str:
    """Address -> seed id when the snapshot knows it (run_spend wants ids for labels / decimals), else the address."""
    a = addr.lower()
    for k in snap.keys.values():
        if k.address.lower() == a:
            return k.seed_id
    others: list[Any] = [*snap.recipients, *snap.protocols]
    for x in others:
        if x.address.lower() == a:
            return str(x.seed_id)
    for t in snap.tokens:
        if t.address.lower() == a:
            return t.symbol
    return to_checksum_address(addr)


def approve_calldata(spender: str, amount: int) -> str:
    return APPROVE_SELECTOR + spender.lower().removeprefix("0x").rjust(64, "0") + f"{amount:064x}"


def parse_approve(data: str) -> tuple[str, int] | None:
    """(spender, amount) of a full approve(address,uint256) calldata, else None (e.g. a bare selector)."""
    d = data.lower()
    if not d.startswith(APPROVE_SELECTOR) or len(d) < len(APPROVE_SELECTOR) + 128:
        return None
    body = d[len(APPROVE_SELECTOR) :]
    try:
        return "0x" + body[24:64], int(body[64:128], 16)
    except ValueError:
        return None


def _quote(amount_in: int, dec_in: int, dec_out: int) -> int:
    """MockDEX quotes 1 tTKB = 1 tUSDC in value (seed `dex.rate`, spec §6.6): same value, other decimals."""
    return amount_in * 10**dec_out // 10**dec_in


def _money(amount: int, dec: int) -> Money:
    return Money(**views.mny(amount, dec))


def _flow(snap: PolicySnapshot, token_addr: str, amount: int) -> TxFlow:
    sym, dec = _token_info(snap, token_addr)
    return TxFlow(token=sym, amount=_money(amount, dec))


def _selector_for(snap: PolicySnapshot, dex: str) -> str:
    for p in snap.protocols:
        if p.address.lower() == dex.lower():
            return p.selector
    return snap.protocols[0].selector  # one swapExactIn selector for every DEX in the seed


def _vault_balance(rt: Runtime, token_addr: str) -> int | None:
    try:
        return int(rt.chain.balance(rt.chain.vault_addr, token_addr))
    except Exception:  # noqa: BLE001 - an address the ledger does not know
        return None


def _build(rt: Runtime, p: PreparedTx) -> tuple[StateDiff, rl.RuleInput, bool]:
    """Resolve the input, simulate through ChainPort and gather the facts for the rules. Read-only."""
    snap, chain = rt.snapshot(), rt.chain
    signer = _addr(rt, "signer", p.signer)
    key = snap.keys.get(signer)
    if key is None:
        raise _bad("signer: khoá này chưa có trong tổ chức")
    to = _addr(rt, "to", p.to)
    known = known_addresses(snap, chain.vault_addr)
    vault = chain.vault_addr
    reason: ReasonCode | None = None
    simulated = False
    outflows: list[TxFlow] = []
    inflows: list[TxFlow] = []
    approvals: list[TxApproval] = []
    inp: dict[str, Any] = {}
    targets: tuple[str, ...] = (to.lower(),)

    if p.kind == "pay":
        token = _addr(rt, "token", p.token)
        amount = _int("amount", p.amount)
        assert amount is not None
        reason = chain.simulate_pay(signer, token, to, amount)
        simulated = True
        outflows.append(_flow(snap, token, amount))
        inp = {"amount": amount, "balance": _vault_balance(rt, token)}
    elif p.kind == "swap":
        t_in, t_out = _addr(rt, "token", p.token), _addr(rt, "tokenOut", p.token_out)
        amount = _int("amount", p.amount)
        min_out = _int("minOut", p.min_out, required=False) or 0
        assert amount is not None
        reason = chain.simulate_swap(
            signer, to, _selector_for(snap, to), t_in, t_out, amount, min_out
        )
        simulated = True
        _, d_in = _token_info(snap, t_in)
        _, d_out = _token_info(snap, t_out)
        quoted = _quote(amount, d_in, d_out)
        outflows.append(_flow(snap, t_in, amount))
        inflows.append(_flow(snap, t_out, quoted))
        inp = {
            "amount": amount,
            "balance": _vault_balance(rt, t_in),
            "quoted_out": quoted,
            "min_out": min_out,
        }
    elif p.kind == "approve":
        token = _addr(rt, "token", p.token)
        amount = _int("amount", p.amount)
        assert amount is not None
        sym, dec = _token_info(snap, token)
        approvals.append(
            TxApproval(
                token=sym,
                spender=to,
                amount=_money(amount, dec),
                unlimited=amount >= rl.UNLIMITED_FROM,
            )
        )
        inp = {"approve_amounts": (amount,)}
    else:  # raw: ChainPort cannot simulate an arbitrary call, so the diff comes from the calldata alone
        data = (p.data or "").strip()
        if not data.startswith("0x"):
            raise _bad("data: cần dữ liệu dạng hex (0x…)")
        parsed = parse_approve(data)
        if parsed is not None:
            spender, amount = parsed
            sym, dec = _token_info(snap, to)
            approvals.append(
                TxApproval(
                    token=sym,
                    spender=to_checksum_address(spender),
                    amount=_money(amount, dec),
                    unlimited=amount >= rl.UNLIMITED_FROM,
                )
            )
            targets = (to.lower(), spender.lower())
            inp = {"approve_amounts": (amount,)}

    diff = StateDiff(
        outflows=outflows,
        inflows=inflows,
        approvals=approvals,
        recipient=to,
        recipient_label=_label(snap, to, vault),
        recipient_known=to.lower() in known,
        principal_id=key.principal_id,
        chain_reason=reason,
        simulated=simulated,
    )
    rule_in = rl.RuleInput(kind=p.kind, known=known, targets=targets, **inp)
    return diff, rule_in, reason is not None


def check(rt: Runtime, prepared: PreparedTx) -> TxCheckOut:
    """Simulate (no state change), run the five rules, explain. Stored in memory (cleared by demo reset)."""
    diff, rule_in, chain_rejects = _build(rt, prepared)
    findings = [
        TxFinding(rule_id=f.rule_id, level=f.level, title_vi=f.title_vi, detail_vi=f.detail_vi)
        for f in rl.evaluate(rule_in)
    ]
    level = rl.overall_level(
        [rl.Finding(f.rule_id, f.level, f.title_vi, f.detail_vi) for f in findings],
        chain_rejects,
    )
    text, source = ex.explain(rt, prepared.kind, diff, findings, level)
    out = TxCheckOut(
        id=rt.stores.next_txcheck_id(),
        created_at=rt.now(),
        prepared=prepared,
        diff=diff,
        findings=findings,
        level=level,
        explanation_vi=text,
        explanation_source=source,  # type: ignore[arg-type]
        numbers=ex.numbers_of(diff),
        numbers_verified=ex.numbers_in_diff(text, diff),
        status="pending",
    )
    rt.stores.tx_checks[out.id] = out
    return out


def get_check(rt: Runtime, check_id: int) -> TxCheckOut:
    out = rt.stores.tx_checks.get(check_id)
    if out is None:
        raise ApiError(404, "TX_CHECK_NOT_FOUND", "Không có lần soi giao dịch này.")
    return out  # type: ignore[no-any-return]


def list_checks(rt: Runtime, limit: int = 50) -> list[TxCheckOut]:
    """Newest first."""
    items = sorted(rt.stores.tx_checks.values(), key=lambda c: c.id, reverse=True)
    return items[: max(0, limit)]


def _require_pending(out: TxCheckOut) -> None:
    if out.status != "pending":
        label = {"sent": "đã gửi", "rejected": "đã bị từ chối"}[out.status]
        raise ApiError(409, "TX_CHECK_NOT_PENDING", f"Giao dịch này {label}, không xử lý lại được.")


def reject(rt: Runtime, check_id: int) -> TxCheckOut:
    """Mark the check rejected. Never calls the chain."""
    out = get_check(rt, check_id)
    _require_pending(out)
    out.status = "rejected"
    return out


def send(rt: Runtime, check_id: int) -> TxCheckOut:
    """Sign and send a pending check with the key's demo signer (DEMO_MODE only). The chain still decides."""
    if not rt.settings.demo_enabled:
        raise ApiError(403, "DEMO_MODE_REQUIRED", "Chức năng này chỉ có ở chế độ demo.")
    out = get_check(rt, check_id)
    _require_pending(out)
    p = out.prepared
    snap = rt.snapshot()
    signer = snap.keys[rt.addr(p.signer)].seed_id
    to = _ref(snap, rt.addr(p.to))
    if p.kind == "pay":
        rec = att.run_spend(
            rt,
            signer,
            "pay",
            {
                "token": _ref(snap, rt.addr(p.token or "")),
                "to": to,
                "amount": int(p.amount or 0),
                "memo": p.memo,
            },
        )
    elif p.kind == "swap":
        rec = att.run_spend(
            rt,
            signer,
            "swap",
            {
                "dex": to,
                "token_in": _ref(snap, rt.addr(p.token or "")),
                "token_out": _ref(snap, rt.addr(p.token_out or "")),
                "amount_in": int(p.amount or 0),
                "min_out": int(p.min_out or 0),
                "reason": p.memo,
            },
        )
    else:
        if p.kind == "approve":
            data = approve_calldata(rt.addr(p.to), int(p.amount or 0))
            target = _ref(snap, rt.addr(p.token or ""))
        else:
            data, target = p.data or "0x", to
        rec = att.run_spend(rt, signer, "raw_call", {"target": target, "data": data})
    out.sent_tx = SentTx(
        tx_hash=rec.tx_hash,
        simulated=rec.simulated,
        ok=rec.outcome == "ok",
        reason_code=rec.reason_code,
    )
    out.status = "sent"
    rt.notify_state_changed()
    return out


# ----------------------------------------------------------------------------- scene 4 / fault F05 hook
def record_attempt(
    rt: Runtime, signer: str, action: str, params: dict[str, Any], source: str
) -> None:
    """Record a check for a spend that is about to be sent (scene-4 attacker steps, F05). Never raises: a
    failed check must not change what the attempt itself does."""
    try:
        base: dict[str, Any] = {"signer": rt.addr(signer), "source": source}
        if action == "pay":
            prepared = PreparedTx(
                kind="pay",
                token=rt.addr(params["token"]),
                to=rt.addr(params["to"]),
                amount=str(params["amount"]),
                memo=params.get("memo", ""),
                **base,
            )
        elif action == "swap":
            prepared = PreparedTx(
                kind="swap",
                token=rt.addr(params["token_in"]),
                token_out=rt.addr(params["token_out"]),
                to=rt.addr(params["dex"]),
                amount=str(params["amount_in"]),
                min_out=str(params.get("min_out", 0)),
                **base,
            )
        elif action == "raw_call":
            prepared = PreparedTx(
                kind="raw", to=rt.addr(params["target"]), data=params["data"], **base
            )
        else:
            return
        check(rt, prepared)
    except Exception:
        log.warning("could not record a tx check for %s", action, exc_info=True)
