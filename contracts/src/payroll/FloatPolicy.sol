// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IFloatPolicy} from "./interfaces/IFloatPolicy.sol";
import {ILadderScheduler} from "./interfaces/ILadderScheduler.sol";
import {IPayrollVault} from "./interfaces/IPayrollVault.sol";

/// @title FloatPolicy
/// @notice The rules of the payroll float (PAYROLL.md section 2.3): venue whitelist, 40% per-venue cap, 5% liquidity
///         buffer, ladder ceiling, deadline, coverage (the rule that makes "vault >= payroll total on payday" true
///         even when `k` venues freeze) and the kill switch. Hard floors are constants nobody can change.
/// @dev Check order in `assertCanDeploy` is fixed (section 2.3.1) because it decides the revert reason.
///      Tightening paths (`markImpaired`, `kill`) are open to the scheduler / governor; every loosening path is
///      `onlyGovernor` and the governor only runs them through a 2/3 proposal.
contract FloatPolicy is IFloatPolicy {
    // ----------------------------------------------------------- hard floors
    uint16 public constant override MAX_VENUE_BPS = 4000;
    uint16 public constant override MIN_BUFFER_BPS = 500;
    uint256 public constant override MAX_VENUES = 8;
    uint256 private constant BPS = 10_000;

    uint256 public immutable override dayUnit;
    address public immutable override vault;
    address public immutable override governor;
    address public immutable scheduler;

    mapping(address venue => bool) public override venueAllowed;
    mapping(address venue => uint16) public override venueCapBps;
    mapping(address venue => bool) public override venueImpaired;
    uint16 public override bufferBps;
    uint256 public override deadlineLead;
    uint8 public override faultTolerance;
    bool public override killed;
    uint8 public override killReason;

    /// @dev Every venue ever whitelisted (never shrinks, at most MAX_VENUES); iteration domain for the exposure
    ///      calculation, the ladder and `finalize`.
    address[] private _venues;
    mapping(address venue => bool) private _known;

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    constructor(
        address vault_,
        address governor_,
        address scheduler_,
        uint256 dayUnit_,
        uint16 bufferBps_,
        uint256 deadlineLead_,
        uint8 faultTolerance_,
        address[] memory venues_,
        uint16[] memory capsBps_
    ) {
        if (vault_ == address(0) || governor_ == address(0) || scheduler_ == address(0) || dayUnit_ == 0) {
            revert BpsOutOfRange();
        }
        if (venues_.length != capsBps_.length) revert BpsOutOfRange();
        vault = vault_;
        governor = governor_;
        scheduler = scheduler_;
        dayUnit = dayUnit_;
        _checkBuffer(bufferBps_);
        _checkLead(deadlineLead_, dayUnit_);
        _checkK(faultTolerance_);
        bufferBps = bufferBps_;
        deadlineLead = deadlineLead_;
        faultTolerance = faultTolerance_;
        for (uint256 i; i < venues_.length; ++i) {
            _setVenue(venues_[i], true, capsBps_[i]);
        }
    }

    // ------------------------------------------------------------------ views

    function MIN_DEADLINE_LEAD() public view override returns (uint256) {
        return dayUnit;
    }

    /// @notice Every venue ever whitelisted, in insertion order (not part of the frozen interface).
    function venues() external view returns (address[] memory) {
        return _venues;
    }

    function deadline() public view override returns (uint256) {
        return IPayrollVault(vault).payday() - deadlineLead;
    }

    function bufferAmount() public view override returns (uint256) {
        return uint256(bufferBps) * IPayrollVault(vault).principal() / BPS;
    }

    function venueCapAmount(address venue) public view override returns (uint256) {
        uint256 bps = venueCapBps[venue];
        if (bps > MAX_VENUE_BPS) bps = MAX_VENUE_BPS;
        return bps * IPayrollVault(vault).principal() / BPS;
    }

    function coverage() public view override returns (uint256) {
        IPayrollVault v = IPayrollVault(vault);
        uint256 have = v.principal() + v.reserve();
        uint256 need = v.payrollTotal();
        return have > need ? have - need : 0;
    }

    function exposureAtRisk() public view override returns (uint256) {
        return _exposure(address(0), 0);
    }

    function checkDeploy(address venue, uint256 amount) external view override returns (bytes4) {
        return _check(venue, amount);
    }

    function assertCanDeploy(address venue, uint256 amount) external view override {
        bytes4 sel = _check(venue, amount);
        if (sel != bytes4(0)) {
            assembly ("memory-safe") {
                mstore(0, sel)
                revert(0, 4)
            }
        }
    }

    function assertCoverage() external view override {
        if (exposureAtRisk() > coverage()) revert CoverageInsufficient();
    }

    // ------------------------------------------- tighten: automation / member

    function markImpaired(address venue) external override {
        if (msg.sender != scheduler) revert NotAuthorized();
        if (venueImpaired[venue]) return;
        venueImpaired[venue] = true;
        emit VenueImpaired(venue, IPayrollVault(vault).deployed(venue));
    }

    function kill(uint8 reason) external override {
        if (msg.sender != scheduler && msg.sender != governor) revert NotAuthorized();
        if (reason == 0 || reason > 3) revert BpsOutOfRange();
        if (killed) return;
        killed = true;
        killReason = reason;
        emit KillSwitch(reason, msg.sender);
    }

    // --------------------------------------------------- governance (onlyGovernor)

    function setVenue(address venue, bool allowed, uint16 capBps) external override onlyGovernor {
        _setVenue(venue, allowed, capBps);
    }

    function setVenueCapBps(address venue, uint16 capBps) external override onlyGovernor {
        if (capBps > MAX_VENUE_BPS) revert BpsOutOfRange();
        uint16 old = venueCapBps[venue];
        venueCapBps[venue] = capBps;
        emit VenueCapChanged(venue, old, capBps);
    }

    function setBufferBps(uint16 bps) external override onlyGovernor {
        _checkBuffer(bps);
        uint16 old = bufferBps;
        bufferBps = bps;
        emit BufferChanged(old, bps);
    }

    function setDeadlineLead(uint256 lead) external override onlyGovernor {
        _checkLead(lead, dayUnit);
        uint256 old = deadlineLead;
        deadlineLead = lead;
        emit DeadlineLeadChanged(old, lead);
    }

    /// @dev Raising `k` may leave existing positions above the new coverage line; that is a tightening (it blocks
    ///      every further `allocate` through check 8) and must not revert, so coverage is not asserted here.
    function setFaultTolerance(uint8 k) external override onlyGovernor {
        _checkK(k);
        uint8 old = faultTolerance;
        faultTolerance = k;
        emit FaultToleranceChanged(old, k);
    }

    function clearImpaired(address venue) external override onlyGovernor {
        venueImpaired[venue] = false;
        emit ImpairedCleared(venue);
    }

    function resetKill() external override onlyGovernor {
        killed = false;
        killReason = 0;
        emit KillReset();
    }

    // ------------------------------------------------------------- internals

    function _setVenue(address venue, bool allowed, uint16 capBps) private {
        if (venue == address(0) || capBps > MAX_VENUE_BPS) revert BpsOutOfRange();
        if (!_known[venue]) {
            if (_venues.length >= MAX_VENUES) revert TooManyVenues();
            _known[venue] = true;
            _venues.push(venue);
        }
        venueAllowed[venue] = allowed;
        venueCapBps[venue] = capBps;
        emit VenueSet(venue, allowed, capBps);
    }

    function _checkBuffer(uint16 bps) private pure {
        if (bps < MIN_BUFFER_BPS || bps > BPS) revert BpsOutOfRange();
    }

    function _checkLead(uint256 lead, uint256 unit) private pure {
        if (lead < unit) revert BpsOutOfRange();
    }

    function _checkK(uint8 k) private pure {
        if (k == 0 || k > MAX_VENUES) revert BpsOutOfRange();
    }

    /// @dev Section 2.3.1, fixed order; returns the selector of the first failing check, 0 when allowed.
    function _check(address venue, uint256 amount) private view returns (bytes4) {
        if (killed) return KillSwitchActive.selector;
        if (block.timestamp >= deadline()) return DeadlinePassed.selector;
        if (!venueAllowed[venue]) return VenueNotAllowed.selector;
        if (venueImpaired[venue]) return VenueImpairedError.selector;
        IPayrollVault v = IPayrollVault(vault);
        if (v.deployedTotal() + amount > ILadderScheduler(scheduler).ceilingAmount(block.timestamp)) {
            return LadderCeilingExceeded.selector;
        }
        if (v.idle() < amount + bufferAmount()) return BufferBreached.selector;
        if (v.deployed(venue) + amount > venueCapAmount(venue)) return VenueCapExceeded.selector;
        if (_exposure(venue, amount) > coverage()) return CoverageInsufficient.selector;
        return bytes4(0);
    }

    /// @dev Sum of the `k` largest cost-basis positions, after adding `extra` to `venue` (address(0): no change).
    function _exposure(address venue, uint256 extra) private view returns (uint256 total) {
        uint256 n = _venues.length;
        uint256[] memory pos = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address a = _venues[i];
            pos[i] = IPayrollVault(vault).deployed(a) + (a == venue ? extra : 0);
        }
        uint256 k = faultTolerance;
        for (uint256 r; r < k && r < n; ++r) {
            uint256 best;
            uint256 bestAt;
            for (uint256 i; i < n; ++i) {
                if (pos[i] > best) {
                    best = pos[i];
                    bestAt = i;
                }
            }
            if (best == 0) break;
            total += best;
            pos[bestAt] = 0;
        }
    }
}
// forge-lint: disable-end
