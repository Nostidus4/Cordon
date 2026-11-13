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

### OPS-003: reset bằng deploy lại (local)

Sau bàn giao deployer không còn role, nên `ResetOpen` nhờ Council cũ `setEnabled` deployer; bộ mới được deploy và seed; Council cũ chuyển admin hai precompile sang Council mới bằng một proposal (`setAdmin(mới)` x2, `setNone(cũ)` x2, chỉ được vì Council cho phép `setAdmin` tới một contract khác); `ResetSwitch` xong thì deployer không còn role (`VerifyHandover` pass) và Council cũ không còn role. Xem `docs/DEVELOPMENT.md`.

## Nghiệm thu

- RPC trả block; giao dịch từ địa chỉ ngoài AllowList bị từ chối (D1).
- Địa chỉ contract nằm trong `deployments/fuji-l1.json` và README (D2).
- `lockPrincipal` làm 5 khoá không gửi được giao dịch nào (D6).
- Node có script tự khởi động lại; ghi version Avalanche CLI và Subnet-EVM trong README.

## Trạng thái hiện tại

`L1-001` đã xong phần chạy được ở local: `contracts/genesis/genesis.json` (sinh từ `build_genesis.py`), `make l1-local-up|verify|down`, thử Tx/Deployer AllowList và chuỗi lỗi RPC (xem `contracts/genesis/README.md`; Avalanche CLI 1.9.7, Subnet-EVM v0.8.0). Còn lại: deploy lên Fuji bằng khoá có tiền và host chạy validator (`make deploy-l1`, `make l1-status`, systemd), rồi ghi `Backend/deployments/fuji-l1.json` (hiện `{}`). Sim mô phỏng AllowList ở `Backend/src/guardian/chain/sim/allowlist.py`. Nếu không chạy được trên Fuji (Q1), lùi về C-Chain: `lockPrincipal` chỉ là cờ của vault, bỏ T8 và T15.

### L1-002: deploy, seed, bàn giao, kiểm chứng (đã chạy trên L1 local thật, chưa trên Fuji)

Script ở `contracts/script/`, chạy bằng `infra/l1/contracts.sh` (`NETWORK=local|fuji`), mỗi bước một lệnh `make`:

| Bước | Script | Việc | Target |
|---|---|---|---|
| 1 | `Deploy.s.sol` | Registry, 3 token, MockDEX, EvilDEX, Vault, Council (địa chỉ Council tính trước từ nonce, kiểm lại sau khi deploy), thanh khoản 1.000.000 tUSDC + 1.000.000 tTKB trong MockDEX; `topUpOperator` ban đầu = deployer; ghi `Backend/deployments/<network>-l1.json` (chỉ địa chỉ, đúng dạng `chain/l1/deployments.py` đọc) | `make l1-deploy` |
| 2 | `Seed.s.sol` | Chính sách v1 qua **2 proposal Council thật** (6 khu + 6 khoá + hạn mức + allow-list do Trang đề xuất, Trang và Huy duyệt; khu `huy` + 2 khoá do Trang và Lan duyệt; không thể gộp một proposal vì Lan và Huy đều xung đột), rồi mint 200.000 tUSDC vào vault | `make l1-seed` |
| 3 | `Handover.s.sol` | `setAdmin(Council)` trên `0x02…02` và `0x02…00`; `setEnabled` cho mọi khoá chi tiêu, 3 member và khoá ops; `setTopUpOperator(ops)` qua proposal Council (Trang đề xuất, Trang + Lan duyệt); `setMinter(Council)` cho 3 token; cuối cùng deployer `setNone(deployer)` trên Deployer list rồi Tx list (Tx list phải đi sau cùng vì deployer cần chính role đó để gửi giao dịch) | `make l1-handover` |
| 4 | `VerifyHandover.s.sol` | Đọc `readAllowList` thật: fail nếu deployer còn role nào, Council không phải admin của cả hai, khoá mong đợi chưa được bật, `topUpOperator == deployer`, hoặc minter/council của contract không phải Council | `make verify-handover` |
| (5) | `PolicyV2.s.sol` | Chính sách v2 qua Council (Lan đề xuất, Lan + Trang duyệt): 4 khoá vào khu `minh`, hạn mức chung 30.000 | `make l1-policy-v2` |
| – | `VerifySeed.s.sol` | Đọc lại từ chain: 7 khu, 8 khoá, `huy` có 2 khoá, `principalDailyCap` = 0, allow-list, vault giữ 200.000 tUSDC | trong `l1-local-bootstrap` |

`make l1-local-bootstrap` = `l1-local-up` → `deploy-contracts` (bước 1-3) → `VerifySeed` → `verify-handover`, khoảng 2,5 phút. `make l1-local-checks` chạy T15 và T8 thật (`infra/l1/real-checks.sh`). `infra/l1/local_env.py` sinh `Backend/.env.l1-local` (`L1_KEY_*` từ mnemonic test công khai, chỉ local) và `infra/l1/seed.l1-local.json`: genesis bật địa chỉ trong roster, không phải địa chỉ giữ chỗ trong `Backend/seed/may_labs.json`, nên bản seed địa phương thay địa chỉ khoá và Council bằng địa chỉ roster; backend đọc nó qua `GUARDIAN_SEED_FILE`. Fuji dùng cùng script với `SEED_FILE` trỏ tới bản seed mang địa chỉ Fuji thật.

Phát hiện khi chạy trên Subnet-EVM v0.8.0 thật:

- Precompile nằm ở trạng thái với code giữ chỗ `0x01`, nên mô phỏng cục bộ của `forge script` gọi vào nó chết `StackUnderflow`. `Handover` dùng `vm.etch(…, STOP)` chỉ trong mô phỏng và chạy với `--skip-simulation --gas-estimate-multiplier 400` (gas thật của precompile cao hơn gas mô phỏng).
- Header block của Subnet-EVM có `extraData` 86 byte (cửa sổ phí động); web3.py từ chối nếu không có `ExtraDataToPOAMiddleware`. `chain/client.py: make_web3` đã thêm; lần chạy đầu trên node thật phát hiện lỗi này (anvil dùng 32 byte nên test cũ không thấy).
- Vault khởi tạo `policyVersion = 1` và mỗi proposal đã thực hiện cộng 1, nên seed bằng proposal thật cho ra version 3 và sau bàn giao là 4; policy v2 thành 5. Sim và test anvil vẫn bắt đầu từ 1 (ghi seed bằng cách impersonate Council, không bump). Số "v1, v2" trên UI khi chạy L1 thật là `policyVersion` thật, không phải nhãn.
- Deployer sau bàn giao: giao dịch bị node từ chối `cannot issue transaction from non-allow listed address`; deploy contract bị `eth_estimateGas` từ chối `tx.origin … is not authorized to deploy a contract`; `setAdmin` bị `cannot modify allow list … from role: NoRole`.

Còn lại cho Fuji: chạy cả chuỗi trên L1 Fuji (cần khoá Fuji có AVAX và L1 L1-001 trên Fuji), điền `Backend/deployments/fuji-l1.json` (hiện `{}`) và bảng địa chỉ trong README, bật sau đó T8/T15 trên Fuji.

## Issue

`L1-001` genesis + L1 trên Fuji + hosting · `L1-002` deploy, bàn giao, VerifyHandover, script seed · `L1-003` chuyển staging sang `CHAIN_MODE=l1` (tích hợp cuối).
