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

`workers/indexer.py` đã cài đặt (IDX-001): `Indexer` (poll theo `L1_POLL_INTERVAL_SECONDS`, đọc lại cửa sổ `INDEXER_REORG_WINDOW` block, mặc định 5; `INDEXER_CONFIRMATIONS`, mặc định 0), `EventSink` (Protocol: `write`, `last_block`, `set_last_block`, `events_in_range`, `remove`), `InMemoryEventSink`, `L1ChainSource` (bọc `L1Chain.events_since`), `IndexerStatus` (`last_block_l1`, `head_l1`, `lag_blocks`) cho `/api/health`. Sink rỗng thì backfill từ `deployBlock`. Lỗi RPC không làm cursor tiến, chu kỳ sau thử lại với back-off. Chỉ event mới của sink được đẩy ra SSE. `guardian-worker` chạy indexer khi `CHAIN_MODE=l1` (ở `sim` slot indexer rảnh), đồng thời chạy graph worker (registry/policy event → tăng `graphVersion`, phát `graph_updated`). Process dừng sạch khi nhận SIGTERM. API vẫn chạy indexer riêng trong process khi `l1` đến khi DB-002 có bus/sink chung.

Chưa làm: index `TopUpRecorded` trên C-Chain (`last_block_c`, chưa có adapter đọc C-Chain); sink Postgres (DB-002); ws subscribe (adapter L1 poll qua HTTP).

Test: `tests/test_indexer_worker.py` (nguồn giả) và `tests/chain_l1/test_indexer_anvil.py` (anvil).

## Issue

`IDX-001`.
