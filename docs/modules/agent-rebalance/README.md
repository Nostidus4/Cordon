# Module: agent-rebalance

Agent Cân đối: service tự rebalance kho chi tiêu trong rào chắn của policy, bằng khoá `key_agent_rebalance`. Rule engine thuần Python quyết định mọi con số; LLM **chỉ** viết một câu lý do.

Chủ trì: therealtunguyen · Issue: `AGT-001`, `AGT-002` · Spec: [../../spec/README.md](../../spec/README.md) mục 7

## Giao diện

- Cấu hình (`agent_rebalance/config.py`): mục tiêu tTKB 20% (80/20), ngưỡng lệch 5%, tối đa 5.000 mỗi lệnh, chu kỳ N phút.
- Quyết định: `amountIn = min(phần thiếu, hạn mức riêng còn lại, hạn mức chung còn lại, 5.000)` (`rule_engine.decide`); không có nhu cầu thì không làm gì.
- Vòng chạy: đọc số dư vault → quyết định → `simulate_swap` → nếu revert thì ghi attempt `BLOCKED` kèm reason và **không gửi** → gửi → chờ receipt → ghi `agent_runs`.
- Kích tay: `POST /api/agent/run-once`; lịch: `uv run guardian-agent` (chu kỳ cấu hình).
- Lý do: LLM viết 1 câu tiếng Việt từ số liệu đã tính, không được đổi `amountIn`, token, DEX; `reasonHash = keccak(câu)`; không có LLM dùng câu mẫu với `reasonSource = "template"`.

## Nghiệm thu

- Vault 200.000 tUSDC, 0 tTKB, mục tiêu 80/20: agent swap đúng **5.000** qua MockDEX; `principalSpent(minh) = 5.000`; có `reasonHash` và câu lý do trong DB.
- Cùng ngày agent đã dùng hết hạn mức riêng: chạy lại không gửi tx; simulate trả `CARD_DAILY_CAP`; có attempt `BLOCKED`.
- Test: LLM giả trả câu khác nhau không đổi số/token/DEX; câu lý do có số khác với dữ liệu thì bị bỏ, dùng mẫu.

## Trạng thái hiện tại

Đã có `rule_engine.py` (+ `tests/test_agent_rule_engine.py`), `config.py`, `reason_writer.py` (chỉ mẫu, comment TODO cho LLM), `services/agent_service.py` (chạy trong API trên sim). `agent_rebalance/runner.py` và `main.py` là stub một dòng: chưa có service riêng và lịch chạy.

## Issue

`AGT-001` lý do bằng LLM + reason_hash + `reasonSource` · `AGT-002` runner/scheduler `guardian-agent` + đường BLOCKED.
