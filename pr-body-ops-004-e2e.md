Closes #34

## What
- `make e2e-l1` (`infra/l1/e2e-l1.sh`): reuses or bootstraps the local Guardian L1, starts the API, then runs **demo-reset -> scenes 1-5 -> demo-reset -> scenes 1-5**. Pass/fail table, tx hashes and per-step durations; exit 1 on any mismatch.
- `Backend/tests/e2e/scene_all.py`: one scene body (63 checks) over the HTTP API. `test_scene_all.py` runs it on the sim in the normal pytest run (`make e2e`); the L1 script runs the same file with `--real` and also reads `readAllowList` and the Council with `cast`.
- Gap (a): request #13 (move `key_agent_rebalance` to `huy`, subject `huy`) is now seeded by `/api/demo/reset` right after #12 on the L1 **and** on the sim, so Huy is conflicted. The merge of scene 3 is therefore proposal #14 (it was #13 on the sim). Tests adjusted (`test_city_state`, anvil reset test).
- Gap (b): `councilHistory.ts` takes a baseline offset (`health.policyVersion - policyLabel`), so "-> policy vN" shows the label; offset is 0 in mock mode.
- CI: manual workflow `.github/workflows/e2e-l1.yml` (`workflow_dispatch`); regular CI unchanged and fast.
- Docs: `docs/DEVELOPMENT.md` (how to run, expected output, cold-boot gas-capacity retry, `extraData` middleware).

## Real run (local Guardian L1, Subnet-EVM v0.8.0, `make e2e-l1`, clean bootstrap)
Pass 1 and pass 2: **65/65 checks passed** each; `E2E-L1: ALL PASSES OK`. Pass 1 table (excerpt, same in pass 2):
```
S2 simulate minh youThink/enforced/estimated        PASS ['20.000','20.000','100.000'] 5.0
S2 simulate minh+huy                                PASS ['60.000','60.000','140.000'] 7.0
S3 draft estimated before -> after                  PASS ('100.000','30.000')
S3 Lan + Trang: executed / label 2 / 5 keys / cap   PASS 'executed' / 2 / 5 / '30.000'
S4 agent 5.000; steps 1-5 spent after               PASS 5.000, 5.000, 15.000, 25.000, 25.000
S4 reasons 1,2,5                                    PASS RECIPIENT_NOT_ALLOWED, PROTOCOL_NOT_ALLOWED, DISTRICT_DAILY_CAP
S4 attacker moved 20.000 / principalSpent(minh)     PASS 20000000000 / '25.000'
S4 readAllowList on chain for the 5 keys            PASS ['0','0','0','0','0']
S4 step 7                                           PASS blocked_at_protocol, tx hash None
S5 #12 30.000 -> 130.000, 1.5% -> 6.5%              PASS
S5 #13 Huy 40.000 -> 60.000; approve by Huy         PASS HTTP 409 CONFLICT_OF_INTEREST; on-chain revert ConflictOfInterest()
```
Tx hashes (pass 2): merge 0xaffcf8e1..., step 0 0xa0c0af06..., step 1-5 present (reverted ones are mined), step 6 lock 0x763e6f23..., step 7 none.

Durations: chain bootstrap 155s, API start 4s, pass 1 demo-reset 112s + scenes 34s, pass 2 demo-reset 2574s + scenes 38s. The 2574s reset is an outlier (seed 399s, switch 2129s vs 16s/52s in pass 1); the machine was idle/asleep during that window, I did not find a code cause. The reset itself completed and verified.

Also run: Backend `pytest` 329 passed (incl. anvil), ruff check/format clean; Frontend typecheck, lint (0 errors), vitest 145 passed. Contracts untouched (no forge run needed). Network stopped with `make l1-local-down`, no avalanchego/uvicorn/anvil left.

## Acceptance (issue #34)
- [x] Real L1 from clean `demo-reset`, hashes for steps 0, 3, 4, 6, none for 7
- [x] Attacker 20.000, `principalSpent(minh)` 25.000
- [x] Twice in a row with demo-reset between
- [x] Same body passes on the sim in normal CI (`test_scene_all_on_sim`)
- [x] `make e2e` (sim) and `make e2e-l1`; manual workflow added
- [x] `simulate(minh)` AFTER v2 via `/api/simulate`: 30.000/30.000/30.000 at 1,5% (sim pytest, and real L1: one pass, 65/65, `E2E_PASSES=1`; the earlier two-pass run had 63 checks before this assertion was added)
- Note: the `e2e-l1.yml` workflow has not been run on GitHub Actions; `workflow_dispatch` only runs from main, so the lead will run it after merge.
- Note: the L1 half is a script, not a pytest skipped without `L1_RPC_URL`; the issue text suggests the latter.
