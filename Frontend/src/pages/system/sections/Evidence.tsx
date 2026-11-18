// /he-thong/bang-chung: judges can check the on-chain claims themselves. Live numbers come only from a real RPC
// (VITE_L1_RPC_URL, the read-only proxy); without it the tab shows the frozen addresses and says so.
import { useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import {
  CCHAIN_FUNDS, CCHAIN_ID, CCHAIN_RPC, COUNCIL_MEMBERS, DEPLOYER, L1_CHAIN_ID, L1_CONTRACTS, L1_DEPLOY_BLOCK, L1_PRECOMPILES, MINH_KEYS,
  snowtraceAddress, TX_ALLOWLIST, type NamedAddress,
} from "../evidence/deployment";
import { configuredL1Rpc, curlCmd, readAllowListData, roleLabel } from "../evidence/rpc";
import { useChainEvidence, type Evidence as ChainEvidence, type Read } from "../evidence/useChainEvidence";
import { castReceiptCmd, SAMPLE_TXS, type SampleTx, type SampleView } from "../evidence/sampleTxs";
import { useSampleTxs } from "../evidence/useSampleTxs";
import { ACCENT, Section } from "../ui";

export const NO_RPC_BANNER = "Bản demo này chạy chain mô phỏng; số đọc trực tiếp chỉ có khi nối RPC của Guardian L1";

function CopyButton({ value, label = "Chép" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    try { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={`${label} ${value.slice(0, 12)}`} className="ev-copy">
      {done ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}{done ? "Đã chép" : label}
    </button>
  );
}

const Addr = ({ a }: { a: string }) => <span className="ev-addr"><code>{a}</code><CopyButton value={a} /></span>;

const Name = ({ n }: { n: NamedAddress }) => (
  <div><div style={{ fontWeight: 700 }}>{n.label}</div><div className="ev-small ev-mono">{n.code}</div></div>
);

function ReadCell<T>({ r, ok }: { r: Read<T> | undefined; ok: (v: T) => ReactNode }) {
  if (!r || r.state === "loading") return <span className="ev-dim">Đang đọc…</span>;
  if (r.state === "error") return <span className="ev-warn" title={r.message}>Không đọc được: {r.message}</span>;
  return <>{ok(r.value)}</>;
}

const Table = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="ev-scroll">
    <table className="sx-table">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export const Mark = ({ ok }: { ok: boolean }) => (
  <span className={ok ? "ev-ok" : "ev-bad"} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    {ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}{ok ? "Có" : "Không"}
  </span>
);

/** One plain sentence about what the 5 role reads mean. Exported for tests. */
export function rolesSentence(roles: Array<Read<number> | undefined>): string {
  const vals = roles.map((r) => (r?.state === "ok" ? r.value : null));
  if (vals.some((v) => v === null)) return "Chưa đọc đủ 5 khoá nên chưa kết luận được.";
  const blocked = vals.filter((v) => v === 0).length;
  if (blocked === vals.length) return "Cả 5 khoá đều đọc ra 0: chain từ chối mọi giao dịch của các khoá này ngay từ cửa, trước khi vào block, kể cả khi ai đó có chữ ký hợp lệ.";
  if (blocked === 0) return "Cả 5 khoá đang được gửi giao dịch bình thường; khi một khoá bị khoá lại, số đọc ở đây đổi về 0 và chain từ chối giao dịch của khoá đó.";
  return `${blocked} trong 5 khoá đã bị chặn ở tầng giao thức (đọc ra 0): giao dịch của các khoá đó bị chain từ chối ngay từ cửa; các khoá còn lại vẫn được gửi.`;
}

const A = ACCENT.edu;

function Network({ ev, rpc }: { ev: ChainEvidence | null; rpc: string }) {
  return (
    <Section id="ev-mang" accent={A} title="Mạng Guardian L1" sub="Chuỗi riêng của dự án, không có trang xem công khai nên trang này tự đọc thẳng từ nút.">
      <dl className="ev-grid3" style={{ margin: 0 }}>
        <div><dt>Mã chuỗi</dt><dd className="ev-big">{L1_CHAIN_ID} <span className="ev-small">(0x{L1_CHAIN_ID.toString(16)})</span></dd>
          {ev ? <dd className="ev-small"><ReadCell r={ev.chainId} ok={(v) => <span className={v === L1_CHAIN_ID ? "ev-ok" : "ev-bad"}>{v === L1_CHAIN_ID ? "Nút trả lời đúng mã này" : `Nút trả mã khác: ${v}`}</span>} /></dd> : null}</div>
        <div><dt>Khối mới nhất</dt>
          <dd className="ev-big">{ev ? <ReadCell r={ev.block} ok={(v) => v.toLocaleString("vi-VN")} /> : <span className="ev-dim">chưa nối RPC</span>}</dd>
          <dd className="ev-small">Hợp đồng được đăng từ khối {L1_DEPLOY_BLOCK}.</dd></div>
        <div><dt>Địa chỉ RPC</dt>
          <dd className="ev-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{rpc || "Chưa cấu hình"}</dd>
          <dd className="ev-small">{rpc ? "Cổng chỉ đọc: gửi giao dịch bị từ chối." : "Đặt VITE_L1_RPC_URL khi dựng trang để đọc trực tiếp."}</dd></div>
      </dl>
    </Section>
  );
}

function Contracts({ ev }: { ev: ChainEvidence | null }) {
  const row = (c: NamedAddress, precompile: boolean) => (
    <tr key={c.id}>
      <td><Name n={c} /></td>
      <td><Addr a={c.address} /></td>
      <td style={{ whiteSpace: "nowrap" }}>{precompile ? <span className="ev-dim">có sẵn trong chain</span> : ev ? <ReadCell r={ev.code[c.id]} ok={(v) => <span className="ev-mono">{v.toLocaleString("vi-VN")} byte</span>} /> : <span className="ev-dim">—</span>}</td>
      <td style={{ whiteSpace: "nowrap" }}>{ev ? <ReadCell r={ev.code[c.id]} ok={(v) => <Mark ok={v > 0} />} /> : <span className="ev-dim">chưa đọc</span>}</td>
    </tr>
  );
  return (
    <Section id="ev-hop-dong" accent={A} title="Hợp đồng" sub="Có mã chạy tại địa chỉ đó thì cột cuối là Có. Kích thước mã đọc trực tiếp từ chain.">
      <Table head={["Hợp đồng", "Địa chỉ", "Kích thước mã", "Đang chạy?"]}>
        {L1_CONTRACTS.map((c) => row(c, false))}
        {L1_PRECOMPILES.map((c) => row(c, true))}
      </Table>
    </Section>
  );
}

function Keys({ ev }: { ev: ChainEvidence | null }) {
  const group = (title: string, items: readonly NamedAddress[]) => (
    <>
      <tr><td colSpan={3} className="ev-small" style={{ fontWeight: 800, paddingTop: 14 }}>{title}</td></tr>
      {items.map((k) => (
        <tr key={k.id}>
          <td><Name n={k} /></td>
          <td><Addr a={k.address} /></td>
          <td>{ev ? <ReadCell r={ev.roles[k.address]} ok={(v) => <span className={v === 0 ? "ev-bad" : "ev-ok"}>{v} · {roleLabel(v)}</span>} /> : <span className="ev-dim">chưa đọc</span>}</td>
        </tr>
      ))}
    </>
  );
  return (
    <Section id="ev-khoa" accent={A} title="Khoá ở tầng giao thức" sub="Luật gửi giao dịch của chain: 0 là bị chặn, 1 là được gửi, 2 là quản trị.">
      <Table head={["Khoá", "Địa chỉ", "Vai trò đọc từ chain"]}>
        {group("5 khoá của anh Minh", MINH_KEYS)}
        {group("Hội đồng", COUNCIL_MEMBERS)}
        {group("Ví triển khai", [DEPLOYER])}
      </Table>
      <p className="ev-note">
        {ev ? rolesSentence(MINH_KEYS.map((k) => ev.roles[k.address])) : "Khi cả 5 khoá đọc ra 0, chain từ chối mọi giao dịch của chúng ngay từ cửa, trước khi vào block. Cần nối RPC để xem số thật."}
      </p>
    </Section>
  );
}

function SampleResult({ tx, view }: { tx: SampleTx; view: SampleView | undefined }) {
  const expected = tx.expect === "ok" ? "Thành công" : "Bị chặn";
  if (!view || view.state === "static") return <div><div className="ev-dim">{expected} <span className="ev-small">(theo bản ghi, chưa đọc trực tiếp)</span></div><div className="ev-small">{tx.outcome}</div></div>;
  if (view.state === "loading") return <span className="ev-dim">Đang đọc…</span>;
  if (view.state === "error") return <span className="ev-warn" title={view.message}>Không đọc được: {view.message}</span>;
  if (view.state === "missing") return <span className="ev-bad">Nút không thấy giao dịch này</span>;
  const good = view.expectMatches && view.blockMatches;
  return (
    <div>
      <div className={view.status === "success" ? "ev-ok" : "ev-bad"}>{view.statusLabel} <span className="ev-small" style={{ fontWeight: 400 }}>· khối {view.block.toLocaleString("vi-VN")}</span></div>
      <div className="ev-small">{tx.outcome}</div>
      {good ? null : <div className="ev-small ev-warn">Kết quả đọc được khác với bản ghi ({expected} ở khối {tx.block.toLocaleString("vi-VN")}).</div>}
      {tx.inferred ? <div className="ev-small">Lý do cụ thể suy ra từ chuỗi giao dịch trước đó (nút không còn giữ trạng thái cũ để chạy lại).</div> : null}
    </div>
  );
}

function SampleTxs({ rpc }: { rpc: string }) {
  const views = useSampleTxs(rpc);
  const cmd = castReceiptCmd(SAMPLE_TXS[0]!.hash, rpc);
  return (
    <Section id="ev-giao-dich-mau" accent={A} title="Giao dịch mẫu trên chain" sub="Những giao dịch thật đã chạy trên Guardian L1: cho phép, bị chặn, khoá khẩn cấp, Hội đồng nới luật. Tra từng mã băm bằng lệnh bên dưới.">
      {rpc ? null : <p className="ev-note" style={{ marginTop: 0, marginBottom: 12 }}>Chưa nối RPC nên danh sách này là bản ghi tĩnh, chưa đọc trực tiếp từ chain.</p>}
      <Table head={["Chứng minh điều gì", "Kết quả", "Mã băm giao dịch", "Hợp đồng"]}>
        {SAMPLE_TXS.map((t) => (
          <tr key={t.id}>
            <td style={{ maxWidth: 320 }}><div style={{ fontWeight: 700 }}>{t.label}</div><div className="ev-small ev-mono" style={{ wordBreak: "break-word" }}>{t.detail}</div></td>
            <td><SampleResult tx={t} view={views[t.id]} /></td>
            <td><Addr a={t.hash} /><div className="ev-small">Khối {t.block.toLocaleString("vi-VN")}</div></td>
            <td><div style={{ fontWeight: 700 }}>{t.contract}</div><div className="ev-small ev-mono">{t.contractAddress.slice(0, 10)}…{t.contractAddress.slice(-4)}</div><div className="ev-small">{t.set}</div></td>
          </tr>
        ))}
      </Table>
      <div style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>Đọc biên nhận bằng Foundry (ví dụ giao dịch đầu)</span><CopyButton value={cmd} label="Chép lệnh" /></div>
        <pre className="ev-pre">{cmd}</pre>
      </div>
      <p className="ev-small" style={{ marginTop: 12 }}>Giao dịch của khoá đã bị khoá bị nút từ chối ngay từ cửa nên không có mã băm; chỉ chứng minh được qua vai trò đọc ra 0 ở bảng khoá phía trên. Chi tiết: docs/EVIDENCE_TXS.md.</p>
    </Section>
  );
}

function Funds() {
  return (
    <Section id="ev-quy" accent={A} title="Quỹ trên C-Chain" sub={`Mạng thử Fuji (mã ${CCHAIN_ID}). Bấm để mở Snowtrace và kiểm chứng.`}>
      <Table head={["Mục", "Địa chỉ", "Xem trên"]}>
        {CCHAIN_FUNDS.map((f) => (
          <tr key={f.id}><td><Name n={f} /></td><td><Addr a={f.address} /></td>
            <td><a href={snowtraceAddress(f.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontWeight: 700, color: "#0b5e9c" }}>Snowtrace<ExternalLink size={12} aria-hidden /><span className="sr-only">(mở ở tab mới)</span></a></td></tr>
        ))}
      </Table>
      <p className="ev-small" style={{ marginTop: 12 }}>Quỹ chung là ví đa chữ ký 3 trên 5: cần ít nhất 3 trong 5 chủ ví cùng ký mới chi được. Số dư xem trực tiếp trên Snowtrace (RPC công khai: <span className="ev-mono">{CCHAIN_RPC}</span>).</p>
    </Section>
  );
}

function SelfCheck({ rpc }: { rpc: string }) {
  const url = rpc || "$RPC";
  const key = MINH_KEYS[0]!;
  const cmds: Array<[string, string]> = [
    ["Mã chuỗi (kỳ vọng 0xce62d)", curlCmd(url, "eth_chainId", "[]")],
    ["Mã chạy tại hợp đồng Kho chi tiêu (khác 0x là có mã)", curlCmd(url, "eth_getCode", `["${L1_CONTRACTS[1]!.address}","latest"]`)],
    ["Vai trò gửi giao dịch của khoá anh Minh (0 là bị chặn, 1 là được gửi)", curlCmd(url, "eth_call", `[{"to":"${TX_ALLOWLIST}","data":"${readAllowListData(key.address)}"},"latest"]`)],
  ];
  return (
    <Section id="ev-tu-kiem" accent={A} title="Tự kiểm bằng lệnh" sub="Dán vào terminal, không cần cài gì thêm ngoài curl.">
      {rpc ? null : <p className="ev-note" style={{ marginTop: 0, marginBottom: 12 }}>Chưa có địa chỉ RPC cấu hình. Đặt <code className="ev-mono">RPC=địa-chỉ-RPC-của-Guardian-L1</code> trước khi chạy các lệnh dưới đây.</p>}
      <div className="grid gap-4">
        {cmds.map(([title, cmd]) => (
          <div key={title}>
            <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}><span style={{ fontWeight: 700 }}>{title}</span><CopyButton value={cmd} label="Chép lệnh" /></div>
            <pre className="ev-pre">{cmd}</pre>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Evidence() {
  const rpc = configuredL1Rpc();
  const ev = useChainEvidence(rpc);
  const failing = ev && ev.chainId.state === "error" && ev.block.state === "error";
  return (
    <div className="ev-wrap">
      {!rpc ? <div role="status" className="ev-note" style={{ margin: 0 }}>{NO_RPC_BANNER}. Các địa chỉ dưới đây là bản đã chốt khi triển khai.</div> : null}
      {failing ? <div role="alert" className="ev-note" data-t="bad" style={{ margin: 0 }}>Không đọc được từ RPC ({ev.chainId.state === "error" ? ev.chainId.message : ""}). Các ô bên dưới giữ nguyên trạng thái lỗi, không có số giả.</div> : null}
      <Network ev={ev} rpc={rpc} />
      <Contracts ev={ev} />
      <Keys ev={ev} />
      <SampleTxs rpc={rpc} />
      <Funds />
      <SelfCheck rpc={rpc} />
      {ev?.checkedAt ? <p className="ev-small" style={{ margin: 0 }}>Đọc lần cuối lúc {new Date(ev.checkedAt).toLocaleTimeString("vi-VN")}, tự làm mới mỗi 8 giây.</p> : null}
    </div>
  );
}

export default Evidence;
