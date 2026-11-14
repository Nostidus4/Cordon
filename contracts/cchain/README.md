# C-Chain treasury and the simulated top-up (OPS-002)

The company's main treasury (2.000.000 tUSDC) sits on Avalanche C-Chain (Fuji) in a **3-of-5 multisig**. Money reaches the Guardian L1 vault, where the chain rules control spending, through a **top-up**.

> **The top-up is SIMULATED.** There is no bridge (no ICTT/ICM). A top-up moves tUSDC on C-Chain from the treasury to a keyless escrow address, then **mints** the same amount of tUSDC on the L1 to the vault and records it with `recordTopUp(cChainTxHash, amount)`. Nothing is locked or released across chains, and every artefact is labelled "simulated top-up".

## Multisig: fallback used, not Safe

The issue asks for a Safe 3/5 on Fuji, or a simple multisig if that takes longer than 2 hours. **The fallback is used**: `src/cchain/SimpleMultisig.sol` (3-of-5, owners and threshold fixed at deployment). Safe was not attempted: it needs the official Fuji deployments and the Safe transaction service/UI, which cannot be scripted or tested offline here. The fallback is testable on anvil and has the same shape for the demo (several keys must agree).

How it works: an owner `submit`s a call (own confirmation counts), other owners `confirm`, any owner `execute`s once 3 distinct owners confirmed. Replay protection: transaction ids are unique and a transaction runs at most once; an owner cannot confirm twice. Not audited, test funds only.

| File | Purpose |
|---|---|
| `src/cchain/SimpleMultisig.sol` | the treasury multisig |
| `src/cchain/CChainUSDC.sol` | C-Chain test tUSDC, **6 decimals** (same as the L1 `TestUSDC`); the minter role passes to the multisig after the 2.000.000 mint |
| `script/DeployCChain.s.sol` | deploys both, mints, writes the deployment file |
| `test/CChain.t.sol` | Foundry tests (threshold, owner checks, replay, token) |
| `../infra/cchain/cchain.sh` | `deploy` / `topup` wrapper (Fuji guard) |
| `../Backend/scripts/cchain_topup.py` | the top-up (web3) |
| `../Backend/tests/test_cchain_topup.py` | end to end on two anvils |

The escrow is the fixed, keyless address `address(uint160(uint256(keccak256("guardian.simulated-bridge-escrow"))))`: tokens sent there cannot be moved by anyone.

## Deployment file

`Backend/deployments/fuji-c.json` (and `local-c.json`, git-ignored, for anvil). Addresses only, no keys:

```json
{"network": "fuji", "chainId": 43113, "rpcUrl": "...", "wsUrl": "wss://..." , "token": "0x..", "treasury": "0x.. (multisig)",
 "escrow": "0x..", "owners": ["0x.. x5"], "threshold": 3, "deployBlock": 0}
```

`wsUrl` is `null` when none was given. The committed `fuji-c.json` is still `{}` until the Fuji run.

## L1 side: which authority is used

Contracts are frozen, so the top-up uses what they allow:

- `recordTopUp` is callable by the vault's `topUpOperator` (the deployer **until** the handover) or the Council contract.
- `tUSDC.mint` is callable by the token minter only: the deployer before handover, then the Council. The Council's proposals can only target registry, vault and the two precompiles (`TargetNotAllowed` otherwise), so after handover **nobody can mint** and a Council proposal cannot do it.

So the L1 half is the **deployer path, before handover**: run `make topup` with the L1 deployer key (`L1_TOPUP_KEY`) before `Handover.s.sol`. The script checks both permissions first and aborts before moving anything on C-Chain if they are missing ("not the L1 tUSDC minter ... run the top-up before handover"). Funding the vault after handover would need a contract change (decision for the product owner).

## Local run (anvil only)

```bash
anvil --port 8546 --chain-id 43113 &            # the C-Chain stand-in
make deploy-cchain                              # -> Backend/deployments/local-c.json, treasury = 2.000.000 tUSDC
# a local L1 BEFORE handover (make l1-local-up && make l1-deploy && make l1-seed), then:
make topup AMOUNT=200000                        # AMOUNT in whole tUSDC
```

Local keys are anvil's public dev keys. The automated version (two anvils, forge-deployed C-Chain, real `PolicyVault`/`TestUSDC` on the second) is `cd Backend && uv run pytest tests/test_cchain_topup.py`.

## Fuji (not executed yet)

Both targets refuse to touch Fuji unless `NETWORK=fuji I_UNDERSTAND=fuji` is set. Keys come from the environment (`Backend/.env.fuji`, never git): `CCHAIN_DEPLOYER_KEY`, `CCHAIN_OWNER_KEY_1..5`, and for the top-up `L1_RPC_URL`, `L1_TOPUP_KEY`.

```bash
set -a; . Backend/.env.fuji; set +a
NETWORK=fuji I_UNDERSTAND=fuji make deploy-cchain
NETWORK=fuji I_UNDERSTAND=fuji make topup AMOUNT=200000   # needs Backend/deployments/fuji-l1.json and an L1 not yet handed over
```

Estimated cost on C-Chain at 25 gwei: deploy about 2.3M gas = 0.06 AVAX; one top-up about 0.43M gas = 0.011 AVAX (owner 1 about 0.008, owners 2 and 3 about 0.0015 each). Fund owners 1 to 3 with a little AVAX first.
