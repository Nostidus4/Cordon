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

`contracts/` đã có khung Foundry (`foundry.toml`, solc 0.8.28) và 4 interface đóng băng ở `contracts/src/interfaces/` (CTR-001, 2026-11-12); chưa có cài đặt. `forge build` chạy trong CI (job `contracts`); `make abis` xuất ABI sang `Backend/src/guardian/chain/abis/`. Hành vi tham chiếu đã chạy được ở chain giả lập: `Backend/src/guardian/chain/sim/{registry,vault,council,dex,allowlist,engine}.py` và test `Backend/tests/test_sim_chain.py`. Bảng reason code: `Backend/src/guardian/shared/reason_codes.py`.

## Issue

`CTR-001` đóng băng interface · `CTR-002` khung Foundry, token, DEX, CI · `CTR-003` Registry · `CTR-004` Vault chi tiêu · `CTR-005` Vault quản trị · `CTR-006` Council · `CTR-007` test bảo mật + invariant.
