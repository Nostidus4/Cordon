// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "../src/interfaces/IPrincipalRegistry.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title VerifySeed
/// @notice Reads the seeded policy back from the chain and fails on any difference: 7 districts, 8 keys with their
///         districts and caps (`huy` has 2), no district cap yet, allow-lists, 200.000 tUSDC in the vault.
///         Read-only (`--rpc-url`, no `--broadcast`). Run it after `Seed`, before `PolicyV2`.
contract VerifySeed is L1Common {
    function run() external view {
        Dep memory d = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        IPrincipalRegistry reg = IPrincipalRegistry(d.registry);
        IPolicyVault vault = IPolicyVault(d.vault);

        string[] memory pIds = strs(seed, ".principals[*].id");
        require(reg.principalIds().length == pIds.length && pIds.length == 7, "FAIL: expected 7 districts");
        for (uint256 i; i < pIds.length; ++i) {
            require(reg.principalExists(toId(pIds[i])), "FAIL: district missing");
            require(vault.principalDailyCap(toId(pIds[i])) == 0, "FAIL: a district cap is set in policy v1");
        }
        string[] memory kPrincipal = strs(seed, ".keys[*].principal_id");
        address[] memory kAddr = addrs(seed, ".keys[*].address");
        uint256[] memory kCap = uints(seed, ".keys[*].daily_cap");
        require(kAddr.length == 8, "FAIL: expected 8 keys");
        for (uint256 i; i < kAddr.length; ++i) {
            require(reg.principalOf(kAddr[i]) == toId(kPrincipal[i]), "FAIL: key in the wrong district");
            require(vault.keyDailyCap(kAddr[i]) == kCap[i], "FAIL: key cap");
        }
        require(reg.keysOf(toId("huy")).length == 2, "FAIL: huy must have 2 keys");
        require(reg.keysOf(toId("minh")).length == 1, "FAIL: minh must have 1 key in policy v1");

        require(vault.tokenAllowed(d.tUSDC) && vault.tokenAllowed(d.tTKB), "FAIL: tUSDC/tTKB not allowed");
        require(!vault.tokenAllowed(d.tSCAM), "FAIL: tSCAM must not be allowed");
        bytes4 sel = bytes4(vm.parseJsonBytes(seed, ".protocols[0].selector"));
        require(vault.protocolAllowed(d.mockDex, sel), "FAIL: MockDEX not allowed");
        require(!vault.protocolAllowed(d.evilDex, sel), "FAIL: EvilDEX must not be allowed");
        address[] memory rAddr = addrs(seed, ".recipients[*].address");
        bool[] memory rAllowed = bools(seed, ".recipients[*].allowed");
        for (uint256 i; i < rAddr.length; ++i) {
            require(vault.recipientAllowed(rAddr[i]) == rAllowed[i], "FAIL: recipient allow-list");
        }
        uint256 funding = vm.parseJsonUint(seed, ".vault_balances.tUSDC");
        require(
            IERC20(d.tUSDC).balanceOf(d.vault) >= funding,
            "FAIL: vault tUSDC balance below the seed funding (a top-up only adds)"
        );

        console.log("VerifySeed: PASS. policyVersion", vault.policyVersion());
        console.log("vault tUSDC (base units)", IERC20(d.tUSDC).balanceOf(d.vault));
    }
}
