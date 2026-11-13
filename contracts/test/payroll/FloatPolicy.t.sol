// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {FloatPolicy} from "../../src/payroll/FloatPolicy.sol";
import {MockVenue} from "../../src/payroll/mocks/MockVenue.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";

/// @notice Every branch of `assertCanDeploy` (PAYROLL.md 2.3.1), in order, plus the hard floors and the setters.
contract FloatPolicyTest is PayrollBase {
    address internal constant NOWHERE = address(0x1234);

    function _check(address venue, uint256 amount) internal view returns (bytes4) {
        return policy.checkDeploy(venue, amount);
    }

    function _expectAllocateRevert(address venue, uint256 amount, bytes4 sel) internal {
        // checkDeploy and the real allocate must agree
        assertEq(_check(venue, amount), sel);
        vm.expectRevert(sel);
        vm.prank(AGENT);
        sched.allocate(venue, amount);
    }

    // ------------------------------------------------ the eight branches, in order

    function test_01_killSwitchActive() public {
        _demoFund();
        vm.prank(address(gov));
        policy.kill(1);
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.KillSwitchActive.selector);
    }

    function test_02_deadlinePassed() public {
        _demoFund();
        _day(29);
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.DeadlinePassed.selector);
        _day(28);
        assertEq(_check(address(venueA), 1), bytes4(0)); // one day before the deadline: ladder ceiling is 0 only at D
    }

    function test_03_venueNotAllowed() public {
        _demoFund();
        _expectAllocateRevert(NOWHERE, 1, IFloatPolicy.VenueNotAllowed.selector);
        _expectAllocateRevert(address(vault), 1, IFloatPolicy.VenueNotAllowed.selector);
        _expectAllocateRevert(STRANGER, 1, IFloatPolicy.VenueNotAllowed.selector);
    }

    function test_04_venueImpaired() public {
        _demoFund();
        vm.prank(address(sched));
        policy.markImpaired(address(venueA));
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.VenueImpairedError.selector);
        assertEq(_check(address(venueB), 1), bytes4(0));
    }

    function test_05_ladderCeilingExceeded() public {
        _demoFund();
        _day(23); // ceiling 30% = 9.000
        _allocate(venueA, 9000e6);
        _expectAllocateRevert(address(venueB), 1, IFloatPolicy.LadderCeilingExceeded.selector);
        // ceiling is checked before the venue cap: 13.000 into one venue reports the ceiling
        _day(0);
        assertEq(_check(address(venueB), 13_000e6), IFloatPolicy.VenueCapExceeded.selector);
        _day(23);
        assertEq(_check(address(venueB), 13_000e6), IFloatPolicy.LadderCeilingExceeded.selector);
    }

    function test_06_bufferBreached() public {
        _demoFund();
        _day(15); // ceiling 60% = 18.000
        vm.prank(M1);
        gov.raiseBuffer(5000); // 50% = 15.000 must stay idle
        _allocate(venueA, 12_000e6); // idle 18.000
        _expectAllocateRevert(address(venueB), 4000e6, IFloatPolicy.BufferBreached.selector);
        assertEq(_check(address(venueB), 3000e6), bytes4(0));
    }

    function test_07_venueCapExceeded() public {
        _demoFund();
        _allocate(venueA, 12_000e6); // exactly 40%
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.VenueCapExceeded.selector);
        assertEq(policy.venueCapAmount(address(venueA)), 12_000e6);
    }

    function test_08_coverageInsufficient() public {
        _fund(P, 0); // no reserve: nothing above the payroll to put at risk
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.CoverageInsufficient.selector);

        _fund(0, 6000e6); // cover 6.000 with k = 1
        _allocate(venueA, 6000e6);
        assertEq(_check(address(venueB), 6000e6), bytes4(0)); // second venue: top-1 is still 6.000
        _expectAllocateRevert(address(venueA), 1, IFloatPolicy.CoverageInsufficient.selector);
        assertEq(policy.exposureAtRisk(), 6000e6);
        assertEq(policy.coverage(), 6000e6);
    }

    function test_08_coverageWithTwoFaultTolerance() public {
        _fund(P, 6000e6);
        vm.prank(M1);
        gov.raiseFaultTolerance(2);
        _allocate(venueA, 3000e6);
        _allocate(venueB, 3000e6);
        assertEq(policy.exposureAtRisk(), 6000e6);
        _expectAllocateRevert(address(venueB), 1, IFloatPolicy.CoverageInsufficient.selector);
    }

    function test_checksRunInTheDocumentedOrder() public {
        _demoFund();
        // everything wrong at once: stranger venue, past deadline, killed -> kill wins
        _day(29);
        vm.prank(address(gov));
        policy.kill(1);
        assertEq(_check(NOWHERE, 1e18), IFloatPolicy.KillSwitchActive.selector);
        vm.prank(address(gov));
        policy.resetKill();
        assertEq(_check(NOWHERE, 1e18), IFloatPolicy.DeadlinePassed.selector);
        _day(0);
        assertEq(_check(NOWHERE, 1e18), IFloatPolicy.VenueNotAllowed.selector);
        vm.prank(address(sched));
        policy.markImpaired(address(venueA));
        // impaired beats ceiling / buffer / cap / coverage
        assertEq(_check(address(venueA), 1e18), IFloatPolicy.VenueImpairedError.selector);
        // ceiling beats buffer, cap, coverage: 29.000 > 28.500
        assertEq(_check(address(venueB), 29_000e6), IFloatPolicy.LadderCeilingExceeded.selector);
        // cap beats coverage: 13.000 into B (ceiling ok)
        assertEq(_check(address(venueB), 13_000e6), IFloatPolicy.VenueCapExceeded.selector);
    }

    // -------------------------------------------------------------- hard floors

    function test_hardFloorsAreConstants() public view {
        assertEq(policy.MAX_VENUE_BPS(), 4000);
        assertEq(policy.MIN_BUFFER_BPS(), 500);
        assertEq(policy.MIN_DEADLINE_LEAD(), DAY);
        assertEq(policy.MAX_VENUES(), 8);
    }

    function test_governorCannotBreakTheFloors() public {
        vm.startPrank(address(gov));
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setVenueCapBps(address(venueA), 4001);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setVenue(address(venueA), true, 4001);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setBufferBps(499);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setBufferBps(10_001);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setDeadlineLead(DAY - 1);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setFaultTolerance(0);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        policy.setFaultTolerance(9);
        vm.stopPrank();
    }

    function test_constructorEnforcesTheSameFloors() public {
        address[] memory vs = new address[](1);
        vs[0] = address(venueA);
        uint16[] memory caps = new uint16[](1);
        caps[0] = 4001;
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        new FloatPolicy(address(vault), address(gov), address(sched), DAY, 500, DAY, 1, vs, caps);
        caps[0] = 4000;
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        new FloatPolicy(address(vault), address(gov), address(sched), DAY, 499, DAY, 1, vs, caps);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        new FloatPolicy(address(vault), address(gov), address(sched), DAY, 500, DAY - 1, 1, vs, caps);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        new FloatPolicy(address(vault), address(gov), address(sched), DAY, 500, DAY, 0, vs, caps);
    }

    function test_maxVenues() public {
        vm.startPrank(address(gov));
        for (uint256 i; i < 6; ++i) {
            policy.setVenue(address(uint160(0x5000 + i)), true, 1000); // 2 + 6 = 8
        }
        vm.expectRevert(IFloatPolicy.TooManyVenues.selector);
        policy.setVenue(address(0x6000), true, 1000);
        // an already known venue can still be toggled
        policy.setVenue(address(venueA), false, 0);
        vm.stopPrank();
        assertEq(vault.venueList().length, 8);
        assertFalse(policy.venueAllowed(address(venueA)));
    }

    // ------------------------------------------------------------ setters / events

    function test_settersChangeStateAndEmit() public {
        vm.startPrank(address(gov));
        vm.expectEmit(true, false, false, true);
        emit IFloatPolicy.VenueCapChanged(address(venueA), 4000, 2500);
        policy.setVenueCapBps(address(venueA), 2500);
        vm.expectEmit(false, false, false, true);
        emit IFloatPolicy.BufferChanged(500, 800);
        policy.setBufferBps(800);
        vm.expectEmit(false, false, false, true);
        emit IFloatPolicy.DeadlineLeadChanged(DAY, 2 * DAY);
        policy.setDeadlineLead(2 * DAY);
        vm.expectEmit(false, false, false, true);
        emit IFloatPolicy.FaultToleranceChanged(1, 2);
        policy.setFaultTolerance(2);
        vm.stopPrank();
        assertEq(policy.venueCapAmount(address(venueA)), 0); // principal is 0 until funded
        assertEq(policy.deadline(), payday - 2 * DAY);
    }

    function test_killIsMonotonicAndOnlyResetByGovernor() public {
        vm.prank(address(sched));
        policy.kill(3);
        assertEq(policy.killReason(), 3);
        vm.prank(address(gov));
        policy.kill(1); // already killed: reason is kept, no loosening, no revert
        assertEq(policy.killReason(), 3);
        vm.prank(address(gov));
        policy.resetKill();
        assertFalse(policy.killed());
        vm.prank(address(sched));
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.resetKill();
    }

    function test_clearImpairedOnlyGovernor() public {
        vm.prank(address(sched));
        policy.markImpaired(address(venueA));
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.clearImpaired(address(venueA));
        vm.prank(address(gov));
        policy.clearImpaired(address(venueA));
        assertFalse(policy.venueImpaired(address(venueA)));
    }

    function test_effectiveCapIsMinOfSetCapAndFloor() public {
        _fund(P, 0);
        assertEq(policy.venueCapAmount(address(venueA)), 12_000e6);
        vm.prank(address(gov));
        policy.setVenueCapBps(address(venueA), 1000);
        assertEq(policy.venueCapAmount(address(venueA)), 3000e6);
    }

    function test_bufferAmountIsFivePercentOfPrincipal() public {
        _fund(P, 0);
        assertEq(policy.bufferAmount(), 1500e6);
    }
}
