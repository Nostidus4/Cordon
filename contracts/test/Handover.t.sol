// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";
import {MockAllowList} from "./helpers/MockAllowList.sol";
import {MintableToken} from "../src/tokens/MintableToken.sol";

/// @title HandoverTest
/// @notice T15 against the mock precompiles: after the handover the deployer holds no privilege left. The same
///         checks run against the real Subnet-EVM precompiles in the L1 handover script (L1-002, issue #31); this
///         suite only proves the property on the mock and the contract side (vault operator, token minter).
/// @dev Handover as the script does it: Council becomes admin of both AllowLists, then the deployer drops its own
///      admin role; the vault's `topUpOperator` is a separate ops key; token minting moves to the Council.
contract HandoverTest is MayLabsBase {
    PrincipalRegistry internal registry;
    PolicyVault internal vault;
    GuardianCouncil internal gc;
    address internal ops = makeAddr("opsKey");

    function setUp() public override {
        super.setUp();
        // genesis state of the L1: the deployer is admin of both precompiles
        txAllowList.__seedRole(deployer, 2);
        deployerAllowList.__seedRole(deployer, 2);

        uint256 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 2);
        registry = new PrincipalRegistry(predicted);
        vault = new PolicyVault(address(registry), predicted, address(tUSDC), address(dex), ops);
        gc = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault), 0
        );
        assertEq(address(gc), predicted);
    }

    function _handover() internal {
        MockAllowList[2] memory lists = [txAllowList, deployerAllowList];
        for (uint256 i; i < 2; ++i) {
            lists[i].setAdmin(address(gc));
            lists[i].setNone(deployer);
        }
        tUSDC.setMinter(address(gc));
        tTKB.setMinter(address(gc));
        tSCAM.setMinter(address(gc));
    }

    function test_T15_deployerIsPrivilegedBeforeHandover() public view {
        assertEq(txAllowList.readAllowList(deployer), 2);
        assertEq(deployerAllowList.readAllowList(deployer), 2);
        assertEq(tUSDC.minter(), deployer);
    }

    function test_T15_deployerHasNoRoleOnEitherPrecompileAfterHandover() public {
        _handover();
        assertEq(txAllowList.readAllowList(deployer), 0, "tx allowlist");
        assertEq(deployerAllowList.readAllowList(deployer), 0, "deployer allowlist");
        assertEq(txAllowList.readAllowList(address(gc)), 2, "council admin of tx allowlist");
        assertEq(deployerAllowList.readAllowList(address(gc)), 2, "council admin of deployer allowlist");
    }

    function test_T15_deployerCannotChangeAnyRoleAfterHandover() public {
        _handover();
        MockAllowList[2] memory lists = [txAllowList, deployerAllowList];
        for (uint256 i; i < 2; ++i) {
            vm.expectRevert(MockAllowList.CallerNotAdmin.selector);
            lists[i].setAdmin(deployer);
            vm.expectRevert(MockAllowList.CallerNotAdmin.selector);
            lists[i].setEnabled(deployer);
            vm.expectRevert(MockAllowList.CallerNotAdmin.selector);
            lists[i].setNone(address(gc));
        }
    }

    function test_T15_deployerCannotMintOrReclaimMinterAfterHandover() public {
        _handover();
        MintableToken[3] memory tokens = [MintableToken(address(tUSDC)), tTKB, tSCAM];
        for (uint256 i; i < 3; ++i) {
            assertEq(tokens[i].minter(), address(gc));
            vm.expectRevert(MintableToken.NotMinter.selector);
            tokens[i].mint(deployer, 1);
            vm.expectRevert(MintableToken.NotMinter.selector);
            tokens[i].setMinter(deployer);
        }
    }

    function test_T15_vaultAndRegistryAdminAreTheCouncilNotTheDeployer() public {
        _handover();
        assertEq(vault.council(), address(gc));
        assertEq(registry.council(), address(gc));
        assertTrue(vault.topUpOperator() != deployer, "top-up operator must not be the deployer");
        vm.expectRevert(abi.encodeWithSignature("NotCouncil()"));
        vault.lockPrincipal(MINH);
        vm.expectRevert(abi.encodeWithSignature("NotCouncil()"));
        registry.createPrincipal(MINH, "minh");
    }
}
