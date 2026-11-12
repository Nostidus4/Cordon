import type { BuildingState } from "./buildings";

export type ScenarioId = "vault" | "evac";

export interface ScenarioEvent {
  t: number; // seconds
  code: string;
  state: BuildingState;
  chip?: string; // optional label override for the building card
}

export interface ScenarioDef {
  id: ScenarioId;
  button: string;
  headline: string;
  time: string;
  rows: { icon: string; label: string; value: string }[]; // incident card rows (static)
  severity: string;
  statusByStep: string[];
  responseTitle: string;
  steps: { title: string; desc: string }[];
  stepAt: number[]; // start time of each step (s)
  total: number; // end of scenario (s)
  events: ScenarioEvent[];
  endStatus: string;
  impact: (step: number, finished: boolean) => { kind: "ok" | "info"; label: string; text: string }[];
  focus: string;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  vault: {
    id: "vault",
    button: "Sự cố Kho tiền: Rò rỉ dữ liệu",
    headline: "Sự cố: Rò rỉ dữ liệu tài chính",
    time: "10:24",
    rows: [
      { icon: "◎", label: "Vị trí", value: "Kho tiền" },
      { icon: "☰", label: "Ảnh hưởng", value: "Nguy cơ lộ thông tin giao dịch của người chơi" },
    ],
    severity: "Cao",
    statusByStep: ["Đang khoanh vùng và xử lý", "Đang điều tra nguyên nhân", "Đang khắc phục và khôi phục dữ liệu", "Đang giám sát tăng cường"],
    endStatus: "Đã xử lý xong, hoạt động bình thường",
    responseTitle: "Kịch bản ứng phó (Không sơ tán)",
    steps: [
      { title: "Khoanh vùng", desc: "Cô lập hệ thống Kho tiền" },
      { title: "Điều tra", desc: "Phân tích nguyên nhân và phạm vi rò rỉ" },
      { title: "Khắc phục", desc: "Vá lỗ hổng và khôi phục dữ liệu" },
      { title: "Giám sát", desc: "Tăng cường bảo mật và theo dõi 24/7" },
    ],
    stepAt: [0, 3.5, 7, 10.5],
    total: 15,
    events: [
      { t: 0, code: "B03", state: "incident" },
      { t: 10.5, code: "B03", state: "recovery" },
      { t: 15, code: "B03", state: "normal" },
    ],
    impact: (step, finished) => [
      { kind: "ok", label: "Các tòa khác", text: "Vẫn hoạt động bình thường" },
      {
        kind: "info",
        label: "Kho tiền",
        text: finished ? "Đã khôi phục giao dịch" : step >= 3 ? "Đang khôi phục, giao dịch hạn chế" : "Tạm ngừng giao dịch, xử lý nội bộ",
      },
    ],
    focus: "B03",
  },
  evac: {
    id: "evac",
    button: "Sơ tán Tòa Tiêu Dùng",
    headline: "Tòa Tiêu Dùng: Kích hoạt sơ tán",
    time: "10:24",
    rows: [
      { icon: "⚡", label: "Nguyên nhân", value: "Phát hiện rò điện (giả định)" },
      { icon: "◎", label: "Vị trí", value: "Tòa Tiêu Dùng" },
    ],
    severity: "Khẩn cấp",
    statusByStep: [
      "Đã phát hiện, đang xác minh",
      "Đang phát cảnh báo và thông báo",
      "Đang sơ tán, khu vực đã được phong tỏa",
      "Đang kiểm tra và khắc phục",
      "Đang mở lại hoạt động",
    ],
    endStatus: "Đã an toàn, hoạt động bình thường",
    responseTitle: "Quy trình ứng phó của Cordon",
    steps: [
      { title: "Phát hiện sự cố", desc: "Cảm biến báo rò điện tại Tòa Tiêu Dùng" },
      { title: "Kích hoạt cảnh báo & thông báo", desc: "Còi báo động và thông báo toàn thành phố" },
      { title: "Sơ tán người dùng", desc: "Di chuyển đến Điểm tập kết (An toàn)" },
      { title: "Kiểm tra & khắc phục", desc: "Xử lý nguồn rò điện" },
      { title: "Mở lại hoạt động", desc: "Khi an toàn" },
    ],
    stepAt: [0, 3, 6, 12, 16],
    total: 20,
    events: [
      { t: 0, code: "B04", state: "incident" },
      { t: 6, code: "B04", state: "incident", chip: "Đang sơ tán" },
      { t: 12, code: "B04", state: "recovery" },
      { t: 20, code: "B04", state: "normal" },
    ],
    impact: (step, finished) => [
      { kind: "ok", label: "Các tòa khác", text: "Vẫn hoạt động bình thường" },
      {
        kind: "info",
        label: "Tòa Tiêu Dùng",
        text: finished ? "Đã mở lại hoạt động" : step >= 3 ? "Đang kiểm tra, chờ mở lại" : "Tạm dừng hoạt động, đảm bảo an toàn",
      },
    ],
    focus: "B04",
  },
};

export function stepAt(def: ScenarioDef, elapsed: number): number {
  let cur = 0;
  def.stepAt.forEach((t, i) => {
    if (elapsed >= t) cur = i;
  });
  return cur;
}
