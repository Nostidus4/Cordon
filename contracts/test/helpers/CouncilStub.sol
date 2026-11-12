// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CouncilStub
/// @notice Test-only stand-in for GuardianCouncil used by the backend L1 adapter tests (anvil). It exposes the
///         read surface the adapter uses (`members`, `memberPrincipal`) and forwards arbitrary admin calls, so a test
///         can seed the registry and vault as "the Council" without the real 2/3 flow. Never deploy outside tests:
///         anyone can `forward`.
contract CouncilStub {
    address[] public members;
    mapping(address member => bytes32 principalId) public memberPrincipal;

    constructor(address[] memory members_, bytes32[] memory principals_) {
        for (uint256 i; i < members_.length; ++i) {
            members.push(members_[i]);
            memberPrincipal[members_[i]] = principals_[i];
        }
    }

    function forward(address target, bytes calldata data) external {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
