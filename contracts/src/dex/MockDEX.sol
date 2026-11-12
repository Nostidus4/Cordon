// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMockDEX} from "../interfaces/IMockDEX.sol";

/// @title MockDEX
/// @notice Fixed-rate swap venue. A rate `num/den` is the value of one unit of `tokenIn` in `tokenOut`
///         (1/1 means "equal value", decimals are converted):
///         `amountOut = amountIn * num * 10^decOut / (den * 10^decIn)`, floored, integers only.
/// @dev Rates are directional: `setRate(a, b, ...)` does not touch `(b, a)`. A pair without a rate reverts
///      `UnknownPair`; `num == 0` or `den == 0` is rejected with `UnknownPair` too (the frozen interface has no
///      dedicated error). The DEX also reverts `SlippageTooHigh` (same selector as the vault's error) when the
///      output is below `minOut`, so a direct caller is protected; the vault repeats the check.
///      The DEX pays out of its own balance: fund it by minting/transferring `tokenOut` to it.
contract MockDEX is IMockDEX, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Rate {
        uint256 numerator;
        uint256 denominator;
    }

    /// @notice Council that may change rates.
    address public immutable council;

    mapping(address tokenIn => mapping(address tokenOut => Rate)) private _rates;

    error SlippageTooHigh();

    event RateSet(address indexed tokenIn, address indexed tokenOut, uint256 numerator, uint256 denominator);
    event Swapped(
        address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );

    /// @param council_ Address allowed to call `setRate`.
    /// @param tokens Tokens that get the default 1:1 (equal value) rate between every ordered pair.
    // forge-lint: disable-next-line(missing-zero-check)
    constructor(address council_, address[] memory tokens) {
        council = council_;
        uint256 n = tokens.length;
        for (uint256 i; i < n; ++i) {
            for (uint256 j; j < n; ++j) {
                if (i != j) _setRate(tokens[i], tokens[j], 1, 1);
            }
        }
    }

    /// @inheritdoc IMockDEX
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minOut) revert SlippageTooHigh();

        // view calls to token decimals only; the function is nonReentrant
        // forge-lint: disable-next-line(reentrancy-events)
        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    /// @inheritdoc IMockDEX
    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        Rate memory r = _rates[tokenIn][tokenOut];
        if (r.denominator == 0) revert UnknownPair();
        uint256 decIn = IERC20Metadata(tokenIn).decimals();
        uint256 decOut = IERC20Metadata(tokenOut).decimals();
        return Math.mulDiv(amountIn, r.numerator * 10 ** decOut, r.denominator * 10 ** decIn);
    }

    /// @inheritdoc IMockDEX
    function setRate(address tokenIn, address tokenOut, uint256 numerator, uint256 denominator) external {
        if (msg.sender != council) revert NotCouncil();
        if (numerator == 0 || denominator == 0) revert UnknownPair();
        _setRate(tokenIn, tokenOut, numerator, denominator);
    }

    /// @notice Current rate for a pair, `(0, 0)` when unset.
    function rateOf(address tokenIn, address tokenOut) external view returns (uint256, uint256) {
        Rate memory r = _rates[tokenIn][tokenOut];
        return (r.numerator, r.denominator);
    }

    function _setRate(address tokenIn, address tokenOut, uint256 numerator, uint256 denominator) private {
        _rates[tokenIn][tokenOut] = Rate(numerator, denominator);
        emit RateSet(tokenIn, tokenOut, numerator, denominator);
    }
}
