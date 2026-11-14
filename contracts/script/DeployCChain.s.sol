// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {CChainUSDC} from "../src/cchain/CChainUSDC.sol";
import {SimpleMultisig} from "../src/cchain/SimpleMultisig.sol";

/// @title DeployCChain
/// @notice OPS-002: deploy the C-Chain treasury (3-of-5 `SimpleMultisig`) and the test tUSDC, mint 2.000.000 tUSDC
///         to the multisig, and write `Backend/deployments/<fuji|local>-c.json` (addresses only, no keys).
/// @dev Env: `CCHAIN_DEPLOYER_KEY`, `CCHAIN_OWNER_KEY_1..5` (only their addresses are used and written), `NETWORK`
///      (`local` default | `fuji`), `CCHAIN_RPC_URL` and `CCHAIN_WS_URL` (recorded as-is; empty ws -> `null`),
///      optional `CCHAIN_DEPLOYMENTS_OUT`. `infra/cchain/cchain.sh` sets them and refuses Fuji without
///      `I_UNDERSTAND=fuji`. The escrow is a fixed address nobody holds a key for: the "bridge escrow" of the
///      simulated top-up.
contract DeployCChain is Script {
    uint256 internal constant TREASURY = 2_000_000e6;
    uint256 internal constant THRESHOLD = 3;
    uint256 internal constant N_OWNERS = 5;

    /// @dev Keyless sink: a hash-derived address, so tokens sent there are out of the company's hands.
    address internal constant ESCROW = address(uint160(uint256(keccak256("guardian.simulated-bridge-escrow"))));

    function run() external {
        uint256 pk = vm.envUint("CCHAIN_DEPLOYER_KEY");
        string memory network = vm.envOr("NETWORK", string("local"));
        require(
            keccak256(bytes(network)) == keccak256("local") || keccak256(bytes(network)) == keccak256("fuji"),
            "NETWORK must be local or fuji"
        );
        address[] memory owners = new address[](N_OWNERS);
        for (uint256 i; i < N_OWNERS; ++i) {
            owners[i] = vm.addr(vm.envUint(string.concat("CCHAIN_OWNER_KEY_", vm.toString(i + 1))));
        }
        uint256 deployBlock = block.number;

        vm.startBroadcast(pk);
        SimpleMultisig safe = new SimpleMultisig(owners, THRESHOLD);
        CChainUSDC token = new CChainUSDC();
        token.mint(address(safe), TREASURY);
        token.setMinter(address(safe));
        vm.stopBroadcast();

        _write(network, address(token), address(safe), owners, deployBlock);
        console.log("treasury (multisig)", address(safe));
        console.log("token (tUSDC)      ", address(token));
        console.log("escrow             ", ESCROW);
    }

    function _write(string memory network, address token, address safe, address[] memory owners, uint256 deployBlock)
        private
    {
        string memory ws = vm.envOr("CCHAIN_WS_URL", string(""));
        string memory ownersJson = "[";
        for (uint256 i; i < owners.length; ++i) {
            ownersJson = string.concat(ownersJson, i == 0 ? "" : ", ", _q(vm.toString(owners[i])));
        }
        ownersJson = string.concat(ownersJson, "]");
        string memory head = string.concat(
            "{\n",
            '  "network": ',
            _q(network),
            ",\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "rpcUrl": ',
            _q(vm.envOr("CCHAIN_RPC_URL", string(""))),
            ",\n",
            '  "wsUrl": ',
            bytes(ws).length == 0 ? "null" : _q(ws),
            ",\n"
        );
        string memory tail = string.concat(
            '  "token": ',
            _q(vm.toString(token)),
            ",\n",
            '  "treasury": ',
            _q(vm.toString(safe)),
            ",\n",
            '  "escrow": ',
            _q(vm.toString(ESCROW)),
            ",\n",
            '  "owners": ',
            ownersJson,
            ",\n",
            '  "threshold": ',
            vm.toString(THRESHOLD),
            ",\n",
            '  "deployBlock": ',
            vm.toString(deployBlock),
            "\n}\n"
        );
        string memory path =
            vm.envOr("CCHAIN_DEPLOYMENTS_OUT", string.concat("../Backend/deployments/", network, "-c.json"));
        vm.writeFile(path, string.concat(head, tail));
        console.log("deployment written to", path);
    }

    function _q(string memory s) private pure returns (string memory) {
        return string.concat('"', s, '"');
    }
}
