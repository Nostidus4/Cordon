"""Copilot WRITE tools that only PREPARE: `prepare_pay`, `prepare_swap`. They read the snapshot, validate the
request against what exists, and return a `Prepared` call. They never touch `ChainPort` writes and never store
anything: `service` stores the draft, and only `executor.send` (called by the confirm endpoint) sends.

Caps and whitelists are NOT checked here (no off-chain loosening or tightening): the vault on chain is the allowance,
a prepared call that the vault would refuse is still shown, and the refusal is recorded when the user confirms."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from guardian.assistant.copilot.intent import HEX_ADDR
from guardian.services import views
from guardian.services.runtime import Runtime

SOURCE = "copilot"


class CopilotError(ValueError):
    """The request cannot be prepared; `str(e)` is a Vietnamese sentence for the user."""


@dataclass
class Prepared:
    kind: str  # pay | swap
    prepared: dict[str, Any]  # PreparedTx field names (B05 contract)
    internal: dict[str, Any]  # seed ids + params for the spend call
    details: dict[str, Any]
    summary_vi: str
    numbers: list[tuple[str, str]] = field(
        default_factory=list
    )  # (label, display) quoted in the reply


def clean(label: str) -> str:
    """Untrusted label -> speakable text without digits (so reply text carries only verified numbers)."""
    s = re.sub(r"\s*\(\d+\)", "", label)
    s = re.sub(r"\d+", "", s).strip()
    return s or "ví chưa rõ"


class CopilotTools:
    def __init__(self, rt: Runtime) -> None:
        self._rt = rt
        self._snap = rt.snapshot()

    # ------------------------------------------------------------------ resolvers
    def _key(self, ref: str) -> Any:
        keys = list(self._snap.keys.values())
        ref_l = str(ref).strip()
        for k in keys:
            if ref_l in (k.seed_id, k.address) or ref_l.lower() == str(k.address).lower():
                return k
        same = [k for k in keys if k.principal_id == ref_l and k.active]
        if same:  # "principal" form: the district's first live card
            return min(same, key=lambda k: k.seed_id)
        raise CopilotError("Mình không tìm thấy thẻ này trong tổ chức.")

    def _token(self, ref: str) -> Any:
        for t in self._snap.tokens:
            if str(ref) in (t.symbol, t.address) or str(ref).lower() == t.symbol.lower():
                return t
        raise CopilotError("Loại tiền này mình chưa biết.")

    def _recipient(self, ref: str) -> tuple[str, str, str]:
        """(seed or hex, address, label). An unknown hex is allowed: the vault whitelist will refuse it."""
        for r in self._snap.recipients:
            if str(ref) in (r.seed_id, r.address) or str(ref).lower() == r.address.lower():
                return r.seed_id, r.address, clean(r.label)
        if HEX_ADDR.fullmatch(str(ref).lower()):
            return str(ref), self._rt.addr(str(ref)), "một ví chưa có trong danh sách"
        raise CopilotError(
            "Mình không biết người nhận này. Hãy nêu tên nhà cung cấp hoặc địa chỉ ví."
        )

    def _protocol(self, ref: str) -> Any:
        for p in self._snap.protocols:
            if str(ref) in (p.seed_id, p.address, p.label):
                return p
        raise CopilotError("Mình không biết chợ đổi tiền này.")

    @staticmethod
    def _amount(v: Any, what: str) -> int:
        if isinstance(v, dict):
            v = v.get("raw")
        if isinstance(v, bool) or not isinstance(v, (int, str)):
            raise CopilotError(f"Số tiền {what} không hợp lệ.")
        try:
            n = int(v)
        except ValueError as e:
            raise CopilotError(f"Số tiền {what} không hợp lệ.") from e
        if n <= 0:
            raise CopilotError(f"Số tiền {what} phải lớn hơn 0.")
        return n

    # ------------------------------------------------------------------ the two write tools
    def prepare_pay(
        self, key: str, to: str, amount: Any, token: str = "tUSDC", memo: str = "copilot"
    ) -> Prepared:
        ks, tok = self._key(key), self._token(token)
        n = self._amount(amount, "chuyển")
        to_seed, to_addr, to_label = self._recipient(to)
        amount_m = views.mny(n, tok.decimals)
        signer = clean(ks.label)
        summary = f"Chuyển {amount_m['display']} {tok.symbol} từ {signer} cho {to_label}."
        return Prepared(
            kind="pay",
            prepared={
                "kind": "pay",
                "signer": ks.address,
                "token": tok.address,
                "to": to_addr,
                "amount": str(n),
                "tokenOut": None,
                "minOut": None,
                "data": None,
                "memo": str(memo)[:80],
                "source": SOURCE,
            },
            internal={
                "action": "pay",
                "signer": ks.seed_id,
                "params": {"token": tok.symbol, "to": to_seed, "amount": n, "memo": str(memo)[:80]},
            },
            details={
                "signerLabel": signer,
                "toLabel": to_label,
                "tokenSymbol": tok.symbol,
                "tokenOutSymbol": None,
                "amount": amount_m,
                "minOut": None,
            },
            summary_vi=summary,
            numbers=[("Số tiền", amount_m["display"])],
        )

    def prepare_swap(
        self, key: str, protocol: str, amount_in: Any, token_in: str, token_out: str, min_out: Any
    ) -> Prepared:
        ks, dex = self._key(key), self._protocol(protocol)
        t_in, t_out = self._token(token_in), self._token(token_out)
        if t_in.symbol == t_out.symbol:
            raise CopilotError("Hai loại tiền phải khác nhau.")
        n_in = self._amount(amount_in, "đổi")
        n_min = self._amount(min_out, "tối thiểu nhận")
        in_m, min_m = views.mny(n_in, t_in.decimals), views.mny(n_min, t_out.decimals)
        signer, dex_label = clean(ks.label), clean(dex.label)
        summary = (
            f"Đổi {in_m['display']} {t_in.symbol} sang {t_out.symbol} qua {dex_label} "
            f"bằng {signer}, nhận tối thiểu {min_m['display']} {t_out.symbol}."
        )
        return Prepared(
            kind="swap",
            prepared={
                "kind": "swap",
                "signer": ks.address,
                "token": t_in.address,
                "to": dex.address,
                "amount": str(n_in),
                "tokenOut": t_out.address,
                "minOut": str(n_min),
                "data": dex.selector,
                "memo": "",
                "source": SOURCE,
            },
            internal={
                "action": "swap",
                "signer": ks.seed_id,
                "params": {
                    "dex": dex.seed_id,
                    "token_in": t_in.symbol,
                    "token_out": t_out.symbol,
                    "amount_in": n_in,
                    "min_out": n_min,
                    "reason": "copilot",
                },
            },
            details={
                "signerLabel": signer,
                "toLabel": dex_label,
                "tokenSymbol": t_in.symbol,
                "tokenOutSymbol": t_out.symbol,
                "amount": in_m,
                "minOut": min_m,
            },
            summary_vi=summary,
            numbers=[("Số tiền đổi", in_m["display"]), ("Tối thiểu nhận", min_m["display"])],
        )


__all__ = ["SOURCE", "CopilotError", "CopilotTools", "Prepared"]
