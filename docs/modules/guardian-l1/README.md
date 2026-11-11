# Module: guardian-l1

Avalanche L1 riêng (Subnet-EVM) trên Fuji với Tx AllowList và Contract Deployer AllowList, cùng quy trình deploy, bàn giao quyền admin precompile cho Council và kiểm chứng.

Chủ trì: Nostidus4 · Issue: `L1-001`, `L1-002`, `L1-003` · Spec: [../../spec/README.md](../../spec/README.md) mục 6, 9, 10 (Q1, Q8)

## Mục đích

"Kill switch ở tầng giao thức": khoá bị gạch khỏi Tx AllowList thì node từ chối giao dịch trước khi vào block. Đây là lớp phòng thủ mà một contract thuần không làm được.

## Giao diện và cấu hình

| Mục | Giá trị |
|---|---|
| VM | Subnet-EVM trên Fuji |
| `txAllowListConfig` | bật; `adminAddresses = [DEPLOYER]`; `enabledAddresses = [council members, khoá agent/service, key_minh, key_huy_*, key_lan, signer demo của backend]` |
| `contractDeployerAllowListConfig` | bật; `adminAddresses = [DEPLOYER]` |
| Phí | thấp; nạp native token cho mọi khoá được bật |
| Precompile | Deployer AllowList `0x…0000`, Tx AllowList `0x…0002` (kiểm lại với docs đúng version) |
| Artifact | `contracts/genesis/genesis.json`, `deployments/fuji-l1.json`, `make deploy-l1`, `make deploy-contracts` |

## Bàn giao quyền (bắt buộc)

1. Deployer deploy `GuardianCouncil`, `PrincipalRegistry`, `PolicyVault`, token, DEX.
2. Deployer `setAdmin(GuardianCouncil)` trên cả hai precompile.
3. Deployer tự gỡ mình (`setNone(DEPLOYER)`) trên cả hai.
4. `VerifyHandover` đọc `readAllowList` và fail nếu Deployer còn quyền (T15 bản thật); `emergencyLock` thử trên L1 thật phải làm `readAllowList(key) = 0` (T8 bản thật).

## Nghiệm thu

- RPC trả block; giao dịch từ địa chỉ ngoài AllowList bị từ chối (D1).
- Địa chỉ contract nằm trong `deployments/fuji-l1.json` và README (D2).
- `lockPrincipal` làm 5 khoá không gửi được giao dịch nào (D6).
- Node có script tự khởi động lại; ghi version Avalanche CLI và Subnet-EVM trong README.

## Trạng thái hiện tại

Chưa có genesis, chưa có L1. `Backend/deployments/fuji-l1.json` và `fuji-c.json` đang là `{}`. Sim mô phỏng AllowList ở `Backend/src/guardian/chain/sim/allowlist.py`. Rủi ro lớn nhất (Q1: có chạy được không) nên được thử sớm; nếu không được, lùi về C-Chain: `lockPrincipal` chỉ là cờ của vault, bỏ T8 và T15.

## Issue

`L1-001` genesis + L1 trên Fuji + hosting · `L1-002` deploy, bàn giao, VerifyHandover, script seed · `L1-003` chuyển staging sang `CHAIN_MODE=l1` (tích hợp cuối).
