// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {MockVenue} from "../../src/payroll/mocks/MockVenue.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {ILadderScheduler} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IPayrollExecutor} from "../../src/payroll/interfaces/IPayrollExecutor.sol";
import {IPayrollVault} from "../../src/payroll/interfaces/IPayrollVault.sol";

/// @notice AC1: on payday the vault holds at least the payroll total, including when a venue freezes (PAYROLL.md 3.1,
///         section 8 scenario). The guarantee is the coverage rule, not the ladder: see `test_whyCoverageIsTheRule`.
contract FrozenVenueTest is PayrollBase {
    // ------------------------------------------------- section 8 scenario

    function test_demoScenarioVenueBFreezesMidMonth() public {
        _demoFund(); // Pr = 30.000, R = 12.000
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);

        _day(15); // ceiling 60%: 6.000 over
        _unwind(venueA, 3000e6);
        _unwind(venueB, 3000e6);

        _day(20);
        venueB.setFrozen(true); // fault injected

        _day(22); // ceiling 30% = 9.000, 9.000 over on 18.000
        assertEq(sched.dueAmount(address(venueA)), 4500e6);
        vm.prank(KEEPER);
        assertEq(sched.unwindDue(address(venueA)), 4500e6);
        assertEq(sched.dueAmount(address(venueB)), 3000e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit IPayrollVault.RecallFailed(address(venueB), 3000e6);
        vm.expectEmit(true, false, false, true, address(policy));
        emit IFloatPolicy.VenueImpaired(address(venueB), 9000e6);
        vm.prank(KEEPER);
        assertEq(sched.unwindDue(address(venueB)), 0);
        assertEq(vault.deployed(address(venueB)), 9000e6);

        // the agent stops putting money into B
        vm.expectRevert(IFloatPolicy.VenueImpairedError.selector);
        _allocate(venueB, 1);

        _day(26);
        _unwind(venueA, vault.deployed(address(venueA)));
        assertEq(vault.deployed(address(venueA)), 0);
        assertEq(policy.exposureAtRisk(), 9000e6);
        assertLe(policy.exposureAtRisk(), policy.coverage()); // coverage_ok throughout

        _day(29); // T-1
        vm.prank(KEEPER);
        (uint256 idleAfter, uint256 released) = sched.finalize();
        assertTrue(policy.killed());
        assertEq(policy.killReason(), 2);
        assertEq(released, 9000e6);
        assertEq(idleAfter, P); // exactly the payroll
        assertEq(vault.deployed(address(venueB)), 9000e6); // still stuck

        _day(30);
        vm.prank(KEEPER);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
        assertTrue(vault.paid());
    }

    // ------------------------------------- freeze at several moments (k = 1)

    function _freezeAt(uint256 dayNo, bool bothPositions) internal {
        _demoFund();
        _allocate(venueA, 12_000e6);
        if (bothPositions) _allocate(venueB, 12_000e6);
        _day(dayNo);
        venueB.setFrozen(true);
        _day(29);
        sched.finalize();
        assertGe(vault.idle(), P, "idle < payroll after finalize");
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
    }

    function test_freezeBeforeFirstRung() public {
        _freezeAt(5, true);
        assertEq(vault.deployed(address(venueB)), 12_000e6); // entire position stuck, reserve covers it
    }

    function test_freezeBetweenRungs() public {
        _freezeAt(24, true);
    }

    function test_freezeRightAtTMinusOne() public {
        _freezeAt(29, true);
    }

    function test_freezeAfterTMinusOneChangesNothing() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        _day(29);
        sched.finalize(); // everything is home first
        venueB.setFrozen(true);
        assertEq(vault.deployedTotal(), 0);
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
    }

    function test_freezeWithOnlyHealthyPositionStillPays() public {
        _freezeAt(10, false);
    }

    function test_killSwitchByMemberBeforeTheDeadlineThenFreeze() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        venueB.setFrozen(true);
        vm.prank(M3);
        gov.killSwitch(); // reason 1; A comes home, B is marked impaired
        assertEq(policy.killReason(), 1);
        _day(29);
        sched.finalize();
        assertEq(policy.killReason(), 1); // first reason is kept
        assertGe(vault.idle(), P);
        _day(30);
        exec.execute();
        assertTrue(vault.paid());
    }

    // ---------------------------------------------------------------- k = 2

    function test_twoFrozenVenuesWithFaultToleranceTwo() public {
        _deploy(_roster(), DAY, 30 * DAY, 2);
        _fund(P, 24_000e6); // cover 24.000 = both 12.000 positions
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        assertEq(policy.exposureAtRisk(), 24_000e6);
        _day(3);
        venueA.setFrozen(true);
        venueB.setFrozen(true);
        _day(29);
        sched.finalize();
        assertEq(vault.idle(), P);
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
    }

    function test_faultToleranceOneRefusesWhatTwoFreezesWouldBreak() public {
        _demoFund(); // k = 1, cover 12.000
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6); // each alone is within cover
        // a third position that would make the pair exceed cover is not the point: the PAIR is allowed under k = 1.
        // A2 (at most k venues stuck) is the assumption; if it is violated the payroll is under-funded and refuses:
        venueA.setFrozen(true);
        venueB.setFrozen(true);
        _day(29);
        sched.finalize();
        assertEq(vault.idle(), 18_000e6);
        _day(30);
        vm.expectRevert(abi.encodeWithSelector(IPayrollExecutor.InsufficientFunds.selector, 18_000e6, P));
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), 0); // nobody is paid a partial amount
        assertFalse(vault.paid());
        // a venue thaws later and payday can still be executed (finalize is retried inside execute)
        venueA.setFrozen(false);
        exec.execute();
        assertTrue(vault.paid());
    }

    // -------------------------------------- why coverage, not the ladder

    function test_whyCoverageIsTheRule() public {
        // Pr = P with no reserve: the ladder alone could let 40% sit in a venue, which would break payday if it froze.
        _fund(P, 0);
        vm.expectRevert(IFloatPolicy.CoverageInsufficient.selector);
        _allocate(venueA, 12_000e6);
        vm.expectRevert(IFloatPolicy.CoverageInsufficient.selector);
        _allocate(venueA, 1);
        assertEq(vault.deployedTotal(), 0);
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
    }

    function test_surplusAbovePayrollMayBePlacedWithoutReserve() public {
        _fund(P + 5000e6, 0); // cover = 5.000
        _allocate(venueA, 5000e6);
        vm.expectRevert(IFloatPolicy.CoverageInsufficient.selector);
        _allocate(venueA, 1);
        venueA.setFrozen(true);
        _day(29);
        sched.finalize();
        assertGe(vault.idle(), P);
    }

    // ------------------------------------------------------------- fuzz

    /// @dev Any funding, any positions policy lets through, one venue freezing at any time, keepers sweeping or not:
    ///      after `finalize` the vault holds the payroll (needs A1: Pr >= P, and A2: one venue stuck, k = 1).
    function testFuzz_oneFrozenVenueNeverBreaksPayday(
        uint256 pr,
        uint256 r,
        uint256 a,
        uint256 b,
        uint8 freezeDay,
        bool freezeA,
        uint8 sweepMask
    ) public {
        pr = bound(pr, P, 3 * P);
        r = bound(r, 0, 2 * P);
        a = bound(a, 0, pr);
        b = bound(b, 0, pr);
        freezeDay = uint8(bound(freezeDay, 0, 29));
        _fund(pr, r);
        _tryAllocate(venueA, a);
        _tryAllocate(venueB, b);

        uint256[5] memory days_ = [uint256(0), 15, 22, 26, 28];
        bool frozen;
        for (uint256 i; i < days_.length; ++i) {
            _day(days_[i]);
            if (!frozen && days_[i] >= freezeDay) {
                (freezeA ? venueA : venueB).setFrozen(true);
                frozen = true;
            }
            if (sweepMask & (1 << i) != 0) _trySweep();
            assertLe(policy.exposureAtRisk(), policy.coverage(), "I-2 exposure above coverage");
        }
        _day(29);
        sched.finalize();
        assertGe(vault.idle(), P, "I-1 idle < payroll after finalize");
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
    }

    /// @dev Freeze can also happen at any second inside the last day.
    function testFuzz_freezeAtAnyTimeAndKeeperCadence(uint32 freezeOffset, uint256 a) public {
        _fund(P, 12_000e6);
        a = bound(a, 0, 12_000e6);
        _tryAllocate(venueA, a);
        _tryAllocate(venueB, 12_000e6);
        freezeOffset = uint32(bound(freezeOffset, 0, 29 * DAY));
        vm.warp(t0 + freezeOffset);
        venueB.setFrozen(true);
        vm.warp(t0 + 29 * DAY);
        sched.finalize();
        assertGe(vault.idle(), P);
    }

    function _tryAllocate(MockVenue v, uint256 amount) internal {
        if (amount == 0) return;
        vm.prank(AGENT);
        try sched.allocate(address(v), amount) {} catch {}
    }

    function _trySweep() internal {
        for (uint256 i; i < 3; ++i) {
            try sched.unwindDue(address(venueA)) {} catch {}
            try sched.unwindDue(address(venueB)) {} catch {}
        }
    }
}
