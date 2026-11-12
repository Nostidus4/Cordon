// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {Call} from "../../src/interfaces/IGuardianCouncil.sol";
import {IMockDEX} from "../../src/interfaces/IMockDEX.sol";
import {IPolicyVault} from "../../src/interfaces/IPolicyVault.sol";
import {GuardianCouncil} from "../../src/GuardianCouncil.sol";
import {MockDEX} from "../../src/dex/MockDEX.sol";
import {PolicyVault} from "../../src/PolicyVault.sol";
import {TestTokenB} from "../../src/tokens/TestTokenB.sol";
import {TestUSDC} from "../../src/tokens/TestUSDC.sol";

/// @title VaultHandler
/// @notice Bounded actor for the invariant suite. Fixed cast: 5 keys (3 in district A, 1 in B, 1 in C), 3 Council
///         members and 1 outsider (index 5 / 3 resp., which must never succeed). Every action is wrapped in
///         `try/catch`, so a revert is a legal outcome and never fails the run; the ghost state below records what
///         really happened.
/// @dev Ghost state:
///      - I1 exemption: lowering a cap below the spend already booked for a day is allowed by design (tightening),
///        so every (district, day) whose booked spend exceeds a cap at the moment that cap is set is `exempt`.
///        Independently, every *successful* spend is checked against the cap in force at that moment, no exemption.
///      - I2: when a district is first seen locked, its `principalSpent` on every known day is snapshotted; while it
///        stays locked every later `sync` compares against the snapshot. A successful spend by a key of a locked
///        district is flagged directly too.
contract VaultHandler is Test {
    PolicyVault public immutable vault;
    GuardianCouncil public immutable gc;
    TestUSDC public immutable usdc;
    TestTokenB public immutable tkb;
    MockDEX public immutable dex;

    address[5] public keys;
    bytes32[5] public keyPrincipal;
    bytes32[3] public pids;
    address[3] public members;
    address public immutable outsider = makeAddr("outsider");
    address[2] public recipients;

    bytes4 internal constant SWAP_SEL = IMockDEX.swapExactIn.selector;
    bytes32 internal constant RISK = keccak256("invariant-run");

    // ---- ghost state
    uint256[] public days_;
    mapping(uint256 day => bool) internal knownDay;
    mapping(bytes32 pid => uint256) internal lastCap;
    mapping(bytes32 pid => mapping(uint256 day => bool)) public exempt;
    mapping(bytes32 pid => bool) internal wasLocked;
    mapping(bytes32 pid => mapping(uint256 day => uint256)) internal lockSnap;
    mapping(bytes32 pid => mapping(uint256 day => bool)) internal lockSnapSet;

    bool public i1SpendOverCap; // a successful spend left principalSpent above a cap > 0
    bool public i2LockedSpend; // a successful spend by a key of a locked district
    bool public pausedSpend; // a successful spend while the vault was paused

    // ---- action statistics (for the reviewer: proves the run reaches the interesting states)
    uint256 public nPay;
    uint256 public nSwap;
    uint256 public nPayCapReverts;
    uint256 public nPayLockedReverts;
    uint256 public nLocks;
    uint256 public nUnlocks;
    uint256 public nLowerCaps;
    uint256 public nRaiseCaps;
    uint256 public nWarps;
    uint256 public nExemptions;

    constructor(
        PolicyVault vault_,
        GuardianCouncil gc_,
        TestUSDC usdc_,
        TestTokenB tkb_,
        MockDEX dex_,
        address[5] memory keys_,
        bytes32[5] memory keyPrincipal_,
        bytes32[3] memory pids_,
        address[3] memory members_,
        address[2] memory recipients_
    ) {
        vault = vault_;
        gc = gc_;
        usdc = usdc_;
        tkb = tkb_;
        dex = dex_;
        keys = keys_;
        keyPrincipal = keyPrincipal_;
        pids = pids_;
        members = members_;
        recipients = recipients_;
        _addDay();
        _sync();
    }

    function daysCount() external view returns (uint256) {
        return days_.length;
    }

    // ------------------------------------------------------------ spend actions

    function pay(uint256 keySeed, uint256 tokenSeed, uint256 recipSeed, uint256 amountSeed) external {
        (address key, bytes32 pid) = _key(keySeed);
        bool tkbToken = tokenSeed % 2 == 1;
        uint256 value = bound(amountSeed, 1, 14_000e6);
        uint256 amount = tkbToken ? value * 1e12 : value;
        address token = tkbToken ? address(tkb) : address(usdc);
        address to = recipients[recipSeed % 2];

        bool lockedBefore = vault.principalLocked(pid);
        bool pausedBefore = vault.paused();
        vm.prank(key);
        try vault.pay(token, to, amount, bytes32(0)) {
            ++nPay;
            _afterSpend(pid, lockedBefore, pausedBefore);
        } catch (bytes memory ret) {
            _countRevert(ret);
        }
        _sync();
    }

    function swap(uint256 keySeed, uint256 dirSeed, uint256 amountSeed) external {
        (address key, bytes32 pid) = _key(keySeed);
        bool toTkb = dirSeed % 2 == 0;
        uint256 value = bound(amountSeed, 1, 14_000e6);
        (address tIn, address tOut, uint256 amountIn) =
            toTkb ? (address(usdc), address(tkb), value) : (address(tkb), address(usdc), value * 1e12);

        bool lockedBefore = vault.principalLocked(pid);
        bool pausedBefore = vault.paused();
        vm.prank(key);
        try vault.swap(address(dex), SWAP_SEL, tIn, tOut, amountIn, 0, bytes32(0)) {
            ++nSwap;
            _afterSpend(pid, lockedBefore, pausedBefore);
        } catch (bytes memory ret) {
            _countRevert(ret);
        }
        _sync();
    }

    // ------------------------------------------------------------ time

    /// @dev Forward in time by up to ~2.5 days, so the run crosses UTC day boundaries.
    function warp(uint256 secondsSeed) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsSeed, 1, 60 hours));
        ++nWarps;
        _addDay();
        _sync();
    }

    // ------------------------------------------------------------ council: tighten (one member)

    function lock(uint256 memberSeed, uint256 pidSeed) external {
        if (pidSeed % 4 != 0) return; // locks are rarer than spends
        address who = _memberOrOutsider(memberSeed);
        vm.prank(who);
        try gc.emergencyLock(pids[pidSeed % 3]) {
            ++nLocks;
        } catch {}
        _sync();
    }

    function pause(uint256 memberSeed) external {
        // rare: a paused vault blocks every spend, which would starve the run of interesting states
        if (memberSeed % 8 != 0) return;
        vm.prank(_memberOrOutsider(memberSeed));
        try gc.emergencyPause() {} catch {}
        _sync();
    }

    function lowerCap(uint256 memberSeed, uint256 kindSeed, uint256 subjectSeed, uint256 capSeed) external {
        address who = _memberOrOutsider(memberSeed);
        (uint8 kind, bytes32 subject) = _capSubject(kindSeed, subjectSeed);
        uint256 cap = bound(capSeed, 0, 40_000e6);
        vm.prank(who);
        try gc.lowerCap(kind, subject, cap) {
            ++nLowerCaps;
        } catch {}
        _sync();
    }

    // ------------------------------------------------------------ council: loosen (2 of 3)

    function unlock(uint256 aSeed, uint256 bSeed, uint256 pidSeed) external {
        bytes32 pid = pids[pidSeed % 3];
        Call[] memory calls = new Call[](1);
        calls[0] = Call(address(vault), abi.encodeCall(IPolicyVault.unlockPrincipal, (pid)));
        if (_loosen(aSeed, bSeed, pid, calls)) ++nUnlocks;
        _sync();
    }

    function unpause(uint256 aSeed, uint256 bSeed) external {
        Call[] memory calls = new Call[](1);
        calls[0] = Call(address(vault), abi.encodeCall(IPolicyVault.unpauseAll, ()));
        _loosen(aSeed, bSeed, bytes32(0), calls);
        _sync();
    }

    /// @dev Set a cap through a 2/3 proposal. May lower it (which is why this and `lowerCap` both exist as paths).
    function setCap(uint256 aSeed, uint256 bSeed, uint256 kindSeed, uint256 subjectSeed, uint256 capSeed) external {
        (uint8 kind, bytes32 subject) = _capSubject(kindSeed, subjectSeed);
        uint256 cap = bound(capSeed, 0, 40_000e6);
        Call[] memory calls = new Call[](1);
        bytes32 affected;
        if (kind == 1) {
            affected = subject;
            calls[0] = Call(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (subject, cap)));
        } else {
            address key = address(uint160(uint256(subject)));
            affected = _principalOf(key);
            calls[0] = Call(address(vault), abi.encodeCall(IPolicyVault.setKeyDailyCap, (key, cap)));
        }
        if (_loosen(aSeed, bSeed, affected, calls)) ++nRaiseCaps;
        _sync();
    }

    // ------------------------------------------------------------ internals: actions

    function _key(uint256 seed) internal view returns (address key, bytes32 pid) {
        uint256 i = seed % 6;
        if (i == 5) return (outsider, bytes32(0));
        return (keys[i], keyPrincipal[i]);
    }

    function _memberOrOutsider(uint256 seed) internal view returns (address) {
        uint256 i = seed % 4;
        return i == 3 ? outsider : members[i];
    }

    function _capSubject(uint256 kindSeed, uint256 subjectSeed) internal view returns (uint8 kind, bytes32 subject) {
        if (kindSeed % 2 == 0) return (1, pids[subjectSeed % 3]);
        return (0, bytes32(uint256(uint160(keys[subjectSeed % 5]))));
    }

    function _principalOf(address key) internal view returns (bytes32) {
        for (uint256 i; i < 5; ++i) {
            if (keys[i] == key) return keyPrincipal[i];
        }
        return bytes32(0);
    }

    /// @dev propose by member A, approve by A and B (A and B may be equal, a conflicting member or an outsider:
    ///      then the proposal stays open or reverts, both fine). Returns true when it got executed.
    function _loosen(uint256 aSeed, uint256 bSeed, bytes32 subject, Call[] memory calls) internal returns (bool) {
        // mostly two distinct members (so proposals can reach 2/3), sometimes the outsider as second approver
        address a = members[aSeed % 3];
        address b = bSeed % 8 == 7 ? outsider : members[((aSeed % 3) + 1 + (bSeed % 2)) % 3];
        vm.prank(a);
        uint256 id;
        try gc.propose("loosen", subject, calls, RISK) returns (uint256 id_) {
            id = id_;
        } catch {
            return false;
        }
        vm.prank(a);
        try gc.approve(id) {} catch {}
        vm.prank(b);
        try gc.approve(id) {} catch {}
        return gc.getProposal(id).executed;
    }

    // ------------------------------------------------------------ internals: ghost state

    function _afterSpend(bytes32 pid, bool lockedBefore, bool pausedBefore) internal {
        if (lockedBefore) i2LockedSpend = true;
        if (pausedBefore) pausedSpend = true;
        uint256 cap = vault.principalDailyCap(pid);
        if (cap > 0 && vault.principalSpent(pid, vm.getBlockTimestamp() / 1 days) > cap) i1SpendOverCap = true;
    }

    function _countRevert(bytes memory ret) internal {
        if (ret.length < 4) return;
        bytes4 sel;
        assembly ("memory-safe") {
            sel := mload(add(ret, 32))
        }
        if (sel == IPolicyVault.PrincipalDailyCapExceeded.selector) ++nPayCapReverts;
        if (sel == IPolicyVault.PrincipalIsLocked.selector) ++nPayLockedReverts;
    }

    function _addDay() internal {
        uint256 d = vm.getBlockTimestamp() / 1 days;
        if (knownDay[d]) return;
        knownDay[d] = true;
        days_.push(d);
    }

    /// @dev Refresh exemptions (cap changes) and the lock snapshots. Called after every action.
    function _sync() internal {
        uint256 n = days_.length;
        for (uint256 p; p < 3; ++p) {
            bytes32 pid = pids[p];

            uint256 cap = vault.principalDailyCap(pid);
            if (cap != lastCap[pid]) {
                lastCap[pid] = cap;
                if (cap > 0) {
                    for (uint256 i; i < n; ++i) {
                        if (!exempt[pid][days_[i]] && vault.principalSpent(pid, days_[i]) > cap) {
                            exempt[pid][days_[i]] = true;
                            ++nExemptions;
                        }
                    }
                }
            }

            bool locked = vault.principalLocked(pid);
            if (locked) {
                for (uint256 i; i < n; ++i) {
                    uint256 d = days_[i];
                    if (!lockSnapSet[pid][d]) {
                        lockSnapSet[pid][d] = true;
                        lockSnap[pid][d] = vault.principalSpent(pid, d);
                    }
                }
            } else if (wasLocked[pid]) {
                // unlocked: forget the snapshots, the next lock takes fresh ones
                for (uint256 i; i < n; ++i) {
                    lockSnapSet[pid][days_[i]] = false;
                }
            }
            wasLocked[pid] = locked;
        }
    }

    // ------------------------------------------------------------ views for the invariants

    /// @return true when, for `pid`, every day still satisfies `principalSpent <= principalDailyCap` (or has no cap
    ///         or is exempt because a cap was lowered under it).
    function i1Holds(bytes32 pid) external view returns (bool) {
        uint256 cap = vault.principalDailyCap(pid);
        if (cap == 0) return true;
        uint256 n = days_.length;
        for (uint256 i; i < n; ++i) {
            uint256 d = days_[i];
            if (!exempt[pid][d] && vault.principalSpent(pid, d) > cap) return false;
        }
        return true;
    }

    /// @return true when `pid` is unlocked, or its spend on every known day equals the snapshot taken at lock time.
    function i2Holds(bytes32 pid) external view returns (bool) {
        if (!vault.principalLocked(pid)) return true;
        uint256 n = days_.length;
        for (uint256 i; i < n; ++i) {
            uint256 d = days_[i];
            if (lockSnapSet[pid][d] && vault.principalSpent(pid, d) != lockSnap[pid][d]) return false;
        }
        return true;
    }
}
