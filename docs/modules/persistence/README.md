# Module: persistence

PostgreSQL 16 thay cho store trong RAM, qua SQLAlchemy 2 (async) + Alembic, đặt sau các interface store hiện có.

Chủ trì: therealtunguyen · Issue: `DB-001`, `DB-002`, `DB-003` · Mô hình: bảng ở dưới

## Mục đích

Dữ liệu (event, attempt, scenario_run, proposal, finding, agent_run, assistant_log, meta) sống sót qua restart, indexer dựng lại được sau khi xoá DB, và Replay dùng được tx hash thật đã lưu.

## Mô hình dữ liệu

```text
principals(id PK, label, kind, created_block)
keys(address PK, principal_id FK, kind, label, active, key_daily_cap)
principal_caps(principal_id PK, daily_cap, locked bool, updated_block)
allow_lists(kind enum[token|protocol|recipient], subject, selector, allowed, updated_block)
declared_edges(id PK, from_principal, to_principal_or_key, relation enum[controls|admins], note, source='declared')
inferred_edges(id PK, from, to, relation, rule_id, confidence, source='inferred')      -- P1
spend_daily(scope enum[key|principal], subject, day_index, spent)                      -- cache từ event
events(id PK, chain enum[l1|c], block, tx_hash, log_index, name, payload jsonb, ts)    -- unique(tx_hash, log_index)
attempts(id PK, scenario_run_id, step, signer, action jsonb, outcome enum[ok|reverted|blocked_at_protocol],
         reason_code, tx_hash null, error_raw, created_at)
proposals(id PK, onchain_id, title, subject_principal, calls jsonb, risk_report jsonb, risk_report_hash,
          approvals jsonb, status enum[open|executed|cancelled])
findings(id PK, rule_id, principal_id, severity, data jsonb, created_at, resolved_by_proposal null)
sim_runs(id PK, input jsonb, output jsonb, graph_version, created_at)
assistant_logs(id PK, question, tool_calls jsonb, answer jsonb, numbers_verified bool, created_at)
agent_runs(id PK, decision jsonb, reason_text, reason_source, tx_hash, outcome, created_at)
scenario_runs(id PK, name, started_at, finished_at, status)
meta(key PK, value)    -- policy_version, last_block_l1, last_block_c, graph_version
```

## Giao diện

- Giữ nguyên interface của `Stores` trong `Backend/src/guardian/services/runtime.py`; thêm bản cài đặt Postgres chọn bằng cấu hình (`DATABASE_URL` rỗng → RAM như hiện nay, để test nhanh và Pages không đổi).
- Số tiền lưu `numeric(78,0)` hoặc chuỗi base unit, không float.
- `EventSink` do indexer dùng (xem [indexer](../indexer/README.md)) được cài đặt trên bảng `events` với `INSERT ... ON CONFLICT DO NOTHING`.

## Nghiệm thu

- `alembic upgrade head` trên DB trống tạo đủ bảng; `alembic downgrade base` chạy sạch.
- Cùng bộ test API chạy xanh trên cả store RAM và Postgres.
- Restart API giữ nguyên attempts/proposals/agent_runs; xoá bảng `events` rồi replay indexer cho kết quả giống hệt.
- `demo reset` xoá `attempts`/`scenario_runs`, giữ `events`.

## Trạng thái hiện tại

Đủ model SQLAlchemy ở `Backend/src/guardian/models/*`, migration baseline `Backend/alembic/versions/0001_baseline.py` (upgrade/downgrade chạy trong job CI `db`). Postgres local: đặt `POSTGRES_PASSWORD` trong `.env` ở gốc repo, `make db-up` rồi `make db-migrate`. `DATABASE_URL` (Backend) rỗng thì API chạy với `Stores` trong RAM như cũ; chưa có repository nào ghi DB (DB-002, DB-003).

## Issue

`DB-001` Alembic baseline + compose profile db · `DB-002` repository cho event/attempt/scenario_run + chuyển `Stores` · `DB-003` repository còn lại + kiểm thử bền vững qua restart.
