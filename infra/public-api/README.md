# Backend công khai cho bản demo (chain giả lập)

Chạy FastAPI Backend ở chế độ `CHAIN_MODE=sim` trên VM Azure sẵn có (cùng máy với validator Fuji), đặt sau Caddy tại
`https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api`. Trang GitHub Pages (`https://nostidus4.github.io/Cordon/`) mặc định chạy mock trong
trình duyệt; người xem có thể chuyển sang "backend thật" ở `/he-thong` hoặc mở `?api=live`. Mọi người dùng backend này **dùng chung một trạng thái**.

| File | Vai trò |
|---|---|
| `guardian-public-api.service` | systemd: uvicorn ở `127.0.0.1:8000`, không reload, `MemoryMax=600M` |
| `public-api.env.example` | mẫu `/etc/cordon/public-api.env` (sim, demo, CORS, không có khoá LLM) |
| `Caddyfile.snippet` | `handle /api/*` tới `127.0.0.1:8000`, `flush_interval -1` cho SSE |
| `guardian-public-api-reset.{service,timer}` | tuỳ chọn: mỗi giờ gọi `POST /api/demo/reset` để dọn trạng thái dùng chung |

## Cài đặt (trên VM, quyền sudo)

```bash
# 1. Thư mục (user `cordon` là tài khoản đăng nhập sẵn có của VM)
sudo mkdir -p /opt/cordon /etc/cordon && sudo chown cordon:cordon /opt/cordon

# 2. Đẩy mã Backend lên (từ máy dev, ở thư mục gốc repo)
rsync -az --delete --exclude .venv --exclude __pycache__ --exclude '.env*' Backend/ <vm>:/tmp/Backend/
ssh <vm> 'sudo rsync -a --delete /tmp/Backend/ /opt/cordon/Backend/ && sudo chown -R cordon:cordon /opt/cordon'

# 3. uv và phụ thuộc (không dev)
curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh
sudo -u cordon env HOME=/opt/cordon bash -c 'cd /opt/cordon/Backend && uv sync --frozen --no-dev'

# 4. Env
sudo install -m 640 -o root -g cordon infra/public-api/public-api.env.example /etc/cordon/public-api.env
sudo nano /etc/cordon/public-api.env     # kiểm tra CORS_ORIGINS; KHÔNG thêm khoá LLM

# 5. systemd
sudo cp infra/public-api/guardian-public-api.service /etc/systemd/system/
sudo cp infra/public-api/guardian-public-api-reset.{service,timer} /etc/systemd/system/   # tuỳ chọn
sudo systemctl daemon-reload
sudo systemctl enable --now guardian-public-api
sudo systemctl enable --now guardian-public-api-reset.timer                               # tuỳ chọn

# 6. Caddy: Caddyfile.snippet là cả file /etc/caddy/Caddyfile (thêm /api/*, giữ RPC chỉ-đọc ở phần còn lại)
sudo cp infra/public-api/Caddyfile.snippet /etc/caddy/Caddyfile && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Service chạy thẳng `/opt/cordon/Backend/.venv/bin/uvicorn` (venv do `uv sync` tạo). Nếu VM không có cổng 8000 mở ra ngoài (đúng như mong muốn),
chỉ Caddy mới tới được backend.

## Kiểm tra

```bash
systemctl status guardian-public-api
curl -s https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api/health
# CORS cho trang Pages: phải có access-control-allow-origin: https://nostidus4.github.io
curl -si -H 'Origin: https://nostidus4.github.io' https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api/health | head -20
# SSE: phải thấy dòng event/ping chảy ra ngay, không bị gom
curl -N --max-time 20 https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api/stream
# RPC chỉ-đọc cũ vẫn hoạt động (catch-all không bị che)
curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' https://cordon-guardian-l1.eastasia.cloudapp.azure.com/
```

Reset tay: `curl -X POST https://cordon-guardian-l1.eastasia.cloudapp.azure.com/api/demo/reset` (cần `DEMO_MODE=true`; nếu đặt `DEMO_SIGNING_TOKEN` thì thêm header `X-Demo-Token`).

## An toàn

- Chỉ **sim**: không bao giờ đặt `CHAIN_MODE=l1`, không để khoá riêng thật hay có tiền trên máy chủ này. Backend công khai không được nói chuyện với validator Fuji.
- **Không đặt khoá LLM trả phí** (`ANTHROPIC_API_KEY`...): ai cũng gọi được endpoint trợ lý. Không khoá thì trợ lý trả lời bằng mẫu.
- Trạng thái dùng chung và nằm trong bộ nhớ: restart hoặc reset là mất; người này bấm "Đặt lại" thì người kia thấy. Có giới hạn `RATE_LIMIT_PER_MINUTE` theo IP cho các endpoint ký.
- Cổng 8000 chỉ nghe `127.0.0.1`; đừng mở ra NSG.
