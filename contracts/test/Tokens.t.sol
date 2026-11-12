// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MintableToken} from "../src/tokens/MintableToken.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

contract TokensTest is MayLabsBase {
    address internal stranger = makeAddr("stranger");

    function test_metadata() public view {
        assertEq(tUSDC.symbol(), "tUSDC");
        assertEq(tUSDC.decimals(), 6);
        assertEq(tTKB.symbol(), "tTKB");
        assertEq(tTKB.decimals(), 18);
        assertEq(tSCAM.symbol(), "tSCAM");
        assertEq(tSCAM.decimals(), 18);
    }

    function test_deployer_is_initial_minter_and_can_mint() public {
        assertEq(tUSDC.minter(), deployer);
        tUSDC.mint(stranger, 123);
        assertEq(tUSDC.balanceOf(stranger), 123);
        assertEq(tUSDC.totalSupply(), 123);
    }

    function test_mint_by_non_authorised_reverts() public {
        vm.startPrank(stranger);
        vm.expectRevert(MintableToken.NotMinter.selector);
        tUSDC.mint(stranger, 1);
        vm.expectRevert(MintableToken.NotMinter.selector);
        tTKB.mint(stranger, 1);
        vm.expectRevert(MintableToken.NotMinter.selector);
        tSCAM.mint(stranger, 1);
        vm.stopPrank();
        assertEq(tUSDC.totalSupply(), 0);
    }

    function test_handover_to_council_locks_out_deployer() public {
        tUSDC.setMinter(council);
        assertEq(tUSDC.minter(), council);

        vm.expectRevert(MintableToken.NotMinter.selector);
        tUSDC.mint(deployer, 1);

        vm.prank(council);
        tUSDC.mint(stranger, 5);
        assertEq(tUSDC.balanceOf(stranger), 5);
    }

    function test_setMinter_only_minter_and_emits() public {
        vm.prank(stranger);
        vm.expectRevert(MintableToken.NotMinter.selector);
        tUSDC.setMinter(stranger);

        vm.expectEmit(true, true, false, false, address(tUSDC));
        emit MintableToken.MinterChanged(deployer, council);
        tUSDC.setMinter(council);
    }

    function testFuzz_mint_only_minter(address caller, uint256 amount) public {
        vm.assume(caller != deployer);
        vm.prank(caller);
        vm.expectRevert(MintableToken.NotMinter.selector);
        tTKB.mint(caller, amount);
    }
}
