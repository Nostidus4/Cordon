#!/usr/bin/env python3
"""Fuji signer check for the Guardian L1 (OPS-002 / L1-002). Reads real TESTNET keys, prints addresses only.

Inputs (never committed):
  contracts/genesis/roster.fuji.json   addresses (FUJI_ROSTER overrides)
  Backend/.env.fuji                    L1_KEY_COUNCIL_*, L1_KEY_KEY_*, L1_KEY_BACKEND_DEMO_SIGNER (FUJI_ENV_FILE overrides)
  ~/.avalanche-cli/key/fuji_deployer.pk  the deployer key, hex with or without 0x (FUJI_DEPLOYER_KEY_FILE overrides)

What it does:
  1. refuses unless every key derives exactly its roster address (and the deployer key the roster `deployer`);
  2. writes infra/l1/seed.l1-fuji.json (FUJI_SEED_OUT overrides): Backend/seed/may_labs.json with the roster addresses
     (git-ignored, addresses only);
  3. with --cchain-keys: when Backend/.env.fuji lacks CCHAIN_OWNER_KEY_1..5 / CCHAIN_DEPLOYER_KEY / L1_TOPUP_KEY, appends
     them (5 fresh owner keys; the deployer key twice) to that file, mode 600. Idempotent. Prints the 5 owner addresses.

Needs the Backend venv (eth_account): `Backend/.venv/bin/python infra/l1/fuji_env.py [--cchain-keys]`.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
from pathlib import Path

from eth_account import Account

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "Backend" / "seed" / "may_labs.json"
ROSTER = Path(os.environ.get("FUJI_ROSTER") or ROOT / "contracts" / "genesis" / "roster.fuji.json")
ENV_FILE = Path(os.environ.get("FUJI_ENV_FILE") or ROOT / "Backend" / ".env.fuji")
DEPLOYER_KEY_FILE = Path(
    os.environ.get("FUJI_DEPLOYER_KEY_FILE") or Path.home() / ".avalanche-cli" / "key" / "fuji_deployer.pk"
)
OUT_SEED = Path(os.environ.get("FUJI_SEED_OUT") or ROOT / "infra" / "l1" / "seed.l1-fuji.json")


def parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


def norm(key: str) -> str:
    key = key.strip()
    return key if key.startswith("0x") else "0x" + key


def addr_of(key: str) -> str:
    return Account.from_key(norm(key)).address


def main() -> int:
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    enabled = roster["enabled"]
    env = parse_env(ENV_FILE)
    seed_text = SEED.read_text(encoding="utf-8")
    seed = json.loads(seed_text)

    problems: list[str] = []
    dep_key = DEPLOYER_KEY_FILE.read_text(encoding="utf-8").strip()
    if addr_of(dep_key).lower() != roster["deployer"].lower():
        problems.append(f"deployer key derives {addr_of(dep_key)}, roster has {roster['deployer']}")
    for sid, want in enabled.items():
        var = f"L1_KEY_{sid.upper()}"
        if not env.get(var):
            problems.append(f"{var} missing in {ENV_FILE.name}")
        elif addr_of(env[var]).lower() != want.lower():
            problems.append(f"{var} derives {addr_of(env[var])}, roster has {want}")
    if problems:
        print("REFUSING, key/roster mismatch:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1

    mapping: dict[str, str] = {}
    for entry in (*seed["keys"], *seed["council"]):
        mapping[entry["address"].lower()] = enabled[entry["seed_id"]]
    pattern = re.compile("|".join(re.escape(a) for a in mapping), re.IGNORECASE)
    OUT_SEED.write_text(pattern.sub(lambda m: mapping[m.group(0).lower()], seed_text), encoding="utf-8")
    print(f"deployer {roster['deployer']} (key verified)")
    for sid, a in enabled.items():
        print(f"  {sid:22s} {a} (key verified)")
    print(f"wrote {OUT_SEED}")

    if "--cchain-keys" in sys.argv:
        add: list[str] = []
        owners = []
        for i in range(1, 6):
            var = f"CCHAIN_OWNER_KEY_{i}"
            if not env.get(var):
                env[var] = "0x" + secrets.token_hex(32)
                add.append(f"{var}={env[var]}")
            owners.append(addr_of(env[var]))
        for var in ("CCHAIN_DEPLOYER_KEY", "L1_TOPUP_KEY"):
            if not env.get(var):
                add.append(f"{var}={norm(dep_key)}")
        if add:
            with ENV_FILE.open("a", encoding="utf-8") as f:
                f.write("\n# C-Chain treasury (OPS-002), added by infra/l1/fuji_env.py --cchain-keys\n")
                f.write("\n".join(add) + "\n")
            ENV_FILE.chmod(0o600)
        print(f"{'appended ' + str(len(add)) + ' variables to' if add else 'already present in'} {ENV_FILE.name}")
        for i, a in enumerate(owners, 1):
            print(f"  C-Chain owner {i}: {a}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
