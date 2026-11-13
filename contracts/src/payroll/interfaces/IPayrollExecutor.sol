// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice IPayrollExecutor (PAYROLL.md section 2.5). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
interface IPayrollExecutor {
    function vault() external view returns (address);
    function scheduler() external view returns (address);
    function executed() external view returns (bool);
    function previewExecute() external view returns (bool ok, uint256 idle, uint256 total);

    /// @notice Permissionless. Sau payday: finalize nếu chưa, kiểm idle >= payrollTotal, trả toàn roster (<= 10) trong một tx, tất cả hoặc không gì cả.
    function execute() external;

    event PayrollExecuted(uint256 indexed cycleId, uint256 total, uint256 payeeCount, address by);

    error PaydayNotReached();
    error AlreadyExecuted();
    error InsufficientFunds(uint256 idle, uint256 total);
    error EmptyRoster();
}
