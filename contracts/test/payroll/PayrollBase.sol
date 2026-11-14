// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CouncilStub} from "../helpers/CouncilStub.sol";
import {FloatPolicy} from "../../src/payroll/FloatPolicy.sol";
import {LadderScheduler} from "../../src/payroll/LadderScheduler.sol";
import {PayrollExecutor} from "../../src/payroll/PayrollExecutor.sol";
import {PayrollGovernor} from "../../src/payroll/PayrollGovernor.sol";
import {PayrollVault} from "../../src/payroll/PayrollVault.sol";
import {MockVenue} from "../../src/payroll/mocks/MockVenue.sol";
import {Payee} from "../../src/payroll/interfaces/IPayrollVault.sol";
import {Rung} from "../../src/payroll/interfaces/ILadderScheduler.sol";
import {IFloatPolicy} from "../../src/payroll/interfaces/IFloatPolicy.sol";
import {PCall} from "../../src/payroll/interfaces/IPayrollGovernor.sol";
import {TestUSDC} from "../../src/tokens/TestUSDC.sol";

/// @notice Shared fixture of the payroll tests: the five contracts wired by predicted addresses (same trick as
///         `script/DeployPayroll.s.sol`), two mock venues, a 3-member council stand-in and a 3-person roster
///         worth 30.000 tUSDC. `DAY` is 1 day; payday is `t0 + 30 days`, so the deadline (T-1) is `t0 + 29 days`.
abstract contract PayrollBase is Test {
    uint256 internal constant DAY = 1 days;
    uint256 internal constant USDC = 1e6;
    uint256 internal constant P = 30_000e6;

    address internal constant M1 = address(0xA001);
    address internal constant M2 = address(0xA002);
    address internal constant M3 = address(0xA003);
    address internal constant AGENT = address(0xA9E1);
    address internal constant KEEPER = address(0xBEEF);
    address internal constant TREASURY = address(0x7EA5);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA201);
    address internal constant STRANGER = address(0xDEAD);

    TestUSDC internal token;
    CouncilStub internal council;
    PayrollVault internal vault;
    FloatPolicy internal policy;
    LadderScheduler internal sched;
    PayrollExecutor internal exec;
    PayrollGovernor internal gov;
    MockVenue internal venueA;
    MockVenue internal venueB;

    uint256 internal t0;
    uint256 internal payday;
    uint256 internal deadline;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        t0 = vm.getBlockTimestamp();
        token = new TestUSDC();
        address[] memory ms = new address[](3);
        ms[0] = M1;
        ms[1] = M2;
        ms[2] = M3;
        council = new CouncilStub(ms, new bytes32[](3));
        venueA = new MockVenue(address(token), address(this), DAY);
        venueB = new MockVenue(address(token), address(this), DAY);
        _deploy(_roster(), DAY, 30 * DAY, 1);
    }

    function _roster() internal pure returns (Payee[] memory r) {
        r = new Payee[](3);
        r[0] = Payee(ALICE, 12_000e6);
        r[1] = Payee(BOB, 10_000e6);
        r[2] = Payee(CAROL, 8_000e6);
    }

    function _rungs() internal pure returns (Rung[] memory r) {
        r = new Rung[](4);
        r[0] = Rung(14 * DAY, 6000);
        r[1] = Rung(7 * DAY, 3000);
        r[2] = Rung(3 * DAY, 1000);
        r[3] = Rung(0, 0);
    }

    function _deploy(Payee[] memory roster, uint256 dayUnit, uint256 cycleLength, uint8 k) internal {
        uint256 n = vm.getNonce(address(this));
        address vaultA = vm.computeCreateAddress(address(this), n);
        address policyA = vm.computeCreateAddress(address(this), n + 1);
        address schedA = vm.computeCreateAddress(address(this), n + 2);
        address execA = vm.computeCreateAddress(address(this), n + 3);
        address govA = vm.computeCreateAddress(address(this), n + 4);
        payday = vm.getBlockTimestamp() + cycleLength;
        deadline = payday - dayUnit;
        vault = new PayrollVault(
            address(token), PayrollVault.Wiring(govA, policyA, schedA, execA, TREASURY), payday, roster
        );
        address[] memory vs = new address[](2);
        vs[0] = address(venueA);
        vs[1] = address(venueB);
        uint16[] memory caps = new uint16[](2);
        caps[0] = 4000;
        caps[1] = 4000;
        policy = new FloatPolicy(address(vault), govA, schedA, dayUnit, 500, dayUnit, k, vs, caps);
        address[] memory agents = new address[](1);
        agents[0] = AGENT;
        sched = new LadderScheduler(address(vault), address(policy), govA, _rungs(), agents);
        exec = new PayrollExecutor(address(vault), address(sched));
        gov = new PayrollGovernor(address(council), address(vault), address(policy), address(sched), address(exec));
        assertEq(address(vault), vaultA);
        assertEq(address(policy), policyA);
        assertEq(address(sched), schedA);
        assertEq(address(exec), execA);
        assertEq(address(gov), govA);
    }

    // ---------------------------------------------------------------- helpers

    function _fund(uint256 principal, uint256 reserve) internal {
        token.mint(address(this), principal + reserve);
        token.approve(address(vault), principal + reserve);
        if (principal != 0) vault.deposit(principal);
        if (reserve != 0) vault.fundReserve(reserve);
    }

    function _day(uint256 d) internal {
        vm.warp(t0 + d * DAY);
    }

    function _allocate(MockVenue v, uint256 amount) internal {
        vm.prank(AGENT);
        sched.allocate(address(v), amount);
    }

    function _unwind(MockVenue v, uint256 amount) internal returns (uint256) {
        vm.prank(AGENT);
        return sched.unwind(address(v), amount);
    }

    /// @dev demo funding: principal = payroll, reserve = 40% of it
    function _demoFund() internal {
        _fund(P, 12_000e6);
    }

    function _call(address target, bytes memory data) internal pure returns (PCall memory) {
        return PCall(target, data);
    }

    function _propose(address member, PCall[] memory calls) internal returns (uint256) {
        vm.prank(member);
        return gov.propose("t", calls, bytes32(0));
    }

    function _one(address target, bytes memory data) internal pure returns (PCall[] memory c) {
        c = new PCall[](1);
        c[0] = PCall(target, data);
    }

    /// @dev run a 2/3 proposal with the given calls (M1 proposes, M1 + M2 approve; M3 stays out)
    function _pass(PCall[] memory calls) internal {
        uint256 id = _propose(M1, calls);
        vm.prank(M1);
        gov.approve(id);
        vm.prank(M2);
        gov.approve(id);
    }

    /// @dev whitelist another venue (40% cap) through a real 2/3 proposal
    function _whitelist(address venue) internal {
        _pass(_one(address(policy), abi.encodeCall(IFloatPolicy.setVenue, (venue, true, 4000))));
    }

    function _bal(address a) internal view returns (uint256) {
        return token.balanceOf(a);
    }
}
