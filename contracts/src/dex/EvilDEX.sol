// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockDEX} from "./MockDEX.sol";

/// @title EvilDEX
/// @notice Same behaviour and interface as `MockDEX`, but it is never allow-listed in the vault, so the vault
///         must refuse it with `ProtocolNotAllowed` (scenario 4: an agent is tricked into using a rogue DEX).
contract EvilDEX is MockDEX {
    constructor(address council_, address[] memory tokens) MockDEX(council_, tokens) {}
}
