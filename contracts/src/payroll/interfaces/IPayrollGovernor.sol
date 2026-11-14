// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice IPayrollGovernor (PAYROLL.md section 2.6). Frozen by CITY-006, docs/spec/PAYROLL.md. Separate from the CONTRACTS.md set.
struct PCall {
    address target;
    bytes data;
}

struct PProposal {
    uint256 id;
    address proposer;
    PCall[] calls;
    bytes32 riskReportHash;
    string title;
    uint8 approvals;
    bool executed;
    bool cancelled;
    uint64 createdAt;
}

interface IPayrollGovernor {
    function THRESHOLD() external view returns (uint8); // 2
    function council() external view returns (address); // GuardianCouncil sẵn có
    function isMember(address who) external view returns (bool); // đọc council.members(0..2)
    function approvedBy(uint256 id, address member) external view returns (bool);
    function proposalCount() external view returns (uint256);
    function getProposal(uint256 id) external view returns (PProposal memory);

    function propose(string calldata title, PCall[] calldata calls, bytes32 riskReportHash)
        external
        returns (uint256 id);
    function approve(uint256 id) external; // tự execute khi đủ THRESHOLD (như GuardianCouncil)
    function cancel(uint256 id) external; // chỉ người đề xuất

    // siết: một thành viên, không cần proposal, mỗi hàm chỉ được siết
    function killSwitch() external;
    function removeVenue(address venue) external; // setVenue(venue, false, 0)
    function lowerVenueCap(address venue, uint16 newBps) external;
    function raiseBuffer(uint16 newBps) external;
    function raiseDeadlineLead(uint256 newLead) external;
    function raiseFaultTolerance(uint8 newK) external;
    function lowerRung(uint256 index, uint16 newMaxBps) external; // chỉ hạ trần của bậc, không đổi thời điểm
    function revokeAgent(address key) external;
    function removePayee(address account) external;

    event Proposed(uint256 indexed id, address indexed proposer, string title, bytes32 riskReportHash);
    event Approved(uint256 indexed id, address indexed member);
    event Executed(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event EmergencyAction(address indexed member, string action, bytes32 subject);

    error NotCouncilMember();
    error NotTightening();
    error NeedsThreshold();
    error AlreadyApproved();
    error ProposalNotOpen();
    error NotProposer();
    error TargetNotAllowed();
    error UnknownCall();
    error BadCallArgs();
    error UnknownProposal();
    error ConflictOfInterest(); // quyết định 4 (mục 11): thành viên trong roster duyệt đề xuất đổi roster/số tiền/ngày lương
}
