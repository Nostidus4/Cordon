// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGuardianCouncil, Call, Proposal} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry, KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

/// @dev Timelock (#77): a Council with `timelockDelay > 0` queues a fully approved proposal, `execute` works from
///      `eta`, any member can veto while queued, tightening stays immediate. Delay 0 is covered by the whole
///      `GuardianCouncilTest` suite (all existing tests deploy with 0).
contract GuardianCouncilTimelockTest is MayLabsBase {
    uint64 internal constant DELAY = 60;

    PrincipalRegistry internal registry;
    PolicyVault internal vault;
    GuardianCouncil internal gc;

    function setUp() public override {
        super.setUp();
        vm.warp(1_700_000_000);
        uint256 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 2);
        registry = new PrincipalRegistry(predicted);
        vault = new PolicyVault(address(registry), predicted, address(tUSDC), address(dex), makeAddr("topUpOp"));
        gc = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault), DELAY
        );
        assertEq(address(gc), predicted);
        txAllowList.__seedRole(address(gc), 2);
        deployerAllowList.__seedRole(address(gc), 2);

        // district `minh` with one key and a district cap, installed through the timelock
        Call[] memory c = new Call[](3);
        c[0] = _c(address(registry), abi.encodeCall(IPrincipalRegistry.createPrincipal, (MINH, "minh")));
        c[1] = _c(address(registry), abi.encodeCall(IPrincipalRegistry.addKey, (MINH, KEY_MINH, KeyKind.HUMAN, "minh")));
        c[2] = _c(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (MINH, 50_000e6)));
        uint256 id = _propose(MEMBER_TRANG, MINH, c);
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_HUY, id);
        vm.warp(block.timestamp + DELAY);
        _execute(MEMBER_TRANG, id);
    }

    function _c(address t, bytes memory d) internal pure returns (Call memory) {
        return Call(t, d);
    }

    function _propose(address m, bytes32 subject, Call[] memory calls) internal returns (uint256 id) {
        vm.prank(m);
        id = gc.propose("t", subject, calls, bytes32(0));
    }

    function _approve(address m, uint256 id) internal {
        vm.prank(m);
        gc.approve(id);
    }

    function _execute(address m, uint256 id) internal {
        vm.prank(m);
        gc.execute(id);
    }

    function _veto(address m, uint256 id) internal {
        vm.prank(m);
        gc.veto(id);
    }

    function _raise() internal view returns (Call[] memory c) {
        c = new Call[](1);
        c[0] = _c(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (MINH, 90_000e6)));
    }

    /// @dev A loosening (raise the district cap), proposed by Trang, approved by Lan and Huy (neither owns `minh`).
    ///      Left queued at `block.timestamp + DELAY`.
    function _queued() internal returns (uint256 id) {
        id = _propose(MEMBER_TRANG, MINH, _raise());
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_HUY, id);
    }

    function test_delayAndSeed() public view {
        assertEq(gc.timelockDelay(), DELAY);
        assertEq(vault.principalDailyCap(MINH), 50_000e6);
    }

    function test_firstApprovalDoesNotQueue() public {
        uint256 id = _propose(MEMBER_TRANG, MINH, _raise());
        _approve(MEMBER_LAN, id);
        assertEq(gc.etaOf(id), 0);
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.NeedsThreshold.selector);
        gc.execute(id);
    }

    function test_thresholdQueuesInsteadOfExecuting() public {
        uint256 id = _propose(MEMBER_TRANG, MINH, _raise());
        _approve(MEMBER_LAN, id);
        uint64 eta = uint64(block.timestamp) + DELAY;
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.Queued(id, eta);
        _approve(MEMBER_HUY, id);
        Proposal memory p = gc.getProposal(id);
        assertEq(p.approvals, 2);
        assertFalse(p.executed);
        assertFalse(p.cancelled);
        assertEq(gc.etaOf(id), eta);
        assertEq(vault.principalDailyCap(MINH), 50_000e6, "loosening has not happened yet");
    }

    function test_approvalAfterQueueLeavesEtaUnchanged() public {
        uint256 id = _queued();
        uint64 eta = gc.etaOf(id);
        vm.warp(block.timestamp + 10);
        _approve(MEMBER_TRANG, id);
        assertEq(gc.getProposal(id).approvals, 3);
        assertEq(gc.etaOf(id), eta, "third approval must not re-queue");
    }

    function test_executeBeforeEtaReverts() public {
        uint256 id = _queued();
        uint64 eta = gc.etaOf(id);
        vm.warp(eta - 1);
        vm.prank(MEMBER_TRANG);
        vm.expectRevert(abi.encodeWithSelector(IGuardianCouncil.TimelockNotReady.selector, eta));
        gc.execute(id);
    }

    function test_executeAtEtaWorks() public {
        uint256 id = _queued();
        uint256 v = vault.policyVersion();
        vm.warp(gc.etaOf(id));
        vm.expectEmit(true, false, false, false, address(gc));
        emit IGuardianCouncil.Executed(id);
        _execute(MEMBER_TRANG, id);
        assertTrue(gc.getProposal(id).executed);
        assertEq(vault.principalDailyCap(MINH), 90_000e6);
        assertEq(vault.policyVersion(), v + 1);
    }

    function test_executeNeedsMember() public {
        uint256 id = _queued();
        vm.warp(gc.etaOf(id));
        vm.expectRevert(IGuardianCouncil.NotCouncilMember.selector);
        gc.execute(id);
    }

    function test_executeTwiceReverts() public {
        uint256 id = _queued();
        vm.warp(gc.etaOf(id));
        _execute(MEMBER_TRANG, id);
        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.execute(id);
    }

    function test_oneMemberVetoCancels() public {
        uint256 id = _queued();
        vm.expectEmit(true, false, false, false, address(gc));
        emit IGuardianCouncil.Cancelled(id);
        vm.expectEmit(true, true, false, false, address(gc));
        emit IGuardianCouncil.Vetoed(id, MEMBER_LAN);
        _veto(MEMBER_LAN, id);
        assertTrue(gc.getProposal(id).cancelled);
        vm.warp(gc.etaOf(id) + 1 days);
        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.execute(id);
        assertEq(vault.principalDailyCap(MINH), 50_000e6);
    }

    function test_vetoNeedsMember() public {
        uint256 id = _queued();
        vm.expectRevert(IGuardianCouncil.NotCouncilMember.selector);
        gc.veto(id);
    }

    function test_vetoUnqueuedReverts() public {
        uint256 id = _propose(MEMBER_TRANG, MINH, _raise());
        _approve(MEMBER_LAN, id);
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.veto(id);
    }

    function test_vetoAfterExecuteReverts() public {
        uint256 id = _queued();
        vm.warp(gc.etaOf(id));
        _execute(MEMBER_TRANG, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.veto(id);
    }

    function test_vetoTwiceAndUnknownRevert() public {
        uint256 id = _queued();
        _veto(MEMBER_LAN, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.veto(id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.veto(999);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.etaOf(999);
    }

    function test_proposerCanStillCancelQueued() public {
        uint256 id = _queued();
        vm.prank(MEMBER_TRANG);
        gc.cancel(id);
        assertTrue(gc.getProposal(id).cancelled);
    }

    function test_emergencyActionsStayImmediateWhileQueued() public {
        uint256 id = _queued();
        vm.prank(MEMBER_TRANG);
        gc.lowerCap(1, MINH, 10_000e6);
        assertEq(vault.principalDailyCap(MINH), 10_000e6);
        vm.prank(MEMBER_LAN);
        gc.emergencyLock(MINH);
        assertEq(gc.etaOf(id), uint64(block.timestamp) + DELAY);
    }

    /// @dev Fuzz time: before eta always `TimelockNotReady`, from eta it executes.
    function testFuzz_timelockWindow(uint64 wait) public {
        uint256 id = _queued();
        uint64 eta = gc.etaOf(id);
        wait = uint64(bound(wait, 0, 10 days));
        uint256 t = vm.getBlockTimestamp() + wait;
        vm.warp(t);
        vm.prank(MEMBER_TRANG);
        if (t < eta) {
            vm.expectRevert(abi.encodeWithSelector(IGuardianCouncil.TimelockNotReady.selector, eta));
            gc.execute(id);
        } else {
            gc.execute(id);
            assertTrue(gc.getProposal(id).executed);
        }
    }

    /// @dev Fuzz delay: the constructor value is what `timelockDelay()` returns.
    function testFuzz_deployDelayIsStored(uint64 delay) public {
        delay = uint64(bound(delay, 1, 365 days));
        GuardianCouncil g = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault), delay
        );
        assertEq(g.timelockDelay(), delay);
    }
}
