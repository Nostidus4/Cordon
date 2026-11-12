// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MintableToken} from "./MintableToken.sol";

/// @title TestScam
/// @notice Token that is never allow-listed, tSCAM (18 decimals); used to exercise `TokenNotAllowed`.
contract TestScam is MintableToken("Test Scam", "tSCAM", 18) {}
