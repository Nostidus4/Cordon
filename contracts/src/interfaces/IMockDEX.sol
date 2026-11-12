// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IMockDEX
/// @notice Fixed-rate swap venue (`MockDEX`); `EvilDEX` exposes the same interface but is never allow-listed.
///         Frozen by CTR-001, see docs/spec/CONTRACTS.md section 6.
/// @dev Slippage is enforced by the vault (`SlippageTooHigh` on `IPolicyVault`), not by the DEX.
interface IMockDEX {
    error NotCouncil();
    error UnknownPair();

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 amountOut);
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
    /// @dev Council only
    function setRate(address tokenIn, address tokenOut, uint256 numerator, uint256 denominator) external;
}
