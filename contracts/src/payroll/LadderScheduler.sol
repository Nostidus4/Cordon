// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IFloatPolicy} from "./interfaces/IFloatPolicy.sol";
import {ILadderScheduler, Rung} from "./interfaces/ILadderScheduler.sol";
import {IPayrollVault} from "./interfaces/IPayrollVault.sol";
import {IVenue} from "./interfaces/IVenue.sol";

interface IFloatPolicyList {
    function venues() external view returns (address[] memory);
}

/// @title LadderScheduler
/// @notice The agent's only door (`allocate` / `unwind`, neither has a recipient argument) and the permissionless
///         ways to bring money home (`unwindDue`, `finalize`). The ladder is a ceiling on money outside the vault that
///         steps down to 0 at the deadline; whatever sits above the ceiling is "due" and anyone can pull it back.
/// @dev PAYROLL.md section 2.4. Pulling money home never depends on the whitelist, the agent or the kill switch (I-7).
contract LadderScheduler is ILadderScheduler {
    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_RUNGS = 8;

    address public immutable override vault;
    address public immutable override policy;
    address public immutable override governor;

    mapping(address key => bool) public override isAgent;
    Rung[] private _rungs;
    /// @dev cycle id for which `finalize` last completed (`finalized()` is per cycle)
    uint256 private _finalizedCycle;

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    modifier onlyAgent() {
        if (!isAgent[msg.sender]) revert NotAgent();
        _;
    }

    constructor(address vault_, address policy_, address governor_, Rung[] memory rungs_, address[] memory agents_) {
        vault = vault_;
        policy = policy_;
        governor = governor_;
        _setRungs(rungs_);
        for (uint256 i; i < agents_.length; ++i) {
            isAgent[agents_[i]] = true;
            emit AgentSet(agents_[i], true);
        }
    }

    // ------------------------------------------------------------------ views

    function finalized() public view override returns (bool) {
        return _finalizedCycle == IPayrollVault(vault).cycleId();
    }

    function rungCount() external view override returns (uint256) {
        return _rungs.length;
    }

    function rungAt(uint256 i) external view override returns (uint256, uint16) {
        Rung storage r = _rungs[i];
        return (r.beforeDeadline, r.maxDeployedBps);
    }

    function ceilingBpsAt(uint256 ts) public view override returns (uint16) {
        uint256 d = IFloatPolicy(policy).deadline();
        for (uint256 i = _rungs.length; i > 0; --i) {
            Rung storage r = _rungs[i - 1];
            if (ts + r.beforeDeadline >= d) return r.maxDeployedBps;
        }
        // before the first rung: everything except the liquidity buffer may be out
        return uint16(BPS - IFloatPolicy(policy).bufferBps());
    }

    function ceilingAmount(uint256 ts) public view override returns (uint256) {
        return uint256(ceilingBpsAt(ts)) * IPayrollVault(vault).principal() / BPS;
    }

    function dueAmount(address venue) public view override returns (uint256) {
        IFloatPolicy p = IFloatPolicy(policy);
        if (p.venueImpaired(venue)) return 0;
        IPayrollVault v = IPayrollVault(vault);
        address[] memory list = IFloatPolicyList(policy).venues();
        uint256 healthy;
        for (uint256 i; i < list.length; ++i) {
            if (!p.venueImpaired(list[i])) healthy += v.deployed(list[i]);
        }
        uint256 ceiling = ceilingAmount(block.timestamp);
        if (healthy <= ceiling) return 0;
        uint256 excess = healthy - ceiling;
        uint256 mine = v.deployed(venue);
        // ceil(excess * mine / healthy)
        return (excess * mine + healthy - 1) / healthy;
    }

    function nextRungAt() external view override returns (uint256) {
        uint256 d = IFloatPolicy(policy).deadline();
        for (uint256 i; i < _rungs.length; ++i) {
            uint256 b = _rungs[i].beforeDeadline;
            uint256 at = d > b ? d - b : 0;
            if (at > block.timestamp) return at;
        }
        return 0;
    }

    // ------------------------------------------------------------ agent paths

    function allocate(address venue, uint256 amount) external override onlyAgent {
        if (amount == 0) revert ZeroAmount();
        IPayrollVault v = IPayrollVault(vault);
        v.deployToVenue(venue, amount);
        emit Allocated(msg.sender, venue, amount, v.deployedTotal(), ceilingAmount(block.timestamp));
    }

    function unwind(address venue, uint256 amount) external override onlyAgent returns (uint256 received) {
        if (amount == 0) revert ZeroAmount();
        if (amount > IPayrollVault(vault).deployed(venue)) revert ExceedsDeployed();
        received = _recall(venue, amount);
        emit Unwound(msg.sender, venue, amount, received);
    }

    // ----------------------------------------------- permissionless: money home

    function unwindDue(address venue) external override returns (uint256 received) {
        uint256 due = dueAmount(venue);
        if (due == 0) revert NothingDue();
        received = _recall(venue, due);
        emit Unwound(msg.sender, venue, due, received);
    }

    function finalize() external override returns (uint256 idleAfter, uint256 reserveReleased) {
        IFloatPolicy p = IFloatPolicy(policy);
        if (block.timestamp < p.deadline()) revert DeadlineNotReached();
        if (!p.killed()) p.kill(2);
        _recallAll();
        IPayrollVault v = IPayrollVault(vault);
        uint256 total = v.payrollTotal();
        uint256 shortfall;
        if (!v.paid()) {
            uint256 idleNow = v.idle();
            shortfall = total > idleNow ? total - idleNow : 0;
            reserveReleased = shortfall < v.reserve() ? shortfall : v.reserve();
            if (reserveReleased != 0) v.releaseReserve(reserveReleased);
        }
        idleAfter = v.idle();
        if (!v.paid() && idleAfter < total) emit Underfunded(idleAfter, total);
        _finalizedCycle = v.cycleId();
        emit Finalized(idleAfter, shortfall, reserveReleased, v.deployedTotal());
    }

    // ------------------------------------------------------------ governance

    function killSwitch() external override onlyGovernor {
        IFloatPolicy(policy).kill(1);
        _recallAll();
    }

    function setRungs(Rung[] calldata rungs) external override onlyGovernor {
        _setRungs(rungs);
    }

    function setAgent(address key, bool active) external override onlyGovernor {
        isAgent[key] = active;
        emit AgentSet(key, active);
    }

    // ------------------------------------------------------------- internals

    /// @dev A venue that returns less than asked (revert, freeze, haircut) is marked impaired; never reverts.
    function _recall(address venue, uint256 amount) private returns (uint256 received) {
        received = IPayrollVault(vault).recallFromVenue(venue, amount);
        if (received < amount) IFloatPolicy(policy).markImpaired(venue);
    }

    /// @dev Try to bring every position home. A position that is still open afterwards marks its venue impaired.
    function _recallAll() private {
        IPayrollVault v = IPayrollVault(vault);
        address[] memory list = IFloatPolicyList(policy).venues();
        for (uint256 i; i < list.length; ++i) {
            address venue = list[i];
            if (v.deployed(venue) == 0) continue;
            uint256 amount = _assetsOf(venue, v.deployed(venue));
            uint256 received = v.recallFromVenue(venue, amount);
            if (received < amount || v.deployed(venue) != 0) IFloatPolicy(policy).markImpaired(venue);
        }
    }

    /// @dev What the venue says the vault owns; a venue whose view reverts falls back to the cost basis.
    function _assetsOf(address venue, uint256 fallbackAmount) private view returns (uint256) {
        try IVenue(venue).assetsOf(vault) returns (uint256 a) {
            return a;
        } catch {
            return fallbackAmount;
        }
    }

    function _setRungs(Rung[] memory rungs) private {
        uint256 n = rungs.length;
        if (n == 0 || n > MAX_RUNGS) revert LadderInvalid();
        for (uint256 i; i < n; ++i) {
            if (rungs[i].maxDeployedBps > BPS) revert LadderInvalid();
            if (i > 0) {
                if (rungs[i].beforeDeadline >= rungs[i - 1].beforeDeadline) revert LadderInvalid();
                if (rungs[i].maxDeployedBps > rungs[i - 1].maxDeployedBps) revert LadderInvalid();
            }
        }
        if (rungs[n - 1].beforeDeadline != 0 || rungs[n - 1].maxDeployedBps != 0) revert LadderInvalid();
        delete _rungs;
        for (uint256 i; i < n; ++i) {
            _rungs.push(rungs[i]);
        }
        emit RungsSet(n);
    }
}
// forge-lint: disable-end
