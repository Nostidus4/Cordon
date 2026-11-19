# Cordon Frontend (React + Vite + TypeScript)

```bash
npm install
npm run dev     # http://localhost:5173, proxy /api -> :8000
npm run build
```

| Thư mục | Vai trò (mục spec) |
|---|---|
| `src/pages/*` | 6 màn: Map, Simulate, Incident, Requests, Council, About (§10) |
| `src/components/layout` | Top bar, điều hướng, chân trang (§10.1) |
| `src/components/graph` | React Flow: khu, khoá, cạnh liền/đứt/chấm |
| `src/components/assistant` | Panel trợ lý câu cố định (§9.5) |
| `src/components/common` | Tiền, thanh hạn mức, huy hiệu bằng chứng |
| `src/types` | Kiểu dữ liệu khớp `Backend/src/guardian/schemas` |
| `src/lib` | API client, SSE, format số |
| `src/shared` | Reason codes, kịch bản cảnh 4 |
| `src/graph` | Bố cục cố định, chuyển snapshot sang React Flow |
| `src/hooks`, `src/store` | Gọi API, trạng thái UI (Live/Replay, demoMode) |

## Live mode

`make dev-live` (repo root) starts the sim API (demo mode) and Vite with `VITE_API_MODE=live` together; Ctrl-C stops both. Vite proxies `/api` to `localhost:8000`. If the API/stream drops, a small banner shows "Đang dùng dữ liệu đã lưu lúc HH:MM:SS" and everything refetches when the stream reconnects. Live smoke test: `LIVE_API=1 VITE_API_MODE=live VITE_API_BASE=http://localhost:8000/api npx vitest run src/lib/api/live.walkthrough.test.ts`.

**Chọn chế độ lúc chạy.** `env.apiMode` được chốt một lần khi tải trang: `?api=mock|live` (lưu vào localStorage `guardian.apiMode`) > localStorage > `VITE_API_MODE` lúc build (mặc định `mock`). Chế độ `live` chỉ khả dụng khi build là live hoặc `VITE_API_BASE` là URL tuyệt đối (ví dụ `https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api`; backend cần `CORS_ORIGINS` cho origin của trang). Công tắc nằm ở `/he-thong` (Tổng quan) và nút "Chuyển về bản chạy thử" ở banner mất kết nối; đổi chế độ = ghi localStorage + tải lại trang. Bản GitHub Pages build mặc định `mock` nhưng đã trỏ sẵn `VITE_API_BASE` tới backend công khai (chain giả lập, trạng thái dùng chung); xem `infra/public-api/`.

## Ký bằng ví (Hội đồng tự ký, backend không ký phiếu này)

Nút "Ký bằng ví" (`src/stage/WalletApproveButton.tsx`, logic ở `src/lib/wallet/`) cho một thành viên Hội đồng duyệt đề xuất bằng ví trình duyệt của chính họ (MetaMask / Core), gọi thẳng `GuardianCouncil.approve` trên Guardian L1. Chỉ hiện khi `VITE_API_MODE=live`, có `VITE_L1_RPC_URL` và `VITE_COUNCIL_ADDRESS`, và trình duyệt có ví; bản mock / GitHub Pages không đổi.

- Biến môi trường: `VITE_L1_RPC_URL`, `VITE_COUNCIL_ADDRESS` (xem `Backend/deployments/fuji-l1.json`), tuỳ chọn `VITE_L1_CHAIN_ID` (mặc định 845357), `VITE_L1_NATIVE_SYMBOL` (mặc định GRD).
- Người trình bày tự nhập khoá testnet của thành viên Hội đồng vào ví (không tự động hoá). Địa chỉ đó phải nằm trong Tx AllowList của L1 thì mới gửi được giao dịch.
- Sau khi ký, UI hiện hash ngắn và tải lại dữ liệu. Backend đọc số phiếu trực tiếp từ chain nên thấy phiếu này khi tải lại.
