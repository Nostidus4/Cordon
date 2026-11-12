# Module: chain-adapter

Adapter web3 `Backend/src/guardian/chain/l1/*` cài đặt cùng interface `ChainPort` như `chain/sim`, để API, agent và attacker chạy trên Guardian L1 mà không đổi mã.

Chủ trì: Nostidus4 · Issue: `CHN-001`, `CHN-002`, `CHN-003` · Interface: [../../spec/API_CONTRACT.md](../../spec/API_CONTRACT.md) mục 1–3

## Mục đích

Ranh giới `ChainPort` là điểm duy nhất ứng dụng chạm tới chain. Adapter L1 dịch lời gọi sang web3, đọc `PolicySnapshot` từ chain thật, và chuyển lỗi thật thành `TxResult`.

## Giao diện

- Cài đặt toàn bộ `ChainPort` (`chain/base.py`): chi tiêu, dry-run, siết, nới, `snapshot`, `events_since`, `subscribe`.
- Cấu hình: `CHAIN_MODE=l1`, RPC URL, địa chỉ từ `deployments/fuji-l1.json`, khoá ký từ env (chỉ khoá test, `L1_KEY_<SEED_ID>`). Biến môi trường: `L1_RPC_URL`, `DEPLOYMENTS_FILE` (mặc định `deployments/fuji-l1.json`, tương đối so với `Backend/`), `L1_POLL_INTERVAL_SECONDS`. `Runtime` vẫn ném `NotImplementedError` khi `CHAIN_MODE=l1` cho tới `CHN-003`.
- ABI: `Backend/src/guardian/chain/abis/` (thư mục đang rỗng) sinh từ `forge build`.

## Quy tắc chính

- Mọi tx chi tiêu: `eth_call` trước để lấy lý do, rồi **vẫn gửi tx thật** (có hash revert trên explorer); `simulate_*` chỉ `eth_call`.
- Lỗi RPC "not allow listed" → `status = blocked_at_protocol`, `reason_code = BLOCKED_AT_PROTOCOL`, không `tx_hash` (dùng `chain/errors.py: classify_error`).
- Custom error → `ReasonCode` qua selector (`reason_from_revert_data`).
- `snapshot()` điền `KeyState.allow_listed` từ `readAllowList` của Tx AllowList; số tiền là `int`, không float.
- `propose`/`approve` trả id/`TxResult` giống sim (id tăng dần khớp `proposalCount`).

## Nghiệm thu

- Bộ test conformance chung (`CHN-003`) chạy cùng một chuỗi lệnh trên sim và trên adapter L1 (anvil + contract thật, precompile giả) và cho kết quả giống hệt, gồm đủ bảng 4.3 và luật siết/nới.
- Test đơn vị ánh xạ lỗi RPC với mẫu lỗi thật đã ghi lại.

## Trạng thái hiện tại

`CHN-001` đã xong phần đọc: `chain/l1/` (`L1Chain`: `snapshot`, `events_since`, `subscribe` bằng polling; `events.py` giải mã log; `deployments.py` đọc file địa chỉ), cùng `chain/client.py`, `chain/contracts.py`, `chain/precompiles.py`. `chain/tx.py`, `chain/demo_signer.py` vẫn là file rỗng.

`CHN-002` đã xong phần ghi: `L1Chain` cài đủ `ChainPort` (xem `chain/l1/writes.py`, `calls.py`, `signers.py`).

- **Luồng mỗi tx** (`pay`, `swap`, `raw_call`, hàm Council): `eth_call` từ người gửi để lấy lý do, rồi **vẫn gửi tx thật** (khi dry-run revert thì đặt gas cố định để tx vẫn lên chain có hash), chờ receipt. Receipt `status 1` là `ok` kèm event đã giải mã (`simulated=False`); `status 0` là `reverted`, `reason_code` và `error_raw` (tên custom error) lấy bằng `eth_call` replay ở đúng block của receipt, dự phòng bằng kết quả dry-run. Chuỗi `cannot issue transaction from non-allow listed address` (ở `eth_call` hoặc lúc gửi) là `blocked_at_protocol`, `reason_code = BLOCKED_AT_PROTOCOL`, không `tx_hash`, `error_raw` giữ nguyên thông điệp RPC. Lỗi RPC khác (nonce, thiếu phí, hết giờ chờ receipt, RPC chết) ném `ChainWriteError`, thông điệp không chứa URL RPC.
- **Ánh xạ lỗi** (`chain/errors.py`): `decode_revert` giải mã custom error theo selector (mã lý do, lỗi Council/Registry không có mã, `SubjectMismatch` và vài lỗi chỉ có ở contract), `Error(string)` và `Panic`; `rpc_error_tag` nhận ba chuỗi đã ghi từ Subnet-EVM v0.8.0 (`AllowListSenderRejected`, `DeployerNotAuthorized`, `AllowListModifyDenied`); mẫu nằm ở `Backend/tests/chain_l1/test_writes_unit.py` và `test_chain_errors.py`. `simulate_*` trả `None` khi revert không có mã lý do (ví dụ người gọi không phải member).
- **Khoá ký:** `SignerRegistry` theo địa chỉ; `SignerRegistry.from_env(seed)` đọc `L1_KEY_<SEED_ID viết hoa>` (ví dụ `L1_KEY_KEY_MINH`, `L1_KEY_COUNCIL_LAN`) từ môi trường hoặc `.env`, và từ chối khoá không ra đúng địa chỉ trong seed. Chỉ dùng khoá testnet/local; khoá không bao giờ vào log, `repr` hay thông điệp lỗi, và adapter nâng logger `web3`/`urllib3` lên INFO vì chúng in URL RPC ở DEBUG. `NodeSigner` (node giữ tài khoản, như anvil impersonate) chỉ dành cho test. Nonce lấy từ `pending`, mỗi lần chỉ một tx đang bay (khoá trong tiến trình).
- **Gọi Council bằng ký hiệu** (cùng từ vựng với sim): `propose(member, title, subject, calls, hash)` mã hoá `calls` thành `Call[]` (calldata ABI) rồi trả id từ event `Proposed`; `bumpPolicyVersion` bị bỏ khỏi danh sách vì Council tự bump đúng một lần khi execute (sim vẫn nhận nó). Đích hoặc hàm lạ, thiếu tham số: `ChainRevert` (`TargetNotAllowed`, `UnknownCall`, `BadCallArgs`) trước khi gửi, như sim. `apply_policy_v2()` là hàm tiện ích như của `SimChain`.
- **Test:** `tests/chain_l1/test_writes_anvil.py` (acceptance của issue trên anvil + contract thật, Council thật `GuardianCouncil`), `test_scene4_parity_anvil.py` (cảnh 4 từng bước, `L1Chain` bằng `SimChain`: outcome, reason, error và `spent`; bước 7 do `AllowListEnforcingProvider` giả lập việc node từ chối vì anvil không có precompile, thông điệp là chuỗi thật đã ghi), `test_writes_unit.py` (không cần node). Seed anvil ghi policy v1 bằng cách impersonate chính Council.
- **Chưa kiểm chứng trên L1 thật:** TxAllowList thật của Subnet-EVM (chỉ có chuỗi lỗi đã ghi và mock), `eth_estimateGas`/`eth_call` từ địa chỉ role 0 trên node thật (adapter xử lý cả hai trường hợp), gas price thật.
- **Sim khớp contract:** `chain/sim/council.py` `affected_principals` suy ra tập khu bị ảnh hưởng từ lời gọi ký hiệu và lưu lúc `propose`; `SubjectMismatch` khi subject khai báo không thuộc tập khác rỗng; `ConflictOfInterest` khi khu của người duyệt là subject hoặc thuộc tập; danh sách call rỗng là `BadCallArgs`.

- `snapshot()` đọc mọi giá trị tại một block cố định. Chain chỉ cho id, nhãn khoá, hạn mức, trạng thái; nhãn khu, `seed_id`, cạnh khai báo, nhãn Council/recipient/protocol lấy từ `Backend/seed/may_labs.json` khớp theo địa chỉ (không có thì dùng dữ liệu chain). Danh sách token/recipient/protocol là seed + ứng viên suy ra từ event `AllowChanged` (mapping không liệt kê được). `PrincipalState.kind` lấy từ seed, không có thì theo loại khoá đầu tiên. `main_treasury` (C-Chain) lấy từ seed.
- `events_since(block)` trả event có `block` lớn hơn tham số, theo thứ tự `(block, log_index)`; chỉ giải mã log từ registry, vault, Council và Tx AllowList (`RoleSet` thành `AllowListRoleSet`).
- Test: `Backend/tests/chain_l1/` (`test_decode_unit.py` không cần node; `test_snapshot_anvil.py` triển khai contract lên anvil và so snapshot với sim; tự bỏ qua khi thiếu Foundry). Council trong test là `GuardianCouncil` thật (CTR-006); `CouncilStub` chỉ còn dùng trong test Foundry.

## Issue

`CHN-001` đọc (snapshot, events) · `CHN-002` ghi + ánh xạ lỗi thật · `CHN-003` bộ test conformance sim↔l1 và nối `CHAIN_MODE=l1` vào `Runtime`.
