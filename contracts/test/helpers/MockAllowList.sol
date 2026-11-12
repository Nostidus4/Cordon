// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockAllowList
/// @notice Unit-test stand-in for the Subnet-EVM AllowList precompiles (Contract Deployer `0x02..00`, Tx `0x02..02`).
///         Install with `vm.etch(addr, address(new MockAllowList()).code)`, one copy per precompile address
///         (each keeps its own storage). Roles: 0 none, 1 enabled, 2 admin (docs/spec/CONTRACTS.md section 1).
/// @dev Like the precompile, only an admin may change roles; bootstrap the first admin with `__seedRole`
///      (a test-only back door with no equivalent on chain, where admins come from the genesis config).
///      `RoleSet` matches the precompile log mapped in docs/spec/CONTRACTS.md section 7. The revert reason differs
///      from the node's string error on purpose: tests should assert `CallerNotAdmin()`.
contract MockAllowList {
    uint256 public constant ROLE_NONE = 0;
    uint256 public constant ROLE_ENABLED = 1;
    uint256 public constant ROLE_ADMIN = 2;

    mapping(address account => uint256 role) private _roles;

    error CallerNotAdmin();

    event RoleSet(uint256 indexed role, address indexed account, address indexed sender, uint256 oldRole);

    function setAdmin(address account) external {
        _set(account, ROLE_ADMIN);
    }

    function setEnabled(address account) external {
        _set(account, ROLE_ENABLED);
    }

    function setNone(address account) external {
        _set(account, ROLE_NONE);
    }

    function readAllowList(address account) external view returns (uint256) {
        return _roles[account];
    }

    /// @dev Test-only: set a role without an admin check and without an event.
    function __seedRole(address account, uint256 role) external {
        _roles[account] = role;
    }

    function _set(address account, uint256 role) private {
        if (_roles[msg.sender] != ROLE_ADMIN) revert CallerNotAdmin();
        uint256 old = _roles[account];
        _roles[account] = role;
        emit RoleSet(role, account, msg.sender, old);
    }
}
