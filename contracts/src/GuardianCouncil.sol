// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGuardianCouncil, Call, Proposal} from "./interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "./interfaces/IPolicyVault.sol";
import {IPrincipalRegistry} from "./interfaces/IPrincipalRegistry.sol";
import {IAllowList} from "./precompiles/IAllowList.sol";

/// @notice Subset of `PolicyVault` outside the frozen ABI: the tighten/loosen classification views (CTR-005).
interface IVaultClassifier {
    function isTighteningCap(uint8 kind, bytes32 subject, uint256 newCap) external view returns (bool);
    function isTighteningAllow(uint8 kind, bytes32 subject, bytes4 selector, bool allowed) external view returns (bool);
}

/// @title GuardianCouncil
/// @notice 3 members: tighten with ONE member (no proposal), loosen only through a proposal approved by 2 of 3, and
///         nobody approves a proposal about their own district. The only writer of `PrincipalRegistry` and
///         `PolicyVault`, and (after hand-over, L1-002) admin of both AllowList precompiles.
///         Mirrors `Backend/src/guardian/chain/sim/{council,engine}.py`; interface frozen in docs/spec/CONTRACTS.md.
/// @dev Deployment is acyclic: registry and vault take this contract's address in their constructors, and this one
///      takes theirs, so deploy registry and vault first with the Council address predicted from the deployer nonce
///      (`vm.computeCreateAddress`), then the Council last.
///      Proposal calls are raw calldata to one of four targets (Registry, Vault, Tx AllowList, Contract Deployer
///      AllowList); a selector outside the per-target whitelist is `UnknownCall`. Execution is atomic: a failing call
///      reverts the whole `approve`, so an approval that reaches the threshold either executes everything or counts
///      for nothing. Policy version is bumped exactly once at the end of every executed proposal, so a call list
///      should not contain `bumpPolicyVersion` itself (it would bump twice).
///      Lock/unlock keep the Tx AllowList in step with the vault flag, also when they come through a proposal:
///      `lockPrincipal` sets every key of the district to role 0, `unlockPrincipal` re-enables its active keys.
///      Keys added or moved by a proposal are NOT enabled implicitly; the proposal lists `setEnabled` (spec 4).
///      Conflict of interest is only as strong as the declared `subjectPrincipal` (the contract cannot tell which
///      district an arbitrary call affects); the proposer declares it, the other members check it before approving.
contract GuardianCouncil is IGuardianCouncil {
    // Every external call goes to the four fixed, trusted targets (registry, vault, two precompiles), never to a
    // caller-chosen address, so the loop-call and event-after-call lints do not apply. Only members reach any of it.
    // forge-lint: disable-start(calls-loop, reentrancy-events, require-revert-in-loop)

    /// @notice Constructor guard: members must be non-zero and distinct, registry and vault non-zero.
    error InvalidSetup();

    /// @dev Tx AllowList precompile, `docs/spec/CONTRACTS.md` section 1.
    address public constant TX_ALLOWLIST = 0x0200000000000000000000000000000000000002;
    /// @dev Contract Deployer AllowList precompile.
    address public constant DEPLOYER_ALLOWLIST = 0x0200000000000000000000000000000000000000;

    uint8 public constant THRESHOLD = 2;

    address public immutable registry;
    address public immutable vault;

    address[3] public members;
    mapping(address member => bytes32) public memberPrincipal;
    mapping(address account => bool) private _isMember;

    /// @dev Same layout as `Proposal` minus `id` (the array index); `calls` copied element by element.
    struct Stored {
        address proposer;
        bytes32 subjectPrincipal;
        Call[] calls;
        bytes32 riskReportHash;
        string title;
        uint8 approvals;
        bool executed;
        bool cancelled;
        uint64 createdAt;
    }

    mapping(uint256 id => Stored) private _proposals;
    mapping(uint256 id => mapping(address member => bool)) public approvedBy;
    uint256 public proposalCount;

    modifier onlyMember() {
        if (!_isMember[msg.sender]) revert NotCouncilMember();
        _;
    }

    /// @param members_ `[trang, lan, huy]`
    /// @param principals_ district of each member, `bytes32(0)` for none (`[0, lan, huy]` in the seed)
    constructor(address[3] memory members_, bytes32[3] memory principals_, address registry_, address vault_) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidSetup();
        registry = registry_;
        vault = vault_;
        for (uint256 i; i < 3; ++i) {
            address m = members_[i];
            if (m == address(0) || _isMember[m]) revert InvalidSetup();
            _isMember[m] = true;
            members[i] = m;
            memberPrincipal[m] = principals_[i];
        }
    }

    // ----------------------------------------------------------------- views

    function getProposal(uint256 id) external view returns (Proposal memory p) {
        Stored storage s = _stored(id);
        p.id = id;
        p.proposer = s.proposer;
        p.subjectPrincipal = s.subjectPrincipal;
        p.calls = s.calls;
        p.riskReportHash = s.riskReportHash;
        p.title = s.title;
        p.approvals = s.approvals;
        p.executed = s.executed;
        p.cancelled = s.cancelled;
        p.createdAt = s.createdAt;
    }

    // ------------------------------------------------------------- proposals

    function propose(string calldata title, bytes32 subjectPrincipal, Call[] calldata calls, bytes32 riskReportHash)
        external
        onlyMember
        returns (uint256 id)
    {
        if (calls.length == 0) revert BadCallArgs();
        for (uint256 i; i < calls.length; ++i) {
            _checkCall(calls[i]);
        }
        id = ++proposalCount;
        Stored storage s = _proposals[id];
        s.proposer = msg.sender;
        s.subjectPrincipal = subjectPrincipal;
        s.riskReportHash = riskReportHash;
        s.title = title;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.createdAt = uint64(block.timestamp);
        for (uint256 i; i < calls.length; ++i) {
            s.calls.push(calls[i]);
        }
        emit Proposed(id, msg.sender, subjectPrincipal, title, riskReportHash);
    }

    function approve(uint256 id) external onlyMember {
        Stored storage s = _open(id);
        bytes32 own = memberPrincipal[msg.sender];
        if (own != bytes32(0) && own == s.subjectPrincipal) revert ConflictOfInterest();
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        uint8 n = ++s.approvals;
        emit Approved(id, msg.sender);
        if (n >= THRESHOLD) _execute(id, s);
    }

    /// @dev `approve` executes as soon as the threshold is reached, so a proposal is never open with enough approvals
    ///      and this reverts `NeedsThreshold` for every open proposal. It exists for the frozen ABI and as the
    ///      explicit "one member cannot push a loosening through" answer.
    function execute(uint256 id) external onlyMember {
        Stored storage s = _open(id);
        if (s.approvals < THRESHOLD) revert NeedsThreshold();
        _execute(id, s);
    }

    function cancel(uint256 id) external onlyMember {
        Stored storage s = _stored(id);
        if (s.proposer != msg.sender) revert NotProposer();
        if (s.executed || s.cancelled) revert ProposalNotOpen();
        s.cancelled = true;
        emit Cancelled(id);
    }

    // ------------------------------------- tightening: one member, no proposal

    function emergencyLock(bytes32 principalId) external onlyMember {
        IPolicyVault(vault).lockPrincipal(principalId);
        _setKeysRole(principalId, false);
        emit EmergencyAction(msg.sender, "lockPrincipal", principalId);
    }

    function emergencyPause() external onlyMember {
        IPolicyVault(vault).pauseAll();
        emit EmergencyAction(msg.sender, "pauseAll", bytes32(0));
    }

    /// @param kind 0 key (`subject` is the address left-padded), 1 principal
    function lowerCap(uint8 kind, bytes32 subject, uint256 newCap) external onlyMember {
        if (kind > 1) revert BadCallArgs();
        if (kind == 0) _requireAddress(subject);
        if (!IVaultClassifier(vault).isTighteningCap(kind, subject, newCap)) revert NotTightening();
        if (kind == 0) {
            IPolicyVault(vault).setKeyDailyCap(_toAddress(subject), newCap);
            emit EmergencyAction(msg.sender, "setKeyDailyCap", subject);
        } else {
            IPolicyVault(vault).setPrincipalDailyCap(subject, newCap);
            emit EmergencyAction(msg.sender, "setPrincipalDailyCap", subject);
        }
    }

    /// @param kind 0 token, 1 protocol (`selector` used), 2 recipient
    function revokeAllow(uint8 kind, bytes32 subject, bytes4 selector) external onlyMember {
        if (kind > 2) revert BadCallArgs();
        _requireAddress(subject);
        if (!IVaultClassifier(vault).isTighteningAllow(kind, subject, selector, false)) revert NotTightening();
        address target = _toAddress(subject);
        if (kind == 0) {
            IPolicyVault(vault).setTokenAllowed(target, false);
            emit EmergencyAction(msg.sender, "setTokenAllowed", subject);
        } else if (kind == 1) {
            IPolicyVault(vault).setProtocolAllowed(target, selector, false);
            emit EmergencyAction(msg.sender, "setProtocolAllowed", subject);
        } else {
            IPolicyVault(vault).setRecipientAllowed(target, false);
            emit EmergencyAction(msg.sender, "setRecipientAllowed", subject);
        }
    }

    function deactivateKey(address key) external onlyMember {
        IPrincipalRegistry(registry).deactivateKey(key);
        emit EmergencyAction(msg.sender, "deactivateKey", _toBytes32(key));
    }

    // ------------------------------------------------------------- internals

    function _stored(uint256 id) private view returns (Stored storage s) {
        if (id == 0 || id > proposalCount) revert UnknownProposal();
        s = _proposals[id];
    }

    function _open(uint256 id) private view returns (Stored storage s) {
        s = _stored(id);
        if (s.executed || s.cancelled) revert ProposalNotOpen();
    }

    /// @dev Marks executed first (checks-effects-interactions), runs the calls, ends with a policy version bump.
    function _execute(uint256 id, Stored storage s) private {
        s.executed = true;
        uint256 n = s.calls.length;
        for (uint256 i; i < n; ++i) {
            _apply(s.calls[i]);
        }
        IPolicyVault(vault).bumpPolicyVersion();
        emit Executed(id);
    }

    function _apply(Call storage c) private {
        address target = c.target;
        bytes memory data = c.data;
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            if (ret.length == 0) revert BadCallArgs();
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        // keep the Tx AllowList in step with the vault's lock flag (sim `_apply_vault`)
        if (target == vault && data.length >= 36) {
            // the length check above guarantees 4 bytes
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 sel = bytes4(data);
            if (sel == IPolicyVault.lockPrincipal.selector || sel == IPolicyVault.unlockPrincipal.selector) {
                bytes32 pid;
                assembly ("memory-safe") {
                    pid := mload(add(data, 0x24))
                }
                _setKeysRole(pid, sel == IPolicyVault.unlockPrincipal.selector);
            }
        }
    }

    /// @dev Lock: role 0 for every key of the district (also deactivated ones). Unlock: role 1 for active keys only.
    function _setKeysRole(bytes32 principalId, bool enable) private {
        address[] memory keys = IPrincipalRegistry(registry).keysOf(principalId);
        for (uint256 i; i < keys.length; ++i) {
            if (!enable) {
                IAllowList(TX_ALLOWLIST).setNone(keys[i]);
            } else {
                bool active;
                // kind and label are not needed here
                // forge-lint: disable-next-line(unused-return)
                (,, active,) = IPrincipalRegistry(registry).keyInfo(keys[i]);
                if (active) IAllowList(TX_ALLOWLIST).setEnabled(keys[i]);
            }
        }
    }

    /// @dev Target whitelist and per-target selector whitelist; arguments are validated when the call runs.
    function _checkCall(Call calldata c) private view {
        address t = c.target;
        if (t != registry && t != vault && t != TX_ALLOWLIST && t != DEPLOYER_ALLOWLIST) revert TargetNotAllowed();
        if (c.data.length < 4) revert BadCallArgs();
        bytes4 sel = bytes4(c.data[:4]);
        bool known;
        if (t == registry) {
            known = sel == IPrincipalRegistry.createPrincipal.selector || sel == IPrincipalRegistry.addKey.selector
                || sel == IPrincipalRegistry.moveKey.selector || sel == IPrincipalRegistry.deactivateKey.selector;
        } else if (t == vault) {
            known = sel == IPolicyVault.lockPrincipal.selector || sel == IPolicyVault.unlockPrincipal.selector
                || sel == IPolicyVault.pauseAll.selector || sel == IPolicyVault.unpauseAll.selector
                || sel == IPolicyVault.setKeyDailyCap.selector || sel == IPolicyVault.setPrincipalDailyCap.selector
                || sel == IPolicyVault.setTokenAllowed.selector || sel == IPolicyVault.setProtocolAllowed.selector
                || sel == IPolicyVault.setRecipientAllowed.selector || sel == IPolicyVault.setTopUpOperator.selector;
        } else {
            // never `setAdmin`/`setManager`: the Council keeps the precompile admin role for itself
            known = sel == IAllowList.setEnabled.selector || sel == IAllowList.setNone.selector;
        }
        if (!known) revert UnknownCall();
    }

    function _requireAddress(bytes32 subject) private pure {
        if (uint256(subject) >> 160 != 0) revert BadCallArgs();
    }

    function _toAddress(bytes32 subject) private pure returns (address) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return address(uint160(uint256(subject)));
    }

    function _toBytes32(address a) private pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    // forge-lint: disable-end(calls-loop, reentrancy-events, require-revert-in-loop)
}
