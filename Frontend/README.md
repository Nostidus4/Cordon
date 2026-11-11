# GuardianAI Frontend (React + Vite + TypeScript)

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
