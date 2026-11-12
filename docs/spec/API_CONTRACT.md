# API_CONTRACT — ChainPort, ChainEvent, REST và SSE

Trạng thái: **FROZEN — 2026-11-12** (issue `API-001`). Đây là hợp đồng giữa: (1) lớp ứng dụng và mọi chain (`chain/sim`, `chain/l1`); (2) Backend và Frontend. Sau khi đóng băng, đổi hợp đồng cần PR riêng cập nhật cùng lúc: tài liệu này, `Backend/src/guardian/schemas`, `Frontend/src/types`, và `openapi.json` đã commit.

Nguồn mã: `Backend/src/guardian/chain/base.py`, `Backend/src/guardian/domain/snapshot.py`, `Backend/src/guardian/schemas/*`, `Backend/src/guardian/api/routes/*`, `Frontend/src/types/*`, `Frontend/src/lib/api/endpoints.ts`.

## 1. ChainPort

`ChainPort` (Protocol, `chain/base.py`) là ranh giới duy nhất giữa ứng dụng và chain. Hai bản cài đặt phải **không thể phân biệt** từ phía gọi (cùng kết quả cho cùng chuỗi lệnh, trừ trường `simulated`, tx hash và block).

**Địa chỉ.** Hợp đồng: `signer`, `member`, `key`, `to` là **địa chỉ hex**. `shortcut:` lớp dịch vụ và attacker hiện còn truyền seed id (`key_minh`, `tUSDC`, `vendor_cloud`, member `lan`...) và sim tự phân giải; chuyển hết sang hex (dùng `shared/addresses.py: derive_address`, trùng địa chỉ trong `seed/may_labs.json`) đụng hơn 10 chỗ gọi (`attempt_service`, `agent_service`, `action_service`, `proposal_service`, `attacker/steps`, `attacker/cli`, scenario4 dùng chung với Frontend) và đổi `signer` trong `AttemptOut`, nên để lại; làm trước khi có adapter L1.

**Đồng bộ.** `ChainPort` là hàm đồng bộ. Adapter L1 phải chạy lệnh web3 ngoài event loop (threadpool) sau **một lock** tuần tự hoá mọi thao tác chain, khớp quy tắc "không `await` giữa chừng một thao tác chain" của sim (`services/runtime.py`). `shortcut:` port async là hướng nâng cấp nếu cần thông lượng.

| Nhóm | Hàm | Ghi chú |
|---|---|---|
| Chi tiêu (khoá gọi) | `pay`, `swap`, `raw_call` | trả `TxResult` |
| Dry-run | `simulate_pay`, `simulate_swap` | trả `ReasonCode \| None`, không gửi tx |
| Council siết (1 người) | `emergency_lock`, `emergency_pause`, `lower_key_cap`, `lower_district_cap`, `revoke_allow`, `deactivate_key` | |
| Council nới (2/3) | `propose` (trả `TxResult`, id ở `proposal_id`), `approve`, `cancel` | tự execute khi đủ 2 phiếu |
| Đọc / stream | `snapshot() -> PolicySnapshot`, `events_since(block)`, `subscribe(cb) -> unsubscribe` | |

`TxResult.status ∈ {ok, reverted, blocked_at_protocol}`:

- `ok`: có `tx_hash`, `block`, `events`; với `propose` có thêm `proposal_id: int`.
- `reverted`: có `reason_code` (từ custom error), thường có `tx_hash` (tx bị revert vẫn được gửi để có hash trên explorer), `error_raw`.
- `blocked_at_protocol`: `reason_code = BLOCKED_AT_PROTOCOL`, **không có `tx_hash`**, `error_raw` là lỗi RPC rút gọn.

`propose` không ném lỗi khi revert: trả `TxResult` `reverted` / `blocked_at_protocol` với `proposal_id = None`.

Hành vi ChainPort cần đảm bảo (bộ test conformance chạy trên cả hai bản cài đặt): thứ tự kiểm tra bảng 4.3 của [README.md](README.md) · bộ đếm theo ngày UTC · tight 1 / loosen 2/3 / xung đột lợi ích · `emergency_lock` khiến mọi khoá của khu `allow_listed = false` · `snapshot()` phản ánh đúng sau mỗi lệnh.

## 2. ChainEvent và payload

```text
ChainEvent { name, block, tx_hash, log_index, payload: dict, ts, simulated }
```

Khoá duy nhất: `(tx_hash, log_index)` (indexer idempotent). Payload dùng **camelCase**. Số tiền trong payload là `int` Python (base unit); tầng API bọc thành `{raw: string, display}` (`schemas/common.py`, `services/views.py: api_event`). `principalId`/`id` là chuỗi **ASCII** (ví dụ `"minh"`): adapter/indexer đổi từ `bytes32` trước khi tạo `ChainEvent` (xem [CONTRACTS.md](CONTRACTS.md) mục 6).

| `name` | Payload (khớp event trong [CONTRACTS.md](CONTRACTS.md)) |
|---|---|
| `Paid` | `key, principalId, token, to, amount, day, keySpentAfter, principalSpentAfter, memoHash` |
| `Swapped` | `key, principalId, dex, tokenIn, tokenOut, amountIn, amountOut, day, keySpentAfter, principalSpentAfter, reasonHash` |
| `PrincipalLocked` | `principalId, by` |
| `PrincipalUnlocked` | `principalId` |
| `Paused` / `Unpaused` | `by` / (rỗng) |
| `CapChanged` | `kind (key\|principal), subject, oldCap, newCap` |
| `AllowChanged` | `kind (token\|protocol\|recipient), subject, selector, allowed` |
| `PolicyVersionBumped` | `version` |
| `TopUpRecorded` | `cChainTxHash, amount` |
| `TopUpOperatorChanged` | `oldOperator, newOperator` (sim chưa phát) |
| `PrincipalCreated` | `id, label` |
| `KeyAdded` | `id, key, kind, label` |
| `KeyMoved` | `key, fromId, toId` |
| `KeyDeactivated` | `key` |
| `Proposed` | `id, proposer, subjectPrincipal (ASCII hoặc null), title, riskReportHash` |
| `Approved` | `id, member` |
| `Executed`, `Cancelled` | `id` |
| `EmergencyAction` | `member, action, subject` (theo [CONTRACTS.md](CONTRACTS.md) mục 4) |
| `AllowListRoleSet` (khi khoá bị `setNone`/`setEnabled` trên Tx AllowList) | `{key, role, by}` (role 0 none, 1 enabled, 2 admin). Trên L1 là log `RoleSet` của precompile; indexer chuẩn hoá về tên này. **Sim và mock chưa phát; sẽ phát trong WEB-002 (#12)** (mục 7) |

## 3. PolicySnapshot (chain → graph)

`domain/snapshot.py`: `policy_version, block, keys[], principals[], declared_edges[], council[], recipients[], protocols[], tokens[], vault_balances, main_treasury`. Chain sinh snapshot, `graph/` chỉ đọc. Bản cài đặt L1 phải điền `KeyState.allow_listed` từ `readAllowList` của Tx AllowList.

## 4. REST

Tiền tố `/api`. Số tiền: `{ "raw": "<base unit>", "display": "30.000" }`. Lỗi: `{ "error": { "code", "message" } }`. Thuộc tính JSON dùng camelCase (`CamelModel`).

| Method | Path | Mô tả | Trạng thái |
|---|---|---|---|
| GET | `/health` | block L1/C, `indexerLagBlocks`, agent, `demoMode`, `chainMode`, `simulated`; thêm cảnh báo block đứng (issue API-004) | có |
| GET | `/org` | công ty, quỹ chính, kho, Council | có |
| GET | `/graph` | `GraphSnapshot` | có |
| GET | `/city/states` | trạng thái 8 công trình cho thành phố 3D | có |
| POST | `/simulate` | `{compromised[], change?}` → `SimResult` (có `before/after` khi có `change`) | có |
| GET | `/findings` | findings đang mở (id dạng `R1_MULTI_KEY_NO_SHARED_CAP:minh`) | có |
| GET | `/districts/{principal_id}` | chi tiết khu | có |
| GET | `/events?since=` | event đã index | có |
| GET | `/stream` | SSE (mục 5) | có |
| GET / POST | `/attempts?run=` / `/attempts` | các lần thử; POST do attacker CLI ngoài báo | có |
| POST | `/proposals/draft` | từ `findingId` hoặc `change` → `calls` + `riskReport` (chưa gửi chain) | có |
| GET / POST | `/proposals`, `/proposals/{proposal_id}` | danh sách, tạo (demo signer) | có |
| POST | `/proposals/{proposal_id}/approve` | `{member}` (demo signer) | có |
| POST | `/actions/lock`, `/actions/pause` | demo signer, `emergencyLock` / `emergencyPause` | có |
| POST | `/assistant/ask` | `{question, context}` → `AssistantAnswer` (+ `numbersVerified`) | có |
| GET | `/assistant/logs` | bảng `assistant_logs`, cũ nhất trước | **missing (API-003 (#7))** |
| POST | `/agent/run-once` | chạy agent một vòng → `AgentRun` | có |
| GET | `/agent/runs` | bảng `agent_runs`, cũ nhất trước | **missing (API-003 (#7))** |
| POST | `/scenario/scene4/run`, `/scenario/scene4/step7` | chạy kịch bản từ server | có |
| GET | `/scenario/runs`, `/scenario/runs/{run_id}` | các lần chạy (Replay dùng) | có |
| POST | `/demo/reset`, `/demo/policy-v2` | đặt lại về đầu cảnh 1; áp policy v2 qua đường Council thật | có |

Mọi endpoint ký (`actions`, `agent/run-once`, `demo/*`, `proposals` POST, `scenario/*`) chỉ hoạt động khi `DEMO_MODE` bật, có rate limit và log. `DEMO_MODE` không bao giờ bật trên mạng thật (`core/demo_guard.py`).

Hợp đồng giữa Backend và Frontend được kiểm tự động: OpenAPI do FastAPI sinh được commit ở `Backend/openapi.json` (issue API-001) và test `API-002` (#6) đối chiếu từng schema với `Frontend/src/types`.

## 5. SSE `/api/stream`

Mỗi message: `event: <type>` + `data: <JSON>`.

| type | data |
|---|---|
| `event` | `EventOut` (một `ChainEvent` đã bọc tiền) |
| `attempt` | `AttemptOut` |
| `graph_updated` | `{graphVersion, policyVersion, block}` |
| `proposal_updated` | `ProposalOut` |
| `agent_run` | `AgentRunOut` |
| `city_updated` | `CityStates` |
| `reset` | `{at, policyVersion, graphVersion, block}` |

Danh sách type đồng bộ giữa `Backend/src/guardian/schemas/stream.py` (`SSE_EVENT_TYPES`) và `Frontend/src/types/stream.ts` (`STREAM_TYPES`). Frontend phải bỏ qua type lạ, và tự kết nối lại khi mất kết nối.

## 6. Hợp đồng chung phải giữ đồng bộ hai phía

| Backend | Frontend |
|---|---|
| `Backend/src/guardian/schemas/*` | `Frontend/src/types/*` |
| `shared/reason_codes.py` | `Frontend/src/shared/reasonCodes.ts` |
| `shared/scenario4.py` | `Frontend/src/shared/scenario4.ts` |
| `schemas/stream.py` | `Frontend/src/types/stream.ts` |

## 7. Chênh lệch đã biết giữa mock và backend (checklist theo issue)

- [ ] Id finding: mock `F-R1-minh`, backend `R1_MULTI_KEY_NO_SHARED_CAP:minh` -> WEB-002 (#12)
- [ ] Mock chỉ có finding R1; backend có R1–R4 -> WEB-002 (#12)
- [ ] Mock và `chain/sim` chưa phát `AllowListRoleSet` khi khoá khu bị khoá/mở khoá (L1 thật có log `RoleSet`) -> WEB-002 (#12)
- [ ] Đề xuất #11 (gom khu): proposer trên mock khác `lan`, backend dùng `lan` -> WEB-002 (#12)
- [ ] `GET /agent/runs`, `GET /assistant/logs` chưa có ở backend -> API-003 (#7)
- [ ] Chạy trọn luồng trực tiếp (live) Frontend ↔ Backend -> WEB-001 (#17)
- [ ] Kiểm tương đương (parity) schema/mock/backend tự động -> QA-001 (#21)
- [ ] `chain/sim` lệch [CONTRACTS.md](CONTRACTS.md) mục 6: `KeyAdded.kind` phát chữ hoa (`HUMAN`) thay vì `human`; `Proposed.subjectPrincipal` là `null` thay vì bytes32 rỗng. Sửa sim khi viết adapter L1 / bộ test conformance
- [ ] App code vẫn truyền seed id (`key_minh`, `lan`, `tUSDC`) vào ChainPort; `Runtime.sim` lộ nội bộ sim (council, vault). Phải đổi sang địa chỉ hex và đi qua ChainPort trước khi có adapter L1 (`AttemptOut.signer` sẽ đổi, là thay đổi hợp đồng)

## 8. Tiêu chí đóng băng (`API-001`), đã đạt 2026-11-12

- [x] `Backend/openapi.json` sinh bằng `make openapi` và commit; CI fail nếu lệch
- [x] Bảng payload event ở mục 2 khớp những gì `chain/sim` đang phát (và `EventOut`)
- [x] `EventSink` / `EventStore` (indexer ghi, API đọc) định nghĩa ở mục 9, `Backend/src/guardian/services/event_store.py`
- [x] Mục 7 được đóng thành checklist cho các issue sau

## 9. EventSink, EventStore và DemoControls

`services/event_store.py` (Protocol, có bản `InMemoryEventStore` làm cả hai, `Runtime.events`):

- `EventSink.write(ev) -> bool`: idempotent theo `(tx_hash, log_index)`; `False` nếu đã có. `last_block(source)` / `set_last_block(source, block)` với `source ∈ {"l1", "c"}`.
- `EventStore.list(since_block=0, limit=200, name=None) -> list[ChainEvent]`: `block > since_block`, cũ nhất trước. `GET /api/events` đọc qua đây (không phân trang, truyền limit rất lớn).

`chain/base.py`: `DemoControls` (chỉ sim: `reset`, `balance`) và `DemoChain(ChainPort, DemoControls)` là kiểu của `Runtime.chain`. `advance_day`, `topup`, `direct_call`, `apply_policy_v2` không do dịch vụ/API gọi nên chưa nằm trong `DemoControls`. `shortcut:` `city_state`, `org_service`, `proposal_service`, `demo_reset` còn đọc nội bộ sim qua `Runtime.sim`; thay bằng truy vấn qua `ChainPort`/snapshot trước khi có adapter L1.
