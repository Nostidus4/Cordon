# Test coverage matrix: T1-T15, I1, I2

Source of the cases: `docs/spec/README.md` section 8.3. Run everything with `make contracts-test` (or
`cd contracts && forge test`). Test names are Foundry function names; `PV` = `test/PolicyVault.t.sol`,
`GC` = `test/GuardianCouncil.t.sol`, `RE` = `test/Reentrancy.t.sol`, `HO` = `test/Handover.t.sol`,
`INV` = `test/Invariants.t.sol` (handler in `test/helpers/VaultHandler.sol`).

| Case | What it proves | Tests | Status |
|---|---|---|---|
| T1 | Per-key cap still holds under the shared district cap | PV `test_T1_keyCapBindsBeforeDistrictCap` | Covered |
| T2 | Several keys of one person share one district cap | PV `test_T2_districtCapExactBoundary`, `test_scene4_table`, `testFuzz_districtNeverExceedsCap` | Covered |
| T3 | Many small transfers in a row never pass the cap | PV `test_T3_sixtyTransfersOf500`, `testFuzz_districtNeverExceedsCap` | Covered |
| T4 | A new UTC day resets the counters | PV `test_T4_nextDayResetsCounters`, `test_T4_warpPlusOneDayFromNoon` | Covered |
| T5 | Recipient, token, protocol (target + selector) outside the allow-list revert with the right error | PV `test_T5_eachConditionAloneGivesItsOwnError`, `test_T5_T6_payCheckOrderAllSubsets`, `test_T5_T6_swapCheckOrderAllSubsets`, `test_swap_tokenInOrTokenOutNotAllowedIsTokenError`, `test_protocolAllowListIsPerSelector` | Covered |
| T6 | Check order returns the reason code of table 4.3 | PV `test_T5_T6_payCheckOrderAllSubsets`, `test_T5_T6_swapCheckOrderAllSubsets`, `test_lockedDistrictRevertsBeforeTokenAndCapChecks` | Covered |
| T7 | `lockPrincipal` blocks every key of the district | PV `test_T7_lockBlocksEveryKeyOfTheDistrictForPayAndSwap`, `test_T7_unlockRestoresAndEmitsEvent`; GC `test_T8_emergencyLockMinhSetsAllFiveKeysToNone` | Covered |
| T8 | `emergencyLock` calls `setNone` for every key (checked with `readAllowList`) | GC `test_T8_emergencyLockMinhSetsAllFiveKeysToNone`, `test_T8_emergencyLockAlsoCoversDeactivatedKeys` | Covered on the mock precompile (`vm.etch`). **Gap:** the real precompile is exercised only in the L1 E2E script (L1-002, issue #31) |
| T9 | Tighten with 1 member, loosen needs 2 of 3, outsiders can do nothing | GC `test_T9_*` (10 tests), `testFuzz_nonMemberNeverSucceeds`, `testFuzz_lowerKeyCapOnlyWhenStrictlyLower`, `testFuzz_twoDistinctApproversExecute`; PV `testFuzz_nonCouncilCannotLockOrPause` | Covered |
| T10 | A conflicted member cannot approve | GC `test_T10_huyCannotApproveProposalAboutHuy`, `test_T10_huyMayProposeAboutHuyButNotApprove`, `testFuzz_conflictOfInterest` | Covered |
| T11 | A proposal cannot call a target outside the allowed set | GC `test_T11_targetOutsideTheFourIsRejected`, `test_T11_oneBadCallPoisonsTheWholeProposal`, `test_T11_allFourTargetsAreAccepted`, `test_T11_unknownSelectorsAreRejected` | Covered |
| T12 | `pauseAll` blocks every key; `unpauseAll` needs 2 of 3 | PV `test_T12_pauseBlocksEveryRegisteredKeyAndWinsOverEveryOtherCheck`, `test_T12_unpauseRestoresAndEmitsEvent`; GC `test_T9_emergencyPause`, `test_T9_oneMemberCannotLoosen` (unpause by one member reverts, through a proposal it needs 2); INV `invariant_pausedVaultNeverSpends` | Covered |
| T13 | `minOut` not met reverts; the output token stays in the vault | PV `test_T13_minOutAboveDexOutputReverts`, `test_T13_vaultChecksAmountOutItself`, `testFuzz_swapSlippage`, `test_swap_leavesOutputInVaultEmitsSwappedAndCounts` | Covered |
| T14 | A malicious token or DEX cannot re-enter past the cap | RE `test_T14_maliciousTokenReentryFailsAndSpendStaysWithinCap`, `test_T14_maliciousDexReentryFailsAndSpendStaysWithinCap`, `test_T14_tokenSeesCountersAlreadyUpdatedInsideTransfer`, `test_T14_dexSeesCountersAlreadyUpdatedInsideSwap`, `test_T14_vaultStillWorksAfterAFailedReentry`; PV `test_T14_reentrantTokenCannotReenterPay`, `test_T14_reentrantDexCannotReenterSwap` | Covered (mutation check below) |
| T15 | After the handover the deployer holds no privilege | HO `test_T15_deployerHasNoRoleOnEitherPrecompileAfterHandover`, `test_T15_deployerCannotChangeAnyRoleAfterHandover`, `test_T15_deployerCannotMintOrReclaimMinterAfterHandover`, `test_T15_vaultAndRegistryAdminAreTheCouncilNotTheDeployer` (and `test_T15_deployerIsPrivilegedBeforeHandover` as the control) | Covered on the mock precompile. **Gap:** the check against the real Subnet-EVM precompile belongs to the handover script (`VerifyHandover`, L1-002, issue #31) |
| I1 | `principalSpent[id][day] <= principalDailyCap[id]` whenever the cap is > 0 | INV `invariant_I1_principalSpentNeverExceedsCap` | Covered (see the exception below) |
| I2 | While a district is locked, its `principalSpent` does not increase | INV `invariant_I2_lockedDistrictSpendNeverIncreases` | Covered |

## Invariant suite

`INV` drives the real `PrincipalRegistry`, `PolicyVault` and `GuardianCouncil` through `VaultHandler`, which picks from
a fixed cast: 5 keys (3 in district `minh`, 1 in `lan`, 1 in `huy`), the 3 Council members and 1 outsider, and
the actions `pay`, `swap`, `warp` (up to 60 h, so runs cross UTC days), `lock` / `pause` / `lowerCap` (one member),
`unlock` / `unpause` / `setCap` (proposal, 2 of 3). Reverts are legal outcomes and are caught; the handler keeps ghost
state instead.

- **I1 exception (documented, by design).** Lowering a cap below the spend already booked for a day is a tightening
  and is allowed, so `principalSpent` may then sit above the new cap. The handler marks every `(district, day)` whose
  booked spend exceeds a cap at the moment that cap is set as exempt. On top of that, every *successful* spend is
  checked against the cap in force at that moment with no exemption, so the exemption cannot hide a real breach.
- **I2 mechanics.** When a district is first seen locked, `principalSpent` is snapshotted for every known day; the
  invariant compares against the snapshot until it is unlocked. A successful spend by a key of a locked district is
  also flagged directly.
- **Lock coverage (guaranteed, not left to chance).** `lock` has no gate and extra weight, and a dedicated
  `lockAndSpend` action has a member lock a district and then a key of it try to spend straight away. Ghost
  counters (`nLocks`, `nLockedSpendAttempts`, `nUnlockTransitions`, `nLockAndSpend`) are asserted in
  `afterInvariant` (locked-spend attempts >= `lockAndSpend` calls, checked after every run) and in the fixed
  scenario `test_handlerReachesLockedSpendAttempts`. Counters summed over a measured run (temporary logging, not
  committed): default profile (256 runs) 971 locks, 5888 spend attempts against a locked district, 292 unlocks,
  1342 successful spends, 1787 `lockAndSpend`, 0 runs without a locked-spend attempt; `ci` profile (512 runs) 2681
  locks, 24868 attempts, 1350 unlocks, 3367 successful spends, 6760 `lockAndSpend`, 0 runs without an attempt.
- **Run size.** `foundry.toml` `[invariant]`: `runs = 256`, `depth = 64` (default profile, so plain `forge test`
  meets it, about 4 s). The `ci` profile (`FOUNDRY_PROFILE=ci`, used by the CI job) runs `runs = 512`, `depth = 128`
  and 1024 fuzz runs (about 22 s for the whole suite).

## Mutation checks done by hand (not automated)

Each mutation was applied to `src/PolicyVault.sol`, the suite run, then the file restored.

| Mutation | Result |
|---|---|
| Counters written after the external call (`pay` and `swap`), guard kept | `test_T14_tokenSeesCountersAlreadyUpdatedInsideTransfer` and `test_T14_dexSeesCountersAlreadyUpdatedInsideSwap` fail (`0 != 4000000000`, `0 != 3000000000`). The two re-entry tests still pass because `nonReentrant` alone stops the attack (defence in depth); that is why the "counters already updated" tests exist |
| Counters written after the call and `nonReentrant` removed from `pay` and `swap` | 4 of 5 `RE` tests fail, including "re-entering pay must fail" |
| District cap check removed from `_charge` | `invariant_I1_principalSpentNeverExceedsCap` fails |
| Locked-district check removed from `_requireActiveKey` | `invariant_I2_lockedDistrictSpendNeverIncreases` fails on run 1, call 1 (also `test_handlerReachesLockedSpendAttempts`); re-checked after the lock-coverage change |

## Line coverage

`forge coverage --report summary` (default profile): `PolicyVault` and `GuardianCouncil` are above 90 %; the exact
numbers of the last run are in the CTR-007 pull request.

## Not covered here

- Real Subnet-EVM AllowList precompile behaviour (T8, T15): L1-002 (#31).
- Formal verification and any run on a real L1: out of scope for CTR-007.
