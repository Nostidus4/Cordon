// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMockDEX} from "../src/interfaces/IMockDEX.sol";
import {KeyKind} from "../src/interfaces/IPrincipalRegistry.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {PrincipalRegistry} from "../src/PrincipalRegistry.sol";
import {MayLabsBase} from "./helpers/MayLabsBase.sol";

/// @dev What an attacker observed when it tried to call back into the vault.
struct Attempt {
    bool tried;
    bool ok;
    bytes4 selector;
}

/// @dev Shared bookkeeping for the two attackers: re-entry attempts and the vault counter seen mid-call.
abstract contract Attacker {
    PolicyVault internal immutable vault;
    address internal immutable victimTo;

    Attempt public reenterPay;
    Attempt public reenterSwap;
    /// @dev `principalSpent` of the district as seen from inside the callback (a view call, never blocked).
    uint256 public seenPrincipalSpent;
    uint256 public seenKeySpent;
    bool public hookRan;

    constructor(PolicyVault vault_, address victimTo_) {
        vault = vault_;
        victimTo = victimTo_;
    }

    function _observe(bytes32 pid, address outerKey) internal {
        hookRan = true;
        uint256 day = block.timestamp / 1 days;
        seenPrincipalSpent = vault.principalSpent(pid, day);
        seenKeySpent = vault.keySpent(outerKey, day);
    }

    function _selector(bytes memory ret) private pure returns (bytes4 s) {
        if (ret.length >= 4) {
            assembly ("memory-safe") {
                s := mload(add(ret, 32))
            }
        }
    }

    /// @dev One unit of tUSDC through `pay`, as this contract (a registered key).
    function _tryPay(address token, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            address(vault).call(abi.encodeCall(PolicyVault.pay, (token, victimTo, amount, bytes32(0))));
        reenterPay = Attempt(true, ok, _selector(ret));
    }

    function _trySwap(address dexAddr, address tIn, address tOut, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(vault)
            .call(abi.encodeCall(PolicyVault.swap, (dexAddr, IMockDEX.swapExactIn.selector, tIn, tOut, amount, 0, 0)));
        reenterSwap = Attempt(true, ok, _selector(ret));
    }
}

/// @dev ERC-20 whose `transfer` (called by the vault in `pay`) re-enters `pay` and `swap` as a registered key.
contract ReentrantPayToken is ERC20, Attacker {
    bytes32 internal immutable pid;
    address internal immutable outerKey;
    address internal immutable dexAddr;
    address internal immutable usdc;
    address internal immutable tkb;

    constructor(
        PolicyVault vault_,
        address victimTo_,
        bytes32 pid_,
        address outerKey_,
        address dexAddr_,
        address usdc_,
        address tkb_
    ) ERC20("Reentrant", "RE") Attacker(vault_, victimTo_) {
        pid = pid_;
        outerKey = outerKey_;
        dexAddr = dexAddr_;
        usdc = usdc_;
        tkb = tkb_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _observe(pid, outerKey);
        _tryPay(address(this), 1e12); // worth 1 tUSDC
        _trySwap(dexAddr, usdc, tkb, 1e6);
        _transfer(msg.sender, to, amount);
        return true;
    }
}

/// @dev "DEX" that, inside `swapExactIn`, re-enters `swap` and `pay`, then keeps the input (it is allow-listed, so
///      the vault has approved exactly `amountIn` for it).
contract ReentrantSwapDex is Attacker {
    bytes32 internal immutable pid;
    address internal immutable outerKey;
    address internal immutable usdc;

    constructor(PolicyVault vault_, address victimTo_, bytes32 pid_, address outerKey_, address usdc_)
        Attacker(vault_, victimTo_)
    {
        pid = pid_;
        outerKey = outerKey_;
        usdc = usdc_;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256) external returns (uint256) {
        _observe(pid, outerKey);
        _trySwap(address(this), tokenIn, tokenOut, 1e6);
        _tryPay(usdc, 1e6);
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        return 0;
    }
}

/// @title ReentrancyTest
/// @notice T14 (adversarial): a malicious ERC-20 and a malicious DEX re-enter the vault during the external call.
///         Re-entry must fail, no more than the cap may leave the vault, and the counters must already be updated
///         when the external call runs (checks-effects-interactions), so the test does not lean on the guard alone.
/// @dev The district cap equals the outer spend exactly, so any successful re-entry (even 1 tUSDC) would breach it.
contract ReentrancyTest is MayLabsBase {
    PrincipalRegistry internal registry;
    PolicyVault internal vault;

    bytes4 internal constant SWAP_SEL = IMockDEX.swapExactIn.selector;
    uint256 internal constant DAY0 = 19_675 days;
    uint256 internal constant DISTRICT_CAP = 10_000e6;
    uint256 internal constant SPEND = 10_000e6;

    function setUp() public override {
        super.setUp();
        vm.warp(DAY0 + 9 hours);
        registry = new PrincipalRegistry(council);
        vault = new PolicyVault(address(registry), council, address(tUSDC), address(dex), makeAddr("topUpOp"));

        vm.startPrank(council);
        registry.createPrincipal(MINH, "minh");
        registry.addKey(MINH, KEY_MINH, KeyKind.HUMAN, "minh");
        vault.setKeyDailyCap(KEY_MINH, KEY_DAILY_CAP);
        vault.setPrincipalDailyCap(MINH, DISTRICT_CAP);
        vault.setTokenAllowed(address(tUSDC), true);
        vault.setTokenAllowed(address(tTKB), true);
        vault.setProtocolAllowed(address(dex), SWAP_SEL, true);
        vault.setRecipientAllowed(VENDOR_CLOUD, true);
        vm.stopPrank();

        tUSDC.mint(address(vault), 100_000e6);
        tTKB.mint(address(vault), 100_000e18);
        tUSDC.mint(address(dex), 1_000_000e6);
        tTKB.mint(address(dex), 1_000_000e18);
    }

    function _day() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @dev Evil token wired in as a registered key of the same district, valued 1:1 against tUSDC.
    function _evilToken() internal returns (ReentrantPayToken evil) {
        evil = new ReentrantPayToken(vault, VENDOR_CLOUD, MINH, KEY_MINH, address(dex), address(tUSDC), address(tTKB));
        evil.mint(address(vault), 100_000e18);
        vm.startPrank(council);
        registry.addKey(MINH, address(evil), KeyKind.AGENT, "evil token");
        vault.setKeyDailyCap(address(evil), KEY_DAILY_CAP);
        vault.setTokenAllowed(address(evil), true);
        dex.setRate(address(evil), address(tUSDC), 1, 1);
        vm.stopPrank();
    }

    function _evilDex() internal returns (ReentrantSwapDex evil) {
        evil = new ReentrantSwapDex(vault, VENDOR_CLOUD, MINH, KEY_MINH, address(tUSDC));
        vm.startPrank(council);
        registry.addKey(MINH, address(evil), KeyKind.AGENT, "evil dex");
        vault.setKeyDailyCap(address(evil), KEY_DAILY_CAP);
        vault.setProtocolAllowed(address(evil), SWAP_SEL, true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ malicious token

    function test_T14_maliciousTokenReentryFailsAndSpendStaysWithinCap() public {
        ReentrantPayToken evil = _evilToken();
        uint256 vaultEvilBefore = evil.balanceOf(address(vault));
        uint256 usdcBefore = tUSDC.balanceOf(address(vault));

        vm.prank(KEY_MINH);
        vault.pay(address(evil), VENDOR_CLOUD, 10_000e18, bytes32(0)); // value 10.000 tUSDC = the district cap

        assertTrue(evil.hookRan(), "token hook ran");
        (bool tried, bool ok, bytes4 sel) = evil.reenterPay();
        assertTrue(tried);
        assertFalse(ok, "re-entering pay must fail");
        assertEq(sel, ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        (tried, ok, sel) = evil.reenterSwap();
        assertTrue(tried);
        assertFalse(ok, "pay -> swap re-entry must fail");
        assertEq(sel, ReentrancyGuard.ReentrancyGuardReentrantCall.selector);

        assertEq(vault.principalSpent(MINH, _day()), DISTRICT_CAP, "exactly the outer spend");
        assertEq(vault.keySpent(address(evil), _day()), 0, "attacker key spent nothing");
        assertEq(evil.balanceOf(address(vault)), vaultEvilBefore - 10_000e18, "only the outer amount left");
        assertEq(tUSDC.balanceOf(address(vault)), usdcBefore, "no tUSDC moved by a re-entry");
        assertLe(vault.principalSpent(MINH, _day()), vault.principalDailyCap(MINH));
    }

    /// @dev Checks-effects-interactions: when the token's `transfer` runs, the counters already include the spend.
    ///      Fails if the counter update is moved after the external call, whatever the reentrancy guard does.
    function test_T14_tokenSeesCountersAlreadyUpdatedInsideTransfer() public {
        ReentrantPayToken evil = _evilToken();
        vm.prank(KEY_MINH);
        vault.pay(address(evil), VENDOR_CLOUD, 4_000e18, bytes32(0));
        assertEq(evil.seenPrincipalSpent(), 4_000e6, "district counter updated before the external call");
        assertEq(evil.seenKeySpent(), 4_000e6, "key counter updated before the external call");
    }

    // ------------------------------------------------------------ malicious DEX

    function test_T14_maliciousDexReentryFailsAndSpendStaysWithinCap() public {
        ReentrantSwapDex evil = _evilDex();
        uint256 usdcBefore = tUSDC.balanceOf(address(vault));

        vm.prank(KEY_MINH);
        vault.swap(address(evil), SWAP_SEL, address(tUSDC), address(tTKB), SPEND, 0, bytes32(0));

        assertTrue(evil.hookRan(), "dex hook ran");
        (bool tried, bool ok, bytes4 sel) = evil.reenterSwap();
        assertTrue(tried);
        assertFalse(ok, "re-entering swap must fail");
        assertEq(sel, ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        (tried, ok, sel) = evil.reenterPay();
        assertTrue(tried);
        assertFalse(ok, "swap -> pay re-entry must fail");
        assertEq(sel, ReentrancyGuard.ReentrancyGuardReentrantCall.selector);

        assertEq(vault.principalSpent(MINH, _day()), DISTRICT_CAP);
        assertEq(vault.keySpent(address(evil), _day()), 0);
        assertEq(usdcBefore - tUSDC.balanceOf(address(vault)), SPEND, "outflow is the outer swap only");
        assertLe(usdcBefore - tUSDC.balanceOf(address(vault)), vault.principalDailyCap(MINH));
        assertEq(tUSDC.allowance(address(vault), address(evil)), 0, "allowance reset after the call");
    }

    function test_T14_dexSeesCountersAlreadyUpdatedInsideSwap() public {
        ReentrantSwapDex evil = _evilDex();
        vm.prank(KEY_MINH);
        vault.swap(address(evil), SWAP_SEL, address(tUSDC), address(tTKB), 3_000e6, 0, bytes32(0));
        assertEq(evil.seenPrincipalSpent(), 3_000e6, "district counter updated before the external call");
        assertEq(evil.seenKeySpent(), 3_000e6, "key counter updated before the external call");
    }

    // ------------------------------------------------------------ after the attack

    function test_T14_vaultStillWorksAfterAFailedReentry() public {
        ReentrantPayToken evil = _evilToken();
        vm.prank(KEY_MINH);
        vault.pay(address(evil), VENDOR_CLOUD, 1_000e18, bytes32(0));
        // the guard was released: a normal spend right after succeeds and the district total adds up
        vm.prank(KEY_MINH);
        vault.pay(address(tUSDC), VENDOR_CLOUD, 2_000e6, bytes32(0));
        assertEq(vault.principalSpent(MINH, _day()), 3_000e6);
    }
}
