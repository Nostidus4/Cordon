// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {LadderScheduler} from "../../src/payroll/LadderScheduler.sol";
import {ILadderScheduler, Rung} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {IPayrollVault} from "../../src/payroll/interfaces/IPayrollVault.sol";

/// @notice LadderScheduler: ladder validity, ceilings over time, `due` rounding and probe rule, agent / keeper doors.
contract LadderTest is PayrollBase {
    function _sched(Rung[] memory r) internal returns (LadderScheduler) {
        return new LadderScheduler(address(vault), address(policy), address(gov), r, new address[](0));
    }

    // ------------------------------------------------------------ validity

    function test_invalidLadders() public {
        Rung[] memory r = new Rung[](0);
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r); // empty

        r = new Rung[](2);
        r[0] = Rung(7 * DAY, 3000);
        r[1] = Rung(0, 100); // last rung must be (0, 0)
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);

        r[1] = Rung(DAY, 0); // last rung must be at the deadline
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);

        r = new Rung[](3);
        r[0] = Rung(3 * DAY, 1000);
        r[1] = Rung(7 * DAY, 500); // times must strictly decrease
        r[2] = Rung(0, 0);
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);

        r[0] = Rung(7 * DAY, 1000);
        r[1] = Rung(3 * DAY, 2000); // ceilings must not increase
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);

        r[1] = Rung(7 * DAY, 500); // equal times
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);

        r = new Rung[](9);
        for (uint256 i; i < 8; ++i) {
            r[i] = Rung((9 - i) * DAY, uint16(8000 - i * 100));
        }
        r[8] = Rung(0, 0);
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r); // more than 8

        r = new Rung[](2);
        r[0] = Rung(DAY, 10_001); // above 100%
        r[1] = Rung(0, 0);
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        _sched(r);
    }

    function test_setRungsValidatesAndIsGovernorOnly() public {
        Rung[] memory r = new Rung[](2);
        r[0] = Rung(5 * DAY, 2000);
        r[1] = Rung(0, 0);
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.setRungs(r);
        vm.startPrank(address(gov));
        sched.setRungs(r);
        assertEq(sched.rungCount(), 2);
        r[1] = Rung(0, 1);
        vm.expectRevert(ILadderScheduler.LadderInvalid.selector);
        sched.setRungs(r);
        vm.stopPrank();
    }

    function test_defaultLadderIsTheDocumentedOne() public view {
        assertEq(sched.rungCount(), 4);
        (uint256 b, uint16 m) = sched.rungAt(0);
        assertEq(b, 14 * DAY);
        assertEq(m, 6000);
        (b, m) = sched.rungAt(3);
        assertEq(b, 0);
        assertEq(m, 0);
    }

    // ------------------------------------------------------------- ceilings

    function test_ceilingOverTime() public {
        _fund(P, 0);
        assertEq(sched.ceilingBpsAt(t0), 9500); // before the first rung: all but the buffer
        assertEq(sched.ceilingBpsAt(t0 + 15 * DAY - 1), 9500);
        assertEq(sched.ceilingBpsAt(t0 + 15 * DAY), 6000);
        assertEq(sched.ceilingBpsAt(t0 + 22 * DAY - 1), 6000);
        assertEq(sched.ceilingBpsAt(t0 + 22 * DAY), 3000);
        assertEq(sched.ceilingBpsAt(t0 + 26 * DAY), 1000);
        assertEq(sched.ceilingBpsAt(t0 + 29 * DAY - 1), 1000);
        assertEq(sched.ceilingBpsAt(t0 + 29 * DAY), 0);
        assertEq(sched.ceilingBpsAt(t0 + 365 * DAY), 0);
        assertEq(sched.ceilingAmount(t0 + 22 * DAY), 9000e6);
    }

    function test_nextRungAt() public {
        assertEq(sched.nextRungAt(), t0 + 15 * DAY);
        _day(15);
        assertEq(sched.nextRungAt(), t0 + 22 * DAY);
        _day(26);
        assertEq(sched.nextRungAt(), t0 + 29 * DAY);
        _day(29);
        assertEq(sched.nextRungAt(), 0);
    }

    function test_ceilingFollowsTheBufferWhenItIsRaised() public {
        _fund(P, 0);
        vm.prank(M1);
        gov.raiseBuffer(1500);
        assertEq(sched.ceilingBpsAt(t0), 8500);
    }

    // --------------------------------------------------- due: rounding, probe

    function test_dueRoundsUpAndCoversTheExcess() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 11_999_999_999);
        _day(15); // ceiling 18.000
        uint256 total = 12_000e6 + 11_999_999_999;
        uint256 excess = total - 18_000e6;
        uint256 dueA = sched.dueAmount(address(venueA));
        uint256 dueB = sched.dueAmount(address(venueB));
        assertEq(dueA, (excess * 12_000e6 + total - 1) / total);
        assertEq(dueB, (excess * 11_999_999_999 + total - 1) / total);
        assertGe(dueA + dueB, excess); // rounding is upwards: never leaves part of the excess behind
        assertLe(dueA + dueB, excess + 2);
    }

    function test_probeRuleEveryVenueWithAPositionIsAsked() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 1); // a dust position still gets a due share at the next rung
        _day(22); // ceiling 9.000: excess 3.000 + 1
        assertEq(sched.dueAmount(address(venueB)), 1); // ceil((3000e6 + 1) * 1 / (12000e6 + 1)) = 1
        assertGt(sched.dueAmount(address(venueA)), 0);
    }

    function test_nothingDueBelowTheCeiling() public {
        _demoFund();
        _allocate(venueA, 5000e6);
        _day(22);
        assertEq(sched.dueAmount(address(venueA)), 0);
        vm.expectRevert(ILadderScheduler.NothingDue.selector);
        sched.unwindDue(address(venueA));
    }

    function test_dueIgnoresImpairedVenues() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        venueB.setFrozen(true);
        _day(22); // ceiling 9.000
        // B first: recall fails, B becomes impaired and leaves the healthy set
        assertEq(sched.dueAmount(address(venueB)), 7500e6);
        vm.prank(KEEPER);
        assertEq(sched.unwindDue(address(venueB)), 0);
        assertTrue(policy.venueImpaired(address(venueB)));
        assertEq(sched.dueAmount(address(venueB)), 0);
        // healthy total is A alone: 12.000 vs ceiling 9.000
        assertEq(sched.dueAmount(address(venueA)), 3000e6);
    }

    // --------------------------------------------------------- agent / keeper

    function test_agentDoorGuards() public {
        _demoFund();
        vm.expectRevert(ILadderScheduler.NotAgent.selector);
        sched.allocate(address(venueA), 1);
        vm.expectRevert(ILadderScheduler.NotAgent.selector);
        sched.unwind(address(venueA), 1);
        vm.startPrank(AGENT);
        vm.expectRevert(ILadderScheduler.ZeroAmount.selector);
        sched.allocate(address(venueA), 0);
        vm.expectRevert(ILadderScheduler.ZeroAmount.selector);
        sched.unwind(address(venueA), 0);
        vm.expectRevert(ILadderScheduler.ExceedsDeployed.selector);
        sched.unwind(address(venueA), 1);
        vm.stopPrank();
    }

    function test_allocateAndUnwindEmitEvents() public {
        _demoFund();
        vm.expectEmit(true, true, false, true);
        emit ILadderScheduler.Allocated(AGENT, address(venueA), 1000e6, 1000e6, 28_500e6);
        _allocate(venueA, 1000e6);
        vm.expectEmit(true, true, false, true);
        emit ILadderScheduler.Unwound(AGENT, address(venueA), 400e6, 400e6);
        _unwind(venueA, 400e6);
    }

    function test_unwindWorksOnADelistedVenueAndForARevokedAgentKeepersStillWork() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        vm.prank(M1);
        gov.removeVenue(address(venueA));
        assertFalse(policy.venueAllowed(address(venueA)));
        assertEq(_unwind(venueA, 2000e6), 2000e6); // I-7: de-listing never traps money
        vm.prank(M1);
        gov.revokeAgent(AGENT);
        _day(22);
        vm.prank(KEEPER);
        sched.unwindDue(address(venueA)); // permissionless door is independent of the agent
        assertLt(vault.deployed(address(venueA)), 10_000e6);
    }

    // ------------------------------------------------------------- finalize

    function test_finalizeBeforeDeadlineReverts() public {
        vm.expectRevert(ILadderScheduler.DeadlineNotReached.selector);
        sched.finalize();
        _day(29);
        sched.finalize();
    }

    function test_finalizeIsIdempotentAndRetriesFrozenVenue() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        venueB.setFrozen(true);
        _day(29);
        (uint256 idle1, uint256 rel1) = sched.finalize();
        assertEq(rel1, 12_000e6 - 0); // shortfall = 30.000 - 18.000 = 12.000
        assertEq(idle1, P);
        (uint256 idle2, uint256 rel2) = sched.finalize(); // again: nothing more to release
        assertEq(idle2, P);
        assertEq(rel2, 0);
        // the venue thaws: a later finalize recovers the stuck money as extra idle
        venueB.setFrozen(false);
        (uint256 idle3,) = sched.finalize();
        assertEq(idle3, P + 12_000e6);
        assertEq(vault.deployedTotal(), 0);
    }

    function test_finalizeAfterPaidDoesNotReleaseReserve() public {
        _demoFund();
        _day(30);
        exec.execute();
        uint256 reserveBefore = vault.reserve();
        sched.finalize();
        assertEq(vault.reserve(), reserveBefore);
    }

    function test_underfundedEmitsAndDoesNotRevert() public {
        _fund(20_000e6, 0);
        _day(29);
        vm.expectEmit(false, false, false, true);
        emit ILadderScheduler.Underfunded(20_000e6, P);
        sched.finalize();
    }

    function test_killSwitchRecallsHealthyMoneyButKeepsReserve() public {
        _demoFund();
        _allocate(venueA, 12_000e6);
        _allocate(venueB, 12_000e6);
        venueB.setFrozen(true);
        vm.prank(M2);
        gov.killSwitch();
        assertTrue(policy.killed());
        assertEq(policy.killReason(), 1);
        assertEq(vault.deployed(address(venueA)), 0);
        assertEq(vault.deployed(address(venueB)), 12_000e6);
        assertTrue(policy.venueImpaired(address(venueB)));
        assertEq(vault.reserve(), 12_000e6); // not released before the deadline
        vm.expectRevert(IFloatPolicy.KillSwitchActive.selector);
        vm.prank(AGENT);
        sched.allocate(address(venueA), 1);
    }

    function test_vaultErrorsBubbleThroughAllocate() public {
        _demoFund();
        // a non-agent cannot reach the vault door directly either
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.deployToVenue(address(venueA), 1);
    }
}
