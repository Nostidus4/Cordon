// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMockDEX} from "./interfaces/IMockDEX.sol";
import {IPolicyVault} from "./interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "./interfaces/IPrincipalRegistry.sol";

/// @title PolicyVault
/// @notice Treasury vault enforcing per-key and per-district daily caps and allow-lists on `pay` and `swap`.
///         Mirrors `Backend/src/guardian/chain/sim/{vault,engine}.py`; interface frozen in docs/spec/CONTRACTS.md.
/// @dev Check order (fixed, decides the revert reason): paused, key registered+active, district locked, token(s),
///      protocol (swap) / recipient (pay), key daily cap, district daily cap (when > 0). Counters are updated before
///      any external call; both spend functions are `nonReentrant`. `dayIndex = block.timestamp / 1 days` (UTC).
///      Spend value is in tUSDC base units: `amount` for tUSDC, otherwise `quoteDex.quote(token, tUSDC, amount)`.
///      Admin functions are Council-only; whether a change tightens or loosens is the Council's business.
///      Only the setters needed to drive the spend path were exercised in CTR-004; CTR-005 owns the full admin
///      semantics and tests (lock, pause, `recordTopUp`, ...).
contract PolicyVault is IPolicyVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Constructor guard: a vault without a registry, Council or valuation token cannot work.
    error ZeroAddress();

    /// @dev Memory bundle for the `Swapped` event (keeps `swap` under the stack limit).
    struct SwapLog {
        bytes32 pid;
        address dex;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 day;
        uint256 keySpentAfter;
        uint256 principalSpentAfter;
        bytes32 reasonHash;
    }

    address public immutable registry;
    address public immutable council;
    /// @notice Token in which caps are expressed (tUSDC).
    address public immutable valueToken;
    /// @notice DEX whose `quote` converts non-`valueToken` amounts into `valueToken` for cap accounting.
    address public immutable quoteDex;

    uint256 public policyVersion = 1;
    bool public paused;
    address public topUpOperator;

    mapping(bytes32 id => bool) public principalLocked;
    mapping(address key => uint256) public keyDailyCap;
    /// @dev 0 = not set (no shared cap).
    mapping(bytes32 id => uint256) public principalDailyCap;
    mapping(address key => mapping(uint256 day => uint256)) public keySpent;
    mapping(bytes32 id => mapping(uint256 day => uint256)) public principalSpent;
    mapping(address token => bool) public tokenAllowed;
    mapping(address target => mapping(bytes4 selector => bool)) public protocolAllowed;
    mapping(address to => bool) public recipientAllowed;

    modifier onlyCouncil() {
        if (msg.sender != council) revert NotCouncil();
        _;
    }

    // forge-lint: disable-next-line(missing-zero-check)
    constructor(address registry_, address council_, address valueToken_, address quoteDex_, address topUpOperator_) {
        if (registry_ == address(0) || council_ == address(0) || valueToken_ == address(0)) revert ZeroAddress();
        registry = registry_;
        council = council_;
        valueToken = valueToken_;
        quoteDex = quoteDex_;
        topUpOperator = topUpOperator_;
    }

    // ------------------------------------------------------------ spend path

    /// @inheritdoc IPolicyVault
    function pay(address token, address to, uint256 amount, bytes32 memoHash) external nonReentrant {
        bytes32 pid = _requireActiveKey();
        if (!tokenAllowed[token]) revert TokenNotAllowed();
        if (!recipientAllowed[to]) revert RecipientNotAllowed();

        (uint256 day, uint256 ks, uint256 ps) = _charge(pid, _value(token, amount));

        emit Paid(msg.sender, pid, token, to, amount, day, ks, ps, memoHash);
        IERC20(token).safeTransfer(to, amount);
    }

    /// @inheritdoc IPolicyVault
    function swap(
        address dex,
        bytes4 selector,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        bytes32 reasonHash
    ) external nonReentrant {
        bytes32 pid = _requireActiveKey();
        if (!tokenAllowed[tokenIn] || !tokenAllowed[tokenOut]) revert TokenNotAllowed();
        if (!protocolAllowed[dex][selector]) revert ProtocolNotAllowed();

        SwapLog memory l;
        l.pid = pid;
        l.dex = dex;
        l.tokenIn = tokenIn;
        l.tokenOut = tokenOut;
        l.amountIn = amountIn;
        l.reasonHash = reasonHash;
        (l.day, l.keySpentAfter, l.principalSpentAfter) = _charge(pid, _value(tokenIn, amountIn));
        l.amountOut = _executeSwap(dex, selector, tokenIn, tokenOut, amountIn, minOut);

        _emitSwapped(l);
    }

    // ------------------------------------------------- admin (Council only)

    function lockPrincipal(bytes32 id) external onlyCouncil {
        principalLocked[id] = true;
        emit PrincipalLocked(id, msg.sender);
    }

    function unlockPrincipal(bytes32 id) external onlyCouncil {
        principalLocked[id] = false;
        emit PrincipalUnlocked(id);
    }

    function pauseAll() external onlyCouncil {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpauseAll() external onlyCouncil {
        paused = false;
        emit Unpaused();
    }

    function setKeyDailyCap(address key, uint256 cap) external onlyCouncil {
        emit CapChanged(0, bytes32(uint256(uint160(key))), keyDailyCap[key], cap);
        keyDailyCap[key] = cap;
    }

    function setPrincipalDailyCap(bytes32 id, uint256 cap) external onlyCouncil {
        emit CapChanged(1, id, principalDailyCap[id], cap);
        principalDailyCap[id] = cap;
    }

    function setTokenAllowed(address token, bool allowed) external onlyCouncil {
        tokenAllowed[token] = allowed;
        emit AllowChanged(0, bytes32(uint256(uint160(token))), bytes4(0), allowed);
    }

    function setProtocolAllowed(address target, bytes4 selector, bool allowed) external onlyCouncil {
        protocolAllowed[target][selector] = allowed;
        emit AllowChanged(1, bytes32(uint256(uint160(target))), selector, allowed);
    }

    function setRecipientAllowed(address to, bool allowed) external onlyCouncil {
        recipientAllowed[to] = allowed;
        emit AllowChanged(2, bytes32(uint256(uint160(to))), bytes4(0), allowed);
    }

    function bumpPolicyVersion() external onlyCouncil {
        emit PolicyVersionBumped(++policyVersion);
    }

    function recordTopUp(bytes32 cChainTxHash, uint256 amount) external {
        if (msg.sender != council && msg.sender != topUpOperator) revert NotTopUpOperator();
        emit TopUpRecorded(cChainTxHash, amount);
    }

    // forge-lint: disable-next-line(missing-zero-check)
    function setTopUpOperator(address newOperator) external onlyCouncil {
        emit TopUpOperatorChanged(topUpOperator, newOperator);
        topUpOperator = newOperator;
    }

    // ------------------------------------------------------------ internals

    /// @dev Checks 1-3: not paused, caller is a registered and active key, its district is not locked.
    function _requireActiveKey() private view returns (bytes32 pid) {
        if (paused) revert VaultPaused();
        bool active;
        // kind and label are not needed here
        // forge-lint: disable-next-line(unused-return)
        (pid,, active,) = IPrincipalRegistry(registry).keyInfo(msg.sender);
        if (pid == bytes32(0) || !active) revert KeyNotRegistered();
        if (principalLocked[pid]) revert PrincipalIsLocked();
    }

    /// @dev Checks 6-8: caps, then bump both counters (effects before any external call).
    function _charge(bytes32 pid, uint256 value) private returns (uint256 day, uint256 ks, uint256 ps) {
        day = block.timestamp / 1 days;
        ks = keySpent[msg.sender][day] + value;
        if (ks > keyDailyCap[msg.sender]) revert KeyDailyCapExceeded();
        ps = principalSpent[pid][day] + value;
        uint256 cap = principalDailyCap[pid];
        if (cap > 0 && ps > cap) revert PrincipalDailyCapExceeded();
        keySpent[msg.sender][day] = ks;
        principalSpent[pid][day] = ps;
    }

    /// @dev Checks 9: DEX call. The output stays in the vault; measure what actually arrived instead of trusting the
    ///      DEX's return value. The selector is the allow-listed one; arguments follow `IMockDEX.swapExactIn`.
    function _executeSwap(
        address dex,
        bytes4 selector,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut
    ) private returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(dex, amountIn);
        // counters are already updated and `nonReentrant` is held, so re-entry cannot observe stale state
        // forge-lint: disable-next-line(reentrancy-no-eth)
        (bool ok, bytes memory ret) = dex.call(abi.encodeWithSelector(selector, tokenIn, tokenOut, amountIn, minOut));
        if (!ok) _bubble(ret);
        IERC20(tokenIn).forceApprove(dex, 0);
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balanceBefore;
        if (amountOut < minOut) revert SlippageTooHigh();
    }

    function _emitSwapped(SwapLog memory l) private {
        // `nonReentrant` is held; the event needs `amountOut`, known only after the DEX call.
        // forge-lint: disable-start(reentrancy-events)
        emit Swapped(
            msg.sender,
            l.pid,
            l.dex,
            l.tokenIn,
            l.tokenOut,
            l.amountIn,
            l.amountOut,
            l.day,
            l.keySpentAfter,
            l.principalSpentAfter,
            l.reasonHash
        );
        // forge-lint: disable-end(reentrancy-events)
    }

    /// @dev Value of `amount` of `token` in `valueToken` base units.
    function _value(address token, uint256 amount) private view returns (uint256) {
        if (token == valueToken) return amount;
        return IMockDEX(quoteDex).quote(token, valueToken, amount);
    }

    function _bubble(bytes memory ret) private pure {
        assembly ("memory-safe") {
            revert(add(ret, 0x20), mload(ret))
        }
    }
}
