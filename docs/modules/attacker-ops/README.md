# Module: attacker-ops

Công cụ vận hành demo trên chain: CLI kẻ gian (cảnh 4), nạp kho (topup), `make demo-reset`, script seed và E2E toàn cảnh.

Chủ trì: Nostidus4 · Issue: `OPS-001`…`OPS-004` · Spec: [../../spec/README.md](../../spec/README.md) mục 4.3, 6, 8.3, 9

## Mục đích

Tái hiện cùng một vụ chiếm máy cho hai kết quả (không có / có Cordon) một cách lặp lại được, và đưa hệ thống về đầu cảnh 1 trong ≤ 3 phút.

## Giao diện

```bash
uv run guardian-attacker scene4 --step all        # lệnh 1→5, dừng chờ lock
uv run guardian-attacker scene4 --step 7          # sau khi lock: thử contract khác
uv run guardian-attacker scene4 --dry-run         # chỉ eth_call, không gửi, in bảng
# tuỳ chọn: --delay S (mặc định 3) · --api-url URL (hoặc GUARDIAN_API_URL) · --run-id ID · --record FILE.jsonl
#           --wait-lock/--no-wait-lock · --lock-timeout S · --simulate-lock (sim: council `lan` khoá khu thay bước 6)
# exit code: 0 đúng bảng 4.3 · 1 lệch bảng (hoặc không thấy lock) · 2 sai tham số/thiếu khoá · 3 không báo được API
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

- `OPS-001` xong: `attacker/steps.py` (dry-run lấy lý do → gửi tx thật → `StepReport`) và `attacker/cli.py` chạy trên mọi `ChainPort`; hiện dùng `SimChain` (tự áp policy v2 + bước 0 của agent trước khi chạy, tắt bằng `--no-prepare`); `--chain l1` báo chưa có adapter (OPS-004). Test: `Backend/tests/test_attacker_cli.py` tái hiện bảng 4.3 gồm bước 7 không có tx hash. `make demo-scene4` chạy `--step all --simulate-lock`.
- Mỗi bước đã gửi được `POST /api/attempts` (kèm `scenarioRunId`, `step`) hoặc ghi `--record` JSONL; `--dry-run` không gửi và không báo gì.
- `.env.attacker` (git-ignored, mẫu `Backend/.env.attacker.example`) giữ 5 khoá test; trên sim ký bằng seed id nên không bắt buộc, khoá không bao giờ được in.
- `OPS-003` xong ở local: `make demo-reset` (`infra/l1/demo-reset.sh`). Sim: `POST /api/demo/reset`. L1 đang chạy: Council cũ bật lại deployer, deploy bộ mới (`Deploy`, `Seed`), bật lại khoá đã bị khoá, Council cũ chuyển quyền hai precompile sang Council mới rồi bỏ role của mình, `VerifySeed` + `VerifyHandover`, ghi `policyBaseline` và file deployments (đổi tên nguyên tử), rồi `POST /api/demo/reset` để API nạp lại không restart (xoá `attempts`/`scenario_runs`/proposals, giữ `events`, seed request #12 với id 12). Từng pha được đo thời gian. Chi tiết: `docs/DEVELOPMENT.md`. Chưa chạy trên Fuji.
- Còn lại: `tests/e2e/test_scene_all.py` chỉ có docstring (OPS-004).

## Issue

`OPS-001` attacker CLI · `OPS-002` C-Chain Safe + topup · `OPS-003` demo-reset + seed trên L1 · `OPS-004` E2E scene-all trên L1.
