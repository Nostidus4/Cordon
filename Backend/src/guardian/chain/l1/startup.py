"""`CHAIN_MODE=l1` startup: build `L1Chain` from settings and fail early with an actionable message.

Everything that can be missing is checked here, once, instead of surfacing as a traceback on the
first request: the deployments file, the RPC endpoint and its chain id, and (when DEMO_MODE signs
with test keys) one `L1_KEY_<SEED_ID>` per demo actor. Messages name settings and variables only,
never the RPC URL or a key.
"""

from __future__ import annotations

from typing import Any

from web3.exceptions import Web3Exception

from guardian.chain.client import ChainReadError
from guardian.chain.l1.chain import L1Chain
from guardian.chain.l1.signers import ENV_PREFIX, SignerError
from guardian.chain.sim.engine import load_seed
from guardian.core.config import Settings
from guardian.shared.scenario4 import SCENARIO4_STEPS

AGENT_SIGNER = "key_agent_rebalance"


class L1StartupError(RuntimeError):
    """CHAIN_MODE=l1 cannot start; the message says what to set or run."""


def demo_signer_ids(seed: dict[str, Any]) -> list[str]:
    """Seed ids the demo endpoints sign with: scene 4 actors, the agent, every Council member."""
    ids = {s.signer for s in SCENARIO4_STEPS} | {AGENT_SIGNER}
    ids |= {m["seed_id"] for m in seed.get("council", [])}
    order = [e["seed_id"] for e in (*seed.get("keys", []), *seed.get("council", []))]
    return [i for i in order if i in ids]


def missing_signer_vars(chain: L1Chain, seed: dict[str, Any]) -> list[str]:
    """`L1_KEY_*` variables still to set so that every demo actor can sign."""
    by_id = {e["seed_id"]: e["address"] for e in (*seed.get("keys", []), *seed.get("council", []))}
    return [
        ENV_PREFIX + sid.upper()
        for sid in demo_signer_ids(seed)
        if sid in by_id and by_id[sid] not in chain.signers
    ]


def build_l1_chain(settings: Settings) -> L1Chain:
    """`L1Chain.from_settings` with startup errors turned into `L1StartupError`."""
    seed = load_seed()
    try:
        chain = L1Chain.from_settings(settings, seed)
    except ChainReadError as exc:
        text = str(exc)
        hint = (
            " Set DEPLOYMENTS_FILE to the file the deploy script wrote "
            "(docs/modules/chain-adapter/README.md, 'Running with CHAIN_MODE=l1')."
            if "deployments" in text
            else ""
        )
        raise L1StartupError(f"CHAIN_MODE=l1: {text}.{hint}") from None
    except SignerError as exc:
        raise L1StartupError(f"CHAIN_MODE=l1: bad signer configuration: {exc}") from None
    except (OSError, Web3Exception) as exc:
        raise L1StartupError(
            f"CHAIN_MODE=l1: cannot reach the node at L1_RPC_URL ({type(exc).__name__}); "
            "start it (make l1-local-up, or anvil) and check the variable."
        ) from None
    try:
        chain.w3.eth.block_number  # noqa: B018 - fails fast when the endpoint is not a node
    except Exception as exc:  # noqa: BLE001
        raise L1StartupError(
            f"CHAIN_MODE=l1: the node at L1_RPC_URL does not answer ({type(exc).__name__})."
        ) from None
    if settings.demo_enabled:
        missing = missing_signer_vars(chain, seed)
        if missing:
            raise L1StartupError(
                "CHAIN_MODE=l1 with DEMO_MODE needs test keys for the demo actors; "
                f"missing: {', '.join(missing)} (each key must derive the seed address; "
                "see Backend/.env.example)."
            )
    return chain
