// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice IVenue / IMockVenue: venue seam and the demo venue (PAYROLL.md section 2.1). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
interface IVenue {
    function asset() external view returns (address);
    function deposit(uint256 amount) external; // kéo token từ msg.sender (đã approve)
    function withdraw(uint256 amount) external returns (uint256 received); // trả token về msg.sender, revert nếu đóng băng
    function assetsOf(address account) external view returns (uint256); // gốc + lãi tích luỹ
    function maxWithdraw(address account) external view returns (uint256); // 0 khi đóng băng
}

interface IMockVenue is IVenue {
    function admin() external view returns (address);
    function frozen() external view returns (bool);
    function yieldBpsPerDay() external view returns (uint256);
    function setFrozen(bool frozen_) external; // chỉ admin
    function setYieldBpsPerDay(uint256 bps) external; // chỉ admin; lãi đơn, tính theo block.timestamp
    function fundYield(uint256 amount) external; // kéo token từ admin vào quỹ trả lãi

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event FrozenSet(bool frozen);
    event YieldRateSet(uint256 bpsPerDay);

    error NotAdmin();
    error Frozen();
    error InsufficientAssets();
}
