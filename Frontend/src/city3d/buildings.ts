// Building data derived from GuardianAI_Blender_Kit_v2/05_DATA/bundle_manifest.json (§10.8, P1 3D).
export type BuildingState = "normal" | "warning" | "incident" | "recovery";

export const STATES: BuildingState[] = ["normal", "warning", "incident", "recovery"];

export const STATE_LABEL: Record<BuildingState, string> = {
  normal: "Bình thường",
  warning: "Cảnh báo",
  incident: "Sự cố",
  recovery: "Đã khoá / Khôi phục",
};

export const STATE_CHIP: Record<BuildingState, string> = {
  normal: "Hoạt động bình thường",
  warning: "Cảnh báo, đang kiểm tra",
  incident: "Đang xử lý sự cố",
  recovery: "Đang khôi phục",
};

export const STATE_ICON: Record<BuildingState, string> = {
  normal: "✓",
  warning: "▲",
  incident: "✕",
  recovery: "◐",
};

export const STATE_COLOR: Record<BuildingState, string> = {
  normal: "#34e08f",
  warning: "#FFB300",
  incident: "#FF2D3D",
  recovery: "#5E8FA3",
};

export interface BuildingDef {
  code: string;
  name: string;
  role: string;
  size: string;
  /** [width, depth, height] in meters */
  dims: [number, number, number];
  round: boolean;
  color: string;
  texts: Record<BuildingState, string>;
}

type Raw = Omit<BuildingDef, "dims" | "round" | "color" | "texts"> & {
  normal: string;
  warning: string;
  incident: string;
  recovery: string;
};

export function parseSize(size: string): { dims: [number, number, number]; round: boolean } {
  const round = size.includes("Ø");
  const nums = (size.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (round) return { dims: [nums[0], nums[0], nums[1] ?? 6], round };
  return { dims: [nums[0] ?? 16, nums[1] ?? 14, nums[2] ?? 12], round };
}

// Kit sheet colors (sRGB): identity / glow
const IDENTITY: Record<string, string> = {
  B01: "#8E5CF6",
  B02: "#1565E8",
  B03: "#0A84D8",
  B04: "#FF8C42",
  B05: "#00C7C7",
  B06: "#8A4EFF",
  B07: "#22C55E",
  B08: "#18A8FF",
};

export const GLOW: Record<string, string> = {
  B01: "#B56CFF",
  B02: "#00E5FF",
  B03: "#00E5FF",
  B04: "#FFA500",
  B05: "#39FFF4",
  B06: "#E065FF",
  B07: "#00FF9D",
  B08: "#00E5FF",
};

const RAW: Raw[] = [
  { code: "B01", name: "Hội đồng duyệt", role: "Ra quyết định và đánh giá kế hoạch chi tiêu", size: "24 x 18 x 18 m",
    normal: "Đang họp, quorum đạt, biểu tượng cân sáng vàng nhẹ, đèn tím ổn định.",
    warning: "Thiếu quorum hoặc có đề xuất chờ duyệt quá hạn; panel hiển thị PENDING.",
    incident: "Phát hiện yêu cầu vượt policy hoặc biểu quyết trái phép; khóa tạm quyền biểu quyết, biển cảnh báo đỏ.",
    recovery: "Khôi phục quyền biểu quyết sau kiểm tra; trạng thái xanh-xám, thanh tiến độ phục hồi." },
  { code: "B02", name: "Tòa Giáo Dục", role: "Học cách quản lý tiền", size: "16 x 14 x 14 m",
    normal: "Thư viện bài học hoạt động, người dùng truy cập kiến thức bình thường.",
    warning: "Có nội dung cần cập nhật hoặc bài học chưa hoàn tất; biển CẦN CẬP NHẬT hiển thị.",
    incident: "Phát hiện truy cập trái phép vào thư viện hoặc nội dung lỗi; khu học liệu tạm khóa.",
    recovery: "Kiểm duyệt và phục hồi nội dung; hiển thị khiên bảo vệ và tiến độ restore." },
  { code: "B03", name: "Kho tiền", role: "Quản lý và lưu trữ tài sản", size: "16 x 16 x 14 m",
    normal: "Giao dịch hợp lệ trong hạn mức; cửa két mở theo quyền; dashboard xanh.",
    warning: "Phát hiện giao dịch bất thường hoặc hạn mức sắp trần; đèn vàng nhấp nháy.",
    incident: "Nghi rò khóa ví hoặc rút tiền trái phép; khóa đầu ra, đường giao dịch đỏ, còi báo động.",
    recovery: "Tạm khóa an toàn, xoay khóa và xác minh sổ cái; thanh tiến độ khôi phục." },
  { code: "B04", name: "Tòa Tiêu Dùng", role: "Tiêu tiền thông minh, đúng nhu cầu", size: "18 x 16 x 12 m",
    normal: "Mua sắm hợp lệ, thanh toán ổn định, biển hiệu sáng đều.",
    warning: "Chi tiêu tăng đột biến hoặc hóa đơn trùng lặp; popup kiểm tra giao dịch.",
    incident: "Merchant gian lận / thanh toán trái phép; cửa bị khóa, barrier và đèn đỏ.",
    recovery: "Kiểm tra hoàn tiền, đối soát và khôi phục hoạt động; màu xanh-xám." },
  { code: "B05", name: "Tòa An Toàn", role: "Bảo vệ trước rủi ro tài chính", size: "16 x 14 x 14 m",
    normal: "Hệ thống giám sát ổn định, camera và shield hoạt động bình thường.",
    warning: "Đăng nhập đáng ngờ hoặc scanner kích hoạt nâng cao; cảnh báo vàng.",
    incident: "Xác nhận breach bảo mật; logo khiên đỏ, barrier đóng, camera quét gấp.",
    recovery: "Chế độ cô lập xử lý và hardening; checklist khôi phục an toàn." },
  { code: "B06", name: "Tòa Tăng Trưởng", role: "Làm cho tiền sinh sôi bền vững", size: "16 x 14 x 14 m",
    normal: "ROI dương, biểu đồ đi lên, chiến lược vận hành ổn định.",
    warning: "Chỉ số rủi ro tăng hoặc thị trường biến động mạnh; biểu đồ vàng, cần rà soát.",
    incident: "Chiến lược runaway hoặc lỗ vượt ngưỡng; tự động auto-pause, đồ thị đỏ.",
    recovery: "Tái cân bằng danh mục và quay về chế độ an toàn; tiến trình hồi phục hiển thị." },
  { code: "B07", name: "Tòa Trách Nhiệm", role: "Sử dụng tiền để tạo giá trị cho cộng đồng", size: "16 x 14 x 12 m",
    normal: "Chương trình cộng đồng và compliance hoạt động tốt; bảng tác động xanh.",
    warning: "Thiếu hồ sơ chứng minh tác động hoặc chờ soát compliance; logo lá vàng.",
    incident: "Vi phạm policy hoặc dùng ngân sách sai mục đích; biển VI PHẠM POLICY đỏ.",
    recovery: "Rà soát, nộp lại hồ sơ, kiểm toán và khôi phục trạng thái." },
  { code: "B08", name: "Quảng trường GuardianAI", role: "Trung tâm kết nối và trải nghiệm", size: "Ø20 x 6 m",
    normal: "Quảng trường là hub trung tâm; nước, hologram và dashboard công cộng hoạt động.",
    warning: "Phát thông báo rủi ro toàn thành phố; vòng sáng vàng, bảng tin ưu tiên cảnh báo.",
    incident: "Chế độ chỉ huy sự cố; hologram đỏ, bản đồ ảnh hưởng, cụm hỗ trợ khẩn cấp.",
    recovery: "Điều phối khôi phục sau sự cố; màn hình tổng hợp trạng thái và tiến độ." },
];

export const BUILDINGS: BuildingDef[] = RAW.map((r) => ({
  code: r.code,
  name: r.name,
  role: r.role,
  size: r.size,
  ...parseSize(r.size),
  color: IDENTITY[r.code],
  texts: { normal: r.normal, warning: r.warning, incident: r.incident, recovery: r.recovery },
}));

export const BUILDING_BY_CODE: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.code, b]),
);
