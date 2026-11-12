// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Kind of key held by a principal (district).
enum KeyKind {
    HUMAN,
    AGENT,
    SERVICE
}

struct KeyInfo {
    bytes32 principalId;
    KeyKind kind;
    bool active;
    string label;
}

/// @title IPrincipalRegistry
/// @notice Maps spending keys to principals ("districts"). Frozen by CTR-001, see docs/spec/CONTRACTS.md section 2.
/// @dev `principalId` is the ASCII id right-padded with zero bytes (`"minh"` -> `0x6d696e68000...`).
interface IPrincipalRegistry {
    // ---------------------------------------------------------------- events
    event PrincipalCreated(bytes32 indexed id, string label);
    event KeyAdded(bytes32 indexed id, address indexed key, KeyKind kind, string label);
    event KeyMoved(address indexed key, bytes32 indexed fromId, bytes32 indexed toId);
    event KeyDeactivated(address indexed key);

    // ---------------------------------------------------------------- errors
    error NotCouncil();
    error KeyAlreadyRegistered();
    error PrincipalNotFound();
    error PrincipalExists();

    // ----------------------------------------------------------------- views
    function council() external view returns (address);
    function keyInfo(address key)
        external
        view
        returns (bytes32 principalId, KeyKind kind, bool active, string memory label);
    function principalExists(bytes32 id) external view returns (bool);
    function principalOf(address key) external view returns (bytes32);
    function keysOf(bytes32 id) external view returns (address[] memory);
    function principalIds() external view returns (bytes32[] memory);

    // ---------------------------------------------------------- writes (Council only)
    /// @dev loosening
    function createPrincipal(bytes32 id, string calldata label) external;
    /// @dev loosening; reverts `KeyAlreadyRegistered` if the key already belongs to a principal
    function addKey(bytes32 id, address key, KeyKind kind, string calldata label) external;
    /// @dev loosening
    function moveKey(address key, bytes32 toId) external;
    /// @dev tightening
    function deactivateKey(address key) external;
}
