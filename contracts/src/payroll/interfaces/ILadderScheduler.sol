// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice ILadderScheduler (PAYROLL.md section 2.4). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
struct Rung {
    uint256 beforeDeadline; // trần áp dụng từ (deadline - beforeDeadline)
    uint16 maxDeployedBps;
}

interface ILadderScheduler {
    // --- views ---
    function vault() external view returns (address);
    function policy() external view returns (address);
    function governor() external view returns (address);
    function isAgent(address key) external view returns (bool);
    function finalized() external view returns (bool);
    function rungCount() external view returns (uint256);
    function rungAt(uint256 i) external view returns (uint256 beforeDeadline, uint16 maxDeployedBps);
    function ceilingBpsAt(uint256 ts) external view returns (uint16);
    function ceilingAmount(uint256 ts) external view returns (uint256); // ceilingBps * principal / 10000
    function dueAmount(address venue) external view returns (uint256); // phần đến hạn rút của venue lúc này
    function nextRungAt() external view returns (uint256); // timestamp bậc kế tiếp, 0 nếu hết

    // --- agent (isAgent) ---
    function allocate(address venue, uint256 amount) external;
    function unwind(address venue, uint256 amount) external returns (uint256 received);

    // --- permissionless: chỉ đưa tiền VỀ kho ---
    function unwindDue(address venue) external returns (uint256 received);
    function finalize() external returns (uint256 idleAfter, uint256 reserveReleased);

    // --- tự động / Hội đồng ---
    function killSwitch() external; // chỉ governor (qua hàm siết của Governor)

    // --- quản trị: chỉ governor ---
    function setRungs(Rung[] calldata rungs) external; // thay cả thang; Governor phân loại siết/nới (xem 4)
    function setAgent(address key, bool active) external; // thêm = nới; gỡ = siết

    // --- events ---
    event Allocated(
        address indexed agent, address indexed venue, uint256 amount, uint256 deployedTotalAfter, uint256 ceiling
    );
    event Unwound(address indexed by, address indexed venue, uint256 requested, uint256 received);
    event RungsSet(uint256 count);
    event AgentSet(address indexed key, bool active);
    event Finalized(uint256 idleAfter, uint256 shortfall, uint256 reserveReleased, uint256 stuckAtVenues);
    event Underfunded(uint256 idleAfter, uint256 payrollTotal); // không đủ ngay cả sau reserve (giả định A1 bị vi phạm)

    // --- errors ---
    error NotGovernor();
    error NotAgent();
    error ZeroAmount();
    error NothingDue();
    error LadderInvalid(); // không đơn điệu, hơn 8 bậc, bậc cuối khác (0, 0)
    error ExceedsDeployed();
    error DeadlineNotReached(); // finalize() trước deadline (đã nêu ở quy tắc finalize)
}
