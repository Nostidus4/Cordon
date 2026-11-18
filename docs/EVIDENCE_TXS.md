# Giao dịch mẫu trên Guardian L1 (bằng chứng kiểm được)

Guardian L1 (Avalanche Subnet-EVM trên Fuji, chain id 845357) có RPC công khai **chỉ đọc**:

```
RPC=https://cordon-guardian-l1.eastasia.cloudapp.azure.com
```

Mọi giao dịch dưới đây là giao dịch thật đã nằm trong block. Ai cũng kiểm lại được bằng Foundry, không cần tin vào demo. Danh sách này cũng hiện ở trang `/bang-chung` (mục "Giao dịch mẫu trên chain"), nơi trang tự đọc biên nhận từng mã băm.

## Cách kiểm

```bash
export RPC=https://cordon-guardian-l1.eastasia.cloudapp.azure.com
cast receipt 0xbfce471d5e5ae90f19a6e273d826b7fefdaba6a73e28fd1b0ca7543f04c2a7ee --rpc-url $RPC
```

Đã chạy thật, trích đoạn:

```
blockNumber          1048
from                 0xEd6d12320c8c53A2D059A4af14dCfDc0f340a1E2
gasUsed              57317
logs                 []
status               0 (failed)
to                   0x07127c19b2e53ea4Fec0f866F66Cb56b52596F37
```

Chỉ lấy một trường: `cast receipt <hash> status --rpc-url $RPC` (trả `true` hoặc `false`), `blockNumber`, `gasUsed`. Giao dịch thành công thì `logs` có sự kiện. Mã sự kiện đối chiếu bằng `cast sig-event "Paid(address,bytes32,address,address,uint256,uint256,uint256,uint256,bytes32)"` (ra `0xc338544f…`, đúng `topics[0]` của giao dịch 2).

Hạn chế của RPC chỉ đọc, đã thử thật:
- `cast run <hash>` **không chạy được** (proxy chặn `eth_gasPrice`, `debug_traceTransaction`).
- Nút chỉ giữ trạng thái các block gần nhất (`missing trie node` khi gọi `--block 1047`), nên giao dịch cũ bị chặn không chạy lại đúng tại thời điểm đó được. Lý do bị chặn của chúng được đọc từ (1) chuỗi giao dịch trước đó, (2) gas used trùng khớp với giao dịch cùng loại chạy lại được, (3) chạy lại ở trạng thái hiện tại khi trạng thái chưa đổi (hàng 4, 5, 11).

## Quét lịch sử chain

Quét thật các block 0 đến 1111 (đầu chuỗi lúc quét là 1111): **1.111 giao dịch**, **24 bị revert**, còn lại thành công. Chain đã chứa 18 bộ hợp đồng (các lần chạy thử và quay demo trước bộ hiện tại), nên cùng một loại giao dịch xuất hiện nhiều lần.

| Loại revert | Số lượng | Cách xác định lý do |
|---|---|---|
| Người nhận ngoài danh sách (`RecipientNotAllowed`) | 8 | gas 52.261 trùng khớp; chạy lại được ở bộ khối 59 và bộ khối 125 |
| Giao thức/sàn không được phép (`ProtocolNotAllowed`) | 8 | gas 51.268 trùng khớp; chạy lại được ở bộ khối 59, 125, 908 |
| Vượt hạn mức chung của khu (`PrincipalDailyCapExceeded`) | 6 | gas 57.317; suy ra từ số tiêu cộng dồn trong sự kiện (hàng 3) |
| Xung đột lợi ích (`ConflictOfInterest`) | 2 | chạy lại được bằng `cast call` |

Bộ hợp đồng hiện tại (khối 1057, `Backend/deployments/fuji-l1.json`) đang ở trạng thái sạch của cảnh 1, nên **không có revert** ở bộ này; các minh chứng "bị chặn" nằm ở bộ cũ.

## Bảng giao dịch mẫu

Bộ khối 980: PolicyVault `0x07127c19b2e53ea4Fec0f866F66Cb56b52596F37`, GuardianCouncil `0x44e461ed1BC90D1F7ca65bEa935D3Ee98C5D916F` (lần chạy cảnh 4 và 5 trên cùng chain). Bộ khối 59: PolicyVault `0x19415a753D1cE9FC3C9F385879F5Ca250Eb50efD`. Lệnh ở cột cuối thêm `--rpc-url $RPC`.

| # | Chứng minh | Khối | Mã băm | Hợp đồng (bộ) | Kết quả | Lệnh |
|---|---|---|---|---|---|---|
| 1 | Khoá của Trợ lý Cân đối đổi 5.000 tUSDC sang tTKB qua sàn đối tác: được phép | 1043 | `0x33f080eed50e8e3bbc61f2d7decf3d361aba85ac3e9f2f9679daba4596c31d90` | PolicyVault (980) | status 1; `Swapped` (amountIn 5.000, principalSpentAfter 5.000) | `cast receipt <hash>` |
| 2 | Khoá Trợ lý Dữ liệu trả 10.000 cho người nhận trong danh sách | 1046 | `0xde126e689587f7667322a122ccfdbe9e220130dc227254c2ba62c8ac088037e3` | PolicyVault (980) | status 1; `Paid` (amount 10.000, principalSpentAfter 15.000) | `cast receipt <hash>` |
| 3 | Hạn mức chung của khu: khu đã tiêu 25.000/30.000 (xem `Paid` ở khối 1047: principalSpentAfter 25.000), khoản trả thêm 10.000 bị từ chối | 1048 | `0xbfce471d5e5ae90f19a6e273d826b7fefdaba6a73e28fd1b0ca7543f04c2a7ee` | PolicyVault (980) | status 0; `PrincipalDailyCapExceeded` (suy ra: 25.000 + 10.000 > 30.000; khoá này mới tiêu 0 nên không phải hạn mức thẻ; gas 57.317, cao hơn hai lần chặn whitelist nên qua hết kiểm tra token/người nhận) | `cast receipt <hash> status` |
| 4 | Whitelist người nhận: khoá Thanh toán quốc tế trả cho ví lạ | 115 | `0x94d750ebe613592dbd4b7c755316a986a9278f992c15055f88a828fb21b1fa45` | PolicyVault (59) | status 0; `RecipientNotAllowed` (selector `0x4ccc1eec`). Cùng giao dịch ở bộ 980 là khối 1044, gas giống hệt 52.261 | xem "Chạy lại" bên dưới |
| 5 | Whitelist giao thức: khoá Cân đối đổi qua sàn giả mạo (EvilDex) | 116 | `0x4d99b1f27161d1f03adab20e8e8269223ee56c7cf9395a928d85ec615dd73d00` | PolicyVault (59) | status 0; `ProtocolNotAllowed`. Cùng loại ở bộ 980 là khối 1045, gas 51.268 | như hàng 4 |
| 6 | Khoá khẩn cấp bởi **một** thành viên Hội đồng (chị Lan) | 1049 | `0x50555bcd7b51413bfc26023a5abd32c78a35a0ae3858a8867d05648f0437f464` | GuardianCouncil (980) + Tx AllowList `0x0200…0002` | status 1; `EmergencyAction(member=Lan, "lockPrincipal")`, `PrincipalLocked`, 5 sự kiện `RoleSet(role=0, old=1)` cho 5 khoá của khu Minh | `cast receipt <hash> --json` |
| 7a | Nới hạn mức chung 30.000 lên 130.000: mở đề xuất số 12 | 1037 | `0xaff93c17f1641020294f7cd9f87f4af465208b85ff06562832da4a8e27d0aeb2` | GuardianCouncil (980) | status 1; `Proposed` | `cast receipt <hash>` |
| 7b | Phiếu thứ nhất (chị Trang) | 1050 | `0x923da7c115512a6bf8778266f74cf3ac3474605ae1e50c410f3ad3273c169584` | GuardianCouncil (980) | status 1; `Approved`, chưa có `Queued` | như trên |
| 7c | Phiếu thứ hai (chị Lan) đủ 2/3, vào hàng chờ | 1051 | `0x26661338eeed519ba0424465a2cc5b3f1a280e37d786b7eb6d43612540440131` | GuardianCouncil (980) | status 1; `Approved` + `Queued(eta=1794923143)`, trễ 15 giây | như trên |
| 7d | Hết độ trễ, thi hành | 1052 | `0x865f6e2320a56e675820c62fff866efbf05e6465557d2fc160aee194a3a22b2a` | GuardianCouncil (980) + PolicyVault | status 1; `CapChanged(30.000 → 130.000)`, `PolicyVersionBumped`, `Executed` | như trên |
| 8 | Xung đột lợi ích: anh Huy tán thành đề xuất giao khoá cho khu của chính mình | 901 | `0xbb2d146f0b4834b886559b5c78ba0576f0d55cb940e71a9bb0c177eadef81ec3` | GuardianCouncil `0xe5a4f0da66836cb79fac4618101c8cff5e49ab02` (bộ đăng từ khối 835) | status 0; `ConflictOfInterest` (selector `0x8d803ad9`) | xem "Chạy lại" |
| 9 | Bàn giao quyền quản trị luật gửi giao dịch cho Hội đồng (từ ví triển khai) | 25 | `0xfddcbc6307c5f9a53dcf5657451e3f36b386e67c86bc729471f8ca99e3525b66` | Tx AllowList `0x0200…0002` (Hội đồng đầu tiên `0xda823ca3…`, bộ đăng từ khối 3) | status 1; `RoleSet(role=2, account=Hội đồng)` | `cast receipt <hash> --json` |
| 10 | Hội đồng cũ **biểu quyết 2/3** rồi bàn giao quyền quản trị cả hai luật chain cho Hội đồng của bộ hiện tại (khối 1057) | 1089 | `0x8a350e3884b737a6c6b29384226720201a25c6586cc04414097da6ca5cfb08cb` | GuardianCouncil (980) thi hành, đích: Council `0x09BaacAa…57bC` | status 1; 4 sự kiện `RoleSet`: Council mới role 2 (hai precompile), Council cũ về 0 | như trên |

Ngoài ra, ở bộ hiện tại (khối 1057) đường 2/3 chạy đầy đủ: đề xuất khối 1068, phiếu 1069 và 1070 (`0x200dfc58e35c80afc5f4a288cb87142cd1eea8b8fa9e0f04272183f31bf39a70`, có `Queued`), thi hành khối 1076 (`0xcf8e5856dac36bae4e982b6768daeb606afc187b956d85aad74f5347b5a7f1b0`, `PrincipalCreated`, `KeyAdded`, `CapChanged`, `AllowChanged`). Đề xuất nới hạn mức (số 12) và giao khoá (số 13) đang mở, chờ cảnh 5 (khối 1110, 1111).

### Chạy lại (hàng 4, 5, 8)

Trạng thái hiện tại của các bộ này còn đọc được, nên gửi lại đúng dữ liệu bằng `eth_call` (không ghi gì lên chain) cho ra đúng lỗi. Đã chạy thật:

```bash
D=$(cast tx 0x94d750ebe613592dbd4b7c755316a986a9278f992c15055f88a828fb21b1fa45 input --rpc-url $RPC)
cast call 0x19415a753D1cE9FC3C9F385879F5Ca250Eb50efD "$D" --from 0x576Cc913b7A658332a4B85aA87257750cad3bB2E --rpc-url $RPC
# Error: execution reverted: RecipientNotAllowed  (data: "0x4ccc1eec")

D=$(cast tx 0xbb2d146f0b4834b886559b5c78ba0576f0d55cb940e71a9bb0c177eadef81ec3 input --rpc-url $RPC)
cast call 0xe5a4f0da66836cb79fac4618101c8cff5e49ab02 "$D" --from 0xf9eed7Fdd84cd3D31975846507ca95d2FF0C1e7F --rpc-url $RPC
# Error: execution reverted: ConflictOfInterest  (data: "0x8d803ad9")
```

Lưu ý: chạy lại giao dịch hàng 1048 hay 1044 ở trạng thái hiện tại cho ra `PrincipalIsLocked`, vì khu đó bị khoá sau đó (hàng 6) và kiểm tra khoá nằm trước kiểm tra hạn mức. Đó là lý do hàng 3 dùng suy luận từ số liệu `Paid` thay vì chạy lại.

## Không có mã băm: giao dịch của khoá bị khoá

Sau hàng 6, năm khoá của khu Minh có vai trò 0 ở Tx AllowList. Giao dịch từ khoá đó bị **nút từ chối ngay từ cửa**, không vào mempool, không vào block, nên không có mã băm và không có biên nhận để tra. Bằng chứng gián tiếp:

1. Hàng 6: năm sự kiện `RoleSet(role=0, old=1)` cho đúng năm khoá, do Hội đồng (không phải khoá nào khác) gọi.
2. Đọc vai trò bằng `readAllowList` (đọc được ở trạng thái hiện tại; trạng thái ngay sau khối 1049 đã bị nút dọn nên `--block 1049` không đọc được):

```bash
cast call 0x0200000000000000000000000000000000000002 "readAllowList(address)(uint256)" 0xd5B1EDf1710CAEb8B9b5e6c77BE4Db7DCAEecC67 --rpc-url $RPC
# 1   (hiện được gửi: Hội đồng đã mở khoá lại khi dựng lại demo, khối 1088)
cast call 0x0200000000000000000000000000000000000002 "readAllowList(address)(uint256)" 0x09BaacAaFE18487e297f61859Aca6407cD8257bC --rpc-url $RPC
# 2   (Council hiện tại là quản trị, hàng 10)
```

Khi quay cảnh 4 trên bộ hiện tại, đọc lại `readAllowList` của năm khoá sẽ ra 0 (trang `/bang-chung`, mục "Khoá ở tầng giao thức", đọc trực tiếp việc này).

## Chưa tìm thấy trên chain

- **Từ chối do token ngoài danh sách** (`TokenNotAllowed`) và **hạn mức thẻ** (`KeyDailyCapExceeded`): không có giao dịch nào revert vì hai lý do này.
- **Phủ quyết** (`Vetoed`): không có sự kiện nào (đã `eth_getLogs` toàn dải 0 đến 1111).
- **Hạn mức chung ở bộ hiện tại**: chưa có (xem trên); minh chứng nằm ở bộ khối 980 và cũ hơn, và lý do ở hàng 3 là suy ra, không phải bytes lỗi đọc trực tiếp.
- **Xung đột lợi ích ở bộ 980 hoặc bộ hiện tại**: chỉ có ở hai bộ cũ (khối 829 và 901).
