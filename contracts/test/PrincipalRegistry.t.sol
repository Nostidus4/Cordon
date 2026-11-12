// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPrincipalRegistry, KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

contract PrincipalRegistryTest is MayLabsBase {
    PrincipalRegistry internal registry;

    function setUp() public override {
        super.setUp();
        registry = new PrincipalRegistry(council);
    }

    function _seed() internal {
        vm.startPrank(council);
        bytes32[7] memory ids = seedPrincipals();
        for (uint256 i; i < ids.length; ++i) {
            registry.createPrincipal(ids[i], string(abi.encodePacked(ids[i])));
        }
        SeedKey[8] memory ks = seedKeys();
        for (uint256 i; i < ks.length; ++i) {
            registry.addKey(ks[i].principalId, ks[i].key, ks[i].kind, ks[i].label);
        }
        vm.stopPrank();
    }

    // ------------------------------------------------------------ access control

    function test_zeroCouncilReverts() public {
        vm.expectRevert(PrincipalRegistry.ZeroCouncil.selector);
        new PrincipalRegistry(address(0));
    }

    function test_councilIsImmutable() public view {
        assertEq(registry.council(), council);
    }

    function test_onlyCouncilCanWrite() public {
        address rando = makeAddr("rando");
        vm.startPrank(rando);
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.createPrincipal(MINH, "minh");
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.addKey(MINH, KEY_MINH, KeyKind.HUMAN, "k");
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.moveKey(KEY_MINH, MINH);
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.deactivateKey(KEY_MINH);
        vm.stopPrank();
    }

    function test_deployerIsNotCouncil() public {
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.createPrincipal(MINH, "minh");
    }

    function testFuzz_nonCouncilReverts(address caller) public {
        vm.assume(caller != council);
        vm.prank(caller);
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.createPrincipal(MINH, "minh");
    }

    // ---------------------------------------------------------------- seed policy v1

    function test_seedPolicyV1() public {
        _seed();
        assertEq(registry.principalIds().length, 7);
        assertEq(registry.keysOf(HUY).length, 2);
        assertEq(registry.principalOf(KEY_MINH), bytes32("minh"));
        assertEq(registry.principalOf(KEY_HUY_2), HUY);
        (bytes32 pid, KeyKind kind, bool active, string memory label) = registry.keyInfo(KEY_AGENT_DATA);
        assertEq(pid, AGENT_DATA);
        assertEq(uint8(kind), uint8(KeyKind.AGENT));
        assertTrue(active);
        assertEq(label, unicode"Khoá Trợ lý Dữ liệu");
    }

    function test_principalIdsKeepInsertionOrder() public {
        _seed();
        bytes32[] memory ids = registry.principalIds();
        bytes32[7] memory expected = seedPrincipals();
        for (uint256 i; i < 7; ++i) {
            assertEq(ids[i], expected[i]);
        }
    }

    // ----------------------------------------------------------------- create / add

    function test_createPrincipalEmitsAndRejectsDuplicate() public {
        vm.startPrank(council);
        vm.expectEmit(true, false, false, true, address(registry));
        emit IPrincipalRegistry.PrincipalCreated(MINH, "Minh");
        registry.createPrincipal(MINH, "Minh");
        assertTrue(registry.principalExists(MINH));
        assertFalse(registry.principalExists(HUY));
        vm.expectRevert(IPrincipalRegistry.PrincipalExists.selector);
        registry.createPrincipal(MINH, "again");
        vm.stopPrank();
    }

    function test_addKeyEmitsAndRequiresPrincipal() public {
        vm.startPrank(council);
        vm.expectRevert(IPrincipalRegistry.PrincipalNotFound.selector);
        registry.addKey(MINH, KEY_MINH, KeyKind.HUMAN, "k");
        registry.createPrincipal(MINH, "Minh");
        vm.expectEmit(true, true, false, true, address(registry));
        emit IPrincipalRegistry.KeyAdded(MINH, KEY_MINH, KeyKind.HUMAN, "k");
        registry.addKey(MINH, KEY_MINH, KeyKind.HUMAN, "k");
        vm.stopPrank();
        assertEq(registry.keysOf(MINH).length, 1);
    }

    function test_addKeyRejectsKeyInOtherOrSameDistrict() public {
        _seed();
        vm.startPrank(council);
        vm.expectRevert(IPrincipalRegistry.KeyAlreadyRegistered.selector);
        registry.addKey(MINH, KEY_AGENT_DATA, KeyKind.AGENT, "dup other");
        vm.expectRevert(IPrincipalRegistry.KeyAlreadyRegistered.selector);
        registry.addKey(AGENT_DATA, KEY_AGENT_DATA, KeyKind.AGENT, "dup same");
        vm.stopPrank();
        assertEq(registry.keysOf(MINH).length, 1);
    }

    function test_addKeyRejectsDeactivatedKey() public {
        _seed();
        vm.startPrank(council);
        registry.deactivateKey(KEY_LAN);
        vm.expectRevert(IPrincipalRegistry.KeyAlreadyRegistered.selector);
        registry.addKey(HUY, KEY_LAN, KeyKind.HUMAN, "again");
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------- move

    function test_moveKeyUpdatesBothDistricts() public {
        _seed();
        vm.expectEmit(true, true, true, true, address(registry));
        emit IPrincipalRegistry.KeyMoved(KEY_AGENT_DATA, AGENT_DATA, MINH);
        vm.prank(council);
        registry.moveKey(KEY_AGENT_DATA, MINH);

        assertEq(registry.principalOf(KEY_AGENT_DATA), MINH);
        assertEq(registry.keysOf(AGENT_DATA).length, 0);
        address[] memory minhKeys = registry.keysOf(MINH);
        assertEq(minhKeys.length, 2);
        assertEq(minhKeys[0], KEY_MINH);
        assertEq(minhKeys[1], KEY_AGENT_DATA);
    }

    function test_moveKeySwapAndPopKeepsOtherKeys() public {
        _seed();
        // HUY holds [KEY_HUY_1, KEY_HUY_2]; move the first, the second takes its slot
        vm.startPrank(council);
        registry.moveKey(KEY_HUY_1, LAN);
        address[] memory huyKeys = registry.keysOf(HUY);
        assertEq(huyKeys.length, 1);
        assertEq(huyKeys[0], KEY_HUY_2);
        // the swapped key's index must still be right: moving it empties HUY
        registry.moveKey(KEY_HUY_2, LAN);
        vm.stopPrank();
        assertEq(registry.keysOf(HUY).length, 0);
        assertEq(registry.keysOf(LAN).length, 3);
    }

    function test_moveKeyErrors() public {
        _seed();
        vm.startPrank(council);
        vm.expectRevert(PrincipalRegistry.KeyNotRegistered.selector);
        registry.moveKey(STRANGER_WALLET, MINH);
        vm.expectRevert(IPrincipalRegistry.PrincipalNotFound.selector);
        registry.moveKey(KEY_MINH, bytes32("nobody"));
        vm.stopPrank();
    }

    function test_moveKeyToSameDistrictIsStable() public {
        _seed();
        vm.prank(council);
        registry.moveKey(KEY_HUY_1, HUY);
        address[] memory huyKeys = registry.keysOf(HUY);
        assertEq(huyKeys.length, 2);
        assertEq(huyKeys[0], KEY_HUY_2);
        assertEq(huyKeys[1], KEY_HUY_1);
    }

    function test_moveDeactivatedKeyStaysInactive() public {
        _seed();
        vm.startPrank(council);
        registry.deactivateKey(KEY_AGENT_DATA);
        registry.moveKey(KEY_AGENT_DATA, MINH);
        vm.stopPrank();
        (bytes32 pid,, bool active,) = registry.keyInfo(KEY_AGENT_DATA);
        assertEq(pid, MINH);
        assertFalse(active);
    }

    // ------------------------------------------------------------------- deactivate

    function test_deactivateKeepsPrincipal() public {
        _seed();
        vm.expectEmit(true, false, false, false, address(registry));
        emit IPrincipalRegistry.KeyDeactivated(KEY_AGENT_DATA);
        vm.prank(council);
        registry.deactivateKey(KEY_AGENT_DATA);

        assertEq(registry.principalOf(KEY_AGENT_DATA), AGENT_DATA);
        (bytes32 pid,, bool active,) = registry.keyInfo(KEY_AGENT_DATA);
        assertEq(pid, AGENT_DATA);
        assertFalse(active);
        assertEq(registry.keysOf(AGENT_DATA).length, 1);
    }

    function test_deactivateUnknownKeyReverts() public {
        vm.prank(council);
        vm.expectRevert(PrincipalRegistry.KeyNotRegistered.selector);
        registry.deactivateKey(KEY_MINH);
    }

    function test_unregisteredKeyViews() public view {
        (bytes32 pid, KeyKind kind, bool active, string memory label) = registry.keyInfo(STRANGER_WALLET);
        assertEq(pid, bytes32(0));
        assertEq(uint8(kind), 0);
        assertFalse(active);
        assertEq(bytes(label).length, 0);
        assertEq(registry.principalOf(STRANGER_WALLET), bytes32(0));
    }

    // ------------------------------------------------------------------------ fuzz

    /// @dev Random sequence of moves keeps every key in exactly one list, consistent with principalOf.
    function testFuzz_moveInvariant(uint8[12] calldata picks) public {
        _seed();
        SeedKey[8] memory ks = seedKeys();
        bytes32[7] memory ids = seedPrincipals();
        vm.startPrank(council);
        for (uint256 i; i < picks.length; i += 2) {
            registry.moveKey(ks[picks[i] % 8].key, ids[picks[i + 1] % 7]);
        }
        vm.stopPrank();

        uint256 total;
        for (uint256 p; p < 7; ++p) {
            address[] memory list = registry.keysOf(ids[p]);
            total += list.length;
            for (uint256 j; j < list.length; ++j) {
                assertEq(registry.principalOf(list[j]), ids[p]);
            }
        }
        assertEq(total, 8);
    }
}
