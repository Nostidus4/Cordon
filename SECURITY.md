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
4. **Ngày tính theo UTC, theo ô cố định:** `day = block.timestamp / 1 days` ([PolicyVault.sol:222](contracts/src/PolicyVault.sol)), nên hạn mức đặt lại lúc 07:00 giờ Việt Nam. Vì là ô ngày cố định (không phải cửa sổ trượt 24 giờ), một khoá bị lộ chi được tới **gần 2 lần hạn mức** trong vài phút quanh mốc đặt lại (hết hạn mức lúc 06:59, rồi lại đủ hạn mức lúc 07:00). Hạn mức chung của khu bị giới hạn y như vậy. Cách sửa (cửa sổ trượt) đổi interface đã đóng băng nên để sau.
5. **`recordTopUp` không được kiểm với C-Chain:** chỉ Council hoặc `topUpOperator` gọi được và hàm chỉ phát sự kiện `TopUpRecorded(cChainTxHash, amount)`: [PolicyVault.sol:172-175](contracts/src/PolicyVault.sol). Không có cầu nối hay bằng chứng giao dịch.
6. **`MockDEX` là tỷ giá cố định** (mặc định 1:1, đặt lúc deploy), không phải giá thị trường: [MockDEX.sol:13](contracts/src/dex/MockDEX.sol), [MockDEX.sol:72-80](contracts/src/dex/MockDEX.sol).
7. **`SimpleMultisig` tự viết, không phải Safe, chưa audit**, chủ sở hữu và ngưỡng cố định lúc deploy, không có quản lý chủ sở hữu: [SimpleMultisig.sol:4-10](contracts/src/cchain/SimpleMultisig.sol).
8. **`PayrollGovernor` không có timelock:** đề xuất đủ phiếu thì `execute` ngay, không có độ trễ ([PayrollGovernor.sol:124](contracts/src/payroll/PayrollGovernor.sol)). Bộ payroll chưa deploy trên L1 của bản nộp này.
9. **Đề xuất không có hạn hết hiệu lực.** Một đề xuất nới đã đủ phiếu và qua timelock có thể được `execute` rất lâu sau đó ([GuardianCouncil.sol:187-194](contracts/src/GuardianCouncil.sol)); thành viên nên veto hoặc huỷ đề xuất cũ thay vì để treo.
10. **Đề xuất toàn cục không có người "bị ảnh hưởng" để kiểm xung đột lợi ích.** Với các lệnh không gắn khu nào (thêm token/giao thức/người nhận vào whitelist, `unpauseAll`, `setTopUpOperator`), danh sách khu bị ảnh hưởng rỗng nên bước chặn xung đột lợi ích không áp dụng ([GuardianCouncil.sol:146](contracts/src/GuardianCouncil.sol), [GuardianCouncil.sol:162-167](contracts/src/GuardianCouncil.sol)). Các lệnh này vẫn cần 2/3 và timelock.
11. **API demo không phân biệt thành viên.** Ở `DEMO_MODE`, các endpoint ký (duyệt, veto, khoá…) nhận tên thành viên trong body; bảo vệ là chế độ demo chỉ bật trên chain test, mã `X-Demo-Token` dùng chung (nếu đặt), giới hạn tần suất và nhật ký ([core/demo_guard.py](Backend/src/guardian/core/demo_guard.py)). Ai có mã demo thì ký được thay mọi thành viên. Nút "Ký bằng ví" là đường ký đúng nghĩa: chữ ký từ ví của chính thành viên.
12. **L1 chỉ có một validator** (máy ảo Azure, [infra/l1/AZURE.md](infra/l1/AZURE.md)). Validator dừng thì chain dừng (không ai chi được, tức là "đóng an toàn"), nhưng cũng không ai siết được cho tới khi node chạy lại. Người chiếm được máy ảo có khoá validator nhưng không có khoá Hội đồng hay khoá thẻ: không đổi được luật hay chuyển tiền, chỉ làm chain dừng. API của node chỉ nghe trong máy; ra ngoài chỉ có proxy chỉ-đọc.

## Ngoài phạm vi demo

- Audit độc lập cho contract, và kiểm thử fuzz/chính thức ngoài bộ forge hiện có.
- Cầu nối C-Chain sang L1 thật; xác minh `recordTopUp` bằng bằng chứng C-Chain.
- Mỗi thành viên Hội đồng ký bằng ví riêng (hiện backend giữ khoá test); quản lý và xoay khoá Hội đồng.
- Thanh khoản và giá DEX thật; chống thao túng giá.
- Nhiều validator (hiện một nút trên Azure, RPC chỉ-đọc công khai), explorer công khai, giám sát và cảnh báo vận hành.
- Quản lý bí mật cho môi trường thật (HSM, KMS); mọi khoá trong repo và demo chỉ dùng cho testnet.
- Tuân thủ pháp lý (KYC/AML, giấy phép); tiền mã hoá không phải phương tiện thanh toán hợp pháp tại Việt Nam.
