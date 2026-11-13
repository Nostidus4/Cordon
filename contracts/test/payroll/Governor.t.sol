// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {CouncilStub} from "../helpers/CouncilStub.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {ILadderScheduler, Rung} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IPayrollGovernor, PCall, PProposal} from "../../src/payroll/interfaces/IPayrollGovernor.sol";
import {IPayrollVault, Payee} from "../../src/payroll/interfaces/IPayrollVault.sol";

/// @notice Council stand-in whose members can change, to show the governor reads them live.
contract MutableCouncil {
    address[3] public members;

    constructor(address a, address b, address c) {
        members = [a, b, c];
    }

    function set(uint256 i, address who) external {
        members[i] = who;
    }
}

/// @notice The core idea: tightening is immediate and one member; loosening only through 2 of 3 (PAYROLL.md 4).
contract GovernorTest is PayrollBase {
    // ------------------------------------------------------------- tightening

    function test_everyTighteningFunctionNeedsExactlyOneMember() public {
        _demoFund();
        _allocate(venueA, 2000e6);

        vm.prank(M1);
        gov.lowerVenueCap(address(venueA), 3000);
        assertEq(policy.venueCapBps(address(venueA)), 3000);

        vm.prank(M2);
        gov.raiseBuffer(800);
        assertEq(policy.bufferBps(), 800);

        vm.prank(M3);
        gov.raiseDeadlineLead(2 * DAY);
        assertEq(policy.deadlineLead(), 2 * DAY);

        vm.prank(M1);
        gov.raiseFaultTolerance(2);
        assertEq(policy.faultTolerance(), 2);

        vm.prank(M2);
        gov.lowerRung(1, 2000);
        (, uint16 m) = sched.rungAt(1);
        assertEq(m, 2000);

        vm.prank(M3);
        gov.revokeAgent(AGENT);
        assertFalse(sched.isAgent(AGENT));

        vm.prank(M1);
        gov.removeVenue(address(venueB));
        assertFalse(policy.venueAllowed(address(venueB)));

        vm.prank(M2);
        gov.removePayee(CAROL);
        assertEq(vault.payrollTotal(), 22_000e6);

        vm.prank(M3);
        gov.killSwitch();
        assertTrue(policy.killed());
        assertEq(vault.deployedTotal(), 0); // kill switch brought the healthy position home
    }

    function test_tighteningEmitsEmergencyAction() public {
        vm.expectEmit(true, false, false, true);
        emit IPayrollGovernor.EmergencyAction(M1, "raiseBuffer", bytes32(uint256(900)));
        vm.prank(M1);
        gov.raiseBuffer(900);
    }

    function test_notTighteningIsRefused() public {
        vm.startPrank(M1);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.lowerVenueCap(address(venueA), 4000); // same
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.lowerVenueCap(address(venueA), 4001); // higher
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.raiseBuffer(500); // same
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.raiseBuffer(100); // lower
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.raiseDeadlineLead(DAY);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.raiseDeadlineLead(0);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.raiseFaultTolerance(1);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.lowerRung(0, 6000);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.lowerRung(0, 9000);
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.lowerRung(3, 0); // the deadline rung is already (0, 0)
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.revokeAgent(STRANGER); // not an agent
        gov.removeVenue(address(venueA));
        vm.expectRevert(IPayrollGovernor.NotTightening.selector);
        gov.removeVenue(address(venueA)); // already removed
        vm.expectRevert(IPayrollGovernor.BadCallArgs.selector);
        gov.lowerRung(9, 1);
        vm.stopPrank();
    }

    function test_lowerRungClampsTheLaterOnesSoTheLadderStaysValid() public {
        vm.prank(M1);
        gov.lowerRung(0, 2000); // rung 1 was 3000 -> clamped to 2000, rung 2 (1000) untouched
        (, uint16 m0) = sched.rungAt(0);
        (, uint16 m1) = sched.rungAt(1);
        (, uint16 m2) = sched.rungAt(2);
        (uint256 b3, uint16 m3) = sched.rungAt(3);
        assertEq(m0, 2000);
        assertEq(m1, 2000);
        assertEq(m2, 1000);
        assertEq(m3, 0);
        assertEq(b3, 0);
        // times are not touched
        (uint256 b0,) = sched.rungAt(0);
        assertEq(b0, 14 * DAY);
    }

    function test_tighteningRefusesNonMembers() public {
        address[3] memory outsiders = [STRANGER, AGENT, KEEPER];
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(outsiders[i]);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.killSwitch();
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.removeVenue(address(venueA));
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.lowerVenueCap(address(venueA), 1);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.raiseBuffer(900);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.raiseDeadlineLead(5 * DAY);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.raiseFaultTolerance(2);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.lowerRung(0, 1);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.revokeAgent(AGENT);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            gov.removePayee(ALICE);
            vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
            this.proposeEmpty();
            vm.stopPrank();
        }
    }

    function proposeEmpty() external {
        gov.propose("x", _one(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ())), bytes32(0));
    }

    // -------------------------------------------- loosening: never one member

    function test_noLooseningThroughTheSingleMemberDoor() public {
        _demoFund();
        vm.startPrank(M1); // a member calling the targets directly is just an address
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setVenue(address(venueA), true, 100);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setVenueCapBps(address(venueA), 4000);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setBufferBps(500);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setDeadlineLead(DAY);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setFaultTolerance(1);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.clearImpaired(address(venueA));
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.resetKill();
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.setRungs(new Rung[](0));
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.setAgent(M1, true);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.setRoster(new Payee[](0));
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.startCycle(vm.getBlockTimestamp() + 90 * DAY);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.returnReserve(1);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.withdrawSurplus(1);
        vm.stopPrank();
    }

    function test_executeNeedsThresholdAndOneApprovalChangesNothing() public {
        vm.prank(M1);
        gov.killSwitch();
        uint256 id = _propose(M1, _one(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ())));
        vm.prank(M1);
        gov.approve(id);
        assertTrue(policy.killed()); // still killed
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.NeedsThreshold.selector);
        gov.execute(id);
        assertEq(gov.getProposal(id).approvals, 1);
        assertFalse(gov.getProposal(id).executed);
    }

    function test_proposalExecutesAtomicallyAtTwoOfThree() public {
        vm.prank(M1);
        gov.killSwitch();
        PCall[] memory calls = new PCall[](2);
        calls[0] = PCall(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ()));
        calls[1] = PCall(address(policy), abi.encodeCall(IFloatPolicy.setBufferBps, (700)));
        uint256 id = _propose(M1, calls);
        assertEq(id, 1);
        vm.prank(M1);
        gov.approve(id);
        assertFalse(gov.approvedBy(id, M2));
        vm.expectEmit(true, false, false, true);
        emit IPayrollGovernor.Executed(id);
        vm.prank(M2);
        gov.approve(id);
        assertFalse(policy.killed());
        assertEq(policy.bufferBps(), 700);
        PProposal memory p = gov.getProposal(id);
        assertTrue(p.executed);
        assertEq(p.approvals, 2);
        // a third approval on an executed proposal is refused
        vm.prank(M3);
        vm.expectRevert(IPayrollGovernor.ProposalNotOpen.selector);
        gov.approve(id);
    }

    function test_failingCallRevertsTheWholeApprovalAndCountsForNothing() public {
        vm.prank(M1);
        gov.killSwitch();
        PCall[] memory calls = new PCall[](2);
        calls[0] = PCall(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ()));
        calls[1] = PCall(address(policy), abi.encodeCall(IFloatPolicy.setBufferBps, (100))); // below the 5% floor
        uint256 id = _propose(M1, calls);
        vm.prank(M1);
        gov.approve(id);
        vm.prank(M2);
        vm.expectRevert(IFloatPolicy.BpsOutOfRange.selector);
        gov.approve(id);
        assertTrue(policy.killed(), "first call must have been rolled back");
        assertEq(gov.getProposal(id).approvals, 1);
        assertFalse(gov.approvedBy(id, M2));
        assertFalse(gov.getProposal(id).executed);
    }

    function test_loosenessEveryKindCanPassWithTwoApprovals() public {
        _demoFund();
        // raise the cap back after lowering it with one member
        vm.prank(M1);
        gov.lowerVenueCap(address(venueA), 1000);
        _pass(_one(address(policy), abi.encodeCall(IFloatPolicy.setVenueCapBps, (address(venueA), 3500))));
        assertEq(policy.venueCapBps(address(venueA)), 3500);
        // re-add an agent
        vm.prank(M3);
        gov.revokeAgent(AGENT);
        _pass(_one(address(sched), abi.encodeCall(ILadderScheduler.setAgent, (AGENT, true))));
        assertTrue(sched.isAgent(AGENT));
        // lower the buffer, k, lead; clear impaired
        vm.prank(M1);
        gov.raiseBuffer(900);
        _pass(_one(address(policy), abi.encodeCall(IFloatPolicy.setBufferBps, (500))));
        assertEq(policy.bufferBps(), 500);
        vm.prank(address(sched));
        policy.markImpaired(address(venueB));
        _pass(_one(address(policy), abi.encodeCall(IFloatPolicy.clearImpaired, (address(venueB)))));
        assertFalse(policy.venueImpaired(address(venueB)));
    }

    // ------------------------------------------------------- proposal guards

    function test_proposeGuards() public {
        PCall[] memory none = new PCall[](0);
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.BadCallArgs.selector);
        gov.propose("x", none, bytes32(0));

        vm.startPrank(M1);
        vm.expectRevert(IPayrollGovernor.TargetNotAllowed.selector);
        gov.propose("x", _one(address(token), abi.encodeWithSignature("mint(address,uint256)", M1, 1)), bytes32(0));
        vm.expectRevert(IPayrollGovernor.TargetNotAllowed.selector);
        gov.propose("x", _one(STRANGER, hex"11223344"), bytes32(0));
        vm.expectRevert(IPayrollGovernor.TargetNotAllowed.selector);
        gov.propose("x", _one(address(gov), abi.encodeCall(IFloatPolicy.resetKill, ())), bytes32(0));
        vm.expectRevert(IPayrollGovernor.BadCallArgs.selector);
        gov.propose("x", _one(address(policy), hex"1122"), bytes32(0));
        // selectors outside the governance whitelist
        vm.expectRevert(IPayrollGovernor.UnknownCall.selector);
        gov.propose("x", _one(address(vault), abi.encodeCall(IPayrollVault.deposit, (1))), bytes32(0));
        vm.expectRevert(IPayrollGovernor.UnknownCall.selector);
        gov.propose("x", _one(address(vault), abi.encodeCall(IPayrollVault.payOut, (STRANGER, 1))), bytes32(0));
        vm.expectRevert(IPayrollGovernor.UnknownCall.selector);
        gov.propose("x", _one(address(vault), abi.encodeCall(IPayrollVault.deployToVenue, (STRANGER, 1))), bytes32(0));
        vm.expectRevert(IPayrollGovernor.UnknownCall.selector);
        gov.propose("x", _one(address(policy), abi.encodeCall(IFloatPolicy.markImpaired, (STRANGER))), bytes32(0));
        vm.expectRevert(IPayrollGovernor.UnknownCall.selector);
        gov.propose("x", _one(address(exec), abi.encodeCall(exec.execute, ())), bytes32(0));
        vm.stopPrank();
    }

    function test_approveCancelGuards() public {
        uint256 id = _propose(M1, _one(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ())));
        vm.prank(M1);
        gov.approve(id);
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.AlreadyApproved.selector);
        gov.approve(id);
        vm.prank(M2);
        vm.expectRevert(IPayrollGovernor.NotProposer.selector);
        gov.cancel(id);
        vm.prank(M1);
        gov.cancel(id);
        vm.prank(M2);
        vm.expectRevert(IPayrollGovernor.ProposalNotOpen.selector);
        gov.approve(id);
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.ProposalNotOpen.selector);
        gov.cancel(id);
        vm.prank(M2);
        vm.expectRevert(IPayrollGovernor.UnknownProposal.selector);
        gov.approve(99);
        vm.prank(M2);
        vm.expectRevert(IPayrollGovernor.UnknownProposal.selector);
        gov.approve(0);
        vm.expectRevert(IPayrollGovernor.UnknownProposal.selector);
        gov.getProposal(5);
        vm.prank(STRANGER);
        vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
        gov.approve(id);
    }

    function test_proposalStoresMetadata() public {
        vm.prank(M2);
        uint256 id = gov.propose(
            "restore", _one(address(policy), abi.encodeCall(IFloatPolicy.resetKill, ())), bytes32(uint256(7))
        );
        PProposal memory p = gov.getProposal(id);
        assertEq(p.proposer, M2);
        assertEq(p.title, "restore");
        assertEq(p.riskReportHash, bytes32(uint256(7)));
        assertEq(p.calls.length, 1);
        assertEq(p.createdAt, vm.getBlockTimestamp());
        assertEq(gov.proposalCount(), 1);
        assertEq(gov.THRESHOLD(), 2);
        assertEq(gov.council(), address(council));
    }

    // ------------------------------------------------- conflict of interest

    function _deployWithMemberInRoster() internal {
        Payee[] memory r = new Payee[](2);
        r[0] = Payee(M1, 10_000e6);
        r[1] = Payee(ALICE, 20_000e6);
        _deploy(r, DAY, 30 * DAY, 1);
    }

    function test_rosterMemberCannotApproveRosterChange() public {
        _deployWithMemberInRoster();
        Payee[] memory next = new Payee[](2);
        next[0] = Payee(M1, 20_000e6); // raise M1's own pay
        next[1] = Payee(ALICE, 10_000e6);
        uint256 id = _propose(M2, _one(address(vault), abi.encodeCall(IPayrollVault.setRoster, (next))));
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.ConflictOfInterest.selector);
        gov.approve(id);
        vm.prank(M2);
        gov.approve(id);
        vm.prank(M3);
        gov.approve(id); // the two non-conflicted members pass it
        assertEq(vault.payrollTotal(), 30_000e6);
        (, uint256 amount) = vault.payeeAt(0);
        assertEq(amount, 20_000e6);
    }

    function test_rosterMemberCannotApprovePaydayOrRemovalOfAnyone() public {
        _deployWithMemberInRoster();
        _fund(30_000e6, 0);
        _day(31);
        // pay out this cycle so startCycle is legal
        exec.execute();
        uint256 id = _propose(
            M2, _one(address(vault), abi.encodeCall(IPayrollVault.startCycle, (vm.getBlockTimestamp() + 30 * DAY)))
        );
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.ConflictOfInterest.selector);
        gov.approve(id);

        // naming a member in the new roster conflicts him too, even when he is not paid today
        _deploy(_roster(), DAY, 30 * DAY, 1);
        Payee[] memory next = new Payee[](1);
        next[0] = Payee(M3, 1e6);
        uint256 id2 = _propose(M1, _one(address(vault), abi.encodeCall(IPayrollVault.setRoster, (next))));
        vm.prank(M3);
        vm.expectRevert(IPayrollGovernor.ConflictOfInterest.selector);
        gov.approve(id2);
    }

    function test_rosterMemberMayApproveUnrelatedProposals() public {
        _deployWithMemberInRoster();
        vm.prank(M1);
        gov.raiseBuffer(900);
        uint256 id = _propose(M2, _one(address(policy), abi.encodeCall(IFloatPolicy.setBufferBps, (600))));
        vm.prank(M1);
        gov.approve(id); // not a roster / amount / payday change
        vm.prank(M2);
        gov.approve(id);
        assertEq(policy.bufferBps(), 600);
    }

    function test_rosterMemberMayStillTighten() public {
        _deployWithMemberInRoster();
        vm.prank(M1);
        gov.killSwitch();
        assertTrue(policy.killed());
    }

    // -------------------------------------------------- council read live

    function test_membersAreReadLiveFromTheCouncil() public {
        MutableCouncil mc = new MutableCouncil(M1, M2, M3);
        council = CouncilStub(address(mc)); // same `members(uint256)` surface
        _deploy(_roster(), DAY, 30 * DAY, 1);
        assertTrue(gov.isMember(M1));
        assertFalse(gov.isMember(STRANGER));
        vm.prank(M1);
        gov.raiseBuffer(900);
        mc.set(0, STRANGER); // Council rotates M1 out
        assertFalse(gov.isMember(M1));
        assertTrue(gov.isMember(STRANGER));
        vm.prank(M1);
        vm.expectRevert(IPayrollGovernor.NotCouncilMember.selector);
        gov.raiseBuffer(1000);
        vm.prank(STRANGER);
        gov.raiseBuffer(1000);
        assertEq(policy.bufferBps(), 1000);
    }
}
