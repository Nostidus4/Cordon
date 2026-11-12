// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MayLabsBase} from "./helpers/MayLabsBase.sol";

/// @dev Guards the shared seed against drifting from Backend/seed/may_labs.json (counts, uniqueness, id padding).
contract MayLabsBaseTest is MayLabsBase {
    function test_seed_shape() public pure {
        assertEq(seedPrincipals().length, 7);
        assertEq(seedKeys().length, 8);
        assertEq(seedMembers().length, 3);
    }

    function test_every_key_belongs_to_a_seed_principal_and_is_unique() public pure {
        bytes32[7] memory ids = seedPrincipals();
        SeedKey[8] memory ks = seedKeys();
        for (uint256 i; i < ks.length; ++i) {
            bool found;
            for (uint256 j; j < ids.length; ++j) {
                if (ids[j] == ks[i].principalId) found = true;
            }
            assertTrue(found);
            for (uint256 j = i + 1; j < ks.length; ++j) {
                assertTrue(ks[i].key != ks[j].key);
            }
        }
    }

    function test_principal_ids_are_right_padded_ascii() public pure {
        assertEq(MINH, bytes32(0x6d696e68_00000000_00000000_00000000_00000000_00000000_00000000_00000000));
    }

    function test_huy_owns_two_keys() public pure {
        SeedKey[8] memory ks = seedKeys();
        uint256 n;
        for (uint256 i; i < ks.length; ++i) {
            if (ks[i].principalId == HUY) ++n;
        }
        assertEq(n, 2);
    }

    function test_deployed_fixtures() public view {
        assertEq(council.code.length, 0); // plain address until the Council contract exists (CTR-006)
        assertEq(dex.council(), council);
        assertEq(evilDex.council(), council);
        assertEq(tUSDC.decimals(), 6);
    }
}
