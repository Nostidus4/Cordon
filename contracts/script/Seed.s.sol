// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {Call} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry, KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {TestUSDC} from "../src/tokens/TestUSDC.sol";
import {L1Common, console} from "./L1Common.sol";

/// @title Seed
/// @notice Step 2 of L1-002: May Labs policy v1 (7 districts, 8 keys, per-key caps, allow-lists for the vendors,
///         tUSDC/tTKB and MockDEX only) and 200.000 tUSDC in the vault. The Council is the only writer of
///         Registry and Vault, so the policy goes in through real Council proposals, each approved by two members
///         who have no district in it (spec section 6.5).
/// @dev Two proposals are the minimum: a single one would touch both the `lan` and the `huy` district and leave
///      only Trang to approve. Proposal 1 (everything except `huy`, subject `minh`) is proposed by Trang and approved
///      by Trang and Huy (Lan's district is in it). Proposal 2 (`huy` and its two keys) is approved by Trang and
///      Lan. Every executed proposal bumps the vault's policy version, so the version after seeding is 3.
///      Keys are not enabled here: the L1 genesis (or the Tx AllowList admin) already did that and the Council is
///      not yet admin; `Handover.s.sol` makes the roles explicit.
///      Env: `DEPLOYER_PK` (mints the vault funding, still the token minter), `L1_KEY_COUNCIL_TRANG|LAN|HUY`,
///      `SEED_FILE`, `NETWORK`.
contract Seed is L1Common {
    function run() external {
        Dep memory d = loadDeployment();
        string memory seed = vm.readFile(seedPath());
        requireNoTimelock(d.council);
        GuardianCouncil council = GuardianCouncil(d.council);

        Call[] memory first = _firstProposalCalls(seed, d);
        Call[] memory second = _secondProposalCalls(seed, d);

        _passProposal(
            council,
            "Khoi tao chinh sach v1: 6 khu, 6 khoa, danh sach cho phep",
            toId("minh"),
            first,
            "council_trang",
            "council_huy"
        );
        _passProposal(council, "Khoi tao chinh sach v1: khu huy", toId("huy"), second, "council_trang", "council_lan");

        uint256 funding = vm.parseJsonUint(seed, ".vault_balances.tUSDC");
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        TestUSDC(d.tUSDC).mint(d.vault, funding);
        vm.stopBroadcast();

        console.log("seeded; vault policyVersion", IPolicyVault(d.vault).policyVersion());
    }

    /// @dev Proposer `proposerId` proposes and approves, `secondId` approves: that is the 2 of 3.
    function _passProposal(
        GuardianCouncil council,
        string memory title,
        bytes32 subject,
        Call[] memory calls,
        string memory proposerId,
        string memory secondId
    ) private {
        vm.startBroadcast(pkOf(proposerId));
        uint256 id = council.propose(title, subject, calls, bytes32(0));
        council.approve(id);
        vm.stopBroadcast();
        vm.startBroadcast(pkOf(secondId));
        council.approve(id);
        vm.stopBroadcast();
        console.log("proposal executed", id);
    }

    /// @dev Seed arrays, parsed once.
    struct Rows {
        string[] pIds;
        string[] pLabels;
        string[] kPrincipal;
        string[] kLabel;
        string[] kKind;
        address[] kAddr;
        uint256[] kCap;
    }

    /// @dev Call list under construction.
    struct Buf {
        Call[] calls;
        uint256 n;
    }

    function _rows(string memory seed) private pure returns (Rows memory r) {
        r.pIds = strs(seed, ".principals[*].id");
        r.pLabels = strs(seed, ".principals[*].label");
        r.kPrincipal = strs(seed, ".keys[*].principal_id");
        r.kLabel = strs(seed, ".keys[*].label");
        r.kKind = strs(seed, ".keys[*].kind");
        r.kAddr = addrs(seed, ".keys[*].address");
        r.kCap = uints(seed, ".keys[*].daily_cap");
    }

    function _push(Buf memory b, address target, bytes memory data) private pure {
        b.calls[b.n++] = Call(target, data);
    }

    /// @dev `onlyHuy`: false = every district except `huy` (plus the allow-lists), true = only `huy` and its keys.
    function _districtCalls(Buf memory b, Rows memory r, Dep memory d, bool onlyHuy) private pure {
        bytes32 huy = toId("huy");
        for (uint256 i; i < r.pIds.length; ++i) {
            bytes32 id = toId(r.pIds[i]);
            if ((id == huy) == onlyHuy) {
                _push(b, d.registry, abi.encodeCall(IPrincipalRegistry.createPrincipal, (id, r.pLabels[i])));
            }
        }
        for (uint256 i; i < r.kAddr.length; ++i) {
            bytes32 id = toId(r.kPrincipal[i]);
            if ((id != huy) == onlyHuy) continue;
            _push(
                b,
                d.registry,
                abi.encodeCall(IPrincipalRegistry.addKey, (id, r.kAddr[i], toKind(r.kKind[i]), r.kLabel[i]))
            );
            _push(b, d.vault, abi.encodeCall(IPolicyVault.setKeyDailyCap, (r.kAddr[i], r.kCap[i])));
        }
    }

    function _allowListCalls(Buf memory b, string memory seed, Dep memory d) private pure {
        // seed order of `.tokens`: tUSDC, tTKB, tSCAM
        address[3] memory tokens = [d.tUSDC, d.tTKB, d.tSCAM];
        bool[] memory tAllowed = bools(seed, ".tokens[*].allowed");
        for (uint256 i; i < tAllowed.length; ++i) {
            if (tAllowed[i]) _push(b, d.vault, abi.encodeCall(IPolicyVault.setTokenAllowed, (tokens[i], true)));
        }
        address[] memory rAddr = addrs(seed, ".recipients[*].address");
        bool[] memory rAllowed = bools(seed, ".recipients[*].allowed");
        for (uint256 i; i < rAddr.length; ++i) {
            if (rAllowed[i]) _push(b, d.vault, abi.encodeCall(IPolicyVault.setRecipientAllowed, (rAddr[i], true)));
        }
        // seed order of `.protocols`: mock_dex (allowed), evil_dex (never allowed)
        address[2] memory dexes = [d.mockDex, d.evilDex];
        bool[] memory pAllowed = bools(seed, ".protocols[*].allowed");
        bytes[] memory pSel = blobs(seed, ".protocols[*].selector");
        for (uint256 i; i < pAllowed.length; ++i) {
            if (pAllowed[i]) {
                _push(b, d.vault, abi.encodeCall(IPolicyVault.setProtocolAllowed, (dexes[i], bytes4(pSel[i]), true)));
            }
        }
    }

    /// @dev Every principal except `huy`, their keys and caps, plus the token / recipient / protocol allow-lists.
    function _firstProposalCalls(string memory seed, Dep memory d) private pure returns (Call[] memory) {
        Buf memory b = Buf(new Call[](64), 0);
        _districtCalls(b, _rows(seed), d, false);
        _allowListCalls(b, seed, d);
        return _trim(b.calls, b.n);
    }

    /// @dev District `huy` and its keys (two in the seed).
    function _secondProposalCalls(string memory seed, Dep memory d) private pure returns (Call[] memory) {
        Buf memory b = Buf(new Call[](16), 0);
        _districtCalls(b, _rows(seed), d, true);
        return _trim(b.calls, b.n);
    }

    function _trim(Call[] memory buf, uint256 n) private pure returns (Call[] memory out) {
        out = new Call[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = buf[i];
        }
    }
}
