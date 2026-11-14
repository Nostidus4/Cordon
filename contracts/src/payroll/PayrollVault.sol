// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Time is the point of this contract set (ladder, deadline, payday) and a validator skew of seconds cannot move a
// day-scale rule; loops are over the at most 8 policy venues or 10 payees; every external call goes to an
// immutable counterpart of the set or to a venue through a guarded path (PAYROLL.md section 2).
// forge-lint: disable-start(block-timestamp, calls-loop, missing-events-access-control, missing-events-arithmetic, missing-zero-check, non-reentrant-not-first, reentrancy-events, reentrancy-no-eth, require-revert-in-loop, uninitialized-local, unused-return, unsafe-typecast)

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IFloatPolicy} from "./interfaces/IFloatPolicy.sol";
import {IPayrollVault, Payee} from "./interfaces/IPayrollVault.sol";
import {IVenue} from "./interfaces/IVenue.sol";

/// @notice Policy extension read by the vault: the venue list (not part of the frozen `IFloatPolicy`).
interface IFloatPolicyVenues {
    function venues() external view returns (address[] memory);
}

/// @title PayrollVault
/// @notice Holds the month's payroll money (PAYROLL.md section 2.2). Token can only leave through four doors:
///         `deployToVenue` (whitelisted venue, policy-checked), `payOut` (roster member, exact amount, once per
///         cycle), `returnReserve` / `withdrawSurplus` (the immutable `treasury`, 2/3 only). No function takes a
///         free recipient. A venue that fails never blocks the others: `recallFromVenue` catches it.
/// @dev Wiring is acyclic by prediction: vault, policy, scheduler, executor and governor are deployed in that order
///      from one deployer and each is told the others' addresses up front (see `DeployPayroll.s.sol`).
contract PayrollVault is IPayrollVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PAYEES = 10;

    /// @dev Addresses of the other four contracts of the set plus the only external recipient of surplus.
    struct Wiring {
        address governor;
        address policy;
        address scheduler;
        address executor;
        address treasury;
    }

    address public immutable override token;
    address public immutable override governor;
    address public immutable override policy;
    address public immutable override scheduler;
    address public immutable override executor;
    address public immutable override treasury;

    uint256 public override cycleId;
    uint256 public override payday;
    bool public override paid;
    uint256 public override payrollTotal;
    uint256 public override principal;
    uint256 public override reserve;
    uint256 public override deployedTotal;
    uint256 public override yieldRealized;
    mapping(address venue => uint256) public override deployed;
    mapping(address account => bool) public override isPayee;

    Payee[] private _roster;
    mapping(uint256 cycle => mapping(address account => bool)) private _paidOut;

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    modifier onlyScheduler() {
        if (msg.sender != scheduler) revert NotScheduler();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    constructor(address token_, Wiring memory w, uint256 payday_, Payee[] memory roster_) {
        if (
            token_ == address(0) || w.governor == address(0) || w.policy == address(0) || w.scheduler == address(0)
                || w.executor == address(0) || w.treasury == address(0)
        ) revert ZeroAddress();
        token = token_;
        governor = w.governor;
        policy = w.policy;
        scheduler = w.scheduler;
        executor = w.executor;
        treasury = w.treasury;
        cycleId = 1;
        payday = payday_;
        _setRoster(roster_);
        emit CycleStarted(1, payday_);
        emit RosterSet(roster_.length, payrollTotal);
    }

    // ------------------------------------------------------------------ views

    function idle() public view override returns (uint256) {
        return IERC20(token).balanceOf(address(this)) - reserve;
    }

    function venueList() external view override returns (address[] memory) {
        return IFloatPolicyVenues(policy).venues();
    }

    function payeeCount() external view override returns (uint256) {
        return _roster.length;
    }

    function payeeAt(uint256 i) external view override returns (address account, uint256 amount) {
        Payee storage p = _roster[i];
        return (p.account, p.amount);
    }

    // ----------------------------------------------- deposits: anyone, inflow only

    function deposit(uint256 amount) external override nonReentrant {
        if (paid) revert AlreadyPaid();
        principal += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, principal);
    }

    function fundReserve(uint256 amount) external override nonReentrant {
        reserve += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(msg.sender, amount, reserve);
    }

    // ------------------------------------------------------------ scheduler only

    function deployToVenue(address venue, uint256 amount) external override onlyScheduler nonReentrant {
        IFloatPolicy(policy).assertCanDeploy(venue, amount);
        deployed[venue] += amount;
        deployedTotal += amount;
        IERC20(token).forceApprove(venue, amount);
        IVenue(venue).deposit(amount);
        IERC20(token).forceApprove(venue, 0);
        emit Deployed(venue, amount, deployedTotal, idle());
    }

    function recallFromVenue(address venue, uint256 amount)
        external
        override
        onlyScheduler
        nonReentrant
        returns (uint256 received)
    {
        uint256 before = IERC20(token).balanceOf(address(this));
        // A venue that reverts or is frozen must not block the others: report and move on.
        try IVenue(venue).withdraw(amount) returns (uint256) {}
        catch {
            emit RecallFailed(venue, amount);
            return 0;
        }
        received = IERC20(token).balanceOf(address(this)) - before;
        uint256 cost = deployed[venue];
        uint256 principalPart = received < cost ? received : cost;
        deployed[venue] = cost - principalPart;
        deployedTotal -= principalPart;
        uint256 yieldPart = received - principalPart;
        yieldRealized += yieldPart;
        if (received < amount) emit Haircut(venue, amount, received);
        emit Recalled(venue, amount, received, principalPart, yieldPart);
    }

    function releaseReserve(uint256 amount) external override onlyScheduler {
        if (amount > reserve) revert InsufficientIdle();
        reserve -= amount;
        emit ReserveReleased(amount, reserve);
    }

    // ------------------------------------------------------------- executor only

    function payOut(address to, uint256 amount) external override onlyExecutor nonReentrant {
        if (paid) revert AlreadyPaid();
        if (!isPayee[to]) revert NotPayee();
        if (_paidOut[cycleId][to]) revert AlreadyPaid();
        if (amount != _rosterAmount(to)) revert RosterInvalid();
        _paidOut[cycleId][to] = true;
        IERC20(token).safeTransfer(to, amount);
        emit PaidOut(to, amount, cycleId);
    }

    function markPaid() external override onlyExecutor {
        if (paid) revert AlreadyPaid();
        paid = true;
    }

    // ------------------------------------------------------- governance (2/3 / tighten)

    /// @dev Loosening (changes who or how much is paid). Locked from the deadline; coverage is re-checked.
    function setRoster(Payee[] calldata roster) external override onlyGovernor {
        _requireUnlocked();
        _setRoster(roster);
        IFloatPolicy(policy).assertCoverage();
        emit RosterSet(roster.length, payrollTotal);
    }

    /// @dev Tightening: money stays in the vault.
    function removePayee(address account) external override onlyGovernor {
        _requireUnlocked();
        if (!isPayee[account]) revert NotPayee();
        uint256 n = _roster.length;
        for (uint256 i; i < n; ++i) {
            if (_roster[i].account == account) {
                payrollTotal -= _roster[i].amount;
                _roster[i] = _roster[n - 1];
                _roster.pop();
                break;
            }
        }
        isPayee[account] = false;
        emit PayeeRemoved(account, payrollTotal);
    }

    /// @dev A new cycle starts only after payday was paid and every venue position is back. The old roster carries
    ///      over; leftovers of the closed cycle are not counted as `principal` (take them out with
    ///      `withdrawSurplus`). The kill switch is not reset here: a proposal lists `resetKill` next to it.
    function startCycle(uint256 newPayday) external override onlyGovernor {
        if (!paid || deployedTotal != 0) revert CycleNotSettled();
        if (newPayday <= block.timestamp + IFloatPolicy(policy).deadlineLead()) revert CycleNotSettled();
        ++cycleId;
        payday = newPayday;
        paid = false;
        principal = 0;
        emit CycleStarted(cycleId, newPayday);
    }

    function returnReserve(uint256 amount) external override onlyGovernor nonReentrant {
        if (amount > reserve) revert InsufficientIdle();
        reserve -= amount;
        IERC20(token).safeTransfer(treasury, amount);
        IFloatPolicy(policy).assertCoverage();
        emit ReserveReturned(amount);
    }

    function withdrawSurplus(uint256 amount) external override onlyGovernor nonReentrant {
        if (!paid) revert CycleNotSettled();
        if (amount > idle()) revert InsufficientIdle();
        IERC20(token).safeTransfer(treasury, amount);
        emit SurplusWithdrawn(amount);
    }

    // ------------------------------------------------------------- internals

    function _requireUnlocked() private view {
        if (block.timestamp >= IFloatPolicy(policy).deadline()) revert RosterLocked();
    }

    function _rosterAmount(address account) private view returns (uint256) {
        uint256 n = _roster.length;
        for (uint256 i; i < n; ++i) {
            if (_roster[i].account == account) return _roster[i].amount;
        }
        return 0;
    }

    function _setRoster(Payee[] memory roster) private {
        if (roster.length > MAX_PAYEES) revert RosterTooLarge();
        uint256 old = _roster.length;
        for (uint256 i; i < old; ++i) {
            isPayee[_roster[i].account] = false;
        }
        delete _roster;
        uint256 total;
        for (uint256 i; i < roster.length; ++i) {
            address a = roster[i].account;
            uint256 amt = roster[i].amount;
            if (a == address(0) || amt == 0 || isPayee[a]) revert RosterInvalid();
            isPayee[a] = true;
            _roster.push(Payee(a, amt));
            total += amt;
        }
        payrollTotal = total;
    }
}
// forge-lint: disable-end
