"""Load `deployments/fuji-l1.json` (CONTRACTS.md section 9). No key material ever lives in this file."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from eth_utils import to_checksum_address

from guardian.chain.client import ChainReadError
from guardian.chain.precompiles import TX_ALLOWLIST

# Backend/deployments/ (this file is Backend/src/guardian/chain/l1/deployments.py)
DEFAULT_DEPLOYMENTS_FILE = Path(__file__).resolve().parents[4] / "deployments" / "fuji-l1.json"

REQUIRED_CONTRACTS = ("registry", "vault")


@dataclass(frozen=True)
class Deployments:
    """Addresses of one deployment. `council` and the tokens/DEXes are optional for reads."""

    registry: str
    vault: str
    council: str | None = None
    mock_dex: str | None = None
    evil_dex: str | None = None
    tokens: dict[str, str] = field(default_factory=dict)  # symbol -> address (tUSDC, tTKB, tSCAM)
    tx_allowlist: str = TX_ALLOWLIST
    chain_id: int | None = None
    rpc_url: str | None = None
    deploy_block: int = 0  # first block to scan for labels and candidate allow-list entries
    policy_baseline: int = 1  # vault.policyVersion() right after seed + handover: "policy v1"

    @property
    def value_token(self) -> str | None:
        return self.tokens.get("tUSDC")


def _addr(value: Any) -> str | None:
    return to_checksum_address(value) if value else None


def parse_deployments(data: dict[str, Any]) -> Deployments:
    contracts = data.get("contracts") or {}
    missing = [k for k in REQUIRED_CONTRACTS if not contracts.get(k)]
    if missing:
        raise ChainReadError(
            f"deployments file has no address for {', '.join(missing)} "
            "(expected {contracts: {registry, vault, ...}}, see docs/spec/CONTRACTS.md section 9)"
        )
    tokens = {
        s: to_checksum_address(contracts[s]) for s in ("tUSDC", "tTKB", "tSCAM") if contracts.get(s)
    }
    precompiles = data.get("precompiles") or {}
    return Deployments(
        registry=to_checksum_address(contracts["registry"]),
        vault=to_checksum_address(contracts["vault"]),
        council=_addr(contracts.get("council")),
        mock_dex=_addr(contracts.get("mockDex")),
        evil_dex=_addr(contracts.get("evilDex")),
        tokens=tokens,
        tx_allowlist=to_checksum_address(precompiles.get("txAllowList") or TX_ALLOWLIST),
        chain_id=data.get("chainId"),
        rpc_url=data.get("rpcUrl"),
        deploy_block=int(data.get("deployBlock", 0)),
        policy_baseline=int(data.get("policyBaseline", 1)),
    )


def load_deployments(path: str | Path | None = None) -> Deployments:
    p = Path(path) if path else DEFAULT_DEPLOYMENTS_FILE
    if not p.is_absolute() and not p.exists():
        p = DEFAULT_DEPLOYMENTS_FILE.parents[1] / p  # relative to Backend/
    if not p.exists():
        raise ChainReadError(f"deployments file not found: {p}")
    return parse_deployments(json.loads(p.read_text(encoding="utf-8")))
