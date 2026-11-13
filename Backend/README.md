# Cordon Backend (FastAPI + uv)

```bash
uv sync                 # cài deps
uv run guardian-api     # API :8000  (docs: /docs)
uv run guardian-worker  # indexer + graph worker
uv run guardian-agent   # agent Cân đối
uv run guardian-attacker scene4 --step all
uv run pytest
uv run pytest tests/conformance tests/chain_l1   # sim vs L1 (anvil) conformance + L1 e2e; needs Foundry, skips without
CHAIN_MODE=l1 DEMO_MODE=true uv run guardian-api  # API on a Guardian L1: see docs/modules/chain-adapter/README.md
```

| Thư mục | Vai trò (mục spec) |
|---|---|
| `src/guardian/api/routes` | REST + SSE (§8.6) |
| `src/guardian/schemas` | Hợp đồng API, khớp `Frontend/src/types` |
| `src/guardian/models`, `db`, `alembic` | PostgreSQL (§8.2) |
| `src/guardian/chain` | web3, precompile AllowList, decode lỗi (§6) |
| `src/guardian/graph` | Đồ thị, simulateCompromise, findings, risk report (§8.3–8.5) |
| `src/guardian/assistant` | Trợ lý chỉ đọc (§9) |
| `src/guardian/workers` | Indexer, graph worker (§8.1) |
| `src/guardian/agent_rebalance` | Agent Cân đối (§7.1) |
| `src/guardian/attacker` | CLI kịch bản cảnh 4 (§7.2) |
| `src/guardian/shared` | Reason codes, tiền tệ, kịch bản cảnh 4 |
| `seed/`, `deployments/` | Dữ liệu Mây Labs, địa chỉ contract |

## LLM (trợ lý câu tự do + lý do của agent)

Mặc định không gọi LLM: câu cố định và lý do của agent dùng mẫu. LLM chỉ **đọc** (tool chỉ đọc) và **viết lời**; không bao giờ quyết định số tiền, token, sàn hay người nhận, và không có gì tự động nới chính sách.

| Biến môi trường | Ý nghĩa |
|---|---|
| `ANTHROPIC_API_KEY` | Khóa Anthropic (SDK còn đọc `ANTHROPIC_AUTH_TOKEN`). Không bao giờ được log. |
| `LLM_ENABLED` | `true`/`false`. Bỏ trống = bật khi có khóa, tắt khi không có. |
| `LLM_MODEL` | Mặc định `claude-haiku-4-5` (rẻ nhất). Đặt `claude-opus-5-5` khi cần chất lượng cao nhất (đắt hơn khoảng 4 lần). |
| `LLM_TIMEOUT_SECONDS` | Ngân sách cứng cho mọi lần gọi của một request, mặc định `15` (câu tự do chạy ngoài event loop). |
| `LLM_REASON_TIMEOUT_SECONDS` | Ngân sách cho câu lý do của agent cân đối, mặc định `5` (đo thật p50 khoảng 3,2 s; chạy giữa các lần ghi chain nên phải ngắn; quá hạn thì dùng câu mẫu). |
| `LLM_MAX_TOOL_CALLS` | Số lần gọi tool tối đa mỗi câu hỏi, mặc định `4`. |

- Bật LLM thì `POST /api/assistant/ask` nhận câu tự do: mọi số trong câu trả lời phải qua `verifier.verify`, nếu không trả câu mặc định với `numbersVerified=false`. Lỗi, timeout, từ chối đều rơi về mẫu. Tắt LLM thì câu ngoài danh sách cố định vẫn trả 422.
- Đổi nhà cung cấp: cài một `LlmClient` mới (`core/llm.py`) rồi gán `rt.llm_client`; không phải sửa trợ lý hay agent.
- Test dùng client giả, không cần khóa: `uv run pytest`. Đo độ ổn định với API thật (không chạy trong CI, tự bỏ qua khi không có khóa): `ANTHROPIC_API_KEY=... uv run python scripts/llm_reliability.py [--runs 10]`.
