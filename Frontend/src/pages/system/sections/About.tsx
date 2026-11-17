// Giới thiệu: the vault model, the legal note and the honest limits of the protection.
import "../ports.css";
import { useGraph } from "../../../hooks/useGraph";
import { useOrg } from "../../../hooks/useOrg";
import { policyLabel } from "../../../lib/policy";
import { ACCENT, Section } from "../ui";
import { AboutVault, type LiveTile } from "./AboutVault";

const LEGAL = [
  { k: "Chỉ chạy trên testnet", v: "Token tUSDC, tTKB, tSCAM do chúng tôi tự mint, không có giá trị. Không có tiền thật." },
  { k: "Tiền mã hoá không phải tiền tệ hợp pháp ở Việt Nam", v: "Lương và chi trả thật vẫn bằng VND. Demo chỉ minh hoạ cách đặt rào chắn cho chi tiêu số." },
  { k: "Không phải tư vấn tài chính hay đầu tư", v: "Cordon là mô hình kiểm soát chi tiêu, không khuyến nghị mua bán hay nắm giữ bất kỳ tài sản nào." },
  { k: "Công ty và số liệu là giả định", v: "Mây Labs, các nhân vật và số liệu đều hư cấu. On-chain chỉ có địa chỉ và mã khu, không có dữ liệu cá nhân." },
];

const CANNOT = [
  { k: "Backend giữ 3 khoá thử của Hội đồng ở chế độ demo", v: "Nút “Duyệt” thay thành viên chỉ để diễn. Khi chạy thật, mỗi thành viên ký bằng ví của mình." },
  { k: "Nạp từ C-Chain sang L1 là mô phỏng", v: "Chưa có cầu nối. Số tiền trong kho chi tiêu được nạp thẳng để chạy kịch bản." },
  { k: "Kẻ gian là kịch bản dựng sẵn", v: "Các bước tấn công chạy theo kịch bản cố định, không phải một kẻ tấn công thật thích nghi." },
  { k: "Giá sàn MockDEX cố định", v: "Không có biến động thị trường, nên chưa kiểm được trượt giá hay thanh khoản." },
  { k: "Hạn mức ngày đặt lại lúc 00:00 UTC", v: "Hết ngày UTC là mỗi khu có lại hạn mức, kể cả khi vừa bị tấn công." },
  { k: "2/3 Hội đồng cùng bị chiếm", v: "Đủ phiếu thì nới được mọi hạn mức. Cordon chỉ làm việc đó khó thấy hơn, không bất khả thi." },
  { k: "Lỗi trong smart contract, tài sản ngoài kho", v: "Luật chạy bằng contract nên contract sai thì rào chắn sai theo. Quỹ chính ở Safe không thuộc phạm vi hạn mức." },
];
const CAN = ["Giới hạn thiệt hại mỗi ngày khi một người hoặc một thẻ bị chiếm", "Chặn tại giao thức: giao dịch vi phạm không vào block", "Siết tức thì bằng một người, nới có kiểm soát bằng 2/3"];

const Li = ({ k, v, bad }: { k: string; v: string; bad?: boolean }) => (
  <li className="px-note" data-t={bad ? "bad" : "ok"}><b className="g">{bad ? "✕" : "✓"}</b><span><b>{k}</b><span style={{ display: "block", fontWeight: 500, fontSize: 13 }}>{v}</span></span></li>
);

export function About() {
  const { data: org } = useOrg();
  const { data: graph } = useGraph();
  const tiles: LiveTile[] = [
    ...["minh", "huy", "lan"].map((id) => graph?.districts.find((d) => d.principalId === id)).filter((d): d is NonNullable<typeof d> => !!d).map((d): LiveTile => ({
      name: d.label.replace(/^(Anh|Chị) /, "Khu "), l1: `${d.keys.length} thẻ`,
      l2: d.dailyCap ? `chung ${d.dailyCap.display}/ngày` : "chưa có trần chung", tone: d.locked ? "dashed" : d.dailyCap ? "ok" : "warn",
    })),
    { name: "Khu Hội đồng", l1: "tuỳ chọn", l2: "cảnh 5", tone: "dashed" },
  ];
  return (
    <Section id="gioi-thieu" accent={ACCENT.edu} title="Quỹ chính ở xa tầm tay, kho chi tiêu có rào chắn" sub="Chỉ phần tiền cần chi mỗi ngày nằm trong kho. Quỹ chính vẫn ở Safe đa chữ ký.">
      <div className="px-fig" data-tour="sys-about-vault">
        <AboutVault tiles={tiles} policyVersion={policyLabel(graph)} main={org?.mainTreasury.balance.display ?? "2.000.000"} vault={org ? org.vault.balance.display : "200.000"} />
      </div>
      <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))" }}>
        <div data-tour="sys-about-legal" style={{ minWidth: 0 }}>
          <h3 className="px-h">Lưu ý pháp lý</h3>
          <ul className="px-stack" style={{ gap: 8 }}>{LEGAL.map((it) => <Li key={it.k} {...it} />)}</ul>
        </div>
        <div data-tour="sys-about-limits" style={{ minWidth: 0 }}>
          <h3 className="px-h">Giới hạn bảo vệ, nói thẳng</h3>
          <ul className="px-stack" style={{ gap: 8 }}>{CANNOT.map((it) => <Li key={it.k} {...it} bad />)}</ul>
          <h3 className="px-h" style={{ marginTop: 14 }}>Nhưng bảo vệ được</h3>
          <ul className="px-stack">{CAN.map((c) => <li key={c} className="px-note" data-t="ok"><b className="g">✓</b><span>{c}</span></li>)}</ul>
        </div>
      </div>
    </Section>
  );
}
export default About;
