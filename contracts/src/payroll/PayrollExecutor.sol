// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IPayrollExecutor} from "./interfaces/IPayrollExecutor.sol";
import {ILadderScheduler} from "./interfaces/ILadderScheduler.sol";
import {IPayrollVault} from "./interfaces/IPayrollVault.sol";

/// @title PayrollExecutor
/// @notice Payday button (PAYROLL.md section 2.5): anyone, after `payday`, finalizes if nobody did, checks the vault
///         holds the whole payroll, and pays the roster in one transaction, all or nothing. It takes no argument:
///         money goes only to `vault.payeeAt(i)` in the exact amount on file.
contract PayrollExecutor is IPayrollExecutor {
    address public immutable override vault;
    address public immutable override scheduler;

    constructor(address vault_, address scheduler_) {
        vault = vault_;
        scheduler = scheduler_;
    }

    function executed() public view override returns (bool) {
        return IPayrollVault(vault).paid();
    }

    function previewExecute() external view override returns (bool ok, uint256 idle, uint256 total) {
        IPayrollVault v = IPayrollVault(vault);
        idle = v.idle();
        total = v.payrollTotal();
        ok = !v.paid() && block.timestamp >= v.payday() && v.payeeCount() != 0 && idle >= total;
    }

    function execute() external override {
        IPayrollVault v = IPayrollVault(vault);
        if (v.paid()) revert AlreadyExecuted();
        if (block.timestamp < v.payday()) revert PaydayNotReached();
        uint256 n = v.payeeCount();
        if (n == 0) revert EmptyRoster();
        // keeper forgot T-1: payday repairs it (a payday is always after the deadline)
        ILadderScheduler(scheduler).finalize();
        uint256 idle = v.idle();
        uint256 total = v.payrollTotal();
        if (idle < total) revert InsufficientFunds(idle, total);
        for (uint256 i; i < n; ++i) {
            (address account, uint256 amount) = v.payeeAt(i);
            v.payOut(account, amount);
        }
        v.markPaid();
        emit PayrollExecuted(v.cycleId(), total, n, msg.sender);
    }
}
// forge-lint: disable-end
