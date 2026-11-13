// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAllowList
/// @notice Subnet-EVM AllowList precompile (Contract Deployer `0x02..00`, Tx `0x02..02`), verified against v0.8.0
///         (docs/spec/CONTRACTS.md section 1, contracts/genesis/README.md). Roles: 0 none, 1 enabled, 2 admin,
///         3 manager (`setManager` exists in v0.8.0 but the Council never calls it).
/// @dev Declared here, not in the frozen interfaces: the precompile is not our contract and is not in the ABI set.
interface IAllowList {
    function setAdmin(address addr) external;
    function setEnabled(address addr) external;
    function setNone(address addr) external;
    function readAllowList(address addr) external view returns (uint256 role);
}
