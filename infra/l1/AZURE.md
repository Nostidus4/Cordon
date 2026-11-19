# Guardian L1 trên Azure (validator duy nhất, từ 18/11/2026)

Validator **duy nhất** của Guardian L1 (Fuji, chain id 845357) đã chuyển từ máy Mac của người vận hành lên một máy ảo
Azure để giám khảo đọc được chain 24/7 (#96). Chain giữ nguyên: cùng NodeID, cùng dữ liệu, tiếp tục từ block 1111,
địa chỉ contract ở `Backend/deployments/fuji-l1.json` không đổi.

## Cần nhớ (cả nhóm)

- **Không bật node Fuji ở máy khác** (`infra/l1/fuji-run.sh`, `avalanche node local start guardianl1-local-node-fuji`).
  Hai node cùng danh tính chạy song song có thể làm hỏng L1. `make l1-local-up` (L1 cục bộ để phát triển) không bị ảnh hưởng.
- **Đọc chain (ai cũng dùng được, kể cả giám khảo):** `https://cordon-guardian-l1.eastasia.cloudapp.azure.com`.
  Đây là proxy chỉ-đọc (`readonly_rpc_proxy.py`): chỉ cho các lệnh đọc, giới hạn tần suất, gửi giao dịch bị từ chối.
  Trang `/he-thong/bang-chung` trên GitHub Pages đọc qua địa chỉ này.
- **Ghi lên chain (backend `CHAIN_MODE=l1`, `make demo-reset`, `make e2e-l1`):** mở SSH tunnel rồi dùng y như trước,
  `127.0.0.1:9650` trên máy bạn sẽ trỏ tới node trên Azure, không phải sửa `.env` hay script:

  ```sh
  ssh -i ~/.ssh/cordon_azure -N -L 9650:127.0.0.1:9650 cordon@cordon-guardian-l1.eastasia.cloudapp.azure.com
  ```

  SSH chỉ mở cho IP của người vận hành. Thành viên khác cần quyền thì gửi khoá công khai SSH và IP cho người vận hành.

## Máy ảo

| Mục | Giá trị |
|---|---|
| Subscription / resource group | Azure for Students / `cordon-rg` |
| Máy | `cordon-l1`, Standard_B2als_v2 (2 vCPU, 4 GB), Ubuntu 24.04, East Asia |
| Địa chỉ | `cordon-guardian-l1.eastasia.cloudapp.azure.com` (IP tĩnh) |
| Cổng mở | 22 (chỉ IP người vận hành), 9651 (P2P của validator), 80/443 (HTTPS, Caddy tự cấp chứng chỉ) |
| Cổng đóng | 9650 (API của node, kể cả admin) chỉ nghe trong máy |
| Phần mềm | avalanchego 1.15.3 và Subnet-EVM v1.15.3 (bản release Linux), plugin ở `/var/lib/avalanche/plugins/` |
| Chi phí | khoảng $34/tháng; budget cảnh báo $30 trong Cost Management |

Dịch vụ systemd (tự bật lại khi sập hoặc khi máy khởi động lại):

| Dịch vụ | Việc |
|---|---|
| `avalanchego` | node validator, cấu hình `/etc/avalanchego/config.json` (chứa khoá validator, quyền 600) |
| `l1-readonly-rpc` | proxy chỉ-đọc ở `127.0.0.1:9670` |
| `caddy` | HTTPS ở cổng 443: `/api/*` tới backend công khai (sim), còn lại tới proxy chỉ-đọc |
| `guardian-public-api` | backend FastAPI `CHAIN_MODE=sim` ở `127.0.0.1:8000`, reset mỗi giờ bằng `guardian-public-api-reset.timer` ([infra/public-api/](../public-api/README.md)) |

```sh
ssh -i ~/.ssh/cordon_azure cordon@cordon-guardian-l1.eastasia.cloudapp.azure.com
systemctl status avalanchego l1-readonly-rpc caddy
journalctl -u avalanchego -f          # log của node
sudo systemctl restart avalanchego
```

## Đã kiểm khi chuyển (18/11/2026)

- Qua RPC công khai: chain id `0xce62d` (845357), block 1111 (đúng block cuối trên Mac), cả 8 contract trong
  `fuji-l1.json` có mã, Council đọc 2 (admin) trên cả Tx AllowList và Contract Deployer AllowList,
  `eth_sendRawTransaction` bị proxy từ chối, CORS mở cho trang GitHub Pages.
- Trên máy: node `healthy`, chain đã bootstrapped, 45 peer Fuji, validator `NodeID-5xybfwXRgXtYrHqK1pSmgkDSzv5DemohR` weight 100.
- `kill -9` node: systemd bật lại, RPC trả lời sau 12 s.
- Chưa có WebSocket công khai (chỉ HTTP JSON-RPC); trang web không dùng ws.

## Kiểm tra nhanh

```sh
RPC=https://cordon-guardian-l1.eastasia.cloudapp.azure.com
curl -s -X POST -H 'content-type: application/json' $RPC --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
cast call 0x0200000000000000000000000000000000000002 'readAllowList(address)(uint256)' 0x09BaacAaFE18487e297f61859Aca6407cD8257bC --rpc-url $RPC
```

## Sao lưu, quay lại, dọn dẹp

- Bản sao lưu trước khi chuyển: `~/cordon-l1-backup-20261118.tar.gz` trên máy người vận hành. **Có khoá validator, không chia sẻ.**
- Quay lại chạy trên Mac: `sudo systemctl stop avalanchego` trên Azure **trước**, rồi giải nén bản sao lưu vào `~/.avalanche-cli/local/` và chạy node như cũ.
- Sau Demo Day (30/11), xoá toàn bộ để không bị trừ tiền: `az group delete -n cordon-rg`.
