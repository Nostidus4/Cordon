// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {FloatPolicy} from "../src/payroll/FloatPolicy.sol";
import {LadderScheduler} from "../src/payroll/LadderScheduler.sol";
import {PayrollExecutor} from "../src/payroll/PayrollExecutor.sol";
import {PayrollGovernor} from "../src/payroll/PayrollGovernor.sol";
import {PayrollVault} from "../src/payroll/PayrollVault.sol";
import {MockVenue} from "../src/payroll/mocks/MockVenue.sol";
import {Payee} from "../src/payroll/interfaces/IPayrollVault.sol";
import {Rung} from "../src/payroll/interfaces/ILadderScheduler.sol";
import {TestUSDC} from "../src/tokens/TestUSDC.sol";

/// @title DeployPayroll
/// @notice CITY-006: deploys the payroll set (vault, policy, scheduler, executor, governor) and two MockVenues on a
///         FRESH chain. Nothing in the frozen CONTRACTS.md set is touched or redeployed.
/// @dev The five contracts reference each other, so every address is predicted from the deployer nonce (same trick as
///      `Deploy.s.sol`) and checked after deployment: vault +0, policy +1, scheduler +2, executor +3, governor +4.
///      MockVenues and the token (when `PAYROLL_TOKEN` is unset) are deployed first and shift those offsets.
///      Roster: 10 demo payees, 3.000 tUSDC each (P = 30.000). Funding is NOT done here (call deposit / fundReserve).
///      Env: `DEPLOYER_PK`, `PAYROLL_COUNCIL` (GuardianCouncil address, members are read from it), `PAYROLL_AGENT`,
///      optional `PAYROLL_TOKEN`, `PAYROLL_TREASURY` (default deployer), `PAYROLL_DAY_UNIT` (default 86400; demo
///      compressed deployment uses 20), `PAYROLL_CYCLE_DAYS` (default 30). Addresses are printed, not written.
contract DeployPayroll is Script {
    struct Dep {
        address token;
        address vault;
        address policy;
        address scheduler;
        address executor;
        address governor;
        address venueA;
        address venueB;
    }

    function run() external returns (Dep memory d) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address council = vm.envAddress("PAYROLL_COUNCIL");
        address agent = vm.envAddress("PAYROLL_AGENT");
        address treasury = vm.envOr("PAYROLL_TREASURY", deployer);
        uint256 dayUnit = vm.envOr("PAYROLL_DAY_UNIT", uint256(86400));
        uint256 cycleDays = vm.envOr("PAYROLL_CYCLE_DAYS", uint256(30));
        address token = vm.envOr("PAYROLL_TOKEN", address(0));

        vm.startBroadcast(pk);
        if (token == address(0)) token = address(new TestUSDC());
        d.token = token;
        d.venueA = address(new MockVenue(token, deployer, dayUnit));
        d.venueB = address(new MockVenue(token, deployer, dayUnit));
        uint256 n = vm.getNonce(deployer);
        address vaultA = vm.computeCreateAddress(deployer, n);
        address policyA = vm.computeCreateAddress(deployer, n + 1);
        address schedA = vm.computeCreateAddress(deployer, n + 2);
        address execA = vm.computeCreateAddress(deployer, n + 3);
        address govA = vm.computeCreateAddress(deployer, n + 4);

        _deploySet(d, council, agent, treasury, dayUnit, cycleDays, [govA, policyA, schedA, execA]);
        vm.stopBroadcast();

        require(d.vault == vaultA && d.policy == policyA, "vault/policy address prediction is off");
        require(d.scheduler == schedA && d.executor == execA, "scheduler/executor address prediction is off");
        require(d.governor == govA, "governor address prediction is off");
        _log(d);
    }

    function _log(Dep memory d) private pure {
        console.log("token      ", d.token);
        console.log("vault      ", d.vault);
        console.log("policy     ", d.policy);
        console.log("scheduler  ", d.scheduler);
        console.log("executor   ", d.executor);
        console.log("governor   ", d.governor);
        console.log("venueA / B ", d.venueA, d.venueB);
    }

    function _roster() private pure returns (Payee[] memory roster) {
        roster = new Payee[](10);
        for (uint256 i; i < 10; ++i) {
            roster[i] = Payee(vm.addr(uint256(keccak256(abi.encodePacked("payroll-payee", i)))), 3_000e6);
        }
    }

    function _rungs(uint256 dayUnit) private pure returns (Rung[] memory rungs) {
        rungs = new Rung[](4);
        rungs[0] = Rung(14 * dayUnit, 6000);
        rungs[1] = Rung(7 * dayUnit, 3000);
        rungs[2] = Rung(3 * dayUnit, 1000);
        rungs[3] = Rung(0, 0);
    }

    function _deploySet(
        Dep memory d,
        address council,
        address agent,
        address treasury,
        uint256 dayUnit,
        uint256 cycleDays,
        address[4] memory p // governor, policy, scheduler, executor (predicted)
    ) private {
        d.vault = address(
            new PayrollVault(
                d.token,
                PayrollVault.Wiring(p[0], p[1], p[2], p[3], treasury),
                block.timestamp + cycleDays * dayUnit,
                _roster()
            )
        );
        d.policy = address(new FloatPolicy(d.vault, p[0], p[2], dayUnit, 500, dayUnit, 1, _venues(d), _caps()));
        address[] memory agents = new address[](1);
        agents[0] = agent;
        d.scheduler = address(new LadderScheduler(d.vault, d.policy, p[0], _rungs(dayUnit), agents));
        d.executor = address(new PayrollExecutor(d.vault, d.scheduler));
        d.governor = address(new PayrollGovernor(council, d.vault, d.policy, d.scheduler, d.executor));
    }

    function _venues(Dep memory d) private pure returns (address[] memory v) {
        v = new address[](2);
        v[0] = d.venueA;
        v[1] = d.venueB;
    }

    function _caps() private pure returns (uint16[] memory c) {
        c = new uint16[](2);
        c[0] = 4000;
        c[1] = 4000;
    }
}
