// The 8 buildings = 8 modules (docs/spec/CITY_OPS.md §1). Mirror of backend shared/buildings.py: keep both sides in sync.
// Rule ids are stable and shared; `rules` is listed in priority order (the first matching rule wins, see services/city_state.py).
export type BuildingId = "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08";
export type RuleState = "normal" | "warning" | "incident" | "recovery";

export interface BuildingRule {
  id: string;
  /** "worst" only for B08.worst: the worst state of the seven other buildings. */
  state: RuleState | "worst";
  /** Vietnamese sentence describing the condition. */
  whenVi: string;
}

export interface BuildingInfo {
  id: BuildingId;
  /** UI name (Vietnamese). */
  name: string;
  /** Real module / contract name (shown only in the small "Bên trong" line). */
  module: string;
  /** Hackathon topic, e.g. "#12". */
  topic: string;
  summaryVi: string;
  rules: BuildingRule[];
}

const open = (id: BuildingId): BuildingRule => ({ id: `${id}.incident_open`, state: "incident", whenVi: "Có sự cố đang mở ở tòa này, đang khoanh vùng hoặc chờ Hội đồng" });
const recovering = (id: BuildingId): BuildingRule => ({ id: `${id}.incident_recovering`, state: "recovery", whenVi: "Sự cố của tòa đang hồi phục" });

export const BUILDING_REGISTRY: BuildingInfo[] = [
  { id: "B01", name: "Hội đồng duyệt", module: "GuardianCouncil (multisig 2/3), proposal_service", topic: "#12, #21",
    summaryVi: "Nới luật cần 2 trong 3 thành viên Hội đồng duyệt. Tự động hóa chỉ được siết, không được nới.",
    rules: [open("B01"), recovering("B01"),
      { id: "B01.conflict", state: "incident", whenVi: "Vừa có lần duyệt bị chặn vì xung đột lợi ích" },
      { id: "B01.executed", state: "recovery", whenVi: "Một đề xuất vừa được thực thi" },
      { id: "B01.pending", state: "warning", whenVi: "Có đề xuất chờ Hội đồng duyệt" },
      { id: "B01.queued", state: "warning", whenVi: "Có đề xuất nới luật đang chờ hết giờ" }] },
  { id: "B02", name: "Trợ lý AI", module: "assistant/ (read tools + verifier)", topic: "#13",
    summaryVi: "Trợ lý chỉ đọc dữ liệu thật rồi trả lời. Mọi con số trong câu trả lời đều được đối chiếu lại.",
    rules: [open("B02"), recovering("B02"),
      { id: "B02.unverified", state: "warning", whenVi: "Câu trả lời gần nhất có số liệu chưa kiểm chứng" }] },
  { id: "B03", name: "Kho tiền có luật", module: "PolicyVault", topic: "#12",
    summaryVi: "Kho giữ tiền của công ty, có hạn mức, danh sách người nhận được duyệt và nút dừng khẩn cấp.",
    rules: [open("B03"), recovering("B03"),
      { id: "B03.paused", state: "incident", whenVi: "Cả kho đang dừng" },
      { id: "B03.near_cap", state: "warning", whenVi: "Một khu đã dùng từ 80% hạn mức chung hôm nay" }] },
  { id: "B04", name: "Cổng chi trả", module: "vault.pay / vault.swap (attempts)", topic: "#21",
    summaryVi: "Mọi lệnh trả tiền hay đổi tiền đi qua đây. Lệnh sai luật bị chặn ngay và ghi lại.",
    rules: [open("B04"), recovering("B04"),
      { id: "B04.blocked_open", state: "incident", whenVi: "Giao dịch vừa bị chặn, khu chưa được khoá" },
      { id: "B04.blocked_locked", state: "recovery", whenVi: "Giao dịch vừa bị chặn, khu đã được khoá" },
      { id: "B04.payroll_kill", state: "incident", whenVi: "Công tắc khẩn cấp quỹ lương đang bật" },
      { id: "B04.payroll_at_risk", state: "warning", whenVi: "Có nơi gửi quỹ lương đang gặp sự cố" }] },
  { id: "B05", name: "Trạm soi giao dịch", module: "Tx AllowList precompile + khoá khu", topic: "#14",
    summaryVi: "Chain chỉ nhận giao dịch từ thẻ còn trong danh sách. Khoá một khu là gạch hết thẻ của khu đó.",
    rules: [open("B05"), recovering("B05"),
      { id: "B05.shield", state: "incident", whenVi: "Chain vừa từ chối giao dịch của khu bị khoá hoặc thẻ bị gạch" },
      { id: "B05.locked", state: "recovery", whenVi: "Có khu đang bị khoá" }] },
  { id: "B06", name: "Agent cân đối", module: "agent_rebalance/ (rule engine + LLM chỉ viết lý do)", topic: "#12",
    summaryVi: "Agent tự cân đối kho theo luật cố định. Mô hình ngôn ngữ chỉ viết lời giải thích, không quyết định.",
    rules: [open("B06"), recovering("B06"),
      { id: "B06.blocked", state: "warning", whenVi: "Lần chạy gần nhất của agent bị chặn hoặc revert" }] },
  { id: "B07", name: "Sổ kiểm toán", module: "graph/findings (cờ rủi ro), audit log", topic: "#12",
    summaryVi: "Ghi lại các cờ rủi ro và nhật ký hành động để người kiểm toán đọc lại sau này.",
    rules: [open("B07"), recovering("B07"),
      { id: "B07.high", state: "warning", whenVi: "Còn cờ rủi ro mức cao đang mở" }] },
  { id: "B08", name: "Trung tâm sự cố", module: "responder", topic: "—",
    summaryVi: "Theo dõi cả thành phố. Tự khoanh vùng khi có sự cố, rồi xin Hội đồng duyệt để hồi phục.",
    rules: [{ id: "B08.worst", state: "worst", whenVi: "Lấy trạng thái xấu nhất của 7 tòa còn lại" }] },
];

export const BUILDING_IDS: BuildingId[] = BUILDING_REGISTRY.map((b) => b.id);
export const BUILDING_BY_ID: Record<BuildingId, BuildingInfo> = Object.fromEntries(BUILDING_REGISTRY.map((b) => [b.id, b])) as Record<BuildingId, BuildingInfo>;
export const BUILDING_NAME: Record<BuildingId, string> = Object.fromEntries(BUILDING_REGISTRY.map((b) => [b.id, b.name])) as Record<BuildingId, string>;
/** UI name of a building by code (falls back to the code). */
export const buildingName = (id: string): string => BUILDING_NAME[id as BuildingId] ?? id;
