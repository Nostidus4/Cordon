# Bảo mật

Cordon là sản phẩm thi (testnet, token không có giá trị), **chưa audit**, không dùng cho tiền thật. Tài liệu này nói rõ
kẻ tấn công làm được gì và chain vẫn chặn được gì. Số liệu và địa chỉ: [README.md](README.md),
[docs/qa/D1-D10.md](docs/qa/D1-D10.md). Phát hiện lỗi: mở issue trên GitHub (không đăng khoá hay dữ liệu nhạy cảm).

## Mô hình đe doạ

| Kịch bản | Kẻ tấn công làm được | Chain vẫn chặn |
|---|---|---|
| Lộ **một khoá thẻ** | Chi tối đa hạn mức ngày của thẻ đó, tới đích và giao thức trong whitelist, trong khu của thẻ | Vượt hạn mức thẻ (`KeyDailyCapExceeded`), vượt hạn mức chung của khu (`DISTRICT_DAILY_CAP`), đích hoặc giao thức ngoài whitelist; thẻ của khu khác không bị ảnh hưởng. Một thành viên Hội đồng khoá khẩn cấp: node từ chối mọi giao dịch từ các khoá của khu |
| Lộ **khoá agent** | Như một khoá thẻ: chỉ hoán đổi trong whitelist, trong hạn mức | Cùng bộ luật như thẻ; không thể nới luật, không thể tự thêm whitelist |
| **LLM bị prompt-injection** | Làm trợ lý nói sai hoặc agent đề xuất hoán đổi xấu | Trợ lý chỉ đọc, không có khoá. Agent chỉ ký bằng khoá của mình nên vẫn bị hạn mức và whitelist chặn. Số liệu trong câu trả lời không được lấy từ văn bản không tin cậy (có test prompt-injection) |
| Lộ **một thành viên Hội đồng** | Siết ngay (khoá, hạ hạn mức): gây gián đoạn. Đề xuất mở rộng, nhưng không tự duyệt được. Veto chặn đề xuất của người khác | Không nới được một mình: cần 2/3, timelock 15 s, người có xung đột lợi ích không được duyệt |
| Lộ **hai thành viên** | Duyệt được một đề xuất nới (nếu không bị người thứ ba veto trong timelock) | Timelock cho người thứ ba thời gian veto hoặc khoá khẩn cấp; hạn mức vẫn áp dụng sau khi nới. Người trong khu bị đề xuất không được duyệt (xung đột lợi ích) |
| **Backend / máy chủ bị chiếm** | **Trong demo:** backend giữ cả 3 khoá test của Hội đồng và 5 khoá chủ ví quỹ C-Chain, nên kẻ chiếm backend nới được luật (sau timelock) và rút ví quỹ | Chỉ giới hạn bởi timelock 15 s và việc đây là testnet. **Bản thật:** mỗi thành viên ký bằng ví riêng, backend không giữ khoá, timelock dài hơn |
| Lộ **khoá deployer** | Sau bàn giao: không có quyền gì. Hội đồng là admin của cả hai precompile | Deployer bị node từ chối deploy và không sửa được hai danh sách (đã kiểm: `real-checks.sh t15`) |

## Giới hạn đã biết

Mỗi mục đã đối chiếu với `contracts/src`.

1. **Hội đồng cố định, không đổi được thành viên.** `members` là `address[3]` gán trong constructor, không có hàm thêm, bớt hay thay: [GuardianCouncil.sol:61](contracts/src/GuardianCouncil.sol), [GuardianCouncil.sol:104-110](contracts/src/GuardianCouncil.sol). Mất khoá thành viên nghĩa là phải deploy lại.
2. **Một thành viên bất kỳ veto được mãi một đề xuất đã xếp hàng.** `veto` chỉ cần `onlyMember` và không kiểm xung đột: [GuardianCouncil.sol:198-204](contracts/src/GuardianCouncil.sol). Đây là chủ ý (chặn là siết) nhưng cho phép một người cản mọi thay đổi nới.
3. **`principalDailyCap == 0` nghĩa là không giới hạn** (chưa đặt): [PolicyVault.sol:57](contracts/src/PolicyVault.sol) và kiểm `cap > 0 && ps > cap` ở [PolicyVault.sol:227](contracts/src/PolicyVault.sol). Khu chưa đặt hạn mức chung chỉ còn hạn mức từng thẻ. Đặt về 0 được tính là nới ([PolicyVault.sol:187-192](contracts/src/PolicyVault.sol)).
4. **Ngày tính theo UTC:** `day = block.timestamp / 1 days` ([PolicyVault.sol:222](contracts/src/PolicyVault.sol)), nên hạn mức đặt lại lúc 07:00 giờ Việt Nam.
5. **`recordTopUp` không được kiểm với C-Chain:** chỉ Council hoặc `topUpOperator` gọi được và hàm chỉ phát sự kiện `TopUpRecorded(cChainTxHash, amount)`: [PolicyVault.sol:172-175](contracts/src/PolicyVault.sol). Không có cầu nối hay bằng chứng giao dịch.
6. **`MockDEX` là tỷ giá cố định** (mặc định 1:1, đặt lúc deploy), không phải giá thị trường: [MockDEX.sol:13](contracts/src/dex/MockDEX.sol), [MockDEX.sol:72-80](contracts/src/dex/MockDEX.sol).
7. **`SimpleMultisig` tự viết, không phải Safe, chưa audit**, chủ sở hữu và ngưỡng cố định lúc deploy, không có quản lý chủ sở hữu: [SimpleMultisig.sol:4-10](contracts/src/cchain/SimpleMultisig.sol).
8. **`PayrollGovernor` không có timelock:** đề xuất đủ phiếu thì `execute` ngay, không có độ trễ ([PayrollGovernor.sol:124](contracts/src/payroll/PayrollGovernor.sol)). Bộ payroll chưa deploy trên L1 của bản nộp này.

## Ngoài phạm vi demo

- Audit độc lập cho contract, và kiểm thử fuzz/chính thức ngoài bộ forge hiện có.
- Cầu nối C-Chain sang L1 thật; xác minh `recordTopUp` bằng bằng chứng C-Chain.
- Mỗi thành viên Hội đồng ký bằng ví riêng (hiện backend giữ khoá test); quản lý và xoay khoá Hội đồng.
- Thanh khoản và giá DEX thật; chống thao túng giá.
- Validator công khai nhiều nút, explorer công khai, giám sát và cảnh báo vận hành.
- Quản lý bí mật cho môi trường thật (HSM, KMS); mọi khoá trong repo và demo chỉ dùng cho testnet.
- Tuân thủ pháp lý (KYC/AML, giấy phép); tiền mã hoá không phải phương tiện thanh toán hợp pháp tại Việt Nam.
