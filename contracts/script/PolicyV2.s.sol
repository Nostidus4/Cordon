// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {Call} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "../src/interfaces/IPrincipalRegistry.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title PolicyV2
/// @notice Policy v2 (spec 4.3, `policy_v2` in the seed) through the Council path: move the four non-minh keys into
///         district `minh` and set its shared daily cap to 30.000 tUSDC. Lan proposes, Lan and Trang approve (Huy's
///         district is not touched; Lan's is not either, so both may approve). The proposal bumps the vault's policy
///         version by one.
/// @dev Env: `L1_KEY_COUNCIL_LAN|TRANG`, `SEED_FILE`, `NETWORK`. Run after `Seed`; not part of the bootstrap chain,
///      because the scene-4 flow of the backend starts from policy v1.
contract PolicyV2 is L1Common {
    function run() external {
        Dep memory d = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        bytes32 minh = toId(vm.parseJsonString(seed, ".policy_v2.subject_principal"));

        Call[] memory calls = new Call[](5);
        for (uint256 i; i < 4; ++i) {
            string memory base = string.concat(".policy_v2.calls[", vm.toString(i), "]");
            require(
                keccak256(bytes(vm.parseJsonString(seed, string.concat(base, ".fn")))) == keccak256("moveKey"),
                "seed: moveKey expected"
            );
            address key = vm.parseJsonAddress(seed, string.concat(base, ".args.key"));
            calls[i] = Call(d.registry, abi.encodeCall(IPrincipalRegistry.moveKey, (key, minh)));
        }
        uint256 cap = vm.parseJsonUint(seed, ".policy_v2.calls[4].args.cap");
        calls[4] = Call(d.vault, abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (minh, cap)));

        uint256 before_ = IPolicyVault(d.vault).policyVersion();
        GuardianCouncil council = GuardianCouncil(d.council);
        string memory title = "Gom 5 khoa ve khu minh, han muc chung 30.000";
        vm.startBroadcast(pkOf("council_lan"));
        uint256 id = council.propose(title, minh, calls, bytes32(0));
        council.approve(id);
        vm.stopBroadcast();
        vm.startBroadcast(pkOf("council_trang"));
        council.approve(id);
        vm.stopBroadcast();

        console.log("policy v2 proposal executed", id);
        console.log("policyVersion before", before_);
        console.log("policyVersion after ", IPolicyVault(d.vault).policyVersion());
    }
}
