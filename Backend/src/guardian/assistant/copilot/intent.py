"""Deterministic intent parser (works offline; default path and CI): VI/EN message -> intent + params.

Order matters: injection and drain attempts first, then forecasts (unless the message is a concrete order with an
amount), then orders (pay / swap), then reads. The parser never sees chain state: it only returns what the user asked,
the tools validate it against the real snapshot.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Literal

IntentKind = Literal["read", "pay", "swap", "forecast_refused", "injection_refused", "unknown"]

HEX_ADDR = re.compile(r"0x[0-9a-f]{40}")


def normalize(text: str) -> str:
    """lower-case, accents removed (đ -> d), whitespace collapsed: matching is accent-insensitive."""
    t = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip()


@dataclass
class Intent:
    kind: IntentKind
    params: dict[str, Any] = field(default_factory=dict)
    missing_vi: str | None = None  # for pay/swap that lack a field: what to ask


INJECTION_PATTERNS = [
    r"\b(bo qua|quen|vo hieu hoa|tat|huy bo|bypass)\b.{0,30}\b(luat|quy tac|gioi han|han muc|chi dan|whitelist|danh sach|kiem tra)",
    r"\b(ignore|disregard|forget|override|bypass|disable|skip)\b.{0,30}\b(rules?|instructions?|limits?|caps?|polic(y|ies)|whitelist|checks?|guard)",
    r"(system prompt|developer mode|jailbreak|\bdan mode\b)",
    r"\b(ban|you) (la|are) (admin|quan tri|developer|root)\b",
    r"\b(chuyen|rut|gui|chuyen khoan|send|transfer|move|drain|empty|sweep)\b.{0,25}\b(het|toan bo|tat ca|everything|all (the )?(funds|money|balance|tokens)|entire)\b",
    r"\b(rut can|drain)\b",
    r"\b(het|toan bo|tat ca) (tien|so du|quy|kho)\b",
]
FORECAST_PATTERNS = [
    r"\b(du doan|tien doan|forecast|predict(ion)?)\b",
    r"\bgia\b.{0,40}\b(tuan sau|ngay mai|thang sau|nam sau|se (tang|giam)|tang hay giam|bao gio|sap toi)\b",
    r"\b(price|prices)\b.{0,40}\b(next (week|month|year|day)|tomorrow|go (up|down)|rise|fall|pump|moon|crash)\b",
    r"\bwill\b.{0,40}\b(price|eth|btc|token|coin)\b.{0,30}\b(go|rise|fall|increase|decrease|pump|moon|crash|up|down)\b",
    r"\b(co nen mua|nen mua|should i (buy|sell)|is it a good time to (buy|sell))\b",
    r"\b(se tang|se giam|co tang khong|co giam khong)\b",
]
PAY_VERBS = r"\b(chuyen khoan|chuyen|tra|thanh toan|gui|pay|send|transfer|wire)\b"
SWAP_VERBS = r"\b(doi|hoan doi|quy doi|swap|exchange|convert|trade)\b"

TOKENS = (
    ("tusdc", "tUSDC"),
    ("usdc", "tUSDC"),
    ("ttkb", "tTKB"),
    ("tkb", "tTKB"),
    ("tscam", "tSCAM"),
    ("scam", "tSCAM"),
)
TOKEN_RE = re.compile(r"\b(" + "|".join(a for a, _ in TOKENS) + r")\b")
TOKEN_SEED = dict(TOKENS)

RECIPIENTS = (
    (r"\b(cloud)\b", "vendor_cloud"),
    (r"\b(du lieu|data api|data)\b", "vendor_data_api"),
    (r"\b(thiet ke|design)\b", "vendor_intl_design"),
    (r"\b(nguoi la|stranger|unknown wallet|vi la|unknown)\b", "stranger_wallet"),
)
SIGNERS: tuple[tuple[str, str | None], ...] = (
    (r"\b(tro ly du lieu|agent data|data agent)\b", "key_agent_data"),
    (r"\b(tro ly thanh toan quoc te|agent intl|intl agent)\b", "key_agent_intl_pay"),
    (r"\b(tro ly can doi|agent can doi|rebalance agent)\b", "key_agent_rebalance"),
    (r"\b(phan mem thanh toan|payment (software|service))\b", "key_svc_payment"),
    (
        r"\b(?:tu|from|bang|dung|use|using|with|khoa|key|the)\s+(?:khoa\s+|key\s+|the\s+)?(?:cua\s+)?(?:anh\s+|chi\s+)?(minh|huy|lan)\b",
        None,
    ),
)
PERSON_KEY = {"minh": "key_minh", "huy": "key_huy_1", "lan": "key_lan"}
DEFAULT_SIGNER = "key_minh"

_NUM = r"\d+(?:[.,]\d+)*"


def parse_decimal(tok: str, decimals: int) -> int | None:
    """'5.000' / '5,000' -> 5000 units; '1,5' -> 1.5; '20000' -> 20000. Returns base units (no floats) or None."""
    t = tok.strip()
    frac = ""
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", t):
        whole = int(re.sub(r"[.,]", "", t))
    elif re.fullmatch(rf"\d+[.,]\d{{1,{decimals}}}", t):
        w, frac = re.split(r"[.,]", t)
        whole = int(w)
    elif re.fullmatch(r"\d+", t):
        whole = int(t)
    else:
        return None
    return whole * 10**decimals + (int(frac.ljust(decimals, "0")) if frac else 0)


def _strip_addresses(t: str) -> tuple[str, list[str]]:
    addrs = HEX_ADDR.findall(t)
    return HEX_ADDR.sub(" ", t), addrs


def _first_amount(t: str) -> tuple[str, bool] | None:
    """(number token, has_k_suffix) of the first number in `t`, skipping '#12'-style ids."""
    for m in re.finditer(r"(?<![#\w])(" + _NUM + r")\s*(k|nghin|ngan)?\b", t):
        return m.group(1), bool(m.group(2))
    return None


def _amount_base(tok_k: tuple[str, bool] | None, decimals: int) -> int | None:
    if tok_k is None:
        return None
    base = parse_decimal(tok_k[0], decimals)
    return base * 1000 if base is not None and tok_k[1] else base


def _signer(t: str) -> tuple[str | None, str]:
    for pat, seed in SIGNERS:
        m = re.search(pat, t)
        if m:
            return (seed or PERSON_KEY[m.group(1)]), (t[: m.start()] + " " + t[m.end() :])
    return None, t


def _tokens(t: str) -> list[str]:
    return [TOKEN_SEED[m.group(1)] for m in TOKEN_RE.finditer(t)]


def _decimals(token: str) -> int:
    return 18 if token in ("tTKB", "tSCAM") else 6


def _recipient(t: str, addrs: list[str]) -> str | None:
    if addrs:
        return addrs[0]
    for pat, seed in RECIPIENTS:
        if re.search(pat, t):
            return seed
    return None


def _parse_pay(raw_norm: str) -> Intent:
    t, addrs = _strip_addresses(raw_norm)
    signer, t = _signer(t)
    toks = _tokens(t)
    token = toks[0] if toks else "tUSDC"
    amount = _amount_base(_first_amount(t), _decimals(token))
    to = _recipient(t, addrs)
    params = {
        "key": signer or DEFAULT_SIGNER,
        "to": to,
        "amount": amount,
        "token": token,
        "memo": "copilot",
    }
    if amount is None or amount <= 0:
        return Intent(
            "unknown",
            params,
            "Bạn muốn chuyển bao nhiêu? Ví dụ: “Chuyển 5.000 USDC cho nhà cung cấp cloud”.",
        )
    if to is None:
        return Intent(
            "unknown",
            params,
            "Bạn muốn chuyển cho ai? Mình chỉ nhận tên nhà cung cấp hoặc một địa chỉ ví.",
        )
    return Intent("pay", params)


def _parse_swap(raw_norm: str) -> Intent:
    t, _ = _strip_addresses(raw_norm)
    signer, t = _signer(t)
    toks = _tokens(t)
    dex = "evil_dex" if re.search(r"\b(evil|evildex|san la|cho la)\b", t) else "mock_dex"
    params: dict[str, Any] = {"key": signer or DEFAULT_SIGNER, "protocol": dex}
    if len(toks) < 2 or toks[0] == toks[1]:
        return Intent(
            "unknown",
            params,
            "Bạn muốn đổi loại tiền nào sang loại nào? Ví dụ: “Đổi 1.000 USDC sang TKB”.",
        )
    token_in, token_out = toks[0], toks[1]
    d_in, d_out = _decimals(token_in), _decimals(token_out)
    mo = re.search(r"\b(toi thieu|it nhat|min(?:imum)?|at least)\s*:?\s*(" + _NUM + r")", t)
    head = t[: mo.start()] if mo else t
    amount_in = _amount_base(_first_amount(head), d_in)
    if amount_in is None or amount_in <= 0:
        return Intent("unknown", params, "Bạn muốn đổi bao nhiêu?")
    min_out = parse_decimal(mo.group(2), d_out) if mo else None
    if min_out is None:  # default: 98% of the 1:1 rate (spec §6.6: 1 tTKB = 1 tUSDC), integers only
        min_out = amount_in * 10**d_out // 10**d_in * 98 // 100
    params.update(amountIn=amount_in, tokenIn=token_in, tokenOut=token_out, minOut=min_out)
    return Intent("swap", params)


def parse(message: str) -> Intent:
    """Map one message to an intent. Pure function of the text."""
    n = normalize(message)
    if not n:
        return Intent("unknown", {}, "Bạn hãy gõ một câu hỏi hoặc một lệnh chi tiền.")
    if any(re.search(p, n) for p in INJECTION_PATTERNS):
        return Intent("injection_refused")
    no_addr = HEX_ADDR.sub(" ", n)
    is_pay = bool(re.search(PAY_VERBS, n)) and bool(_first_amount(no_addr))
    is_swap = bool(re.search(SWAP_VERBS, n)) and bool(_tokens(n))
    if any(re.search(p, n) for p in FORECAST_PATTERNS) and not (is_pay or is_swap):
        return Intent("forecast_refused")
    if is_swap:
        return _parse_swap(n)
    if is_pay:
        return _parse_pay(n)
    return Intent("read")  # reads.py decides whether it knows the topic; else it is `unknown` there
