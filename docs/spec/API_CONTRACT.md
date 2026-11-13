# API_CONTRACT — ChainPort, ChainEvent, REST và SSE

Trạng thái: **FROZEN — 2026-11-12** (issue `API-001`). Đây là hợp đồng giữa: (1) lớp ứng dụng và mọi chain (`chain/sim`, `chain/l1`); (2) Backend và Frontend. Sau khi đóng băng, đổi hợp đồng cần PR riêng cập nhật cùng lúc: tài liệu này, `Backend/src/guardian/schemas`, `Frontend/src/types`, và `openapi.json` đã commit.

Nguồn mã: `Backend/src/guardian/chain/base.py`, `Backend/src/guardian/domain/snapshot.py`, `Backend/src/guardian/schemas/*`, `Backend/src/guardian/api/routes/*`, `Frontend/src/types/*`, `Frontend/src/lib/api/endpoints.ts`.

## 1. ChainPort

`ChainPort` (Protocol, `chain/base.py`) là ranh giới duy nhất giữa ứng dụng và chain. Hai bản cài đặt phải **không thể phân biệt** từ phía gọi (cùng kết quả cho cùng chuỗi lệnh, trừ trường `simulated`, tx hash và block).

**Địa chỉ.** Hợp đồng: `signer`, `member`, `key`, `to` là **địa chỉ hex**. Code ứng dụng đổi id sang hex ngay tại chỗ gọi `ChainPort` (`Runtime.addr`, sổ địa chỉ dựng từ snapshot: `domain/address_book.py`); store và API vẫn giữ id (`AttemptOut.signer` không đổi). Sim và adapter L1 từ chối mọi thứ không phải hex (CHN-004).

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
| `AllowListRoleSet` (khi khoá bị `setNone`/`setEnabled` trên Tx AllowList) | `{key, role, by}` (role 0 none, 1 enabled, 2 admin). Trên L1 là log `RoleSet` của precompile; indexer chuẩn hoá về tên này. `chain/sim` phát một event cho mỗi khoá khi khoá/mở khoá khu (`by` = địa chỉ Council); mock frontend chưa phát (mục 7) |

## 3. PolicySnapshot (chain → graph)

`domain/snapshot.py`: `policy_version, block, keys[], principals[], declared_edges[], council[], recipients[], protocols[], tokens[], vault_balances, main_treasury`. Chain sinh snapshot, `graph/` chỉ đọc. Bản cài đặt L1 phải điền `KeyState.allow_listed` từ `readAllowList` của Tx AllowList.

## 4. REST

Tiền tố `/api`. Số tiền: `{ "raw": "<base unit>", "display": "30.000" }`. Lỗi: `{ "error": { "code", "message" } }`. Thuộc tính JSON dùng camelCase (`CamelModel`).

| Method | Path | Mô tả | Trạng thái |
|---|---|---|---|
| GET | `/health` | block L1/C, `indexerLagBlocks`, agent, `demoMode`, `chainMode`, `simulated`, `policyVersion` (thô) và `policyLabel` (số hiển thị, mục 4.1); quan sát `lastBlockAt`, `blockStalled`, `warnings`, `eventToSse` (mục 4.3) | có |
| GET | `/org` | công ty, quỹ chính, kho, Council | có |
| GET | `/graph` | `GraphSnapshot` (`policyVersion` thô + `policyLabel`, mục 4.1) | có |
| GET | `/city/states` | trạng thái 8 công trình cho thành phố 3D | có |
| GET | `/city/buildings`, `/city/buildings/{building_id}` | 8 tòa = 8 module, luật đổi màu, bằng chứng, `recent` ([CITY_OPS](CITY_OPS.md) §2) | có (CITY_OPS) |
| GET | `/faults` | các kiểu sự cố gây được (F01-F07) | có (CITY_OPS) |
| POST | `/faults/{fault_id}/inject` | gây sự cố thật qua `ChainPort` / service, chỉ `DEMO_MODE` (CITY_OPS §3) | có (CITY_OPS) |
| GET | `/incidents?status=open\|all`, `/incidents/{incident_id}` | sự cố do responder xử lý (CITY_OPS §4) | có (CITY_OPS) |
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
| POST | `/assistant/ask` | `{question, context}` → `AssistantAnswer` (+ `numbersVerified`). Câu cố định: mẫu + tool. Câu tự do (`questionId = "free_text"`): chỉ khi LLM bật (LLM, tool chỉ đọc, mọi số được verifier kiểm; sai/lỗi/timeout 15 s → câu mặc định, `numbersVerified=false`); LLM tắt thì 422 `UNKNOWN_QUESTION` | có |
| GET | `/assistant/logs` | bảng `assistant_logs`, cũ nhất trước, `?limit=` (mặc định 200) | có (CITY_OPS) |
| POST | `/agent/run-once` | chạy agent một vòng → `AgentRun` (`reasonSource` = `llm` nếu LLM viết câu giải thích đạt kiểm tra, ngược lại `template`; số tiền/token/DEX không bao giờ do LLM chọn) | có |
| GET | `/agent/runs` | bảng `agent_runs`, cũ nhất trước, `?limit=` (mặc định 200); `AgentRun` thêm `steps`, `untrustedInput`, `injectionIgnored` | có (CITY_OPS) |
| POST | `/scenario/scene4/run`, `/scenario/scene4/step7` | chạy kịch bản từ server | có |
| GET | `/scenario/runs`, `/scenario/runs/{run_id}` | các lần chạy (Replay dùng) | có |
| POST | `/demo/reset`, `/demo/policy-v2` | đặt lại về đầu cảnh 1 (sim: tua lại chain trong bộ nhớ; l1: nạp lại bộ contract mới mà `make demo-reset` vừa deploy, mục 4.2); áp policy v2 qua đường Council thật | có |

### 4.1 `policyVersion` và `policyLabel`

`policyVersion` là `vault.policyVersion()` nguyên văn. Mỗi proposal được thực thi bump nó một lần, kể cả các proposal seed và bàn giao, nên trên chain thật bộ vừa dựng xong đọc **4** (sim và anvil: 1). `policyLabel = policyVersion - policyBaseline + 1` là số người dùng thấy: v1 ở đầu cảnh 1, v2 sau proposal gom khu. `policyBaseline` là `policyVersion()` ngay sau khi seed + bàn giao xong, do script ghi vào file deployments (`policyBaseline`, mặc định 1 khi file không có). Có trong `GraphSnapshot`, `/health`, `/org`, `/city/states`, SSE `graph_updated` và `reset`. Frontend dùng `policyLabel` (`Frontend/src/lib/policy.ts`, mock không có thì lấy `policyVersion`) cho mọi nhãn và mọi phép thử "đã lên policy v2".

### 4.2 `POST /demo/reset`

Cùng hợp đồng HTTP ở sim và l1: trả `{status, policyVersion, policyLabel, graphVersion, seededProposalId}`. Trên l1, sổ cái không tua lại được (bộ đếm vault theo ngày UTC), nên `make demo-reset` deploy **bộ contract mới** rồi gọi endpoint này. Endpoint nạp lại file deployments không cần restart (`Runtime.reload_deployment`: chain mới, indexer mới từ `deployBlock` mới), xoá `attempts`/`scenario_runs`/`proposals`, **giữ** `event_log` (event của các bộ cũ), seed request #12 trên Council mới (script để bộ đếm Council ở 11 nên id là 12) và phát SSE `reset`. File lỗi hoặc không đọc được: `502 RELOAD_FAILED`, API giữ bộ cũ.

Mọi endpoint ký (`actions`, `agent/run-once`, `demo/*`, `proposals` POST, `scenario/*`) chỉ hoạt động khi `DEMO_MODE` bật, có rate limit và log. `DEMO_MODE` không bao giờ bật trên mạng thật (`core/demo_guard.py`).

Hợp đồng giữa Backend và Frontend được kiểm tự động: OpenAPI do FastAPI sinh được commit ở `Backend/openapi.json` (issue API-001) và test `API-002` (#6) đối chiếu từng schema với `Frontend/src/types`.

### 4.3 `/health`: quan sát

- `lastBlockAt`: unix giây lúc head L1 tiến lần cuối (`null` khi chưa có lần đọc `/health` nào; head được ghi nhận mỗi lần gọi `/health`).
- `blockStalled`: `true` khi head không tiến quá 60 giây. Chỉ kiểm ở `CHAIN_MODE=l1`; sim mỗi tx đúc một block nên không bao giờ đứng.
- `warnings`: mã cảnh báo, rỗng khi ổn. `BLOCK_STALLED` (block đứng > 60 giây), `INDEXER_LAG` (lag > 10 block), `INDEXER_ERROR` (chu kỳ indexer gần nhất lỗi), `SSE_SLOW` (latency event→SSE tối đa trong 100 event gần nhất > 3000 ms).
- `eventToSse`: `{lastMs, maxMs, samples}`, đo từ lúc API nhận chain event đến lúc đẩy xong vào hàng đợi của mọi subscriber SSE, trên 100 event gần nhất. Spec yêu cầu < 3 giây. `lastMs`/`maxMs` là `null` khi `samples` = 0.

Các trường này bổ sung, không đổi trường cũ.

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

## 7. Chênh lệch đã biết giữa mock và backend (checklist theo issue)

- [x] Id finding: mock dùng cùng format backend `<RULE>:<subject>` (`R1_MULTI_KEY_NO_SHARED_CAP:minh`, R4 cũng vậy) (WEB-002)
- [x] Mock tính R1, R2, R3 theo đúng luật `graph/findings.py` (R4 theo đề xuất, trong bản nháp). Chính sách v1: R1 + R3, cùng id với `GET /api/findings` (WEB-002). Còn lệch: địa chỉ thẻ trên mock là địa chỉ giả nên id R2 và `data.keys` khác giá trị; finding mock vẫn theo type Frontend (`suggestedChange`, `detail`) trong khi backend trả `proposal` -> QA-001 (#21)
- [x] `chain/sim` phát `AllowListRoleSet` khi khoá khu bị khoá/mở khoá (CHN-003); mock frontend phát giống vậy (role 0 mỗi thẻ khi khoá, role 1 mỗi thẻ còn hoạt động khi mở, cùng tx) (WEB-002)
- [x] Đề xuất #11 (gom khu): proposer `lan` trên cả mock và backend (WEB-002)
- [x] `GET /agent/runs`, `GET /assistant/logs` đã có (CITY_OPS)
- [x] Chạy trọn luồng trực tiếp (live) Frontend ↔ Backend: `make dev-live`; script `Frontend/src/lib/api/live.walkthrough.test.ts` (chạy khi có `LIVE_API`) đi cảnh 2-5 + mọi GET (WEB-001)
- [x] Kiểm tương đương (parity) mock/backend tự động: `make parity` (= `npm run test:parity` trong `Frontend/`, chạy trong CI job `frontend`) tự dựng backend sim (`uv run uvicorn`, cổng 8199) rồi chạy 5 cảnh qua `Api` trên cả hai, so từng phần (bảng 4.5, findings, cảnh 4 bước 0-7, proposal, cap/khoá khu, tên event theo thứ tự) (QA-001)
- [x] Id proposal: mock đánh số proposal đầu tiên tạo lúc chạy là #14 (như backend, vì #12/#13 là đơn seed), không còn #11 (QA-001)
- [x] `pauseAll`: mock phát `Paused` rồi `EmergencyAction` (cùng thứ tự `chain/sim`), trước đó ngược lại (QA-001)
- [x] Run cảnh 4: sau bước 5 mock ở `waiting_lock` (như backend), chỉ `step7` mới đưa về `completed` (QA-001)
- [x] `principalSpentAfter` của attempt `blocked_at_protocol` (bước 7) là `null` trên cả hai (bảng 4.3 ghi "–", không có event để lấy số); backend trước đó trả bộ đếm hiện tại 25.000 (QA-001)
- [ ] Còn lệch (chỉ chuẩn hoá trong test parity, QA-001): mock seed đơn #12/#13 sau lần gom khu đầu tiên, backend seed ngay lúc reset; `graph.districts` backend gồm cả khu của agent/dịch vụ (`agent_*`, `svc_payment`), mock chỉ có khu của người; backend responder tự đề xuất khôi phục sau `pauseAll` (event `Proposed` thêm), mock chỉ làm vậy khi gây lỗi qua `injectFault`; mock lưu bước 0 là `step: null` (FE đọc qua `stepOf`), backend là `0`; `POST /simulate` có `change`: backend chỉ trả `before/after`, mock còn điền `totals` cấp trên cùng
- [x] Type Frontend khớp schema Backend: mọi `Known<...>` trong `Frontend/src/types/parity.test.ts` rỗng, trừ `SimulateResponse.before/after` (Backend `response_model_exclude_none` bỏ key, không phải lệch). `POST /proposals` gửi `member` (+ `title` tuỳ chọn); payload event đọc theo mục 2 (`id`, địa chỉ thành viên) (WEB-001)
- [ ] `chain/sim` lệch [CONTRACTS.md](CONTRACTS.md) mục 6: `KeyAdded.kind` phát chữ hoa (`HUMAN`) thay vì `human`; `Proposed.subjectPrincipal` là `null` thay vì bytes32 rỗng. Sửa sim khi viết adapter L1 / bộ test conformance
- [x] `Runtime.sim` đã bỏ: app code đi qua `ChainPort` (`proposal_state`...) và truyền địa chỉ hex vào `ChainPort`; id chỉ nằm trong store/API (không đổi API) (CHN-004)

## 8. Tiêu chí đóng băng (`API-001`), đã đạt 2026-11-12

- [x] `Backend/openapi.json` sinh bằng `make openapi` và commit; CI fail nếu lệch
- [x] Bảng payload event ở mục 2 khớp những gì `chain/sim` đang phát (và `EventOut`)
- [x] `EventSink` định nghĩa ở mục 9 (`workers/indexer.py`); `GET /api/events` đọc `ChainPort.events_since`
- [x] Mục 7 được đóng thành checklist cho các issue sau

## 9. EventSink và DemoControls

`EventSink` (Protocol, `Backend/src/guardian/workers/indexer.py`; bản `InMemoryEventSink`) là phía ghi của indexer:

- `write(event) -> bool`: idempotent theo `(tx_hash, log_index)`; `False` nếu đã có.
- `last_block() -> int | None` (`meta.last_block_l1`; `None` khi chưa index gì), `set_last_block(block)`.
- `events_in_range(first, last)` (sắp theo `(block, log_index)`) và `remove(tx_hash, log_index)` cho cửa sổ reorg.

Không có `EventStore` riêng: `GET /api/events?since=` đọc `ChainPort.events_since(block)` (cả sim lẫn l1, adapter l1 tự đọc log), còn `Runtime.event_log` (deque) là bản ghi để dựng thành phố/sự cố. Khi có Postgres (DB-002), sink DB thay `InMemoryEventSink` mà không đổi ChainPort.

`chain/base.py`: `DemoControls` (chỉ `reset`, chỉ sim; sau `reset` id proposal kế tiếp là 12 như script demo-reset của l1; `demo_reset` gọi khi `not rt.is_l1`, l1 nạp bộ contract mới, mục 4.2) và `DemoChain(ChainPort, DemoControls)`. `balance` đã nằm trong `ChainPort`. `advance_day`, `topup`, `direct_call`, `apply_policy_v2` không do dịch vụ/API gọi nên không nằm trong `DemoControls`.
