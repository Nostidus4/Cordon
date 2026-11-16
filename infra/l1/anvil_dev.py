#!/usr/bin/env python3
"""Local anvil "L1" for the l1 compose stack and `make e2e` (L1-003). Local only, PUBLIC test mnemonic keys only.

    cd Backend && uv run python ../infra/l1/anvil_dev.py up|down|status

`up` starts anvil on 127.0.0.1:8545 (chain id 424242, the local Guardian L1's; 12 funded dev accounts = the roster
addresses of contracts/genesis/roster.local.json), deploys the May Labs set the way the anvil test-suite does
(tests/chain_l1/anvil_env.py: real contracts, MockAllowList at the Tx AllowList address, policy v1 seeded, Council
timelock 0) with the localised seed, brings the Council counter to 11 (so scene 5 requests are #12 and #13, like after
`make demo-reset`) and writes git-ignored files:

  Backend/deployments/anvil-l1.json        addresses only
  infra/l1/seed.l1-anvil.json              the seed with the roster addresses
  Backend/.env.l1-anvil                    native API:  uv run --env-file .env.l1-anvil uvicorn guardian.main:app
  Backend/.env.l1-anvil.docker             containers:  L1_ENV_FILE=./Backend/.env.l1-anvil.docker
                                           L1_SEED_FILE=./infra/l1/seed.l1-anvil.json make stack-l1
                                           (RPC through infra/l1/host_rpc_proxy.py --upstream 127.0.0.1:8545 --allow '^/$')

Needs Foundry (anvil, cast, forge) and `contracts/out` (`make contracts-build`). Never use these keys on a real network.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Backend"))

PORT = int(os.environ.get("ANVIL_DEV_PORT", "8545"))
CHAIN_ID = 424242
PIDFILE = ROOT / "infra" / "l1" / ".anvil-dev.pid"
DEP_FILE = ROOT / "Backend" / "deployments" / "anvil-l1.json"
SEED_OUT = ROOT / "infra" / "l1" / "seed.l1-anvil.json"
ENV_NATIVE = ROOT / "Backend" / ".env.l1-anvil"
ENV_DOCKER = ROOT / "Backend" / ".env.l1-anvil.docker"
MNEMONIC = "test test test test test test test test test test test junk"
PROXY = os.environ.get("L1_DOCKER_PROXY") or "host.docker.internal:9660"


def foundry(name: str) -> str:
    exe = shutil.which(name) or str(Path.home() / ".foundry" / "bin" / name)
    if not Path(exe).exists():
        sys.exit(f"{name} not found (install Foundry)")
    return exe


def up() -> int:
    if PIDFILE.exists():
        sys.exit(f"already running (pid file {PIDFILE}); `down` first")
    env = {**os.environ, "L1_LOCAL_ENV_FILE": str(ENV_NATIVE), "L1_LOCAL_SEED_FILE": str(SEED_OUT)}
    subprocess.run(
        [sys.executable, str(ROOT / "infra" / "l1" / "local_env.py")],
        check=True,
        env={**env, "PATH": f"{Path.home() / '.foundry' / 'bin'}:{os.environ['PATH']}"},
        stdout=subprocess.DEVNULL,
    )
    os.environ["GUARDIAN_SEED_FILE"] = str(SEED_OUT)  # load_seed() in the test helper reads it

    from tests.chain_l1.anvil_env import Anvil, deploy_may_labs  # noqa: E402

    proc = subprocess.Popen(
        [foundry("anvil"), "--port", str(PORT), "--host", "127.0.0.1", "--chain-id", str(CHAIN_ID),
         "--accounts", "12", "--mnemonic", MNEMONIC, "--silent"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )  # fmt: skip
    PIDFILE.write_text(str(proc.pid))
    from web3 import Web3

    anvil = Anvil.__new__(Anvil)  # the class would start its own anvil on a random port
    anvil.port, anvil.proc, anvil.url = PORT, proc, f"http://127.0.0.1:{PORT}"
    anvil.w3 = Web3(Web3.HTTPProvider(anvil.url))
    for _ in range(100):
        if anvil.w3.is_connected():
            break
        time.sleep(0.1)
    else:
        down()
        sys.exit("anvil did not start")

    env_ = deploy_may_labs(anvil, timelock_s=0)
    members = [m["address"] for m in env_.seed["council"]]
    trang = members[0]
    filler = (env_.vault.address, env_.vault.encode_abi("setTopUpOperator", [members[0]]))
    for i in range(11):  # filler proposals (proposed and cancelled): the next proposal is #12
        env_.send(
            env_.council.functions.propose(f"filler {i + 1}", b"\0" * 32, [filler], b"\0" * 32), trang
        )
        env_.send(env_.council.functions.cancel(i + 1), trang)
    assert env_.council.functions.proposalCount().call() == 11

    d = env_.dep
    DEP_FILE.write_text(
        json.dumps(
            {
                "chainId": CHAIN_ID,
                "deployBlock": 0,
                "contracts": {
                    "registry": d.registry, "vault": d.vault, "council": d.council,
                    "mockDex": d.mock_dex, "evilDex": d.evil_dex, **d.tokens,
                },
                "precompiles": {"txAllowList": d.tx_allowlist},
                "members": dict(zip(("trang", "lan", "huy"), members, strict=False)),
                "policyBaseline": 1,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )  # fmt: skip

    native = ENV_NATIVE.read_text(encoding="utf-8").splitlines()
    native = [ln for ln in native if not ln.startswith(("L1_RPC_URL=", "L1_WS_URL=", "DEPLOYMENTS_FILE="))]
    native += [f"L1_RPC_URL=http://127.0.0.1:{PORT}", f"L1_WS_URL=ws://127.0.0.1:{PORT}",
               "DEPLOYMENTS_FILE=deployments/anvil-l1.json"]  # fmt: skip
    ENV_NATIVE.write_text("\n".join(native) + "\n", encoding="utf-8")
    docker = [ln for ln in native if not ln.startswith(("L1_RPC_URL=", "L1_WS_URL=", "GUARDIAN_SEED_FILE="))]
    docker += [f"L1_RPC_URL=http://{PROXY}/", f"L1_WS_URL=ws://{PROXY}/",
               "GUARDIAN_SEED_FILE=/app/seed.l1-fuji.json", "LLM_ENABLED=false"]  # fmt: skip
    ENV_DOCKER.write_text("\n".join(docker) + "\n", encoding="utf-8")
    for f in (ENV_NATIVE, ENV_DOCKER):
        f.chmod(0o600)
    print(f"anvil up on 127.0.0.1:{PORT} (pid {proc.pid}), chain {CHAIN_ID}, council {d.council}, counter 11")
    print(f"wrote {DEP_FILE.name}, {SEED_OUT.name}, {ENV_NATIVE.name}, {ENV_DOCKER.name}")
    return 0


def down() -> int:
    if PIDFILE.exists():
        try:
            os.kill(int(PIDFILE.read_text()), 15)
        except (ProcessLookupError, ValueError):
            pass
        PIDFILE.unlink()
        print("anvil stopped")
    return 0


def status() -> int:
    print("running" if PIDFILE.exists() else "stopped")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in ("up", "down", "status"):
        sys.exit(__doc__)
    raise SystemExit({"up": up, "down": down, "status": status}[cmd]())
