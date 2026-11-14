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
///      Conflict of interest does not trust the declared `subjectPrincipal`: `propose` decodes the calls, derives the
///      districts they affect (moveKey: sending and receiving district), requires the subject to be among them
///      (`SubjectMismatch`, a contract-level error outside the frozen interface) and stores the set; `approve`
///      rejects any member whose district is the subject or in that set. The set is read at `propose` time.
contract GuardianCouncil is IGuardianCouncil {
    // Every external call goes to the four fixed, trusted targets (registry, vault, two precompiles), never to a
    // caller-chosen address, so the loop-call and event-after-call lints do not apply. Only members reach any of it.
    // forge-lint: disable-start(calls-loop, reentrancy-events, require-revert-in-loop)

    /// @notice Constructor guard: members must be non-zero and distinct, registry and vault non-zero.
    error InvalidSetup();

    /// @notice The declared `subjectPrincipal` is not among the principals the calls actually affect.
    /// @dev Not part of the frozen `IGuardianCouncil`; surfaced to the backend as an unclassified error name.
    error SubjectMismatch();

    /// @dev Tx AllowList precompile, `docs/spec/CONTRACTS.md` section 1.
    address public constant TX_ALLOWLIST = 0x0200000000000000000000000000000000000002;
    /// @dev Contract Deployer AllowList precompile.
    address public constant DEPLOYER_ALLOWLIST = 0x0200000000000000000000000000000000000000;

    uint8 public constant THRESHOLD = 2;

    /// @notice Seconds between reaching the threshold and the earliest execution (#77). Immutable on purpose: a
    ///         setter would let two members shorten the window, which is itself a loosening. 0 = execute at once.
    uint64 public immutable timelockDelay;

    address public immutable registry;
    address public immutable vault;

    address[3] public members;
    mapping(address member => bytes32) public memberPrincipal;
    mapping(address account => bool) private _isMember;

    /// @dev Same layout as `Proposal` minus `id` (the array index); `calls` copied element by element.
    struct Stored {
        address proposer;
        bytes32 subjectPrincipal;
        /// @dev principals derived from the calls at `propose` time (conflict-of-interest set)
        bytes32[] affected;
        Call[] calls;
        bytes32 riskReportHash;
        string title;
        uint8 approvals;
        bool executed;
        bool cancelled;
        uint64 createdAt;
        /// @dev 0 = not queued; set when the threshold is reached while `timelockDelay > 0`
        uint64 eta;
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
    /// @param timelockDelay_ seconds a fully approved proposal waits before it can execute (0 = no timelock)
    constructor(
        address[3] memory members_,
        bytes32[3] memory principals_,
        address registry_,
        address vault_,
        uint64 timelockDelay_
    ) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidSetup();
        registry = registry_;
        vault = vault_;
        timelockDelay = timelockDelay_;
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

    function etaOf(uint256 id) external view returns (uint64) {
        return _stored(id).eta;
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
        bytes32[] memory aff = _affected(calls);
        if (aff.length != 0 && !_contains(aff, subjectPrincipal)) revert SubjectMismatch();
        id = ++proposalCount;
        Stored storage s = _proposals[id];
        s.affected = aff;
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
        if (own != bytes32(0) && (own == s.subjectPrincipal || _storedContains(s.affected, own))) {
            revert ConflictOfInterest();
        }
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        uint8 n = ++s.approvals;
        emit Approved(id, msg.sender);
        if (n >= THRESHOLD) {
            if (timelockDelay == 0) {
                _execute(id, s);
            } else {
                // forge-lint: disable-next-line(unsafe-typecast)
                uint64 eta = uint64(block.timestamp) + timelockDelay;
                s.eta = eta;
                emit Queued(id, eta);
            }
        }
    }

    /// @dev Without a timelock `approve` executes as soon as the threshold is reached, so a proposal is never open
    ///      with enough approvals and this reverts `NeedsThreshold` for every open proposal (the explicit "one member
    ///      cannot push a loosening through" answer). With a timelock it runs a queued proposal from `eta`.
    function execute(uint256 id) external onlyMember {
        Stored storage s = _open(id);
        if (s.approvals < THRESHOLD) revert NeedsThreshold();
        // the timelock is measured in minutes or longer: validator timestamp drift is irrelevant
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < s.eta) revert TimelockNotReady(s.eta);
        _execute(id, s);
    }

    /// @notice Any member stops a queued proposal. Blocking is a tightening, so one member is enough and there is no
    ///         conflict-of-interest check.
    function veto(uint256 id) external onlyMember {
        Stored storage s = _open(id);
        if (s.eta == 0) revert ProposalNotOpen();
        s.cancelled = true;
        emit Cancelled(id);
        emit Vetoed(id, msg.sender);
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
            // never `setManager`, and `setAdmin` only to another contract (a successor Council, OPS-003 demo-reset):
            // an externally owned account can never become precompile admin through a proposal
            known = sel == IAllowList.setEnabled.selector || sel == IAllowList.setNone.selector
                || _isAdminHandover(sel, c.data);
        }
        if (!known) revert UnknownCall();
    }

    /// @dev `setAdmin(successor)` is allowed only when `successor` is a contract other than this Council. Calldata of
    ///      the wrong length is `BadCallArgs`; an externally owned account or this Council is `UnknownCall`.
    function _isAdminHandover(bytes4 sel, bytes calldata data) private view returns (bool) {
        if (sel != IAllowList.setAdmin.selector) return false;
        if (data.length != 36) revert BadCallArgs();
        address next = abi.decode(data[4:], (address));
        return next != address(this) && next.code.length != 0;
    }

    // ------------------------------------------------ affected-principal derivation

    /// @dev Principals touched by the calls, de-duplicated, read once at `propose` (later moves cannot change it).
    ///      moveKey: both the key's current principal and the receiving one. addKey/createPrincipal/
    ///      set(Principal)DailyCap/lock/unlock: the id argument. deactivateKey, setKeyDailyCap, AllowList
    ///      setEnabled/setNone: the principal the key belongs to now (keys not yet registered give none).
    function _affected(Call[] calldata calls) private view returns (bytes32[] memory out) {
        out = new bytes32[](calls.length * 2);
        uint256 n = 0;
        for (uint256 i; i < calls.length; ++i) {
            (bytes32 a, bytes32 b) = _principalsOf(calls[i]);
            n = _push(out, n, a);
            n = _push(out, n, b);
        }
        assembly ("memory-safe") {
            mstore(out, n)
        }
    }

    function _principalsOf(Call calldata c) private view returns (bytes32 a, bytes32 b) {
        // length >= 4 was checked by `_checkCall`
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 sel = bytes4(c.data[:4]);
        address t = c.target;
        if (t == registry) {
            if (sel == IPrincipalRegistry.moveKey.selector) {
                a = _principalOfKey(c.data, 0);
                b = _word(c.data, 1);
            } else if (sel == IPrincipalRegistry.deactivateKey.selector) {
                a = _principalOfKey(c.data, 0);
            } else {
                a = _word(c.data, 0); // createPrincipal, addKey
            }
        } else if (t == vault) {
            if (sel == IPolicyVault.setKeyDailyCap.selector) {
                a = _principalOfKey(c.data, 0);
            } else if (
                sel == IPolicyVault.setPrincipalDailyCap.selector || sel == IPolicyVault.lockPrincipal.selector
                    || sel == IPolicyVault.unlockPrincipal.selector
            ) {
                a = _word(c.data, 0);
            }
        } else {
            a = _principalOfKey(c.data, 0); // AllowList setEnabled / setNone
        }
    }

    /// @dev `index`-th 32-byte argument word; calldata shorter than that cannot be a valid call.
    function _word(bytes calldata data, uint256 index) private pure returns (bytes32 w) {
        uint256 start = 4 + 32 * index;
        if (data.length < start + 32) revert BadCallArgs();
        w = bytes32(data[start:start + 32]);
    }

    function _principalOfKey(bytes calldata data, uint256 index) private view returns (bytes32) {
        bytes32 w = _word(data, index);
        _requireAddress(w);
        return IPrincipalRegistry(registry).principalOf(_toAddress(w));
    }

    function _push(bytes32[] memory arr, uint256 n, bytes32 id) private pure returns (uint256) {
        if (id == bytes32(0) || _containsN(arr, n, id)) return n;
        arr[n] = id;
        return n + 1;
    }

    function _containsN(bytes32[] memory arr, uint256 n, bytes32 id) private pure returns (bool) {
        for (uint256 i; i < n; ++i) {
            if (arr[i] == id) return true;
        }
        return false;
    }

    function _contains(bytes32[] memory arr, bytes32 id) private pure returns (bool) {
        return _containsN(arr, arr.length, id);
    }

    function _storedContains(bytes32[] storage arr, bytes32 id) private view returns (bool) {
        uint256 n = arr.length;
        for (uint256 i; i < n; ++i) {
            if (arr[i] == id) return true;
        }
        return false;
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
