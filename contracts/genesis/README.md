# Guardian L1 genesis (L1-001)

Subnet-EVM genesis with the Tx AllowList and Contract Deployer AllowList precompiles, plus the scripts that create and verify the chain on the Avalanche CLI local network. Fuji deployment is prepared but not yet done (see "Fuji" below).

## Versions (recorded from the verified local run)

| Component | Version |
|---|---|
| Avalanche CLI | 1.9.7 |
| Subnet-EVM | v0.8.0 (`--vm-version v0.8.0`) |
| AvalancheGo (local network, pulled by the CLI) | v1.14.0 |
| Foundry `cast` (verification) | 1.9.0 |

## Files

| File | Purpose |
|---|---|
| `roster.local.json` | Addresses for the local network (deployer = public ewoq key, other keys derive from the public `test ... junk` mnemonic). Addresses only. |
| `roster.fuji.example.json` | Template for Fuji; copy to `roster.fuji.json` and fill in real testnet addresses (placeholders are rejected). |
| `build_genesis.py` | Roster to `genesis.json` (stdlib Python). |
| `genesis.json` | Generated from `roster.local.json`: `python3 contracts/genesis/build_genesis.py > contracts/genesis/genesis.json`. `l1-local.sh up` fails if it is stale. |
| `../../infra/l1/l1-local.sh` | `up` / `verify` / `down` on the local network. |
| `../../infra/l1/deploy-fuji.sh` | Fuji deploy (not run yet). |
| `../../infra/l1/health.sh`, `avalanchego.service` | Health check and an example systemd unit. |

Genesis content: chain id `424242`, token `GAI`, `txAllowListConfig` and `contractDeployerAllowListConfig` both with `adminAddresses = [deployer]` (the Tx list also has `enabledAddresses` = council members, agent/service keys, `key_minh`, `key_huy_1/2`, `key_lan`, backend demo signer), `minBaseFee` 1 gwei, 15M gas limit, 1000 GAI prefunded to the deployer and every enabled key. Chain id 424242 should be checked for collisions before Fuji.

## Local run

```bash
make l1-local-up      # clean network, boot, create + deploy the blockchain, save RPC URL in infra/l1/.env.l1-local
make l1-local-verify  # assertions listed below; exit 0 means all passed
make l1-local-down    # stop and delete the local network and the CLI blockchain config
```

Needs `avalanche` (`~/bin`) and `cast` (`~/.foundry/bin`) on `PATH` (the script adds both). Manual equivalent of `up`:

```bash
avalanche blockchain create guardianl1 --evm --genesis contracts/genesis/genesis.json \
  --evm-token GAI --vm-version v0.8.0 --sovereign=false --icm=false --force
avalanche network start --num-nodes 1   # then wait ~30 s
avalanche blockchain deploy guardianl1 --local --ewoq --num-nodes 1
```

Notes from running it:
- `--genesis` cannot be combined with `--evm-chain-id`, `--test-defaults` or `--production-defaults`; chain id and fees come from the genesis file.
- Deploying immediately after a cold boot of the local network fails with `tx exceeds current gas capacity: 5139 > 0` (P-Chain fee capacity is zero for a short time). `up` boots the network first, waits (`BOOT_WAIT`, default 30 s) and retries.
- Subnet-EVM only produces blocks when there are transactions, so `eth_blockNumber` grows with activity, not with time.

## Verified locally (output of `make l1-local-verify`)

- `eth_chainId` = 424242.
- `readAllowList`: Tx list deployer=2, key_minh=1, outsider=0; Deployer list deployer=2, key_minh=0.
- Tx from an allow-listed key (key_minh) succeeds (`status 0x1`), block number increases.
- Tx from a non-allow-listed key is rejected by the node: no hash, sender nonce unchanged.
- Contract deploy from an enabled non-deployer key is rejected; the deployer deploys fine.
- `setEnabled(outsider)` makes its next tx succeed; `setNone(key_minh)` makes its next tx rejected (`readAllowList` returns 0); `setEnabled` restores it.
- Node restart (`avalanche network stop` then `start`) kept chain state: block height and AllowList roles were unchanged.

### Exact rejection strings (Subnet-EVM v0.8.0)

| Case | Where | Message |
|---|---|---|
| Sender not on the Tx AllowList | `eth_sendRawTransaction` (JSON-RPC error, code `-32000`, no tx hash) | `cannot issue transaction from non-allow listed address: 0x<sender>` |
| Same, through `cast send` | stderr | `Error: server returned an error response: error code -32000: cannot issue transaction from non-allow listed address: 0x<sender>` |
| Non-deployer deploys a contract | `eth_estimateGas` (what `cast`, ethers and web3 call before signing) | `tx.origin 0x<sender> is not authorized to deploy a contract` |
| Non-admin calls `setEnabled` | `eth_estimateGas` | `cannot modify allow list: modify address: 0x<target>, from role: NoRole, to role: EnabledRole` |

`Backend/src/guardian/chain/errors.py` `classify_error` maps the first row to `BLOCKED_AT_PROTOCOL`; the fixtures are in `Backend/tests/test_chain_errors.py`. The deployer-list message is intentionally not a protocol block. Caveat: a deploy tx from a non-deployer that skips gas estimation is accepted by `eth_sendRawTransaction` (a hash is returned); it was not mined, but the local node was restarted before this was confirmed, so treat that path as unverified.

### Precompile interface (v0.8.0)

Addresses: Contract Deployer AllowList `0x0200000000000000000000000000000000000000`, Tx AllowList `0x0200000000000000000000000000000000000002`, as in `docs/spec/CONTRACTS.md`. Functions `setAdmin`, `setEnabled`, `setNone`, `readAllowList` behave as documented. `setManager(address)` exists in v0.8.0 (role value `3`, confirmed by calling it as admin and reading back `3`). Roles: 0 none, 1 enabled, 2 admin, 3 manager. The CLI warns that its printed allowlist table is the genesis one and does not follow later precompile changes; use `readAllowList`.

## Contracts, seed and handover (L1-002)

After `make l1-local-up`, `make l1-local-bootstrap` (or `make deploy-contracts` on an already running local network) deploys the contracts, seeds policy v1 through Council proposals, makes the Council admin of both precompiles, removes the deployer and runs `VerifySeed` and `VerifyHandover`. The roster addresses in this folder are the ones the scripts and the backend use for keys and Council members (`infra/l1/local_env.py` writes the matching seed and `Backend/.env.l1-local`). Details and the real outputs: `docs/modules/guardian-l1/README.md`. On Fuji the same scripts run with `NETWORK=fuji I_UNDERSTAND=fuji make deploy-contracts` after step 5 below and write `Backend/deployments/fuji-l1.json`; that run has not been done. Choose the Council timelock before that run: it is immutable, so `COUNCIL_TIMELOCK_S=60` (recommended for the demo) has to be set when `deploy` runs; the seed/handover steps then queue and `contracts.sh` executes the queue after the delay (see `docs/modules/guardian-l1/README.md`, section Timelock).

## Fuji (deployed 2026-11-14, #30)

The Guardian L1 runs on Fuji. IDs and addresses: `Backend/deployments/fuji-l1-chain.json` (no keys).

| | |
|---|---|
| Chain id | `845357` (token `GAI`) |
| Subnet ID | `2aymWHXCfwsdpKCk73rDqZNtUGdwXHrsLWfgGQEaszwgLwkdFk` |
| Blockchain ID | `4hnXBqtkcq2uj8e3rcfGKh3NDBn3CgrWPe4tk71WQFfP4rTTb` |
| Validator | `NodeID-5xybfwXRgXtYrHqK1pSmgkDSzv5DemohR`, on the demo Mac (`--use-local-machine`), P-Chain balance 0.1 AVAX |
| RPC / ws | `http://127.0.0.1:9650/ext/bc/<blockchain id>/rpc` and `/ws` (local to the validator host) |
| Versions | avalanchego v1.15.3, Subnet-EVM v1.15.3 (shipped inside the avalanchego release), Avalanche CLI 1.9.7 |

Run the Backend against the Fuji L1 (`CHAIN_MODE=l1`): `python3 infra/l1/fuji_env.py` (needs `eth_account`; use `Backend/.venv/bin/python`) checks every key against the roster, writes `infra/l1/seed.l1-fuji.json` and `Backend/.env.l1-fuji` (ignored, mode 600: chain settings, `GUARDIAN_SEED_FILE` and a copy of every `L1_KEY_*` from `Backend/.env.fuji`; values never printed). `RPC_URL` / `WS_URL` in the environment override the URLs from `fuji-l1-chain.json`. Then:

```
cd Backend && set -a && . ./.env.l1-fuji && set +a && uv run guardian-api
```

Without `GUARDIAN_SEED_FILE` the API stops with `bad signer configuration: L1_KEY_KEY_MINH derives ..., seed expects ...`. The C-Chain indexer reads logs in chunks of `CCHAIN_LOG_CHUNK` blocks (default 100, the official Fuji RPC limit) and halves the chunk by itself if the RPC says the range is too large. It reads at most `CCHAIN_MAX_BLOCKS_PER_CYCLE` blocks per cycle (default 2000) and saves the cursor after every chunk, so a backfill resumes where it stopped; on HTTP 429 it keeps its progress and waits 2s, 4s ... 60s (health warning `RPC_RATE_LIMITED`, not `INDEXER_ERROR`). The official endpoint (`api.avax-test.network`) caps `eth_getLogs` at 100 blocks and rate-limits a backfill, so `fuji_env.py` writes `CCHAIN_RPC_URL=https://avalanche-fuji-c-chain-rpc.publicnode.com` and `CCHAIN_LOG_CHUNK=2000` into `Backend/.env.l1-fuji` (publicnode answers a 2.600-block `eth_getLogs` in one call).

Verified on the Fuji L1 (real output):
- `eth_chainId` = 845357; deployer holds the 1000 GAI genesis alloc.
- `readAllowList` on the Tx AllowList: deployer=2, key_minh=1, a fresh address=0.
- key_minh self-transfer: `status 1`, block 0 -> 1 (Subnet-EVM mines on transactions only).
- A funded address that is not on the list: `cannot issue transaction from non-allow listed address: 0x7D5b…8Ab5`, no hash, no block. Same string as the local table above.

### Contracts on the Fuji L1 (#31, 2026-11-14)

`Backend/deployments/fuji-l1.json` (current set after `demo-reset`) and `Backend/deployments/fuji-c.json` (C-Chain treasury). Bootstrap: `NETWORK=fuji I_UNDERSTAND=fuji RPC_URL=<validator rpc> bash infra/l1/fuji-bootstrap.sh` (`--dry-run` first). Single scripts with the same environment: `I_UNDERSTAND=fuji RPC_URL=... infra/l1/fuji-run.sh bash infra/l1/contracts.sh <step>` (also `real-checks.sh t15|t8`, `demo-reset.sh`).

| Contract | Address |
|---|---|
| registry | `0xc7C7879c8493845bB5651FC079Ea318D8dF9eB29` |
| vault | `0x19415a753D1cE9FC3C9F385879F5Ca250Eb50efD` |
| council | `0x7A819Bb0ebf6045B38F9f428eCadb2E9546A31bf` |
| tUSDC | `0xC431fBB796EbdE11c69fE72A0BdC11dB72301119` |
| tTKB | `0xD33721aBFA03f2D3Fb211Dd8b50ECf796c22A58E` |
| tSCAM | `0x8d219C65dE2E068a3d4975668692bdcf8124904a` |
| mockDex | `0xAf45f25f63b352842C0604CF147c7C5249af390B` |
| evilDex | `0x4b2948b7d93438a36949BAf2fa6cECd06C199247` |

Council timelock **60 s** (`COUNCIL_TIMELOCK_S=60`, immutable). C-Chain (Fuji 43113): multisig 3/5 `0xD000D0cE700B455A360C27c87A230F5A2c197D4D`, tUSDC `0x65954209aa3cf99eb77A90e55cD1dD3e94b1Fc02`, escrow `0xF9f119A52B11FB6b92a7fB87e3B775C17d91ef3A`.

Verified on Fuji (real output):
- Bootstrap: deploy → seed (2 proposals queued, executed after the timelock) → C-Chain treasury (2.000.000 tUSDC) → simulated top-up 200.000 (C-Chain multisig execute `0x0ff7b4a7…ee22`, L1 `TopUpRecorded` with that hash) → handover → `VerifySeed` PASS, `VerifyHandover` PASS (deployer has no role and no power left).
- After handover: `readAllowList(deployer)` = 0 and `readAllowList(Council)` = 2 on both allow lists; a deploy from the deployer is rejected (`tx.origin … is not authorized to deploy a contract`); T15 PASS.
- `PolicyV2`: policyVersion baseline+1 (label v2), 5 keys in `minh`, `principalDailyCap(minh)` = 30.000.
- T8: `lan` calls `emergencyLock(minh)`; the 5 keys read role 0 and each next transaction is rejected with `cannot issue transaction from non-allow listed address`, no hash.
- `demo-reset` (with the timelock, 337 s): fresh set, Council `0x7A819Bb0ebf6045B38F9f428eCadb2E9546A31bf`, 11 proposals (next is #12), policy v1, `key_minh` role 1, vault 200.000 tUSDC.

Known limits:
- The first top-up run moved the C-Chain side, then web3.py failed on the L1 receipt (`ExtraDataLengthError`, fixed in #92); the L1 mint and `recordTopUp` of that run were sent by hand with `cast`.
- The top-up (L1 mint) works only before a handover, so after `demo-reset` the new vault has no `TopUpRecorded`. To show a top-up after a reset, the reset needs a top-up step between seed and switch (follow-up).

### How it was deployed (and why it is not the plain CLI path)

1. **CLI vs Fuji API.** The public Fuji API dropped `platform.getBalance`; CLI 1.9.7 (latest) still calls it. `infra/l1/fuji_proxy.py` (127.0.0.1:9655) sends P-Chain calls (`/ext/bc/P`, `/ext/P`) to `avalanche-fuji-p-chain-rpc.publicnode.com` and everything else to `api.avax-test.network`; the CLI uses it via `--endpoint`.
2. **Helicon.** Fuji activated Helicon (2026-07-28); avalanchego 1.14.x cannot follow it. Since 1.15 Subnet-EVM ships with avalanchego (rpcchainvm 47). `infra/l1/deploy-fuji-v1153.sh` downloads nothing itself: put the official v1.15.3 macOS zips from github.com/ava-labs/avalanchego/releases in `~/.avalanche-cli/bin/v1153/`; the script swaps the CLI's Subnet-EVM v0.8.0 plugin for v1.15.3 (backup kept) and passes `--avalanchego-path`.
3. **Bootstrap time.** The CLI's wait for the local node (partial sync of the Fuji P-Chain, ~16 min) timed out once; the node kept going. Re-running `deploy` and answering **No** to "overwrite the current local L1 deploy" reuses the bootstrapped node.
4. **Custom genesis has no Validator Manager predeploy.** With `--genesis`, CLI 1.9.7 does not add the VMC, and reusing the node left the conversion without a validator (`conversion must include at least one validator`). What worked: record the created subnet/chain IDs in `~/.avalanche-cli/subnets/guardianl1/sidecar.json` (Networks.Fuji), then
   ```bash
   avalanche blockchain convert guardianl1 --fuji --endpoint http://127.0.0.1:9655 --key fuji_deployer \
     --bootstrap-endpoints http://127.0.0.1:9650 --balance 0.1 --convert-only \
     --proof-of-authority --validator-manager-owner <deployer> \
     --validator-manager-blockchain-id <blockchain id> --validator-manager-address 0x0FEEDC0DE0000000000000000000000000000000 --verify-input=false
   avalanche node local track guardianl1-local-node-fuji guardianl1
   ```
   An earlier attempt created subnet `2t5Svsmu…kvgx` / chain `mnm8GHYF…AYhG`, which was never converted and is unused.

### Known limits
- **Validator manager not deployed.** The conversion names `0x0FEEDC0DE…0000` on the L1 as manager but no contract is there, so the validator set cannot be changed (adding or removing validators). One fixed validator is enough for the demo; `avalanche contract initValidatorManager guardianl1` after deploying the VMC is the follow-up.
- **RPC is local** to the validator host (the demo Mac, behind NAT). The backend runs on the same machine. A public RPC needs a host with a public IP (see `infra/l1/avalanchego.service`).
- **Keep the Mac awake** (`caffeinate -dimsu`): the L1 makes blocks only while this validator runs. Restart: `avalanche node local start guardianl1-local-node-fuji` (the kill-and-recover acceptance test is still to be run).
- **P-Chain fee balance runs out in about 2 days.** The validator pays a continuous fee from its P-Chain balance (0.1 AVAX at deploy). At the current minimum price (512 nAVAX/s, about 0.044 AVAX/day) that lasts about 2.2 days; after that the validator is deactivated and the L1 stops making blocks. Top it up before the demo with the Builder Console "Validator Balance" tool (console → L1 Validators → Validator Balance) for `NodeID-5xybfwXRgXtYrHqK1pSmgkDSzv5DemohR`.
- `avalanche blockchain describe guardianl1` prints the private keys of CLI-stored genesis keys; do not paste its output anywhere.
