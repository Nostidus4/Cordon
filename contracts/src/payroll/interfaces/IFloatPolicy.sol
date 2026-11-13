// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice IFloatPolicy (PAYROLL.md section 2.3). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
interface IFloatPolicy {
    // --- hằng và tham số cố định khi triển khai ---
    function dayUnit() external view returns (uint256); // 86400 (demo nén: 20)
    function MAX_VENUE_BPS() external view returns (uint16); // 4000 (40%), cứng, không ai nâng được
    function MIN_BUFFER_BPS() external view returns (uint16); // 500 (5%), sàn cứng
    function MIN_DEADLINE_LEAD() external view returns (uint256); // 1 * dayUnit, sàn cứng
    function MAX_VENUES() external view returns (uint256); // 8

    // --- trạng thái luật ---
    function vault() external view returns (address);
    function governor() external view returns (address);
    function venueAllowed(address venue) external view returns (bool);
    function venueCapBps(address venue) external view returns (uint16); // <= MAX_VENUE_BPS
    function venueImpaired(address venue) external view returns (bool);
    function bufferBps() external view returns (uint16); // >= MIN_BUFFER_BPS
    function deadlineLead() external view returns (uint256); // >= MIN_DEADLINE_LEAD
    function faultTolerance() external view returns (uint8); // k: số venue có thể kẹt cùng lúc, 1..MAX_VENUES
    function killed() external view returns (bool);
    function killReason() external view returns (uint8); // 0 none, 1 member, 2 deadline, 3 automation

    // --- tính toán (view) ---
    function deadline() external view returns (uint256); // payday - deadlineLead
    function bufferAmount() external view returns (uint256); // bufferBps * principal / 10000
    function venueCapAmount(address venue) external view returns (uint256); // venueCapBps * principal / 10000
    function coverage() external view returns (uint256); // principal + reserve - payrollTotal (0 nếu âm)
    function exposureAtRisk() external view returns (uint256); // tổng k vị thế (cost basis) lớn nhất
    function checkDeploy(address venue, uint256 amount) external view returns (bytes4 errorSelector); // 0 = được

    /// @dev Chạy đúng thứ tự mục 2.3.1; revert bằng custom error tương ứng. Gọi bởi vault.
    function assertCanDeploy(address venue, uint256 amount) external view;
    /// @dev Vault/Governor gọi khi roster hoặc reserve đổi: revert CoverageInsufficient nếu exposureAtRisk > coverage.
    function assertCoverage() external view;

    // --- tự động hoá / permissionless siết ---
    function markImpaired(address venue) external; // chỉ scheduler (khi recall thất bại); siết, không có đường ngược tự động
    function kill(uint8 reason) external; // chỉ scheduler hoặc governor; siết

    // --- quản trị: chỉ governor ---
    function setVenue(address venue, bool allowed, uint16 capBps) external; // thêm = nới; gỡ (allowed=false) = siết
    function setVenueCapBps(address venue, uint16 capBps) external; // hạ = siết, tăng = nới
    function setBufferBps(uint16 bps) external; // tăng = siết, hạ = nới
    function setDeadlineLead(uint256 lead) external; // tăng = siết, giảm = nới (>= MIN_DEADLINE_LEAD)
    function setFaultTolerance(uint8 k) external; // tăng = siết, giảm = nới
    function clearImpaired(address venue) external; // nới
    function resetKill() external; // nới

    // --- events ---
    event VenueSet(address indexed venue, bool allowed, uint16 capBps);
    event VenueCapChanged(address indexed venue, uint16 oldBps, uint16 newBps);
    event BufferChanged(uint16 oldBps, uint16 newBps);
    event DeadlineLeadChanged(uint256 oldLead, uint256 newLead);
    event FaultToleranceChanged(uint8 oldK, uint8 newK);
    event VenueImpaired(address indexed venue, uint256 deployedAtRisk);
    event ImpairedCleared(address indexed venue);
    event KillSwitch(uint8 reason, address by);
    event KillReset();

    // --- errors (thứ tự kiểm ở 2.3.1) ---
    error NotGovernor();
    error NotAuthorized(); // markImpaired / kill từ địa chỉ lạ
    error KillSwitchActive();
    error DeadlinePassed();
    error VenueNotAllowed();
    error VenueImpairedError(); // tên Solidity tránh trùng event; reason code: VENUE_IMPAIRED
    error LadderCeilingExceeded();
    error BufferBreached();
    error VenueCapExceeded();
    error CoverageInsufficient();
    error TooManyVenues();
    error BpsOutOfRange(); // capBps > MAX_VENUE_BPS, bufferBps < MIN_BUFFER_BPS, lead < MIN_DEADLINE_LEAD...
}
