// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MintableToken} from "./MintableToken.sol";

/// @title TestUSDC
/// @notice Test stablecoin (6 decimals); the unit all spending caps are measured in.
contract TestUSDC is MintableToken("Test USDC", "tUSDC", 6) {}
