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

Model SQLAlchemy ở `Backend/src/guardian/models/*`, migration `0001_baseline`, `0002_persist_attempts_runs`, `0003_persist_rest` (job CI `db`). Postgres local: đặt `POSTGRES_PASSWORD` trong `.env` ở gốc repo, `make db-up` rồi `make db-migrate`.

DB-002: với `DATABASE_URL` có giá trị, **events, attempts và scenario_runs** được lưu vào Postgres và còn nguyên sau khi API restart; `DATABASE_URL` rỗng thì chạy trong RAM như cũ. 

- Interface: `AttemptStore`, `ScenarioRunStore` (`services/runtime.py`), `EventSink` (`workers/indexer.py`). Service chỉ dùng interface; sửa tại chỗ một `AttemptRec`/`ScenarioRunRec` thì gọi `.save(...)`.
- Cài đặt Postgres (`repositories/pg.py`) là write-through cache: nạp toàn bộ lúc khởi động, đọc từ RAM, mỗi thay đổi ghi thẳng DB. Service và indexer là code đồng bộ nên gọi repository async qua `db/bridge.py` (một thread riêng có event loop và engine riêng). `PgEventSink` ghi `events` bằng `INSERT ... ON CONFLICT DO NOTHING` trên `(tx_hash, log_index)`, con trỏ nằm ở `meta.last_block_l1`. Chế độ sim: xem DB-003.
- Migration 0002 vì schema 0001 không chứa được những gì service đã tạo: attempt ngoài scene 4 (không có run/step, hoặc CLI ngoài báo run id lạ) nên `scenario_run_id`/`step` cho phép NULL và bỏ foreign key; thêm outcome `blocked`; `scenario_runs` thêm `delay`, `policy_version`, `error`. Downgrade xoá các hàng 0001 không chứa được.
- Khi khởi động, `demo_reset(startup=True)` không còn xoá stores nên attempts/runs đã lưu được giữ. `POST /api/demo/reset` xoá `attempts` và `scenario_runs`, không đụng `events`.
- Chạy test với Postgres: `TEST_DATABASE_URL=postgresql+asyncpg://... uv run pytest -q --ignore=tests/chain_l1 -k "not l1"` trong `Backend/` (fixture `app` chạy cả hai chế độ; DB này bị TRUNCATE, đừng trỏ vào DB dev). Không đặt biến thì phần Postgres bị skip.

DB-003: thêm **proposals, findings, sim_runs, agent_runs, assistant_logs, meta** (`graph_version`, `policy_version`) vào cùng khuôn `Stores` (`RecStore`: `add/save/get/all/clear`, `all()` theo id, cũ trước). `conflicts` và `incidents` vẫn trong RAM.

- Chain sim nằm trong RAM nên mỗi event của nó cũng được ghi vào `events` với `chain='sim'` (migration 0003 thêm giá trị enum; `EventRepo(chain=...)` lọc mọi truy vấn nên indexer L1 không thấy). Khi khởi động, `Runtime._restore_sim` dựng lại chain từ các event đó (`chain/sim/replay.py`) và đặt `rt.restored`; khi đó `demo_reset(startup=True)` không rewind chain và không seed lại #12/#13. Chưa có event nào thì xoá bảng `proposals` (hàng mồ côi) rồi seed như cũ.
- `POST /api/demo/reset` xoá thêm các event `chain='sim'` (chain sim được tua lại và dùng lại tx hash) nhưng giữ event `l1`; `Stores.clear()` xoá mọi store trừ `events` và `meta`.
- Trường của rec không có cột riêng đi theo cột JSONB sẵn có (`proposals.approvals.rec`, `agent_runs.decision.rec`, `assistant_logs.answer.rec`) nên rec đọc lại bằng rec đã ghi. `proposals.status/approvals` ghi theo chain tại lúc lưu (chỉ để tham khảo, API vẫn đọc chain).
- `findings` ghi khi graph đổi (`notify_state_changed`): upsert theo id, finding biến mất thì `resolved_by_proposal` = đề xuất được thực hiện gần nhất. `sim_runs` ghi mỗi lần `POST /api/simulate`. Không API nào đọc hai bảng này.
- Sau replay, `chain.block` được nâng lên bằng block lớn nhất của attempt đã lưu (tx revert không phát event) để tx mới không trùng tx hash cũ.

## Issue

`DB-001` Alembic baseline + compose profile db · `DB-002` repository cho event/attempt/scenario_run + chuyển `Stores` · `DB-003` repository còn lại + kiểm thử bền vững qua restart.
