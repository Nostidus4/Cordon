"""LLM writes one VI sentence only; template fallback; reasonHash (spec §7.1)."""

from __future__ import annotations

from eth_utils import keccak

from guardian.agent_rebalance.rule_engine import Decision
from guardian.shared.money import fmt_display


def _pct(bps: int) -> str:
    return f"{bps // 100},{bps % 100:02d}".rstrip("0").rstrip(",")


def template_reason(d: Decision) -> str:
    return (
        f"Tỉ trọng tTKB đang là {_pct(d.ttkb_weight_bps)}% thấp hơn mục tiêu "
        f"{_pct(d.target_bps)}%, nên đổi {fmt_display(d.amount_in)} tUSDC sang tTKB."
    )


def reason_hash(text: str) -> str:
    return "0x" + keccak(text=text).hex()


def write_reason(d: Decision) -> tuple[str, str]:
    """Returns (sentence, reason_source). TODO: LLM hook (must not change amount/token/DEX)."""
    return template_reason(d), "template"
