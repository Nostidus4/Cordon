// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "../src/interfaces/IPrincipalRegistry.sol";
import {MintableToken} from "../src/tokens/MintableToken.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title VerifyHandover
/// @notice T15 against the real precompiles: reads `readAllowList` on both and the contract owners, and FAILS (the
///         script reverts, exit code 1) if the deployer still has any role or power, if `topUpOperator` is the
///         deployer, if the Council is not admin of both precompiles, or if an expected key is not enabled.
///         Read-only: run it with `--rpc-url` and no `--broadcast`.
/// @dev Env: `DEPLOYER_ADDRESS` (or `DEPLOYER_PK`, only used to derive the address), `SEED_FILE`, `NETWORK`,
///      optional `TOP_UP_OPERATOR` (then it must equal the vault's operator).
contract VerifyHandover is L1Common {
    uint256 internal constant NONE = 0;
    uint256 internal constant ENABLED = 1;
    uint256 internal constant ADMIN = 2;

    function run() external {
        Dep memory d = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        address deployer = vm.envOr("DEPLOYER_ADDRESS", address(0));
        if (deployer == address(0)) deployer = vm.addr(vm.envUint("DEPLOYER_PK"));

        // deployer: no role on either precompile, council: admin of both
        _expect("Tx AllowList: deployer role", roleOf(TX_ALLOWLIST, deployer), NONE);
        _expect("Deployer AllowList: deployer role", roleOf(DEPLOYER_ALLOWLIST, deployer), NONE);
        _expect("Tx AllowList: council role", roleOf(TX_ALLOWLIST, d.council), ADMIN);
        _expect("Deployer AllowList: council role", roleOf(DEPLOYER_ALLOWLIST, d.council), ADMIN);

        // every spending key flagged in the seed and every member can send; the Council members have no role on the
        // deployer list
        address[] memory keys = addrs(seed, ".keys[*].address");
        bool[] memory flags = bools(seed, ".keys[*].allow_listed");
        for (uint256 i; i < keys.length; ++i) {
            if (flags[i]) {
                _expect(
                    string.concat("Tx AllowList: key ", vm.toString(keys[i])), roleOf(TX_ALLOWLIST, keys[i]), ENABLED
                );
            }
        }
        for (uint256 i; i < 3; ++i) {
            address m = memberAt(seed, i);
            _expect(string.concat("Tx AllowList: member ", vm.toString(m)), roleOf(TX_ALLOWLIST, m), ENABLED);
            _expect(string.concat("Deployer AllowList: member ", vm.toString(m)), roleOf(DEPLOYER_ALLOWLIST, m), NONE);
        }

        // contract side
        address op = IPolicyVault(d.vault).topUpOperator();
        require(op != deployer, "FAIL: topUpOperator is still the deployer");
        address expectedOp = vm.envOr("TOP_UP_OPERATOR", address(0));
        if (expectedOp != address(0)) require(op == expectedOp, "FAIL: topUpOperator is not the expected ops key");
        require(roleOf(TX_ALLOWLIST, op) == ENABLED, "FAIL: topUpOperator cannot send (not enabled)");
        require(IPolicyVault(d.vault).council() == d.council, "FAIL: vault council");
        require(IPrincipalRegistry(d.registry).council() == d.council, "FAIL: registry council");
        require(MintableToken(d.tUSDC).minter() == d.council, "FAIL: tUSDC minter is not the council");
        require(MintableToken(d.tTKB).minter() == d.council, "FAIL: tTKB minter is not the council");
        require(MintableToken(d.tSCAM).minter() == d.council, "FAIL: tSCAM minter is not the council");

        console.log("topUpOperator", op);
        console.log("VerifyHandover: PASS (deployer has no role and no power left)");
    }

    function _expect(string memory what, uint256 got, uint256 want) private pure {
        if (got != want) {
            revert(string.concat("FAIL: ", what, " = ", vm.toString(got), ", expected ", vm.toString(want)));
        }
        console.log(string.concat("ok  ", what, " = ", vm.toString(got)));
    }
}
