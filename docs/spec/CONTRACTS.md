# CONTRACTS — giao diện smart contract (đã đóng băng)

Trạng thái: **FROZEN** từ **2026-11-12** (issue `CTR-001`). Mọi thay đổi chữ ký hàm, event hay custom error cần **một PR riêng** đổi cùng lúc: tài liệu này, `contracts/src/interfaces/*.sol` và bản sao ABI cho backend (`Backend/src/guardian/chain/abis/`, sinh bằng `make abis`), và phải báo cho người giữ nhánh backend. Test `Backend/tests/test_contract_abi.py` fail nếu ba nơi này lệch nhau.

Người dùng tài liệu: dev contract (cài đặt), dev backend (adapter `chain/l1`, indexer, attacker). Đặc tả hành vi: [README.md](README.md) mục 3, 4.3, 6; module: [contracts](../modules/contracts/README.md).

Nguồn sự thật: file `.sol` là nguồn của ABI; tài liệu này là nguồn của **ý nghĩa** (ai được gọi, siết hay nới, thứ tự kiểm tra, ánh xạ sang reason code và sang `ChainEvent`).

## 1. Quy ước

- Solidity **0.8.28** (pin trong `contracts/foundry.toml`, `evm_version = cancun`), OpenZeppelin cho ERC-20 và `ReentrancyGuard` (khi cài đặt, CTR-002). Interface dùng `pragma ^0.8.28`.
- Tiền tệ là `uint256` base unit; hạn mức tính theo `tUSDC`. `dayIndex = block.timestamp / 1 days` (ngày UTC).
- Hàm **siết** (giảm quyền): gọi bởi **1** Council member. Hàm **nới**: chỉ qua `GuardianCouncil` proposal đủ 2/3.
- Mọi hàm quản trị của `PolicyVault` / `PrincipalRegistry` / `MockDEX.setRate` chỉ nhận `msg.sender == council`, nếu không revert `NotCouncil()`. Việc phân biệt siết/nới nằm ở Council (`NotTightening`, `NeedsThreshold`), không nằm ở Vault.
- Lệnh bị chặn bằng revert **không sinh event**; lý do nằm ở custom error (mục 5).
- `principalId` là `bytes32` của chuỗi ASCII, đệm phải bằng 0 (ví dụ `"minh"` -> `0x6d696e68` + 28 byte 0).
- Precompile (kiểm lại với docs đúng version Subnet-EVM đang dùng): Contract Deployer AllowList `0x0200000000000000000000000000000000000000`, Tx AllowList `0x0200000000000000000000000000000000000002`; `IAllowList`: `setAdmin(address)`, `setEnabled(address)`, `setNone(address)`, `readAllowList(address) returns (uint256)` (role: 0 none, 1 enabled, 2 admin; version mới có thêm `setManager`). Interface precompile không nằm trong 4 file đóng băng ở đây (cài đặt Council ở CTR-006 tự khai báo). Ánh xạ log precompile sang `AllowListRoleSet`: mục 7. Đã kiểm với Subnet-EVM v0.8.0 (Avalanche CLI 1.9.7, chạy local): địa chỉ và 4 hàm trên đúng; `setManager(address)` có, role manager = `3`; `readAllowList` trả 0/1/2/3. Lỗi RPC khi người gửi ngoài Tx AllowList: `cannot issue transaction from non-allow listed address: 0x<sender>` (không có tx hash). Deploy contract từ khoá không phải deployer bị `eth_estimateGas` từ chối: `tx.origin 0x<sender> is not authorized to deploy a contract`. Chi tiết: `contracts/genesis/README.md`.
- Ánh xạ tên: cột "Contract" dùng `bytes32` / `uint8`; cột payload `ChainEvent` ở [API_CONTRACT.md](API_CONTRACT.md) mục 2 là dạng indexer chuẩn hoá (mục 6 dưới đây).

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

    error NotCouncil();
    error KeyAlreadyRegistered();
    error PrincipalNotFound();
    error PrincipalExists();
}
```

`keyInfo` của khoá chưa đăng ký trả `principalId = 0`, `active = false` (không revert). `keysOf(id)` gồm cả khoá đã vô hiệu hoá; dùng `keyInfo(key).active` để lọc.

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
    function topUpOperator() external view returns (address);

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
    function setPrincipalDailyCap(bytes32 id, uint256 cap) external;           // hạ = siết, tăng hoặc về 0 = nới
    function setTokenAllowed(address token, bool allowed) external;            // gỡ = siết, thêm = nới
    function setProtocolAllowed(address target, bytes4 selector, bool allowed) external;
    function setRecipientAllowed(address to, bool allowed) external;
    function bumpPolicyVersion() external;
    function recordTopUp(bytes32 cChainTxHash, uint256 amount) external;       // ghi nhận nạp mô phỏng (không chuyển tiền); Council hoặc topUpOperator
    function setTopUpOperator(address newOperator) external;                   // chỉ Council; nới (2/3)

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
    event TopUpOperatorChanged(address oldOperator, address newOperator);

    // --- errors ---
    error VaultPaused();
    error KeyNotRegistered();
    error PrincipalIsLocked();
    error TokenNotAllowed();
    error ProtocolNotAllowed();
    error RecipientNotAllowed();
    error KeyDailyCapExceeded();
    error PrincipalDailyCapExceeded();
    error SlippageTooHigh();
    error NotCouncil();
    error NotTopUpOperator();
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

**Getter để dựng `PolicySnapshot`:** `principalIds()` + `keysOf(id)` + `keyInfo(key)` (Registry) liệt kê khu và khoá; `keyDailyCap`, `principalDailyCap`, `keySpent(key, today)`, `principalSpent(id, today)`, `principalLocked`, `paused`, `policyVersion` cho hạn mức và trạng thái; `tokenAllowed`, `protocolAllowed`, `recipientAllowed` kiểm tra từng ứng viên (adapter lấy danh sách ứng viên từ event `AllowChanged` đã index, vì mapping không liệt kê được); `readAllowList(key)` của Tx AllowList cho `KeyState.allow_listed`.

### 3.1 Quyết định: `recordTopUp`

`recordTopUp` do **Council contract hoặc `topUpOperator` hiện tại** gọi; người khác revert `NotTopUpOperator`. `topUpOperator` là địa chỉ lưu trong vault, gán trong constructor, chỉ Council đổi được qua `setTopUpOperator(address)` (phát `TopUpOperatorChanged(oldOperator, newOperator)`; `address(0)` = tắt vai trò). Trong luật Council, `setTopUpOperator` là hàm **nới**: chỉ qua proposal đủ 2/3, không có đường 1 member. Lý do: hàm chỉ ghi nhận nạp mô phỏng, **không chuyển tiền và không đổi hạn mức/allow-list**, nhưng backend demo cần một khoá vận hành đơn lẻ để mô phỏng "quỹ chính nạp vào kho" (sim: `engine.topup`, spec 6.8) mà không phải qua 2/3.

**Deployer không giữ đặc quyền sau bàn giao** (spec 6.1, T15): constructor có thể đặt `topUpOperator` ban đầu, nhưng bàn giao (`L1-002`) phải đặt nó khác deployer (khoá ops riêng hoặc `address(0)`) và `VerifyHandover` phải kiểm `topUpOperator() != deployer`.

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

    error NotCouncilMember();
    error NotTightening();
    error NeedsThreshold();
    error ConflictOfInterest();
    error AlreadyApproved();
    error ProposalNotOpen();
    error NotProposer();
    error TargetNotAllowed();
    error UnknownCall();
    error BadCallArgs();
    error UnknownProposal();
}
```

Quy tắc:

- `calls[].target` chỉ được là `PrincipalRegistry`, `PolicyVault` hoặc hai precompile AllowList; ngoài ra revert `TargetNotAllowed`. Council **kết thúc** proposal bằng `vault.bumpPolicyVersion()`.
- Xung đột lợi ích: member có `memberPrincipal == subjectPrincipal` không được `approve`. Nếu proposal chuyển khoá sang khu của member (ví dụ giao agent cho `huy`), proposal phải khai `subjectPrincipal = huy`.
- Cài đặt Council suy ra tập khu bị ảnh hưởng từ calldata lúc `propose` (moveKey: cả khu gửi và khu nhận; addKey/createPrincipal/cap/lock/unlock theo `id`; khoá theo khu hiện tại của nó), yêu cầu `subjectPrincipal` thuộc tập (nếu tập khác rỗng; lỗi của contract `SubjectMismatch`, không nằm trong interface đóng băng) và cấm mọi member có khu thuộc tập `approve` (`ConflictOfInterest`). Chi tiết: README module contracts.
- `emergencyLock(id)`: Council là admin của Tx AllowList (sau bàn giao) nên gọi được `setNone` cho từng `keysOf(id)`; `unlockPrincipal` qua proposal phải kèm `setEnabled` lại các khoá.
- Khoá mới thêm vào (proposal `addKey`/`moveKey`) phải kèm `TxAllowList.setEnabled(key)` trong cùng proposal.
- `riskReportHash` = `keccak256` của JSON chuẩn hoá do backend tạo; contract chỉ lưu.
- Hàm siết gọi bởi non-member → `NotCouncilMember`; gọi hàm nới qua đường 1 member → `NeedsThreshold`; `lowerCap` với giá trị không thấp hơn hiện tại, hoặc `revokeAllow` không gỡ → `NotTightening`.
- `EmergencyAction.action` là tên hàm Vault/Registry được gọi (`lockPrincipal`, `pauseAll`, `setKeyDailyCap`, `setPrincipalDailyCap`, `setTokenAllowed`, `setProtocolAllowed`, `setRecipientAllowed`, `deactivateKey`); `subject` là `principalId`, hoặc địa chỉ đệm trái thành `bytes32`, hoặc 0.

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

9 custom error đầu ứng với 9 `ReasonCode` do contract sinh; `BLOCKED_AT_PROTOCOL` chỉ đến từ lỗi RPC của Tx AllowList (giao dịch không vào được mempool) nên không có custom error. Mã hạn mức khu chuẩn là `DISTRICT_DAILY_CAP` (chữ `PRINCIPAL_DAILY_CAP` trong bản spec gốc là lỗi, đã chốt).

Lỗi không có reason code (chỉ giữ tên trong `error_raw`; khai báo trong `Backend/src/guardian/chain/errors.py` `OTHER_ERRORS`): `NotCouncil`, `NotTopUpOperator`, `UnknownPair`, `NotCouncilMember`, `NotTightening`, `NeedsThreshold`, `ConflictOfInterest`, `AlreadyApproved`, `ProposalNotOpen`, `NotProposer`, `TargetNotAllowed`, `UnknownCall`, `BadCallArgs`, `UnknownProposal`, `KeyAlreadyRegistered`, `PrincipalNotFound`, `PrincipalExists`. (`OTHER_ERRORS` còn `InsufficientBalance`, `InsufficientTreasury`: chỉ sim phát; trên chain đó là revert của ERC-20 / không có tương đương.) Bảng mã nguồn: `Backend/src/guardian/shared/reason_codes.py` ↔ `Frontend/src/shared/reasonCodes.ts`. Selector từng lỗi: mục 9.1.

## 6. Event ↔ `ChainEvent` ([API_CONTRACT.md](API_CONTRACT.md) mục 2)

Mọi event trong bảng payload của `ChainEvent` có một event contract cùng tên, **tên trường trùng tên tham số** (test kiểm). Ngoại lệ duy nhất là `AllowListRoleSet`, **off-chain** (log của precompile, mục 7). Indexer chuẩn hoá khi giải mã log:

| Trường | Trên chain | Trong `ChainEvent.payload` |
|---|---|---|
| `CapChanged.kind` | `uint8`: 0 key, 1 principal | `"key"` / `"principal"` |
| `AllowChanged.kind` | `uint8`: 0 token, 1 protocol, 2 recipient | `"token"` / `"protocol"` / `"recipient"` |
| `CapChanged.subject`, `AllowChanged.subject` | `bytes32` | kind key/token/protocol/recipient: địa chỉ (bỏ đệm trái 12 byte); kind principal: `principalId` |
| `AllowChanged.selector` | `bytes4`, `0x00000000` khi không phải protocol | selector khi kind = protocol, `null` còn lại |
| `KeyAdded.kind` | `uint8` (enum `KeyKind`) | tên enum chữ thường (`human` / `agent` / `service`) |
| `principalId`, `id` (bytes32) | 32 byte | giữ nguyên hex; tầng API quy ra id ASCII bằng cách bỏ byte 0 ở cuối |
| `EmergencyAction.subject` | `bytes32` | `principalId`, hoặc địa chỉ nếu `action` thao tác trên một khoá/token/recipient |
| Event `Paused(address by)` / `Unpaused()` của Vault | không kế thừa `Pausable` của OpenZeppelin (cùng tên nhưng tham số khác) | `{by}` / `{}` |

Tx bị revert không có event.

## 7. Ánh xạ `AllowListRoleSet`

Tx AllowList (precompile) phát `RoleSet(uint256 indexed role, address indexed account, address indexed sender, uint256 oldRole)` mỗi khi `setNone` / `setEnabled` / `setAdmin`. Indexer chuẩn hoá thành `ChainEvent` tên `AllowListRoleSet`:

| `ChainEvent.payload` | Nguồn |
|---|---|
| `key` | `account` |
| `role` | `role` (0 none, 1 enabled, 2 admin; version mới có thêm manager = 3 nếu bật) |
| `by` | `sender` |

Chỉ lọc log có `address == 0x0200000000000000000000000000000000000002`. Event này **không** nằm trong ABI đóng băng (không do contract của ta phát); chữ ký `RoleSet` phải kiểm lại với đúng version Subnet-EVM ở `L1-002`. `tx_hash` / `log_index` lấy theo log gốc. Sim chưa phát event này (xem API_CONTRACT mục 7).

## 8. MockDEX / EvilDEX / token

```solidity
interface IMockDEX {
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut);
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
    function setRate(address tokenIn, address tokenOut, uint256 numerator, uint256 denominator) external;  // Council

    error NotCouncil();
    error UnknownPair();
}
```

Tỉ giá cố định `1 tTKB = 1 tUSDC` (tính theo giá trị, có chuyển decimals). `EvilDEX` có cùng interface nhưng không bao giờ được whitelist. Cặp chưa có rate: `UnknownPair`. Trượt giá do **vault** kiểm (`SlippageTooHigh`), DEX chỉ trả `amountOut`. Token: `TestUSDC` (6), `TestTokenB` / `tTKB` (18), `TestScam` / `tSCAM` (18), ERC-20 OpenZeppelin, `mint` chỉ Deployer trước bàn giao, sau bàn giao chỉ Council; token là ERC-20 chuẩn nên không có file interface riêng trong phạm vi đóng băng.

## 9. Địa chỉ, artifact và selector

- `deployments/fuji-l1.json`, `deployments/fuji-c.json` (hiện rỗng): `{ chainId, rpcUrl, deployedAt, contracts: { registry, vault, council, mockDex, evilDex, tUSDC, tTKB, tSCAM }, precompiles: {...}, members: {...} }`; khoá test không bao giờ nằm trong file này.
- ABI JSON cho backend: `make abis` (chạy `contracts/scripts/export-abis.sh`: `forge build` rồi `forge inspect <Interface> abi`), một file mỗi interface ở `Backend/src/guardian/chain/abis/`. Sau khi sửa `.sol`, chạy `make abis` và commit cả ABI lẫn bảng selector/topic dưới đây; test `test_contract_abi.py` fail nếu bảng, ABI và `reason_codes.py` lệch nhau.
- Selector và topic dưới đây **do máy sinh** từ ABI (keccak-256 của chữ ký chuẩn); không sửa tay.

### 9.1 Custom error selectors

| Error | Selector | Interface |
|---|---|---|
| `AlreadyApproved()` | `0x101f817a` | IGuardianCouncil |
| `BadCallArgs()` | `0x6711014a` | IGuardianCouncil |
| `ConflictOfInterest()` | `0x8d803ad9` | IGuardianCouncil |
| `KeyAlreadyRegistered()` | `0x18f78402` | IPrincipalRegistry |
| `KeyDailyCapExceeded()` | `0x2882e08b` | IPolicyVault |
| `KeyNotRegistered()` | `0x815589fb` | IPolicyVault |
| `NeedsThreshold()` | `0x468e2638` | IGuardianCouncil |
| `NotCouncil()` | `0xd7b93c0f` | IMockDEX, IPolicyVault, IPrincipalRegistry |
| `NotCouncilMember()` | `0x4a42c42d` | IGuardianCouncil |
| `NotProposer()` | `0x7d1b73b9` | IGuardianCouncil |
| `NotTightening()` | `0x0bbfcdcc` | IGuardianCouncil |
| `NotTopUpOperator()` | `0xeced5412` | IPolicyVault |
| `PrincipalDailyCapExceeded()` | `0xd2995bb7` | IPolicyVault |
| `PrincipalExists()` | `0x7b3719fb` | IPrincipalRegistry |
| `PrincipalIsLocked()` | `0xa2fa1d0b` | IPolicyVault |
| `PrincipalNotFound()` | `0xde31d430` | IPrincipalRegistry |
| `ProposalNotOpen()` | `0x49c74310` | IGuardianCouncil |
| `ProtocolNotAllowed()` | `0xc49c7d84` | IPolicyVault |
| `RecipientNotAllowed()` | `0x4ccc1eec` | IPolicyVault |
| `SlippageTooHigh()` | `0x850c6f76` | IPolicyVault |
| `TargetNotAllowed()` | `0x48cbf26d` | IGuardianCouncil |
| `TokenNotAllowed()` | `0xa29c4986` | IPolicyVault |
| `UnknownCall()` | `0x35c169a5` | IGuardianCouncil |
| `UnknownPair()` | `0xfee00694` | IMockDEX |
| `UnknownProposal()` | `0x5d5d3ca0` | IGuardianCouncil |
| `VaultPaused()` | `0xda9f8b34` | IPolicyVault |

### 9.2 Event topics (`topic0`)

| Event | topic0 | Interface |
|---|---|---|
| `AllowChanged(uint8,bytes32,bytes4,bool)` | `0x1a74959b07554b42b21c80659187a04623a7162e511e70ed4181526da831f935` | IPolicyVault |
| `Approved(uint256,address)` | `0x7b39c92a7e1a86e846edaeff6eba715a046352c596794c2a374269c126a99768` | IGuardianCouncil |
| `Cancelled(uint256)` | `0xc41d93b8bfbf9fd7cf5bfe271fd649ab6a6fec0ea101c23b82a2a28eca2533a9` | IGuardianCouncil |
| `CapChanged(uint8,bytes32,uint256,uint256)` | `0x890b66ab58e9108da03c4e290a7205837e2200b5a5d67ba45402831ae945355e` | IPolicyVault |
| `EmergencyAction(address,string,bytes32)` | `0x8d283363c7ec3e74a809db7d9380bbd89e8a164c4a1becb7c3c2b26a307788f8` | IGuardianCouncil |
| `Executed(uint256)` | `0xbcf6a68a2f901be4a23a41b53acd7697893a7e34def4e28acba584da75283b67` | IGuardianCouncil |
| `KeyAdded(bytes32,address,uint8,string)` | `0x2ede8e992693c07f277c68ba7d0bd4ae4c7ee7181f289caa856562e192e4e5b9` | IPrincipalRegistry |
| `KeyDeactivated(address)` | `0xb2d9b15f97826562f8897914968b2af5d913bcb9d1a7a027441c48e7742179cd` | IPrincipalRegistry |
| `KeyMoved(address,bytes32,bytes32)` | `0x0ecd802b4073486ccb5fef06415660834f792cf0edbb37654410cb456e7238aa` | IPrincipalRegistry |
| `Paid(address,bytes32,address,address,uint256,uint256,uint256,uint256,bytes32)` | `0xc338544f60532b6d8f6a46a17af2a35100168a9cae3cd97f108c9539d8a87041` | IPolicyVault |
| `Paused(address)` | `0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258` | IPolicyVault |
| `PolicyVersionBumped(uint256)` | `0xa217394a38de01d24cd568a53a4aaa25bdbf33ce0739c216ec9de712f3cf36bb` | IPolicyVault |
| `PrincipalCreated(bytes32,string)` | `0xf5f3e5f3a97d4bfc70678e8480eeae765a54d2c63b601036dd4d43ca10749564` | IPrincipalRegistry |
| `PrincipalLocked(bytes32,address)` | `0x687bd57c668543349f8fee10d1228a623d5c8ea68691bb91d448fc482f0fd427` | IPolicyVault |
| `PrincipalUnlocked(bytes32)` | `0x71358498c9ecc7ebec24f3f32b30e5838f7e36aa16e9ea1837f1479659deafbe` | IPolicyVault |
| `Proposed(uint256,address,bytes32,string,bytes32)` | `0x53044b00ae03a91775e6aa41a1385f051ca12d5cf216782dbb8092fde77ae630` | IGuardianCouncil |
| `Swapped(address,bytes32,address,address,address,uint256,uint256,uint256,uint256,uint256,bytes32)` | `0xcb21102926f824ae487554f7bda88a63bbc32019fa9897c2155958bcc4f3d2ee` | IPolicyVault |
| `TopUpOperatorChanged(address,address)` | `0xfa6bb50023b6d053abe4b6f4298d6111d11be2a1da6cbb6cf5c2c373facc8fa1` | IPolicyVault |
| `TopUpRecorded(bytes32,uint256)` | `0xe6fdc65f95ab4849a1aa3c5dbd29341a3daa102740fdb23ffe246e1c82b7d6c6` | IPolicyVault |
| `Unpaused()` | `0xa45f47fdea8a1efdd9029a5691c7f759c32b7c698632b563573e155625d16933` | IPolicyVault |

## 10. Tiêu chí đóng băng (`CTR-001`), đã đạt 2026-11-12

- [x] 4 file `contracts/src/interfaces/I*.sol` biên dịch được (`forge build`, không warning) và khớp tài liệu này
- [x] Mọi event trong mục 2–4 có đủ trường mà `ChainEvent.payload` (API_CONTRACT.md mục 2) cần; `AllowListRoleSet` đánh dấu off-chain (mục 7)
- [x] 9 custom error ở mục 5 khớp 9 `ReasonCode` do contract sinh trong `Backend/src/guardian/shared/reason_codes.py`
- [x] Bản sao ABI JSON có mặt ở `Backend/src/guardian/chain/abis/`, test so khớp selector/topic với mục 9
