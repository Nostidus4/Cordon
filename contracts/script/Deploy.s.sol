// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {EvilDEX} from "../src/dex/EvilDEX.sol";
import {MockDEX} from "../src/dex/MockDEX.sol";
import {TestScam} from "../src/tokens/TestScam.sol";
import {TestTokenB} from "../src/tokens/TestTokenB.sol";
import {TestUSDC} from "../src/tokens/TestUSDC.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title Deploy
/// @notice Step 1 of L1-002: deploy tokens, both DEXes, Registry, Vault and the Council, with liquidity in MockDEX.
///         Writes `Backend/deployments/<network>-l1.json` (addresses only). Run on a FRESH chain: it never touches
///         an old deployment.
/// @dev Registry and Vault take the Council address and the Council takes theirs, so the Council address is
///      predicted from the deployer nonce (same trick as `contracts/test` setUp) and checked after deployment.
///      Deployment order fixes the nonce offsets: registry +0, tUSDC +1, tTKB +2, tSCAM +3, MockDEX +4,
///      EvilDEX +5, Vault +6, Council +7. `topUpOperator` starts as the deployer on purpose: `Handover.s.sol`
///      moves it to the ops key through a Council proposal and `VerifyHandover.s.sol` checks it left the deployer.
///      Env: `DEPLOYER_PK`, `SEED_FILE` (Council members and their districts), `NETWORK` (`local`|`fuji`),
///      optional `COUNCIL_TIMELOCK_S` (Council timelock in seconds, default 0). With a timelock the bootstrap scripts (Seed,
///      Handover, PolicyV2, Reset) only queue their proposals; `infra/l1/contracts.sh` then runs `Execute`.
contract Deploy is L1Common {
    /// @dev DEX liquidity: 1.000.000 of each side (tUSDC has 6 decimals, tTKB 18).
    uint256 internal constant DEX_TUSDC = 1_000_000e6;
    uint256 internal constant DEX_TTKB = 1_000_000e18;

    function run() external returns (Dep memory d) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        string memory seed = vm.readFile(seedPath());

        address[3] memory members;
        bytes32[3] memory districts;
        for (uint256 i; i < 3; ++i) {
            members[i] = memberAt(seed, i);
            districts[i] = _district(seed, i);
        }
        uint256 startBlock = block.number;
        d = _deployAll(pk, deployer, members, districts);
        _write(d, members, startBlock);
        console.log("deployer           ", deployer);
        console.log("registry           ", d.registry);
        console.log("vault              ", d.vault);
        console.log("council            ", d.council);
        console.log("mockDex / evilDex  ", d.mockDex, d.evilDex);
        console.log("tUSDC / tTKB / tSCAM", d.tUSDC, d.tTKB, d.tSCAM);
        console.log("deployments written to", deploymentsPath());
    }

    function _deployAll(uint256 pk, address deployer, address[3] memory members, bytes32[3] memory districts)
        private
        returns (Dep memory d)
    {
        // #77: seconds a fully approved proposal waits before it executes; immutable in the Council
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 timelock = uint64(vm.envOr("COUNCIL_TIMELOCK_S", uint256(0)));
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 7);
        vm.startBroadcast(pk);
        d.registry = address(new PrincipalRegistry(predicted));
        d.tUSDC = address(new TestUSDC());
        d.tTKB = address(new TestTokenB());
        d.tSCAM = address(new TestScam());
        address[] memory approved = new address[](2);
        approved[0] = d.tUSDC;
        approved[1] = d.tTKB;
        d.mockDex = address(new MockDEX(predicted, approved));
        d.evilDex = address(new EvilDEX(predicted, approved));
        d.vault = address(new PolicyVault(d.registry, predicted, d.tUSDC, d.mockDex, deployer));
        d.council = address(new GuardianCouncil(members, districts, d.registry, d.vault, timelock));
        require(d.council == predicted, "council address prediction is off");
        TestUSDC(d.tUSDC).mint(d.mockDex, DEX_TUSDC);
        TestTokenB(d.tTKB).mint(d.mockDex, DEX_TTKB);
        vm.stopBroadcast();
    }

    /// @dev `council[i].principal_id` is a string, or null for the member without a district.
    function _district(string memory seed, uint256 i) private pure returns (bytes32) {
        string memory path = string.concat(".council[", vm.toString(i), "].principal_id");
        try vm.parseJsonString(seed, path) returns (string memory s) {
            return bytes(s).length == 0 ? bytes32(0) : toId(s);
        } catch {
            return bytes32(0);
        }
    }

    /// @dev Shape read by `Backend/src/guardian/chain/l1/deployments.py` (docs/spec/CONTRACTS.md section 9).
    ///      Addresses and numbers only: no key, no RPC URL.
    function _write(Dep memory d, address[3] memory members, uint256 startBlock) private {
        string memory c = string.concat(
            '    "registry": "',
            vm.toString(d.registry),
            '",\n    "vault": "',
            vm.toString(d.vault),
            '",\n    "council": "',
            vm.toString(d.council),
            '",\n    "mockDex": "',
            vm.toString(d.mockDex),
            '",\n    "evilDex": "',
            vm.toString(d.evilDex),
            '",\n    "tUSDC": "',
            vm.toString(d.tUSDC),
            '",\n    "tTKB": "',
            vm.toString(d.tTKB),
            '",\n    "tSCAM": "',
            vm.toString(d.tSCAM),
            '"\n'
        );
        string memory json = string.concat(
            '{\n  "chainId": ',
            vm.toString(block.chainid),
            ',\n  "deployBlock": ',
            vm.toString(startBlock),
            ',\n  "deployedAt": ',
            vm.toString(vm.unixTime() / 1000),
            ',\n  "contracts": {\n',
            c,
            '  },\n  "precompiles": {\n    "contractDeployerAllowList": "',
            vm.toString(DEPLOYER_ALLOWLIST),
            '",\n    "txAllowList": "',
            vm.toString(TX_ALLOWLIST),
            '"\n  },\n  "members": {\n    "trang": "',
            vm.toString(members[0]),
            '",\n    "lan": "',
            vm.toString(members[1]),
            '",\n    "huy": "',
            vm.toString(members[2]),
            '"\n  }\n}\n'
        );
        vm.writeFile(deploymentsPath(), json);
    }
}
