// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMockVenue} from "../interfaces/IVenue.sol";

/// @title MockVenue
/// @notice Demo yield venue (PAYROLL.md section 2.1): simple interest per `daySeconds`, paid out of a pool the admin
///         funds with `fundYield`, and a `frozen` switch that makes `withdraw` revert. Two instances are deployed
///         (A, B); the demo freezes B. NEVER part of a production whitelist without a 2/3 proposal.
/// @dev Interest accrues on the principal only, settled whenever an account touches the venue, with the rate in
///      force at settlement time applied to the whole elapsed period (deterministic, mirrored by the Python sim).
///      `withdraw` takes principal first, then accrued interest (bounded by the pool), and always pays `msg.sender`.
contract MockVenue is IMockVenue {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    address public immutable override asset;
    address public immutable override admin;
    /// @notice Seconds in one "day" for interest (86400, or the compressed dayUnit on the demo L1).
    uint256 public immutable daySeconds;

    bool public override frozen;
    uint256 public override yieldBpsPerDay;
    /// @notice Tokens set aside to pay interest.
    uint256 public yieldPool;

    mapping(address account => uint256) private _principal;
    mapping(address account => uint256) private _accrued; // settled, not yet paid
    mapping(address account => uint256) private _settledAt;

    constructor(address asset_, address admin_, uint256 daySeconds_) {
        asset = asset_;
        admin = admin_;
        daySeconds = daySeconds_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ----------------------------------------------------------------- views

    function assetsOf(address account) public view override returns (uint256) {
        return _principal[account] + _payableInterest(account);
    }

    function maxWithdraw(address account) external view override returns (uint256) {
        return frozen ? 0 : assetsOf(account);
    }

    function principalOf(address account) external view returns (uint256) {
        return _principal[account];
    }

    // ----------------------------------------------------------------- user

    function deposit(uint256 amount) external override {
        _settle(msg.sender);
        _principal[msg.sender] += amount;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external override returns (uint256 received) {
        if (frozen) revert Frozen();
        _settle(msg.sender);
        uint256 p = _principal[msg.sender];
        if (amount <= p) {
            _principal[msg.sender] = p - amount;
        } else {
            uint256 fromYield = amount - p;
            uint256 owed = _accrued[msg.sender] < yieldPool ? _accrued[msg.sender] : yieldPool;
            if (fromYield > owed) revert InsufficientAssets();
            _principal[msg.sender] = 0;
            _accrued[msg.sender] -= fromYield;
            yieldPool -= fromYield;
        }
        received = amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ----------------------------------------------------------------- admin

    function setFrozen(bool frozen_) external override onlyAdmin {
        frozen = frozen_;
        emit FrozenSet(frozen_);
    }

    function setYieldBpsPerDay(uint256 bps) external override onlyAdmin {
        yieldBpsPerDay = bps;
        emit YieldRateSet(bps);
    }

    function fundYield(uint256 amount) external override onlyAdmin {
        yieldPool += amount;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    // ------------------------------------------------------------- internals

    function _pending(address account) private view returns (uint256) {
        uint256 last = _settledAt[account];
        if (last == 0 || block.timestamp <= last) return 0;
        return _principal[account] * yieldBpsPerDay * (block.timestamp - last) / (BPS * daySeconds);
    }

    function _payableInterest(address account) private view returns (uint256) {
        uint256 total = _accrued[account] + _pending(account);
        return total < yieldPool ? total : yieldPool;
    }

    function _settle(address account) private {
        _accrued[account] += _pending(account);
        _settledAt[account] = block.timestamp;
    }
}
// forge-lint: disable-end
