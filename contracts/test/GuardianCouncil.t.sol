// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VmSafe} from "forge-std/Vm.sol";
import {IGuardianCouncil, Call, Proposal} from "../src/interfaces/IGuardianCouncil.sol";
import {IPolicyVault} from "../src/interfaces/IPolicyVault.sol";
import {IPrincipalRegistry, KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {GuardianCouncil} from "../src/GuardianCouncil.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {IAllowList} from "../src/precompiles/IAllowList.sol";
import {IMockDEX} from "../src/interfaces/IMockDEX.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";
import {MockAllowList} from "./helpers/MockAllowList.sol";

/// @dev Real Registry + Vault + Council wired together (Council deployed last at a predicted address), with the
///      precompile mocks from `MayLabsBase`. State before policy v2: every key in its own district, key caps set,
///      no shared district cap yet (scene 3 has not happened).
contract GuardianCouncilTest is MayLabsBase {
    PrincipalRegistry internal registry;
    PolicyVault internal vault;
    GuardianCouncil internal gc;

    address internal topUpOp = makeAddr("topUpOp");
    bytes4 internal constant SWAP_SEL = IMockDEX.swapExactIn.selector;
    uint256 internal constant DAY0 = 19_675 days;
    uint256 internal constant DISTRICT_CAP = 30_000e6;
    bytes32 internal constant RISK = keccak256("risk-report");

    uint256 internal baseVersion;
    uint256 internal baseCount;
    address[5] internal minhKeys = [KEY_MINH, KEY_AGENT_DATA, KEY_AGENT_INTL_PAY, KEY_AGENT_REBALANCE, KEY_SVC_PAYMENT];

    function setUp() public override {
        super.setUp();
        vm.warp(DAY0 + 9 hours);

        uint256 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 2);
        registry = new PrincipalRegistry(predicted);
        vault = new PolicyVault(address(registry), predicted, address(tUSDC), address(dex), topUpOp);

        gc = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault)
        );
        assertEq(address(gc), predicted, "council address prediction");
        txAllowList.__seedRole(address(gc), 2);
        deployerAllowList.__seedRole(address(gc), 2);

        _seedThroughCouncil();
        baseVersion = vault.policyVersion();

        tUSDC.mint(address(vault), 200_000e6);
    }

    /// @dev Genesis state (7 districts, 8 keys, caps, allow-lists, chain roles) installed the way production does it:
    ///      through proposals approved by two members. One proposal per district (its `subjectPrincipal`, approved
    ///      by two members that do not own it) plus one general proposal for the allow-lists. Version bumps and
    ///      proposal count after seeding are recorded in `baseVersion` / `baseCount`.
    function _seedThroughCouncil() internal {
        bytes32[7] memory ids = seedPrincipals();
        SeedKey[8] memory ks = seedKeys();
        for (uint256 i; i < 7; ++i) {
            Call[] memory calls = new Call[](1 + 8 * 3);
            uint256 n;
            calls[n++] = _call(
                address(registry),
                abi.encodeCall(IPrincipalRegistry.createPrincipal, (ids[i], string(abi.encodePacked(ids[i]))))
            );
            for (uint256 j; j < 8; ++j) {
                if (ks[j].principalId != ids[i]) continue;
                calls[n++] = _call(
                    address(registry),
                    abi.encodeCall(IPrincipalRegistry.addKey, (ids[i], ks[j].key, ks[j].kind, ks[j].label))
                );
                calls[n++] = _call(
                    address(vault),
                    abi.encodeCall(
                        IPolicyVault.setKeyDailyCap, (ks[j].key, ks[j].key == KEY_LAN ? 10_000e6 : KEY_DAILY_CAP)
                    )
                );
                calls[n++] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (ks[j].key)));
            }
            assembly {
                mstore(calls, n)
            }
            uint256 id = _propose(MEMBER_TRANG, ids[i], calls);
            // the two members whose own district is not the subject
            for (uint256 m; m < 3; ++m) {
                address member = gc.members(m);
                if (gc.memberPrincipal(member) != ids[i] && !gc.getProposal(id).executed) _approve(member, id);
            }
            assertTrue(gc.getProposal(id).executed, "seed proposal executed");
        }

        Call[] memory g = new Call[](5);
        g[0] = _call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tUSDC), true)));
        g[1] = _call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tTKB), true)));
        g[2] = _call(address(vault), abi.encodeCall(IPolicyVault.setProtocolAllowed, (address(dex), SWAP_SEL, true)));
        g[3] = _call(address(vault), abi.encodeCall(IPolicyVault.setRecipientAllowed, (VENDOR_DATA_API, true)));
        g[4] = _call(address(vault), abi.encodeCall(IPolicyVault.setRecipientAllowed, (VENDOR_CLOUD, true)));
        uint256 gid = _propose(MEMBER_TRANG, bytes32(0), g);
        _approve(MEMBER_LAN, gid);
        _approve(MEMBER_HUY, gid);
        baseCount = gc.proposalCount();
    }

    // ---------------------------------------------------------------- helpers

    function _call(address target, bytes memory data) internal pure returns (Call memory) {
        return Call(target, data);
    }

    function _one(Call memory c) internal pure returns (Call[] memory calls) {
        calls = new Call[](1);
        calls[0] = c;
    }

    function _propose(address member, bytes32 subject, Call[] memory calls) internal returns (uint256 id) {
        vm.prank(member);
        id = gc.propose("title", subject, calls, RISK);
    }

    function _approve(address member, uint256 id) internal {
        vm.prank(member);
        gc.approve(id);
    }

    /// @dev Scene 3 / policy v2: gather the four other keys into `minh`, shared cap 30.000.
    function _scene3Calls() internal view returns (Call[] memory calls) {
        calls = new Call[](5);
        calls[0] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_AGENT_DATA, MINH)));
        calls[1] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_AGENT_INTL_PAY, MINH)));
        calls[2] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_AGENT_REBALANCE, MINH)));
        calls[3] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_SVC_PAYMENT, MINH)));
        calls[4] = _call(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (MINH, DISTRICT_CAP)));
    }

    function _applyScene3() internal {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_TRANG, id);
    }

    function _role(address key) internal view returns (uint256) {
        return txAllowList.readAllowList(key);
    }

    function _pay(address key, uint256 amount) internal {
        vm.prank(key);
        vault.pay(address(tUSDC), VENDOR_DATA_API, amount, bytes32(0));
    }

    function _lowerCapCall(address who, uint8 kind, bytes32 subject, uint256 cap) internal returns (bool ok) {
        vm.prank(who);
        (ok,) = address(gc).call(abi.encodeCall(IGuardianCouncil.lowerCap, (kind, subject, cap)));
    }

    function _addr(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    // ------------------------------------------------------------ construction

    function test_constructorState() public view {
        assertEq(gc.THRESHOLD(), 2);
        assertEq(gc.members(0), MEMBER_TRANG);
        assertEq(gc.members(1), MEMBER_LAN);
        assertEq(gc.members(2), MEMBER_HUY);
        assertEq(gc.memberPrincipal(MEMBER_TRANG), bytes32(0));
        assertEq(gc.memberPrincipal(MEMBER_LAN), LAN);
        assertEq(gc.memberPrincipal(MEMBER_HUY), HUY);
        assertEq(gc.registry(), address(registry));
        assertEq(gc.vault(), address(vault));
        assertEq(gc.proposalCount(), baseCount);
        assertEq(registry.council(), address(gc));
        assertEq(vault.council(), address(gc));
        assertEq(gc.TX_ALLOWLIST(), TX_ALLOWLIST);
        assertEq(gc.DEPLOYER_ALLOWLIST(), CONTRACT_DEPLOYER_ALLOWLIST);
    }

    function test_constructorRejectsBadSetup() public {
        bytes32[3] memory p = [bytes32(0), LAN, HUY];
        vm.expectRevert(GuardianCouncil.InvalidSetup.selector);
        new GuardianCouncil([address(0), MEMBER_LAN, MEMBER_HUY], p, address(registry), address(vault));
        vm.expectRevert(GuardianCouncil.InvalidSetup.selector);
        new GuardianCouncil([MEMBER_TRANG, MEMBER_TRANG, MEMBER_HUY], p, address(registry), address(vault));
        vm.expectRevert(GuardianCouncil.InvalidSetup.selector);
        new GuardianCouncil([MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], p, address(0), address(vault));
        vm.expectRevert(GuardianCouncil.InvalidSetup.selector);
        new GuardianCouncil([MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], p, address(registry), address(0));
    }

    // ------------------------------------------------- T9: tighten with 1 member

    function test_T9_eachMemberCanEmergencyLock() public {
        address[3] memory ms = [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY];
        bytes32[3] memory targets = [MINH, AGENT_DATA, SVC_PAYMENT];
        for (uint256 i; i < 3; ++i) {
            vm.prank(ms[i]);
            gc.emergencyLock(targets[i]);
            assertTrue(vault.principalLocked(targets[i]));
        }
    }

    function test_T9_emergencyLockEmitsAndWorksAlone() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit IPolicyVault.PrincipalLocked(HUY, address(gc));
        vm.expectEmit(true, true, true, true, TX_ALLOWLIST);
        emit MockAllowList.RoleSet(0, KEY_HUY_1, address(gc), 1);
        vm.expectEmit(true, true, true, true, TX_ALLOWLIST);
        emit MockAllowList.RoleSet(0, KEY_HUY_2, address(gc), 1);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_TRANG, "lockPrincipal", HUY);
        vm.prank(MEMBER_TRANG);
        gc.emergencyLock(HUY);

        assertTrue(vault.principalLocked(HUY));
        assertEq(_role(KEY_HUY_1), 0);
        assertEq(_role(KEY_HUY_2), 0);
        assertEq(_role(KEY_LAN), 1, "other districts untouched");
        assertEq(vault.policyVersion(), baseVersion, "emergency actions do not bump the version (sim parity)");
    }

    function test_T9_emergencyPause() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.Paused(address(gc));
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_LAN, "pauseAll", bytes32(0));
        vm.prank(MEMBER_LAN);
        gc.emergencyPause();
        assertTrue(vault.paused());
        vm.prank(KEY_MINH);
        vm.expectRevert(IPolicyVault.VaultPaused.selector);
        vault.pay(address(tUSDC), VENDOR_DATA_API, 1, bytes32(0));
    }

    function test_T9_lowerCapKeyAndPrincipal() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.CapChanged(0, _addr(KEY_MINH), KEY_DAILY_CAP, 5_000e6);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_HUY, "setKeyDailyCap", _addr(KEY_MINH));
        vm.prank(MEMBER_HUY);
        gc.lowerCap(0, _addr(KEY_MINH), 5_000e6);
        assertEq(vault.keyDailyCap(KEY_MINH), 5_000e6);

        // district without a cap: setting one is a tightening (sim parity)
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_LAN, "setPrincipalDailyCap", MINH);
        vm.prank(MEMBER_LAN);
        gc.lowerCap(1, MINH, 12_000e6);
        assertEq(vault.principalDailyCap(MINH), 12_000e6);

        vm.prank(MEMBER_TRANG);
        gc.lowerCap(1, MINH, 1);
        assertEq(vault.principalDailyCap(MINH), 1);
    }

    function test_T9_oneMemberCannotRaiseCap() public {
        vm.startPrank(MEMBER_LAN);
        // key cap: raise and equal
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(0, _addr(KEY_MINH), KEY_DAILY_CAP + 1);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(0, _addr(KEY_MINH), KEY_DAILY_CAP);
        // key with cap 0 cannot spend: any increase is loosening
        vm.stopPrank();
        vm.prank(MEMBER_LAN);
        gc.lowerCap(0, _addr(KEY_MINH), 0);
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(0, _addr(KEY_MINH), 1);
        vm.stopPrank();

        // principal: set a cap first, then raise / equal / remove it
        vm.prank(MEMBER_LAN);
        gc.lowerCap(1, MINH, 30_000e6);
        vm.startPrank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(1, MINH, 130_000e6);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(1, MINH, 30_000e6);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(1, MINH, 0); // 0 = unset = unlimited
        vm.stopPrank();
        assertEq(vault.principalDailyCap(MINH), 30_000e6);
        assertEq(vault.keyDailyCap(KEY_MINH), 0);
    }

    function test_lowerCapBadArgs() public {
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.lowerCap(2, MINH, 1);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.lowerCap(0, MINH, 1); // key kind needs a left-padded address, not a principal id
        vm.stopPrank();
    }

    function test_T9_revokeAllow() public {
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_HUY, "setTokenAllowed", _addr(address(tTKB)));
        vm.prank(MEMBER_HUY);
        gc.revokeAllow(0, _addr(address(tTKB)), bytes4(0));
        assertFalse(vault.tokenAllowed(address(tTKB)));
        assertTrue(vault.tokenAllowed(address(tUSDC)));

        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.AllowChanged(1, _addr(address(dex)), SWAP_SEL, false);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_LAN, "setProtocolAllowed", _addr(address(dex)));
        vm.prank(MEMBER_LAN);
        gc.revokeAllow(1, _addr(address(dex)), SWAP_SEL);
        assertFalse(vault.protocolAllowed(address(dex), SWAP_SEL));

        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_TRANG, "setRecipientAllowed", _addr(VENDOR_CLOUD));
        vm.prank(MEMBER_TRANG);
        gc.revokeAllow(2, _addr(VENDOR_CLOUD), bytes4(0));
        assertFalse(vault.recipientAllowed(VENDOR_CLOUD));
        assertTrue(vault.recipientAllowed(VENDOR_DATA_API));
    }

    function test_revokeAllowBadArgs() public {
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.revokeAllow(3, _addr(address(tUSDC)), bytes4(0));
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.revokeAllow(0, MINH, bytes4(0));
        vm.stopPrank();
    }

    function test_T9_deactivateKey() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit IPrincipalRegistry.KeyDeactivated(KEY_AGENT_DATA);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_LAN, "deactivateKey", _addr(KEY_AGENT_DATA));
        vm.prank(MEMBER_LAN);
        gc.deactivateKey(KEY_AGENT_DATA);
        (,, bool active,) = registry.keyInfo(KEY_AGENT_DATA);
        assertFalse(active);
        vm.prank(KEY_AGENT_DATA);
        vm.expectRevert(IPolicyVault.KeyNotRegistered.selector);
        vault.pay(address(tUSDC), VENDOR_DATA_API, 1, bytes32(0));
    }

    function test_T9_oneMemberCannotLoosen() public {
        // lock, pause, then try every loosening a lone member could attempt
        vm.startPrank(MEMBER_LAN);
        gc.emergencyLock(MINH);
        gc.emergencyPause();

        // the Council contract is the only caller the vault/registry accept; a member cannot reach them directly
        vm.expectRevert(IPolicyVault.NotCouncil.selector);
        vault.unlockPrincipal(MINH);
        vm.expectRevert(IPolicyVault.NotCouncil.selector);
        vault.unpauseAll();
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.addKey(MINH, address(0xBEEF), KeyKind.AGENT, "x");
        vm.stopPrank();

        // and through the Council a loosening needs a proposal with 2 approvals
        Call[] memory calls = new Call[](2);
        calls[0] = _call(address(vault), abi.encodeCall(IPolicyVault.unlockPrincipal, (MINH)));
        calls[1] = _call(address(vault), abi.encodeCall(IPolicyVault.unpauseAll, ()));
        uint256 id = _propose(MEMBER_LAN, MINH, calls);
        _approve(MEMBER_LAN, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.NeedsThreshold.selector);
        gc.execute(id);
        assertTrue(vault.principalLocked(MINH));
        assertTrue(vault.paused());
        _approve(MEMBER_TRANG, id);
        assertFalse(vault.principalLocked(MINH));
        assertFalse(vault.paused());
    }

    function test_T9_nonMemberCanDoNothing() public {
        address stranger = makeAddr("stranger");
        bytes[] memory calls = new bytes[](9);
        calls[0] = abi.encodeCall(IGuardianCouncil.emergencyLock, (MINH));
        calls[1] = abi.encodeCall(IGuardianCouncil.emergencyPause, ());
        calls[2] = abi.encodeCall(IGuardianCouncil.lowerCap, (uint8(1), MINH, uint256(1)));
        calls[3] = abi.encodeCall(IGuardianCouncil.revokeAllow, (uint8(0), _addr(address(tUSDC)), bytes4(0)));
        calls[4] = abi.encodeCall(IGuardianCouncil.deactivateKey, (KEY_MINH));
        calls[5] = abi.encodeCall(IGuardianCouncil.propose, ("t", MINH, _scene3Calls(), RISK));
        calls[6] = abi.encodeCall(IGuardianCouncil.approve, (uint256(1)));
        calls[7] = abi.encodeCall(IGuardianCouncil.execute, (uint256(1)));
        calls[8] = abi.encodeCall(IGuardianCouncil.cancel, (uint256(1)));
        // a real proposal exists so that "unknown proposal" cannot mask the membership check
        _propose(MEMBER_LAN, MINH, _scene3Calls());
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(stranger);
            (bool ok, bytes memory ret) = address(gc).call(calls[i]);
            assertFalse(ok, "non-member call must revert");
            assertEq(bytes4(ret), IGuardianCouncil.NotCouncilMember.selector);
        }
        assertFalse(vault.principalLocked(MINH));
        assertFalse(vault.paused());
    }

    function test_T9_vaultAndRegistryRejectDirectCalls() public {
        // the Council is the only writer: even a member calling the vault directly is rejected
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IPolicyVault.NotCouncil.selector);
        vault.lockPrincipal(MINH);
        vm.expectRevert(IPrincipalRegistry.NotCouncil.selector);
        registry.deactivateKey(KEY_MINH);
        vm.stopPrank();
    }

    // --------------------------------------------- T7/T8: emergencyLock + AllowList

    function test_T8_emergencyLockMinhSetsAllFiveKeysToNone() public {
        _applyScene3();
        for (uint256 i; i < 5; ++i) {
            assertEq(_role(minhKeys[i]), 1, "enabled before");
        }
        assertEq(registry.keysOf(MINH).length, 5);

        vm.expectEmit(true, false, false, true, address(vault));
        emit IPolicyVault.PrincipalLocked(MINH, address(gc));
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.EmergencyAction(MEMBER_HUY, "lockPrincipal", MINH);
        vm.recordLogs();
        vm.prank(MEMBER_HUY);
        gc.emergencyLock(MINH);

        for (uint256 i; i < 5; ++i) {
            assertEq(_role(minhKeys[i]), 0, "role 0 after emergencyLock");
        }
        assertEq(_role(KEY_HUY_1), 1);
        assertEq(_role(KEY_LAN), 1);

        // exactly one RoleSet(0, key, council, 1) log per key from the precompile
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        uint256 roleSets;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == TX_ALLOWLIST) {
                assertEq(logs[i].topics[0], MockAllowList.RoleSet.selector);
                assertEq(logs[i].topics[1], bytes32(uint256(0)));
                assertEq(logs[i].topics[3], _addr(address(gc)));
                ++roleSets;
            }
        }
        assertEq(roleSets, 5);

        // the vault flag blocks spending independently of the AllowList
        vm.prank(KEY_AGENT_DATA);
        vm.expectRevert(IPolicyVault.PrincipalIsLocked.selector);
        vault.pay(address(tUSDC), VENDOR_DATA_API, 1, bytes32(0));
    }

    function test_T8_emergencyLockAlsoCoversDeactivatedKeys() public {
        vm.prank(MEMBER_LAN);
        gc.deactivateKey(KEY_HUY_2);
        assertEq(_role(KEY_HUY_2), 1, "deactivate alone leaves the chain role (sim parity)");
        vm.prank(MEMBER_TRANG);
        gc.emergencyLock(HUY);
        assertEq(_role(KEY_HUY_1), 0);
        assertEq(_role(KEY_HUY_2), 0);
    }

    function test_emergencyLockEmptyOrUnknownDistrictStillLocks() public {
        vm.prank(MEMBER_TRANG);
        gc.emergencyLock(bytes32("nobody"));
        assertTrue(vault.principalLocked(bytes32("nobody")));
    }

    function test_unlockViaProposalReEnablesActiveKeysOnly() public {
        _applyScene3();
        vm.prank(MEMBER_LAN);
        gc.deactivateKey(KEY_SVC_PAYMENT);
        vm.prank(MEMBER_HUY);
        gc.emergencyLock(MINH);

        Call[] memory calls = _one(_call(address(vault), abi.encodeCall(IPolicyVault.unlockPrincipal, (MINH))));
        uint256 id = _propose(MEMBER_HUY, MINH, calls);
        _approve(MEMBER_LAN, id);
        assertTrue(vault.principalLocked(MINH), "one approval is not enough");
        assertEq(_role(KEY_MINH), 0);
        _approve(MEMBER_TRANG, id);

        assertFalse(vault.principalLocked(MINH));
        assertEq(_role(KEY_MINH), 1);
        assertEq(_role(KEY_AGENT_DATA), 1);
        assertEq(_role(KEY_AGENT_INTL_PAY), 1);
        assertEq(_role(KEY_AGENT_REBALANCE), 1);
        assertEq(_role(KEY_SVC_PAYMENT), 0, "deactivated key stays off the chain list");
    }

    function test_lockViaProposalAlsoSetsKeysToNone() public {
        Call[] memory calls = _one(_call(address(vault), abi.encodeCall(IPolicyVault.lockPrincipal, (HUY))));
        uint256 id = _propose(MEMBER_LAN, HUY, calls);
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_TRANG, id);
        assertTrue(vault.principalLocked(HUY));
        assertEq(_role(KEY_HUY_1), 0);
        assertEq(_role(KEY_HUY_2), 0);
    }

    // -------------------------------------------------------- T10: conflict of interest

    function _giveRebalanceToHuy() internal view returns (Call[] memory calls) {
        calls = new Call[](2);
        calls[0] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_AGENT_REBALANCE, HUY)));
        calls[1] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (KEY_AGENT_REBALANCE)));
    }

    function test_T10_huyCannotApproveProposalAboutHuy() public {
        uint256 id = _propose(MEMBER_TRANG, HUY, _giveRebalanceToHuy());

        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(id);
        assertFalse(gc.approvedBy(id, MEMBER_HUY));
        assertEq(gc.getProposal(id).approvals, 0);

        _approve(MEMBER_LAN, id);
        assertFalse(gc.getProposal(id).executed);
        assertEq(registry.principalOf(KEY_AGENT_REBALANCE), AGENT_REBALANCE);

        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(id);

        vm.expectEmit(true, true, false, true, address(gc));
        emit IGuardianCouncil.Approved(id, MEMBER_TRANG);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.Executed(id);
        _approve(MEMBER_TRANG, id);

        Proposal memory p = gc.getProposal(id);
        assertTrue(p.executed);
        assertEq(p.approvals, 2);
        assertEq(registry.principalOf(KEY_AGENT_REBALANCE), HUY);
        assertEq(registry.keysOf(HUY).length, 3);
        assertEq(vault.policyVersion(), baseVersion + 1);
        assertEq(_role(KEY_AGENT_REBALANCE), 1);
    }

    function test_T10_huyMayProposeAboutHuyButNotApprove() public {
        uint256 id = _propose(MEMBER_HUY, HUY, _giveRebalanceToHuy());
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(id);
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_TRANG, id);
        assertTrue(gc.getProposal(id).executed);
    }

    function test_conflictAppliesToLanOnLanAndNotToTrang() public {
        Call[] memory calls = _one(_call(address(vault), abi.encodeCall(IPolicyVault.setKeyDailyCap, (KEY_LAN, 1))));
        uint256 id = _propose(MEMBER_HUY, LAN, calls);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(id);
        // trang has no district, so she can never conflict, whatever the subject
        _approve(MEMBER_TRANG, id);
        _approve(MEMBER_HUY, id);
        assertEq(vault.keyDailyCap(KEY_LAN), 1);
    }

    function test_generalProposalHasNoConflictForAnyMember() public {
        // subject 0 = general: nobody conflicts (member principals of trang is 0 too, must not match)
        Call[] memory calls =
            _one(_call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tSCAM), true))));
        uint256 id = _propose(MEMBER_TRANG, bytes32(0), calls);
        _approve(MEMBER_HUY, id);
        _approve(MEMBER_TRANG, id);
        assertTrue(vault.tokenAllowed(address(tSCAM)));
    }

    // ---------------------------------------------------------- T11: call targets

    function test_T11_targetOutsideTheFourIsRejected() public {
        address[6] memory bad =
            [address(tUSDC), address(dex), address(evilDex), address(gc), makeAddr("anything"), address(0)];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(MEMBER_LAN);
            vm.expectRevert(IGuardianCouncil.TargetNotAllowed.selector);
            gc.propose(
                "t",
                MINH,
                _one(_call(bad[i], abi.encodeCall(IMockDEX.setRate, (address(tUSDC), address(tTKB), 1, 1)))),
                RISK
            );
        }
        assertEq(gc.proposalCount(), baseCount);
    }

    function test_T11_oneBadCallPoisonsTheWholeProposal() public {
        Call[] memory calls = new Call[](3);
        calls[0] = _call(address(vault), abi.encodeCall(IPolicyVault.pauseAll, ()));
        calls[1] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.deactivateKey, (KEY_MINH)));
        calls[2] = _call(address(tUSDC), abi.encodeCall(tUSDC.transfer, (STRANGER_WALLET, 1)));
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.TargetNotAllowed.selector);
        gc.propose("t", bytes32(0), calls, RISK);
    }

    function test_T11_allFourTargetsAreAccepted() public {
        Call[] memory calls = new Call[](4);
        calls[0] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.createPrincipal, (bytes32("new"), "new")));
        calls[1] = _call(address(vault), abi.encodeCall(IPolicyVault.setRecipientAllowed, (VENDOR_INTL_DESIGN, true)));
        calls[2] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (address(0xCAFE))));
        calls[3] = _call(CONTRACT_DEPLOYER_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (address(0xCAFE))));
        uint256 id = _propose(MEMBER_TRANG, bytes32("new"), calls);
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_HUY, id);
        assertTrue(registry.principalExists(bytes32("new")));
        assertTrue(vault.recipientAllowed(VENDOR_INTL_DESIGN));
        assertEq(_role(address(0xCAFE)), 1);
        assertEq(deployerAllowList.readAllowList(address(0xCAFE)), 1);
    }

    function test_T11_unknownSelectorsAreRejected() public {
        // the Council never hands out precompile admin, and cannot spend from the vault or re-bump its own version
        Call[] memory c = _one(_call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (makeAddr("evil")))));
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(CONTRACT_DEPLOYER_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (makeAddr("evil")))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(TX_ALLOWLIST, abi.encodeWithSignature("setManager(address)", makeAddr("evil"))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(TX_ALLOWLIST, abi.encodeCall(IAllowList.readAllowList, (KEY_MINH))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(
            _call(address(vault), abi.encodeCall(IPolicyVault.pay, (address(tUSDC), STRANGER_WALLET, 1, bytes32(0))))
        );
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(address(vault), abi.encodeCall(IPolicyVault.bumpPolicyVersion, ())));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(address(vault), abi.encodeCall(IPolicyVault.recordTopUp, (bytes32(0), 1))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);

        c = _one(_call(address(registry), abi.encodeWithSignature("council()")));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);
        vm.stopPrank();
    }

    function test_setAdmin_toSuccessorContract_handsOverBothPrecompiles() public {
        GuardianCouncil next = new GuardianCouncil(
            [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY], [bytes32(0), LAN, HUY], address(registry), address(vault)
        );
        Call[] memory calls = new Call[](4);
        calls[0] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (address(next))));
        calls[1] = _call(CONTRACT_DEPLOYER_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (address(next))));
        calls[2] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setNone, (address(gc))));
        calls[3] = _call(CONTRACT_DEPLOYER_ALLOWLIST, abi.encodeCall(IAllowList.setNone, (address(gc))));
        uint256 id = _propose(MEMBER_TRANG, bytes32(0), calls);
        _approve(MEMBER_LAN, id);
        _approve(MEMBER_HUY, id);
        assertEq(_role(address(next)), 2, "successor is admin of the Tx list");
        assertEq(deployerAllowList.readAllowList(address(next)), 2, "successor is admin of the deployer list");
        assertEq(_role(address(gc)), 0, "old council has no Tx role");
        assertEq(deployerAllowList.readAllowList(address(gc)), 0, "old council has no deployer role");
    }

    function test_setAdmin_toEoaSelfOrBadCalldata_isRejected() public {
        vm.startPrank(MEMBER_LAN);
        Call[] memory c = _one(_call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (KEY_MINH))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);
        c = _one(_call(CONTRACT_DEPLOYER_ALLOWLIST, abi.encodeCall(IAllowList.setAdmin, (address(gc)))));
        vm.expectRevert(IGuardianCouncil.UnknownCall.selector);
        gc.propose("t", bytes32(0), c, RISK);
        c = _one(_call(TX_ALLOWLIST, abi.encodePacked(IAllowList.setAdmin.selector, uint8(1))));
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", bytes32(0), c, RISK);
        vm.stopPrank();
    }

    function test_proposeRejectsEmptyListAndShortCalldata() public {
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", bytes32(0), new Call[](0), RISK);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", bytes32(0), _one(_call(address(vault), hex"")), RISK);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", bytes32(0), _one(_call(address(vault), hex"aabbcc")), RISK);
        vm.stopPrank();
    }

    function test_malformedArgsRevertBadCallArgsAtPropose() public {
        // arguments are decoded at propose to derive the affected districts, so short calldata cannot get in
        bytes memory noArgs = abi.encodePacked(IPrincipalRegistry.moveKey.selector);
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", MINH, _one(_call(address(registry), noArgs)), RISK);
        // moveKey needs two words
        bytes memory oneWord =
            abi.encodePacked(IPrincipalRegistry.moveKey.selector, bytes32(uint256(uint160(KEY_MINH))));
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", MINH, _one(_call(address(registry), oneWord)), RISK);
        // a key argument with dirty high bits is not an address
        bytes memory dirty = abi.encodePacked(IAllowList.setNone.selector, bytes32(type(uint256).max));
        vm.expectRevert(IGuardianCouncil.BadCallArgs.selector);
        gc.propose("t", MINH, _one(_call(TX_ALLOWLIST, dirty)), RISK);
        vm.stopPrank();
    }

    function test_failingCallBubblesItsErrorAndRollsBackEverything() public {
        Call[] memory calls = new Call[](2);
        calls[0] = _call(address(vault), abi.encodeCall(IPolicyVault.pauseAll, ()));
        // KEY_MINH is already registered
        calls[1] =
            _call(address(registry), abi.encodeCall(IPrincipalRegistry.addKey, (MINH, KEY_MINH, KeyKind.HUMAN, "dup")));
        uint256 id = _propose(MEMBER_LAN, MINH, calls);
        _approve(MEMBER_LAN, id);
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IPrincipalRegistry.KeyAlreadyRegistered.selector);
        gc.approve(id);
        assertFalse(vault.paused(), "first call rolled back");
        assertEq(vault.policyVersion(), baseVersion);
        assertFalse(gc.getProposal(id).executed);
    }

    // --------------------------------------------------------- proposal lifecycle

    function test_proposeStoresAndEmits() public {
        Call[] memory calls = _scene3Calls();
        vm.expectEmit(true, true, false, true, address(gc));
        emit IGuardianCouncil.Proposed(baseCount + 1, MEMBER_LAN, MINH, "Gom 5 khoa", RISK);
        vm.warp(1_700_000_000);
        vm.prank(MEMBER_LAN);
        uint256 id = gc.propose("Gom 5 khoa", MINH, calls, RISK);
        assertEq(id, baseCount + 1);
        assertEq(gc.proposalCount(), baseCount + 1);

        Proposal memory p = gc.getProposal(baseCount + 1);
        assertEq(p.id, baseCount + 1);
        assertEq(p.proposer, MEMBER_LAN);
        assertEq(p.subjectPrincipal, MINH);
        assertEq(p.riskReportHash, RISK);
        assertEq(p.title, "Gom 5 khoa");
        assertEq(p.approvals, 0, "proposing is not approving");
        assertFalse(p.executed);
        assertFalse(p.cancelled);
        assertEq(p.createdAt, 1_700_000_000);
        assertEq(p.calls.length, calls.length);
        for (uint256 i; i < calls.length; ++i) {
            assertEq(p.calls[i].target, calls[i].target);
            assertEq(p.calls[i].data, calls[i].data);
        }
        assertEq(_propose(MEMBER_HUY, MINH, _one(calls[4])), baseCount + 2, "ids are sequential (seed proposal is #1)");
    }

    function test_approveCountsAndAutoExecutesAtTwo() public {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());

        vm.expectEmit(true, true, false, true, address(gc));
        emit IGuardianCouncil.Approved(id, MEMBER_HUY);
        _approve(MEMBER_HUY, id);
        assertTrue(gc.approvedBy(id, MEMBER_HUY));
        assertFalse(gc.getProposal(id).executed);
        assertEq(vault.policyVersion(), baseVersion);

        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.AlreadyApproved.selector);
        gc.approve(id);

        _approve(MEMBER_LAN, id);
        assertTrue(gc.getProposal(id).executed);
        assertEq(gc.getProposal(id).approvals, 2);

        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.approve(id);
    }

    function test_executeNeedsThresholdAndIsMemberOnly() public {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.NeedsThreshold.selector);
        gc.execute(id);
        _approve(MEMBER_HUY, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.NeedsThreshold.selector);
        gc.execute(id);
        assertEq(registry.keysOf(MINH).length, 1);

        _approve(MEMBER_LAN, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.execute(id);

        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.execute(99);
    }

    function test_unknownProposalIds() public {
        vm.startPrank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.approve(0);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.approve(baseCount + 1);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.cancel(baseCount + 1);
        vm.stopPrank();
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.getProposal(0);
        vm.expectRevert(IGuardianCouncil.UnknownProposal.selector);
        gc.getProposal(baseCount + 1);
    }

    function test_cancelOnlyByProposerAndOnlyWhileOpen() public {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_HUY, id);

        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.NotProposer.selector);
        gc.cancel(id);
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.NotProposer.selector);
        gc.cancel(id);

        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.Cancelled(id);
        vm.prank(MEMBER_LAN);
        gc.cancel(id);
        assertTrue(gc.getProposal(id).cancelled);

        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.cancel(id);
        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.approve(id);
        vm.prank(MEMBER_TRANG);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.execute(id);
        assertEq(registry.keysOf(MINH).length, 1, "nothing executed");
        assertEq(vault.policyVersion(), baseVersion);
    }

    function test_cannotCancelExecuted() public {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_HUY, id);
        _approve(MEMBER_TRANG, id);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.cancel(id);
    }

    function test_proposalEndsWithOnePolicyVersionBump() public {
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_HUY, id);
        vm.expectEmit(false, false, false, true, address(vault));
        emit IPolicyVault.PolicyVersionBumped(baseVersion + 1);
        vm.expectEmit(true, false, false, true, address(gc));
        emit IGuardianCouncil.Executed(id);
        _approve(MEMBER_TRANG, id);
        assertEq(vault.policyVersion(), baseVersion + 1);
    }

    function test_setTopUpOperatorNeedsTwoOfThree() public {
        address newOp = makeAddr("newOp");
        Call[] memory calls = _one(_call(address(vault), abi.encodeCall(IPolicyVault.setTopUpOperator, (newOp))));
        uint256 id = _propose(MEMBER_LAN, bytes32(0), calls);
        _approve(MEMBER_LAN, id);
        assertEq(vault.topUpOperator(), topUpOp);
        _approve(MEMBER_TRANG, id);
        assertEq(vault.topUpOperator(), newOp);
    }

    // ------------------------------------------------------------ scene 3 and 5

    function test_scene3_gatherFiveKeysIntoMinhWithSharedCap() public {
        assertEq(vault.principalDailyCap(MINH), 0);
        assertEq(registry.keysOf(MINH).length, 1);

        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_LAN, id); // the proposer is not yet an approver: lan approves explicitly
        assertEq(vault.policyVersion(), baseVersion);
        _approve(MEMBER_TRANG, id);

        assertEq(vault.principalDailyCap(MINH), DISTRICT_CAP);
        address[] memory ks = registry.keysOf(MINH);
        assertEq(ks.length, 5);
        for (uint256 i; i < 5; ++i) {
            assertEq(registry.principalOf(minhKeys[i]), MINH);
        }
        assertEq(vault.policyVersion(), baseVersion + 1, "policyVersion +1");
        assertEq(registry.keysOf(AGENT_DATA).length, 0);

        // business effect: the shared cap now binds across the five keys (scene 4 numbers)
        _pay(KEY_AGENT_DATA, 20_000e6);
        _pay(KEY_SVC_PAYMENT, 10_000e6);
        vm.prank(KEY_AGENT_INTL_PAY);
        vm.expectRevert(IPolicyVault.PrincipalDailyCapExceeded.selector);
        vault.pay(address(tUSDC), VENDOR_DATA_API, 1, bytes32(0));
    }

    function test_scene5_raiseMinhCapTo130kNeedsTwoApprovals() public {
        _applyScene3();
        // a lone member can only tighten, so raising is refused on the 1-member path
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.NotTightening.selector);
        gc.lowerCap(1, MINH, 130_000e6);
        assertEq(vault.principalDailyCap(MINH), DISTRICT_CAP);

        Call[] memory calls =
            _one(_call(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (MINH, 130_000e6))));
        uint256 id = _propose(MEMBER_LAN, MINH, calls);
        _approve(MEMBER_HUY, id);
        assertEq(vault.principalDailyCap(MINH), DISTRICT_CAP, "one approval not enough");
        _approve(MEMBER_TRANG, id);
        assertEq(vault.principalDailyCap(MINH), 130_000e6);
        assertEq(vault.policyVersion(), baseVersion + 2);
    }

    // ------------------------------------------- affected-principal derivation (conflict of interest)

    function _moveRebalanceTo(bytes32 toId) internal view returns (Call[] memory) {
        return _one(_call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_AGENT_REBALANCE, toId))));
    }

    function test_misDeclaredSubjectIsRejected() public {
        // the attack: huy moves a key into his own district but declares another district as the subject
        vm.startPrank(MEMBER_HUY);
        vm.expectRevert(GuardianCouncil.SubjectMismatch.selector);
        gc.propose("t", MINH, _moveRebalanceTo(HUY), RISK);
        vm.expectRevert(GuardianCouncil.SubjectMismatch.selector);
        gc.propose("t", bytes32(0), _moveRebalanceTo(HUY), RISK);
        vm.stopPrank();
        assertEq(gc.proposalCount(), baseCount);
    }

    function test_noWayAroundTheCheckBySelfApproving() public {
        // honest subject (huy): huy cannot approve
        uint256 a = _propose(MEMBER_HUY, HUY, _moveRebalanceTo(HUY));
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(a);
        // subject = the key's current district (also in the derived set): huy still conflicts, he receives the key
        uint256 b = _propose(MEMBER_HUY, AGENT_REBALANCE, _moveRebalanceTo(HUY));
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(b);
        assertEq(registry.principalOf(KEY_AGENT_REBALANCE), AGENT_REBALANCE);
    }

    function test_moveKeyConflictsWithBothSendingAndReceivingDistrict() public {
        // lan moves her own key out to minh: she owns the sending district, so she cannot approve either
        Call[] memory out = _one(_call(address(registry), abi.encodeCall(IPrincipalRegistry.moveKey, (KEY_LAN, MINH))));
        vm.prank(MEMBER_HUY);
        vm.expectRevert(GuardianCouncil.SubjectMismatch.selector);
        gc.propose("t", HUY, out, RISK);
        uint256 id = _propose(MEMBER_HUY, MINH, out);
        vm.prank(MEMBER_LAN);
        vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
        gc.approve(id);
        _approve(MEMBER_HUY, id);
        _approve(MEMBER_TRANG, id);
        assertEq(registry.principalOf(KEY_LAN), MINH);
    }

    function test_affectedSetIsFixedAtProposeTime() public {
        // proposal about agent_rebalance's current key; then the key moves to huy before anyone approves
        Call[] memory calls = _one(_call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setNone, (KEY_AGENT_REBALANCE))));
        uint256 id = _propose(MEMBER_LAN, AGENT_REBALANCE, calls);
        uint256 mv = _propose(MEMBER_LAN, HUY, _moveRebalanceTo(HUY));
        _approve(MEMBER_LAN, mv);
        _approve(MEMBER_TRANG, mv);
        assertEq(registry.principalOf(KEY_AGENT_REBALANCE), HUY);
        // huy is not conflicted on the older proposal: its stored set is {agent_rebalance}
        _approve(MEMBER_HUY, id);
        _approve(MEMBER_LAN, id);
        assertEq(_role(KEY_AGENT_REBALANCE), 0);
    }

    function test_everyDerivationPathBindsSubjectAndConflicts() public {
        Call[] memory c = new Call[](8);
        c[0] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.createPrincipal, (HUY, "again")));
        c[1] = _call(
            address(registry), abi.encodeCall(IPrincipalRegistry.addKey, (HUY, address(0xB0B), KeyKind.AGENT, "x"))
        );
        c[2] = _call(address(registry), abi.encodeCall(IPrincipalRegistry.deactivateKey, (KEY_HUY_1)));
        c[3] = _call(address(vault), abi.encodeCall(IPolicyVault.setPrincipalDailyCap, (HUY, 1)));
        c[4] = _call(address(vault), abi.encodeCall(IPolicyVault.setKeyDailyCap, (KEY_HUY_1, 1)));
        c[5] = _call(address(vault), abi.encodeCall(IPolicyVault.lockPrincipal, (HUY)));
        c[6] = _call(address(vault), abi.encodeCall(IPolicyVault.unlockPrincipal, (HUY)));
        c[7] = _call(TX_ALLOWLIST, abi.encodeCall(IAllowList.setEnabled, (KEY_HUY_2)));
        for (uint256 i; i < c.length; ++i) {
            vm.prank(MEMBER_TRANG);
            vm.expectRevert(GuardianCouncil.SubjectMismatch.selector);
            gc.propose("t", MINH, _one(c[i]), RISK);
            uint256 id = _propose(MEMBER_TRANG, HUY, _one(c[i]));
            vm.prank(MEMBER_HUY);
            vm.expectRevert(IGuardianCouncil.ConflictOfInterest.selector);
            gc.approve(id);
        }
    }

    function test_subjectMayBeZeroOnlyWhenNoDistrictIsAffected() public {
        // unpause affects no district: any subject is accepted
        Call[] memory calls = _one(_call(address(vault), abi.encodeCall(IPolicyVault.unpauseAll, ())));
        _propose(MEMBER_HUY, bytes32(0), calls);
        _propose(MEMBER_HUY, MINH, calls);
        // a proposal touching a district cannot use 0
        Call[] memory lock = _one(_call(address(vault), abi.encodeCall(IPolicyVault.lockPrincipal, (MINH))));
        vm.prank(MEMBER_HUY);
        vm.expectRevert(GuardianCouncil.SubjectMismatch.selector);
        gc.propose("t", bytes32(0), lock, RISK);
    }

    function test_normalMergeStillPassesForMembersWhoOwnNoAffectedDistrict() public {
        // scene 3 proposed by lan: none of the 5 districts is lan's or huy's, so huy and trang can approve
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        _approve(MEMBER_HUY, id);
        _approve(MEMBER_TRANG, id);
        assertEq(vault.principalDailyCap(MINH), DISTRICT_CAP);
        assertEq(registry.keysOf(MINH).length, 5);
    }

    // ----------------------------------------------------------------------- fuzz

    /// @dev Key cap: the 1-member path succeeds iff the new cap is strictly lower; otherwise nothing changes.
    function testFuzz_lowerKeyCapOnlyWhenStrictlyLower(uint256 newCap, uint8 who) public {
        address member = gc.members(who % 3);
        uint256 old = vault.keyDailyCap(KEY_MINH);
        vm.prank(member);
        (bool ok,) = address(gc).call(abi.encodeCall(IGuardianCouncil.lowerCap, (0, _addr(KEY_MINH), newCap)));
        assertEq(ok, newCap < old);
        assertEq(vault.keyDailyCap(KEY_MINH), ok ? newCap : old);
    }

    /// @dev Principal cap: tightening iff new != 0 and (old unset or new < old).
    function testFuzz_lowerPrincipalCapRule(uint256 initial, uint256 newCap) public {
        initial = bound(initial, 0, type(uint128).max);
        if (initial != 0) {
            vm.prank(MEMBER_LAN);
            gc.lowerCap(1, MINH, initial);
        }
        uint256 old = vault.principalDailyCap(MINH);
        bool expected = newCap != 0 && (old == 0 || newCap < old);
        vm.prank(MEMBER_HUY);
        (bool ok,) = address(gc).call(abi.encodeCall(IGuardianCouncil.lowerCap, (1, MINH, newCap)));
        assertEq(ok, expected);
        assertEq(vault.principalDailyCap(MINH), ok ? newCap : old);
    }

    /// @dev A non-member can never reach any state-changing function.
    function testFuzz_nonMemberNeverSucceeds(address caller, bytes32 subject, uint256 amount, uint8 which) public {
        vm.assume(caller != MEMBER_TRANG && caller != MEMBER_LAN && caller != MEMBER_HUY);
        uint256 id = _propose(MEMBER_LAN, MINH, _scene3Calls());
        bytes[] memory fns = new bytes[](9);
        fns[0] = abi.encodeCall(IGuardianCouncil.emergencyLock, (subject));
        fns[1] = abi.encodeCall(IGuardianCouncil.emergencyPause, ());
        fns[2] = abi.encodeCall(IGuardianCouncil.lowerCap, (uint8(amount % 2), subject, amount));
        fns[3] = abi.encodeCall(IGuardianCouncil.revokeAllow, (uint8(amount % 3), subject, bytes4(subject)));
        fns[4] = abi.encodeCall(IGuardianCouncil.deactivateKey, (address(uint160(uint256(subject)))));
        fns[5] = abi.encodeCall(IGuardianCouncil.propose, ("t", subject, _scene3Calls(), RISK));
        fns[6] = abi.encodeCall(IGuardianCouncil.approve, (id));
        fns[7] = abi.encodeCall(IGuardianCouncil.execute, (id));
        fns[8] = abi.encodeCall(IGuardianCouncil.cancel, (id));
        vm.prank(caller);
        (bool ok, bytes memory ret) = address(gc).call(fns[which % fns.length]);
        assertFalse(ok);
        assertEq(bytes4(ret), IGuardianCouncil.NotCouncilMember.selector);
    }

    /// @dev Conflict of interest: a member is blocked exactly when its non-zero district equals the subject.
    function testFuzz_conflictOfInterest(bytes32 subject, uint8 who) public {
        address member = gc.members(who % 3);
        // subject restricted to ids a real call could carry; the check itself is on the declared subject only
        Call[] memory calls =
            _one(_call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tSCAM), true))));
        uint256 id = _propose(MEMBER_TRANG, subject, calls);
        bytes32 own = gc.memberPrincipal(member);
        vm.prank(member);
        (bool ok, bytes memory ret) = address(gc).call(abi.encodeCall(IGuardianCouncil.approve, (id)));
        if (own != bytes32(0) && own == subject) {
            assertFalse(ok);
            assertEq(bytes4(ret), IGuardianCouncil.ConflictOfInterest.selector);
        } else {
            assertTrue(ok);
        }
    }

    /// @dev Any target outside the four allowed is rejected, whatever the calldata.
    function testFuzz_targetWhitelist(address target, bytes calldata data) public {
        vm.assume(
            target != address(registry) && target != address(vault) && target != TX_ALLOWLIST
                && target != CONTRACT_DEPLOYER_ALLOWLIST
        );
        vm.prank(MEMBER_HUY);
        vm.expectRevert(IGuardianCouncil.TargetNotAllowed.selector);
        gc.propose("t", bytes32(0), _one(_call(target, data)), RISK);
    }

    /// @dev Two distinct approvers, in any order, among the allowed ones execute exactly once; the third cannot.
    function testFuzz_twoDistinctApproversExecute(uint8 a, uint8 b) public {
        a = a % 3;
        b = b % 3;
        vm.assume(a != b);
        // subject 0: nobody conflicts
        Call[] memory calls =
            _one(_call(address(vault), abi.encodeCall(IPolicyVault.setTokenAllowed, (address(tSCAM), true))));
        uint256 id = _propose(MEMBER_TRANG, bytes32(0), calls);
        _approve(gc.members(a), id);
        assertFalse(vault.tokenAllowed(address(tSCAM)));
        _approve(gc.members(b), id);
        assertTrue(vault.tokenAllowed(address(tSCAM)));
        assertEq(vault.policyVersion(), baseVersion + 1);
        uint256 c = 3 - a - b;
        vm.prank(gc.members(c));
        vm.expectRevert(IGuardianCouncil.ProposalNotOpen.selector);
        gc.approve(id);
    }

    /// @dev emergencyLock leaves every key of the district at role 0 and no other district's keys touched.
    function testFuzz_emergencyLockZeroesExactlyTheDistrictKeys(uint8 extra, uint8 who) public {
        extra = extra % 6;
        vm.startPrank(address(gc));
        for (uint256 i; i < extra; ++i) {
            address k = address(uint160(0x1000 + i));
            registry.addKey(HUY, k, KeyKind.AGENT, "x");
            txAllowList.setEnabled(k);
        }
        vm.stopPrank();
        vm.prank(gc.members(who % 3));
        gc.emergencyLock(HUY);
        address[] memory ks = registry.keysOf(HUY);
        assertEq(ks.length, 2 + extra);
        for (uint256 i; i < ks.length; ++i) {
            assertEq(_role(ks[i]), 0);
        }
        assertEq(_role(KEY_LAN), 1);
        assertEq(_role(KEY_MINH), 1);
    }
}
