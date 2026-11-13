// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {PayrollBase} from "./PayrollBase.sol";
import {MockVenue} from "../../src/payroll/mocks/MockVenue.sol";
import {LadderScheduler} from "../../src/payroll/LadderScheduler.sol";
import {PayrollVault} from "../../src/payroll/PayrollVault.sol";
import {PayrollExecutor} from "../../src/payroll/PayrollExecutor.sol";

/// @dev Random agent / keeper / fault actions against the demo cycle (P = Pr = 30.000, R = 12.000, k = 1).
///      Reverts are legal outcomes; the handler only records what the invariants need.
contract PayrollHandler is CommonBase, StdCheats, StdUtils {
    LadderScheduler internal sched;
    PayrollVault internal vault;
    MockVenue internal a;
    MockVenue internal b;
    address internal agent;
    address internal admin;
    uint256 public t0;
    uint256 public deadline;
    uint256 public payday;

    bool public finalizedAfterDeadline;
    bool public allocatedAfterDeadline;
    uint256 public frozenCount;

    constructor(
        LadderScheduler sched_,
        PayrollVault vault_,
        MockVenue a_,
        MockVenue b_,
        address agent_,
        address admin_,
        uint256 t0_,
        uint256 deadline_,
        uint256 payday_
    ) {
        sched = sched_;
        vault = vault_;
        a = a_;
        b = b_;
        agent = agent_;
        admin = admin_;
        t0 = t0_;
        deadline = deadline_;
        payday = payday_;
    }

    function _v(uint8 i) internal view returns (MockVenue) {
        return i % 2 == 0 ? a : b;
    }

    function allocate(uint8 v, uint256 amount) external {
        amount = bound(amount, 1, 15_000e6);
        bool late = block.timestamp >= deadline;
        vm.prank(agent);
        try sched.allocate(address(_v(v)), amount) {
            if (late) allocatedAfterDeadline = true;
        } catch {}
    }

    function unwind(uint8 v, uint256 amount) external {
        amount = bound(amount, 1, 15_000e6);
        vm.prank(agent);
        try sched.unwind(address(_v(v)), amount) {} catch {}
    }

    function unwindDue(uint8 v) external {
        try sched.unwindDue(address(_v(v))) {} catch {}
    }

    /// @dev only venue B ever freezes, so at most k = 1 venue is stuck
    function freezeB(bool on) external {
        vm.prank(admin);
        b.setFrozen(on);
        frozenCount = on ? 1 : 0;
    }

    function finalize() external {
        if (block.timestamp < deadline) return;
        try sched.finalize() {
            finalizedAfterDeadline = true;
        } catch {}
    }

    function warp(uint32 secs) external {
        uint256 target = block.timestamp + bound(secs, 1, 4 days);
        if (target > payday + 2 days) return;
        vm.warp(target);
    }
}

contract PayrollInvariantsTest is PayrollBase {
    PayrollHandler internal handler;

    function setUp() public override {
        super.setUp();
        _demoFund();
        handler = new PayrollHandler(sched, vault, venueA, venueB, AGENT, address(this), t0, deadline, payday);
        targetContract(address(handler));
    }

    /// @dev I-2: no k positions can ever exceed the cover
    /// @dev I-2 holds until finalize(): after the deadline nothing can be allocated (I-6) and finalize spends the
    /// reserve on exactly the stuck exposure, so `coverage()` shrinks by design; payday is then guarded by I-1.
    function invariant_I2_exposureWithinCoverage() public view {
        if (sched.finalized()) return;
        assertLe(policy.exposureAtRisk(), policy.coverage());
    }

    /// @dev I-4: liquidity buffer
    function invariant_I4_bufferKept() public view {
        assertGe(vault.idle(), policy.bufferAmount());
    }

    /// @dev I-5: per-venue cap (40% hard cap)
    function invariant_I5_venueCap() public view {
        assertLe(vault.deployed(address(venueA)), vault.principal() * 4000 / 10000);
        assertLe(vault.deployed(address(venueB)), vault.principal() * 4000 / 10000);
    }

    /// @dev I-6: no allocation succeeds at or after the deadline
    function invariant_I6_noAllocationAfterDeadline() public view {
        assertFalse(handler.allocatedAfterDeadline());
    }

    /// @dev I-10: integrity of idle
    function invariant_I10_idleMatchesBalance() public view {
        assertEq(vault.idle(), token.balanceOf(address(vault)) - vault.reserve());
    }

    /// @dev I-1: once finalized after the deadline (one venue at most stuck) the vault holds the payroll
    function invariant_I1_paydayCovered() public view {
        if (handler.finalizedAfterDeadline()) {
            assertGe(vault.idle(), vault.payrollTotal());
        }
    }
}
