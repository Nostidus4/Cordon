// Building geometry/colours derived from GuardianAI_Blender_Kit_v2/05_DATA/bundle_manifest.json (§10.8, P1 3D).
// Names come from the shared registry (docs/spec/CITY_OPS.md §1); the state texts describe the real colour rules.
import { buildingName } from "../shared/buildings";
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
  { code: "B01", name: buildingName("B01"), role: "Nới luật cần 2 trong 3 thành viên duyệt", size: "24 x 18 x 18 m",
    normal: "Hội đồng không có đề xuất nào chờ duyệt.",
    warning: "Có đề xuất đang chờ Hội đồng duyệt, cần 2 trong 3 phiếu.",
    incident: "Có lần duyệt bị chặn vì xung đột lợi ích, hoặc đang có sự cố chờ Hội đồng.",
    recovery: "Một đề xuất vừa được thực thi, hoặc sự cố đang hồi phục." },
  { code: "B02", name: buildingName("B02"), role: "Trả lời bằng dữ liệu thật, mọi con số đều được đối chiếu", size: "16 x 14 x 14 m",
    normal: "Các câu trả lời gần đây đều có số liệu đã kiểm chứng.",
    warning: "Câu trả lời gần nhất có số liệu chưa kiểm chứng được.",
    incident: "Có sự cố đang mở ở trợ lý, câu trả lời bị đánh dấu không tin cậy.",
    recovery: "Sự cố của trợ lý đang hồi phục." },
  { code: "B03", name: buildingName("B03"), role: "Giữ tiền công ty, có hạn mức và danh sách người nhận", size: "16 x 16 x 14 m",
    normal: "Hạn mức các khu còn rộng, kho đang chạy bình thường.",
    warning: "Một khu đã dùng từ 80% hạn mức chung hôm nay.",
    incident: "Cả kho đang dừng, hoặc có sự cố đang mở ở kho.",
    recovery: "Sự cố của kho đang hồi phục." },
  { code: "B04", name: buildingName("B04"), role: "Mọi lệnh trả và đổi tiền đi qua đây, sai luật thì bị chặn", size: "18 x 16 x 12 m",
    normal: "Chưa có giao dịch nào bị chặn.",
    warning: "Cổng đang theo dõi một giao dịch đáng ngờ.",
    incident: "Giao dịch vừa bị chặn và khu chưa được khoá.",
    recovery: "Giao dịch vừa bị chặn và khu đã được khoá." },
  { code: "B05", name: buildingName("B05"), role: "Chain chỉ nhận giao dịch từ thẻ còn trong danh sách", size: "16 x 14 x 14 m",
    normal: "Không có khu nào bị khoá.",
    warning: "Trạm đang theo dõi thẻ có dấu hiệu lạ.",
    incident: "Chain vừa từ chối giao dịch của khu bị khoá hoặc thẻ bị gạch.",
    recovery: "Có khu đang bị khoá, các thẻ của khu bị gạch khỏi chain." },
  { code: "B06", name: buildingName("B06"), role: "Tự cân đối kho theo luật, AI chỉ viết lý do", size: "16 x 14 x 14 m",
    normal: "Lần chạy gần nhất của agent hợp lệ.",
    warning: "Lần chạy gần nhất của agent bị chặn hoặc revert.",
    incident: "Agent bị nạp văn bản lạ hoặc đang có sự cố mở, hạn mức đã bị hạ.",
    recovery: "Sự cố của agent đang hồi phục." },
  { code: "B07", name: buildingName("B07"), role: "Ghi cờ rủi ro và nhật ký để kiểm toán", size: "16 x 14 x 12 m",
    normal: "Không có cờ rủi ro nào đang mở.",
    warning: "Còn cờ rủi ro mức cao đang mở.",
    incident: "Có sự cố đang mở ở sổ kiểm toán.",
    recovery: "Sự cố của sổ kiểm toán đang hồi phục." },
  { code: "B08", name: buildingName("B08"), role: "Theo dõi cả thành phố và điều phối xử lý sự cố", size: "Ø20 x 6 m",
    normal: "Cả bảy tòa còn lại đều bình thường.",
    warning: "Có ít nhất một tòa đang cảnh báo.",
    incident: "Có ít nhất một tòa đang có sự cố.",
    recovery: "Có tòa đang hồi phục sau sự cố." },
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
