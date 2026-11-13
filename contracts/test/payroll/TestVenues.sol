// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVenue} from "../../src/payroll/interfaces/IVenue.sol";
import {IPayrollVault} from "../../src/payroll/interfaces/IPayrollVault.sol";
import {ILadderScheduler} from "../../src/payroll/interfaces/ILadderScheduler.sol";

/// @notice Honest 1:1 pool base used by the misbehaving venues below.
abstract contract PoolVenue is IVenue {
    address public immutable override asset;
    mapping(address account => uint256) internal held;

    constructor(address asset_) {
        asset = asset_;
    }

    function deposit(uint256 amount) external virtual override {
        held[msg.sender] += amount;
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "xfer");
    }

    function assetsOf(address account) external view virtual override returns (uint256) {
        return held[account];
    }

    function maxWithdraw(address account) external view virtual override returns (uint256) {
        return held[account];
    }
}

/// @notice Pays back less than asked without reverting (PAYROLL.md decision 10).
contract HaircutVenue is PoolVenue {
    uint256 public payBps = 9000;

    constructor(address asset_) PoolVenue(asset_) {}

    function setPayBps(uint256 bps) external {
        payBps = bps;
    }

    function withdraw(uint256 amount) external override returns (uint256 received) {
        held[msg.sender] -= amount;
        received = amount * payBps / 10_000;
        require(IERC20(asset).transfer(msg.sender, received), "xfer");
    }
}

/// @notice Tries to re-enter the payroll set from inside `withdraw`; records which attempts were refused.
contract ReentrantVenue is PoolVenue {
    IPayrollVault public vault;
    ILadderScheduler public sched;
    address public thief;
    bool public attacked;
    bool public reenterRecallBlocked;
    bool public reenterFinalizeBlocked;
    bool public payOutBlocked;
    bool public returnReserveBlocked;

    constructor(address asset_) PoolVenue(asset_) {}

    function arm(address vault_, address sched_, address thief_) external {
        vault = IPayrollVault(vault_);
        sched = ILadderScheduler(sched_);
        thief = thief_;
    }

    function withdraw(uint256 amount) external override returns (uint256 received) {
        attacked = true;
        // re-enter through the permissionless doors and the money doors; each must be refused
        try sched.unwindDue(address(this)) returns (uint256) {}
        catch {
            reenterRecallBlocked = true;
        }
        try sched.finalize() returns (uint256, uint256) {}
        catch {
            reenterFinalizeBlocked = true;
        }
        try vault.payOut(thief, amount) {}
        catch {
            payOutBlocked = true;
        }
        try vault.returnReserve(amount) {}
        catch {
            returnReserveBlocked = true;
        }
        held[msg.sender] -= amount;
        received = amount;
        require(IERC20(asset).transfer(msg.sender, amount), "xfer");
    }
}

/// @notice A contract that looks like a venue (accepts a deposit) but was never whitelisted.
contract EvilVenue is PoolVenue {
    constructor(address asset_) PoolVenue(asset_) {}

    function withdraw(uint256) external pure override returns (uint256) {
        return 0;
    }
}
