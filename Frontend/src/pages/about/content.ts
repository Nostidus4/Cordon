// Static About content: vault model, how Cordon works, legal notes, protection limits (spec §10.7, §12, §3).
import { BRAND } from "../../config/brand";

export const ABOUT_HERO = {
  eyebrow: "Mô hình & pháp lý",
  title: "Quỹ chính ở xa tầm tay. Kho chi tiêu có rào chắn.",
  lead: `${BRAND.name} không giữ tiền của bạn. Nó đặt một lớp luật ở tầng giao thức lên mọi thẻ chi tiêu: ai cũng thấy ai điều khiển thẻ nào, thử trước khi chuyện xấu xảy ra, và siết chỉ bằng một nút.`,
};

export const VAULT_MODEL = {
  title: "Mô hình kho chi tiêu",
  en: "Vault model",
  note: "Chỉ phần tiền cần chi mỗi ngày nằm trong kho. Quỹ chính vẫn ở Safe đa chữ ký.",
  main: { chain: "C-Chain · Avalanche Fuji", name: "Safe 3/5", role: "Quỹ chính", fallback: "2.000.000", token: "tUSDC", sub: "P0 chỉ để hiển thị và làm nguồn nạp" },
  topup: { label: "nạp mô phỏng", chip: "P1: thay bằng ICTT" },
  vault: { chain: "Guardian L1 · kho chi tiêu", name: "PolicyVault", fallback: "200.000", token: "tUSDC", sub: "rule engine chạy trong node, không phải trong giao diện" },
  council: { name: "Hội đồng 2/3", members: ["Trang", "Lan", "Huy"], rule: "siết: 1 người · nới: 2/3 · AI: 0 quyền" },
  districts: [
    { name: "Khu Minh", detail: "5 thẻ · chung 30.000/ngày", tone: "ok" as const },
    { name: "Khu Huy", detail: "2 thẻ · 20.000/thẻ", tone: "info" as const },
    { name: "Khu Lan", detail: "1 thẻ · 10.000/ngày", tone: "info" as const },
    { name: "Khu Hội đồng", detail: "tuỳ chọn · cảnh 5", tone: "dashed" as const },
  ],
  recipients: { ok: ["vendor_data_api", "vendor_cloud", "vendor_intl_design"], blocked: "stranger_wallet" },
};

export const HOW_IT_WORKS = {
  title: "Cordon hoạt động thế nào",
  en: "Map → Simulate → Cordon",
  steps: [
    { n: 1, key: "map", to: "/map", name: "Map", vi: "Nhìn", text: "Vẽ ai thật sự điều khiển thẻ nào, gồm cả quan hệ tự khai chưa kiểm chứng. Cờ vàng báo chỗ một người giữ nhiều thẻ mà không có trần chung." },
    { n: 2, key: "simulate", to: "/simulate", name: "Simulate", vi: "Thử", text: "“Nếu người này bị chiếm thì mất tối đa bao nhiêu mỗi ngày?” Enforced là chain chặn thật; Estimated là khi quan hệ tự khai đúng." },
    { n: 3, key: "cordon", to: "/requests", name: "Cordon", vi: "Khoá trần", text: "Gom mọi thẻ vào một khu có hạn mức chung, whitelist token, sàn và người nhận, cộng kill switch ở tầng giao thức. Nới quyền cần 2/3 Hội đồng." },
  ],
  principles: [
    { big: "1", label: "người đủ để siết", detail: "khoá khu, dừng cả kho, hạ hạn mức" },
    { big: "2/3", label: "để nới quyền", detail: "người được hưởng lợi không được tự duyệt" },
    { big: "0", label: "quyền của AI", detail: "trợ lý chỉ đọc, giải thích và đề xuất" },
  ],
};

export const LEGAL = {
  title: "Lưu ý pháp lý",
  en: "Legal notes",
  items: [
    { k: "Mây Labs là giả định", v: "Công ty, nhân vật và số liệu trong demo đều hư cấu, chỉ để minh hoạ kịch bản." },
    { k: "Token test, không có giá trị", v: "Chạy trên Avalanche Fuji testnet với tUSDC, tTKB, tSCAM do chúng tôi tự mint. Không có tiền thật." },
    { k: "Không lưu dữ liệu cá nhân on-chain", v: "On-chain chỉ có địa chỉ và mã khu; tên người là nhãn giả định nằm ngoài chain." },
    { k: "Khoá demo chỉ dùng testnet", v: "Private key nằm trong .env, không commit và không dùng cho mạng thật." },
  ],
};

export const LIMITS = {
  title: "Giới hạn bảo vệ",
  en: "What it cannot protect",
  lead: "Chúng tôi nói thẳng những gì Cordon không bảo vệ được:",
  cannot: [
    { k: "2/3 Hội đồng cùng bị chiếm", v: "Đủ phiếu thì có thể nới mọi hạn mức. Cordon chỉ làm việc đó khó thấy hơn, không bất khả thi." },
    { k: "Lỗi trong smart contract", v: "Luật chạy bằng contract; nếu contract sai, rào chắn sai theo. Cần kiểm toán trước khi dùng tiền thật." },
    { k: "Tài sản ngoài kho", v: "Quỹ chính ở Safe và mọi ví nằm ngoài PolicyVault không thuộc phạm vi bảo vệ của hạn mức này." },
  ],
  can: ["Giới hạn thiệt hại mỗi ngày khi một người hoặc một thẻ bị chiếm", "Chặn tại giao thức: giao dịch vi phạm không vào block, không tốn phí", "Siết tức thì bằng một người, nới có kiểm soát bằng 2/3"],
};
