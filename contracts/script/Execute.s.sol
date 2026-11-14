// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGuardianCouncil, Proposal} from "../src/interfaces/IGuardianCouncil.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title Execute
/// @notice Phase 2 of the bootstrap with a Council timelock (#77): runs every proposal that is queued (threshold
///         reached, `etaOf != 0`) and neither executed nor cancelled, in id order, signed by Trang. A proposal id
///         order matters: later ones may depend on earlier ones (Reset: re-enable keys before the hand-over).
///         A no-op for a Council without a timelock (everything executed inside `approve`).
/// @dev Env: `L1_KEY_COUNCIL_TRANG`, `SEED_FILE`, `NETWORK`, and the Council either as `COUNCIL` (address) or
///      through the deployments file (`DEPLOYMENTS_OUT`). Reverts `TimelockNotReady` while the chain's latest block is
///      older than a proposal's eta; `infra/l1/contracts.sh` waits for that and retries.
contract Execute is L1Common {
    function run() external {
        simulateAllowLists();
        address council = vm.envOr("COUNCIL", address(0));
        if (council == address(0)) council = loadDeployment().council;
        IGuardianCouncil c = IGuardianCouncil(council);
        uint256 n = c.proposalCount();
        vm.startBroadcast(pkOf("council_trang"));
        for (uint256 id = 1; id <= n; ++id) {
            if (c.etaOf(id) == 0) continue;
            Proposal memory p = c.getProposal(id);
            if (p.executed || p.cancelled) continue;
            c.execute(id);
            console.log("executed queued proposal", id);
        }
        vm.stopBroadcast();
    }
}
