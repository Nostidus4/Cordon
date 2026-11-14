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

## Fuji (remaining, needs a funded testnet key and a host)

Not done here: nothing was sent to Fuji and no key was generated.

1. Create a throwaway Fuji deployer key and fund it with Fuji AVAX from the faucet: `avalanche key create fuji_deployer`. Never commit it.
2. Copy `roster.fuji.example.json` to `roster.fuji.json`, fill in real addresses (deployer, council, agent/service, key_minh, key_huy_1/2, key_lan, backend demo signer). Addresses only. Pick a chain id that is not in use.
3. `FUJI_KEY=fuji_deployer ROSTER=contracts/genesis/roster.fuji.json I_UNDERSTAND=fuji make deploy-l1`. The script targets CLI 1.9.7 (validator-managed L1 with a Proof-of-Authority manager owned by the deployer, local-machine validator). The exact flags for a validator on a VPS (`--bootstrap-endpoints`, staking keys, P-Chain balance) were not exercised; check `avalanche blockchain deploy --help`.
4. Run the validator on a host with `Restart=always` (see `infra/l1/avalanchego.service`) and expose the RPC. Record chain id, RPC and ws URLs in `Backend/.env` (`L1_RPC_URL`, `L1_WS_URL`, `L1_CHAIN_ID`) and in `Backend/deployments/fuji-l1.json`.
5. Check with `make l1-status` (`L1_RPC_URL=... L1_CHAIN_ID=...`), then run the kill-and-recover test: `kill` the process, blocks must continue within 1 minute.
6. Prefund every enabled key if the genesis alloc was not enough; repeat the rejected-sender probe against the public RPC and confirm the message matches the table above.
