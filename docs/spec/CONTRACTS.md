# CONTRACTS — giao diện smart contract (bản nháp đóng băng)

Trạng thái: **DRAFT**, sẽ được đóng băng bởi issue `CTR-001`. Sau khi đóng băng, mọi thay đổi chữ ký hàm, event hay custom error cần PR riêng đổi tài liệu này, `contracts/src/interfaces/*.sol` và bản sao ABI cho backend (`Backend/src/guardian/chain/abis/`), và phải báo cho người giữ nhánh backend.

Người dùng tài liệu: dev contract (cài đặt), dev backend (adapter `chain/l1`, indexer, attacker). Đặc tả hành vi: [README.md](README.md) mục 3, 4.3, 6; module: [contracts](../modules/contracts/README.md).

## 1. Quy ước

- Solidity `0.8.2x` (pin trong `foundry.toml`), OpenZeppelin cho ERC-20 và `ReentrancyGuard`.
- Tiền tệ là `uint256` base unit; hạn mức tính theo `tUSDC`. `dayIndex = block.timestamp / 1 days` (ngày UTC).
- Hàm **siết** (giảm quyền): gọi bởi **1** Council member. Hàm **nới**: chỉ qua `GuardianCouncil` proposal đủ 2/3.
- Lệnh bị chặn bằng revert **không sinh event**; lý do nằm ở custom error (mục 5).
- Precompile (kiểm lại với docs đúng version Subnet-EVM đang dùng): Contract Deployer AllowList `0x0200000000000000000000000000000000000000`, Tx AllowList `0x0200000000000000000000000000000000000002`; `IAllowList`: `setAdmin(address)`, `setEnabled(address)`, `setNone(address)`, `readAllowList(address) returns (uint256)` (role: 0 none, 1 enabled, 2 admin; version mới có thêm `setManager`). Precompile phát log `RoleSet(role, account, sender, oldRole)`; indexer chuẩn hoá thành event `AllowListRoleSet` (API_CONTRACT.md mục 2).

## 2. IPrincipalRegistry

```solidity
enum KeyKind { HUMAN, AGENT, SERVICE }

struct KeyInfo { bytes32 principalId; KeyKind kind; bool active; string label; }

interface IPrincipalRegistry {
    // --- views (ai cũng gọi được) ---
    function council() external view returns (address);
    function keyInfo(address key) external view returns (bytes32 principalId, KeyKind kind, bool active, string memory label);
    function principalExists(bytes32 id) external view returns (bool);
    function principalOf(address key) external view returns (bytes32);
    function keysOf(bytes32 id) external view returns (address[] memory);
    function principalIds() external view returns (bytes32[] memory);      // để indexer/adapter liệt kê khu

    // --- ghi: chỉ Council ---
    function createPrincipal(bytes32 id, string calldata label) external;                       // nới
    function addKey(bytes32 id, address key, KeyKind kind, string calldata label) external;    // nới; revert KeyAlreadyRegistered nếu khoá đã thuộc khu khác
    function moveKey(address key, bytes32 toId) external;                                       // nới
    function deactivateKey(address key) external;                                               // siết

    event PrincipalCreated(bytes32 indexed id, string label);
    event KeyAdded(bytes32 indexed id, address indexed key, KeyKind kind, string label);
    event KeyMoved(address indexed key, bytes32 indexed fromId, bytes32 indexed toId);
    event KeyDeactivated(address indexed key);
}
```

`principalId` là `bytes32` của chuỗi ASCII (ví dụ `"minh"` đệm phải bằng 0).

## 3. IPolicyVault

```solidity
interface IPolicyVault {
    // --- views ---
    function registry() external view returns (address);
    function council() external view returns (address);
    function policyVersion() external view returns (uint256);
    function paused() external view returns (bool);
    function principalLocked(bytes32 id) external view returns (bool);
    function keyDailyCap(address key) external view returns (uint256);
    function principalDailyCap(bytes32 id) external view returns (uint256);        // 0 = không đặt
    function keySpent(address key, uint256 dayIndex) external view returns (uint256);
    function principalSpent(bytes32 id, uint256 dayIndex) external view returns (uint256);
    function tokenAllowed(address token) external view returns (bool);
    function protocolAllowed(address target, bytes4 selector) external view returns (bool);
    function recipientAllowed(address to) external view returns (bool);

    // --- chi tiêu: msg.sender là khoá ---
    function pay(address token, address to, uint256 amount, bytes32 memoHash) external;
    function swap(address dex, bytes4 selector, address tokenIn, address tokenOut,
                  uint256 amountIn, uint256 minOut, bytes32 reasonHash) external;

    // --- quản trị: chỉ Council (xem GuardianCouncil để biết siết/nới) ---
    function lockPrincipal(bytes32 id) external;                 // siết
    function unlockPrincipal(bytes32 id) external;               // nới
    function pauseAll() external;                                // siết
    function unpauseAll() external;                              // nới
    function setKeyDailyCap(address key, uint256 cap) external;                // hạ = siết, tăng = nới
    function setPrincipalDailyCap(bytes32 id, uint256 cap) external;           // hạ = siết, tăng = nới
    function setTokenAllowed(address token, bool allowed) external;            // gỡ = siết, thêm = nới
    function setProtocolAllowed(address target, bytes4 selector, bool allowed) external;
    function setRecipientAllowed(address to, bool allowed) external;
    function bumpPolicyVersion() external;
    function recordTopUp(bytes32 cChainTxHash, uint256 amount) external;       // ghi nhận nạp mô phỏng (không chuyển tiền)

    // --- events (indexer dựa vào đây) ---
    event Paid(address indexed key, bytes32 indexed principalId, address token, address to, uint256 amount,
               uint256 day, uint256 keySpentAfter, uint256 principalSpentAfter, bytes32 memoHash);
    event Swapped(address indexed key, bytes32 indexed principalId, address dex, address tokenIn, address tokenOut,
                  uint256 amountIn, uint256 amountOut, uint256 day, uint256 keySpentAfter,
                  uint256 principalSpentAfter, bytes32 reasonHash);
    event PrincipalLocked(bytes32 indexed principalId, address by);
    event PrincipalUnlocked(bytes32 indexed principalId);
    event Paused(address by);
    event Unpaused();
    event CapChanged(uint8 kind, bytes32 subject, uint256 oldCap, uint256 newCap);          // kind: 0 key, 1 principal
    event AllowChanged(uint8 kind, bytes32 subject, bytes4 selector, bool allowed);         // kind: 0 token, 1 protocol, 2 recipient
    event PolicyVersionBumped(uint256 version);
    event TopUpRecorded(bytes32 indexed cChainTxHash, uint256 amount);
}
```

**Thứ tự kiểm tra trong `pay`/`swap`** (cố định, quyết định reason code):

1. `!paused` → `VaultPaused`
2. `principalId = registry.principalOf(msg.sender)`; khoá phải tồn tại và `active` → `KeyNotRegistered`
3. `!principalLocked[principalId]` → `PrincipalIsLocked`
4. `tokenAllowed[token]` (swap: cả `tokenIn`, `tokenOut`) → `TokenNotAllowed`
5. swap: `protocolAllowed[dex][selector]` → `ProtocolNotAllowed`; pay: `recipientAllowed[to]` → `RecipientNotAllowed`
6. `keySpent[key][day] + value ≤ keyDailyCap[key]` → `KeyDailyCapExceeded`
7. nếu `principalDailyCap[id] > 0`: `principalSpent[id][day] + value ≤ principalDailyCap[id]` → `PrincipalDailyCapExceeded`
8. cập nhật bộ đếm **trước** khi gọi ra ngoài (checks-effects-interactions), `nonReentrant`
9. chuyển token / gọi DEX; swap kiểm `amountOut ≥ minOut` → `SlippageTooHigh`; token nhận về nằm lại vault

**Quy đổi hạn mức (P0):** chỉ tính theo `tUSDC`. Swap tính theo `amountIn` nếu `tokenIn = tUSDC`; nếu `tokenIn = tTKB` thì quy đổi theo tỉ giá cố định của `MockDEX.quote`. Ghi rõ giả định này trong README của contract.

## 4. IGuardianCouncil

```solidity
struct Call { address target; bytes data; }

struct Proposal {
    uint256 id; address proposer; bytes32 subjectPrincipal;   // khu bị ảnh hưởng, 0 nếu chung
    Call[] calls; bytes32 riskReportHash; string title;
    uint8 approvals; bool executed; bool cancelled; uint64 createdAt;
}

interface IGuardianCouncil {
    function THRESHOLD() external view returns (uint8);                      // 2
    function members(uint256 i) external view returns (address);             // [trang, lan, huy]
    function memberPrincipal(address member) external view returns (bytes32);// khu của member, 0 nếu không có
    function approvedBy(uint256 id, address member) external view returns (bool);
    function proposalCount() external view returns (uint256);
    function getProposal(uint256 id) external view returns (Proposal memory);

    function propose(string calldata title, bytes32 subjectPrincipal, Call[] calldata calls, bytes32 riskReportHash) external returns (uint256 id);
    function approve(uint256 id) external;          // revert ConflictOfInterest nếu memberPrincipal == subjectPrincipal; tự execute khi đủ THRESHOLD
    function execute(uint256 id) external;
    function cancel(uint256 id) external;           // chỉ người đề xuất

    // siết: 1 member, không cần proposal; chỉ được gọi đúng các hàm siết
    function emergencyLock(bytes32 principalId) external;     // vault.lockPrincipal + TxAllowList.setNone cho mọi khoá của khu
    function emergencyPause() external;
    function lowerCap(uint8 kind, bytes32 subject, uint256 newCap) external;
    function revokeAllow(uint8 kind, bytes32 subject, bytes4 selector) external;
    function deactivateKey(address key) external;

    event Proposed(uint256 indexed id, address indexed proposer, bytes32 subjectPrincipal, string title, bytes32 riskReportHash);
    event Approved(uint256 indexed id, address indexed member);
    event Executed(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event EmergencyAction(address indexed member, string action, bytes32 subject);
}
```

Quy tắc:

- `calls[].target` chỉ được là `PrincipalRegistry`, `PolicyVault` hoặc hai precompile AllowList; ngoài ra revert `TargetNotAllowed`. Council **kết thúc** proposal bằng `vault.bumpPolicyVersion()`.
- Xung đột lợi ích: member có `memberPrincipal == subjectPrincipal` không được `approve`. Nếu proposal chuyển khoá sang khu của member (ví dụ giao agent cho `huy`), proposal phải khai `subjectPrincipal = huy`.
- `emergencyLock(id)`: Council là admin của Tx AllowList (sau bàn giao) nên gọi được `setNone` cho từng `keysOf(id)`; `unlockPrincipal` qua proposal phải kèm `setEnabled` lại các khoá.
- Khoá mới thêm vào (proposal `addKey`/`moveKey`) phải kèm `TxAllowList.setEnabled(key)` trong cùng proposal.
- `riskReportHash` = `keccak256` của JSON chuẩn hoá do backend tạo; contract chỉ lưu.

## 5. Custom error ↔ reason code (dùng chung contract, backend, UI)

| Custom error | Code | VI | EN |
|---|---|---|---|
| `VaultPaused()` | `VAULT_PAUSED` | Cả kho đang dừng | Vault paused |
| `KeyNotRegistered()` | `KEY_NOT_REGISTERED` | Thẻ chưa đăng ký | Card not registered |
| `PrincipalIsLocked()` | `DISTRICT_LOCKED` | Khu đã bị khoá | District cordoned off |
| `TokenNotAllowed()` | `TOKEN_NOT_ALLOWED` | Loại tiền chưa duyệt | Token not approved |
| `ProtocolNotAllowed()` | `PROTOCOL_NOT_ALLOWED` | Chợ đổi tiền chưa duyệt | Protocol not approved |
| `RecipientNotAllowed()` | `RECIPIENT_NOT_ALLOWED` | Người nhận chưa duyệt | Recipient not approved |
| `KeyDailyCapExceeded()` | `CARD_DAILY_CAP` | Thẻ này đã hết hạn mức hôm nay | Card daily cap reached |
| `PrincipalDailyCapExceeded()` | `DISTRICT_DAILY_CAP` | Cả khu hôm nay đã gần hết phần chung | District daily cap reached |
| `SlippageTooHigh()` | `SLIPPAGE` | Trượt giá quá mức | Slippage too high |
| *(RPC reject)* | `BLOCKED_AT_PROTOCOL` | Thẻ đã bị gạch khỏi chain, không gửi được giao dịch | Card removed from chain allow list |

Lỗi không có reason code (chỉ giữ tên trong `error_raw`; đã khai báo trong `Backend/src/guardian/chain/errors.py` `OTHER_ERRORS`): `NotCouncilMember`, `NotTightening`, `NeedsThreshold`, `ConflictOfInterest`, `AlreadyApproved`, `ProposalNotOpen`, `NotProposer`, `TargetNotAllowed`, `UnknownCall`, `BadCallArgs`, `UnknownProposal`, `KeyAlreadyRegistered`, `PrincipalNotFound`, `PrincipalExists`. Bảng mã nguồn: `Backend/src/guardian/shared/reason_codes.py` ↔ `Frontend/src/shared/reasonCodes.ts`.

## 6. MockDEX / EvilDEX / token

```solidity
interface IMockDEX {
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut);
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
    function setRate(address tokenIn, address tokenOut, uint256 numerator, uint256 denominator) external;  // Council
}
```

Tỉ giá cố định `1 tTKB = 1 tUSDC` (tính theo giá trị, có chuyển decimals). `EvilDEX` có cùng interface nhưng không bao giờ được whitelist. Token: `TestUSDC` (6), `TestTokenB` / `tTKB` (18), `TestScam` / `tSCAM` (18), ERC-20 OpenZeppelin, `mint` chỉ Deployer (hoặc Council sau bàn giao).

## 7. Địa chỉ và artifact

- `deployments/fuji-l1.json`, `deployments/fuji-c.json` (hiện rỗng): `{ chainId, rpcUrl, deployedAt, contracts: { registry, vault, council, mockDex, evilDex, tUSDC, tTKB, tSCAM }, precompiles: {...}, members: {...} }`; khoá test không bao giờ nằm trong file này.
- ABI JSON cho backend: sinh từ `forge build`, sao chép vào `Backend/src/guardian/chain/abis/`, kèm test so khớp selector/event topic với bảng trên.

## 8. Tiêu chí đóng băng (`CTR-001`)

- [ ] 3 file `contracts/src/interfaces/I*.sol` biên dịch được và khớp tài liệu này
- [ ] Mọi event trong mục 2–4 có đủ trường mà `ChainEvent.payload` (API_CONTRACT.md mục 2) cần
- [ ] Mọi custom error ở mục 5 khớp `Backend/src/guardian/shared/reason_codes.py`
- [ ] Bản sao ABI JSON có mặt ở `Backend/src/guardian/chain/abis/`
