// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPolicyVault
/// @notice Treasury vault that enforces per-key and per-principal daily caps and allow-lists.
///         Frozen by CTR-001, see docs/spec/CONTRACTS.md section 3.
/// @dev Check order inside `pay` / `swap` is fixed (CONTRACTS.md section 3) and decides the revert reason.
///      Reverted calls emit no event.
interface IPolicyVault {
    // ---------------------------------------------------------------- events
    event Paid(
        address indexed key,
        bytes32 indexed principalId,
        address token,
        address to,
        uint256 amount,
        uint256 day,
        uint256 keySpentAfter,
        uint256 principalSpentAfter,
        bytes32 memoHash
    );
    event Swapped(
        address indexed key,
        bytes32 indexed principalId,
        address dex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 day,
        uint256 keySpentAfter,
        uint256 principalSpentAfter,
        bytes32 reasonHash
    );
    event PrincipalLocked(bytes32 indexed principalId, address by);
    event PrincipalUnlocked(bytes32 indexed principalId);
    event Paused(address by);
    event Unpaused();
    /// @dev kind: 0 key (subject = address left-padded to bytes32), 1 principal (subject = principalId)
    event CapChanged(uint8 kind, bytes32 subject, uint256 oldCap, uint256 newCap);
    /// @dev kind: 0 token, 1 protocol, 2 recipient. subject = address left-padded to bytes32.
    ///      `selector` is only meaningful for kind 1 (protocol) and `bytes4(0)` otherwise.
    event AllowChanged(uint8 kind, bytes32 subject, bytes4 selector, bool allowed);
    event PolicyVersionBumped(uint256 version);
    event TopUpRecorded(bytes32 indexed cChainTxHash, uint256 amount);
    event TopUpOperatorChanged(address oldOperator, address newOperator);

    // ---------------------------------------------------------------- errors
    // Contract-originated reason codes (CONTRACTS.md section 5)
    error VaultPaused();
    error KeyNotRegistered();
    error PrincipalIsLocked();
    error TokenNotAllowed();
    error ProtocolNotAllowed();
    error RecipientNotAllowed();
    error KeyDailyCapExceeded();
    error PrincipalDailyCapExceeded();
    error SlippageTooHigh();
    // Errors without a reason code
    error NotCouncil();
    error NotTopUpOperator();

    // ----------------------------------------------------------------- views
    function registry() external view returns (address);
    function council() external view returns (address);
    function policyVersion() external view returns (uint256);
    function paused() external view returns (bool);
    function principalLocked(bytes32 id) external view returns (bool);
    function keyDailyCap(address key) external view returns (uint256);
    /// @dev 0 means "not set" (no district cap)
    function principalDailyCap(bytes32 id) external view returns (uint256);
    function keySpent(address key, uint256 dayIndex) external view returns (uint256);
    function principalSpent(bytes32 id, uint256 dayIndex) external view returns (uint256);
    function tokenAllowed(address token) external view returns (bool);
    function protocolAllowed(address target, bytes4 selector) external view returns (bool);
    function recipientAllowed(address to) external view returns (bool);
    /// @dev Address allowed to call `recordTopUp` besides the Council. Set in the constructor,
    ///      afterwards changeable only by the Council. Must not be the deployer after handover.
    function topUpOperator() external view returns (address);

    // ------------------------------------------------- spending (msg.sender is the key)
    function pay(address token, address to, uint256 amount, bytes32 memoHash) external;
    function swap(
        address dex,
        bytes4 selector,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        bytes32 reasonHash
    ) external;

    // ------------------------------------------------ administration (Council only)
    /// @dev tightening
    function lockPrincipal(bytes32 id) external;
    /// @dev loosening
    function unlockPrincipal(bytes32 id) external;
    /// @dev tightening
    function pauseAll() external;
    /// @dev loosening
    function unpauseAll() external;
    /// @dev lowering is tightening, raising is loosening
    function setKeyDailyCap(address key, uint256 cap) external;
    /// @dev lowering is tightening, raising (or 0 = unset) is loosening
    function setPrincipalDailyCap(bytes32 id, uint256 cap) external;
    /// @dev removing is tightening, adding is loosening
    function setTokenAllowed(address token, bool allowed) external;
    function setProtocolAllowed(address target, bytes4 selector, bool allowed) external;
    function setRecipientAllowed(address to, bool allowed) external;
    function bumpPolicyVersion() external;
    /// @notice Records a simulated C-Chain top-up. Moves no funds.
    /// @dev Access: the Council contract or the current `topUpOperator`; anyone else reverts
    ///      `NotTopUpOperator`. The deployer holds no privilege here after handover.
    function recordTopUp(bytes32 cChainTxHash, uint256 amount) external;
    /// @notice Council only. Treated as loosening, so it goes through a 2-of-3 proposal.
    ///         Emits `TopUpOperatorChanged`. `address(0)` disables the operator role.
    function setTopUpOperator(address newOperator) external;
}
