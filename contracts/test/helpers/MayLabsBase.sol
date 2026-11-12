// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {KeyKind} from "../../src/interfaces/IPrincipalRegistry.sol";
import {EvilDEX} from "../../src/dex/EvilDEX.sol";
import {MockDEX} from "../../src/dex/MockDEX.sol";
import {TestScam} from "../../src/tokens/TestScam.sol";
import {TestTokenB} from "../../src/tokens/TestTokenB.sol";
import {TestUSDC} from "../../src/tokens/TestUSDC.sol";
import {MockAllowList} from "./MockAllowList.sol";

/// @title MayLabsBase
/// @notice Shared test base: the May Labs seed (7 principals, 8 keys, Council of 3 = Backend/seed/may_labs.json),
///         test tokens, both DEXes and the two AllowList precompile mocks. The test contract is the deployer.
/// @dev Registry/Vault/Council are not deployed here (CTR-003..006 extend this base). Until then `council` is a
///      plain address standing in for the future Council contract.
abstract contract MayLabsBase is Test {
    address internal constant CONTRACT_DEPLOYER_ALLOWLIST = 0x0200000000000000000000000000000000000000;
    address internal constant TX_ALLOWLIST = 0x0200000000000000000000000000000000000002;

    // ---- principals (right-padded ASCII ids, as `principalId` in the registry) ----
    bytes32 internal constant MINH = "minh";
    bytes32 internal constant AGENT_DATA = "agent_data";
    bytes32 internal constant AGENT_INTL_PAY = "agent_intl_pay";
    bytes32 internal constant AGENT_REBALANCE = "agent_rebalance";
    bytes32 internal constant SVC_PAYMENT = "svc_payment";
    bytes32 internal constant HUY = "huy";
    bytes32 internal constant LAN = "lan";

    // ---- keys (addresses from the seed) ----
    address internal constant KEY_MINH = 0xFBF0927D8fF0845912002Bf65B2fAC64f0Eb5eC1;
    address internal constant KEY_AGENT_DATA = 0x3a619E5447Ec3c67ef688f8C7F48E6b68B9aBe11;
    address internal constant KEY_AGENT_INTL_PAY = 0xaeF7bDD1F723e24cB578bA60AAe40C7f684Ea0ac;
    address internal constant KEY_AGENT_REBALANCE = 0x96f7e1D1b894ca752FAA781918550DF764646787;
    address internal constant KEY_SVC_PAYMENT = 0xd534b502A76fa6030B252203fA94c23cB3Ebaa6a;
    address internal constant KEY_HUY_1 = 0xb1970880E109b8C30b28d6925c5f7dFE87BC4d67;
    address internal constant KEY_HUY_2 = 0xe3B4F4144A9215a2e0CaDB74F48dBb6eFe948e13;
    address internal constant KEY_LAN = 0x429153f1367162Ce093b7cFa3399349f7E0712d3;

    // ---- Council members (trang has no district) ----
    address internal constant MEMBER_TRANG = 0x1342B9A27b1752Cd8cA9d893f0A1003315D0A8e8;
    address internal constant MEMBER_LAN = 0xB3A84cD8AA6FAF7F24C3BE62E4c2A8bbec0438F4;
    address internal constant MEMBER_HUY = 0x4c75D2F66763Fb0ea7635028882028Ed395c2744;

    // ---- recipients ----
    address internal constant VENDOR_DATA_API = 0x55aeCE454E08B37b16B5e64aD8e346635424510d;
    address internal constant VENDOR_CLOUD = 0x9b94b642795fBCC6FbF423A04B0dAedE432d259D;
    address internal constant VENDOR_INTL_DESIGN = 0x154BB4F1c79746687c32BC5ffa6852BD432F491E;
    address internal constant STRANGER_WALLET = 0xd7C00ADAB1fa0Efce746A93722163514798cC928;

    /// @notice Per-key daily cap in the seed: 20.000 tUSDC.
    uint256 internal constant KEY_DAILY_CAP = 20_000e6;

    struct SeedKey {
        address key;
        bytes32 principalId;
        KeyKind kind;
        string label;
    }

    /// @dev Stand-in for the Council contract (admin of the allow lists, owner of DEX rates).
    address internal council = makeAddr("council");
    /// @dev The test contract itself deploys everything.
    address internal deployer = address(this);

    TestUSDC internal tUSDC;
    TestTokenB internal tTKB;
    TestScam internal tSCAM;
    MockDEX internal dex;
    EvilDEX internal evilDex;
    MockAllowList internal txAllowList = MockAllowList(TX_ALLOWLIST);
    MockAllowList internal deployerAllowList = MockAllowList(CONTRACT_DEPLOYER_ALLOWLIST);

    function setUp() public virtual {
        _installAllowLists();
        _deployTokensAndDexes();
    }

    /// @notice The 7 seed principals, in seed order.
    function seedPrincipals() internal pure returns (bytes32[7] memory ids) {
        ids = [MINH, AGENT_DATA, AGENT_INTL_PAY, AGENT_REBALANCE, SVC_PAYMENT, HUY, LAN];
    }

    /// @notice The 8 seed keys, in seed order.
    function seedKeys() internal pure returns (SeedKey[8] memory ks) {
        ks[0] = SeedKey(KEY_MINH, MINH, KeyKind.HUMAN, unicode"Khoá anh Minh");
        ks[1] = SeedKey(KEY_AGENT_DATA, AGENT_DATA, KeyKind.AGENT, unicode"Khoá Trợ lý Dữ liệu");
        ks[2] = SeedKey(
            KEY_AGENT_INTL_PAY, AGENT_INTL_PAY, KeyKind.AGENT, unicode"Khoá Trợ lý Thanh toán quốc tế"
        );
        ks[3] = SeedKey(KEY_AGENT_REBALANCE, AGENT_REBALANCE, KeyKind.AGENT, unicode"Khoá Trợ lý Cân đối");
        ks[4] = SeedKey(KEY_SVC_PAYMENT, SVC_PAYMENT, KeyKind.SERVICE, unicode"Khoá phần mềm thanh toán");
        ks[5] = SeedKey(KEY_HUY_1, HUY, KeyKind.HUMAN, unicode"Khoá anh Huy (1)");
        ks[6] = SeedKey(KEY_HUY_2, HUY, KeyKind.HUMAN, unicode"Khoá anh Huy (2)");
        ks[7] = SeedKey(KEY_LAN, LAN, KeyKind.HUMAN, unicode"Khoá chị Lan");
    }

    /// @notice Council members `[trang, lan, huy]`.
    function seedMembers() internal pure returns (address[3] memory ms) {
        ms = [MEMBER_TRANG, MEMBER_LAN, MEMBER_HUY];
    }

    /// @dev Etch a MockAllowList at both precompile addresses; the Council stand-in is admin of both.
    function _installAllowLists() internal {
        bytes memory code = address(new MockAllowList()).code;
        vm.etch(TX_ALLOWLIST, code);
        vm.etch(CONTRACT_DEPLOYER_ALLOWLIST, code);
        txAllowList.__seedRole(council, 2);
        deployerAllowList.__seedRole(council, 2);
    }

    function _deployTokensAndDexes() internal {
        tUSDC = new TestUSDC();
        tTKB = new TestTokenB();
        tSCAM = new TestScam();
        address[] memory approved = new address[](2);
        approved[0] = address(tUSDC);
        approved[1] = address(tTKB);
        dex = new MockDEX(council, approved);
        evilDex = new EvilDEX(council, approved);
    }
}
