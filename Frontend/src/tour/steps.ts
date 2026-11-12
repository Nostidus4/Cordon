// The guided tour: 5 scenes in the §14.3 order (reset -> Map -> Simulate -> Requests -> Incident -> Requests #12 -> About).
//
// data-tour attributes the tour looks for (add `data-tour="..."` on the element; missing ones fall back to a centred caption):
//   Map        map-canvas · map-you-think
//   Simulate   sim-picker · sim-exposure · sim-assistant (container holding the question buttons) · sim-create-proposal
//   Incident   inc-controls (agent/attack/lock buttons) · inc-with-guardian · inc-without-guardian · inc-lock (Khoá khu button) · inc-attempts (timeline)
//   Requests   req-list · req-suggestion · req-before-after · req-changes · req-approvals · req-approve-buttons · req-approve-lan|trang|huy
//              req-executed · req-conflict · req-assistant · req-alternative · req-risk-report · req-composer   (already set by the Requests screen)
//   About      about-vault · about-how · about-legal · about-limits                                            (already set by the About screen)
import type { TourCtx } from "./actions";
import { approveMerge, clickInTarget, createMerge, lockMinh, resolveMergeRoute, resolveScene5Route, selectPrincipals, sleep } from "./actions";
import { api } from "../lib/api";

export type Placement = "auto" | "top" | "bottom" | "left" | "right" | "center";
export interface TourStep {
  id: string;
  /** 0 = intro/outro, 1..5 = scenes of spec §4.4, 6 = About */
  scene: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  /** 1-2 lines of Vietnamese narration */
  caption: string;
  route?: string | (() => Promise<string>);
  /** data-tour names, first one found wins */
  target?: string[];
  placement?: Placement;
  /** what "Tự chạy" / "Chạy giúp" does on this step */
  run?: { label: string; fn: (ctx: TourCtx) => Promise<void> };
  /** how long auto mode stays on the step after run (ms) */
  dwell?: number;
}

export const SCENES: Record<number, { label: string; name: string }> = {
  0: { label: "Mở đầu", name: "Tour demo" },
  1: { label: "Cảnh 1", name: "Nhìn" }, 2: { label: "Cảnh 2", name: "Thử" }, 3: { label: "Cảnh 3", name: "Sửa" },
  4: { label: "Cảnh 4", name: "Sự cố" }, 5: { label: "Cảnh 5", name: "Xin thêm quyền" }, 6: { label: "Pháp lý", name: "About" },
};

export const TOUR_STEPS: TourStep[] = [
  { id: "intro", scene: 0, title: "Cordon trong 3 phút", placement: "center", route: "/chi-tiet/map", dwell: 5000,
    caption: "Năm cảnh: nhìn, thử, sửa, sự cố, xin thêm quyền. Tour sẽ đặt lại kịch bản về policy v1 rồi đi theo đúng thứ tự năm cảnh." },

  { id: "map-canvas", scene: 1, title: "Nhìn: ai thật sự giữ thẻ nào", route: "/chi-tiet/map", target: ["map-canvas"], placement: "auto", dwell: 6500,
    caption: "Mỗi thẻ có trần riêng, nhưng nhiều thẻ có thể về cùng một người. Cạnh nét đứt là quan hệ tự khai chưa kiểm chứng." },
  { id: "map-you-think", scene: 1, title: "Cờ vàng ở khu anh Minh", route: "/chi-tiet/map", target: ["map-you-think", "map-canvas"], placement: "auto", dwell: 6000,
    caption: "“Bạn nghĩ: 20.000/ngày”, nhưng anh Minh còn điều khiển 3 trợ lý AI và một phần mềm thanh toán." },

  { id: "sim-minh", scene: 2, title: "Thử: nếu anh Minh bị chiếm", route: "/chi-tiet/simulate", target: ["sim-exposure", "sim-picker"], placement: "auto", dwell: 7000,
    run: { label: "Chọn anh Minh", fn: selectPrincipals(["minh"]) },
    caption: "Chain chỉ chặn 20.000 (Enforced), nhưng nếu quan hệ tự khai là thật thì tới 100.000/ngày (Estimated)." },
  { id: "sim-minh-huy", scene: 2, title: "Thêm anh Huy", route: "/chi-tiet/simulate", target: ["sim-exposure", "sim-picker"], placement: "auto", dwell: 6500,
    run: { label: "Chọn Minh + Huy", fn: selectPrincipals(["minh", "huy"]) },
    caption: "Hai khu cộng lại khoảng 140.000/ngày, tức 7% quỹ chính. Lý do lớn nhất: khu anh Minh chưa có cổng chung." },
  { id: "sim-ask", scene: 2, title: "Hỏi trợ lý một câu cố định", route: "/chi-tiet/simulate", target: ["sim-assistant"], placement: "auto", dwell: 7000,
    run: { label: "Hỏi “Vì sao có cờ vàng?”", fn: async () => { clickInTarget("sim-assistant", (b) => b[1] ?? b[0]); } },
    caption: "Trợ lý chỉ đọc: mọi con số lấy từ công cụ giả lập thật, không tự bịa." },

  { id: "req-suggest", scene: 3, title: "Sửa: từ phát hiện đến đề xuất", route: "/chi-tiet/requests", target: ["req-suggestion", "req-list"], placement: "auto", dwell: 6000,
    run: { label: "Tạo đề xuất gom khu", fn: createMerge },
    caption: "Phát hiện R1 tự sinh bản nháp: gom 5 thẻ của anh Minh về một khu, hạn mức chung 30.000/ngày." },
  { id: "req-merge", scene: 3, title: "Trước → Sau, kèm bằng chứng", route: resolveMergeRoute, target: ["req-before-after"], placement: "auto", dwell: 6500,
    caption: "Rủi ro Estimated giảm từ 100.000 xuống 30.000. Báo cáo được băm; chip “bằng chứng” cho ai cũng kiểm lại được." },
  { id: "req-approve", scene: 3, title: "Lan + Trang duyệt: 2/3", route: resolveMergeRoute, target: ["req-approvals"], placement: "auto", dwell: 7500,
    run: { label: "Lan và Trang duyệt", fn: approveMerge },
    caption: "Đủ 2/3 phiếu thì đề xuất tự thực thi, chính sách lên v2 và bản đồ vẽ lại." },

  { id: "inc-agent", scene: 4, title: "Sự cố: agent chạy buổi sáng", route: "/chi-tiet/incident", target: ["inc-controls", "inc-with-guardian"], placement: "auto", dwell: 6000,
    run: { label: "Chạy agent buổi sáng", fn: async () => { await api.runAgentOnce(); } },
    caption: "Trợ lý Cân đối đổi 5.000 tUSDC sang tTKB, đúng trong rào chắn. Agent hữu ích, nhưng vẫn bị giới hạn." },
  { id: "inc-attack", scene: 4, title: "Kẻ gian dùng 5 thẻ của anh Minh", route: "/chi-tiet/incident", target: ["inc-with-guardian", "inc-attempts"], placement: "auto", dwell: 17000,
    run: { label: "Bắt đầu tấn công 1–5", fn: async () => { await api.runScene4(); } },
    caption: "Bên trái không có Guardian: mất 100.000. Bên phải: tới 30.000 thì chain từ chối, hết trần chung." },
  { id: "inc-lock", scene: 4, title: "Khoá khu bằng một nút", route: "/chi-tiet/incident", target: ["inc-lock", "inc-controls"], placement: "auto", dwell: 6000,
    run: { label: "Khoá khu anh Minh", fn: lockMinh },
    caption: "Lan khoá khu: mọi thẻ của anh Minh bị gạch khỏi chain trong một giao dịch." },
  { id: "inc-step7", scene: 4, title: "Bước 7: thẻ đã khoá vẫn thử", route: "/chi-tiet/incident", target: ["inc-attempts"], placement: "auto", dwell: 6500,
    run: { label: "Thử gửi bằng thẻ đã khoá", fn: async () => { await api.runScene4Step7(); } },
    caption: "Giao dịch bị node từ chối ngay ở tầng giao thức: không có tx hash, không có phí, không vào block." },

  { id: "req-12", scene: 5, title: "Xin thêm quyền: đơn #12", route: resolveScene5Route(12), target: ["req-before-after"], placement: "auto", dwell: 7000,
    caption: "Nâng hạn mức khu Minh từ 30.000 lên 130.000: Enforced tăng 1,5% → 6,5% quỹ chính. Cordon hiện rõ trước khi duyệt." },
  { id: "req-huy", scene: 5, title: "Hỏi trợ lý về anh Huy", route: resolveScene5Route(12), target: ["req-assistant"], placement: "auto", dwell: 8000,
    run: { label: "Hỏi về anh Huy", fn: async () => { clickInTarget("req-assistant"); await sleep(900); } },
    caption: "“Có nên giao trợ lý Cân đối cho anh Huy?” Trợ lý cảnh báo R4: anh Huy đang giữ phiếu duyệt của Hội đồng." },
  { id: "req-alt", scene: 5, title: "Phương án an toàn hơn", route: resolveScene5Route(12), target: ["req-alternative"], placement: "auto", dwell: 6000,
    caption: "Lập khu do Hội đồng sở hữu: 100.000/ngày, chỉ sàn đã duyệt. Quyền chi tiêu không dồn vào người đang cầm phiếu." },
  { id: "req-conflict", scene: 5, title: "Xung đột lợi ích bị chặn", route: resolveScene5Route(13), target: ["req-approve-huy", "req-conflict"], placement: "auto", dwell: 7000,
    caption: "Nút “Duyệt với tư cách Huy” bị vô hiệu. Gọi thẳng contract cũng revert ConflictOfInterest()." },

  { id: "about-vault", scene: 6, title: "Mô hình kho & cách Cordon hoạt động", route: "/chi-tiet/about", target: ["about-vault"], placement: "auto", dwell: 6000,
    caption: "Quỹ chính ở Safe 3/5 trên C-Chain; kho chi tiêu trên Guardian L1 là nơi mọi thẻ bị giới hạn." },
  { id: "about-limits", scene: 6, title: "Nói rõ giới hạn bảo vệ", route: "/chi-tiet/about", target: ["about-limits"], placement: "auto", dwell: 6000,
    caption: "Không bảo vệ được: 2/3 Hội đồng cùng bị chiếm, lỗi contract, tài sản ngoài kho. Chúng tôi nói thẳng." },

  { id: "outro", scene: 0, title: "Hết tour", placement: "center", route: "/chi-tiet/map", dwell: 3000,
    caption: "Map → Simulate → Cordon. Bạn có thể tự bấm lại bất kỳ màn nào, hoặc đặt lại kịch bản để chạy tiếp." },
];

export const stepIndexById = (id: string) => TOUR_STEPS.findIndex((s) => s.id === id);
