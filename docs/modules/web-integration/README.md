# Module: web-integration

Đưa frontend (hiện chạy trọn vẹn trên backend mock trong trình duyệt) sang chạy thật trên FastAPI, và giữ hai bên không lệch nhau.

Chủ trì: therealtunguyen · Issue: `WEB-001`…`WEB-004`, `QA-001`, `QA-002` · Spec: [../../spec/README.md](../../spec/README.md) mục 8.1, 8.2

## Mục đích

Mock đã được dùng để dựng toàn bộ UI nhưng chưa từng chạy với API thật. Module này biến "chạy được trên mock" thành "chạy đúng trên backend", và dùng test để mock không trôi khỏi backend.

## Giao diện

- Chọn transport: `VITE_API_MODE=mock|live` (`Frontend/src/config/env.ts`); live gọi `/api` (Vite proxy `:5173 → :8000`, hoặc nginx trong Docker) và SSE `/api/stream` (`Frontend/src/lib/sse.ts`).
- Hợp đồng: [API_CONTRACT.md](../../spec/API_CONTRACT.md); `Frontend/src/types/*` ↔ `Backend/src/guardian/schemas/*`.
- Replay: phát lại một `scenario_run` đã lưu (`GET /api/scenario/runs`) với nhịp 3 giây/bước.

## Việc cần làm (chênh lệch đã biết)

- Mock chỉ có finding R1 và id kiểu `F-R1-minh`; backend có R1–R4 và id `R1_MULTI_KEY_NO_SHARED_CAP:minh`.
- Mock và `chain/sim` chưa phát event `AllowListRoleSet` khi khoá/mở khoá khu.
- Đề xuất #11 (gom khu, `Frontend/src/lib/mock/server.ts`) phải có proposer `lan` như backend.
- `StageHarness` (`Frontend/src/pages/city/StageHarness.tsx`, dùng ở `CityPage.tsx`) là công cụ dev, phải ra khỏi bản production.
- `docker-compose.yml` cho `web` ở chế độ live nhưng chưa có DB, worker, agent.

## Nghiệm thu

- Cả 5 cảnh chạy được ở `VITE_API_MODE=live` với backend sim; không còn lỗi console do lệch hợp đồng.
- Test parity (`QA-001`): cùng kịch bản trên mock và live cho cùng mọi con số: bảng 4.5 (simulate), bảng 4.3 (attempt), số tổng Incident, findings.
- `docker compose up` dựng đủ api + db + worker + agent + web, smoke test pass (`QA-002`).
- NFR UI: event hiện ≤ 3 giây, không truyền tải ý nghĩa chỉ bằng màu, đọc được ở 1280.

## Trạng thái hiện tại

Frontend đầy đủ trên mock: `Frontend/src/lib/mock/{core,server}.ts`, test `mock.test.ts`, `readonly.test.ts`; `Frontend/src/lib/api/endpoints.ts` đã có `liveApi` cho toàn bộ endpoint kể cả `getAgentRuns`, `getAssistantLogs`. Chưa chạy live lần nào. CI hiện chạy lint, typecheck, test, build frontend.

## Issue

`WEB-001` chạy live + sửa lệch hợp đồng · `WEB-002` parity mock/sim (R2/R3, AllowList, proposer) · `WEB-003` Replay live + bỏ StageHarness khỏi prod · `WEB-004` chạy UI live trên backend L1 (tích hợp cuối) · `QA-001` test parity mock↔live · `QA-002` docker-compose stack live.
