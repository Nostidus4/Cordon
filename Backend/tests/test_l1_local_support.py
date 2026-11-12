"""Small pieces added for the real Guardian L1 (L1-002): the seed override and the Subnet-EVM header fix."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from web3 import Web3
from web3.exceptions import ExtraDataLengthError
from web3.providers import JSONBaseProvider

from guardian.chain.client import make_web3
from guardian.chain.sim.engine import load_seed


def test_load_seed_uses_guardian_seed_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    other = tmp_path / "seed.json"
    other.write_text(json.dumps({"marker": 1}), encoding="utf-8")
    monkeypatch.setenv("GUARDIAN_SEED_FILE", str(other))
    assert load_seed() == {"marker": 1}
    monkeypatch.delenv("GUARDIAN_SEED_FILE")
    assert "keys" in load_seed()  # the packaged seed again


class _SubnetEvmHeader(JSONBaseProvider):
    """Answers every call with a block header whose extraData is 86 bytes, as Subnet-EVM v0.8.0 does."""

    def make_request(self, method: Any, params: Any) -> Any:
        block = {"number": "0x1", "extraData": "0x" + "00" * 86}
        return {"jsonrpc": "2.0", "id": 1, "result": block}


def test_make_web3_accepts_subnet_evm_extra_data() -> None:
    plain = Web3(_SubnetEvmHeader())
    with pytest.raises(ExtraDataLengthError):  # what the first run against the real node hit
        plain.eth.get_block("latest")
    w3 = make_web3("http://127.0.0.1:1")
    w3.provider = _SubnetEvmHeader()
    assert w3.eth.get_block("latest")["number"] == 1
