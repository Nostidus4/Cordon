// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";

/// @notice Shared plumbing of the L1 scripts (L1-002): the deployments file, the seed file and the two precompiles.
/// @dev Inputs are JSON files, never keys: the seed is `Backend/seed/may_labs.json` with the key and Council
///      addresses of the target network (`infra/l1/local_env.py` writes it for the local L1). Private keys come
///      from the environment of the shell that runs `forge script` (`DEPLOYER_PK`, `L1_KEY_COUNCIL_*`) and are
///      never written anywhere by these scripts.
///      Writes to the AllowList precompiles need `simulateAllowLists()` first (see there); reads go through
///      `vm.rpc` (a real `eth_call`), because the simulation cannot run the precompile.
abstract contract L1Common is Script {
    address internal constant DEPLOYER_ALLOWLIST = 0x0200000000000000000000000000000000000000;
    address internal constant TX_ALLOWLIST = 0x0200000000000000000000000000000000000002;

    /// @dev Deployed addresses, as written by `Deploy.s.sol`.
    struct Dep {
        address registry;
        address vault;
        address council;
        address mockDex;
        address evilDex;
        address tUSDC;
        address tTKB;
        address tSCAM;
    }

    function seedPath() internal view returns (string memory) {
        return vm.envOr("SEED_FILE", string("../Backend/seed/may_labs.json"));
    }

    /// @dev `NETWORK=local` (default) -> local-l1.json, `NETWORK=fuji` -> fuji-l1.json; `DEPLOYMENTS_OUT` overrides.
    function deploymentsPath() internal view returns (string memory) {
        string memory network = vm.envOr("NETWORK", string("local"));
        return vm.envOr("DEPLOYMENTS_OUT", string.concat("../Backend/deployments/", network, "-l1.json"));
    }

    function loadDeployment() internal view returns (Dep memory d) {
        string memory j = vm.readFile(deploymentsPath());
        d.registry = vm.parseJsonAddress(j, ".contracts.registry");
        d.vault = vm.parseJsonAddress(j, ".contracts.vault");
        d.council = vm.parseJsonAddress(j, ".contracts.council");
        d.mockDex = vm.parseJsonAddress(j, ".contracts.mockDex");
        d.evilDex = vm.parseJsonAddress(j, ".contracts.evilDex");
        d.tUSDC = vm.parseJsonAddress(j, ".contracts.tUSDC");
        d.tTKB = vm.parseJsonAddress(j, ".contracts.tTKB");
        d.tSCAM = vm.parseJsonAddress(j, ".contracts.tSCAM");
    }

    // `[*]` paths return all matches as one array; the typed `parseJson*Array` cheatcodes reject them.
    function strs(string memory j, string memory path) internal pure returns (string[] memory) {
        return abi.decode(vm.parseJson(j, path), (string[]));
    }

    function addrs(string memory j, string memory path) internal pure returns (address[] memory) {
        return abi.decode(vm.parseJson(j, path), (address[]));
    }

    function uints(string memory j, string memory path) internal pure returns (uint256[] memory) {
        return abi.decode(vm.parseJson(j, path), (uint256[]));
    }

    function bools(string memory j, string memory path) internal pure returns (bool[] memory) {
        return abi.decode(vm.parseJson(j, path), (bool[]));
    }

    function blobs(string memory j, string memory path) internal pure returns (bytes[] memory) {
        return abi.decode(vm.parseJson(j, path), (bytes[]));
    }

    function toId(string memory s) internal pure returns (bytes32) {
        return bytes32(bytes(s));
    }

    function toKind(string memory s) internal pure returns (KeyKind) {
        bytes32 h = keccak256(bytes(s));
        if (h == keccak256("HUMAN")) return KeyKind.HUMAN;
        if (h == keccak256("AGENT")) return KeyKind.AGENT;
        if (h == keccak256("SERVICE")) return KeyKind.SERVICE;
        revert("seed: unknown key kind");
    }

    function pkOf(string memory seedId) internal view returns (uint256) {
        return vm.envUint(string.concat("L1_KEY_", _upper(seedId)));
    }

    /// @dev Council member address by position (trang, lan, huy) as the seed lists them.
    function memberAt(string memory seed, uint256 i) internal pure returns (address) {
        return vm.parseJsonAddress(seed, string.concat(".council[", vm.toString(i), "].address"));
    }

    /// @notice `readAllowList(addr)` on a precompile through a real `eth_call` (needs `--rpc-url`).
    function roleOf(address list, address who) internal returns (uint256) {
        bytes memory data = abi.encodeWithSignature("readAllowList(address)", who);
        string memory params =
            string.concat('[{"to":"', vm.toString(list), '","data":"', vm.toString(data), '"},"latest"]');
        return abi.decode(vm.rpc("eth_call", params), (uint256));
    }

    /// @dev Subnet-EVM reports the precompile addresses with placeholder code (`0x01`), so forge's local simulation
    ///      of a call into them dies with `StackUnderflow`. Replace the code with a bare `STOP` in the simulation
    ///      only (`vm.etch` is never broadcast): the call then succeeds locally, and the real node executes the real
    ///      precompile when the transaction is sent.
    function simulateAllowLists() internal {
        vm.etch(TX_ALLOWLIST, hex"00");
        vm.etch(DEPLOYER_ALLOWLIST, hex"00");
    }

    /// @dev Write to a precompile; `signature` is `setAdmin(address)`, `setEnabled(address)` or `setNone(address)`.
    function setRole(address list, string memory signature, address who) internal {
        (bool ok,) = list.call(abi.encodeWithSignature(signature, who));
        require(ok, "allowlist call failed");
    }

    function _upper(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i; i < b.length; ++i) {
            if (b[i] >= 0x61 && b[i] <= 0x7a) b[i] = bytes1(uint8(b[i]) - 32);
        }
        return string(b);
    }
}
