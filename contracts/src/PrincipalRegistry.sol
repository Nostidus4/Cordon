// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPrincipalRegistry, KeyInfo, KeyKind} from "./interfaces/IPrincipalRegistry.sol";

/// @title PrincipalRegistry
/// @notice Maps spending keys to principals ("districts"). Writable only by the Council (immutable, set at
///         construction). Mirrors `Backend/src/guardian/chain/sim/registry.py`.
/// @dev The Council decides which writes are loosening or tightening; this contract only checks the caller.
///      Deactivated keys stay in their principal's key list (`keysOf`) and keep their `principalId`.
contract PrincipalRegistry is IPrincipalRegistry {
    /// @notice Raised by `moveKey` / `deactivateKey` for a key that was never added (same reason as the sim).
    /// @dev Not part of the frozen `IPrincipalRegistry`; the vault declares the same error for unregistered spenders.
    error KeyNotRegistered();

    /// @notice Constructor guard: a registry without a Council could never be written.
    error ZeroCouncil();

    address public immutable council;

    mapping(address key => KeyInfo) private _keyInfo;
    /// @dev Position of the key inside `_keys[principalId]`.
    mapping(address key => uint256) private _keyIndex;
    mapping(address key => bool) private _registered;
    mapping(bytes32 id => bool) private _exists;
    mapping(bytes32 id => address[]) private _keys;
    bytes32[] private _principalIds;

    modifier onlyCouncil() {
        if (msg.sender != council) revert NotCouncil();
        _;
    }

    constructor(address council_) {
        if (council_ == address(0)) revert ZeroCouncil();
        council = council_;
    }

    // ----------------------------------------------------------------- views

    function keyInfo(address key)
        external
        view
        returns (bytes32 principalId, KeyKind kind, bool active, string memory label)
    {
        KeyInfo storage info = _keyInfo[key];
        return (info.principalId, info.kind, info.active, info.label);
    }

    function principalExists(bytes32 id) external view returns (bool) {
        return _exists[id];
    }

    function principalOf(address key) external view returns (bytes32) {
        return _keyInfo[key].principalId;
    }

    function keysOf(bytes32 id) external view returns (address[] memory) {
        return _keys[id];
    }

    function principalIds() external view returns (bytes32[] memory) {
        return _principalIds;
    }

    // ---------------------------------------------------------- writes (Council only)

    function createPrincipal(bytes32 id, string calldata label) external onlyCouncil {
        if (_exists[id]) revert PrincipalExists();
        _exists[id] = true;
        _principalIds.push(id);
        emit PrincipalCreated(id, label);
    }

    function addKey(bytes32 id, address key, KeyKind kind, string calldata label) external onlyCouncil {
        if (!_exists[id]) revert PrincipalNotFound();
        if (_registered[key]) revert KeyAlreadyRegistered();
        _registered[key] = true;
        _keyInfo[key] = KeyInfo({principalId: id, kind: kind, active: true, label: label});
        _keyIndex[key] = _keys[id].length;
        _keys[id].push(key);
        emit KeyAdded(id, key, kind, label);
    }

    function moveKey(address key, bytes32 toId) external onlyCouncil {
        if (!_registered[key]) revert KeyNotRegistered();
        if (!_exists[toId]) revert PrincipalNotFound();
        bytes32 fromId = _keyInfo[key].principalId;

        // swap-and-pop out of the old list
        address[] storage fromKeys = _keys[fromId];
        uint256 idx = _keyIndex[key];
        address last = fromKeys[fromKeys.length - 1];
        fromKeys[idx] = last;
        _keyIndex[last] = idx;
        fromKeys.pop();

        // append to the new list (a move to the same principal ends up last, like the sim)
        _keyIndex[key] = _keys[toId].length;
        _keys[toId].push(key);
        _keyInfo[key].principalId = toId;
        emit KeyMoved(key, fromId, toId);
    }

    function deactivateKey(address key) external onlyCouncil {
        if (!_registered[key]) revert KeyNotRegistered();
        _keyInfo[key].active = false;
        emit KeyDeactivated(key);
    }
}
