// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMockDEX} from "../src/interfaces/IMockDEX.sol";
import {MockDEX} from "../src/dex/MockDEX.sol";
import {EvilDEX} from "../src/dex/EvilDEX.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

contract MockDEXTest is MayLabsBase {
    address internal trader = makeAddr("trader");

    function setUp() public override {
        super.setUp();
        // liquidity on both DEXes, funds for the trader
        tUSDC.mint(address(dex), 1_000_000e6);
        tTKB.mint(address(dex), 1_000_000e18);
        tUSDC.mint(address(evilDex), 1_000_000e6);
        tTKB.mint(address(evilDex), 1_000_000e18);
        tUSDC.mint(trader, 100_000e6);
        tTKB.mint(trader, 100_000e18);
    }

    function test_swap_5000_tUSDC_returns_5000_tTKB() public {
        vm.startPrank(trader);
        tUSDC.approve(address(dex), 5_000e6);
        uint256 out = dex.swapExactIn(address(tUSDC), address(tTKB), 5_000e6, 5_000e18);
        vm.stopPrank();

        assertEq(out, 5_000e18);
        assertEq(tTKB.balanceOf(trader), 100_000e18 + 5_000e18);
        assertEq(tUSDC.balanceOf(trader), 95_000e6);
        assertEq(tUSDC.balanceOf(address(dex)), 1_000_000e6 + 5_000e6);
        assertEq(tTKB.balanceOf(address(dex)), 1_000_000e18 - 5_000e18);
    }

    function test_swap_reverse_direction_converts_decimals() public {
        vm.startPrank(trader);
        tTKB.approve(address(dex), 5_000e18);
        uint256 out = dex.swapExactIn(address(tTKB), address(tUSDC), 5_000e18, 5_000e6);
        vm.stopPrank();
        assertEq(out, 5_000e6);
    }

    function test_swap_reverts_SlippageTooHigh_when_minOut_above_output() public {
        vm.startPrank(trader);
        tUSDC.approve(address(dex), 5_000e6);
        vm.expectRevert(MockDEX.SlippageTooHigh.selector);
        dex.swapExactIn(address(tUSDC), address(tTKB), 5_000e6, 5_000e18 + 1);
        vm.stopPrank();
        // nothing moved
        assertEq(tUSDC.balanceOf(trader), 100_000e6);
    }

    function test_quote_matches_swap_and_default_rate_is_one() public view {
        assertEq(dex.quote(address(tUSDC), address(tTKB), 30_000e6), 30_000e18);
        assertEq(dex.quote(address(tTKB), address(tUSDC), 30_000e18), 30_000e6);
        (uint256 n, uint256 d) = dex.rateOf(address(tUSDC), address(tTKB));
        assertEq(n, 1);
        assertEq(d, 1);
    }

    function test_quote_floors_when_converting_to_fewer_decimals() public view {
        // 1 wei of tTKB is worth less than 1 micro-USDC
        assertEq(dex.quote(address(tTKB), address(tUSDC), 1e12 - 1), 0);
        assertEq(dex.quote(address(tTKB), address(tUSDC), 1e12), 1);
    }

    function test_unknown_pair_reverts() public {
        // tSCAM was never given a rate
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.quote(address(tSCAM), address(tUSDC), 1);
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.quote(address(tUSDC), address(tSCAM), 1);
        // same-token pair has no rate either
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.quote(address(tUSDC), address(tUSDC), 1);

        vm.prank(trader);
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.swapExactIn(address(tSCAM), address(tUSDC), 1, 0);
    }

    function test_setRate_only_council() public {
        vm.prank(trader);
        vm.expectRevert(IMockDEX.NotCouncil.selector);
        dex.setRate(address(tUSDC), address(tTKB), 2, 1);

        // the deployer is not the council either
        vm.expectRevert(IMockDEX.NotCouncil.selector);
        dex.setRate(address(tUSDC), address(tTKB), 2, 1);
    }

    function test_setRate_changes_quote_and_is_directional() public {
        vm.expectEmit(true, true, false, true, address(dex));
        emit MockDEX.RateSet(address(tTKB), address(tUSDC), 3, 2);
        vm.prank(council);
        dex.setRate(address(tTKB), address(tUSDC), 3, 2);

        // 1 tTKB = 1.5 tUSDC
        assertEq(dex.quote(address(tTKB), address(tUSDC), 10e18), 15e6);
        // reverse direction untouched
        assertEq(dex.quote(address(tUSDC), address(tTKB), 10e6), 10e18);
    }

    function test_setRate_rejects_zero_terms() public {
        vm.startPrank(council);
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.setRate(address(tUSDC), address(tTKB), 0, 1);
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        dex.setRate(address(tUSDC), address(tTKB), 1, 0);
        vm.stopPrank();
    }

    function test_setRate_can_add_new_pair() public {
        vm.prank(council);
        dex.setRate(address(tSCAM), address(tUSDC), 1, 1_000_000);
        assertEq(dex.quote(address(tSCAM), address(tUSDC), 1_000_000e18), 1e6);
    }

    function test_evilDex_behaves_identically_but_is_a_separate_venue() public {
        vm.startPrank(trader);
        tUSDC.approve(address(evilDex), 5_000e6);
        uint256 out = evilDex.swapExactIn(address(tUSDC), address(tTKB), 5_000e6, 0);
        vm.stopPrank();
        assertEq(out, 5_000e18);
        assertEq(evilDex.quote(address(tUSDC), address(tTKB), 1e6), 1e18);

        // rates are per venue
        vm.prank(council);
        evilDex.setRate(address(tUSDC), address(tTKB), 2, 1);
        assertEq(evilDex.quote(address(tUSDC), address(tTKB), 1e6), 2e18);
        assertEq(dex.quote(address(tUSDC), address(tTKB), 1e6), 1e18);
        assertTrue(address(evilDex) != address(dex));
    }

    function test_swap_reverts_when_dex_lacks_liquidity() public {
        EvilDEX empty = new EvilDEX(council, _pair());
        vm.startPrank(trader);
        tUSDC.approve(address(empty), 1e6);
        vm.expectRevert(); // ERC20InsufficientBalance from tTKB
        empty.swapExactIn(address(tUSDC), address(tTKB), 1e6, 0);
        vm.stopPrank();
    }

    function test_swap_reverts_without_allowance() public {
        vm.prank(trader);
        vm.expectRevert(); // ERC20InsufficientAllowance
        dex.swapExactIn(address(tUSDC), address(tTKB), 1e6, 0);
    }

    function testFuzz_swap_value_equal_at_default_rate(uint256 amountIn) public {
        amountIn = bound(amountIn, 0, 100_000e6);
        uint256 out = dex.quote(address(tUSDC), address(tTKB), amountIn);
        assertEq(out, amountIn * 1e12);

        vm.startPrank(trader);
        tUSDC.approve(address(dex), amountIn);
        assertEq(dex.swapExactIn(address(tUSDC), address(tTKB), amountIn, out), out);
        vm.stopPrank();
    }

    function testFuzz_roundtrip_never_gains(uint256 amountIn, uint256 num, uint256 den) public view {
        amountIn = bound(amountIn, 0, 1e30);
        num = bound(num, 1, 1e9);
        den = bound(den, 1, 1e9);
        // quote through a rate then back through its inverse can only lose (floor), never create value
        uint256 mid = amountIn * num * 1e18 / (den * 1e6);
        uint256 back = mid * den * 1e6 / (num * 1e18);
        assertLe(back, amountIn);
        // and the on-chain quote equals the reference formula for the default 1/1 rate
        assertEq(dex.quote(address(tUSDC), address(tTKB), amountIn), amountIn * 1e12);
    }

    function testFuzz_quote_formula_after_setRate(uint256 amountIn, uint256 num, uint256 den) public {
        amountIn = bound(amountIn, 0, 1e30);
        num = bound(num, 1, 1e12);
        den = bound(den, 1, 1e12);
        vm.prank(council);
        dex.setRate(address(tTKB), address(tUSDC), num, den);
        // out = amountIn * num * 10^6 / (den * 10^18)
        assertEq(dex.quote(address(tTKB), address(tUSDC), amountIn), amountIn * num * 1e6 / (den * 1e18));
    }

    function _pair() private view returns (address[] memory a) {
        a = new address[](2);
        a[0] = address(tUSDC);
        a[1] = address(tTKB);
    }

    function test_constructor_sets_default_rates_for_all_ordered_pairs() public {
        address[] memory three = new address[](3);
        three[0] = address(tUSDC);
        three[1] = address(tTKB);
        three[2] = address(tSCAM);
        MockDEX d = new MockDEX(council, three);
        assertEq(d.quote(address(tSCAM), address(tUSDC), 1e18), 1e6);
        assertEq(d.quote(address(tUSDC), address(tSCAM), 1e6), 1e18);
        assertEq(d.council(), council);
    }
}
