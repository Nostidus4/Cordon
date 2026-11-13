// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PayrollBase} from "./PayrollBase.sol";
import {EvilVenue, ReentrantVenue} from "./TestVenues.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {ILadderScheduler} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IPayrollVault} from "../../src/payroll/interfaces/IPayrollVault.sol";

/// @notice AC2: the agent has no path to a non-whitelisted address (PAYROLL.md 3 / I-3, section 9).
contract AgentPathsTest is PayrollBase {
    function _expectAllocateRefused(address venue) internal {
        vm.prank(AGENT);
        vm.expectRevert(IFloatPolicy.VenueNotAllowed.selector);
        sched.allocate(venue, 1e6);
    }

    function test_allocateToUnlistedDestinationsIsRefused() public {
        _demoFund();
        EvilVenue evil = new EvilVenue(address(token));
        _expectAllocateRefused(address(evil));
        _expectAllocateRefused(STRANGER); // EOA
        _expectAllocateRefused(address(vault)); // the vault itself
        _expectAllocateRefused(address(token));
        _expectAllocateRefused(address(gov));
        _expectAllocateRefused(TREASURY);
        _expectAllocateRefused(address(0));
        _expectAllocateRefused(ALICE); // even a payee
        assertEq(_bal(address(vault)), P + 12_000e6);
        assertEq(_bal(STRANGER) + _bal(address(evil)) + _bal(TREASURY) + _bal(ALICE), 0);
    }

    function test_delistedVenueCannotBeAllocatedAnymore() public {
        _demoFund();
        _allocate(venueA, 1e6);
        vm.prank(M2);
        gov.removeVenue(address(venueA));
        _expectAllocateRefused(address(venueA));
    }

    function test_onlyListedByTwoThirdsBecomesAnAllocationTarget() public {
        _demoFund();
        EvilVenue evil = new EvilVenue(address(token));
        // one member cannot add a venue: the single-member door has no such function and the target refuses
        vm.prank(M1);
        vm.expectRevert(IFloatPolicy.NotGovernor.selector);
        policy.setVenue(address(evil), true, 4000);
        _expectAllocateRefused(address(evil));
        _whitelist(address(evil)); // 2 of 3
        vm.prank(AGENT);
        sched.allocate(address(evil), 1e6);
        assertEq(vault.deployed(address(evil)), 1e6);
    }

    function test_notAnAgentCannotAllocateOrUnwind() public {
        _demoFund();
        _allocate(venueA, 1000e6);
        address[4] memory nobodies = [STRANGER, KEEPER, M1, address(gov)];
        for (uint256 i; i < nobodies.length; ++i) {
            vm.startPrank(nobodies[i]);
            vm.expectRevert(ILadderScheduler.NotAgent.selector);
            sched.allocate(address(venueA), 1);
            vm.expectRevert(ILadderScheduler.NotAgent.selector);
            sched.unwind(address(venueA), 1);
            vm.stopPrank();
        }
    }

    function test_revokedAgentLosesTheDoor() public {
        _demoFund();
        vm.prank(M3);
        gov.revokeAgent(AGENT);
        vm.prank(AGENT);
        vm.expectRevert(ILadderScheduler.NotAgent.selector);
        sched.allocate(address(venueA), 1);
        // and re-adding is a loosening: only via 2/3
        vm.prank(M3);
        vm.expectRevert(ILadderScheduler.NotGovernor.selector);
        sched.setAgent(AGENT, true);
    }

    function test_agentSurfaceTakesNoRecipient() public pure {
        // allocate / unwind: (venue, amount) only. unwindDue: (venue). finalize / execute: nothing.
        assertEq(ILadderScheduler.allocate.selector, bytes4(keccak256("allocate(address,uint256)")));
        assertEq(ILadderScheduler.unwind.selector, bytes4(keccak256("unwind(address,uint256)")));
        assertEq(ILadderScheduler.unwindDue.selector, bytes4(keccak256("unwindDue(address)")));
        assertEq(ILadderScheduler.finalize.selector, bytes4(keccak256("finalize()")));
    }

    function test_unwindOnlyReturnsToTheVault() public {
        _demoFund();
        _allocate(venueA, 5000e6);
        uint256 before = _bal(address(vault));
        _unwind(venueA, 5000e6);
        assertEq(_bal(address(vault)), before + 5000e6);
        assertEq(_bal(AGENT), 0);
        assertEq(_bal(address(sched)), 0);
    }

    function test_payOutOutsideRosterIsRefusedEvenFromExecutor() public {
        _fund(P, 0);
        vm.prank(address(exec));
        vm.expectRevert(IPayrollVault.NotPayee.selector);
        vault.payOut(STRANGER, 1e6);
        // nobody else can call payOut at all
        vm.expectRevert(IPayrollVault.NotExecutor.selector);
        vault.payOut(ALICE, 12_000e6);
        vm.prank(address(sched));
        vm.expectRevert(IPayrollVault.NotExecutor.selector);
        vault.payOut(ALICE, 12_000e6);
        vm.prank(AGENT);
        vm.expectRevert(IPayrollVault.NotExecutor.selector);
        vault.payOut(ALICE, 12_000e6);
    }

    function test_vaultDoorsAreSchedulerOnly() public {
        _demoFund();
        vm.startPrank(AGENT); // the agent EOA cannot skip the scheduler (and its checks)
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.deployToVenue(address(venueA), 1);
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.recallFromVenue(address(venueA), 1);
        vm.expectRevert(IPayrollVault.NotScheduler.selector);
        vault.releaseReserve(1);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.returnReserve(1);
        vm.expectRevert(IPayrollVault.NotGovernor.selector);
        vault.withdrawSurplus(1);
        vm.stopPrank();
    }

    function test_maliciousVenueCannotReenterToDrain() public {
        _demoFund();
        ReentrantVenue evil = new ReentrantVenue(address(token));
        evil.arm(address(vault), address(sched), STRANGER);
        _whitelist(address(evil));
        vm.prank(AGENT);
        sched.allocate(address(evil), 3000e6);
        uint256 vaultBefore = _bal(address(vault));
        vm.prank(AGENT);
        uint256 got = sched.unwind(address(evil), 3000e6);
        assertEq(got, 3000e6);
        assertTrue(evil.attacked());
        assertTrue(evil.reenterRecallBlocked(), "re-entry into unwindDue must fail");
        assertTrue(
            evil.reenterFinalizeBlocked() || vm.getBlockTimestamp() < deadline, "finalize before deadline fails anyway"
        );
        assertTrue(evil.payOutBlocked(), "payOut is executor-only");
        assertTrue(evil.returnReserveBlocked(), "returnReserve is governor-only");
        assertEq(_bal(address(vault)), vaultBefore + 3000e6);
        assertEq(_bal(STRANGER), 0);
    }

    /// @dev Any address the agent can name that is not a whitelisted venue is refused and moves nothing.
    function testFuzz_agentCannotReachAnyOtherAddress(address venue, uint256 amount) public {
        _demoFund();
        vm.assume(venue != address(venueA) && venue != address(venueB));
        amount = bound(amount, 1, 1e12 * USDC);
        uint256 vaultBefore = _bal(address(vault));
        vm.startPrank(AGENT);
        try sched.allocate(venue, amount) {
            revert("allocate to a non-whitelisted address succeeded");
        } catch {}
        try sched.unwind(venue, amount) {
            revert("unwind on a non-whitelisted address succeeded");
        } catch {}
        vm.stopPrank();
        assertEq(_bal(address(vault)), vaultBefore);
        assertEq(_bal(venue), venue == address(vault) ? vaultBefore : 0);
    }
}
