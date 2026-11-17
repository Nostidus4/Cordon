<p align="center"><img src="Frontend/public/cordon-logo-dark.svg" alt="Cordon" height="72" /></p>

# Cordon

![Thành phố Cordon trong sự cố ban đêm](docs/images/city_hero_night_incident.jpg)

**Demo trực tuyến:** https://nostidus4.github.io/Cordon/ (chạy hoàn toàn trong trình duyệt với **chain giả lập**, không cần server; chain thật xem phần [Avalanche](#avalanche)).

## English summary

Cordon is a spending-control layer for companies whose money is moved by people, cards and AI agents. Every spending
key belongs to a "district" with its own daily cap and whitelist, enforced by contracts on a Guardian L1 (Avalanche
Subnet-EVM, Fuji, chain id 845357). Rules: (1) **tightening is immediate**, by a single Council member; (2) **loosening
needs a 2-of-3 Council vote** plus a 15 s timelock and a conflict-of-interest check; (3) **the AI never signs or moves
money** (the assistant is read-only, the rebalance agent is bound by the same contract rules). An emergency lock removes
a district's keys from the **Tx AllowList precompile**, so the node itself rejects their transactions. The contracts,
the lock and the Council are real and deployed on the Fuji L1; the DEX, the attacker and the C-Chain to L1 top-up are
mocks (see the table "Thật hay giả lập"). The public GitHub Pages demo runs a simulated chain in the browser.
Verify on-chain claims with the commands in [Avalanche](#avalanche); known limits are in [SECURITY.md](SECURITY.md).

## Vấn đề và giải pháp

Công ty đưa chìa khoá chi tiền cho nhiều người, thẻ và AI agent, nhưng thường không ai biết một chìa bị lộ thì mất tối
đa bao nhiêu. Cordon cho thấy ai giữ chìa nào, mô phỏng thiệt hại nếu một chìa bị chiếm, rồi dựng "hàng rào" ở tầng
giao thức: hạn mức ngày của từng thẻ, hạn mức chung của cả **khu**, danh sách trắng đích đến, và công tắc khoá khẩn cấp
trên một Avalanche L1. Một thẻ bị lộ chỉ thiệt trong khu của nó. Trợ lý AI chỉ đọc dữ liệu, không bao giờ ký hay chuyển tiền.

## Ba luật cốt lõi

1. **Siết thì làm ngay:** hạ hạn mức, thu hồi quyền, tạm dừng hay khoá khẩn cấp do **một** thành viên Hội đồng làm, không cần bỏ phiếu.
2. **Nới luôn cần Hội đồng 2/3:** nâng hạn mức hay thêm quyền phải qua đề xuất, 2 trên 3 thành viên duyệt, chờ timelock 15 s, và người có lợi ích liên quan không được duyệt. Không có đường tự động nào được nới.
3. **AI không có quyền chi:** trợ lý chỉ đọc; agent Cân đối chỉ hoán đổi trong whitelist và vẫn bị chain chặn bằng cùng bộ luật.

## Năm cảnh

1. **Nhìn:** thành phố 3D thể hiện ai giữ chìa nào, tòa nào đang an toàn hay có rủi ro.
2. **Thử:** giả lập một thẻ bị chiếm và so sánh "bạn nghĩ", "chain thật sự chặn" và ước tính thiệt hại.
3. **Sửa:** đề xuất chính sách mới, hội đồng duyệt, hạn mức dùng chung được áp dụng.
4. **Sự cố:** kẻ tấn công thử rút tiền, giao dịch bị chặn, khoá khẩn cấp được bật rồi phục hồi.
5. **Xin thêm quyền:** yêu cầu nâng quyền được so sánh trước/sau trước khi hội đồng quyết định.

| Thử | Sự cố | Sửa |
|---|---|---|
| ![Thử](docs/images/stage-ui-try-minhhuy.jpg) | ![Sự cố](docs/images/stage-ui-incident-step5.jpg) | ![Sửa](docs/images/stage-ui-fix-approved.jpg) |

Bảng điều khiển kỹ thuật (`/he-thong/*`) dành cho kỹ sư:

| Tổng quan | Hội đồng |
|---|---|
| ![Tổng quan](docs/images/system-tab-tong-quan.jpg) | ![Hội đồng](docs/images/system-tab-hoi-dong.jpg) |

## Kiến trúc

```mermaid
flowchart LR
  subgraph C["Fuji C-Chain (43113)"]
    TK["tUSDC (CChainUSDC)"]
    MS["Ví quỹ SimpleMultisig 3/5"]
  end
  subgraph L1["Guardian L1 (845357)"]
    REG["PrincipalRegistry"]
    VLT["PolicyVault"]
    CNL["GuardianCouncil 2/3"]
    DEX["MockDEX"]
    TXA["Precompile Tx AllowList"]
    DPA["Precompile Contract Deployer AllowList"]
  end
  subgraph BE["Backend FastAPI"]
    PORT["ChainPort: adapter sim / l1"]
    AG["Agent Cân đối"]
    AS["Trợ lý AI đọc-chỉ"]
  end
  FE["Frontend: thành phố 3D"]
  TK --- MS
  MS -. "nạp quỹ (mint + sự kiện, không cầu nối)" .-> VLT
  CNL --> REG
  CNL --> VLT
  CNL -- "quản trị" --> TXA
  CNL -- "quản trị" --> DPA
  VLT --> DEX
  PORT --> L1
  AG --> PORT
  AS --> PORT
  FE -- "SSE / REST" --> BE
```

## Thật hay giả lập

| Thành phần | Trạng thái |
|---|---|
| Contract `PrincipalRegistry`, `PolicyVault`, `GuardianCouncil` trên Guardian L1 (Fuji) | **Thật**, đã deploy |
| Khoá khẩn cấp ở tầng node (gỡ khoá khỏi Tx AllowList, node từ chối giao dịch, không có tx hash) | **Thật** |
| Hội đồng 2/3, timelock 15 s, chặn xung đột lợi ích | **Thật** (on-chain) |
| Bàn giao quyền deployer (sau đó Hội đồng là admin của cả hai precompile) | **Thật** |
| Token và ví quỹ multisig 3/5 trên Fuji C-Chain | **Thật** (testnet) |
| Giá `MockDEX` / `EvilDEX` | Giả lập (tỷ giá cố định, chỉ để demo) |
| Kẻ tấn công | Kịch bản dựng sẵn (attacker CLI) |
| Nạp quỹ từ C-Chain sang L1 | Giả lập: mint token + ghi sự kiện, **không có cầu nối**; contract không kiểm tra giao dịch C-Chain |
| Demo GitHub Pages | Chạy **chain giả lập trong trình duyệt**, không nối Fuji |
| Contract quỹ lương (payroll) | Đã viết và test bằng forge, mô phỏng trong backend, **chưa deploy** ([PAYROLL.md](docs/spec/PAYROLL.md)) |
| Khoá Hội đồng trong demo | Backend giữ **cả 3 khoá test** của Hội đồng để chạy kịch bản tự động; thành viên có thể tự ký bằng ví (nút "Ký bằng ví") |

## Avalanche

- **Guardian L1:** Subnet-EVM trên Fuji, chain id **845357**, validator chạy cục bộ. Không có explorer công khai nên bằng chứng là biên nhận RPC. Genesis và bàn giao: [contracts/genesis/](contracts/genesis/), [infra/l1/](infra/l1/).
- **Vì sao Avalanche:** Tx AllowList và Contract Deployer AllowList là precompile của Subnet-EVM. Khoá khẩn cấp chặn ở **tầng node**: khoá bị gỡ thì giao dịch bị từ chối trước khi vào chain, không dựa vào việc contract tự từ chối.
- **Bản nộp đóng băng** (`deployBlock` 980): các địa chỉ dưới đây khớp [fuji-l1.json](Backend/deployments/fuji-l1.json) và [fuji-c.json](Backend/deployments/fuji-c.json). Mỗi lần `demo-reset` deploy lại, nên địa chỉ cũ trong lịch sử chain thuộc bản trước.

Guardian L1 (845357):

| Contract | Địa chỉ |
|---|---|
| PrincipalRegistry | `0xB7672Fb5D3b05950f4360f49c06bC1aC907a0c13` |
| PolicyVault | `0x07127c19b2e53ea4Fec0f866F66Cb56b52596F37` |
| GuardianCouncil | `0x44e461ed1BC90D1F7ca65bEa935D3Ee98C5D916F` |
| MockDEX | `0x9ba6a1bc23d0566AdAb6bE9A44edA0eA06c563d6` |
| EvilDEX | `0x9ec823029153A58742F0199e8807511050C38e38` |
| tUSDC | `0xFba6E1c81FD048E94Bd82da658aA399E4ad88Af7` |
| tTKB | `0x51182fD9E15d06fC06e09C3780Fa2b77f05EbC7e` |
| tSCAM | `0x2342f766e85323B0C741b108aD921b7fcEA5BFF5` |
| Tx AllowList (precompile) | `0x0200000000000000000000000000000000000002` |
| Contract Deployer AllowList (precompile) | `0x0200000000000000000000000000000000000000` |

Fuji C-Chain (43113), xem trên Snowtrace:

| Thành phần | Địa chỉ |
|---|---|
| Token (CChainUSDC) | [`0x65954209aa3cf99eb77A90e55cD1dD3e94b1Fc02`](https://testnet.snowtrace.io/address/0x65954209aa3cf99eb77A90e55cD1dD3e94b1Fc02) |
| Ví quỹ (SimpleMultisig 3/5) | [`0xD000D0cE700B455A360C27c87A230F5A2c197D4D`](https://testnet.snowtrace.io/address/0xD000D0cE700B455A360C27c87A230F5A2c197D4D) |
| `escrow` | [`0xF9f119A52B11FB6b92a7fB87e3B775C17d91ef3A`](https://testnet.snowtrace.io/address/0xF9f119A52B11FB6b92a7fB87e3B775C17d91ef3A) |

`escrow` **không có mã contract, có chủ đích**: đó là địa chỉ không khoá (suy ra từ hash, không ai giữ khoá), là đích mà ví quỹ chuyển token tới khi nạp quỹ (backend đọc sự kiện `Transfer` từ ví quỹ tới địa chỉ này). Snowtrace hiện nó như tài khoản thường.

**Tự kiểm chứng** (chỉ đọc, không tốn gas). RPC của L1 là của validator cục bộ (cần chạy validator, hoặc dùng proxy chỉ-đọc `make l1-readonly-rpc`). Biên nhận deploy và kết quả đã chạy: [docs/qa/D1-D10.md](docs/qa/D1-D10.md).

    export RPC=http://127.0.0.1:9650/ext/bc/4hnXBqtkcq2uj8e3rcfGKh3NDBn3CgrWPe4tk71WQFfP4rTTb/rpc
    # chain id = 845357 (0xce62d)
    curl -s -X POST -H 'content-type: application/json' $RPC \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
    # có mã contract tại PolicyVault (kết quả khác "0x")
    curl -s -X POST -H 'content-type: application/json' $RPC \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x07127c19b2e53ea4Fec0f866F66Cb56b52596F37","latest"]}' | head -c 120
    # vai trò của Council trên hai precompile: kỳ vọng 2 (admin)
    cast call 0x0200000000000000000000000000000000000002 'readAllowList(address)(uint256)' 0x44e461ed1BC90D1F7ca65bEa935D3Ee98C5D916F --rpc-url $RPC
    cast call 0x0200000000000000000000000000000000000000 'readAllowList(address)(uint256)' 0x44e461ed1BC90D1F7ca65bEa935D3Ee98C5D916F --rpc-url $RPC
    # ví quỹ trên Fuji C-Chain có mã
    cast code 0xD000D0cE700B455A360C27c87A230F5A2c197D4D --rpc-url https://api.avax-test.network/ext/bc/C/rpc | head -c 80

Đã đọc lại ngày 2026-11-16 (chỉ đọc): cả 8 contract L1 có mã, Council đọc 2 trên cả hai precompile, ba thành viên đọc 1 (Tx) và 0 (Deployer), token và ví quỹ C-Chain có mã.

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind, React Flow, three.js / react-three-fiber |
| Backend | FastAPI, uv; `ChainPort` có hai adapter: `CHAIN_MODE=sim` (bộ nhớ) và `CHAIN_MODE=l1` (Guardian L1 thật) |
| Contract | Solidity, Foundry (`contracts/`), genesis Guardian L1 (`contracts/genesis/`, `infra/l1/`) |
| Thành phố 3D | Script Blender `bpy` (`Blender/scripts/`), xuất `.glb` vào `Frontend/public/models/city/` |
| Hạ tầng | Docker Compose, GitHub Actions (CI + GitHub Pages), pre-commit |

| Thư mục | Nội dung |
|---|---|
| `Backend/` | API FastAPI, đồ thị, mô phỏng, trợ lý đọc-chỉ, agent Cân đối, attacker CLI, adapter chain `sim` và `l1` |
| `Frontend/` | Giao diện thành phố 3D, bảng điều khiển kỹ thuật, backend giả lập chạy trong trình duyệt |
| `contracts/` | Contract Foundry, genesis Guardian L1 |
| `infra/` | Script L1 (`infra/l1/`), C-Chain, demo-reset, e2e |
| `Blender/` | Script dựng 8 công trình, file `.blend` nguồn |
| `docs/` | Tài liệu phát triển, spec, QA, ảnh minh hoạ |

## Kiểm thử

| Bộ | Kết quả |
|---|---|
| Contract (`cd contracts && FOUNDRY_PROFILE=ci forge test`) | **312 passed**, 0 failed (chạy lại 2026-11-16); line coverage 98.49%, branch 89.68% (đo trước đó) |
| Backend (`pytest`) | 960 passed, 0 failed (128 skipped: thiếu DB test hoặc khoá LLM) |
| Frontend (`vitest`) | 233 passed |
| CI (GitHub Actions) | xanh trên `main` |
| e2e cảnh 1-5 trên L1 thật | 65/65 kiểm tra, xem [docs/qa/D1-D10.md](docs/qa/D1-D10.md) |

    make test            # pytest (Backend) + vitest (Frontend)
    make lint            # ruff, eslint, tsc
    make contracts-test  # forge test

## Chạy thử

Cần `uv`, Node 22 và (tuỳ chọn) Docker.

    make setup      # cài phụ thuộc Backend + Frontend, hook pre-commit
    make dev-web    # giao diện tại http://localhost:5173 (mặc định dùng backend giả lập trong trình duyệt)
    make dev-api    # API FastAPI tại http://localhost:8000 (dùng với VITE_API_MODE=live)
    cp .env.example .env           # đặt POSTGRES_PASSWORD (docker compose cần biến này)
    docker compose up --build -d   # api :8000, web :8080
    make db-up db-migrate          # (tuỳ chọn) Postgres 16 + alembic upgrade head

Chạy stack trên Guardian L1 thật (`make l1-proxy`, `make stack-l1`, demo-reset): xem mục "The same stack on the Guardian L1" trong [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Cần validator và khoá test của chủ dự án, không có trong repo.

## Bằng chứng và ký bằng ví

- **Trang `/bang-chung`** (Bằng chứng trên chain): đọc trực tiếp từ nút Guardian L1 chain id, block mới nhất, mã của từng contract và quyền gửi giao dịch của từng khoá (0 bị chặn, 1 được gửi, 2 quản trị). Cần `VITE_L1_RPC_URL`; bản GitHub Pages chỉ hiện địa chỉ đã đóng băng, không bịa số đọc trực tiếp.
- **`make l1-readonly-rpc`**: proxy RPC chỉ-đọc (`infra/l1/readonly_rpc_proxy.py`, mặc định `127.0.0.1:9670`). Chỉ cho các lệnh đọc (`eth_call`, `eth_getCode`, `eth_getTransactionReceipt`, ...); mọi lệnh gửi giao dịch bị trả lỗi `-32601`. Muốn cho người chấm gọi từ ngoài thì chạy với `--host 0.0.0.0` trên máy có validator.
- **Hội đồng ký bằng ví**: ở cảnh Sửa và Xin thêm quyền, nút "Ký bằng ví" cho thành viên Hội đồng tự ký `approve` bằng MetaMask/Core thẳng vào `GuardianCouncil`, backend không ký thay. Bật khi chạy live với `VITE_L1_RPC_URL` và `VITE_COUNCIL_ADDRESS` (xem [Frontend/README.md](Frontend/README.md)); người trình bày tự nhập khoá test của thành viên vào ví.
- **Cảnh Sự cố**: sau khi khoá khu, thẻ "Node của Guardian L1 từ chối giao dịch" hiện nguyên văn lỗi của node, không có mã giao dịch, và 5 thẻ của anh Minh đều "bị chặn".
- **Khoá API ghi khi chạy trên L1**: stack L1 chỉ mở cổng trên `127.0.0.1`; tuỳ chọn `DEMO_SIGNING_TOKEN` bắt mọi lệnh ký phải có header `X-Demo-Token`.

## Bảo mật và giới hạn

- Mô hình đe doạ và các giới hạn đã biết (Hội đồng cố định, một người veto được mãi, `SimpleMultisig` tự viết chưa audit, ...): [SECURITY.md](SECURITY.md).
- Dữ liệu mẫu là hư cấu ("Mây Labs").

**Lưu ý pháp lý:** dự án chỉ chạy trên **testnet**; mọi token là token thử nghiệm, **không có giá trị**. Tiền mã hoá không phải phương tiện thanh toán hợp pháp tại Việt Nam. Nội dung không phải lời khuyên đầu tư hay tài chính.

## Giấy phép

Bản quyền thuộc Nostidus4, bảo lưu mọi quyền. Mã nguồn chỉ để xem trên GitHub; xem [LICENSE](LICENSE).
