# Cordon Backend (FastAPI + uv)

```bash
uv sync                 # cài deps
uv run guardian-api     # API :8000  (docs: /docs)
uv run guardian-worker  # indexer + graph worker
uv run guardian-agent   # agent Cân đối
uv run guardian-attacker scene4 --step all
uv run pytest
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
