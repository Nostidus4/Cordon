# Cordon: cho ai, khác gì, đi tiếp thế nào

Tài liệu cho người chấm và đối tác. **Không có phỏng vấn người dùng, khách hàng hay pilot nào** được thực hiện; persona bên dưới là minh hoạ dựng từ bối cảnh công khai, các giả định được liệt kê ở mục 7. Trạng thái thật/giả lập của hệ thống: xem [README](../README.md#thật-hay-giả-lập) và [SECURITY.md](../SECURITY.md).

## 1. Vấn đề

Ví công ty giờ có nhiều "bàn tay": nhân viên vận hành, thẻ chi tiêu, và AI agent. Mỗi bàn tay giữ một chìa; một chìa lộ thì thiệt bao nhiêu thường không ai tính trước.

- Năm 2025 trộm cắp tiền mã hoá vượt **3,4 tỷ USD**; ba vụ lớn nhất chiếm 69% thiệt hại ở cấp dịch vụ.[^1]
- Chiếm đoạt **ví cá nhân**: 158.000 vụ năm 2025, gần gấp ba mức 54.000 của 2022, ảnh hưởng ít nhất 80.000 nạn nhân (tổng giá trị 713 triệu USD).[^1]
- **AI agent có quyền ví** đã bị khai thác: tháng 5/2026 một ví Bankr nối với Grok bị rút khoảng **174.000 USD** (3 tỷ token DRB; một phần được trả lại). Kẻ tấn công chuyển một NFT có quyền chức năng, giấu lệnh trong nội dung công khai; mô hình giải mã và lặp lại lệnh, rồi lớp tự động hoá thực thi nó như lệnh tài chính hợp lệ.[^2] Bài báo rút ra: hệ thống đọc và tóm tắt thông tin không nên nằm chung ranh giới bảo mật với hệ thống thực thi giao dịch.
- Việt Nam đứng **hạng 4** trong Chainalysis Global Crypto Adoption Index 2025 (sau Ấn Độ, Mỹ, Pakistan), nên đây không phải bài toán xa lạ với người làm sản phẩm Web3 trong nước.[^3]

Chúng tôi không có số liệu về mức thiệt hại của doanh nghiệp Việt Nam và không suy diễn ra từ số toàn cầu.

## 2. Hai persona minh hoạ (không phải người dùng thật)

Dựng từ bối cảnh công khai ở mục 1 và 5; mọi chi tiết "một ngày" là giả định.

| | **Studio Web3 / startup fintech ở TP.HCM** | **Quỹ của câu lạc bộ / DAO sinh viên** |
|---|---|---|
| Ai | Đội vận hành 5–15 người, vài thẻ chi tiêu, một agent cân đối quỹ, chi từ ví công ty trên Avalanche | Quỹ nhỏ của câu lạc bộ, ban chủ nhiệm 3–5 người giữ chung một ví, nhận tài trợ và trả giải thưởng |
| Một ngày (giả định) | Trả nhà cung cấp, nạp thẻ marketing, agent hoán đổi stablecoin giữ thanh khoản, cuối tháng chi lương | Chi giải thưởng, mua dịch vụ, hoàn tiền người tham gia |
| Rủi ro | Một khoá thẻ hoặc khoá agent lộ có thể rút hết ví chung; LLM bị chèn lệnh có thể "thuyết phục" agent | Một thành viên bị chiếm máy là đủ mất cả quỹ; khó phân biệt "người duyệt" với "người hưởng lợi" |
| Cordon đổi gì | Mỗi thẻ/agent thuộc một **khu** có hạn mức ngày riêng; lộ một chìa chỉ thiệt trong khu đó; khoá khẩn cấp ở tầng node | Hội đồng 2/3, người liên quan không được tự duyệt, siết thì một người làm được ngay |
| Cảnh trong demo | **Thử** (bạn nghĩ / chain chặn / ước tính), **Sự cố** (khoá khẩn cấp), tab Agent AI ở `/he-thong` | **Sửa** và **Xin thêm quyền** (đề xuất, duyệt 2/3, chặn xung đột lợi ích) |

Dữ liệu mẫu trong demo ("Mây Labs", Minh, Huy) là hư cấu.

## 3. Chúng tôi thêm gì so với đề gợi ý #12 / #13 / #14 / #21

Cột "đề hỏi gì" tóm theo tên đề của ban tổ chức (đề đầy đủ không nằm trong repo).

| Đề | Đề hỏi gì (theo tên) | Cordon thêm | Ở đâu |
|---|---|---|---|
| #12 Agent treasury có guardrail on-chain | Agent chi quỹ nhưng bị luật on-chain giới hạn | (1) **Khu**: hạn mức chung của cả nhóm khoá ngoài hạn mức từng thẻ, nên lộ một khoá chỉ thiệt trong khu; (2) **bất đối xứng siết/nới**: siết ngay bởi một thành viên, nới cần 2/3 + timelock 15 s + chặn xung đột lợi ích, không có đường tự động nào nới; (3) **khoá khẩn cấp ở tầng node** bằng Tx AllowList: node từ chối giao dịch, không có tx hash; (4) Hội đồng là admin của Tx AllowList và Contract Deployer AllowList; (5) agent Cân đối: số tiền do rule engine quyết, LLM chỉ viết lý do | `contracts/src/PolicyVault.sol`, `GuardianCouncil.sol`, `PrincipalRegistry.sol`; `Backend/src/guardian/agent_rebalance/`; cảnh Sự cố, Sửa |
| #13 DeFi Copilot (+ precompile) | Trợ lý AI cho DeFi | Trợ lý **chỉ đọc**, số liệu qua `verifier`; Copilot chỉ **soạn nháp**, gửi bắt buộc qua xác nhận của người; nháp vẫn bị cùng bộ luật chain chặn. Precompile Tx/Deployer AllowList là lớp thi hành thật | `Backend/src/guardian/assistant/`, [CITY_OPS.md](spec/CITY_OPS.md) §8, `Frontend/src/stage/CopilotPanel.tsx` |
| #14 Tx Guardian | Soi giao dịch trước khi ký | Giả lập + 5 luật thuần (chỉ thêm cảnh báo, không bao giờ nới) + giải thích tiếng Việt, **nối với mô hình rủi ro**: "bạn nghĩ / chain chặn / ước tính thiệt hại" | `Backend/src/guardian/txguard/`; cảnh Thử |
| #21 PayrollFloat | Quỹ lương gửi tạm kiếm lãi, rút kịp ngày lương | Agent chỉ `allocate`/`unwind` vào venue whitelist, không có tham số người nhận; rút bậc thang về trước T-1; công tắc khẩn cấp. **Đã test bằng forge, chưa deploy lên L1** | `contracts/src/payroll/`, [PAYROLL.md](spec/PAYROLL.md), `Backend/src/guardian/agent_float/` |

Điểm chung mà các đề rời nhau không có: **một bộ luật** áp cho mọi nơi tiêu tiền (thẻ, agent, copilot, quỹ lương), và **thành phố 3D** dựng từ dữ liệu thật để người không chuyên thấy ngay ai giữ chìa nào và chỗ nào đang có rủi ro.

## 4. So với sản phẩm hiện có

Chỉ ghi điều đã đọc trong tài liệu chính thức của họ (mục Nguồn). Những sản phẩm này **đã chạy production, đa chain, có khách hàng**; Cordon là bản thi trên testnet, chưa audit.

| Sản phẩm | Thi hành ở đâu | Họ mạnh ở | Cordon khác |
|---|---|---|---|
| Safe + Zodiac Roles[^4][^5] | Module contract on-chain gắn vào Safe: giới hạn địa chỉ đích, hàm, tham số, tần suất | Chuẩn thị trường, đa chain, hệ sinh thái lớn | Cùng tầng contract; Cordon thêm hạn mức chung theo khu, siết/nới bất đối xứng có phân loại on-chain, chặn xung đột lợi ích |
| Coinbase CDP Policies / Spend Permissions[^6][^7] | Policies: chấp nhận/từ chối theo đích, giá trị, mạng (nơi đánh giá không nêu trong trang đã đọc). Spend Permissions: contract on-chain trên Smart Account, hạn mức theo token và chu kỳ | Tích hợp sẵn với API/ví Coinbase, dùng ngay cho agent | Khoá khẩn cấp ở tầng node trên L1 riêng, mô hình khu |
| Turnkey[^8] | Policy engine chạy trong secure enclave (TEE) | Khoá không rời enclave, có bằng chứng quyết định | Luật do chain thi hành, ai cũng kiểm lại được; Cordon không giữ khoá |
| Privy[^9] | Enclave (TEE) đánh giá policy trước khi ký hoặc xuất khoá | Ví nhúng cho ứng dụng, dễ tích hợp | Như trên |
| Fireblocks TAP[^10] | Quy tắc cho workspace trên hạ tầng MPC của Fireblocks | Chuẩn tổ chức lớn, phê duyệt trưởng thành | Luật on-chain công khai, không phụ thuộc nhà cung cấp; Fireblocks mạnh hơn nhiều về vận hành và tuân thủ |
| Lit Protocol[^11] | Lit Actions chạy trong mạng TEE phi tập trung, quyền dùng khoá quản trị on-chain | Ký và logic điều kiện đa chain | Lit quyết định "có ký không"; Cordon quyết định "chain có nhận không" |
| ERC-7579 / session key[^12] | Module (validator, executor, hook) trong smart account | Chuẩn mở, tương thích nhiều ví | Cordon chưa dùng smart account; đây là hướng mở rộng (mục 6) |

Cordon chỉ dựa vào bốn điểm: (a) kill switch ở **giao thức** (Tx AllowList, node từ chối); (b) hạn mức **khu** giới hạn bán kính thiệt hại; (c) siết/nới bất đối xứng kèm xung đột lợi ích; (d) mô hình hiển thị rủi ro. Cái giá: phải chạy một L1 riêng, điều mà các sản phẩm trên không đòi hỏi.

## 5. Ai trả tiền, mô hình (giả thuyết, chưa kiểm chứng)

Chưa có doanh thu, khách hàng hay thử nghiệm. Hướng chúng tôi cho là hợp lý:

- **Phí thiết lập** một Avalanche L1 có sẵn policy precompile, Hội đồng và bộ contract (dịch vụ triển khai một lần).
- **SaaS theo L1/tổ chức** cho bảng điều khiển (thành phố 3D, mô hình rủi ro, Agent AI, cảnh báo).
- Bên trả tiền tiềm năng: doanh nghiệp Web3 hoặc đội vận hành có agent chi tiền. Chưa biết họ có sẵn lòng chạy hoặc thuê một L1 riêng hay không.

**Giới hạn pháp lý:** hiện chỉ chạy **testnet**, token không có giá trị. Luật Công nghiệp công nghệ số (có hiệu lực từ 1/1/2026) công nhận tài sản mã hoá là một loại tài sản số nhưng không công nhận là tiền pháp định hay phương tiện thanh toán.[^13] Nghị quyết 05/2025/NQ-CP (hiệu lực 9/9/2025, thí điểm 5 năm) quy định tài sản mã hoá dùng để trao đổi hoặc đầu tư, giao dịch bằng đồng Việt Nam, và chỉ tổ chức được Bộ Tài chính cấp phép mới được cung cấp dịch vụ liên quan.[^14] Dùng Cordon với tiền thật ở Việt Nam cần tư vấn pháp lý trước; chúng tôi chưa làm.

## 6. Lộ trình sau hackathon

1. **Mỗi thành viên Hội đồng ký bằng ví riêng** (backend không giữ khoá), timelock dài hơn, quản lý thay thành viên (hiện cố định, xem SECURITY.md giới hạn 1).
2. **Cầu nối ICM giữa C-Chain và L1** cho quỹ (hiện nạp quỹ là giả lập), kiểm `recordTopUp` bằng bằng chứng C-Chain.
3. **Audit độc lập** contract, rồi chạy **nhiều validator** công khai kèm explorer và giám sát. Chỉ sau đó mới cân nhắc pilot, kèm tư vấn pháp lý.

## 7. Giả định cần kiểm chứng (chưa phỏng vấn ai)

| # | Giả định | Cách kiểm |
|---|---|---|
| A1 | Doanh nghiệp/đội Web3 Việt Nam thật sự để agent hoặc nhiều người cùng chi từ ví chung | Phỏng vấn, khảo sát (chưa làm) |
| A2 | Họ coi "một khoá lộ thì thiệt tối đa bao nhiêu" là nỗi đau đủ lớn để trả tiền | Phỏng vấn |
| A3 | Họ chấp nhận chạy hoặc thuê một Avalanche L1 riêng thay vì module trên chain sẵn có | Thử với 1–2 đội, so chi phí với Safe + Zodiac |
| A4 | Hội đồng 3 người, 2/3 đủ cho quy mô và quy trình của họ | Phỏng vấn, thử |
| A5 | Persona ở mục 2 phản ánh ngày làm việc thật | Chưa có; chỉ là minh hoạ |
| A6 | Phí thiết lập + SaaS là mô hình hợp lý | Chưa có tín hiệu thị trường |
| A7 | Có đường tuân thủ để dùng tiền thật tại Việt Nam | Cần ý kiến luật sư |

## Nguồn

Truy cập ngày 2026-11-18. Mỗi con số trong tài liệu lấy từ trang đã mở.

[^1]: Chainalysis, thống kê trộm cắp 2025: https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/ ("Over $3.4 billion in theft from January through early December 2025"; "The top three hacks in 2025 account for 69% of all service losses"; "158,000 incidents in 2025, nearly triple the 54,000 recorded in 2022"; "at least 80,000" victims; "$713 million in 2025").
[^2]: Cointelegraph, vụ ví Bankr nối Grok (13/5/2026): https://cointelegraph.com/news/grok-bankr-wallet-free-nft-prompt-injection
[^3]: Chainalysis, 2025 Global Crypto Adoption Index: https://www.chainalysis.com/blog/2025-global-crypto-adoption-index/ (Vietnam hạng 4; top 5: Ấn Độ, Mỹ, Pakistan, Việt Nam, Brazil). Xem thêm VnEconomy (4/9/2025): https://en.vneconomy.vn/vietnam-ranks-fourth-globally-in-crypto-adoption.htm
[^4]: Safe Modules: https://docs.safe.global/advanced/smart-account-modules
[^5]: Zodiac Roles Modifier: https://docs.roles.gnosisguild.org/
[^6]: Coinbase CDP policies: https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/overview
[^7]: Coinbase Spend Permissions: https://docs.cdp.coinbase.com/wallet-api/v2/evm-features/spend-permissions
[^8]: Turnkey: https://docs.turnkey.com/security/secure-enclaves và https://docs.turnkey.com/concepts/policies/overview
[^9]: Privy policies: https://docs.privy.io/controls/policies/overview
[^10]: Fireblocks: https://developers.fireblocks.com/docs/capabilities và https://fireblocks.com/platforms/governance-policy-engine/
[^11]: Lit Protocol: https://developer.litprotocol.com/
[^12]: ERC-7579: https://eips.ethereum.org/EIPS/eip-7579
[^13]: Allen & Gledhill, 9/10/2025: https://www.allenandgledhill.com/perspectives/articles/31332/vnkh-establishes-digital-technology-framework-and-launches-crypto-asset-market-pilot-program (Luật có hiệu lực 1/1/2026; tài sản mã hoá không phải tiền pháp định hay phương tiện thanh toán)
[^14]: LuatVietnam, Nghị quyết 05/2025/NQ-CP: https://english.luatvietnam.vn/legal-updates/resolution-on-piloting-the-crypto-trading-market-in-vietnam-for-five-years-892-103974-article.html ("five years from the effective date"; "Only entities licensed by the Ministry of Finance may provide services")
