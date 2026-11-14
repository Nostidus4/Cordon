// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {Call} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {MintableToken} from "../src/tokens/MintableToken.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title Handover
/// @notice Step 3 of L1-002 (spec 6.1, T15): after this script the deployer holds no power.
///         1. `setAdmin(Council)` on both precompiles (Tx AllowList 0x02..02, Contract Deployer AllowList 0x02..00);
///         2. `setEnabled` for every spending key, Council member and the ops key on the Tx AllowList;
///         3. `setTopUpOperator(ops)` through a Council proposal (Trang proposes, Trang and Lan approve), so the
///            vault operator is no longer the deployer;
///         4. token minting moves to the Council (`setMinter`);
///         5. deployer `setNone(deployer)` on the Contract Deployer list, then on the Tx list.
/// @dev Order matters. The deployer needs its own Tx AllowList role to send transactions, so its Tx role is the very
///      last thing it removes. `VerifyHandover.s.sol` proves the result against the real precompiles.
///      Env: `DEPLOYER_PK`, `TOP_UP_OPERATOR` (address of the ops key), `L1_KEY_COUNCIL_TRANG|LAN`, `SEED_FILE`,
///      `NETWORK`. The Council is made admin of the precompiles but cannot be asked to mint: after this script no
///      one can mint tokens except through a future Council action.
contract Handover is L1Common {
    function run() external {
        simulateAllowLists();
        Dep memory d = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerPk);
        address ops = vm.envAddress("TOP_UP_OPERATOR");
        require(ops != address(0) && ops != deployer, "TOP_UP_OPERATOR must be set and not the deployer");

        address[] memory spenders = addrs(seed, ".keys[*].address");
        address[] memory allowListed;
        {
            bool[] memory flags = bools(seed, ".keys[*].allow_listed");
            uint256 n;
            for (uint256 i; i < flags.length; ++i) {
                if (flags[i]) ++n;
            }
            allowListed = new address[](n);
            n = 0;
            for (uint256 i; i < flags.length; ++i) {
                if (flags[i]) allowListed[n++] = spenders[i];
            }
        }

        vm.startBroadcast(deployerPk);
        // 1. the Council becomes admin of both precompiles
        setRole(TX_ALLOWLIST, "setAdmin(address)", d.council);
        setRole(DEPLOYER_ALLOWLIST, "setAdmin(address)", d.council);
        // 2. every key that may spend or vote, plus the ops key, can send transactions
        for (uint256 i; i < allowListed.length; ++i) {
            setRole(TX_ALLOWLIST, "setEnabled(address)", allowListed[i]);
        }
        for (uint256 i; i < 3; ++i) {
            setRole(TX_ALLOWLIST, "setEnabled(address)", memberAt(seed, i));
        }
        setRole(TX_ALLOWLIST, "setEnabled(address)", ops);
        // 4. minting goes to the Council (only the current minter, the deployer, can do this)
        MintableToken(d.tUSDC).setMinter(d.council);
        MintableToken(d.tTKB).setMinter(d.council);
        MintableToken(d.tSCAM).setMinter(d.council);
        vm.stopBroadcast();

        // 3. the vault's top-up operator leaves the deployer, by a 2-of-3 Council proposal (setTopUpOperator is a
        //    loosening call: there is no single-member path)
        requireNoTimelock(d.council);
        Call[] memory calls = new Call[](1);
        calls[0] = Call(d.vault, abi.encodeCall(IPolicyVault.setTopUpOperator, (ops)));
        vm.startBroadcast(pkOf("council_trang"));
        uint256 id = GuardianCouncil(d.council).propose("Doi khoa van hanh nap quy", bytes32(0), calls, bytes32(0));
        GuardianCouncil(d.council).approve(id);
        vm.stopBroadcast();
        vm.startBroadcast(pkOf("council_lan"));
        GuardianCouncil(d.council).approve(id);
        vm.stopBroadcast();

        // 5. the deployer gives up its own roles, Tx AllowList last
        vm.startBroadcast(deployerPk);
        setRole(DEPLOYER_ALLOWLIST, "setNone(address)", deployer);
        setRole(TX_ALLOWLIST, "setNone(address)", deployer);
        vm.stopBroadcast();

        console.log("handover done; topUpOperator ->", ops);
    }
}
