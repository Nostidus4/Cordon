# API_CONTRACT — ChainPort, ChainEvent, REST và SSE (bản nháp đóng băng)

Trạng thái: **DRAFT**, sẽ được đóng băng bởi issue `API-001`. Đây là hợp đồng giữa: (1) lớp ứng dụng và mọi chain (`chain/sim`, `chain/l1`); (2) Backend và Frontend. Sau khi đóng băng, đổi hợp đồng cần PR riêng cập nhật cùng lúc: tài liệu này, `Backend/src/guardian/schemas`, `Frontend/src/types`, và `openapi.json` đã commit.

Nguồn mã hiện tại: `Backend/src/guardian/chain/base.py`, `Backend/src/guardian/domain/snapshot.py`, `Backend/src/guardian/schemas/*`, `Backend/src/guardian/api/routes/*`, `Frontend/src/types/*`, `Frontend/src/lib/api/endpoints.ts`.

## 1. ChainPort

`ChainPort` (Protocol, `chain/base.py`) là ranh giới duy nhất giữa ứng dụng và chain. Hai bản cài đặt phải **không thể phân biệt** từ phía gọi (cùng kết quả cho cùng chuỗi lệnh, trừ trường `simulated`, tx hash và block).

| Nhóm | Hàm | Ghi chú |
|---|---|---|
| Chi tiêu (khoá gọi) | `pay`, `swap`, `raw_call` | trả `TxResult` |
| Dry-run | `simulate_pay`, `simulate_swap` | trả `ReasonCode \| None`, không gửi tx |
| Council siết (1 người) | `emergency_lock`, `emergency_pause`, `lower_key_cap`, `lower_district_cap`, `revoke_allow`, `deactivate_key` | |
| Council nới (2/3) | `propose` (trả id), `approve`, `cancel` | tự execute khi đủ 2 phiếu |
| Đọc / stream | `snapshot() -> PolicySnapshot`, `events_since(block)`, `subscribe(cb) -> unsubscribe` | |

`TxResult.status ∈ {ok, reverted, blocked_at_protocol}`:

- `ok`: có `tx_hash`, `block`, `events`.
- `reverted`: có `reason_code` (từ custom error), thường có `tx_hash` (tx bị revert vẫn được gửi để có hash trên explorer), `error_raw`.
- `blocked_at_protocol`: `reason_code = BLOCKED_AT_PROTOCOL`, **không có `tx_hash`**, `error_raw` là lỗi RPC rút gọn.

Hành vi ChainPort cần đảm bảo (bộ test conformance chạy trên cả hai bản cài đặt): thứ tự kiểm tra bảng 4.3 của [README.md](README.md) · bộ đếm theo ngày UTC · tight 1 / loosen 2/3 / xung đột lợi ích · `emergency_lock` khiến mọi khoá của khu `allow_listed = false` · `snapshot()` phản ánh đúng sau mỗi lệnh.

## 2. ChainEvent và payload

```text
ChainEvent { name, block, tx_hash, log_index, payload: dict, ts, simulated }
```

Khoá duy nhất: `(tx_hash, log_index)` (indexer idempotent). Payload dùng **camelCase**, số tiền là chuỗi/số nguyên base unit trong ChainPort và được bọc thành `{raw, display}` ở tầng API (`services/views.py: api_event`).

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
| `PrincipalCreated`, `KeyAdded`, `KeyMoved`, `KeyDeactivated` | theo [CONTRACTS.md](CONTRACTS.md) mục 2 |
| `Proposed`, `Approved`, `Executed`, `Cancelled`, `EmergencyAction` | theo [CONTRACTS.md](CONTRACTS.md) mục 4 |
| `AllowListRoleSet` (khi khoá bị `setNone`/`setEnabled` trên Tx AllowList) | `key, role` (0 none, 1 enabled, 2 admin), `by`. Trên L1 là log `RoleSet` của precompile; indexer chuẩn hoá về tên này. `chain/sim` phát một event cho mỗi khoá khi khoá/mở khoá khu (`by` = địa chỉ Council); mock frontend hiện chưa phát (xem mục 7) |

## 3. PolicySnapshot (chain → graph)

`domain/snapshot.py`: `policy_version, block, keys[], principals[], declared_edges[], council[], recipients[], protocols[], tokens[], vault_balances, main_treasury`. Chain sinh snapshot, `graph/` chỉ đọc. Bản cài đặt L1 phải điền `KeyState.allow_listed` từ `readAllowList` của Tx AllowList.

## 4. REST

Tiền tố `/api`. Số tiền: `{ "raw": "<base unit>", "display": "30.000" }`. Lỗi: `{ "error": { "code", "message" } }`. Thuộc tính JSON dùng camelCase (`CamelModel`).

| Method | Path | Mô tả | Trạng thái |
|---|---|---|---|
| GET | `/health` | block L1/C, `indexerLagBlocks`, agent, `demoMode`, `chainMode`, `simulated`, `policyVersion` (thô) và `policyLabel` (số hiển thị, mục 4.1); thêm cảnh báo block đứng (issue API-004) | có |
| GET | `/org` | công ty, quỹ chính, kho, Council | có |
| GET | `/graph` | `GraphSnapshot` (`policyVersion` thô + `policyLabel`, mục 4.1) | có |
| GET | `/city/states` | trạng thái 8 công trình cho thành phố 3D | có |
| GET | `/city/buildings`, `/city/buildings/{id}` | 8 tòa = 8 module, luật đổi màu, bằng chứng, `recent` ([CITY_OPS](CITY_OPS.md) §2) | có (CITY_OPS) |
| GET | `/faults` | các kiểu sự cố gây được (F01-F07) | có (CITY_OPS) |
| POST | `/faults/{id}/inject` | gây sự cố thật qua `ChainPort` / service, chỉ `DEMO_MODE` (CITY_OPS §3) | có (CITY_OPS) |
| GET | `/incidents?status=open\|all`, `/incidents/{id}` | sự cố do responder xử lý (CITY_OPS §4) | có (CITY_OPS) |
| POST | `/simulate` | `{compromised[], change?}` → `SimResult` (có `before/after` khi có `change`) | có |
| GET | `/findings` | findings đang mở (id dạng `R1_MULTI_KEY_NO_SHARED_CAP:minh`) | có |
| GET | `/districts/{id}` | chi tiết khu | có |
| GET | `/events?since=` | event đã index | có |
| GET | `/stream` | SSE (mục 5) | có |
| GET / POST | `/attempts?run=` / `/attempts` | các lần thử; POST do attacker CLI ngoài báo | có |
| POST | `/proposals/draft` | từ `findingId` hoặc `change` → `calls` + `riskReport` (chưa gửi chain) | có |
| GET / POST | `/proposals`, `/proposals/{id}` | danh sách, tạo (demo signer) | có |
| POST | `/proposals/{id}/approve` | `{member}` (demo signer) | có |
| POST | `/actions/lock`, `/actions/pause` | demo signer, `emergencyLock` / `emergencyPause` | có |
| POST | `/assistant/ask` | `{question, context}` → `AssistantAnswer` (+ `numbersVerified`). Câu cố định: mẫu + tool. Câu tự do (`questionId = "free_text"`): chỉ khi LLM bật (LLM, tool chỉ đọc, mọi số được verifier kiểm; sai/lỗi/timeout 15 s → câu mặc định, `numbersVerified=false`); LLM tắt thì 422 `UNKNOWN_QUESTION` | có |
| GET | `/assistant/logs` | bảng `assistant_logs`, cũ nhất trước, `?limit=` (mặc định 200) | có (CITY_OPS) |
| POST | `/agent/run-once` | chạy agent một vòng → `AgentRun` (`reasonSource` = `llm` nếu LLM viết câu giải thích đạt kiểm tra, ngược lại `template`; số tiền/token/DEX không bao giờ do LLM chọn) | có |
| GET | `/agent/runs` | bảng `agent_runs`, cũ nhất trước, `?limit=` (mặc định 200); `AgentRun` thêm `steps`, `untrustedInput`, `injectionIgnored` | có (CITY_OPS) |
| POST | `/scenario/scene4/run`, `/scenario/scene4/step7` | chạy kịch bản từ server | có |
| GET | `/scenario/runs`, `/scenario/runs/{id}` | các lần chạy (Replay dùng) | có |
| POST | `/demo/reset`, `/demo/policy-v2` | đặt lại về đầu cảnh 1 (sim: tua lại chain trong bộ nhớ; l1: nạp lại bộ contract mới mà `make demo-reset` vừa deploy, mục 4.2); áp policy v2 qua đường Council thật | có |

### 4.1 `policyVersion` và `policyLabel`

`policyVersion` là `vault.policyVersion()` nguyên văn. Mỗi proposal được thực thi bump nó một lần, kể cả các proposal seed và bàn giao, nên trên chain thật bộ vừa dựng xong đọc **4** (sim và anvil: 1). `policyLabel = policyVersion - policyBaseline + 1` là số người dùng thấy: v1 ở đầu cảnh 1, v2 sau proposal gom khu. `policyBaseline` là `policyVersion()` ngay sau khi seed + bàn giao xong, do script ghi vào file deployments (`policyBaseline`, mặc định 1 khi file không có). Có trong `GraphSnapshot`, `/health`, `/org`, `/city/states`, SSE `graph_updated` và `reset`. Frontend dùng `policyLabel` (`Frontend/src/lib/policy.ts`, mock không có thì lấy `policyVersion`) cho mọi nhãn và mọi phép thử "đã lên policy v2".

### 4.2 `POST /demo/reset`

Cùng hợp đồng HTTP ở sim và l1: trả `{status, policyVersion, policyLabel, graphVersion, seededProposalId}`. Trên l1, sổ cái không tua lại được (bộ đếm vault theo ngày UTC), nên `make demo-reset` deploy **bộ contract mới** rồi gọi endpoint này. Endpoint nạp lại file deployments không cần restart (`Runtime.reload_deployment`: chain mới, indexer mới từ `deployBlock` mới), xoá `attempts`/`scenario_runs`/`proposals`, **giữ** `event_log` (event của các bộ cũ), seed request #12 trên Council mới (script để bộ đếm Council ở 11 nên id là 12) và phát SSE `reset`. File lỗi hoặc không đọc được: `502 RELOAD_FAILED`, API giữ bộ cũ.

Mọi endpoint ký (`actions`, `agent/run-once`, `demo/*`, `proposals` POST, `scenario/*`) chỉ hoạt động khi `DEMO_MODE` bật, có rate limit và log. `DEMO_MODE` không bao giờ bật trên mạng thật (`core/demo_guard.py`).

Hợp đồng giữa Backend và Frontend được kiểm tự động: OpenAPI do FastAPI sinh được commit ở `Backend/openapi.json` (issue API-001) và test `API-002` đối chiếu từng schema với `Frontend/src/types`.

## 5. SSE `/api/stream`

Mỗi message: `event: <type>` + `data: <JSON>`.

| type | data |
|---|---|
| `event` | `EventOut` (một `ChainEvent` đã bọc tiền) |
| `attempt` | `AttemptOut` |
| `graph_updated` | `{graphVersion, policyVersion, policyLabel, block}` |
| `proposal_updated` | `ProposalOut` |
| `agent_run` | `AgentRunOut` |
| `city_updated` | `CityStates` |
| `reset` | `{at, policyVersion, policyLabel, graphVersion, block}` |
| `incident_updated` | `IncidentOut` (có (CITY_OPS), mục 4.4 của CITY_OPS) |

Danh sách type đồng bộ giữa `Backend/src/guardian/schemas/stream.py` (`SSE_EVENT_TYPES`) và `Frontend/src/types/stream.ts` (`STREAM_TYPES`). Frontend phải bỏ qua type lạ, và tự kết nối lại khi mất kết nối.

## 6. Hợp đồng chung phải giữ đồng bộ hai phía

| Backend | Frontend |
|---|---|
| `Backend/src/guardian/schemas/*` | `Frontend/src/types/*` |
| `shared/reason_codes.py` | `Frontend/src/shared/reasonCodes.ts` |
| `shared/scenario4.py` | `Frontend/src/shared/scenario4.ts` |
| `schemas/stream.py` | `Frontend/src/types/stream.ts` |

## 7. Chênh lệch đã biết giữa mock và backend (cần xử lý ở `WEB-001`, `WEB-002`, `QA-001`)

- Id finding: mock `F-R1-minh`, backend `R1_MULTI_KEY_NO_SHARED_CAP:minh`.
- Mock chỉ có finding R1; backend có R1–R4.
- Mock frontend chưa phát event `AllowListRoleSet` khi khoá khu bị khoá/mở khoá (`chain/sim` đã phát từ CHN-003, như log `RoleSet` của precompile trên L1).
- Đề xuất #11 (gom khu) trên mock có proposer khác `lan`; backend dùng `lan`.
- Hai endpoint `GET /agent/runs`, `GET /assistant/logs` chưa có ở backend.

## 8. Tiêu chí đóng băng (`API-001`)

- [ ] `Backend/openapi.json` sinh bằng lệnh có trong `Makefile` và commit; CI fail nếu lệch
- [ ] Bảng payload event ở mục 2 khớp những gì `chain/sim` đang phát và `EventOut`
- [ ] Giao diện `EventSink` / `EventStore` (indexer ghi, API đọc) được định nghĩa trong `Backend/src/guardian/chain/base.py` hoặc `services/`
- [ ] Mục 7 được đóng thành checklist cho các issue sau
