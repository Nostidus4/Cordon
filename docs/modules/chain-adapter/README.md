# Module: chain-adapter

Adapter web3 `Backend/src/guardian/chain/l1/*` cài đặt cùng interface `ChainPort` như `chain/sim`, để API, agent và attacker chạy trên Guardian L1 mà không đổi mã.

Chủ trì: Nostidus4 · Issue: `CHN-001`, `CHN-002`, `CHN-003` · Interface: [../../spec/API_CONTRACT.md](../../spec/API_CONTRACT.md) mục 1–3

## Mục đích

Ranh giới `ChainPort` là điểm duy nhất ứng dụng chạm tới chain. Adapter L1 dịch lời gọi sang web3, đọc `PolicySnapshot` từ chain thật, và chuyển lỗi thật thành `TxResult`.

## Giao diện

- Cài đặt toàn bộ `ChainPort` (`chain/base.py`): chi tiêu, dry-run, siết, nới, `snapshot`, `events_since`, `subscribe`.
- Cấu hình: `CHAIN_MODE=l1`, RPC URL, địa chỉ từ `deployments/fuji-l1.json`, khoá ký từ env (chỉ khoá test). `Runtime` hiện ném `NotImplementedError` khi `CHAIN_MODE=l1`.
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

`chain/client.py`, `chain/contracts.py`, `chain/precompiles.py`, `chain/tx.py`, `chain/demo_signer.py` là file rỗng một dòng. Phần tái sử dụng được: `chain/errors.py` (giải mã lỗi), `chain/base.py` (interface), `chain/sim/*` (hành vi tham chiếu), `tests/test_chain_errors.py`, `tests/test_sim_chain.py`.

## Issue

`CHN-001` đọc (snapshot, events) · `CHN-002` ghi + ánh xạ lỗi thật · `CHN-003` bộ test conformance sim↔l1 và nối `CHAIN_MODE=l1` vào `Runtime`.
