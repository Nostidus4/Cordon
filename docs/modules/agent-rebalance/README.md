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

Đã có `rule_engine.py`, `config.py`, `reason_writer.py` (LLM + mẫu) và `runner.py` (`run_once`: một vòng duy nhất, dùng chung cho `POST /api/agent/run-once` qua `services/agent_service.py` và cho tiến trình riêng). Lịch chạy xong (`AGT-002`): `uv run guardian-agent [--interval-seconds S] [--cycles N]`, chu kỳ mặc định `RebalanceConfig.interval_minutes`; mỗi vòng log một dòng (kết quả, số tiền, reason code); SIGTERM/SIGINT dừng ngay, exit 0; khoá `GUARDIAN_AGENT_LOCK` (mặc định trong thư mục tạm) chặn chạy hai bản. Khi chain từ chối (vd. hết hạn mức thẻ) runner ghi attempt `blocked` và không gửi gì. Test: `tests/test_agent_runner.py`.

Lưu ý: ở `CHAIN_MODE=sim` tiến trình agent có chain trong bộ nhớ riêng (không chung với API); ở `l1` cả hai cùng một chain. `agent_runs` vẫn lưu trong bộ nhớ, lưu DB chờ `DB-003` (#19).

## Issue

`AGT-001` lý do bằng LLM + reason_hash + `reasonSource` · `AGT-002` runner/scheduler `guardian-agent` + đường BLOCKED.
