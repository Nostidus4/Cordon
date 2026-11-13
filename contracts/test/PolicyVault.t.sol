// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMockDEX} from "../src/interfaces/IMockDEX.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

/// @dev ERC-20 whose `transfer` calls back into the vault as a registered key (re-entrancy through a token).
contract ReentrantToken is ERC20 {
    PolicyVault internal immutable vault;

    constructor(PolicyVault vault_) ERC20("Reentrant", "RE") {
        vault = vault_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256) public override returns (bool) {
        vault.pay(address(this), to, 1, bytes32(0));
        return true;
    }
}

/// @dev "DEX" that re-enters `vault.swap` as a registered key instead of swapping.
contract ReentrantDex {
    PolicyVault internal immutable vault;

    constructor(PolicyVault vault_) {
        vault = vault_;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256, uint256) external returns (uint256) {
        vault.swap(address(this), IMockDEX.swapExactIn.selector, tokenIn, tokenOut, 1, 0, bytes32(0));
        return 0;
    }
}

/// @dev "DEX" that pulls `amountIn` and pays back only half, whatever `minOut` says (a lying venue).
contract ShortChangeDex {
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256) external returns (uint256) {
        ERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        ERC20(tokenOut).transfer(msg.sender, (amountIn * 1e12) / 2);
        return amountIn;
    }
}

contract PolicyVaultTest is MayLabsBase {
    PrincipalRegistry internal registry;
    PolicyVault internal vault;

    address internal topUpOp = makeAddr("topUpOp");
    bytes4 internal constant SWAP_SEL = IMockDEX.swapExactIn.selector;
    uint256 internal constant DAY0 = 19_675 days; // an exact UTC day boundary
    uint256 internal constant DISTRICT_CAP = 30_000e6;

    /// @dev The five keys of district `minh` after the Council grouped them (scene 4, policy v2).
    address[5] internal minhKeys = [KEY_MINH, KEY_AGENT_DATA, KEY_AGENT_INTL_PAY, KEY_AGENT_REBALANCE, KEY_SVC_PAYMENT];

    function setUp() public override {
        super.setUp();
        vm.warp(DAY0 + 9 hours);

        registry = new PrincipalRegistry(council);
        vault = new PolicyVault(address(registry), council, address(tUSDC), address(dex), topUpOp);

        vm.startPrank(council);
        bytes32[7] memory ids = seedPrincipals();
        for (uint256 i; i < ids.length; ++i) {
            registry.createPrincipal(ids[i], string(abi.encodePacked(ids[i])));
        }
        SeedKey[8] memory ks = seedKeys();
        for (uint256 i; i < ks.length; ++i) {
            registry.addKey(ks[i].principalId, ks[i].key, ks[i].kind, ks[i].label);
            vault.setKeyDailyCap(ks[i].key, ks[i].key == KEY_LAN ? 10_000e6 : KEY_DAILY_CAP);
        }
        // policy v2: the four other keys join district minh, shared cap 30.000
        registry.moveKey(KEY_AGENT_DATA, MINH);
        registry.moveKey(KEY_AGENT_INTL_PAY, MINH);
        registry.moveKey(KEY_AGENT_REBALANCE, MINH);
        registry.moveKey(KEY_SVC_PAYMENT, MINH);
        vault.setPrincipalDailyCap(MINH, DISTRICT_CAP);

        vault.setTokenAllowed(address(tUSDC), true);
        vault.setTokenAllowed(address(tTKB), true);
        vault.setProtocolAllowed(address(dex), SWAP_SEL, true);
        vault.setRecipientAllowed(VENDOR_DATA_API, true);
        vault.setRecipientAllowed(VENDOR_CLOUD, true);
        vault.setRecipientAllowed(VENDOR_INTL_DESIGN, true);
        vm.stopPrank();

        tUSDC.mint(address(vault), 200_000e6);
        tTKB.mint(address(vault), 100_000e18);
        tUSDC.mint(address(dex), 1_000_000e6);
        tTKB.mint(address(dex), 1_000_000e18);
        tUSDC.mint(address(evilDex), 1_000_000e6);
        tTKB.mint(address(evilDex), 1_000_000e18);
    }

    // ---------------------------------------------------------------- helpers

    function _pay(address key, address token, address to, uint256 amount) internal {
        vm.prank(key);
        vault.pay(token, to, amount, bytes32(0));
    }

    function _swap(address key, address dexAddr, address tIn, address tOut, uint256 amountIn, uint256 minOut) internal {
        vm.prank(key);
        vault.swap(dexAddr, SWAP_SEL, tIn, tOut, amountIn, minOut, bytes32(0));
    }

    function _today() internal view returns (uint256) {
        return vm.getBlockTimestamp() / 1 days;
    }

    function _asKeyCall(address key, bytes memory data) internal returns (bool ok, bytes memory ret) {
        vm.prank(key);
        (ok, ret) = address(vault).call(data);
    }

    // ------------------------------------------------------- construction/views

    function test_constructorState() public view {
        assertEq(vault.registry(), address(registry));
        assertEq(vault.council(), council);
        assertEq(vault.valueToken(), address(tUSDC));
        assertEq(vault.quoteDex(), address(dex));
        assertEq(vault.topUpOperator(), topUpOp);
        assertEq(vault.policyVersion(), 1);
        assertFalse(vault.paused());
        assertEq(vault.keyDailyCap(KEY_MINH), KEY_DAILY_CAP);
        assertEq(vault.keyDailyCap(KEY_LAN), 10_000e6);
        assertEq(vault.principalDailyCap(MINH), DISTRICT_CAP);
        assertEq(vault.principalDailyCap(LAN), 0);
        assertTrue(vault.tokenAllowed(address(tUSDC)));
        assertFalse(vault.tokenAllowed(address(tSCAM)));
        assertTrue(vault.protocolAllowed(address(dex), SWAP_SEL));
        assertFalse(vault.protocolAllowed(address(evilDex), SWAP_SEL));
        assertFalse(vault.protocolAllowed(address(dex), bytes4(0xdeadbeef)));
        assertTrue(vault.recipientAllowed(VENDOR_CLOUD));
        assertFalse(vault.recipientAllowed(STRANGER_WALLET));
    }

    function test_swapSelectorIsTheSeedSelector() public pure {
        // Backend/seed/may_labs.json protocols[].selector
        assertEq(SWAP_SEL, bytes4(0x10b84623));
    }

    function test_zeroAddressConstructorReverts() public {
        vm.expectRevert(PolicyVault.ZeroAddress.selector);
        new PolicyVault(address(0), council, address(tUSDC), address(dex), topUpOp);
        vm.expectRevert(PolicyVault.ZeroAddress.selector);
        new PolicyVault(address(registry), address(0), address(tUSDC), address(dex), topUpOp);
        vm.expectRevert(PolicyVault.ZeroAddress.selector);
        new PolicyVault(address(registry), council, address(0), address(dex), topUpOp);
    }

    // ------------------------------------------------------------ pay / swap basics

    function test_pay_movesFundsEmitsPaidAndCounts() public {
        uint256 day = _today();
        vm.expectEmit(true, true, false, true, address(vault));
        emit IPolicyVault.Paid(KEY_MINH, MINH, address(tUSDC), VENDOR_CLOUD, 4_000e6, day, 4_000e6, 4_000e6, "memo");
        vm.prank(KEY_MINH);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 4_000e6, "memo");

        assertEq(tUSDC.balanceOf(VENDOR_CLOUD), 4_000e6);
        assertEq(tUSDC.balanceOf(address(vault)), 196_000e6);
        assertEq(vault.keySpent(KEY_MINH, day), 4_000e6);
        assertEq(vault.principalSpent(MINH, day), 4_000e6);

        // a second key of the same district: key counter is its own, district counter accumulates
        vm.expectEmit(true, true, false, true, address(vault));
        emit IPolicyVault.Paid(
            KEY_AGENT_DATA, MINH, address(tUSDC), VENDOR_DATA_API, 1_000e6, day, 1_000e6, 5_000e6, bytes32(0)
        );
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_DATA_API, 1_000e6);
        assertEq(vault.keySpent(KEY_AGENT_DATA, day), 1_000e6);
        assertEq(vault.principalSpent(MINH, day), 5_000e6);
    }

    function test_pay_tTKBIsValuedViaDexQuote() public {
        // 1.000 tTKB (18 decimals) == 1.000 tUSDC (6 decimals) on the 1:1 MockDEX
        _pay(KEY_MINH, address(tTKB), VENDOR_CLOUD, 1_000e18);
        assertEq(tTKB.balanceOf(VENDOR_CLOUD), 1_000e18);
        assertEq(vault.keySpent(KEY_MINH, _today()), 1_000e6);
        assertEq(vault.principalSpent(MINH, _today()), 1_000e6);
    }

    function test_pay_tTKBRespectsCapsInTUSDCTerms() public {
        _pay(KEY_MINH, address(tTKB), VENDOR_CLOUD, 20_000e18);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyDailyCapExceeded.selector);
        vault.pay(address(tTKB), VENDOR_CLOUD, 1e12, bytes32(0)); // 1e12 wei tTKB = 1 base unit of tUSDC
    }

    function test_swap_leavesOutputInVaultEmitsSwappedAndCounts() public {
        uint256 day = _today();
        uint256 usdcBefore = tUSDC.balanceOf(address(vault));
        uint256 tkbBefore = tTKB.balanceOf(address(vault));

        vm.expectEmit(true, true, false, true, address(vault));
        emit IPolicyVault.Swapped(
            KEY_AGENT_REBALANCE,
            MINH,
            address(dex),
            address(tUSDC),
            address(tTKB),
            5_000e6,
            5_000e18,
            day,
            5_000e6,
            5_000e6,
            "why"
        );
        vm.prank(KEY_AGENT_REBALANCE);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 5_000e6, 5_000e18, "why");

        assertEq(tUSDC.balanceOf(address(vault)), usdcBefore - 5_000e6);
        assertEq(tTKB.balanceOf(address(vault)), tkbBefore + 5_000e18, "output stays in the vault");
        assertEq(tTKB.balanceOf(KEY_AGENT_REBALANCE), 0);
        assertEq(vault.keySpent(KEY_AGENT_REBALANCE, day), 5_000e6);
        assertEq(vault.principalSpent(MINH, day), 5_000e6);
        // approval to the DEX is fully consumed/cleared
        assertEq(tUSDC.allowance(address(vault), address(dex)), 0);
    }

    function test_swap_tTKBToUSDCIsValuedByQuote() public {
        _swap(KEY_MINH, address(dex), address(tTKB), address(tUSDC), 2_000e18, 0);
        assertEq(vault.keySpent(KEY_MINH, _today()), 2_000e6);
        assertEq(tUSDC.balanceOf(address(vault)), 200_000e6 + 2_000e6);
        assertEq(tTKB.balanceOf(address(vault)), 100_000e18 - 2_000e18);
    }

    function test_revertedCallsEmitNoEventAndChangeNoState() public {
        vm.recordLogs();
        (bool ok,) = _asKeyCall(KEY_MINH, abi.encodeCall(vault.pay, (address(tUSDC), STRANGER_WALLET, 1e6, bytes32(0))));
        assertFalse(ok);
        (ok,) = _asKeyCall(
            KEY_MINH,
            abi.encodeCall(vault.swap, (address(evilDex), SWAP_SEL, address(tUSDC), address(tTKB), 1e6, 0, bytes32(0)))
        );
        assertFalse(ok);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(vault.keySpent(KEY_MINH, _today()), 0);
        assertEq(vault.principalSpent(MINH, _today()), 0);
    }

    function test_unknownTokenPairForQuoteReverts() public {
        // a token the DEX has no rate for: the cap valuation cannot be done, so the call reverts (no free spend)
        vm.startPrank(council);
        vault.setTokenAllowed(address(tSCAM), true);
        vm.stopPrank();
        tSCAM.mint(address(vault), 1e18);
        vm.prank(KEY_MINH);
        vm.expectRevert(IMockDEX.UnknownPair.selector);
        vault.pay(address(tSCAM), VENDOR_CLOUD, 1e18, bytes32(0));
    }

    // ---------------------------------------------------- scene 4 (§4.3) in one test

    function test_scene4_table() public {
        uint256 day = _today();

        // 0  09:00 agent_rebalance swaps 5.000 tUSDC -> tTKB via MockDEX: ok, 5.000
        _swap(KEY_AGENT_REBALANCE, address(dex), address(tUSDC), address(tTKB), 5_000e6, 0);
        assertEq(vault.principalSpent(MINH, day), 5_000e6);

        // 1  14:01 agent_intl_pay pays 20.000 to the stranger: RECIPIENT_NOT_ALLOWED
        vm.warp(DAY0 + 14 hours + 1 minutes);
        vm.prank(KEY_AGENT_INTL_PAY);
        vm.expectRevert(IPolicyVault.RecipientNotAllowed.selector);
        vault.pay(address(tUSDC), STRANGER_WALLET, 20_000e6, bytes32(0));
        assertEq(vault.principalSpent(MINH, day), 5_000e6);

        // 2  14:02 agent_rebalance swaps through EvilDEX: PROTOCOL_NOT_ALLOWED
        vm.warp(DAY0 + 14 hours + 2 minutes);
        vm.prank(KEY_AGENT_REBALANCE);
        vm.expectRevert(IPolicyVault.ProtocolNotAllowed.selector);
        vault.swap(address(evilDex), SWAP_SEL, address(tUSDC), address(tTKB), 5_000e6, 0, bytes32(0));
        assertEq(vault.principalSpent(MINH, day), 5_000e6);

        // 3  14:02 agent_data pays 10.000 to vendor_data_api: ok, 15.000
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_DATA_API, 10_000e6);
        assertEq(vault.principalSpent(MINH, day), 15_000e6);

        // 4  14:03 minh pays 10.000 to vendor_cloud: ok, 25.000
        vm.warp(DAY0 + 14 hours + 3 minutes);
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 10_000e6);
        assertEq(vault.principalSpent(MINH, day), 25_000e6);

        // 5  14:03 svc_payment pays 10.000 to vendor_cloud: DISTRICT_DAILY_CAP, stays 25.000
        vm.prank(KEY_SVC_PAYMENT);
        vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 10_000e6, bytes32(0));
        assertEq(vault.principalSpent(MINH, day), 25_000e6);

        assertEq(vault.keySpent(KEY_AGENT_REBALANCE, day), 5_000e6);
        assertEq(vault.keySpent(KEY_AGENT_DATA, day), 10_000e6);
        assertEq(vault.keySpent(KEY_MINH, day), 10_000e6);
        assertEq(vault.keySpent(KEY_SVC_PAYMENT, day), 0);
        assertEq(vault.keySpent(KEY_AGENT_INTL_PAY, day), 0);
    }

    // ------------------------------------------------------------- T1, T2, T3

    /// T1: one key cannot exceed its own 20.000 even though the district would allow 30.000.
    function test_T1_keyCapBindsBeforeDistrictCap() public {
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        // another key of the district still has room, up to the shared cap
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_CLOUD, 10_000e6);
        assertEq(vault.principalSpent(MINH, _today()), DISTRICT_CAP);
    }

    /// T2: the exact cap is allowed, one base unit more is not.
    function test_T2_districtCapExactBoundary() public {
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_CLOUD, 10_000e6 - 1);
        vm.prank(KEY_AGENT_REBALANCE);
        vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 2, bytes32(0));
        _pay(KEY_AGENT_REBALANCE, address(tUSDC), VENDOR_CLOUD, 1);
        assertEq(vault.principalSpent(MINH, _today()), DISTRICT_CAP);
        vm.prank(KEY_AGENT_INTL_PAY);
        vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
    }

    /// T3: 60 transfers of 500 across the five keys fill the district exactly; the 61st is refused.
    function test_T3_sixtyTransfersOf500() public {
        for (uint256 i; i < 60; ++i) {
            _pay(minhKeys[i % 5], address(tUSDC), VENDOR_DATA_API, 500e6);
        }
        assertEq(vault.principalSpent(MINH, _today()), DISTRICT_CAP);
        assertEq(tUSDC.balanceOf(VENDOR_DATA_API), DISTRICT_CAP);
        for (uint256 i; i < 5; ++i) {
            assertEq(vault.keySpent(minhKeys[i], _today()), 6_000e6);
            vm.prank(minhKeys[i]);
            vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
            vault.pay(address(tUSDC), VENDOR_DATA_API, 500e6, bytes32(0));
        }
    }

    /// T1-T3 as a property: whatever the order, amounts and keys, the district never moves more than 30.000/day
    /// and no key moves more than 20.000/day.
    function testFuzz_districtNeverExceedsCap(uint256[24] memory seeds) public {
        uint256 total;
        uint256[5] memory perKey;
        for (uint256 i; i < seeds.length; ++i) {
            uint256 k = seeds[i] % 5;
            uint256 amount = (seeds[i] / 5) % 9_000e6;
            vm.prank(minhKeys[k]);
            try vault.pay(address(tUSDC), VENDOR_CLOUD, amount, bytes32(0)) {
                total += amount;
                perKey[k] += amount;
            } catch (bytes memory err) {
                bytes4 sel = bytes4(err);
                assertTrue(
                    sel == IPolicyVault.KeyDailyCapExceeded.selector
                        || sel == IPolicyVault.PrincipalDailyCapExceeded.selector,
                    "only cap errors expected"
                );
                // a refusal must be justified
                bool keyFull = perKey[k] + amount > KEY_DAILY_CAP;
                bool districtFull = total + amount > DISTRICT_CAP;
                assertTrue(keyFull || districtFull, "refused although within both caps");
            }
        }
        assertLe(total, DISTRICT_CAP);
        assertEq(vault.principalSpent(MINH, _today()), total);
        assertEq(tUSDC.balanceOf(VENDOR_CLOUD), total);
        for (uint256 k; k < 5; ++k) {
            assertLe(perKey[k], KEY_DAILY_CAP);
            assertEq(vault.keySpent(minhKeys[k], _today()), perKey[k]);
        }
    }

    // --------------------------------------------------------------------- T4

    /// T4: counters are per UTC day; at the day boundary they read 0 and a full 30.000 can be spent again.
    function test_T4_nextDayResetsCounters() public {
        uint256 day = _today();
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_CLOUD, 10_000e6);
        assertEq(vault.principalSpent(MINH, day), DISTRICT_CAP);

        // still the same UTC day one second before midnight
        vm.warp(DAY0 + 1 days - 1);
        assertEq(_today(), day);
        vm.prank(KEY_AGENT_REBALANCE);
        vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));

        vm.warp(vm.getBlockTimestamp() + 1); // exactly midnight UTC
        assertEq(_today(), day + 1);
        assertEq(vault.keySpent(KEY_MINH, _today()), 0);
        assertEq(vault.principalSpent(MINH, _today()), 0);
        // yesterday's totals are untouched
        assertEq(vault.keySpent(KEY_MINH, day), 20_000e6);
        assertEq(vault.principalSpent(MINH, day), DISTRICT_CAP);

        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
        _pay(KEY_AGENT_DATA, address(tUSDC), VENDOR_CLOUD, 10_000e6);
        assertEq(vault.principalSpent(MINH, _today()), DISTRICT_CAP);
    }

    function test_T4_warpPlusOneDayFromNoon() public {
        uint256 day = _today();
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        assertEq(vault.keySpent(KEY_MINH, _today()), 0);
        assertEq(_today(), day + 1);
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 20_000e6);
    }

    // ------------------------------------------------------------- T5 / T6: order

    // condition bits, in check order
    uint256 internal constant C_PAUSED = 1 << 0;
    uint256 internal constant C_KEY = 1 << 1;
    uint256 internal constant C_LOCKED = 1 << 2;
    uint256 internal constant C_TOKEN = 1 << 3;
    uint256 internal constant C_TARGET = 1 << 4;
    uint256 internal constant C_KEYCAP = 1 << 5;
    uint256 internal constant C_DISTRICTCAP = 1 << 6;
    uint256 internal constant N_CONDITIONS = 7;

    function _errorFor(uint256 bit, bool isSwap) internal pure returns (bytes4) {
        if (bit == 0) return IPolicyVault.VaultPaused.selector;
        if (bit == 1) return IPolicyVault.KeyNotRegistered.selector;
        if (bit == 2) return IPolicyVault.PrincipalIsLocked.selector;
        if (bit == 3) return IPolicyVault.TokenNotAllowed.selector;
        if (bit == 4) {
            return isSwap ? IPolicyVault.ProtocolNotAllowed.selector : IPolicyVault.RecipientNotAllowed.selector;
        }
        if (bit == 5) return IPolicyVault.KeyDailyCapExceeded.selector;
        return IPolicyVault.PrincipalDailyCapExceeded.selector;
    }

    /// @dev Break exactly the conditions in `mask`; KEY_MINH spends 1.000 tUSDC (pay to VENDOR_CLOUD / swap via dex
    ///      into tTKB, so the "token" failure is a disallowed tUSDC for pay and a disallowed tTKB for swap).
    function _breakConditions(uint256 mask, bool isSwap) internal {
        vm.startPrank(council);
        if (mask & C_PAUSED != 0) vault.pauseAll();
        if (mask & C_KEY != 0) registry.deactivateKey(KEY_MINH);
        if (mask & C_LOCKED != 0) vault.lockPrincipal(MINH);
        if (mask & C_TOKEN != 0) vault.setTokenAllowed(isSwap ? address(tTKB) : address(tUSDC), false);
        if (mask & C_TARGET != 0) {
            if (isSwap) vault.setProtocolAllowed(address(dex), SWAP_SEL, false);
            else vault.setRecipientAllowed(VENDOR_CLOUD, false);
        }
        if (mask & C_KEYCAP != 0) vault.setKeyDailyCap(KEY_MINH, 0);
        if (mask & C_DISTRICTCAP != 0) vault.setPrincipalDailyCap(MINH, 1);
        vm.stopPrank();
    }

    function _lowestBit(uint256 mask) internal pure returns (uint256 bit) {
        while (mask & (1 << bit) == 0) ++bit;
    }

    /// T5/T6 for `pay`: for every non-empty subset of the 7 failing conditions (127 of them, so every pair is
    /// covered) the revert is exactly the first failing condition in the fixed order.
    function test_T5_T6_payCheckOrderAllSubsets() public {
        uint256 snap = vm.snapshotState();
        for (uint256 mask = 1; mask < (1 << N_CONDITIONS); ++mask) {
            _breakConditions(mask, false);
            vm.prank(KEY_MINH);
            vm.expectRevert(_errorFor(_lowestBit(mask), false));
            vault.pay(address(tUSDC), VENDOR_CLOUD, 1_000e6, bytes32(0));
            vm.revertToState(snap);
            snap = vm.snapshotState();
        }
    }

    /// T5/T6 for `swap` (token check covers both tokens; target is the protocol).
    function test_T5_T6_swapCheckOrderAllSubsets() public {
        uint256 snap = vm.snapshotState();
        for (uint256 mask = 1; mask < (1 << N_CONDITIONS); ++mask) {
            _breakConditions(mask, true);
            vm.prank(KEY_MINH);
            vm.expectRevert(_errorFor(_lowestBit(mask), true));
            vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 1_000e6, 0, bytes32(0));
            vm.revertToState(snap);
            snap = vm.snapshotState();
        }
    }

    function test_T5_eachConditionAloneGivesItsOwnError() public {
        for (uint256 bit; bit < N_CONDITIONS; ++bit) {
            uint256 snap = vm.snapshotState();
            _breakConditions(1 << bit, false);
            vm.prank(KEY_MINH);
            vm.expectRevert(_errorFor(bit, false));
            vault.pay(address(tUSDC), VENDOR_CLOUD, 1_000e6, bytes32(0));
            vm.revertToState(snap);
        }
    }

    function test_swap_tokenInOrTokenOutNotAllowedIsTokenError() public {
        vm.startPrank(council);
        vault.setTokenAllowed(address(tUSDC), false);
        vm.stopPrank();
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.TokenNotAllowed.selector);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 1e6, 0, bytes32(0));

        vm.startPrank(council);
        vault.setTokenAllowed(address(tUSDC), true);
        vault.setTokenAllowed(address(tSCAM), false);
        vm.stopPrank();
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.TokenNotAllowed.selector);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tSCAM), 1e6, 0, bytes32(0));
    }

    function test_unregisteredKeyAndStrangerCannotSpend() public {
        address nobody = makeAddr("nobody");
        vm.prank(nobody);
        vm.expectRevert(IPolicyVault.KeyNotRegistered.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        vm.prank(nobody);
        vm.expectRevert(IPolicyVault.KeyNotRegistered.selector);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 1, 0, bytes32(0));
    }

    function test_deactivatedKeyKeepsItsPrincipalButCannotSpend() public {
        vm.prank(council);
        registry.deactivateKey(KEY_MINH);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyNotRegistered.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
    }

    function test_lockedDistrictBlocksAllItsKeysOnly() public {
        vm.prank(council);
        vault.lockPrincipal(MINH);
        for (uint256 i; i < 5; ++i) {
            vm.prank(minhKeys[i]);
            vm.expectRevert(IPolicyVault.PrincipalIsLocked.selector);
            vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        }
        // another district is unaffected
        _pay(KEY_LAN, address(tUSDC), VENDOR_CLOUD, 1_000e6);
    }

    function test_districtCapZeroMeansNotSetButKeyCapAlwaysApplies() public {
        vm.prank(council);
        vault.setPrincipalDailyCap(MINH, 0);
        // 5 keys x 20.000 = 100.000 > 30.000 would be refused with a cap; without one only key caps bind
        for (uint256 i; i < 5; ++i) {
            _pay(minhKeys[i], address(tUSDC), VENDOR_CLOUD, 20_000e6);
        }
        assertEq(vault.principalSpent(MINH, _today()), 100_000e6, "still counted");

        // key cap is always enforced; a key with no cap set (0) cannot spend at all
        vm.prank(council);
        vault.setKeyDailyCap(KEY_MINH, 0);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 0 + 1, bytes32(0));
    }

    function test_protocolAllowListIsPerSelector() public {
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.ProtocolNotAllowed.selector);
        vault.swap(address(dex), bytes4(0xdeadbeef), address(tUSDC), address(tTKB), 1e6, 0, bytes32(0));
    }

    // -------------------------------------------------------------------- T13

    /// T13: `minOut` above what the DEX returns reverts `SlippageTooHigh`; a fair `minOut` leaves tTKB in the vault.
    function test_T13_minOutAboveDexOutputReverts() public {
        vm.prank(KEY_AGENT_REBALANCE);
        vm.expectRevert(IPolicyVault.SlippageTooHigh.selector);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 5_000e6, 5_000e18 + 1, bytes32(0));
        assertEq(vault.principalSpent(MINH, _today()), 0, "revert rolls back the counters");
        assertEq(tUSDC.balanceOf(address(vault)), 200_000e6);

        uint256 tkb = tTKB.balanceOf(address(vault));
        _swap(KEY_AGENT_REBALANCE, address(dex), address(tUSDC), address(tTKB), 5_000e6, 5_000e18);
        assertEq(tTKB.balanceOf(address(vault)), tkb + 5_000e18);
    }

    /// The vault does its own slippage check: a venue that ignores `minOut` and pays less is still refused.
    function test_T13_vaultChecksAmountOutItself() public {
        ShortChangeDex shady = new ShortChangeDex();
        tTKB.mint(address(shady), 1_000_000e18);
        vm.prank(council);
        vault.setProtocolAllowed(address(shady), SWAP_SEL, true);

        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.SlippageTooHigh.selector);
        vault.swap(address(shady), SWAP_SEL, address(tUSDC), address(tTKB), 1_000e6, 1_000e18, bytes32(0));

        // an honest minOut passes (the shady DEX pays half = 500 tTKB for 1.000 tUSDC)
        _swap(KEY_MINH, address(shady), address(tUSDC), address(tTKB), 1_000e6, 0);
        assertEq(tTKB.balanceOf(address(vault)), 100_000e18 + 500e18);
    }

    function testFuzz_swapSlippage(uint256 amountIn, uint256 minOut) public {
        amountIn = bound(amountIn, 1, 20_000e6);
        uint256 out = amountIn * 1e12; // 1:1 by value, 6 -> 18 decimals
        minOut = bound(minOut, 0, out * 2);
        vm.prank(KEY_MINH);
        if (minOut > out) vm.expectRevert(IPolicyVault.SlippageTooHigh.selector);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), amountIn, minOut, bytes32(0));
        if (minOut <= out) assertEq(tTKB.balanceOf(address(vault)), 100_000e18 + out);
    }

    // ---------------------------------------------------------------- T14 (re-entrancy)

    function test_T14_reentrantTokenCannotReenterPay() public {
        ReentrantToken evil = new ReentrantToken(vault);
        evil.mint(address(vault), 1_000e18);
        vm.startPrank(council);
        registry.addKey(MINH, address(evil), KeyKind.AGENT, "evil token as key");
        vault.setKeyDailyCap(address(evil), 1_000e6);
        vault.setTokenAllowed(address(evil), true);
        dex.setRate(address(evil), address(tUSDC), 1, 1);
        vm.stopPrank();

        vm.prank(KEY_MINH);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vault.pay(address(evil), VENDOR_CLOUD, 10e18, bytes32(0));
        assertEq(vault.principalSpent(MINH, _today()), 0);
    }

    function test_T14_reentrantDexCannotReenterSwap() public {
        ReentrantDex evil = new ReentrantDex(vault);
        vm.startPrank(council);
        registry.addKey(MINH, address(evil), KeyKind.AGENT, "evil dex as key");
        vault.setKeyDailyCap(address(evil), 1_000e6);
        vault.setProtocolAllowed(address(evil), SWAP_SEL, true);
        vm.stopPrank();

        vm.prank(KEY_MINH);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vault.swap(address(evil), SWAP_SEL, address(tUSDC), address(tTKB), 10e6, 0, bytes32(0));
        assertEq(vault.principalSpent(MINH, _today()), 0);
        assertEq(tUSDC.allowance(address(vault), address(evil)), 0);
    }

    // ------------------------------------------------------------ admin (CTR-005)

    address internal rando = makeAddr("rando");

    function _adminCalls() internal view returns (bytes[] memory c) {
        c = new bytes[](13);
        c[0] = abi.encodeCall(vault.lockPrincipal, (MINH));
        c[1] = abi.encodeCall(vault.unlockPrincipal, (MINH));
        c[2] = abi.encodeCall(vault.pauseAll, ());
        c[3] = abi.encodeCall(vault.unpauseAll, ());
        c[4] = abi.encodeCall(vault.setKeyDailyCap, (KEY_MINH, 1));
        c[5] = abi.encodeCall(vault.setPrincipalDailyCap, (MINH, 1));
        c[6] = abi.encodeCall(vault.setTokenAllowed, (address(tSCAM), true));
        c[7] = abi.encodeCall(vault.setProtocolAllowed, (address(evilDex), SWAP_SEL, true));
        c[8] = abi.encodeCall(vault.setRecipientAllowed, (STRANGER_WALLET, true));
        c[9] = abi.encodeCall(vault.bumpPolicyVersion, ());
        c[10] = abi.encodeCall(vault.setTopUpOperator, (rando));
        c[11] = abi.encodeCall(vault.setTopUpOperator, (address(0)));
        c[12] = abi.encodeCall(vault.lockPrincipal, (bytes32(0)));
    }

    function test_adminFunctionsOnlyCouncil() public {
        bytes[] memory calls = _adminCalls();
        address[4] memory callers = [rando, address(this), topUpOp, KEY_MINH];
        for (uint256 c; c < callers.length; ++c) {
            for (uint256 i; i < calls.length; ++i) {
                vm.prank(callers[c]);
                (bool ok, bytes memory ret) = address(vault).call(calls[i]);
                assertFalse(ok);
                assertEq(bytes4(ret), IPolicyVault.NotCouncil.selector);
            }
        }
        // the Council itself is accepted by every one of them
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(council);
            (bool ok,) = address(vault).call(calls[i]);
            assertTrue(ok);
        }
    }

    function test_T7_lockBlocksEveryKeyOfTheDistrictForPayAndSwap() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit IPolicyVault.PrincipalLocked(MINH, council);
        vm.prank(council);
        vault.lockPrincipal(MINH);
        assertTrue(vault.principalLocked(MINH));
        for (uint256 i; i < 5; ++i) {
            vm.startPrank(minhKeys[i]);
            vm.expectRevert(IPolicyVault.PrincipalIsLocked.selector);
            vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
            vm.expectRevert(IPolicyVault.PrincipalIsLocked.selector);
            vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 1, 0, bytes32(0));
            vm.stopPrank();
        }
        // other districts are unaffected; the flag does not touch the registry
        assertFalse(vault.principalLocked(LAN));
        assertFalse(vault.principalLocked(HUY));
        _pay(KEY_LAN, address(tUSDC), VENDOR_CLOUD, 1_000e6);
        (,, bool active,) = registry.keyInfo(KEY_MINH);
        assertTrue(active);
    }

    function test_T7_unlockRestoresAndEmitsEvent() public {
        vm.startPrank(council);
        vault.lockPrincipal(MINH);
        vm.expectEmit(true, false, false, false, address(vault));
        emit IPolicyVault.PrincipalUnlocked(MINH);
        vault.unlockPrincipal(MINH);
        vm.stopPrank();
        assertFalse(vault.principalLocked(MINH));
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 500e6);
        assertEq(vault.keySpent(KEY_MINH, _today()), 500e6);
    }

    function test_lockedDistrictRevertsBeforeTokenAndCapChecks() public {
        vm.startPrank(council);
        vault.lockPrincipal(MINH);
        vault.setTokenAllowed(address(tUSDC), false);
        vault.setKeyDailyCap(KEY_MINH, 0);
        vm.stopPrank();
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.PrincipalIsLocked.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
    }

    function test_T12_pauseBlocksEveryRegisteredKeyAndWinsOverEveryOtherCheck() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.Paused(council);
        vm.prank(council);
        vault.pauseAll();
        assertTrue(vault.paused());

        SeedKey[8] memory ks = seedKeys();
        for (uint256 i; i < ks.length; ++i) {
            vm.startPrank(ks[i].key);
            vm.expectRevert(IPolicyVault.VaultPaused.selector);
            vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
            vm.expectRevert(IPolicyVault.VaultPaused.selector);
            vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 1, 0, bytes32(0));
            vm.stopPrank();
        }
        // wins even over "key not registered" and "district locked"
        vm.prank(rando);
        vm.expectRevert(IPolicyVault.VaultPaused.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        vm.prank(council);
        vault.lockPrincipal(MINH);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.VaultPaused.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
    }

    function test_T12_unpauseRestoresAndEmitsEvent() public {
        vm.startPrank(council);
        vault.pauseAll();
        vm.expectEmit(false, false, false, false, address(vault));
        emit IPolicyVault.Unpaused();
        vault.unpauseAll();
        vm.stopPrank();
        assertFalse(vault.paused());
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 500e6);
        _swap(KEY_AGENT_REBALANCE, address(dex), address(tUSDC), address(tTKB), 500e6, 0);
    }

    function test_setPrincipalDailyCap_emitsCapChangedKind1FromUnset() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.CapChanged(1, LAN, 0, 30_000e6);
        vm.prank(council);
        vault.setPrincipalDailyCap(LAN, 30_000e6);
        assertEq(vault.principalDailyCap(LAN), 30_000e6);
    }

    function test_capSettersCarryOldAndNewValues() public {
        vm.startPrank(council);
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.CapChanged(0, bytes32(uint256(uint160(KEY_MINH))), KEY_DAILY_CAP, 5);
        vault.setKeyDailyCap(KEY_MINH, 5);
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.CapChanged(0, bytes32(uint256(uint160(KEY_MINH))), 5, 9_000e6);
        vault.setKeyDailyCap(KEY_MINH, 9_000e6);
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.CapChanged(1, MINH, DISTRICT_CAP, 0);
        vault.setPrincipalDailyCap(MINH, 0);
        vm.stopPrank();
        assertEq(vault.keyDailyCap(KEY_MINH), 9_000e6);
        assertEq(vault.principalDailyCap(MINH), 0);
    }

    function test_loweredCapBindsImmediatelyAndKeepsTodaysSpend() public {
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 4_000e6);
        vm.prank(council);
        vault.setKeyDailyCap(KEY_MINH, 4_500e6);
        _pay(KEY_MINH, address(tUSDC), VENDOR_CLOUD, 500e6);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        // cap below what is already spent: spent stays, further spend refused
        vm.prank(council);
        vault.setKeyDailyCap(KEY_MINH, 1_000e6);
        assertEq(vault.keySpent(KEY_MINH, _today()), 4_500e6);
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.KeyDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
    }

    function test_allowSettersEmitAllowChangedBothDirections() public {
        bytes32 tokenSubj = bytes32(uint256(uint160(address(tUSDC))));
        bytes32 dexSubj = bytes32(uint256(uint160(address(dex))));
        bytes32 rcpSubj = bytes32(uint256(uint160(VENDOR_CLOUD)));
        vm.startPrank(council);

        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(0, tokenSubj, bytes4(0), false);
        vault.setTokenAllowed(address(tUSDC), false);
        assertFalse(vault.tokenAllowed(address(tUSDC)));
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(0, tokenSubj, bytes4(0), true);
        vault.setTokenAllowed(address(tUSDC), true);
        assertTrue(vault.tokenAllowed(address(tUSDC)));

        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(1, dexSubj, SWAP_SEL, false);
        vault.setProtocolAllowed(address(dex), SWAP_SEL, false);
        assertFalse(vault.protocolAllowed(address(dex), SWAP_SEL));
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(1, dexSubj, SWAP_SEL, true);
        vault.setProtocolAllowed(address(dex), SWAP_SEL, true);
        assertTrue(vault.protocolAllowed(address(dex), SWAP_SEL));

        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(2, rcpSubj, bytes4(0), false);
        vault.setRecipientAllowed(VENDOR_CLOUD, false);
        assertFalse(vault.recipientAllowed(VENDOR_CLOUD));
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(2, rcpSubj, bytes4(0), true);
        vault.setRecipientAllowed(VENDOR_CLOUD, true);
        assertTrue(vault.recipientAllowed(VENDOR_CLOUD));
        vm.stopPrank();
    }

    function test_removedAllowEntryTakesEffectAndSelectorsAreIndependent() public {
        vm.startPrank(council);
        vault.setRecipientAllowed(VENDOR_CLOUD, false);
        vault.setProtocolAllowed(address(dex), bytes4(0xdeadbeef), true);
        vm.stopPrank();
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.RecipientNotAllowed.selector);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 1, bytes32(0));
        _pay(KEY_MINH, address(tUSDC), VENDOR_DATA_API, 1);
        assertTrue(vault.protocolAllowed(address(dex), SWAP_SEL));
        assertFalse(vault.protocolAllowed(address(dex), bytes4(0xcafebabe)));
    }

    function test_bumpPolicyVersionIncrementsByOneAndEmitsNewValue() public {
        assertEq(vault.policyVersion(), 1);
        for (uint256 v = 2; v <= 4; ++v) {
            vm.expectEmit(false, false, false, true, address(vault));
            emit IPolicyVault.PolicyVersionBumped(v);
            vm.prank(council);
            vault.bumpPolicyVersion();
            assertEq(vault.policyVersion(), v);
        }
    }

    function testFuzz_bumpPolicyVersionN(uint8 n) public {
        vm.startPrank(council);
        for (uint256 i; i < n; ++i) {
            vault.bumpPolicyVersion();
        }
        vm.stopPrank();
        assertEq(vault.policyVersion(), 1 + uint256(n));
    }

    function test_adminCallsDoNotBumpPolicyVersionByThemselves() public {
        vm.startPrank(council);
        vault.lockPrincipal(MINH);
        vault.setKeyDailyCap(KEY_MINH, 1);
        vault.setTokenAllowed(address(tSCAM), true);
        vm.stopPrank();
        assertEq(vault.policyVersion(), 1); // the Council ends each proposal with bumpPolicyVersion()
    }

    function test_recordTopUp_councilOrOperatorEmitsAndMovesNoFunds() public {
        bytes32 h = keccak256("c-chain-tx");
        uint256 before_ = tUSDC.balanceOf(address(vault));
        vm.expectEmit(true, false, false, true, address(vault));
        emit IPolicyVault.TopUpRecorded(h, 50_000e6);
        vm.prank(topUpOp);
        vault.recordTopUp(h, 50_000e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit IPolicyVault.TopUpRecorded(h, 1);
        vm.prank(council);
        vault.recordTopUp(h, 1);
        assertEq(tUSDC.balanceOf(address(vault)), before_);
        assertEq(vault.policyVersion(), 1);
    }

    function test_recordTopUp_othersRevertNotTopUpOperator() public {
        address[3] memory others = [rando, address(this), KEY_MINH];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(IPolicyVault.NotTopUpOperator.selector);
            vault.recordTopUp(bytes32(uint256(1)), 1);
        }
    }

    function test_setTopUpOperator_changesRoleAndEmits() public {
        address newOp = makeAddr("newOp");
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.TopUpOperatorChanged(topUpOp, newOp);
        vm.prank(council);
        vault.setTopUpOperator(newOp);
        assertEq(vault.topUpOperator(), newOp);

        vm.prank(topUpOp);
        vm.expectRevert(IPolicyVault.NotTopUpOperator.selector);
        vault.recordTopUp(bytes32(0), 1);
        vm.prank(newOp);
        vault.recordTopUp(bytes32(0), 1);

        // address(0) disables the role; the Council can still record
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.TopUpOperatorChanged(newOp, address(0));
        vm.prank(council);
        vault.setTopUpOperator(address(0));
        vm.prank(newOp);
        vm.expectRevert(IPolicyVault.NotTopUpOperator.selector);
        vault.recordTopUp(bytes32(0), 1);
        vm.prank(council);
        vault.recordTopUp(bytes32(0), 1);
    }

    function test_tightenLoosen_capClassification() public view {
        bytes32 minhKey = bytes32(uint256(uint160(KEY_MINH)));
        // principal: lower = tighten; raise, unset (0) = loosen; equal = not tightening
        assertTrue(vault.isTighteningCap(1, MINH, DISTRICT_CAP - 1));
        assertFalse(vault.isTighteningCap(1, MINH, DISTRICT_CAP));
        assertFalse(vault.isTighteningCap(1, MINH, DISTRICT_CAP + 1));
        assertFalse(vault.isTighteningCap(1, MINH, 0));
        // principal with no cap: setting any cap is tightening (sim parity), unsetting again is not
        assertTrue(vault.isTighteningCap(1, LAN, 1));
        assertFalse(vault.isTighteningCap(1, LAN, 0));
        // key
        assertTrue(vault.isTighteningCap(0, minhKey, KEY_DAILY_CAP - 1));
        assertTrue(vault.isTighteningCap(0, minhKey, 0));
        assertFalse(vault.isTighteningCap(0, minhKey, KEY_DAILY_CAP));
        assertFalse(vault.isTighteningCap(0, minhKey, KEY_DAILY_CAP + 1));
        // unknown kind is never tightening
        assertFalse(vault.isTighteningCap(2, minhKey, 0));
    }

    function test_tightenLoosen_keyWithZeroCapRaisingIsLoosening() public {
        bytes32 k = bytes32(uint256(uint160(KEY_MINH)));
        vm.prank(council);
        vault.setKeyDailyCap(KEY_MINH, 0);
        assertFalse(vault.isTighteningCap(0, k, 1));
        assertFalse(vault.isTighteningCap(0, k, 0));
    }

    function test_tightenLoosen_allowClassification() public view {
        assertTrue(vault.isTighteningAllow(0, bytes32(0), bytes4(0), false));
        assertFalse(vault.isTighteningAllow(0, bytes32(0), bytes4(0), true));
        assertTrue(vault.isTighteningAllow(1, bytes32(0), SWAP_SEL, false));
        assertFalse(vault.isTighteningAllow(2, bytes32(0), bytes4(0), true));
    }

    function testFuzz_capClassificationMatchesBehaviour(uint256 oldCap, uint256 newCap) public {
        oldCap = bound(oldCap, 0, type(uint128).max);
        newCap = bound(newCap, 0, type(uint128).max);
        vm.startPrank(council);
        vault.setKeyDailyCap(KEY_MINH, oldCap);
        vault.setPrincipalDailyCap(MINH, oldCap);
        vm.stopPrank();
        assertEq(vault.isTighteningCap(0, bytes32(uint256(uint160(KEY_MINH))), newCap), newCap < oldCap);
        assertEq(vault.isTighteningCap(1, MINH, newCap), newCap != 0 && (oldCap == 0 || newCap < oldCap));
    }

    function testFuzz_nonCouncilCannotLockOrPause(address caller, bytes32 id) public {
        vm.assume(caller != council);
        vm.startPrank(caller);
        vm.expectRevert(IPolicyVault.NotCouncil.selector);
        vault.lockPrincipal(id);
        vm.expectRevert(IPolicyVault.NotCouncil.selector);
        vault.pauseAll();
        vm.stopPrank();
        assertFalse(vault.paused());
        assertFalse(vault.principalLocked(id));
    }

    // ------------------------------------------------------------------- gas

    function test_gas_pay() public {
        vm.prank(KEY_MINH);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 500e6, bytes32(0));
    }

    function test_gas_swap() public {
        vm.prank(KEY_AGENT_REBALANCE);
        vault.swap(address(dex), SWAP_SEL, address(tUSDC), address(tTKB), 5_000e6, 0, bytes32(0));
    }
}
