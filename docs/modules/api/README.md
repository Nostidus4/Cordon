# Module: api

REST + SSE của backend FastAPI, hợp đồng với frontend, process `worker`, và quan sát vận hành (health, stall).

Chủ trì: therealtunguyen · Issue: `API-001`…`API-004` · Interface đóng băng: [../../spec/API_CONTRACT.md](../../spec/API_CONTRACT.md)

## Mục đích

Một API duy nhất mà frontend (mock hay live) và các service khác nói chuyện, không phụ thuộc chain là sim hay L1.

## Giao diện

Danh sách endpoint, SSE, payload event: [API_CONTRACT.md](../../spec/API_CONTRACT.md). Quy ước: tiền `{raw, display}` (chuỗi base unit + `30.000`), lỗi `{error:{code,message}}`, JSON camelCase, endpoint ký chỉ khi `DEMO_MODE` + rate limit + log.

## Quy tắc chính

- Hợp đồng `schemas ↔ Frontend/src/types` được kiểm tự động bằng OpenAPI (`API-001`, `API-002`).
- `GET /api/health` có `indexerLagBlocks`, block L1/C, trạng thái agent, `demoMode`, và **cảnh báo khi block không tăng > 60 giây** (`API-004`).
- Process: `guardian-api` (REST+SSE), `guardian-worker` (indexer + graph worker), `guardian-agent` (agent).

## Nghiệm thu

- `Backend/openapi.json` commit và được CI kiểm; test parity schema↔type xanh.
- `GET /api/agent/runs`, `GET /api/assistant/logs` có và có test.
- Health báo stall trong test với chain giả đứng yên > 60 giây (đồng hồ giả).

## Trạng thái hiện tại

Routes ở `Backend/src/guardian/api/routes/*` (15 module), services ở `services/*`, schema ở `schemas/*`, 69 test pass (`Backend/tests/test_api.py`…). `guardian-worker` (API-004) đã chạy graph worker và slot indexer, dừng sạch khi SIGTERM, log JSON. `/api/health` có thêm `lastBlockAt`, `blockStalled`, `warnings` và `eventToSse` (xem mục 4.3 của spec). Thiếu `GET /api/agent/runs`, `GET /api/assistant/logs` (frontend đã gọi, xem `Frontend/src/lib/api/endpoints.ts`).

## Issue

`API-001` đóng băng ChainPort/API/SSE + OpenAPI · `API-002` test parity schema↔type · `API-003` endpoint còn thiếu · `API-004` worker + health/observability.
