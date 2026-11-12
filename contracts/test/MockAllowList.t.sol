// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockAllowList} from "./helpers/MockAllowList.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

contract MockAllowListTest is MayLabsBase {
    function test_installed_at_both_precompile_addresses() public view {
        assertGt(TX_ALLOWLIST.code.length, 0);
        assertGt(CONTRACT_DEPLOYER_ALLOWLIST.code.length, 0);
        assertEq(txAllowList.readAllowList(council), 2);
        assertEq(deployerAllowList.readAllowList(council), 2);
    }

    function test_setNone_then_read_is_zero() public {
        vm.startPrank(council);
        txAllowList.setEnabled(KEY_AGENT_DATA);
        assertEq(txAllowList.readAllowList(KEY_AGENT_DATA), 1);
        txAllowList.setNone(KEY_AGENT_DATA);
        vm.stopPrank();
        assertEq(txAllowList.readAllowList(KEY_AGENT_DATA), 0);
    }

    function test_setEnabled_sets_1_and_setAdmin_sets_2() public {
        vm.startPrank(council);
        txAllowList.setEnabled(KEY_MINH);
        assertEq(txAllowList.readAllowList(KEY_MINH), 1);
        txAllowList.setAdmin(KEY_MINH);
        assertEq(txAllowList.readAllowList(KEY_MINH), 2);
        vm.stopPrank();
    }

    function test_unknown_address_reads_none() public view {
        assertEq(txAllowList.readAllowList(STRANGER_WALLET), 0);
    }

    function test_non_admin_cannot_change_roles() public {
        vm.expectRevert(MockAllowList.CallerNotAdmin.selector); // the deployer is not an admin
        txAllowList.setEnabled(KEY_MINH);

        vm.prank(council);
        txAllowList.setEnabled(KEY_MINH);
        vm.prank(KEY_MINH); // Enabled is not Admin
        vm.expectRevert(MockAllowList.CallerNotAdmin.selector);
        txAllowList.setNone(KEY_LAN);
    }

    function test_emits_RoleSet_with_old_role() public {
        vm.startPrank(council);
        txAllowList.setEnabled(KEY_MINH);

        vm.expectEmit(true, true, true, true, TX_ALLOWLIST);
        emit MockAllowList.RoleSet(0, KEY_MINH, council, 1);
        txAllowList.setNone(KEY_MINH);
        vm.stopPrank();
    }

    function test_the_two_precompiles_have_independent_storage() public {
        vm.prank(council);
        txAllowList.setEnabled(KEY_MINH);
        assertEq(txAllowList.readAllowList(KEY_MINH), 1);
        assertEq(deployerAllowList.readAllowList(KEY_MINH), 0);
    }

    function testFuzz_last_write_wins(address account, uint8 a, uint8 b) public {
        vm.assume(account != council);
        vm.startPrank(council);
        _apply(account, a);
        _apply(account, b);
        vm.stopPrank();
        assertEq(txAllowList.readAllowList(account), uint256(b % 3));
    }

    function _apply(address account, uint8 which) private {
        uint8 w = which % 3;
        if (w == 0) txAllowList.setNone(account);
        else if (w == 1) txAllowList.setEnabled(account);
        else txAllowList.setAdmin(account);
    }
}
