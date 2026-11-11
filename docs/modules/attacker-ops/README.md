# Module: attacker-ops

Công cụ vận hành demo trên chain: CLI kẻ gian (cảnh 4), nạp kho (topup), `make demo-reset`, script seed và E2E toàn cảnh.

Chủ trì: Nostidus4 · Issue: `OPS-001`…`OPS-004` · Spec: [../../spec/README.md](../../spec/README.md) mục 4.3, 6, 8.3, 9

## Mục đích

Tái hiện cùng một vụ chiếm máy cho hai kết quả (không có / có Cordon) một cách lặp lại được, và đưa hệ thống về đầu cảnh 1 trong ≤ 3 phút.

## Giao diện

```bash
uv run guardian-attacker scene4 --step all        # lệnh 1→5, dừng chờ lock
uv run guardian-attacker scene4 --step 7          # sau khi lock: thử contract khác
uv run guardian-attacker scene4 --dry-run         # chỉ eth_call, không gửi
make demo-scene4 · make demo-reset · make deploy-cchain · make topup
```

- Attacker đọc 5 khoá test từ `.env.attacker` (không commit), mỗi bước: dry-run lấy lý do → gửi tx thật (kể cả khi sẽ revert) → `POST /api/attempts` (hoặc backend tự thấy qua receipt). Bước 7: bắt lỗi RPC → `BLOCKED_AT_PROTOCOL`. Độ trễ giữa các bước cấu hình được (mặc định 3 giây).
- Attacker chỉ nói chuyện qua `ChainPort`, nên chạy được cả trên sim (test) và L1.
- Topup: giao dịch Safe (hoặc multisig đơn giản) chuyển X tUSDC tới "bridge escrow" trên C-Chain → mint X tUSDC vào vault trên L1 → `recordTopUp`. UI ghi nhãn "nạp mô phỏng".
- Demo-reset (quyết định chốt: **deploy lại bộ contract**): deploy mới → seed policy v1 + declared edges → nạp 200.000 tUSDC → `setEnabled` lại mọi khoá → xoá `attempts`/`scenario_runs`, giữ `events` → `POST /api/demo/reset`.

## Nghiệm thu

- Mỗi bước attacker cho đúng kết quả bảng 4.3 ([README.md](../../spec/README.md)); bước 7 không có tx hash.
- `make demo-reset` chạy ≤ 3 phút và Map về policy v1.
- E2E `scene-all`: reset → Map v1 → simulate → propose + approve v2 → agent run → attacker 1–5 → lock → attacker 7 → số trên DB và API khớp bảng 4.3.

## Trạng thái hiện tại

`attacker/cli.py` và `attacker/steps.py` rỗng (1 dòng); `shared/scenario4.py` đã có 8 bước; `services/scenario_service.py` chạy kịch bản trong sim; `services/demo_reset.py` reset sim; `tests/e2e/test_scene_all.py` chỉ có docstring; target `make demo-reset` hiện gọi `POST /api/demo/reset`.

## Issue

`OPS-001` attacker CLI · `OPS-002` C-Chain Safe + topup · `OPS-003` demo-reset + seed trên L1 · `OPS-004` E2E scene-all trên L1.
