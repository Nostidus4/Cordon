# PAYROLL — quỹ lương có luật (B04, bộ contract mới, tách riêng)

Trạng thái: **FROZEN** từ **2026-11-13** (Tech Lead duyệt, quyết định ở mục 11). Issue `CITY-006` (#65). Truy vết: [CITY_OPS.md](CITY_OPS.md) §1, §6; đề UniHack #21.

Bộ contract này **mới và tách riêng**: không sửa một dòng nào trong bộ đã đóng băng ([CONTRACTS.md](CONTRACTS.md): `PrincipalRegistry`, `PolicyVault`, `GuardianCouncil`, `MockDEX`), không sửa `ChainPort`. Khi Tech Lead duyệt, chốt bằng một PR riêng (giống `CTR-001`): tài liệu này, `contracts/src/payroll/interfaces/I*.sol`, ABI cho backend và test so khớp. Chỉ sau đó mới viết cài đặt.

Ý tưởng cốt lõi áp dụng nguyên vẹn: **siết thì làm ngay (tự động hoặc một thành viên Hội đồng); nới luôn cần Hội đồng 2/3; không có đường tự động nào được nới.** Agent không có đường nào tới địa chỉ ngoài whitelist.

## 1. Tổng quan và vai trò

Mỗi tháng công ty gom `payrollTotal` (tối đa 10 người nhận) vào `PayrollVault`. Trong thời gian chờ tới `payday`, agent có thể đặt một phần tiền vào các **venue được whitelist** (kiếm lãi) rồi **rút dần theo bậc thang** để tới **T-1** (một ngày trước `payday`) toàn bộ gốc đã về kho. Ngày lương, bất kỳ ai cũng có thể bấm chi: tiền chỉ đi tới danh sách nhận (roster), đúng số đã khai.

| Vai trò | Là ai | Được làm gì |
|---|---|---|
| Hội đồng 2/3 | Ba thành viên của `GuardianCouncil` sẵn có, qua contract mới `PayrollGovernor` (mục 1.1) | Siết: 1 thành viên. Nới: đề xuất đủ 2/3 |
| Agent (khoá phiên) | `agent` trong `LadderScheduler.isAgent` | Chỉ `allocate` / `unwind`. Không có tham số "người nhận" ở bất kỳ hàm nào |
| Keeper / bất kỳ ai | Không cần quyền | `unwindDue`, `finalize`, `execute` (chỉ đưa tiền về kho hoặc trả đúng roster, không bao giờ làm tiền đi chỗ khác) |
| Người vận hành demo | `MockVenue.admin` | `setFrozen`, `setYieldBpsPerDay`, `fundYield` (chỉ mock, không phải production) |

### 1.1 Có dùng lại `GuardianCouncil` được không?

**Dùng lại thành viên, không dùng lại contract.** `GuardianCouncil._checkCall` giới hạn `calls[].target` vào 4 địa chỉ bất biến (Registry, Vault, hai AllowList) và whitelist selector; contract đã đóng băng nên không thêm target payroll được. Do đó:

- Thêm contract `PayrollGovernor` (mục 2.6): cùng khuôn propose/approve/execute, ngưỡng 2, nhưng **thành viên đọc trực tiếp từ `GuardianCouncil.members(i)`** (3 địa chỉ). Hội đồng đổi người thì Governor tự theo, không có danh sách thứ hai để lệch.
- Không có "khu" (principal) trong payroll nên không có `ConflictOfInterest` theo khu. Câu hỏi mở Q4: thành viên nằm trong roster có được duyệt đề xuất đổi roster không.
- Trên L1 thật, khoá agent / keeper vẫn phải qua Tx AllowList: thêm bằng đề xuất `GuardianCouncil` sẵn có (`setEnabled`), không cần đổi gì ở bộ cũ. Triển khai bộ payroll cần ví deployer nằm trong Contract Deployer AllowList (đã là quy trình của `infra/l1`).

Phương án thay thế (Q1): sao chép `GuardianCouncil` thành `PayrollCouncil` với cùng 3 thành viên nhập tay. Không khuyến nghị vì hai danh sách thành viên dễ lệch.

## 2. Contract

Đặt tại `contracts/src/payroll/` (interface ở `contracts/src/payroll/interfaces/`), test ở `contracts/test/payroll/`. Solidity 0.8.28, `deny = "warnings"`, OpenZeppelin `SafeERC20` + `ReentrancyGuard`. Tiền tệ `uint256` base unit của `token` (tUSDC, 6 decimals). `bps` là mười nghìn phần.

**Đơn vị ngày `dayUnit`** (immutable của `FloatPolicy`, mặc định `86400`). Mọi "1 ngày" trong tài liệu là `dayUnit`. Triển khai demo nén trên L1 thật đặt `dayUnit = 20` (30 ngày = 10 phút); sim và anvil dùng `86400` và tua thời gian (mục 8).

Quy ước giống CONTRACTS.md: hàm quản trị của `PayrollVault` / `FloatPolicy` / `LadderScheduler` / `PayrollExecutor` chỉ nhận `msg.sender == governor`, nếu không revert `NotGovernor()`. Phân biệt siết/nới nằm ở `PayrollGovernor`, không nằm ở contract bị quản trị. Lệnh bị chặn bằng revert **không sinh event**; lý do là custom error.

### 2.1 IVenue và MockVenue

```solidity
interface IVenue {
    function asset() external view returns (address);
    function deposit(uint256 amount) external;                          // kéo token từ msg.sender (đã approve)
    function withdraw(uint256 amount) external returns (uint256 received); // trả token về msg.sender, revert nếu đóng băng
    function assetsOf(address account) external view returns (uint256); // gốc + lãi tích luỹ
    function maxWithdraw(address account) external view returns (uint256); // 0 khi đóng băng
}

interface IMockVenue is IVenue {
    function admin() external view returns (address);
    function frozen() external view returns (bool);
    function yieldBpsPerDay() external view returns (uint256);
    function setFrozen(bool frozen_) external;                 // chỉ admin
    function setYieldBpsPerDay(uint256 bps) external;          // chỉ admin; lãi đơn, tính theo block.timestamp
    function fundYield(uint256 amount) external;               // kéo token từ admin vào quỹ trả lãi

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event FrozenSet(bool frozen);
    event YieldRateSet(uint256 bpsPerDay);

    error NotAdmin();
    error Frozen();
    error InsufficientAssets();
}
```

`withdraw` luôn trả token về `msg.sender` (không có tham số người nhận). Lãi bị giới hạn bởi số dư quỹ lãi đã `fundYield`. Triển khai hai bản: `MockVenueA`, `MockVenueB` (cùng contract `MockVenue`, hai instance; demo đóng băng B). `MockVenue` nằm ở `contracts/src/payroll/mocks/`, **không bao giờ** là một phần của production whitelist nếu không có đề xuất 2/3.

### 2.2 IPayrollVault

```solidity
struct Payee { address account; uint256 amount; }

interface IPayrollVault {
    // --- views ---
    function token() external view returns (address);
    function governor() external view returns (address);
    function policy() external view returns (address);
    function scheduler() external view returns (address);
    function executor() external view returns (address);
    function treasury() external view returns (address);          // nơi duy nhất nhận phần thặng dư/trả lại
    function cycleId() external view returns (uint256);
    function payday() external view returns (uint256);
    function paid() external view returns (bool);
    function payrollTotal() external view returns (uint256);      // = tổng amount của roster
    function principal() external view returns (uint256);         // tổng đã nạp qua deposit() trong chu kỳ (không gồm reserve)
    function reserve() external view returns (uint256);           // phần dự phòng nằm trong kho, không allocate được
    function idle() external view returns (uint256);              // token.balanceOf(this) - reserve
    function deployed(address venue) external view returns (uint256);  // giá gốc (cost basis) còn nằm ở venue
    function deployedTotal() external view returns (uint256);
    function venueList() external view returns (address[] memory);     // venue từng nhận tiền hoặc đang whitelist
    function payeeCount() external view returns (uint256);
    function payeeAt(uint256 i) external view returns (address account, uint256 amount);
    function isPayee(address account) external view returns (bool);
    function yieldRealized() external view returns (uint256);

    // --- nạp tiền: ai cũng gọi được (chỉ đưa token VÀO kho) ---
    function deposit(uint256 amount) external;
    function fundReserve(uint256 amount) external;

    // --- chỉ LadderScheduler ---
    function deployToVenue(address venue, uint256 amount) external;
    function recallFromVenue(address venue, uint256 amount) external returns (uint256 received);
    function releaseReserve(uint256 amount) external;

    // --- chỉ PayrollExecutor ---
    function payOut(address to, uint256 amount) external;          // to phải isPayee, mỗi payee một lần mỗi chu kỳ
    function markPaid() external;

    // --- quản trị: chỉ governor ---
    function setRoster(Payee[] calldata roster) external;           // nới; <= 10, không trùng, amount > 0
    function removePayee(address account) external;                 // siết (giữ tiền lại); hạ payrollTotal
    function startCycle(uint256 newPayday) external;                // nới; chỉ khi paid và deployedTotal == 0
    function returnReserve(uint256 amount) external;                // nới; chỉ về treasury, giữ coverage
    function withdrawSurplus(uint256 amount) external;              // nới; chỉ về treasury, chỉ sau paid, không đụng reserve

    // --- events ---
    event Deposited(address indexed from, uint256 amount, uint256 principalAfter);
    event ReserveFunded(address indexed from, uint256 amount, uint256 reserveAfter);
    event Deployed(address indexed venue, uint256 amount, uint256 deployedAfter, uint256 idleAfter);
    event Recalled(address indexed venue, uint256 requested, uint256 received, uint256 principalPart, uint256 yieldPart);
    event RecallFailed(address indexed venue, uint256 requested);           // venue revert/đóng băng
    event Haircut(address indexed venue, uint256 requested, uint256 received); // venue trả thiếu mà không revert
    event ReserveReleased(uint256 amount, uint256 reserveAfter);
    event ReserveReturned(uint256 amount);
    event PaidOut(address indexed payee, uint256 amount, uint256 cycleId);
    event RosterSet(uint256 payeeCount, uint256 payrollTotal);
    event PayeeRemoved(address indexed account, uint256 payrollTotalAfter);
    event CycleStarted(uint256 indexed cycleId, uint256 payday);
    event SurplusWithdrawn(uint256 amount);

    // --- errors ---
    error NotGovernor();
    error NotScheduler();
    error NotExecutor();
    error NotPayee();
    error AlreadyPaid();
    error RosterTooLarge();
    error RosterInvalid();          // trùng, amount = 0, địa chỉ 0
    error RosterLocked();           // sau deadline (T-1) không đổi roster
    error CycleNotSettled();
    error InsufficientIdle();
    error ZeroAddress();
    // lỗi của FloatPolicy được bubble lên từ policy.assertCanDeploy (mục 2.3)
}
```

Quy tắc cài đặt:

- `deployToVenue`: gọi `policy.assertCanDeploy(venue, amount)` (lớp kiểm thứ hai, phòng scheduler lỗi), `SafeERC20.forceApprove(venue, amount)`, `IVenue(venue).deposit(amount)`, rồi `forceApprove(venue, 0)`. `nonReentrant`. Cập nhật `deployed[venue]` **trước** gọi ngoài.
- `recallFromVenue`: gọi `IVenue(venue).withdraw(amount)` trong `try/catch`. Lỗi: phát `RecallFailed`, trả `received = 0`, **không revert** (một venue hỏng không được chặn các venue khác). Số nhận thực tế tính bằng **chênh lệch `balanceOf`**, không tin giá trị venue trả về. `principalPart = min(received, deployed[venue])`, phần dư vào `yieldRealized`; `received < amount` mà không revert thì phát thêm `Haircut`. Rút venue **không phụ thuộc whitelist** (venue đã bị gỡ vẫn rút được; gỡ venue không bao giờ làm kẹt tiền).
- `payOut` chỉ chuyển token tới `to` trong roster, đúng `amount` của roster, mỗi người một lần mỗi chu kỳ. Không có đường nào khác để token rời vault ngoài `deployToVenue` (tới venue whitelist), `payOut` (roster), `returnReserve` / `withdrawSurplus` (chỉ `treasury`).
- `setRoster` / `removePayee` revert `RosterLocked` khi `block.timestamp >= policy.deadline()`. `setRoster` và `returnReserve` kiểm lại coverage (I-5) sau thay đổi, nếu vi phạm revert `CoverageInsufficient` (error của policy).

### 2.3 IFloatPolicy

```solidity
interface IFloatPolicy {
    // --- hằng và tham số cố định khi triển khai ---
    function dayUnit() external view returns (uint256);              // 86400 (demo nén: 20)
    function MAX_VENUE_BPS() external view returns (uint16);         // 4000 (40%), cứng, không ai nâng được
    function MIN_BUFFER_BPS() external view returns (uint16);        // 500 (5%), sàn cứng
    function MIN_DEADLINE_LEAD() external view returns (uint256);    // 1 * dayUnit, sàn cứng
    function MAX_VENUES() external view returns (uint256);           // 8

    // --- trạng thái luật ---
    function vault() external view returns (address);
    function governor() external view returns (address);
    function venueAllowed(address venue) external view returns (bool);
    function venueCapBps(address venue) external view returns (uint16);   // <= MAX_VENUE_BPS
    function venueImpaired(address venue) external view returns (bool);
    function bufferBps() external view returns (uint16);                  // >= MIN_BUFFER_BPS
    function deadlineLead() external view returns (uint256);              // >= MIN_DEADLINE_LEAD
    function faultTolerance() external view returns (uint8);              // k: số venue có thể kẹt cùng lúc, 1..MAX_VENUES
    function killed() external view returns (bool);
    function killReason() external view returns (uint8);                  // 0 none, 1 member, 2 deadline, 3 automation

    // --- tính toán (view) ---
    function deadline() external view returns (uint256);                  // payday - deadlineLead
    function bufferAmount() external view returns (uint256);              // bufferBps * principal / 10000
    function venueCapAmount(address venue) external view returns (uint256); // venueCapBps * principal / 10000
    function coverage() external view returns (uint256);                  // principal + reserve - payrollTotal (0 nếu âm)
    function exposureAtRisk() external view returns (uint256);            // tổng k vị thế (cost basis) lớn nhất
    function checkDeploy(address venue, uint256 amount) external view returns (bytes4 errorSelector); // 0 = được

    /// @dev Chạy đúng thứ tự mục 2.3.1; revert bằng custom error tương ứng. Gọi bởi vault.
    function assertCanDeploy(address venue, uint256 amount) external view;
    /// @dev Vault/Governor gọi khi roster hoặc reserve đổi: revert CoverageInsufficient nếu exposureAtRisk > coverage.
    function assertCoverage() external view;

    // --- tự động hoá / permissionless siết ---
    function markImpaired(address venue) external;       // chỉ scheduler (khi recall thất bại); siết, không có đường ngược tự động
    function kill(uint8 reason) external;                // chỉ scheduler hoặc governor; siết

    // --- quản trị: chỉ governor ---
    function setVenue(address venue, bool allowed, uint16 capBps) external;   // thêm = nới; gỡ (allowed=false) = siết
    function setVenueCapBps(address venue, uint16 capBps) external;           // hạ = siết, tăng = nới
    function setBufferBps(uint16 bps) external;                               // tăng = siết, hạ = nới
    function setDeadlineLead(uint256 lead) external;                          // tăng = siết, giảm = nới (>= MIN_DEADLINE_LEAD)
    function setFaultTolerance(uint8 k) external;                             // tăng = siết, giảm = nới
    function clearImpaired(address venue) external;                           // nới
    function resetKill() external;                                            // nới

    // --- events ---
    event VenueSet(address indexed venue, bool allowed, uint16 capBps);
    event VenueCapChanged(address indexed venue, uint16 oldBps, uint16 newBps);
    event BufferChanged(uint16 oldBps, uint16 newBps);
    event DeadlineLeadChanged(uint256 oldLead, uint256 newLead);
    event FaultToleranceChanged(uint8 oldK, uint8 newK);
    event VenueImpaired(address indexed venue, uint256 deployedAtRisk);
    event ImpairedCleared(address indexed venue);
    event KillSwitch(uint8 reason, address by);
    event KillReset();

    // --- errors (thứ tự kiểm ở 2.3.1) ---
    error NotGovernor();
    error NotAuthorized();               // markImpaired / kill từ địa chỉ lạ
    error KillSwitchActive();
    error DeadlinePassed();
    error VenueNotAllowed();
    error VenueImpairedError();          // tên Solidity tránh trùng event; reason code: VENUE_IMPAIRED
    error LadderCeilingExceeded();
    error BufferBreached();
    error VenueCapExceeded();
    error CoverageInsufficient();
    error TooManyVenues();
    error BpsOutOfRange();               // capBps > MAX_VENUE_BPS, bufferBps < MIN_BUFFER_BPS, lead < MIN_DEADLINE_LEAD...
}
```

#### 2.3.1 Thứ tự kiểm trong `assertCanDeploy(venue, amount)` (cố định, quyết định reason code)

Với `deployedAfter = vault.deployedTotal() + amount`, `venueAfter = vault.deployed(venue) + amount`:

1. `!killed` → `KillSwitchActive`
2. `block.timestamp < deadline()` → `DeadlinePassed`
3. `venueAllowed[venue]` → `VenueNotAllowed`
4. `!venueImpaired[venue]` → `VenueImpairedError`
5. `deployedAfter <= scheduler.ceilingAmount(block.timestamp)` → `LadderCeilingExceeded` (trần theo bậc thang, mục 2.4)
6. `vault.idle() - amount >= bufferAmount()` → `BufferBreached` (luôn giữ ≥ 5% gốc ở dạng thanh khoản trong kho)
7. `venueAfter <= venueCapAmount(venue)` → `VenueCapExceeded` (≤ 40% gốc mỗi venue, `min(venueCapBps, MAX_VENUE_BPS)`)
8. exposure sau khi đặt: tổng `k` vị thế lớn nhất (đã cộng `amount` vào `venue`) `<= coverage()` → `CoverageInsufficient` (điều kiện đảm bảo ngày lương, mục 3)

(`amount == 0` revert `BpsOutOfRange` không áp dụng; `amount == 0` là no-op bị chặn ở scheduler bằng `ZeroAmount`.)

### 2.4 ILadderScheduler

Bậc thang là **trần** lượng tiền được phép nằm ngoài kho theo thời gian. Quá trần thì không `allocate` thêm được và phần vượt trở thành "đến hạn rút" (`due`) mà **bất kỳ ai** cũng kích hoạt được (agent chết cũng không làm kẹt tiền).

```solidity
struct Rung { uint256 beforeDeadline; uint16 maxDeployedBps; }   // trần áp dụng từ (deadline - beforeDeadline)

interface ILadderScheduler {
    // --- views ---
    function vault() external view returns (address);
    function policy() external view returns (address);
    function governor() external view returns (address);
    function isAgent(address key) external view returns (bool);
    function finalized() external view returns (bool);
    function rungCount() external view returns (uint256);
    function rungAt(uint256 i) external view returns (uint256 beforeDeadline, uint16 maxDeployedBps);
    function ceilingBpsAt(uint256 ts) external view returns (uint16);
    function ceilingAmount(uint256 ts) external view returns (uint256);         // ceilingBps * principal / 10000
    function dueAmount(address venue) external view returns (uint256);          // phần đến hạn rút của venue lúc này
    function nextRungAt() external view returns (uint256);                      // timestamp bậc kế tiếp, 0 nếu hết

    // --- agent (isAgent) ---
    function allocate(address venue, uint256 amount) external;
    function unwind(address venue, uint256 amount) external returns (uint256 received);

    // --- permissionless: chỉ đưa tiền VỀ kho ---
    function unwindDue(address venue) external returns (uint256 received);
    function finalize() external returns (uint256 idleAfter, uint256 reserveReleased);

    // --- tự động / Hội đồng ---
    function killSwitch() external;                    // chỉ governor (qua hàm siết của Governor)

    // --- quản trị: chỉ governor ---
    function setRungs(Rung[] calldata rungs) external;           // thay cả thang; Governor phân loại siết/nới (xem 4)
    function setAgent(address key, bool active) external;        // thêm = nới; gỡ = siết

    // --- events ---
    event Allocated(address indexed agent, address indexed venue, uint256 amount, uint256 deployedTotalAfter, uint256 ceiling);
    event Unwound(address indexed by, address indexed venue, uint256 requested, uint256 received);
    event RungsSet(uint256 count);
    event AgentSet(address indexed key, bool active);
    event Finalized(uint256 idleAfter, uint256 shortfall, uint256 reserveReleased, uint256 stuckAtVenues);
    event Underfunded(uint256 idleAfter, uint256 payrollTotal);   // không đủ ngay cả sau reserve (giả định A1 bị vi phạm)

    // --- errors ---
    error NotGovernor();
    error NotAgent();
    error ZeroAmount();
    error NothingDue();
    error LadderInvalid();       // không đơn điệu, hơn 8 bậc, bậc cuối khác (0, 0)
    error ExceedsDeployed();
    error DeadlineNotReached();  // finalize() trước deadline (đã nêu ở quy tắc finalize)
}
```

Quy tắc:

- **Bậc thang hợp lệ** (`setRungs`, constructor): tối đa 8 bậc; `beforeDeadline` giảm nghiêm ngặt; `maxDeployedBps` không tăng; **bậc cuối có `beforeDeadline = 0` và `maxDeployedBps = 0`** (tại deadline trần = 0, hard-coded, kể cả Hội đồng cũng không bỏ được). Trước bậc đầu, trần = `10000 - bufferBps`.
- **Bậc mặc định** cho chu kỳ 30 ngày: `(14d, 6000) (7d, 3000) (3d, 1000) (0, 0)`.
- `allocate`: `onlyAgent`, rồi `vault.deployToVenue` (policy kiểm lần nữa). Không có tham số người nhận.
- `unwind`: `onlyAgent`, bất kỳ lượng ≤ `deployed(venue)`, kể cả venue đã gỡ whitelist. Thất bại ở venue không revert cả giao dịch: `Unwound(... received = 0)` và `policy.markImpaired(venue)`.
- `dueAmount(venue)` chỉ tính trên các venue **khoẻ** (không impaired): `excess = max(0, healthyDeployedTotal - ceilingAmount(now))`, `due(v) = ceil(excess * deployed[v] / healthyDeployedTotal)`. `unwindDue(venue)` rút đúng `due`, revert `NothingDue` nếu 0. **Quy tắc thăm dò (probe rule):** mỗi bậc phải đòi được tiền từ **mọi** venue còn vị thế, nên một venue đóng băng bị phát hiện tối đa một bậc trước deadline.
- `finalize()` (permissionless, `block.timestamp >= policy.deadline()`; trước đó revert `DeadlineNotReached`):
  1. `policy.kill(2)` nếu chưa kill (deadline = công tắc tự bắn);
  2. với mọi venue còn vị thế: `vault.recallFromVenue(v, assetsOf)`; thất bại thì `markImpaired`;
  3. `shortfall = max(0, payrollTotal - vault.idle())`; `vault.releaseReserve(min(shortfall, reserve))`;
  4. nếu `idle` vẫn `< payrollTotal`: phát `Underfunded`, không revert (để lần gọi sau, khi venue mở băng, vẫn chạy tiếp);
  5. phát `Finalized`. Idempotent; gọi lại được để thử rút lại venue kẹt.
- `killSwitch()` (do Governor gọi) bật `killed` rồi **rút toàn bộ có thể** (bước 2 ở trên) nhưng **không** nhả reserve trước deadline.

### 2.5 IPayrollExecutor

```solidity
interface IPayrollExecutor {
    function vault() external view returns (address);
    function scheduler() external view returns (address);
    function executed() external view returns (bool);
    function previewExecute() external view returns (bool ok, uint256 idle, uint256 total);

    /// @notice Permissionless. Sau payday: finalize nếu chưa, kiểm idle >= payrollTotal, trả toàn roster (<= 10) trong một tx, tất cả hoặc không gì cả.
    function execute() external;

    event PayrollExecuted(uint256 indexed cycleId, uint256 total, uint256 payeeCount, address by);

    error PaydayNotReached();
    error AlreadyExecuted();
    error InsufficientFunds(uint256 idle, uint256 total);
    error EmptyRoster();
}
```

`execute` gọi `scheduler.finalize()` trước khi kiểm (nếu keeper quên T-1, ngày lương vẫn tự sửa). Chỉ trả cho `vault.payeeAt(i)` với đúng `amount`; không nhận tham số nào. Thiếu tiền thì revert toàn bộ (không trả một phần, không trả lệch).

### 2.6 IPayrollGovernor (2/3 + siết bởi một thành viên)

```solidity
struct PCall { address target; bytes data; }
struct PProposal {
    uint256 id; address proposer; PCall[] calls; bytes32 riskReportHash; string title;
    uint8 approvals; bool executed; bool cancelled; uint64 createdAt;
}

interface IPayrollGovernor {
    function THRESHOLD() external view returns (uint8);                 // 2
    function council() external view returns (address);                 // GuardianCouncil sẵn có
    function isMember(address who) external view returns (bool);        // đọc council.members(0..2)
    function approvedBy(uint256 id, address member) external view returns (bool);
    function proposalCount() external view returns (uint256);
    function getProposal(uint256 id) external view returns (PProposal memory);

    function propose(string calldata title, PCall[] calldata calls, bytes32 riskReportHash) external returns (uint256 id);
    function approve(uint256 id) external;                              // tự execute khi đủ THRESHOLD (như GuardianCouncil)
    function cancel(uint256 id) external;                               // chỉ người đề xuất

    // siết: một thành viên, không cần proposal, mỗi hàm chỉ được siết
    function killSwitch() external;
    function removeVenue(address venue) external;                       // setVenue(venue, false, 0)
    function lowerVenueCap(address venue, uint16 newBps) external;
    function raiseBuffer(uint16 newBps) external;
    function raiseDeadlineLead(uint256 newLead) external;
    function raiseFaultTolerance(uint8 newK) external;
    function lowerRung(uint256 index, uint16 newMaxBps) external;       // chỉ hạ trần của bậc, không đổi thời điểm
    function revokeAgent(address key) external;
    function removePayee(address account) external;

    event Proposed(uint256 indexed id, address indexed proposer, string title, bytes32 riskReportHash);
    event Approved(uint256 indexed id, address indexed member);
    event Executed(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event EmergencyAction(address indexed member, string action, bytes32 subject);

    error NotCouncilMember();
    error NotTightening();
    error NeedsThreshold();
    error AlreadyApproved();
    error ProposalNotOpen();
    error NotProposer();
    error TargetNotAllowed();
    error UnknownCall();
    error BadCallArgs();
    error UnknownProposal();
    error ConflictOfInterest();  // quyết định 4 (mục 11): thành viên trong roster duyệt đề xuất đổi roster/số tiền/ngày lương
}
```

`calls[].target` chỉ được là `PayrollVault`, `FloatPolicy`, `LadderScheduler`, `PayrollExecutor`; selector ngoài whitelist quản trị (mục 4) revert `UnknownCall`. Thực thi nguyên tử như `GuardianCouncil`. Mỗi hàm siết kiểm chiều thay đổi bằng view của policy (`NotTightening` nếu không chặt hơn), cùng khuôn `lowerCap` / `revokeAllow` của `GuardianCouncil`.

## 3. Bất biến (invariant)

Ký hiệu: `P = payrollTotal`, `Pr = principal`, `R = reserve`, `D = deadline = payday - deadlineLead`, `k = faultTolerance`, `L = exposureAtRisk` (tổng k vị thế cost-basis lớn nhất), `cover = max(0, Pr + R - P)`.

**I-1 (đảm bảo ngày lương, bất biến chính).** Nếu các giả định A1–A5 đúng thì từ `payday` trở đi (sau `finalize()`), `vault.idle() >= P`, nên `execute()` không bao giờ revert vì thiếu tiền, **kể cả khi tới k venue bị đóng băng vĩnh viễn**.

**I-2 (chi tiết hoá I-1: không có venue nào cho thiệt hại vượt vùng phủ).** Tại mọi thời điểm **trước `finalize()`**: `L <= cover`. Sau `finalize()`, reserve đã được dùng để bù đúng phần kẹt nên `cover` giảm theo thiết kế; khi đó I-1 là bảo đảm (sau deadline không ai `allocate` được, I-6). Làm rõ ngày 2026-11-13 sau khi fuzz trên CI tìm ra chuỗi `allocate → freeze → finalize`; không đổi interface. (Chứng minh: xem 3.1.)

**I-3 (không có đường tới địa chỉ lạ).** Token chỉ rời `PayrollVault` qua: `deployToVenue` (tới venue whitelist), `payOut` (tới payee trong roster, đúng số), `returnReserve` / `withdrawSurplus` (chỉ về `treasury`, chỉ qua 2/3). Không hàm nào của agent/keeper có tham số người nhận; `unwind` chỉ trả về vault.

**I-4 (kho thanh khoản).** Sau mọi `allocate`: `idle >= bufferBps * Pr / 10000 >= 5% Pr`.

**I-5 (trần venue).** Với mọi venue: `deployed[v] <= min(venueCapBps[v], 4000) * Pr / 10000`. `MAX_VENUE_BPS = 4000` là hằng, không ai nâng được.

**I-6 (bậc thang).** Tại `t >= D`: trần = 0, `allocate` luôn revert (`DeadlinePassed`, kể cả khi chưa ai bật kill switch). Bậc cuối của thang luôn `(0, 0)`.

**I-7 (không thể làm kẹt tiền bằng quản trị).** Gỡ venue, kill switch, hạ trần, thu hồi agent không bao giờ chặn `unwind` / `unwindDue` / `finalize`.

**I-8 (nới luôn 2/3).** Không hàm nới nào gọi được bởi agent, keeper, một thành viên hay automation; chỉ qua `PayrollGovernor.approve` đủ ngưỡng.

**I-9 (roster).** `payeeCount <= 10`, địa chỉ không trùng, `P = Σ amount`; `payOut` chỉ tới roster và mỗi người một lần mỗi chu kỳ; roster đóng băng từ D.

**I-10 (toàn vẹn).** `idle() == token.balanceOf(vault) - R >= 0`; `deployed[v]` chỉ giảm khi có `received` thực (đo bằng chênh lệch số dư).

**I-11 (kill switch đơn điệu).** Khi `killed`, `allocate` luôn revert; chỉ `resetKill` (2/3) mới tắt.

### 3.1 Điều gì được đảm bảo, theo giả định nào (nói thẳng)

**Không thể đảm bảo** `idle >= P` khi một venue giữ 40% gốc bị đóng băng nếu chỉ dựa vào "trần 40% + buffer 5%": nếu gốc `Pr = P` thì khi venue đóng băng 40% còn lại tối đa 60% (và buffer 5% không thêm tiền, chỉ là phần của 60%). Tiền kẹt không thể được rút bằng bất kỳ thứ tự bậc thang nào, vì đóng băng có thể xảy ra bất kỳ lúc nào. Bậc thang chỉ **thu hẹp thời gian lộ rủi ro** và phát hiện sớm, không tạo ra tiền.

**Luật làm AC thật sự đúng (bước 8 của `assertCanDeploy`):** chỉ cho phép đặt tiền khi, ngay cả khi `k` venue có vị thế lớn nhất kẹt hết, phần còn lại cộng reserve vẫn đủ lương:

```
L = tổng k vị thế lớn nhất  <=  Pr + R - P
```

- Reserve `R` là tiền thật nằm trong vault, **không allocate được**, chỉ nhả sang `idle` bởi `finalize()` khi cần bù (`shortfall`). Nó là "chi phí" của việc cho vay: công ty khoá thêm `R` để đổi lấy quyền đưa gốc ra venue.
- Với `Pr = P` và `k = 1`: venue tối đa `R`. Muốn dùng đủ trần 40% mỗi venue thì `R = 0.4 P`. Với `R = 0` thì `L <= Pr - P`, nghĩa là **chỉ phần vượt lương** (nếu có) mới được đặt ra venue; gốc bằng đúng lương thì không đặt được gì (đúng và an toàn).
- Hệ quả tham số: `venueCap hiệu dụng = min(40% Pr, cover)` (với k = 1); tổng mọi venue còn bị chặn bởi buffer 5%, bậc thang và `MAX_VENUES`.

**Giả định:**

- **A1 (đủ vốn):** đến D, `Pr >= P`. Nếu thiếu thì không phải lỗi float: `Underfunded` được phát và `execute` revert `InsufficientFunds`; không trả lệch.
- **A2 (số venue lỗi):** tại một thời điểm, không quá `k` venue (cấu hình, mặc định 1) kẹt/đóng băng. Muốn chịu 2 venue kẹt phải đặt `k = 2` (siết thêm, một thành viên làm được) và coverage bắt buộc rộng hơn.
- **A3 (venue chỉ đóng băng, không ăn gốc):** venue lỗi mất khả năng rút nhưng không mất gốc vĩnh viễn; nếu nó trả thiếu (haircut) mà không revert, phần thiếu **không** được bảo hiểm trừ khi nằm trong `L` (`Haircut` được phát, venue bị `markImpaired`; coverage tính trên cost basis nên vẫn phủ được mất mát tới mức cost basis).
- **A4 (token chuẩn):** `token` là ERC-20 không phí chuyển, không blacklist vault/payee, không rebasing.
- **A5 (thời gian và sống còn):** chain tiếp tục chạy qua D; `finalize()` hoặc `execute()` được ai đó gọi sau D (không cần ai gọi đúng T-1: `execute` tự `finalize`). `payday` không hết hạn.
- **A6 (cost basis):** coverage dùng giá gốc đã đặt, không dùng giá do venue báo (venue không tự thổi phồng được).
- **A7 (reserve):** `returnReserve` / đổi roster chỉ chấp nhận khi vẫn giữ I-2.

**Ai bắn kill switch tại T-1, và nó làm gì khi venue đóng băng.** (1) Contract tự bắn: từ D mọi `allocate` đã chết (I-6) và `finalize()` do **bất kỳ ai** gọi (keeper `payroll_watchdog` của backend gọi đúng ở D, cộng `execute()` gọi lại ở payday) cài `killed = true, reason = 2`. (2) `finalize` thử rút mọi venue; venue revert thì bị `markImpaired` (và `RecallFailed`); phần thiếu `shortfall = P - idle` được bù bằng `releaseReserve(min(shortfall, R))`. (3) Nhờ I-2 `shortfall <= L <= R + (Pr - P)` nên `idle >= P` sau bước này. Kill switch **không** tạo ra tiền; thứ tạo ra bảo đảm là luật coverage đã chặn từ lúc `allocate`. Hội đồng còn có thể bắn sớm (1 thành viên, reason 1) và agent/automation (reason 3) khi phát hiện đóng băng.

Phần lãi (`yieldRealized`) là phần thưởng; nếu venue kẹt, lãi của nó tạm thời mất, không ảnh hưởng I-1.

## 4. Siết và nới: ai gọi gì

| Hàm | Chiều | Ai được gọi |
|---|---|---|
| `LadderScheduler.allocate` / `unwind` | trong luật (không đổi luật) | agent (`isAgent`), policy kiểm từng lần |
| `LadderScheduler.unwindDue`, `finalize` | đưa tiền về kho | bất kỳ ai |
| `PayrollExecutor.execute` | trả đúng roster | bất kỳ ai, sau payday |
| `FloatPolicy.markImpaired` | siết | chỉ `LadderScheduler` (tự động khi recall hỏng) |
| `Governor.killSwitch` | **siết** | 1 thành viên |
| `Governor.removeVenue` (`setVenue(v,false,0)`) | **siết** | 1 thành viên |
| `Governor.lowerVenueCap` | **siết** | 1 thành viên (`NotTightening` nếu không thấp hơn) |
| `Governor.raiseBuffer` | **siết** | 1 thành viên |
| `Governor.raiseDeadlineLead` | **siết** | 1 thành viên |
| `Governor.raiseFaultTolerance` | **siết** | 1 thành viên |
| `Governor.lowerRung` | **siết** | 1 thành viên |
| `Governor.revokeAgent` (`setAgent(k,false)`) | **siết** | 1 thành viên |
| `Governor.removePayee` | **siết** (giữ tiền) | 1 thành viên |
| `FloatPolicy.setVenue(v, true, cap)` (thêm venue) | **nới** | đề xuất 2/3 |
| `setVenueCapBps` tăng | **nới** | đề xuất 2/3 |
| `setBufferBps` hạ, `setDeadlineLead` giảm, `setFaultTolerance` giảm | **nới** | đề xuất 2/3 |
| `LadderScheduler.setRungs` (đổi thang: dời bậc muộn hơn / nâng trần) | **nới** | đề xuất 2/3 |
| `LadderScheduler.setAgent(k, true)` | **nới** | đề xuất 2/3 |
| `FloatPolicy.clearImpaired`, `resetKill` | **nới** | đề xuất 2/3 |
| `PayrollVault.setRoster` (đổi/tăng người nhận hay số tiền) | **nới** | đề xuất 2/3 |
| `PayrollVault.startCycle`, `returnReserve`, `withdrawSurplus` | **nới** | đề xuất 2/3 |

Luật phân loại: trong `Governor`, mỗi hàm siết chỉ gọi đúng hàm quản trị của contract đích với tham số *chặt hơn* hiện tại (đọc bằng view), nếu không `NotTightening`; hàm 1 thành viên không bao giờ nới được (`NeedsThreshold` khi cố gọi hàm nới bằng đường này). Sàn cứng (`MAX_VENUE_BPS`, `MIN_BUFFER_BPS`, `MIN_DEADLINE_LEAD`, bậc cuối `(0,0)`) không đổi được bằng bất kỳ đường nào, kể cả 2/3 (đổi chúng cần triển khai bộ mới).

`PayrollGovernor` không nằm trong danh sách `calls` của `GuardianCouncil`; nó **là** nơi duy nhất (`governor`) mà bốn contract còn lại tin.

## 5. Reason code mới (`shared/reason_codes` ↔ `shared/reasonCodes.ts`)

Chỉ thêm mới, không đổi 10 mã cũ. Tên custom error ↔ mã:

| Custom error | Code | VI | EN |
|---|---|---|---|
| `VenueNotAllowed()` | `VENUE_NOT_ALLOWED` | Nơi gửi chưa được duyệt | Venue not approved |
| `VenueImpairedError()` | `VENUE_IMPAIRED` | Nơi gửi đang gặp sự cố | Venue impaired |
| `VenueCapExceeded()` | `VENUE_CAP_EXCEEDED` | Đã chạm 40% cho một nơi | Venue cap reached |
| `BufferBreached()` | `BUFFER_BREACHED` | Phải giữ 5% tiền mặt trong kho | Liquidity buffer required |
| `LadderCeilingExceeded()` | `LADDER_CEILING_EXCEEDED` | Vượt mức cho phép của bậc thang hôm nay | Ladder ceiling exceeded |
| `DeadlinePassed()` | `DEADLINE_PASSED` | Đã qua hạn rút về (T-1) | Past unwind deadline |
| `KillSwitchActive()` | `KILL_SWITCH_ACTIVE` | Công tắc khẩn cấp đang bật | Kill switch active |
| `CoverageInsufficient()` | `COVERAGE_INSUFFICIENT` | Chưa đủ dự phòng nếu một nơi gửi bị kẹt | Not enough cover if a venue freezes |
| `NotAgent()` | `AGENT_NOT_AUTHORIZED` | Khoá này không phải agent quỹ lương | Not a payroll agent |
| `NotPayee()` | `PAYEE_NOT_IN_ROSTER` | Người nhận không nằm trong bảng lương | Payee not in roster |
| `InsufficientFunds(...)` | `PAYROLL_UNDERFUNDED` | Quỹ chưa đủ tiền lương | Payroll underfunded |
| `PaydayNotReached()` | `PAYDAY_NOT_REACHED` | Chưa tới ngày lương | Payday not reached |
| `AlreadyExecuted()` / `AlreadyPaid()` | `PAYROLL_ALREADY_PAID` | Kỳ lương này đã chi | Cycle already paid |

Giữ `BLOCKED_AT_PROTOCOL` (đã có) cho khoá agent bị Tx AllowList chặn. Lỗi không có reason code (chỉ giữ tên trong `error_raw`, thêm vào `OTHER_ERRORS` của `chain/errors.py` khi cài đặt): `NotGovernor`, `NotScheduler`, `NotExecutor`, `NotAuthorized`, `RosterTooLarge`, `RosterInvalid`, `RosterLocked`, `CycleNotSettled`, `InsufficientIdle`, `ZeroAmount`, `NothingDue`, `LadderInvalid`, `ExceedsDeployed`, `TooManyVenues`, `BpsOutOfRange`, `EmptyRoster`, và các lỗi của Governor (trùng tên với `GuardianCouncil`, cùng cách xử lý). Lưu ý: `test_contract_abi.py` hiện ép "9 custom error ↔ 9 mã"; PR cài đặt phải mở rộng test theo bảng riêng của payroll, không nới test cũ (Q8).

## 6. Backend

### 6.1 `PayrollPort` (tách khỏi `ChainPort`, không sửa `ChainPort`)

File `Backend/src/guardian/chain/payroll_base.py` (mới), chỉ import `TxResult`, `ChainEvent`, `ProposalState` từ `chain/base.py`. Quy ước giống `ChainPort`: signer/member/venue là **địa chỉ hex**, đồng bộ (sync), lỗi trả `TxResult` không raise.

```python
class PayrollPort(Protocol):
    # --- agent ---
    def allocate(self, signer: str, venue: str, amount: int) -> TxResult: ...
    def unwind(self, signer: str, venue: str, amount: int) -> TxResult: ...
    def simulate_allocate(self, signer: str, venue: str, amount: int) -> ReasonCode | None: ...
    # --- permissionless ---
    def unwind_due(self, signer: str, venue: str) -> TxResult: ...
    def finalize(self, signer: str) -> TxResult: ...
    def execute_payroll(self, signer: str) -> TxResult: ...
    def deposit(self, signer: str, amount: int) -> TxResult: ...
    def fund_reserve(self, signer: str, amount: int) -> TxResult: ...
    # --- Hội đồng: siết (1 thành viên) ---
    def kill_switch(self, member: str) -> TxResult: ...
    def remove_venue(self, member: str, venue: str) -> TxResult: ...
    def lower_venue_cap(self, member: str, venue: str, new_bps: int) -> TxResult: ...
    def raise_buffer(self, member: str, new_bps: int) -> TxResult: ...
    def lower_rung(self, member: str, index: int, new_max_bps: int) -> TxResult: ...
    def revoke_agent(self, member: str, key: str) -> TxResult: ...
    def remove_payee(self, member: str, account: str) -> TxResult: ...
    # --- Hội đồng: nới (2/3) ---
    def propose(self, member: str, title: str, calls: list[dict[str, Any]], risk_report_hash: str) -> TxResult: ...
    def approve(self, member: str, proposal_id: int) -> TxResult: ...
    def cancel(self, member: str, proposal_id: int) -> TxResult: ...
    def proposal_state(self, proposal_id: int) -> ProposalState: ...
    # --- đọc / luồng ---
    def snapshot(self) -> PayrollSnapshot: ...
    def events_since(self, block: int) -> list[ChainEvent]: ...
    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]: ...

class PayrollDemoControls(Protocol):             # chỉ sim và anvil, như DemoControls
    def advance_time(self, seconds: int) -> None: ...
    def set_venue_frozen(self, venue: str, frozen: bool) -> None: ...
    def set_venue_yield(self, venue: str, bps_per_day: int) -> None: ...
    def reset(self) -> None: ...
```

`PayrollSnapshot` (dataclass trong `domain/payroll_snapshot.py`, chain sinh, `agent_float/` chỉ đọc, giống `PolicySnapshot`): `now, cycle_id, payday, deadline, phase ("accruing"|"unwinding"|"deadline"|"payday"|"paid"), payroll_total, principal, reserve, idle, deployed_total, yield_realized, buffer_amount, ceiling_amount, next_rung_at, killed, kill_reason, coverage, exposure_at_risk, coverage_ok, venues[{addr, label, allowed, impaired, frozen_hint, deployed, cap_amount, due, assets_of}], rungs[], roster[{account, amount}], agents[], executed`. Tiền là `int` base unit; API trả `{raw, display}` như mọi nơi.

### 6.2 Cài đặt

- **Sim:** `Backend/src/guardian/chain/sim/payroll.py` (mới, một module; tách `payroll_venue.py` nếu dài). Cùng đồng hồ với `SimChain` (nhận `clock: Callable[[], int]` có thể `advance`); dùng lại `Ledger` (`sim/tokens.py`) và `TxAllowList`. Mọi kiểm tra theo **đúng thứ tự mục 2.3.1**, làm tròn như Solidity (chia nguyên, `due` làm tròn lên). Sim phát đúng tên event và custom error ở mục 2. Không import `engine.py` cho luật payroll.
- **L1 (sau):** `Backend/src/guardian/chain/l1/payroll.py` cùng `PayrollPort`, ABI trong `chain/abis/payroll/` (`make abis` mở rộng). Không làm trong PR đầu.
- **Wiring:** `Runtime.payroll` (tách khỏi `Runtime.chain`); `CHAIN_MODE=sim` dùng `SimPayroll`, `l1` dùng adapter khi có.

### 6.3 Conformance (mô phỏng `make conformance`)

- Thư mục `Backend/tests/conformance_payroll/` (hoặc `tests/conformance/test_payroll_conformance.py` + `payroll_harness.py`), fixture `net` tham số `["sim", "l1"]` như `tests/conformance/conftest.py`; `l1` skip có lý do khi chưa có Foundry.
- Harness `PayrollNet`: `advance_time` (sim: đồng hồ; anvil: `evm_increaseTime` + `evm_mine`), `freeze(venue)` (sim: thuộc tính; anvil: tx `MockVenue.setFrozen`), `norm(TxResult)` giống `harness.norm` (status, reason, error, tên event, có hash). Bỏ tx_hash, block, địa chỉ triển khai.
- Kịch bản (mỗi kịch bản chạy trên cả sim và l1, so `norm` từng bước + `view(snapshot)` cuối):
  1. nạp + allocate hợp lệ hai venue; 2. mỗi nhánh từ chối của 2.3.1 (8 nhánh, đúng reason); 3. bậc thang: tua tới từng bậc, `unwind_due` pro-rata và làm tròn; 4. `finalize` sau D với venue khoẻ; 5. **venue B đóng băng** rồi `finalize` (impaired, reserve nhả, `idle >= P`); 6. `execute_payroll` thành công và `execute` lần hai; 7. `execute` thiếu tiền (`PAYROLL_UNDERFUNDED`); 8. kill switch 1 thành viên (siết) và `resetKill` bằng 1 thành viên (`NeedsThreshold`), bằng đề xuất 2/3 (thành công); 9. agent gọi địa chỉ không whitelist / khoá không phải agent; 10. đổi roster qua 2/3 và sau D (`RosterLocked`); 11. `setRoster` làm vỡ coverage (`CoverageInsufficient`).
- Makefile: thêm đường dẫn test payroll vào target `conformance` hiện có (chỉ thêm). Thêm `contracts/script/DeployPayroll.s.sol` và helper deploy cho fixture `l1`.
- Cùng PR hợp đồng: `Backend/tests/test_payroll_abi.py` kiểm selector/topic/ABI/`reason_codes` giống `test_contract_abi.py`.

## 7. Agent: động cơ luật (thuần) + LLM chỉ viết báo cáo

Module `Backend/src/guardian/agent_float/` (tên theo `agent_rebalance/`):

- `rule_engine.decide(snapshot: PayrollSnapshot, params: FloatParams) -> list[Action]` là **hàm thuần**, không I/O, không đọc văn bản lạ, không LLM. `Action = Allocate(venue, amount) | Unwind(venue, amount) | Kill(reason) | Noop(reason)`. Thứ tự luật, luật đầu khớp thắng cho từng venue:
  1. `killed` hoặc `now >= deadline`: `Noop`.
  2. Venue `impaired` hoặc `frozen_hint` (lần `unwind` trước thất bại): `Unwind` mọi venue khoẻ còn vị thế; nếu `coverage_ok` mất (ví dụ roster đổi) → `Kill(3)` (siết, được phép).
  3. Có `due > 0` (qua bậc): `Unwind(venue, due)` (agent không chờ keeper). Quy tắc thăm dò: mỗi bậc rút một phần từ **mọi** venue.
  4. Có chỗ để đặt: `room = min(ceiling_amount(next_rung_at - ε) - deployed_total, idle - buffer_amount, coverage - exposure_after)`; chia cho các venue theo lãi suất giảm dần, mỗi venue bị chặn bởi `cap_amount - deployed`; tròn xuống; bỏ qua nếu `room < MIN_ALLOCATION` hoặc bậc kế tiếp trong `MIN_HOLD` (không đặt rồi rút ngay). Gọi `simulate_allocate` trước khi gửi; reason code trả về là bằng chứng.
  5. còn lại `Noop("không cần hành động")`.
- Agent **chỉ có** `allocate` / `unwind` trong `PayrollPort`; không có tham số địa chỉ nhận. Venue lấy từ `snapshot.venues` (whitelist on-chain), không từ đầu vào ngoài.
- `report.py`: LLM (mặc định `claude-haiku-4-5`; chạy LLM trả phí phải hỏi người dùng trước, theo ghi nhớ dự án) chỉ nhận một dict số liệu đã tính (`facts`) và viết bản tin CFO tiếng Việt. Mọi con số trong đầu ra được kiểm với `facts` bằng verifier sẵn có của `assistant/` (tên module xem khi cài đặt); số lạ → bỏ bản LLM, dùng **template cố định** điền số từ `facts`. Có `reasonSource: "llm"|"template"` và `reasonHash` như `AgentRunOut`. Không có LLM key hoặc lỗi → template.
- `AgentRunOut` kiểu payroll (mới, tách khỏi agent rebalance): `steps` read/decide/simulate/send/explain như CITY_OPS §2.

## 8. Demo: một tháng trong 10 phút

**Nén thời gian.** Hệ số `PAYROLL_TIME_SCALE = 4320` (30 ngày = 2.592.000 s / 600 s). Hai cách, cùng contract:

- **Sim:** đồng hồ ảo `now = t0 + (real_elapsed) * scale`, cộng `advance_time(seconds)` thủ công (bước nhảy theo bậc: "tới T-14", "tới T-1"). Một tick nền mỗi giây thực chạy `agent_float.decide` rồi gửi action.
- **Anvil (conformance và demo local):** một "time driver" mỗi giây thực gọi `evm_increaseTime(scale - 1)` rồi `evm_mine`. Chain thật không tua được, nên:
- **Guardian L1 thật:** triển khai bộ với `dayUnit = 20` (T-1 = 20 s, 30 ngày = 600 s), `payday = now + 600`; mọi thứ khác không đổi, không tua thời gian. Vì `dayUnit` là immutable, bộ demo nén là một lần triển khai riêng; **luật production dùng `86400`**.

**Kịch bản mẫu** (illustrative, bỏ qua lãi): `P = 30.000`, `Pr = 30.000`, `R = 12.000` (40%), hai venue A, B (cap 12.000), `k = 1`, `cover = 12.000`.

| Ngày | Sự kiện |
|---|---|
| 0 | `deposit` 30.000, `fundReserve` 12.000; agent `allocate` A = 12.000, B = 12.000 (coverage: top-1 = 12.000 ≤ 12.000, đạt; buffer 1.500 ≤ idle 6.000) |
| 16 (T-14) | trần 60% = 18.000; vượt 6.000; `due` A = B = 3.000; agent/keeper rút, A = B = 9.000 |
| 20 | **Tiêm lỗi:** `MockVenue B.setFrozen(true)` |
| 23 (T-7) | trần 30% = 9.000; `due` chia trên venue khoẻ; rút A còn 4.500; rút B revert → `RecallFailed`, `VenueImpaired`, B vị thế kẹt 9.000; agent thôi đặt thêm |
| 27 (T-3) | agent rút hết A (4.500); `coverage_ok` giữ nguyên |
| 29 (T-1 = D) | `finalize()`: kill (reason 2), rút B thất bại; `idle = 21.000`, `shortfall = 9.000`, `releaseReserve(9.000)` → `idle = 30.000` |
| 30 | `execute()` trả 10 payee, tổng 30.000 |

Tương tự "công tắc khẩn cấp": một thành viên bấm `killSwitch` giữa chừng → mọi allocate sau đó `KILL_SWITCH_ACTIVE`, tiền khoẻ về hết kho, nhưng reserve chưa nhả tới D.

**Dữ liệu cho dashboard B04** (chỉ thêm, theo khuôn CITY_OPS; chi tiết schema chốt ở PR API):

- `GET /api/payroll` → `PayrollStateOut` (snapshot ở 6.1, tiền dạng `{raw, display}`), kèm `guarantee: { ok, coverage, exposureAtRisk, headroom, reasonVi }`.
- `GET /api/payroll/venues`, `GET /api/payroll/ladder` (các bậc, bậc hiện tại, trần theo thời gian để vẽ đường), `GET /api/payroll/roster`, `GET /api/payroll/events?limit=`, `GET /api/payroll/runs` (agent), `GET /api/payroll/report` (bản tin CFO + `reasonSource`).
- Hành động (DEMO_MODE, ký bằng demo signer): `POST /api/payroll/demo/advance {seconds}`, `POST /api/payroll/demo/scale {scale}`, `POST /api/payroll/demo/venues/{id}/freeze|unfreeze`, `POST /api/payroll/agent/run`, `POST /api/payroll/kill`, `POST /api/payroll/finalize`, `POST /api/payroll/execute`, `POST /api/payroll/demo/reset`. Đề xuất nới dùng `POST /proposals/...` cùng mẫu (namespace id riêng của Governor, Q6).
- SSE: `payroll_updated` → `PayrollStateOut`; `payroll_event` → `ChainEvent` (thêm vào `SSE_EVENT_TYPES` ↔ `STREAM_TYPES`).
- Luật đổi màu tòa B04 (id ổn định, chỉ thêm vào bảng CITY_OPS §1 khi duyệt, Q7): `B04.venue_frozen` (incident: có venue impaired), `B04.kill_switch` (incident: công tắc đang bật), `B04.ladder_overdue` (warning: có `due > 0` quá một khoảng), `B04.coverage_low` (warning: `headroom < 10%`), `B04.payday_ready` (recovery: sau `finalize`, `idle >= P`).

## 9. Kế hoạch test: ánh xạ AC của #65

| AC | Foundry (`contracts/test/payroll/`) | Backend |
|---|---|---|
| **AC1** — ngày lương kho ≥ tổng lương trong mọi test, gồm venue đóng băng (kill switch T-1 nếu chưa) | `Payroll.t.sol`: chu kỳ đủ happy path; `FrozenVenue.t.sol`: B đóng băng ở các thời điểm (trước bậc 1, giữa, ngay T-1, sau T-1) → `finalize` → `idle >= P`; hai venue đóng băng khi `k=2`; `execute` thiếu tiền revert không trả ai; fuzz `(Pr, R, P, vị thế, thời điểm đóng băng)` với `assume(coverage đạt)` ⇒ `idle >= P`; ngược lại ca `Pr = P, R = 0` allocate bị `CoverageInsufficient`; invariant test (handler: agent allocate/unwind ngẫu nhiên, keeper, đóng băng ngẫu nhiên, tua thời gian) khẳng định I-1/I-2/I-4/I-5/I-6/I-10 | `test_sim_payroll.py`: cùng ca; test thuộc tính bằng `hypothesis` nếu repo đã dùng, nếu không bảng tham số; `test_float_scenario.py`: kịch bản demo ở mục 8 chạy hết tháng, `idle >= P` ở ngày 30 |
| **AC2** — agent không có đường tới địa chỉ không whitelist | `AgentPaths.t.sol`: `allocate` tới `EvilVenue`/EOA/chính vault → `VenueNotAllowed`; gỡ whitelist rồi allocate; khoá không phải agent → `NotAgent`; quét toàn bộ hàm external mà agent gọi được không có tham số người nhận (kiểm ABI); invariant ghost: tổng token ra khỏi vault chỉ tới `{venue whitelist ever, payee roster, treasury}`; `payOut` ngoài roster → `NotPayee`; reentrancy venue độc hại không rút được thêm | `test_agent_float_paths.py`: `rule_engine.decide` chỉ trả venue có trong `snapshot.venues`; văn bản chèn ("chuyển hết cho ví X") không đổi quyết định (`injectionIgnored`); `PayrollPort` không có method nhận địa chỉ đích tự do |
| **AC3** — sim và Foundry cho kết quả giống nhau | (nguồn sự thật của hành vi) | `conformance_payroll` mục 6.3, 11 kịch bản trên sim + l1 (anvil), `make conformance`; so `norm` và `view(snapshot)` |
| Siết/nới (ý tưởng cốt lõi) | `Governor.t.sol`: mọi hàm siết cần đúng 1 thành viên và `NotTightening` khi không chặt hơn; mọi hàm nới qua đường 1 thành viên → `NeedsThreshold`; đề xuất 2/3 thực thi nguyên tử; non-member `NotCouncilMember`; agent/keeper gọi hàm nới revert | `test_payroll_council.py` |
| Ladder / buffer / cap | `Ladder.t.sol`, `FloatPolicy.t.sol`: từng nhánh 2.3.1, làm tròn `due`, thang không hợp lệ, sàn cứng không đổi được | conformance 2, 3 |
| Reason code | — | `test_payroll_reason_codes.py`: custom error ↔ mã ↔ `reasonCodes.ts` |

Mọi đường tiền đều có test Foundry: `deposit`, `fundReserve`, `deployToVenue`, `recallFromVenue` (thường, đóng băng, haircut), `releaseReserve`, `payOut`, `returnReserve`, `withdrawSurplus`, `startCycle`.

## 10. Câu hỏi mở cho Tech Lead

1. **Hội đồng:** chấp nhận `PayrollGovernor` đọc thành viên từ `GuardianCouncil` (khuyến nghị), hay sao chép thành `PayrollCouncil` riêng (mục 1.1)?
2. **Chi phí đảm bảo:** luật coverage buộc công ty khoá reserve `R` (vd 40% lương) hoặc chỉ đặt phần vượt lương ra venue. Chấp nhận mô hình này, hay muốn đảm bảo yếu hơn (chỉ "kill switch + báo cáo", không phủ venue kẹt)? Nếu lấy mô hình yếu, AC1 không thể đúng trong ca đóng băng khi `Pr = P`.
3. **Fault tolerance `k`:** mặc định 1 (một venue kẹt). Có muốn mặc định 2 cho demo hai venue không?
4. **Xung đột lợi ích:** thành viên Hội đồng nằm trong roster có bị cấm duyệt đề xuất đổi roster/ngày lương không? (Cần giải mã calldata như `_affected` của `GuardianCouncil`.)
5. **`dayUnit` immutable và bản demo nén 20 s** trên L1 thật: chấp nhận một lần triển khai riêng, hay muốn production cũng cho phép đổi (rủi ro: giảm T-1)?
6. **Proposal id:** namespace riêng của Governor (id bắt đầu từ 1) cần đường API `/payroll/proposals/*` riêng. Hay muốn UI hợp nhất hai loại đề xuất?
7. **B04 trong CITY_OPS:** B04 hiện là "Cổng chi trả" (`vault.pay`); gộp payroll vào cùng tòa, đổi tên, hay đổi sang tòa mới? Có cho sửa `shared/buildings` và bảng luật đổi màu mục 8?
8. **Reason code & test ABI:** cho phép mở rộng `ReasonCode` (13 mã mới) và `test_contract_abi.py` thành hai bảng, hay giữ `ReasonCode` cũ và đặt payroll vào enum `PayrollReason` riêng?
9. **Chu kỳ:** v1 là một chu kỳ một vault (`startCycle` qua 2/3). Có cần lịch nhiều tháng tự động không?
10. **Haircut:** coi `received < requested` không revert là impaired (đề xuất) hay bỏ qua? Mock hiện chỉ cần đóng băng.
11. **`treasury`:** immutable lúc triển khai (an toàn) hay đổi được qua 2/3?
12. **LLM:** xác nhận dùng `claude-haiku-4-5` cho báo cáo CFO; chạy trả phí thật chỉ khi người dùng đồng ý.
13. **Tx AllowList:** khoá agent/keeper payroll cần `setEnabled` qua đề xuất `GuardianCouncil` sẵn có; chấp nhận quy trình này, hay muốn thêm vai trò vào `PrincipalRegistry` (cần đổi bộ đóng băng, không khuyến nghị)?

## 11. Quyết định của Tech Lead (2026-11-13)

| # | Quyết định |
|---|---|
| 1 | Dùng `PayrollGovernor` đọc thành viên trực tiếp từ `GuardianCouncil.members(i)`. Không sao chép danh sách thành viên. |
| 2 | Nhận luật coverage và reserve `R`. Đây là cách duy nhất để AC1 đúng khi venue bị đóng băng. Demo nạp `Pr = P`, `R = 0,4·P`. |
| 3 | `k = 1` mặc định (demo hai venue, một venue đóng băng). |
| 4 | Có. Thành viên Hội đồng nằm trong roster không được duyệt đề xuất đổi roster, số tiền hoặc ngày lương (revert `ConflictOfInterest`, giải mã calldata như `_affected`). |
| 5 | `dayUnit` immutable. Bản demo nén trên L1 là một lần triển khai riêng. |
| 6 | Namespace đề xuất riêng của Governor, API `/api/payroll/proposals/*`. UI hiện trong tòa B04, không gộp với đề xuất của Council. |
| 7 | Giữ tòa B04 "Cổng chi trả", payroll là một tab trong tòa. Chỉ **thêm** luật màu mới `B04.payroll_kill` (incident: kill switch đã bật) và `B04.payroll_at_risk` (warning: có venue bị đánh dấu impaired), đặt sau các luật B04 cũ, đồng bộ `shared/buildings` hai phía. Không đổi luật cũ. |
| 8 | Dùng enum riêng `PayrollReason` (`shared/payroll_reasons.py` ↔ `shared/payrollReasons.ts`). Không sửa `ReasonCode` và bảng ABI đã đóng băng. Test ABI payroll để ở file riêng. |
| 9 | Mỗi vault một chu kỳ (`startCycle` qua 2/3). Chưa làm lịch nhiều tháng. |
| 10 | Có. `received < requested` mà không revert thì đánh dấu venue impaired. |
| 11 | `treasury` immutable. |
| 12 | Báo cáo CFO dùng `claude-haiku-4-5` qua adapter có sẵn. CI và test chỉ dùng LLM giả. Chạy thật có trả phí chỉ khi người dùng đồng ý. |
| 13 | Nhận. Khoá agent và keeper payroll được bật Tx AllowList qua đề xuất `GuardianCouncil` có sẵn. Không đổi `PrincipalRegistry`. |
