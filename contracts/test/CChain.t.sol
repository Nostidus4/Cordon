// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CChainUSDC} from "../src/cchain/CChainUSDC.sol";
import {SimpleMultisig} from "../src/cchain/SimpleMultisig.sol";
import {MintableToken} from "../src/tokens/MintableToken.sol";

contract SimpleMultisigTest is Test {
    SimpleMultisig internal safe;
    CChainUSDC internal token;
    address[] internal owners;
    address internal stranger = makeAddr("stranger");
    address internal escrow = makeAddr("escrow");

    function setUp() public {
        for (uint256 i; i < 5; ++i) {
            owners.push(makeAddr(string.concat("owner", vm.toString(i))));
        }
        safe = new SimpleMultisig(owners, 3);
        token = new CChainUSDC();
        token.mint(address(safe), 2_000_000e6);
        token.setMinter(address(safe));
    }

    function _sendTx(uint256 amount) internal returns (uint256 id) {
        vm.prank(owners[0]);
        id = safe.submit(address(token), 0, abi.encodeCall(token.transfer, (escrow, amount)));
    }

    function _confirm(uint256 id, uint256 ownerA, uint256 ownerB) internal {
        vm.prank(owners[ownerA]);
        safe.confirm(id);
        vm.prank(owners[ownerB]);
        safe.confirm(id);
    }

    function test_setup_and_invalid_setup() public {
        assertEq(safe.THRESHOLD(), 3);
        assertEq(safe.owners().length, 5);
        assertTrue(safe.isOwner(owners[4]));
        assertFalse(safe.isOwner(stranger));
        address[] memory dup = new address[](2);
        dup[0] = owners[0];
        dup[1] = owners[0];
        vm.expectRevert(SimpleMultisig.InvalidSetup.selector);
        new SimpleMultisig(dup, 1);
        vm.expectRevert(SimpleMultisig.InvalidSetup.selector);
        new SimpleMultisig(owners, 0);
        vm.expectRevert(SimpleMultisig.InvalidSetup.selector);
        new SimpleMultisig(owners, 6);
        dup[1] = address(0);
        vm.expectRevert(SimpleMultisig.InvalidSetup.selector);
        new SimpleMultisig(dup, 1);
    }

    function test_three_of_five_executes_transfer() public {
        uint256 id = _sendTx(200_000e6);
        vm.prank(owners[1]);
        safe.confirm(id);
        // two confirmations are not enough
        vm.prank(owners[0]);
        vm.expectRevert(SimpleMultisig.NotEnoughConfirmations.selector);
        safe.execute(id);
        vm.prank(owners[2]);
        safe.confirm(id);
        vm.prank(owners[3]); // any owner may execute
        safe.execute(id);
        assertEq(token.balanceOf(escrow), 200_000e6);
        assertEq(token.balanceOf(address(safe)), 1_800_000e6);
        assertTrue(safe.getTx(id).executed);
    }

    function test_non_owner_cannot_submit_confirm_or_execute() public {
        uint256 id = _sendTx(1);
        vm.startPrank(stranger);
        vm.expectRevert(SimpleMultisig.NotOwner.selector);
        safe.submit(address(token), 0, "");
        vm.expectRevert(SimpleMultisig.NotOwner.selector);
        safe.confirm(id);
        vm.expectRevert(SimpleMultisig.NotOwner.selector);
        safe.execute(id);
        vm.stopPrank();
    }

    function test_same_owner_cannot_confirm_twice() public {
        uint256 id = _sendTx(1);
        vm.prank(owners[0]);
        vm.expectRevert(SimpleMultisig.AlreadyConfirmed.selector);
        safe.confirm(id);
        vm.prank(owners[1]);
        safe.confirm(id);
        vm.prank(owners[1]);
        vm.expectRevert(SimpleMultisig.AlreadyConfirmed.selector);
        safe.confirm(id);
        assertEq(safe.getTx(id).confirmations, 2);
    }

    function test_revoke_lowers_the_count() public {
        uint256 id = _sendTx(1);
        _confirm(id, 1, 2);
        vm.prank(owners[1]);
        safe.revoke(id);
        vm.prank(owners[0]);
        vm.expectRevert(SimpleMultisig.NotEnoughConfirmations.selector);
        safe.execute(id);
        vm.prank(owners[3]);
        vm.expectRevert(SimpleMultisig.NotConfirmed.selector);
        safe.revoke(id);
    }

    function test_replay_a_tx_cannot_run_twice() public {
        uint256 id = _sendTx(100e6);
        _confirm(id, 1, 2);
        vm.prank(owners[0]);
        safe.execute(id);
        vm.startPrank(owners[0]);
        vm.expectRevert(SimpleMultisig.AlreadyExecuted.selector);
        safe.execute(id);
        vm.expectRevert(SimpleMultisig.AlreadyExecuted.selector);
        safe.confirm(id);
        vm.stopPrank();
        assertEq(token.balanceOf(escrow), 100e6);
        // an identical new submission is a separate transaction that needs its own confirmations
        uint256 id2 = _sendTx(100e6);
        assertEq(id2, id + 1);
        vm.prank(owners[0]);
        vm.expectRevert(SimpleMultisig.NotEnoughConfirmations.selector);
        safe.execute(id2);
    }

    function test_unknown_tx_reverts() public {
        vm.startPrank(owners[0]);
        vm.expectRevert(SimpleMultisig.UnknownTx.selector);
        safe.confirm(7);
        vm.expectRevert(SimpleMultisig.UnknownTx.selector);
        safe.getTx(7);
        vm.stopPrank();
    }

    function test_failed_call_reverts_and_stays_open() public {
        vm.prank(owners[0]);
        uint256 id = safe.submit(address(token), 0, abi.encodeCall(token.transfer, (escrow, 3_000_000e6)));
        _confirm(id, 1, 2);
        vm.prank(owners[0]);
        vm.expectRevert();
        safe.execute(id);
        assertFalse(safe.getTx(id).executed);
    }

    function test_multisig_can_send_native_value() public {
        vm.deal(address(safe), 1 ether);
        vm.prank(owners[0]);
        uint256 id = safe.submit(escrow, 0.4 ether, "");
        _confirm(id, 1, 2);
        vm.prank(owners[0]);
        safe.execute(id);
        assertEq(escrow.balance, 0.4 ether);
        (bool ok,) = address(safe).call{value: 1}("");
        assertTrue(ok);
    }

    function test_token_metadata_supply_and_minter() public {
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "tUSDC");
        assertEq(token.totalSupply(), 2_000_000e6);
        assertEq(token.balanceOf(address(safe)), 2_000_000e6);
        assertEq(token.minter(), address(safe));
        // the deployer lost the minter role
        vm.expectRevert(MintableToken.NotMinter.selector);
        token.mint(address(this), 1);
        // the multisig can mint through a 3/5 transaction
        vm.prank(owners[0]);
        uint256 id = safe.submit(address(token), 0, abi.encodeCall(token.mint, (escrow, 5)));
        _confirm(id, 1, 2);
        vm.prank(owners[0]);
        safe.execute(id);
        assertEq(token.balanceOf(escrow), 5);
    }
}
