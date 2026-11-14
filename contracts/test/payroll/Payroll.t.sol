// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {HaircutVenue} from "./TestVenues.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {ILadderScheduler} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IPayrollExecutor} from "../../src/payroll/interfaces/IPayrollExecutor.sol";
import {IPayrollVault, Payee} from "../../src/payroll/interfaces/IPayrollVault.sol";

/// @notice Happy path of a whole cycle and every money path of `PayrollVault` (PAYROLL.md section 9, AC1).
contract PayrollTest is PayrollBase {
    // ------------------------------------------------------------ happy cycle

    function test_fullCycleHappyPath() public {
        _demoFund();
        venueA.setYieldBpsPerDay(100);
        venueB.setYieldBpsPerDay(50);
        token.mint(address(this), 4000 * USDC);
        token.approve(address(venueA), type(uint256).max);
        token.approve(address(venueB), type(uint256).max);
        venueA.fundYield(2000 * USDC);
        venueB.fundYield(2000 * USDC);

        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        assertEq(vault.deployedTotal(), 24_000e6);
        assertEq(vault.idle(), 6000e6);

        // one second before the first rung nothing is due; at the rung the excess over 60% is due, pro rata
        vm.warp(t0 + 15 * DAY - 1);
        assertEq(sched.dueAmount(address(venueA)), 0);
        _day(15);
        assertEq(sched.ceilingAmount(vm.getBlockTimestamp()), 18_000e6);
        assertEq(sched.dueAmount(address(venueA)), 3000e6);
        assertEq(sched.dueAmount(address(venueB)), 3000e6);
        _unwind(venueA, 3000e6);
        _unwind(venueB, 3000e6);
        assertEq(vault.deployed(address(venueA)), 9000e6);

        _day(22); // ceiling 30% = 9.000
        assertEq(sched.dueAmount(address(venueA)), 4500e6);
        _unwind(venueA, 4500e6);
        _unwind(venueB, 4500e6);

        _day(26); // ceiling 10% = 3.000, total out 9.000
        assertEq(sched.dueAmount(address(venueB)), 3000e6);
        _sweep(); // keepers alone bring it under the ceiling (each call re-computes the pro rata share)
        assertLe(vault.deployedTotal(), 3000e6 + 1e3); // converges geometrically (pro rata is re-computed per call)

        _day(29); // deadline: nothing can go out any more, even before anyone fires the kill switch
        vm.expectRevert(IFloatPolicy.DeadlinePassed.selector);
        _allocate(venueA, 1);
        vm.prank(KEEPER);
        (uint256 idleAfter, uint256 released) = sched.finalize();
        assertTrue(policy.killed());
        assertEq(policy.killReason(), 2);
        assertGe(idleAfter, P);
        assertEq(released, 0);
        assertEq(vault.deployedTotal(), 0);
        assertGt(vault.yieldRealized(), 0);
        assertTrue(sched.finalized());

        _day(30);
        (bool ok, uint256 idle, uint256 total) = exec.previewExecute();
        assertTrue(ok);
        assertEq(total, P);
        assertGe(idle, P);
        vm.prank(KEEPER);
        exec.execute();
        assertEq(_bal(ALICE), 12_000e6);
        assertEq(_bal(BOB), 10_000e6);
        assertEq(_bal(CAROL), 8000e6);
        assertTrue(vault.paid());
        assertTrue(exec.executed());
        assertEq(vault.reserve(), 12_000e6); // never needed
    }

    // ------------------------------------------------------------- deposits

    function test_depositAndFundReserveBookkeeping() public {
        token.mint(address(this), 100e6);
        token.approve(address(vault), 100e6);
        vault.deposit(60e6);
        vault.fundReserve(40e6);
        assertEq(vault.principal(), 60e6);
        assertEq(vault.reserve(), 40e6);
        assertEq(vault.idle(), 60e6); // reserve is not idle
        assertEq(_bal(address(vault)), 100e6);
    }

    function test_depositAfterPaidReverts() public {
        _fund(P, 0);
        _day(30);
        exec.execute();
        token.mint(address(this), 1);
        token.approve(address(vault), 1);
        vm.expectRevert(IPayrollVault.AlreadyPaid.selector);
        vault.deposit(1);
    }

    // ------------------------------------------------- deploy / recall paths

    function test_deployToVenueOnlyScheduler() public {
        _demoFund();
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.deployToVenue(address(venueA), 1);
    }

    function test_deployMovesTokenAndCostBasis() public {
        _demoFund();
        _allocate(venueA, 5000e6);
        assertEq(vault.deployed(address(venueA)), 5000e6);
        assertEq(vault.deployedTotal(), 5000e6);
        assertEq(venueA.assetsOf(address(vault)), 5000e6);
        assertEq(token.allowance(address(vault), address(venueA)), 0); // approval is reset
        assertEq(vault.idle(), 25_000e6);
    }

    function test_recallNormalSplitsPrincipalAndYield() public {
        _demoFund();
        venueA.setYieldBpsPerDay(100);
        token.mint(address(this), 1000e6);
        token.approve(address(venueA), 1000e6);
        venueA.fundYield(1000e6);
        _allocate(venueA, 10_000e6);
        _day(10); // 10 days * 1% of 10.000 = 1.000 interest
        assertEq(venueA.assetsOf(address(vault)), 11_000e6);
        uint256 got = _unwind(venueA, 9000e6);
        assertEq(got, 9000e6);
        assertEq(vault.deployed(address(venueA)), 1000e6);
        assertEq(vault.yieldRealized(), 0); // principal comes out first
        // 1.000 principal left + 1.190 interest accrued, but the venue only funded a 1.000 pool: pool bounds the yield
        _day(29);
        sched.finalize();
        assertEq(vault.yieldRealized(), 1000e6);
        assertEq(vault.deployedTotal(), 0);
    }

    function test_recallFrozenVenueDoesNotRevertAndMarksImpaired() public {
        _demoFund();
        _allocate(venueA, 6000e6);
        _allocate(venueB, 6000e6);
        venueB.setFrozen(true);
        vm.expectEmit(true, false, false, true);
        emit IPayrollVault.RecallFailed(address(venueB), 1000e6);
        uint256 got = _unwind(venueB, 1000e6);
        assertEq(got, 0);
        assertTrue(policy.venueImpaired(address(venueB)));
        assertEq(vault.deployed(address(venueB)), 6000e6);
        // a healthy venue is unaffected
        assertEq(_unwind(venueA, 6000e6), 6000e6);
    }

    function test_recallHaircutMarksImpairedAndKeepsCostBasis() public {
        HaircutVenue h = new HaircutVenue(address(token));
        _demoFund();
        _whitelist(address(h));
        _allocate2(address(h), 6000e6);
        vm.expectEmit(true, false, false, true);
        emit IPayrollVault.Haircut(address(h), 1000e6, 900e6);
        uint256 got = _unwind2(address(h), 1000e6);
        assertEq(got, 900e6);
        assertTrue(policy.venueImpaired(address(h)));
        // only what actually came back reduces the cost basis (balance-difference accounting)
        assertEq(vault.deployed(address(h)), 5100e6);
    }

    function test_releaseReserveOnlyScheduler() public {
        _demoFund();
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.releaseReserve(1);
        vm.prank(address(sched));
        vault.releaseReserve(2000e6);
        assertEq(vault.reserve(), 10_000e6);
        assertEq(vault.idle(), P + 2000e6);
        vm.prank(address(sched));
        vm.expectRevert(IPayrollVault.InsufficientIdle.selector);
        vault.releaseReserve(10_000e6 + 1);
    }

    // ----------------------------------------------------------------- payOut

    function test_payOutGuards() public {
        _fund(P, 0);
        vm.expectRevert(IPayrollVault.NotExecutor.selector);
        vault.payOut(ALICE, 12_000e6);
        vm.startPrank(address(exec));
        vm.expectRevert(IPayrollVault.NotPayee.selector);
        vault.payOut(STRANGER, 1);
        vm.expectRevert(IPayrollVault.RosterInvalid.selector);
        vault.payOut(ALICE, 11_000e6);
        vault.payOut(ALICE, 12_000e6);
        vm.expectRevert(IPayrollVault.AlreadyPaid.selector);
        vault.payOut(ALICE, 12_000e6);
        vm.stopPrank();
        assertEq(_bal(ALICE), 12_000e6);
        vm.expectRevert(IPayrollVault.NotExecutor.selector);
        vault.markPaid();
    }

    // ------------------------------------------------------ executor guards

    function test_executeGuards() public {
        _fund(P, 0);
        vm.expectRevert(IPayrollExecutor.PaydayNotReached.selector);
        exec.execute();
        _day(29);
        vm.expectRevert(IPayrollExecutor.PaydayNotReached.selector);
        exec.execute();
        _day(30);
        exec.execute();
        vm.expectRevert(IPayrollExecutor.AlreadyExecuted.selector);
        exec.execute();
    }

    function test_executeUnderfundedRevertsAtomically() public {
        _fund(P - 1, 0);
        _day(30);
        (bool ok, uint256 idle,) = exec.previewExecute();
        assertFalse(ok);
        assertEq(idle, P - 1);
        vm.expectRevert(abi.encodeWithSelector(IPayrollExecutor.InsufficientFunds.selector, P - 1, P));
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), 0);
        assertFalse(vault.paid());
        assertFalse(policy.killed()); // finalize rolled back with it
    }

    function test_executeRepairsMissedFinalize() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _day(30); // nobody called finalize at T-1
        exec.execute();
        assertEq(_bal(ALICE) + _bal(BOB) + _bal(CAROL), P);
        assertEq(vault.deployedTotal(), 0);
    }

    // ------------------------------------------- governance money paths

    function test_returnReserveAndSurplusGoOnlyToTreasury() public {
        _demoFund();
        _day(30);
        exec.execute();
        // surplus: anything idle after the payroll, never the reserve
        token.mint(address(vault), 500e6); // a donation lands as idle
        assertEq(vault.idle(), 500e6);

        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.withdrawSurplus(1);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.returnReserve(1);

        _pass(_one(address(vault), abi.encodeCall(IPayrollVault.withdrawSurplus, (500e6))));
        assertEq(_bal(TREASURY), 500e6);
        assertEq(vault.reserve(), 12_000e6);

        _pass(_one(address(vault), abi.encodeCall(IPayrollVault.returnReserve, (12_000e6))));
        assertEq(_bal(TREASURY), 12_500e6);
        assertEq(vault.reserve(), 0);
        assertEq(_bal(address(vault)), 0);
    }

    function test_withdrawSurplusRefusedBeforePaid() public {
        _demoFund();
        vm.prank(address(gov));
        vm.expectRevert(IPayrollVault.CycleNotSettled.selector);
        vault.withdrawSurplus(1);
    }

    function test_withdrawSurplusCannotTouchReserveOrUnpaidPayroll() public {
        _demoFund();
        _day(30);
        exec.execute();
        vm.prank(address(gov));
        vm.expectRevert(IPayrollVault.InsufficientIdle.selector);
        vault.withdrawSurplus(1); // idle is 0: reserve is not surplus
    }

    function test_returnReserveBreakingCoverageReverts() public {
        _demoFund();
        _allocate(venueA, 12_000e6); // exposure 12.000 == cover 12.000
        vm.prank(address(gov));
        vm.expectRevert(IFloatPolicy.CoverageInsufficient.selector);
        vault.returnReserve(1);
    }

    function test_startCycleNeedsPaidAndNoPositions() public {
        _demoFund();
        vm.startPrank(address(gov));
        vm.expectRevert(IPayrollVault.CycleNotSettled.selector);
        vault.startCycle(vm.getBlockTimestamp() + 60 * DAY);
        vm.stopPrank();
        _day(30);
        exec.execute();
        vm.startPrank(address(gov));
        vm.expectRevert(IPayrollVault.CycleNotSettled.selector);
        vault.startCycle(vm.getBlockTimestamp() + DAY); // deadline would already be behind us
        vault.startCycle(vm.getBlockTimestamp() + 30 * DAY);
        vm.stopPrank();
        assertEq(vault.cycleId(), 2);
        assertFalse(vault.paid());
        assertEq(vault.principal(), 0);
        assertFalse(sched.finalized());
        assertFalse(exec.executed());
    }

    function test_secondCyclePaysAgain() public {
        _demoFund();
        _day(30);
        exec.execute();
        uint256 newPayday = vm.getBlockTimestamp() + 30 * DAY;
        _pass(_one(address(vault), abi.encodeCall(IPayrollVault.startCycle, (newPayday))));
        _pass(_one(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ())));
        assertEq(vault.cycleId(), 2);
        assertFalse(policy.killed());
        _fund(P, 0);
        vm.warp(newPayday);
        exec.execute();
        assertEq(_bal(ALICE), 24_000e6);
    }

    // ------------------------------------------------------------- roster

    function test_rosterSetRemoveAndLocks() public {
        _fund(P, 0);
        vm.startPrank(address(gov));
        Payee[] memory big = new Payee[](11);
        for (uint256 i; i < 11; ++i) {
            big[i] = Payee(address(uint160(0x1000 + i)), 1);
        }
        vm.expectRevert(IPayrollVault.RosterTooLarge.selector);
        vault.setRoster(big);

        Payee[] memory dup = new Payee[](2);
        dup[0] = Payee(ALICE, 1);
        dup[1] = Payee(ALICE, 1);
        vm.expectRevert(IPayrollVault.RosterInvalid.selector);
        vault.setRoster(dup);
        dup[1] = Payee(BOB, 0);
        vm.expectRevert(IPayrollVault.RosterInvalid.selector);
        vault.setRoster(dup);
        dup[1] = Payee(address(0), 1);
        vm.expectRevert(IPayrollVault.RosterInvalid.selector);
        vault.setRoster(dup);

        Payee[] memory ten = new Payee[](10);
        for (uint256 i; i < 10; ++i) {
            ten[i] = Payee(address(uint160(0x2000 + i)), 3000e6);
        }
        vault.setRoster(ten);
        assertEq(vault.payeeCount(), 10);
        assertEq(vault.payrollTotal(), 30_000e6);
        assertFalse(vault.isPayee(ALICE));
        assertTrue(vault.isPayee(address(0x2000)));

        vault.removePayee(address(0x2000));
        assertEq(vault.payrollTotal(), 27_000e6);
        assertEq(vault.payeeCount(), 9);
        vm.expectRevert(IPayrollVault.NotPayee.selector);
        vault.removePayee(address(0x2000));
        vm.stopPrank();

        _day(29); // deadline: roster is frozen
        vm.startPrank(address(gov));
        vm.expectRevert(IPayrollVault.RosterLocked.selector);
        vault.setRoster(ten);
        vm.expectRevert(IPayrollVault.RosterLocked.selector);
        vault.removePayee(address(0x2001));
        vm.stopPrank();
    }

    function test_setRosterBreakingCoverageReverts() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        Payee[] memory r = _roster();
        r[0].amount += 1; // cover shrinks by 1 below the 12.000 exposure
        vm.prank(address(gov));
        vm.expectRevert(IFloatPolicy.CoverageInsufficient.selector);
        vault.setRoster(r);
    }

    function test_removePayeeKeepsMoneyInVault() public {
        _fund(P, 0);
        vm.prank(address(gov));
        vault.removePayee(ALICE);
        _day(30);
        exec.execute();
        assertEq(_bal(ALICE), 0);
        assertEq(_bal(address(vault)), 12_000e6); // Alice's share stays
        assertEq(_bal(BOB) + _bal(CAROL), 18_000e6);
    }

    // ----------------------------------------------------- access control

    function test_governanceFunctionsRefuseEveryoneButGovernor() public {
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.setRoster(new Payee[](0));
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.removePayee(ALICE);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.startCycle(1);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setVenue(address(venueA), true, 1);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.resetKill();
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setBufferBps(900);
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.setAgent(STRANGER, true);
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.killSwitch();
        vm.expectRevert(IFloatPolicy.NotAuthorized.selector);
        policy.markImpaired(address(venueA));
        vm.expectRevert(IFloatPolicy.NotAuthorized.selector);
        policy.kill(3);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev permissionless keepers pull the excess home until nothing is due
    function _sweep() internal {
        for (uint256 r; r < 12; ++r) {
            bool any;
            if (sched.dueAmount(address(venueA)) != 0) {
                vm.prank(KEEPER);
                sched.unwindDue(address(venueA));
                any = true;
            }
            if (sched.dueAmount(address(venueB)) != 0) {
                vm.prank(KEEPER);
                sched.unwindDue(address(venueB));
                any = true;
            }
            if (!any) return;
        }
    }

    function _allocate2(address venue, uint256 amount) internal {
        vm.prank(AGENT);
        sched.allocate(venue, amount);
    }

    function _unwind2(address venue, uint256 amount) internal returns (uint256) {
        vm.prank(AGENT);
        return sched.unwind(venue, amount);
    }
}
