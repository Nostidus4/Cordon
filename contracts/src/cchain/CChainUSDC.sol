// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MintableToken} from "../tokens/MintableToken.sol";

/// @title CChainUSDC
/// @notice Test stablecoin of the C-Chain side (OPS-002): the company treasury token. 6 decimals, the same as the
///         L1 `TestUSDC`, so an amount means the same on both chains. Testnet only, never a real USDC.
/// @dev Reuses the `MintableToken` minter model: the deployer mints the treasury once and hands the minter role to
///      the multisig (`setMinter`), after which only the multisig can mint more.
contract CChainUSDC is MintableToken("Test USDC (C-Chain)", "tUSDC", 6) {}
