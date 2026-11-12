# Module: contracts

Smart contract Foundry cho Guardian L1: `PrincipalRegistry`, `PolicyVault`, `GuardianCouncil`, `MockDEX`/`EvilDEX` và token test. Đây là nơi các luật "siết 1 · nới 2/3 · AI 0" được thi hành thật.

Chủ trì: Nostidus4 · Issue: `CTR-001`…`CTR-007` · Spec: [../../spec/README.md](../../spec/README.md) mục 3, 4.3, 6, 8.3 · Interface đóng băng: [../../spec/CONTRACTS.md](../../spec/CONTRACTS.md)

## Mục đích

Đặt toàn bộ luật chi tiêu on-chain để dù 5 khoá của một người bị chiếm, kẻ gian chỉ lấy được tối đa hạn mức chung của khu, chỉ tới người nhận / token / protocol đã duyệt, và một Council member có thể khoá cả khu bằng một giao dịch.

## Giao diện

Xem [CONTRACTS.md](../../spec/CONTRACTS.md): `IPrincipalRegistry`, `IPolicyVault`, `IGuardianCouncil`, `IMockDEX`; event; custom error; thứ tự kiểm tra.

## Dữ liệu và quy tắc chính

- `dayIndex = block.timestamp / 1 days`; bộ đếm `keySpent[key][day]`, `principalSpent[id][day]`.
- Thứ tự kiểm tra: paused → locked → khoá đăng ký → token → protocol/recipient → hạn mức riêng → hạn mức chung; cập nhật bộ đếm trước khi gọi ra ngoài; `nonReentrant`.
- Siết do 1 member (qua các hàm `emergency*` của Council); nới chỉ qua proposal đủ 2/3; member có khu bị ảnh hưởng không được duyệt (`ConflictOfInterest`).
- `calls[].target` của proposal chỉ gồm Registry, Vault và 2 precompile AllowList.
- `emergencyLock` = `vault.lockPrincipal` + `TxAllowList.setNone` cho mọi khoá của khu.

## Nghiệm thu

- Test T1–T15 và invariant I1–I2 (bảng ở [README.md](../../spec/README.md) mục 8.3) xanh; `forge test` chạy trong CI.
- T8 và T15 chạy với precompile giả bằng `vm.etch`; bản chạy thật nằm ở issue `L1-002`/`OPS-004`.
- Số liệu cảnh 4 (bảng 4.3) tái hiện được hoàn toàn trong một test Foundry.

## Trạng thái hiện tại

`contracts/` là project Foundry (solc 0.8.28, cancun) với 4 interface đóng băng ở `contracts/src/interfaces/` (CTR-001) và, từ CTR-002, token test, DEX mock và hạ tầng test. Chưa có Registry/Vault/Council (CTR-003 trở đi).

- **Phụ thuộc:** OpenZeppelin `v5.4.0` và forge-std `v1.10.0`, ghim trong `contracts/scripts/install-deps.sh` (tải vào `contracts/lib/`, đã gitignore; không commit mã vendor). Chạy `make contracts-deps` (job CI chạy cùng script). Remapping ở `contracts/remappings.txt`.
- **Token** (`src/tokens/`): `TestUSDC` (6), `TestTokenB`/tTKB (18), `TestScam`/tSCAM (18), ERC-20 OpenZeppelin. `mint` chỉ `minter`: deployer lúc đầu, bàn giao cho Council bằng `setMinter(council)`; người khác revert `NotMinter()`.
- **DEX** (`src/dex/`): `MockDEX` và `EvilDEX` (cùng hành vi, EvilDEX không bao giờ được whitelist). Rate `num/den` là giá trị của 1 đơn vị `tokenIn` tính theo `tokenOut`, quy đổi decimals: `out = amountIn * num * 10^decOut / (den * 10^decIn)` (làm tròn xuống, chỉ số nguyên, `Math.mulDiv`). Constructor đặt rate mặc định 1/1 cho mọi cặp có thứ tự trong danh sách token (`tUSDC`, `tTKB`); cặp chưa có rate revert `UnknownPair`. Rate theo chiều: `setRate(a, b, ...)` không đổi `(b, a)`. `num == 0` hoặc `den == 0` revert `UnknownPair` (interface đóng băng không có lỗi riêng). DEX trả từ số dư của chính nó và cũng revert `SlippageTooHigh()` (cùng selector với lỗi của Vault) khi `amountOut < minOut`; Vault vẫn kiểm lại.
- **Test helper** (`test/helpers/`): `MockAllowList` (đặt bằng `vm.etch` ở `0x02..00` và `0x02..02`, mỗi địa chỉ một storage; `setAdmin/setEnabled/setNone/readAllowList`, chỉ admin được ghi, phát `RoleSet`; `__seedRole` là cửa hậu chỉ để test) và `MayLabsBase` (seed Mây Labs: 7 khu, 8 khoá, Council 3 người, token, hai DEX, hai precompile giả; `council` là địa chỉ tạm cho đến CTR-006).
- **Chạy:** `make contracts-test` (hoặc `cd contracts && forge fmt --check && forge build && forge test -vv`).

Hành vi tham chiếu đã chạy được ở chain giả lập: `Backend/src/guardian/chain/sim/{registry,vault,council,dex,allowlist,engine}.py` và test `Backend/tests/test_sim_chain.py`. Bảng reason code: `Backend/src/guardian/shared/reason_codes.py`.

## Issue

`CTR-001` đóng băng interface · `CTR-002` khung Foundry, token, DEX, CI · `CTR-003` Registry · `CTR-004` Vault chi tiêu · `CTR-005` Vault quản trị · `CTR-006` Council · `CTR-007` test bảo mật + invariant.
