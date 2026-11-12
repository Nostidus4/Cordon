// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MintableToken} from "./MintableToken.sol";

/// @title TestTokenB
/// @notice Second approved test token, tTKB (18 decimals); worth 1 tUSDC on the mock DEX.
contract TestTokenB is MintableToken("Test Token B", "tTKB", 18) {}
