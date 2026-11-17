// The guided tour: 5 scenes in the §14.3 order (reset -> Nhìn -> Thử -> Sửa -> Sự cố -> Xin thêm quyền -> Pháp lý), all on /he-thong/:tab.
//
// data-tour attributes the tour looks for (missing ones fall back to a centred caption).
// Every name below is asserted to exist under src/pages/system/** by steps.test.ts.
//   tong-quan  sys-now · sys-controls
//   chinh-sach sys-districts
//   rui-ro     sys-you-think · sys-sim-picker · sys-sim-exposure · sys-findings · sys-create-proposal
//   giao-dich  sys-pipeline
//   hoi-dong   sys-proposals · sys-suggestion · sys-before-after · sys-changes · sys-risk-report · sys-approvals · sys-approve-lan|trang|huy (demo mode)
//              sys-conflict (a conflicted member) · sys-timelock · sys-executed · sys-composer · sys-assistant + sys-alternative (#12/#13) · sys-history
//   agent      sys-agent-roster · sys-agent-runs · sys-assistant-q
//   gioi-thieu sys-about-vault · sys-about-legal · sys-about-limits
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
  4: { label: "Cảnh 4", name: "Sự cố" }, 5: { label: "Cảnh 5", name: "Xin thêm quyền" }, 6: { label: "Pháp lý", name: "Giới thiệu" },
};

export const TOUR_STEPS: TourStep[] = [
  { id: "intro", scene: 0, title: "Cordon trong 3 phút", placement: "center", route: "/he-thong/tong-quan", dwell: 5000,
    caption: "Năm cảnh: nhìn, thử, sửa, sự cố, xin thêm quyền. Tour sẽ đặt lại kịch bản về policy v1 rồi đi theo đúng thứ tự năm cảnh." },

  { id: "map-canvas", scene: 1, title: "Nhìn: ai thật sự giữ thẻ nào", route: "/he-thong/chinh-sach", target: ["sys-districts"], placement: "auto", dwell: 6500,
    caption: "Mỗi thẻ có trần riêng, nhưng nhiều thẻ có thể về cùng một người. Bảng này cho thấy khu nào giữ thẻ nào và hạn mức chung." },
  { id: "map-you-think", scene: 1, title: "Cờ vàng ở khu anh Minh", route: "/he-thong/rui-ro", target: ["sys-you-think"], placement: "auto", dwell: 6000,
    caption: "“Bạn nghĩ: 20.000/ngày”, nhưng anh Minh còn điều khiển 3 trợ lý AI và một phần mềm thanh toán." },

  { id: "sim-minh", scene: 2, title: "Thử: nếu anh Minh bị chiếm", route: "/he-thong/rui-ro", target: ["sys-sim-exposure", "sys-sim-picker"], placement: "auto", dwell: 7000,
    run: { label: "Chọn anh Minh", fn: selectPrincipals(["minh"]) },
    caption: "Chain chỉ chặn 20.000 (Enforced), nhưng nếu quan hệ tự khai là thật thì tới 100.000/ngày (Estimated)." },
  { id: "sim-minh-huy", scene: 2, title: "Thêm anh Huy", route: "/he-thong/rui-ro", target: ["sys-sim-exposure", "sys-sim-picker"], placement: "auto", dwell: 6500,
    run: { label: "Chọn Minh + Huy", fn: selectPrincipals(["minh", "huy"]) },
    caption: "Hai khu cộng lại khoảng 140.000/ngày, tức 7% quỹ chính. Lý do lớn nhất: khu anh Minh chưa có cổng chung." },
  { id: "sim-ask", scene: 2, title: "Hỏi trợ lý một câu cố định", route: "/he-thong/agent?pane=hoi-dap", target: ["sys-assistant-q"], placement: "auto", dwell: 7000,
    run: { label: "Hỏi “Vì sao có cờ vàng?”", fn: async () => { await sleep(500); clickInTarget("sys-assistant-q", (b) => b[1] ?? b[0]); } },
    caption: "Trợ lý chỉ đọc: mọi con số lấy từ công cụ giả lập thật, không tự bịa." },

  { id: "req-suggest", scene: 3, title: "Sửa: từ phát hiện đến đề xuất", route: "/he-thong/hoi-dong", target: ["sys-suggestion", "sys-proposals"], placement: "auto", dwell: 6000,
    run: { label: "Tạo đề xuất gom khu", fn: createMerge },
    caption: "Phát hiện R1 tự sinh bản nháp: gom 5 thẻ của anh Minh về một khu, hạn mức chung 30.000/ngày." },
  { id: "req-merge", scene: 3, title: "Trước → Sau, kèm bằng chứng", route: resolveMergeRoute, target: ["sys-before-after"], placement: "auto", dwell: 6500,
    caption: "Rủi ro Estimated giảm từ 100.000 xuống 30.000. Báo cáo được băm; ai cũng kiểm lại được." },
  { id: "req-approve", scene: 3, title: "Lan + Trang duyệt: 2/3, rồi chờ giờ", route: resolveMergeRoute, target: ["sys-timelock", "sys-approvals"], placement: "auto", dwell: 4000,
    run: { label: "Lan và Trang duyệt, chờ rồi thực thi", fn: approveMerge },
    caption: "Đủ 2/3 phiếu thì Hội đồng còn một khoảng chờ để kịp phủ quyết; hết giờ thì áp dụng, chính sách lên v2." },

  { id: "inc-roster", scene: 4, title: "Sự cố: ai là agent trong hệ thống?", route: "/he-thong/agent", target: ["sys-agent-roster"], placement: "auto", dwell: 6500,
    caption: "Mỗi agent ký bằng một thẻ gắn với một khu, nên bị đúng luật chain chặn. Agent không có quyền nới." },
  { id: "inc-agent", scene: 4, title: "Agent chạy buổi sáng", route: "/he-thong/agent", target: ["sys-agent-runs"], placement: "auto", dwell: 6500,
    run: { label: "Chạy agent buổi sáng", fn: async () => { await api.runAgentOnce(); } },
    caption: "Luật quyết định đổi 5.000 tUSDC sang tTKB; mô hình AI chỉ viết lý do. Agent hữu ích, nhưng vẫn bị giới hạn." },
  { id: "inc-attack", scene: 4, title: "Kẻ gian dùng 5 thẻ của anh Minh", route: "/he-thong/giao-dich", target: ["sys-pipeline"], placement: "auto", dwell: 17000,
    run: { label: "Bắt đầu tấn công 1–5", fn: async () => { await api.runScene4(); } },
    caption: "Từng giao dịch đi qua chuỗi kiểm tra; tới 30.000 thì chain từ chối, hết trần chung của khu." },
  { id: "inc-lock", scene: 4, title: "Khoá khu bằng một nút", route: "/he-thong/tong-quan", target: ["sys-controls", "sys-now"], placement: "auto", dwell: 6000,
    run: { label: "Khoá khu anh Minh", fn: lockMinh },
    caption: "Lan khoá khu: mọi thẻ của anh Minh bị gạch khỏi chain trong một giao dịch." },
  { id: "inc-step7", scene: 4, title: "Bước 7: thẻ đã khoá vẫn thử", route: "/he-thong/giao-dich", target: ["sys-pipeline"], placement: "auto", dwell: 6500,
    run: { label: "Thử gửi bằng thẻ đã khoá", fn: async () => { await api.runScene4Step7(); } },
    caption: "Giao dịch bị node từ chối ngay ở tầng giao thức: không có tx hash, không có phí, không vào block." },

  { id: "req-12", scene: 5, title: "Xin thêm quyền: đơn #12", route: resolveScene5Route(12), target: ["sys-before-after"], placement: "auto", dwell: 7000,
    caption: "Nâng hạn mức khu Minh từ 30.000 lên 130.000: Enforced tăng 1,5% → 6,5% quỹ chính. Cordon hiện rõ trước khi duyệt." },
  { id: "req-huy", scene: 5, title: "Hỏi trợ lý về anh Huy", route: resolveScene5Route(12), target: ["sys-assistant"], placement: "auto", dwell: 8000,
    run: { label: "Hỏi về anh Huy", fn: async () => { clickInTarget("sys-assistant"); await sleep(900); } },
    caption: "“Có nên giao trợ lý Cân đối cho anh Huy?” Trợ lý cảnh báo R4: anh Huy đang giữ phiếu duyệt của Hội đồng." },
  { id: "req-alt", scene: 5, title: "Phương án an toàn hơn", route: resolveScene5Route(12), target: ["sys-alternative"], placement: "auto", dwell: 6000,
    caption: "Lập khu do Hội đồng sở hữu: 100.000/ngày, chỉ sàn đã duyệt. Quyền chi tiêu không dồn vào người đang cầm phiếu." },
  { id: "req-conflict", scene: 5, title: "Xung đột lợi ích bị chặn", route: resolveScene5Route(13), target: ["sys-conflict", "sys-approve-huy", "sys-approvals"], placement: "auto", dwell: 7000,
    caption: "Nút “Duyệt với tư cách Huy” bị vô hiệu. Gọi thẳng contract cũng revert ConflictOfInterest()." },

  { id: "about-vault", scene: 6, title: "Mô hình kho & cách Cordon hoạt động", route: "/he-thong/gioi-thieu", target: ["sys-about-vault"], placement: "auto", dwell: 6000,
    caption: "Quỹ chính ở Safe 3/5 trên C-Chain; kho chi tiêu trên Guardian L1 là nơi mọi thẻ bị giới hạn." },
  { id: "about-legal", scene: 6, title: "Lưu ý pháp lý", route: "/he-thong/gioi-thieu", target: ["sys-about-legal"], placement: "auto", dwell: 5000,
    caption: "Cordon là công cụ kỹ thuật, không phải tư vấn tài chính hay pháp lý. Dữ liệu trong demo là giả định." },
  { id: "about-limits", scene: 6, title: "Nói rõ giới hạn bảo vệ", route: "/he-thong/gioi-thieu", target: ["sys-about-limits"], placement: "auto", dwell: 6000,
    caption: "Không bảo vệ được: 2/3 Hội đồng cùng bị chiếm, lỗi contract, tài sản ngoài kho. Chúng tôi nói thẳng." },

  { id: "outro", scene: 0, title: "Hết tour", placement: "center", route: "/he-thong/tong-quan", dwell: 3000,
    caption: "Bạn có thể tự bấm lại bất kỳ mục nào, hoặc đặt lại kịch bản để chạy tiếp." },
];

export const stepIndexById = (id: string) => TOUR_STEPS.findIndex((s) => s.id === id);
