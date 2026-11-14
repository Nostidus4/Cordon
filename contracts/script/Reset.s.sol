// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {Call} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "../src/interfaces/IPrincipalRegistry.sol";
import {MintableToken} from "../src/tokens/MintableToken.sol";
import {L1Common, console} from "./L1Common.sol";

/// @notice Shared helpers of the demo-reset scripts (OPS-003): Council proposals approved by two members.
abstract contract ResetBase is L1Common {
    /// @dev Propose and approve through `council` with two members who have no district in `subject` (no conflict
    ///      of interest). Member keys come from `L1_KEY_<seed_id>`, the order and ids from the seed file.
    function passProposal(
        address council,
        string memory seed,
        string memory title,
        bytes32 subject,
        Call[] memory calls
    ) internal returns (uint256 id) {
        requireNoTimelock(council);
        GuardianCouncil gc = GuardianCouncil(council);
        uint256[2] memory pick;
        uint256 n;
        for (uint256 i; i < 3 && n < 2; ++i) {
            bytes32 own = gc.memberPrincipal(memberAt(seed, i));
            if (subject == bytes32(0) || own != subject) pick[n++] = i;
        }
        require(n == 2, "reset: no two members without a conflict");
        vm.startBroadcast(pkOf(memberSeedId(seed, pick[0])));
        id = gc.propose(title, subject, calls, bytes32(0));
        gc.approve(id);
        vm.stopBroadcast();
        vm.startBroadcast(pkOf(memberSeedId(seed, pick[1])));
        gc.approve(id);
        vm.stopBroadcast();
        console.log("proposal executed", id);
    }

    function memberSeedId(string memory seed, uint256 i) internal pure returns (string memory) {
        return vm.parseJsonString(seed, string.concat(".council[", vm.toString(i), "].seed_id"));
    }
}

/// @title ResetOpen
/// @notice Demo-reset step 1: after the handover the deployer has no role on either AllowList, so it cannot deploy.
///         The OLD Council (admin of both lists) enables it with one 2-of-3 proposal (`setEnabled` on the Tx list and
///         the Contract Deployer list). `Enabled` is enough to deploy and send; it cannot change any role.
///         `ResetSwitch` removes it again at the end. Skipped when the deployer can already deploy.
/// @dev Env: `DEPLOYER_PK`, `L1_KEY_COUNCIL_*`, `SEED_FILE`, `NETWORK`, optional `OLD_DEPLOYMENTS`.
contract ResetOpen is ResetBase {
    function run() external {
        simulateAllowLists();
        Dep memory old = loadDeploymentFrom(oldDeploymentsPath());
        string memory seed = vm.readFile(seedPath());
        address deployer = vm.addr(vm.envUint("DEPLOYER_PK"));
        if (roleOf(TX_ALLOWLIST, deployer) != 0 && roleOf(DEPLOYER_ALLOWLIST, deployer) != 0) {
            console.log("deployer can already deploy; nothing to open");
            return;
        }
        Call[] memory calls = new Call[](2);
        calls[0] = Call(TX_ALLOWLIST, abi.encodeWithSignature("setEnabled(address)", deployer));
        calls[1] = Call(DEPLOYER_ALLOWLIST, abi.encodeWithSignature("setEnabled(address)", deployer));
        passProposal(old.council, seed, "Demo reset: cho phep trien khai bo hop dong moi", bytes32(0), calls);
    }
}

/// @title ResetSwitch
/// @notice Demo-reset step 3, after `Deploy` and `Seed` of the NEW set (`DEPLOYMENTS_OUT`):
///         1. every spending key the previous run locked (`readAllowList` 0) is enabled again, by the OLD Council
///            (one proposal per district the key belongs to, so the members approving have no stake in it);
///         2. the OLD Council hands both precompiles to the NEW Council and drops its own role, in ONE proposal
///            (`setAdmin(new)` x2, `setNone(old)` x2); this is the only use of `setAdmin` by a Council;
///         3. the deployer gives the token minters to the new Council;
///         4. the NEW Council moves the vault top-up operator to the ops key and removes the deployer from both
///            lists (it is the new admin), so the deployer ends with no role: `VerifyHandover` passes;
///         5. filler proposals (proposed and cancelled) bring the new Council's counter to 11, so the next proposal,
///            request #12 (spec 10.4), gets id 12.
/// @dev Env: `DEPLOYER_PK`, `TOP_UP_OPERATOR`, `L1_KEY_COUNCIL_*`, `SEED_FILE`, `NETWORK`, `DEPLOYMENTS_OUT` (the new
///      set), optional `OLD_DEPLOYMENTS`.
contract ResetSwitch is ResetBase {
    uint256 internal constant NEXT_REQUEST_ID = 12;

    function run() external {
        simulateAllowLists();
        Dep memory old = loadDeploymentFrom(oldDeploymentsPath());
        Dep memory nw = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerPk);
        address ops = vm.envAddress("TOP_UP_OPERATOR");
        require(ops != address(0) && ops != deployer, "TOP_UP_OPERATOR must be set and not the deployer");
        require(old.council != nw.council, "OLD_DEPLOYMENTS and DEPLOYMENTS_OUT are the same deployment");

        _reenableLockedKeys(old, seed);

        Call[] memory hand = new Call[](4);
        hand[0] = Call(TX_ALLOWLIST, abi.encodeWithSignature("setAdmin(address)", nw.council));
        hand[1] = Call(DEPLOYER_ALLOWLIST, abi.encodeWithSignature("setAdmin(address)", nw.council));
        hand[2] = Call(TX_ALLOWLIST, abi.encodeWithSignature("setNone(address)", old.council));
        hand[3] = Call(DEPLOYER_ALLOWLIST, abi.encodeWithSignature("setNone(address)", old.council));
        passProposal(old.council, seed, "Demo reset: chuyen quyen quan tri sang Hoi dong moi", bytes32(0), hand);

        vm.startBroadcast(deployerPk);
        MintableToken(nw.tUSDC).setMinter(nw.council);
        MintableToken(nw.tTKB).setMinter(nw.council);
        MintableToken(nw.tSCAM).setMinter(nw.council);
        vm.stopBroadcast();

        Call[] memory fin = new Call[](3);
        fin[0] = Call(nw.vault, abi.encodeCall(IPolicyVault.setTopUpOperator, (ops)));
        fin[1] = Call(TX_ALLOWLIST, abi.encodeWithSignature("setNone(address)", deployer));
        fin[2] = Call(DEPLOYER_ALLOWLIST, abi.encodeWithSignature("setNone(address)", deployer));
        passProposal(nw.council, seed, "Doi khoa van hanh nap quy", bytes32(0), fin);

        _fillCounter(nw, seed, ops);
        console.log("reset switch done; new council", nw.council);
    }

    /// @dev Keys flagged `allow_listed` in the seed that read role 0 (locked by the previous run) get `setEnabled`.
    function _reenableLockedKeys(Dep memory old, string memory seed) private {
        address[] memory keys = addrs(seed, ".keys[*].address");
        bool[] memory flags = bools(seed, ".keys[*].allow_listed");
        bytes32[] memory owner = new bytes32[](keys.length);
        bool[] memory locked = new bool[](keys.length);
        for (uint256 i; i < keys.length; ++i) {
            if (flags[i] && roleOf(TX_ALLOWLIST, keys[i]) == 0) {
                locked[i] = true;
                // keys moved by an executed proposal belong to their current district
                try IPrincipalRegistry(old.registry).principalOf(keys[i]) returns (bytes32 p) {
                    owner[i] = p;
                } catch {}
            }
        }
        for (uint256 i; i < keys.length; ++i) {
            if (!locked[i]) continue;
            bool seen;
            for (uint256 j; j < i; ++j) {
                if (locked[j] && owner[j] == owner[i]) seen = true;
            }
            if (seen) continue;
            uint256 n;
            for (uint256 j = i; j < keys.length; ++j) {
                if (locked[j] && owner[j] == owner[i]) ++n;
            }
            Call[] memory calls = new Call[](n);
            n = 0;
            for (uint256 j = i; j < keys.length; ++j) {
                if (locked[j] && owner[j] == owner[i]) {
                    calls[n++] = Call(TX_ALLOWLIST, abi.encodeWithSignature("setEnabled(address)", keys[j]));
                }
            }
            passProposal(old.council, seed, "Demo reset: mo lai cac khoa da bi khoa", owner[i], calls);
        }
    }

    /// @dev Propose and cancel (the proposer cancels its own) until the counter is `NEXT_REQUEST_ID - 1`.
    function _fillCounter(Dep memory nw, string memory seed, address ops) private {
        GuardianCouncil gc = GuardianCouncil(nw.council);
        require(gc.proposalCount() < NEXT_REQUEST_ID, "council counter already past the request #12 id");
        Call[] memory calls = new Call[](1);
        calls[0] = Call(nw.vault, abi.encodeCall(IPolicyVault.setTopUpOperator, (ops)));
        vm.startBroadcast(pkOf(memberSeedId(seed, 0)));
        while (gc.proposalCount() < NEXT_REQUEST_ID - 1) {
            uint256 id = gc.propose("Giu cho so de xuat", bytes32(0), calls, bytes32(0));
            gc.cancel(id);
        }
        vm.stopBroadcast();
    }
}
