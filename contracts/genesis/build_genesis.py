#!/usr/bin/env python3
"""Build the Subnet-EVM genesis for the Guardian L1 from a roster of addresses.

Usage: build_genesis.py [roster.json] > genesis.json
The roster holds addresses only (never private keys). See README.md.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FUND_WEI = 1000 * 10**18  # 1000 native tokens per deployer / enabled key (test token, no value)


def build(roster: dict) -> dict:
    deployer = roster["deployer"]
    enabled = list(dict.fromkeys(roster["enabled"].values()))
    if deployer in enabled:
        raise SystemExit("deployer must not be listed under 'enabled' (it is the admin)")
    funded = [deployer, *enabled]
    if any(int(a, 16) < 0x1000 for a in funded):
        raise SystemExit("roster contains placeholder (near-zero) addresses; fill in real ones")
    return {
        "config": {
            "chainId": roster["chainId"],
            "homesteadBlock": 0,
            "eip150Block": 0,
            "eip155Block": 0,
            "eip158Block": 0,
            "byzantiumBlock": 0,
            "constantinopleBlock": 0,
            "petersburgBlock": 0,
            "istanbulBlock": 0,
            "muirGlacierBlock": 0,
            "berlinBlock": 0,
            "londonBlock": 0,
            "subnetEVMTimestamp": 0,
            "feeConfig": {
                "gasLimit": 15000000,
                "targetBlockRate": 2,
                "minBaseFee": 1000000000,
                "targetGas": 15000000,
                "baseFeeChangeDenominator": 36,
                "minBlockGasCost": 0,
                "maxBlockGasCost": 1000000,
                "blockGasCostStep": 200000,
            },
            "contractDeployerAllowListConfig": {
                "blockTimestamp": 0,
                "adminAddresses": [deployer],
            },
            "txAllowListConfig": {
                "blockTimestamp": 0,
                "adminAddresses": [deployer],
                "enabledAddresses": enabled,
            },
        },
        "alloc": {a.lower().removeprefix("0x"): {"balance": hex(FUND_WEI)} for a in funded},
        "nonce": "0x0",
        "timestamp": "0x0",
        "extraData": "0x00",
        "gasLimit": "0xe4e1c0",
        "difficulty": "0x0",
        "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "coinbase": "0x0000000000000000000000000000000000000000",
        "number": "0x0",
        "gasUsed": "0x0",
        "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    }


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "roster.local.json"
    json.dump(build(json.loads(path.read_text())), sys.stdout, indent=2)
    print()
