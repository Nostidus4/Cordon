// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Call} from "../src/interfaces/IGuardianCouncil.sol";
import {IMockDEX} from "../src/interfaces/IMockDEX.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry, KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {IAllowList} from "../src/precompiles/IAllowList.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";
import {VaultHandler} from "./helpers/VaultHandler.sol";

/// @title InvariantsTest
/// @notice I1 and I2 (docs/spec/README.md section 8.3) over random call sequences against the real Registry,
///         Vault and Council: pay, swap, day warps, emergency lock/pause/lowerCap by one member, unlock/unpause/
///         setCap through 2-of-3 proposals, with random keys, members and an outsider (see `VaultHandler`).
///         Runs/depth come from `[invariant]` in foundry.toml.
/// @dev Districts: A = `minh` (3 keys, cap 30.000), B = `lan` (1 key, no shared cap yet), C = `huy` (1 key, cap
///      15.000). Key caps: 20.000 (B: 10.000). The vault is funded far above any reachable spend.
contract InvariantsTest is MayLabsBase {
    PrincipalRegistry internal registry;
    PolicyVault internal vault;
    GuardianCouncil internal gc;
    VaultHandler internal handler;

    bytes4 internal constant SWAP_SEL = IMockDEX.swapExactIn.selector;
    uint256 internal constant DAY0 = 19_675 days;

    bytes32[3] internal pids = [MINH, LAN, HUY];

    function setUp() public override {
        super.setUp();
        vm.warp(DAY0 + 9 hours);

        uint256 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 2);
        registry = new PrincipalRegistry(predicted);
        vault = new PolicyVault(address(registry), predicted, address(tUSDC), address(dex), makeAddr("topUpOp"));
        gc = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault)
        );
        assertEq(address(gc), predicted, "council address prediction");
        txAllowList.__seedRole(address(gc), 2);
        deployerAllowList.__seedRole(address(gc), 2);

        address[5] memory keys = [KEY_MINH, KEY_AGENT_DATA, KEY_AGENT_INTL_PAY, KEY_LAN, KEY_HUY_1];
        bytes32[5] memory keyPrincipal = [MINH, MINH, MINH, LAN, HUY];
        _seed(keys, keyPrincipal);

        tUSDC.mint(address(vault), 100_000_000e6);
        tTKB.mint(address(vault), 100_000_000e18);
        tUSDC.mint(address(dex), 100_000_000e6);
        tTKB.mint(address(dex), 100_000_000e18);

        handler = new VaultHandler(
            vault,
            gc,
            tUSDC,
            tTKB,
            dex,
            keys,
            keyPrincipal,
            pids,
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY],
            [VENDOR_DATA_API, VENDOR_CLOUD]
        );

        targetContract(address(handler));
        // weights: spends dominate, admin actions are interleaved
        bytes4[] memory sel = new bytes4[](16);
        for (uint256 i; i < 5; ++i) {
            sel[i] = VaultHandler.pay.selector;
        }
        for (uint256 i = 5; i < 8; ++i) {
            sel[i] = VaultHandler.swap.selector;
        }
        sel[8] = VaultHandler.warp.selector;
        sel[9] = VaultHandler.warp.selector;
        sel[10] = VaultHandler.lock.selector;
        sel[11] = VaultHandler.unlock.selector;
        sel[12] = VaultHandler.lowerCap.selector;
        sel[13] = VaultHandler.setCap.selector;
        sel[14] = VaultHandler.pause.selector;
        sel[15] = VaultHandler.unpause.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    /// @dev Seed state installed the way production does it: proposals approved by two members, one per district.
    function _seed(address[5] memory keys, bytes32[5] memory keyPrincipal) internal {
        uint256[3] memory districtCap = [uint256(30_000e6), 0, 15_000e6];
        for (uint256 p; p < 3; ++p) {
            Call[] memory calls = new Call[](1 + 5 * 3);
            uint256 n;
            calls[n++] = Call(
                address(registry),
                abi.encodeCall(IPrincipalRegistry.createPrincipal, (pids[p], string(abi.encodePacked(pids[p]))))
            );
            for (uint256 k; k < 5; ++k) {
                if (keyPrincipal[k] != pids[p]) continue;
                calls[n++] = Call(
                    address(registry), abi.encodeCall(IPrincipalRegistry.addKey, (pids[p], keys[k], _kind(k), "key"))
                );
                calls[n++] = Call(
                    address(vault),
                    abi.encodeCall(
                        IPolicyVault.setKeyDailyCap, (keys[k], keys[k] == KEY_LAN ? 10_000e6 : KEY_DAILY_CAP)
                    )
                );
                calls[n++] = Call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (keys[k])));
            }
            if (districtCap[p] != 0) {
                calls[n++] =
                    Call(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (pids[p], districtCap[p])));
            }
            assembly {
                mstore(calls, n)
            }
            _approveByTwoOthers(_propose(MEMBER_TRANG, pids[p], calls), pids[p]);
        }

        Call[] memory g = new Call[](5);
        g[0] = Call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tUSDC), true)));
        g[1] = Call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tTKB), true)));
        g[2] = Call(address(vault), abi.encodeCall(IPolicyVault.setProtocolAllowed, (address(dex), SWAP_SEL, true)));
        g[3] = Call(address(vault), abi.encodeCall(IPolicyVault.setRecipientAllowed, (VENDOR_DATA_API, true)));
        g[4] = Call(address(vault), abi.encodeCall(IPolicyVault.setRecipientAllowed, (VENDOR_CLOUD, true)));
        _approveByTwoOthers(_propose(MEMBER_TRANG, bytes32(0), g), bytes32(0));
    }

    function _kind(uint256 k) internal pure returns (KeyKind) {
        return k < 3 ? KeyKind.AGENT : KeyKind.HUMAN;
    }

    function _propose(address member, bytes32 subject, Call[] memory calls) internal returns (uint256 id) {
        vm.prank(member);
        id = gc.propose("seed", subject, calls, keccak256("seed"));
    }

    function _approveByTwoOthers(uint256 id, bytes32 subject) internal {
        address[3] memory ms = [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY];
        for (uint256 m; m < 3; ++m) {
            if (gc.memberPrincipal(ms[m]) == subject && subject != bytes32(0)) continue;
            if (gc.getProposal(id).executed) break;
            vm.prank(ms[m]);
            gc.approve(id);
        }
        assertTrue(gc.getProposal(id).executed, "seed proposal executed");
    }

    // ------------------------------------------------------------ sanity: the seed is what the handler assumes

    function test_seedState() public view {
        assertEq(vault.principalDailyCap(MINH), 30_000e6);
        assertEq(vault.principalDailyCap(LAN), 0);
        assertEq(vault.principalDailyCap(HUY), 15_000e6);
        assertEq(vault.keyDailyCap(KEY_LAN), 10_000e6);
        assertEq(vault.keyDailyCap(KEY_AGENT_DATA), KEY_DAILY_CAP);
        assertEq(handler.daysCount(), 1);
    }

    // ------------------------------------------------------------ I1

    /// @notice I1: whenever `principalDailyCap[id] > 0`, `principalSpent[id][day] <= principalDailyCap[id]`, for every
    ///         day seen so far. A cap lowered below a day's booked spend is the documented exception (tightening);
    ///         that day is exempt, but every spend that actually succeeds is still checked against the cap in force.
    function invariant_I1_principalSpentNeverExceedsCap() public view {
        assertFalse(handler.i1SpendOverCap(), "a successful spend ended above the district cap");
        for (uint256 p; p < 3; ++p) {
            assertTrue(handler.i1Holds(pids[p]), "principalSpent > principalDailyCap");
        }
    }

    // ------------------------------------------------------------ I2

    /// @notice I2: while a district is locked its `principalSpent` does not change, on any day; no spend succeeds for
    ///         a key of a locked district.
    function invariant_I2_lockedDistrictSpendNeverIncreases() public view {
        assertFalse(handler.i2LockedSpend(), "a key of a locked district spent");
        for (uint256 p; p < 3; ++p) {
            assertTrue(handler.i2Holds(pids[p]), "principalSpent changed while locked");
        }
    }

    /// @notice Pause beats everything: no spend succeeds while the vault is paused.
    function invariant_pausedVaultNeverSpends() public view {
        assertFalse(handler.pausedSpend(), "a spend succeeded while paused");
    }
}
