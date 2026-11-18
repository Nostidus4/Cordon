// /bang-chung: judges can check the on-chain claims themselves. Live numbers come only from a real RPC (VITE_L1_RPC_URL,
// the read-only proxy); without it the page shows the frozen addresses and says so.
import { useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { Card, CardHeader, cn } from "../../components/ui";
import { useTitle } from "../../hooks/useTitle";
import {
  CCHAIN_FUNDS, CCHAIN_ID, CCHAIN_RPC, COUNCIL_MEMBERS, DEPLOYER, L1_CHAIN_ID, L1_CONTRACTS, L1_DEPLOY_BLOCK, L1_PRECOMPILES, MINH_KEYS,
  snowtraceAddress, TX_ALLOWLIST, type NamedAddress,
} from "./deployment";
import { configuredL1Rpc, curlCmd, readAllowListData, roleLabel } from "./rpc";
import { useChainEvidence, type Evidence, type Read } from "./useChainEvidence";
import { castReceiptCmd, SAMPLE_TXS, type SampleTx, type SampleView } from "./sampleTxs";
import { useSampleTxs } from "./useSampleTxs";

export const NO_RPC_BANNER = "Bản demo này chạy chain mô phỏng; số đọc trực tiếp chỉ có khi nối RPC của Guardian L1";

function CopyButton({ value, label = "Chép" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    try { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={`${label} ${value.slice(0, 12)}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-text">
      {done ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3" aria-hidden />}{done ? "Đã chép" : label}
    </button>
  );
}

const Addr = ({ a }: { a: string }) => (
  <span className="inline-flex min-w-0 max-w-full items-center gap-2"><code className="min-w-0 break-all font-mono text-xs text-text">{a}</code><CopyButton value={a} /></span>
);

const Name = ({ n }: { n: NamedAddress }) => (
  <div><div className="text-sm text-text">{n.label}</div><div className="font-mono text-[11px] text-faint">{n.code}</div></div>
);

function ReadCell<T>({ r, ok }: { r: Read<T> | undefined; ok: (v: T) => ReactNode }) {
  if (!r || r.state === "loading") return <span className="text-faint">Đang đọc…</span>;
  if (r.state === "error") return <span className="text-warn" title={r.message}>Không đọc được: {r.message}</span>;
  return <>{ok(r.value)}</>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <Card className="min-w-0 max-w-full"><CardHeader title={title} en={hint} />{children}</Card>;
}

const Table = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-left">
      <thead><tr className="border-b border-line text-xs text-faint">{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody className="[&>tr]:border-b [&>tr]:border-line/50 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top">{children}</tbody>
    </table>
  </div>
);

export const Mark = ({ ok }: { ok: boolean }) => (
  <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", ok ? "text-ok" : "text-bad")}>
    {ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}{ok ? "Có" : "Không"}
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

function Network({ ev, rpc }: { ev: Evidence | null; rpc: string }) {
  return (
    <Section title="Mạng Guardian L1" hint="Chuỗi riêng của dự án, không có trang xem công khai nên trang này tự đọc thẳng từ nút.">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-xs text-faint">Mã chuỗi</dt><dd className="font-mono text-lg text-text">{L1_CHAIN_ID} <span className="text-xs text-faint">(0x{L1_CHAIN_ID.toString(16)})</span></dd>
          {ev ? <dd className="mt-1 text-xs"><ReadCell r={ev.chainId} ok={(v) => <span className={v === L1_CHAIN_ID ? "text-ok" : "text-bad"}>{v === L1_CHAIN_ID ? "Nút trả lời đúng mã này" : `Nút trả mã khác: ${v}`}</span>} /></dd> : null}</div>
        <div><dt className="text-xs text-faint">Khối mới nhất</dt>
          <dd className="font-mono text-lg text-text">{ev ? <ReadCell r={ev.block} ok={(v) => v.toLocaleString("vi-VN")} /> : <span className="text-faint">chưa nối RPC</span>}</dd>
          <dd className="mt-1 text-xs text-faint">Hợp đồng được đăng từ khối {L1_DEPLOY_BLOCK}.</dd></div>
        <div><dt className="text-xs text-faint">Địa chỉ RPC</dt>
          <dd className="break-all font-mono text-xs text-text">{rpc || "Chưa cấu hình"}</dd>
          <dd className="mt-1 text-xs text-faint">{rpc ? "Cổng chỉ đọc: gửi giao dịch bị từ chối." : "Đặt VITE_L1_RPC_URL khi dựng trang để đọc trực tiếp."}</dd></div>
      </dl>
    </Section>
  );
}

function Contracts({ ev }: { ev: Evidence | null }) {
  const row = (c: NamedAddress, precompile: boolean) => (
    <tr key={c.id}>
      <td><Name n={c} /></td>
      <td><Addr a={c.address} /></td>
      <td className="whitespace-nowrap text-sm">{precompile ? <span className="text-faint">có sẵn trong chain</span> : ev ? <ReadCell r={ev.code[c.id]} ok={(v) => <span className="font-mono">{v.toLocaleString("vi-VN")} byte</span>} /> : <span className="text-faint">—</span>}</td>
      <td className="whitespace-nowrap">{ev ? <ReadCell r={ev.code[c.id]} ok={(v) => <Mark ok={v > 0} />} /> : <span className="text-faint">chưa đọc</span>}</td>
    </tr>
  );
  return (
    <Section title="Hợp đồng" hint="Có mã chạy tại địa chỉ đó thì cột cuối là Có. Kích thước mã đọc trực tiếp từ chain.">
      <Table head={["Hợp đồng", "Địa chỉ", "Kích thước mã", "Đang chạy?"]}>
        {L1_CONTRACTS.map((c) => row(c, false))}
        {L1_PRECOMPILES.map((c) => row(c, true))}
      </Table>
    </Section>
  );
}

function Keys({ ev }: { ev: Evidence | null }) {
  const group = (title: string, items: readonly NamedAddress[]) => (
    <>
      <tr><td colSpan={3} className="!pb-1 !pt-4 text-xs font-semibold uppercase tracking-wide text-faint">{title}</td></tr>
      {items.map((k) => (
        <tr key={k.id}>
          <td><Name n={k} /></td>
          <td><Addr a={k.address} /></td>
          <td>{ev ? <ReadCell r={ev.roles[k.address]} ok={(v) => <span className={cn("text-sm font-semibold", v === 0 ? "text-bad" : "text-ok")}>{v} · {roleLabel(v)}</span>} /> : <span className="text-faint">chưa đọc</span>}</td>
        </tr>
      ))}
    </>
  );
  return (
    <Section title="Khoá ở tầng giao thức" hint="Luật gửi giao dịch của chain: 0 là bị chặn, 1 là được gửi, 2 là quản trị.">
      <Table head={["Khoá", "Địa chỉ", "Vai trò đọc từ chain"]}>
        {group("5 khoá của anh Minh", MINH_KEYS)}
        {group("Hội đồng", COUNCIL_MEMBERS)}
        {group("Ví triển khai", [DEPLOYER])}
      </Table>
      <p className="mt-4 rounded-[var(--radius-md)] border border-line bg-white/5 p-3 text-sm text-muted">
        {ev ? rolesSentence(MINH_KEYS.map((k) => ev.roles[k.address])) : "Khi cả 5 khoá đọc ra 0, chain từ chối mọi giao dịch của chúng ngay từ cửa, trước khi vào block. Cần nối RPC để xem số thật."}
      </p>
    </Section>
  );
}

function SampleResult({ tx, view }: { tx: SampleTx; view: SampleView | undefined }) {
  const expected = tx.expect === "ok" ? "Thành công" : "Bị chặn";
  if (!view || view.state === "static") return <div><div className="text-sm text-muted">{expected} <span className="text-faint">(theo bản ghi, chưa đọc trực tiếp)</span></div><div className="mt-0.5 text-xs text-faint">{tx.outcome}</div></div>;
  if (view.state === "loading") return <span className="text-faint">Đang đọc…</span>;
  if (view.state === "error") return <span className="text-warn" title={view.message}>Không đọc được: {view.message}</span>;
  if (view.state === "missing") return <span className="text-bad">Nút không thấy giao dịch này</span>;
  const good = view.expectMatches && view.blockMatches;
  return (
    <div>
      <div className={cn("text-sm font-semibold", view.status === "success" ? "text-ok" : "text-bad")}>{view.statusLabel} <span className="font-normal text-faint">· khối {view.block.toLocaleString("vi-VN")}</span></div>
      <div className="mt-0.5 text-xs text-muted">{tx.outcome}</div>
      {good ? null : <div className="mt-0.5 text-xs text-warn">Kết quả đọc được khác với bản ghi ({expected} ở khối {tx.block.toLocaleString("vi-VN")}).</div>}
      {tx.inferred ? <div className="mt-0.5 text-xs text-faint">Lý do cụ thể suy ra từ chuỗi giao dịch trước đó (nút không còn giữ trạng thái cũ để chạy lại).</div> : null}
    </div>
  );
}

function SampleTxs({ rpc }: { rpc: string }) {
  const views = useSampleTxs(rpc);
  return (
    <Section title="Giao dịch mẫu trên chain" hint="Những giao dịch thật đã chạy trên Guardian L1: cho phép, bị chặn, khoá khẩn cấp, Hội đồng nới luật. Tra từng mã băm bằng lệnh bên dưới.">
      {rpc ? null : <p className="mb-3 text-sm text-muted">Chưa nối RPC nên danh sách này là bản ghi tĩnh, chưa đọc trực tiếp từ chain.</p>}
      <Table head={["Chứng minh điều gì", "Kết quả", "Mã băm giao dịch", "Hợp đồng"]}>
        {SAMPLE_TXS.map((t) => (
          <tr key={t.id}>
            <td className="max-w-[320px]"><div className="text-sm text-text">{t.label}</div><div className="mt-0.5 break-words font-mono text-[11px] text-faint">{t.detail}</div></td>
            <td><SampleResult tx={t} view={views[t.id]} /></td>
            <td><Addr a={t.hash} /><div className="mt-1 text-[11px] text-faint">Khối {t.block.toLocaleString("vi-VN")}</div></td>
            <td><div className="text-sm text-text">{t.contract}</div><div className="font-mono text-[11px] text-faint">{t.contractAddress.slice(0, 10)}…{t.contractAddress.slice(-4)}</div><div className="mt-0.5 text-[11px] text-faint">{t.set}</div></td>
          </tr>
        ))}
      </Table>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between gap-2"><span className="text-sm text-text">Đọc biên nhận bằng Foundry (ví dụ giao dịch đầu)</span><CopyButton value={castReceiptCmd(SAMPLE_TXS[0]!.hash, rpc)} label="Chép lệnh" /></div>
        <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-black/30 p-3 font-mono text-xs text-muted">{castReceiptCmd(SAMPLE_TXS[0]!.hash, rpc)}</pre>
      </div>
      <p className="mt-3 text-xs text-faint">Giao dịch của khoá đã bị khoá bị nút từ chối ngay từ cửa nên không có mã băm; chỉ chứng minh được qua vai trò đọc ra 0 ở bảng khoá phía trên. Chi tiết: docs/EVIDENCE_TXS.md.</p>
    </Section>
  );
}

function Funds() {
  return (
    <Section title="Quỹ trên C-Chain" hint={`Mạng thử Fuji (mã ${CCHAIN_ID}). Bấm để mở Snowtrace và kiểm chứng.`}>
      <Table head={["Mục", "Địa chỉ", "Xem trên"]}>
        {CCHAIN_FUNDS.map((f) => (
          <tr key={f.id}><td><Name n={f} /></td><td><Addr a={f.address} /></td>
            <td><a href={snowtraceAddress(f.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">Snowtrace<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(mở ở tab mới)</span></a></td></tr>
        ))}
      </Table>
      <p className="mt-3 text-xs text-faint">Quỹ chung là ví đa chữ ký 3 trên 5: cần ít nhất 3 trong 5 chủ ví cùng ký mới chi được. Số dư xem trực tiếp trên Snowtrace (RPC công khai: <span className="font-mono">{CCHAIN_RPC}</span>).</p>
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
    <Section title="Tự kiểm bằng lệnh" hint="Dán vào terminal, không cần cài gì thêm ngoài curl.">
      {rpc ? null : <p className="mb-3 text-sm text-muted">Chưa có địa chỉ RPC cấu hình. Đặt <code className="font-mono">RPC=địa-chỉ-RPC-của-Guardian-L1</code> trước khi chạy các lệnh dưới đây.</p>}
      <div className="grid gap-4">
        {cmds.map(([title, cmd]) => (
          <div key={title}>
            <div className="mb-1 flex items-center justify-between gap-2"><span className="text-sm text-text">{title}</span><CopyButton value={cmd} label="Chép lệnh" /></div>
            <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-black/30 p-3 font-mono text-xs text-muted">{cmd}</pre>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function EvidencePage() {
  useTitle("Bằng chứng trên chain");
  const rpc = configuredL1Rpc();
  const ev = useChainEvidence(rpc);
  const failing = ev && ev.chainId.state === "error" && ev.block.state === "error";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-text">Bằng chứng trên chain</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">Mọi điều Cordon nói về luật chặn đều kiểm được trên chain. Trang này đọc trực tiếp từ nút Guardian L1, hoặc bạn tự chạy lệnh ở cuối trang.</p>
      </header>
      {!rpc ? <div role="status" className="rounded-[var(--radius-md)] border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-text">{NO_RPC_BANNER}. Các địa chỉ dưới đây là bản đã chốt khi triển khai.</div> : null}
      {failing ? <div role="alert" className="rounded-[var(--radius-md)] border border-bad/50 bg-bad-soft px-4 py-3 text-sm text-text">Không đọc được từ RPC ({ev.chainId.state === "error" ? ev.chainId.message : ""}). Các ô bên dưới giữ nguyên trạng thái lỗi, không có số giả.</div> : null}
      <Network ev={ev} rpc={rpc} />
      <Contracts ev={ev} />
      <Keys ev={ev} />
      <SampleTxs rpc={rpc} />
      <Funds />
      <SelfCheck rpc={rpc} />
      {ev?.checkedAt ? <p className="text-xs text-faint">Đọc lần cuối lúc {new Date(ev.checkedAt).toLocaleTimeString("vi-VN")}, tự làm mới mỗi 8 giây.</p> : null}
    </div>
  );
}
