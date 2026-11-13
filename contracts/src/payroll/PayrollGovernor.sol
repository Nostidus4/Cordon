// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IFloatPolicy} from "./interfaces/IFloatPolicy.sol";
import {ILadderScheduler, Rung} from "./interfaces/ILadderScheduler.sol";
import {IPayrollGovernor, PCall, PProposal} from "./interfaces/IPayrollGovernor.sol";
import {IPayrollVault, Payee} from "./interfaces/IPayrollVault.sol";

/// @notice The one read the governor needs from the existing `GuardianCouncil` (members are read live, so a change of
///         Council members is followed automatically; there is no second member list).
interface ICouncilMembers {
    function members(uint256 i) external view returns (address);
}

/// @title PayrollGovernor
/// @notice The only `governor` the payroll contracts trust (PAYROLL.md sections 2.6 and 4). Tightening: ONE Council
///         member, immediately, and only in the tighter direction (`NotTightening` otherwise). Loosening: a proposal
///         approved by 2 of 3, executed atomically against the four payroll contracts. A member who is on the roster
///         cannot approve a proposal that changes the roster, an amount or the payday (decision 4).
/// @dev Proposal ids start at 1 and are separate from `GuardianCouncil`'s (decision 6).
contract PayrollGovernor is IPayrollGovernor {
    uint8 public constant override THRESHOLD = 2;
    uint256 private constant MEMBER_COUNT = 3;

    address public immutable override council;
    address public immutable vault;
    address public immutable policy;
    address public immutable scheduler;
    address public immutable executor;

    struct Stored {
        address proposer;
        bytes32 riskReportHash;
        string title;
        PCall[] calls;
        /// @dev accounts named by roster-changing calls at `propose` time (conflict-of-interest set)
        address[] affected;
        /// @dev some call changes who/how much is paid or when (current roster members are conflicted)
        bool touchesRoster;
        uint8 approvals;
        bool executed;
        bool cancelled;
        uint64 createdAt;
    }

    mapping(uint256 id => Stored) private _proposals;
    mapping(uint256 id => mapping(address member => bool)) public override approvedBy;
    uint256 public override proposalCount;

    modifier onlyMember() {
        if (!isMember(msg.sender)) revert NotCouncilMember();
        _;
    }

    constructor(address council_, address vault_, address policy_, address scheduler_, address executor_) {
        council = council_;
        vault = vault_;
        policy = policy_;
        scheduler = scheduler_;
        executor = executor_;
    }

    // ----------------------------------------------------------------- views

    function isMember(address who) public view override returns (bool) {
        for (uint256 i; i < MEMBER_COUNT; ++i) {
            if (ICouncilMembers(council).members(i) == who) return true;
        }
        return false;
    }

    function getProposal(uint256 id) external view override returns (PProposal memory p) {
        Stored storage s = _stored(id);
        p.id = id;
        p.proposer = s.proposer;
        p.calls = s.calls;
        p.riskReportHash = s.riskReportHash;
        p.title = s.title;
        p.approvals = s.approvals;
        p.executed = s.executed;
        p.cancelled = s.cancelled;
        p.createdAt = s.createdAt;
    }

    // ------------------------------------------------------------- proposals

    function propose(string calldata title, PCall[] calldata calls, bytes32 riskReportHash)
        external
        override
        onlyMember
        returns (uint256 id)
    {
        if (calls.length == 0) revert BadCallArgs();
        id = ++proposalCount;
        Stored storage s = _proposals[id];
        s.proposer = msg.sender;
        s.riskReportHash = riskReportHash;
        s.title = title;
        s.createdAt = uint64(block.timestamp);
        for (uint256 i; i < calls.length; ++i) {
            _checkCall(calls[i], s);
            s.calls.push(calls[i]);
        }
        emit Proposed(id, msg.sender, title, riskReportHash);
    }

    function approve(uint256 id) external override onlyMember {
        Stored storage s = _open(id);
        if (_conflicted(s, msg.sender)) revert ConflictOfInterest();
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        uint8 n = ++s.approvals;
        emit Approved(id, msg.sender);
        if (n >= THRESHOLD) _execute(id, s);
    }

    /// @dev `approve` executes at the threshold, so an open proposal never has enough approvals and this reverts
    ///      `NeedsThreshold` for every open proposal: the explicit answer to "can one member push a loosening".
    function execute(uint256 id) external onlyMember {
        Stored storage s = _open(id);
        if (s.approvals < THRESHOLD) revert NeedsThreshold();
        _execute(id, s);
    }

    function cancel(uint256 id) external override onlyMember {
        Stored storage s = _stored(id);
        if (s.proposer != msg.sender) revert NotProposer();
        if (s.executed || s.cancelled) revert ProposalNotOpen();
        s.cancelled = true;
        emit Cancelled(id);
    }

    // ------------------------------------ tightening: one member, no proposal

    function killSwitch() external override onlyMember {
        ILadderScheduler(scheduler).killSwitch();
        emit EmergencyAction(msg.sender, "killSwitch", bytes32(0));
    }

    function removeVenue(address venue) external override onlyMember {
        if (!IFloatPolicy(policy).venueAllowed(venue)) revert NotTightening();
        IFloatPolicy(policy).setVenue(venue, false, 0);
        emit EmergencyAction(msg.sender, "removeVenue", _b32(venue));
    }

    function lowerVenueCap(address venue, uint16 newBps) external override onlyMember {
        if (newBps >= IFloatPolicy(policy).venueCapBps(venue)) revert NotTightening();
        IFloatPolicy(policy).setVenueCapBps(venue, newBps);
        emit EmergencyAction(msg.sender, "lowerVenueCap", _b32(venue));
    }

    function raiseBuffer(uint16 newBps) external override onlyMember {
        if (newBps <= IFloatPolicy(policy).bufferBps()) revert NotTightening();
        IFloatPolicy(policy).setBufferBps(newBps);
        emit EmergencyAction(msg.sender, "raiseBuffer", bytes32(uint256(newBps)));
    }

    function raiseDeadlineLead(uint256 newLead) external override onlyMember {
        if (newLead <= IFloatPolicy(policy).deadlineLead()) revert NotTightening();
        IFloatPolicy(policy).setDeadlineLead(newLead);
        emit EmergencyAction(msg.sender, "raiseDeadlineLead", bytes32(newLead));
    }

    function raiseFaultTolerance(uint8 newK) external override onlyMember {
        if (newK <= IFloatPolicy(policy).faultTolerance()) revert NotTightening();
        IFloatPolicy(policy).setFaultTolerance(newK);
        emit EmergencyAction(msg.sender, "raiseFaultTolerance", bytes32(uint256(newK)));
    }

    /// @dev Lowers one rung's ceiling (never its time). Later rungs are clamped so the ladder stays non-increasing.
    function lowerRung(uint256 index, uint16 newMaxBps) external override onlyMember {
        ILadderScheduler sch = ILadderScheduler(scheduler);
        uint256 n = sch.rungCount();
        if (index >= n) revert BadCallArgs();
        Rung[] memory rungs = new Rung[](n);
        for (uint256 i; i < n; ++i) {
            (uint256 before, uint16 max) = sch.rungAt(i);
            rungs[i] = Rung(before, max);
        }
        if (newMaxBps >= rungs[index].maxDeployedBps) revert NotTightening();
        rungs[index].maxDeployedBps = newMaxBps;
        for (uint256 i = index + 1; i < n; ++i) {
            if (rungs[i].maxDeployedBps > newMaxBps) rungs[i].maxDeployedBps = newMaxBps;
        }
        sch.setRungs(rungs);
        emit EmergencyAction(msg.sender, "lowerRung", bytes32(index));
    }

    function revokeAgent(address key) external override onlyMember {
        if (!ILadderScheduler(scheduler).isAgent(key)) revert NotTightening();
        ILadderScheduler(scheduler).setAgent(key, false);
        emit EmergencyAction(msg.sender, "revokeAgent", _b32(key));
    }

    function removePayee(address account) external override onlyMember {
        IPayrollVault(vault).removePayee(account);
        emit EmergencyAction(msg.sender, "removePayee", _b32(account));
    }

    // ------------------------------------------------------------- internals

    function _stored(uint256 id) private view returns (Stored storage s) {
        if (id == 0 || id > proposalCount) revert UnknownProposal();
        s = _proposals[id];
    }

    function _open(uint256 id) private view returns (Stored storage s) {
        s = _stored(id);
        if (s.executed || s.cancelled) revert ProposalNotOpen();
    }

    function _conflicted(Stored storage s, address member) private view returns (bool) {
        if (s.touchesRoster && IPayrollVault(vault).isPayee(member)) return true;
        uint256 n = s.affected.length;
        for (uint256 i; i < n; ++i) {
            if (s.affected[i] == member) return true;
        }
        return false;
    }

    /// @dev Marks executed first, then runs every call; any failing call reverts the whole `approve`.
    function _execute(uint256 id, Stored storage s) private {
        s.executed = true;
        uint256 n = s.calls.length;
        for (uint256 i; i < n; ++i) {
            PCall storage c = s.calls[i];
            (bool ok, bytes memory ret) = c.target.call(c.data);
            if (!ok) {
                if (ret.length == 0) revert BadCallArgs();
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        emit Executed(id);
    }

    /// @dev Target and selector whitelist (loosening and neutral administration only; tightening has its own
    ///      one-member functions). Collects the roster-conflict data of the call.
    function _checkCall(PCall calldata c, Stored storage s) private {
        address t = c.target;
        if (t != vault && t != policy && t != scheduler && t != executor) revert TargetNotAllowed();
        if (c.data.length < 4) revert BadCallArgs();
        bytes4 sel = bytes4(c.data[:4]);
        bool known;
        if (t == vault) {
            if (sel == IPayrollVault.setRoster.selector) {
                known = true;
                s.touchesRoster = true;
                if (c.data.length < 4 + 64) revert BadCallArgs();
                Payee[] memory roster = abi.decode(c.data[4:], (Payee[]));
                for (uint256 i; i < roster.length; ++i) {
                    s.affected.push(roster[i].account);
                }
            } else if (sel == IPayrollVault.removePayee.selector) {
                known = true;
                s.touchesRoster = true;
                if (c.data.length != 36) revert BadCallArgs();
                s.affected.push(abi.decode(c.data[4:], (address)));
            } else if (sel == IPayrollVault.startCycle.selector) {
                known = true;
                s.touchesRoster = true; // payday
            } else {
                known = sel == IPayrollVault.returnReserve.selector || sel == IPayrollVault.withdrawSurplus.selector;
            }
        } else if (t == policy) {
            known = sel == IFloatPolicy.setVenue.selector || sel == IFloatPolicy.setVenueCapBps.selector
                || sel == IFloatPolicy.setBufferBps.selector || sel == IFloatPolicy.setDeadlineLead.selector
                || sel == IFloatPolicy.setFaultTolerance.selector || sel == IFloatPolicy.clearImpaired.selector
                || sel == IFloatPolicy.resetKill.selector;
        } else if (t == scheduler) {
            known = sel == ILadderScheduler.setRungs.selector || sel == ILadderScheduler.setAgent.selector;
        }
        if (!known) revert UnknownCall();
    }

    function _b32(address a) private pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
// forge-lint: disable-end
