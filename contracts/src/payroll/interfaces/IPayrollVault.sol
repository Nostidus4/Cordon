// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice IPayrollVault (PAYROLL.md section 2.2). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
struct Payee {
    address account;
    uint256 amount;
}

interface IPayrollVault {
    // --- views ---
    function token() external view returns (address);
    function governor() external view returns (address);
    function policy() external view returns (address);
    function scheduler() external view returns (address);
    function executor() external view returns (address);
    function treasury() external view returns (address); // nơi duy nhất nhận phần thặng dư/trả lại
    function cycleId() external view returns (uint256);
    function payday() external view returns (uint256);
    function paid() external view returns (bool);
    function payrollTotal() external view returns (uint256); // = tổng amount của roster
    function principal() external view returns (uint256); // tổng đã nạp qua deposit() trong chu kỳ (không gồm reserve)
    function reserve() external view returns (uint256); // phần dự phòng nằm trong kho, không allocate được
    function idle() external view returns (uint256); // token.balanceOf(this) - reserve
    function deployed(address venue) external view returns (uint256); // giá gốc (cost basis) còn nằm ở venue
    function deployedTotal() external view returns (uint256);
    function venueList() external view returns (address[] memory); // venue từng nhận tiền hoặc đang whitelist
    function payeeCount() external view returns (uint256);
    function payeeAt(uint256 i) external view returns (address account, uint256 amount);
    function isPayee(address account) external view returns (bool);
    function yieldRealized() external view returns (uint256);

    // --- nạp tiền: ai cũng gọi được (chỉ đưa token VÀO kho) ---
    function deposit(uint256 amount) external;
    function fundReserve(uint256 amount) external;

    // --- chỉ LadderScheduler ---
    function deployToVenue(address venue, uint256 amount) external;
    function recallFromVenue(address venue, uint256 amount) external returns (uint256 received);
    function releaseReserve(uint256 amount) external;

    // --- chỉ PayrollExecutor ---
    function payOut(address to, uint256 amount) external; // to phải isPayee, mỗi payee một lần mỗi chu kỳ
    function markPaid() external;

    // --- quản trị: chỉ governor ---
    function setRoster(Payee[] calldata roster) external; // nới; <= 10, không trùng, amount > 0
    function removePayee(address account) external; // siết (giữ tiền lại); hạ payrollTotal
    function startCycle(uint256 newPayday) external; // nới; chỉ khi paid và deployedTotal == 0
    function returnReserve(uint256 amount) external; // nới; chỉ về treasury, giữ coverage
    function withdrawSurplus(uint256 amount) external; // nới; chỉ về treasury, chỉ sau paid, không đụng reserve

    // --- events ---
    event Deposited(address indexed from, uint256 amount, uint256 principalAfter);
    event ReserveFunded(address indexed from, uint256 amount, uint256 reserveAfter);
    event Deployed(address indexed venue, uint256 amount, uint256 deployedAfter, uint256 idleAfter);
    event Recalled(
        address indexed venue, uint256 requested, uint256 received, uint256 principalPart, uint256 yieldPart
    );
    event RecallFailed(address indexed venue, uint256 requested); // venue revert/đóng băng
    event Haircut(address indexed venue, uint256 requested, uint256 received); // venue trả thiếu mà không revert
    event ReserveReleased(uint256 amount, uint256 reserveAfter);
    event ReserveReturned(uint256 amount);
    event PaidOut(address indexed payee, uint256 amount, uint256 cycleId);
    event RosterSet(uint256 payeeCount, uint256 payrollTotal);
    event PayeeRemoved(address indexed account, uint256 payrollTotalAfter);
    event CycleStarted(uint256 indexed cycleId, uint256 payday);
    event SurplusWithdrawn(uint256 amount);

    // --- errors ---
    error NotGovernor();
    error NotScheduler();
    error NotExecutor();
    error NotPayee();
    error AlreadyPaid();
    error RosterTooLarge();
    error RosterInvalid(); // trùng, amount = 0, địa chỉ 0
    error RosterLocked(); // sau deadline (T-1) không đổi roster
    error CycleNotSettled();
    error InsufficientIdle();
    error ZeroAddress();
    // lỗi của FloatPolicy được bubble lên từ policy.assertCanDeploy (mục 2.3)
}
