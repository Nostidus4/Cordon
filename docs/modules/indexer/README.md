# Module: indexer

Worker theo dõi event của Guardian L1 (và C-Chain cho `TopUp`), chuẩn hoá thành `ChainEvent`, ghi qua `EventSink` một cách idempotent và đẩy SSE.

Chủ trì: Nostidus4 · Issue: `IDX-001` · Interface: [../../spec/API_CONTRACT.md](../../spec/API_CONTRACT.md) mục 2, 8

## Mục đích

Event là nguồn sự thật cho UI: số "đã dùng chung" ở màn Incident lấy từ `principalSpentAfter` trong event, không từ client. Event từ L1 phải hiện trên UI ≤ 3 giây sau receipt.

## Giao diện

- Đầu vào: log của `PrincipalRegistry`, `PolicyVault`, `GuardianCouncil` và log `RoleSet` của Tx AllowList (chuẩn hoá thành `AllowListRoleSet`); ws subscribe có fallback polling.
- Đầu ra: gọi `EventSink.write(ChainEvent)` (interface do `API-001` định nghĩa); `meta.last_block_l1`, `meta.last_block_c` cập nhật qua sink.
- Entry: `Backend/src/guardian/workers/indexer.py` (A sở hữu file này); `workers/main.py` và `graph_worker.py` thuộc nhánh backend (`API-004`).

## Quy tắc chính

- Idempotent theo `(tx_hash, log_index)`: chạy lại hoặc ghi trùng không tạo bản sao.
- Dựng lại đúng toàn bộ trạng thái sau khi xoá DB (replay từ block đầu tiên của deployment).
- Chịu được reorg nhẹ và mất kết nối ws (reconnect, bù block thiếu).
- Mỗi event có `block`, `ts` (block timestamp), `simulated = false`.

## Nghiệm thu

- Test với log thật ghi lại từ anvil: chạy 2 lần → số dòng không đổi; xoá sink rồi replay → danh sách event giống hệt.
- Độ trễ từ receipt tới `EventSink` ≤ 3 giây trong test chạy anvil.
- `/api/health` đọc được `indexer lag` (số block) từ `meta` do indexer cập nhật.

## Trạng thái hiện tại

`workers/indexer.py` rỗng; `tests/test_indexer.py` hiện kiểm luồng event của sim. Mô hình bảng `events` đã phác ở `Backend/src/guardian/models/event.py` (unique `(tx_hash, log_index)`).

## Issue

`IDX-001`.
