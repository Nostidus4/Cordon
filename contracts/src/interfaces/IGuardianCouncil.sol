// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct Call {
    address target;
    bytes data;
}

struct Proposal {
    uint256 id;
    address proposer;
    /// @dev affected principal, `bytes32(0)` when general
    bytes32 subjectPrincipal;
    Call[] calls;
    bytes32 riskReportHash;
    string title;
    uint8 approvals;
    bool executed;
    bool cancelled;
    uint64 createdAt;
}

/// @title IGuardianCouncil
/// @notice 3-member council: tighten with 1, loosen with 2 of 3, no AI key. Frozen by CTR-001,
///         see docs/spec/CONTRACTS.md section 4.
interface IGuardianCouncil {
    // ---------------------------------------------------------------- events
    event Proposed(
        uint256 indexed id, address indexed proposer, bytes32 subjectPrincipal, string title, bytes32 riskReportHash
    );
    event Approved(uint256 indexed id, address indexed member);
    event Executed(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event EmergencyAction(address indexed member, string action, bytes32 subject);
    /// @dev timelock (#77): threshold reached, executable from `eta`
    event Queued(uint256 indexed id, uint64 eta);
    /// @dev a queued proposal stopped by one member (always paired with `Cancelled`)
    event Vetoed(uint256 indexed id, address indexed member);

    // ---------------------------------------------------------------- errors
    error NotCouncilMember();
    error NotTightening();
    error NeedsThreshold();
    error ConflictOfInterest();
    error AlreadyApproved();
    error ProposalNotOpen();
    error NotProposer();
    error TargetNotAllowed();
    error UnknownCall();
    error BadCallArgs();
    error UnknownProposal();
    /// @dev `execute` before the queued proposal's `eta`
    error TimelockNotReady(uint64 eta);

    // ----------------------------------------------------------------- views
    /// @dev 2
    function THRESHOLD() external view returns (uint8);
    function members(uint256 i) external view returns (address);
    /// @dev principal of the member, `bytes32(0)` if none
    function memberPrincipal(address member) external view returns (bytes32);
    function approvedBy(uint256 id, address member) external view returns (bool);
    function proposalCount() external view returns (uint256);
    function getProposal(uint256 id) external view returns (Proposal memory);
    /// @dev immutable seconds between reaching `THRESHOLD` and the earliest execution; 0 = execute at once
    function timelockDelay() external view returns (uint64);
    /// @dev earliest execution time of a queued proposal, 0 = never queued
    function etaOf(uint256 id) external view returns (uint64);

    // ------------------------------------------------------------- proposals
    function propose(string calldata title, bytes32 subjectPrincipal, Call[] calldata calls, bytes32 riskReportHash)
        external
        returns (uint256 id);
    /// @dev reverts `ConflictOfInterest` if `memberPrincipal(msg.sender) == subjectPrincipal`;
    ///      once `THRESHOLD` approvals are reached it executes at once when `timelockDelay == 0`, else it is
    ///      queued (`Queued`) and `execute` works from `eta`
    function approve(uint256 id) external;
    /// @dev `NeedsThreshold` below the threshold, `TimelockNotReady(eta)` before `eta`
    function execute(uint256 id) external;
    /// @dev any member, only while queued (`ProposalNotOpen` otherwise): cancels and emits `Vetoed`
    function veto(uint256 id) external;
    /// @dev proposer only
    function cancel(uint256 id) external;

    // ------------------------------- tightening: one member, no proposal needed
    /// @dev `vault.lockPrincipal` + Tx AllowList `setNone` for every key of the principal
    function emergencyLock(bytes32 principalId) external;
    function emergencyPause() external;
    /// @param kind 0 key, 1 principal
    function lowerCap(uint8 kind, bytes32 subject, uint256 newCap) external;
    /// @param kind 0 token, 1 protocol, 2 recipient
    function revokeAllow(uint8 kind, bytes32 subject, bytes4 selector) external;
    function deactivateKey(address key) external;
}
