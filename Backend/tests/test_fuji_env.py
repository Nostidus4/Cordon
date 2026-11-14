"""infra/l1/fuji_env.py: the Backend env file for CHAIN_MODE=l1 on Fuji (throwaway keys, no network)."""

from __future__ import annotations

import importlib.util
import json
import stat
import subprocess
from pathlib import Path
from typing import Any

import pytest
from eth_account import Account

REPO = Path(__file__).resolve().parents[2]


def load_module() -> Any:
    spec = importlib.util.spec_from_file_location("fuji_env", REPO / "infra" / "l1" / "fuji_env.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def parse(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v
    return out


@pytest.fixture
def setup(tmp_path: Path) -> dict[str, Any]:
    keys = {sid: Account.create() for sid in ("key_minh", "council_trang")}
    env = {
        f"L1_KEY_{sid.upper()}": "0x" + acct.key.hex().removeprefix("0x")
        for sid, acct in keys.items()
    }
    env["OTHER_VAR"] = "x"
    record = tmp_path / "chain.json"
    record.write_text(
        json.dumps({"rpcUrl": "http://127.0.0.1:9650/rpc", "wsUrl": "ws://127.0.0.1:9650/ws"})
    )
    return {"env": env, "record": record, "out": tmp_path / ".env.l1-fuji", "tmp": tmp_path}


def test_writes_env_with_keys_seed_and_urls(setup: dict[str, Any]) -> None:
    mod = load_module()
    seed = setup["tmp"] / "seed.l1-fuji.json"
    names = mod.write_backend_env(
        {"chainId": 845357}, setup["env"], setup["out"], seed, setup["record"]
    )
    out = parse(setup["out"])
    assert names == ["L1_KEY_COUNCIL_TRANG", "L1_KEY_KEY_MINH"]
    assert out["CHAIN_MODE"] == "l1" and out["L1_CHAIN_ID"] == "845357"
    assert out["L1_RPC_URL"] == "http://127.0.0.1:9650/rpc"
    assert out["L1_WS_URL"] == "ws://127.0.0.1:9650/ws"
    assert out["DEPLOYMENTS_FILE"] == "deployments/fuji-l1.json"
    assert out["CCHAIN_DEPLOYMENTS_FILE"] == "deployments/fuji-c.json"
    assert out["GUARDIAN_SEED_FILE"] == str(seed.resolve())
    assert out["DEMO_MODE"] == "true" and out["COUNCIL_TIMELOCK_S"] == "60"
    assert 845357 in json.loads(out["DEMO_CHAIN_IDS"].strip("'"))
    assert out["L1_KEY_KEY_MINH"] == setup["env"]["L1_KEY_KEY_MINH"]
    assert "OTHER_VAR" not in out
    assert stat.S_IMODE(setup["out"].stat().st_mode) == 0o600


def test_rpc_and_ws_overrides(setup: dict[str, Any]) -> None:
    mod = load_module()
    mod.write_backend_env(
        {"chainId": 845357},
        setup["env"],
        setup["out"],
        setup["tmp"] / "s.json",
        setup["record"],
        rpc="http://10.0.0.5/rpc",
        ws="ws://10.0.0.5/ws",
    )
    out = parse(setup["out"])
    assert out["L1_RPC_URL"] == "http://10.0.0.5/rpc" and out["L1_WS_URL"] == "ws://10.0.0.5/ws"


def test_output_is_ignored_by_version_control() -> None:
    r = subprocess.run(["git", "check-ignore", "-q", "Backend/.env.l1-fuji"], check=False, cwd=REPO)
    assert r.returncode == 0
