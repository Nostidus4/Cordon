// B05 "Trạm soi giao dịch" (CITY-003): a transaction is simulated BEFORE it is signed. Cream cards, little text, Vietnamese;
// the technical names live only in the muted "Bên trong" line. Gửi signs through the normal spend path (chain rules still apply), Từ chối never sends.
import { useMemo, useState } from "react";
import { useGraph } from "../hooks/useGraph";
import { useHealth } from "../hooks/useHealth";
import { useCheckTx, useRejectTx, useSendTx, useTxChecks } from "../hooks/useTxGuard";
import { ApiError } from "../lib/api";
import { reasonVi, type ReasonCode } from "../shared/reasonCodes";
import type { TxCheck, TxKind, TxLevel } from "../types";
import { KIND_VI, LEVEL_VI, SOURCE_VI, STATUS_VI, buildPrepared, formOptions, shortAddr, type TxForm } from "./txGuardLogic";
import { ToyButton } from "./ui";

const TONE: Record<TxLevel, { dot: string; soft: string; ink: string }> = {
  safe: { dot: "var(--green)", soft: "var(--teal-soft)", ink: "var(--teal-ink)" },
  caution: { dot: "var(--amber)", soft: "var(--amber-soft)", ink: "var(--amber-ink)" },
  danger: { dot: "var(--red)", soft: "var(--red-soft)", ink: "var(--red-ink)" },
};
const EMPTY: TxForm = { kind: "pay", signer: "", token: "", tokenOut: "", to: "", amount: "", minOut: "", data: "" };
const inputCls = "w-full rounded-[12px] border-2 bg-white px-2.5 py-1.5 text-[13px] font-semibold";
const inputStyle = { borderColor: "#ecdcbc", color: "var(--ink)" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-0.5 text-[12px] font-bold" style={{ color: "var(--ink-2)" }}>{label}{children}</label>;
}

function CheckForm() {
  const graph = useGraph();
  const opts = useMemo(() => formOptions(graph.data?.nodes ?? []), [graph.data]);
  const [f, setF] = useState<TxForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const check = useCheckTx();
  const set = (patch: Partial<TxForm>) => setF((p) => ({ ...p, ...patch }));
  const decimalsOf = (ref: string) => opts.tokens.find((t) => t.ref === ref)?.decimals ?? 6;
  const targets = f.kind === "swap" ? opts.protocols : opts.recipients;
  const submit = () => {
    const r = buildPrepared(f, decimalsOf);
    if ("error" in r) { setError(r.error); return; }
    setError(null);
    check.mutate(r.tx, { onError: (e) => setError(e instanceof ApiError ? e.message : "Chưa soi được giao dịch này.") });
  };
  return (
    <div className="flex flex-col gap-2 rounded-[16px] p-2.5" style={{ background: "#fff8ea", border: "2px dashed #ecdcbc" }} data-txguard-form>
      <div className="toy-pill-toggle flex-wrap self-start" role="tablist" aria-label="Loại giao dịch">
        {(Object.keys(KIND_VI) as TxKind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={f.kind === k} aria-pressed={f.kind === k} onClick={() => set({ kind: k })} style={{ minHeight: 34, padding: "4px 11px 3px", fontSize: 13 }}>{KIND_VI[k]}</button>
        ))}
      </div>
      <Field label="Thẻ ký">
        <select className={inputCls} style={inputStyle} value={f.signer} onChange={(e) => set({ signer: e.target.value })}>
          <option value="">Chọn thẻ…</option>
          {opts.keys.map((k) => <option key={k.ref} value={k.ref}>{k.label}</option>)}
        </select>
      </Field>
      <Field label={f.kind === "swap" ? "Sàn đổi" : f.kind === "approve" ? "Bên được cấp quyền" : f.kind === "raw" ? "Gọi tới" : "Người nhận"}>
        <input className={inputCls} style={inputStyle} list="txg-targets" value={f.to} onChange={(e) => set({ to: e.target.value })} placeholder="Chọn hoặc dán địa chỉ" />
        <datalist id="txg-targets">{(f.kind === "raw" ? [...opts.recipients, ...opts.protocols, ...opts.tokens] : targets).map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}</datalist>
      </Field>
      {f.kind === "raw" ? (
        <Field label="Dữ liệu lệnh"><input className={inputCls} style={inputStyle} value={f.data} onChange={(e) => set({ data: e.target.value })} placeholder="0x…" /></Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={f.kind === "swap" ? "Tiền đưa vào" : "Loại tiền"}>
              <select className={inputCls} style={inputStyle} value={f.token} onChange={(e) => set({ token: e.target.value })}>
                <option value="">Chọn…</option>
                {opts.tokens.map((t) => <option key={t.ref} value={t.ref}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Số tiền"><input className={inputCls} style={inputStyle} inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="1.000" /></Field>
          </div>
          {f.kind === "swap" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tiền nhận về">
                <select className={inputCls} style={inputStyle} value={f.tokenOut} onChange={(e) => set({ tokenOut: e.target.value })}>
                  <option value="">Chọn…</option>
                  {opts.tokens.map((t) => <option key={t.ref} value={t.ref}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Nhận tối thiểu"><input className={inputCls} style={inputStyle} inputMode="decimal" value={f.minOut} onChange={(e) => set({ minOut: e.target.value })} placeholder="Để trống = không đặt" /></Field>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="m-0 text-[12.5px] font-bold" role="alert" style={{ color: "var(--red-ink)" }}>{error}</p> : null}
      <ToyButton color="violet" size="sm" onClick={submit} disabled={check.isPending}>{check.isPending ? "Đang soi…" : "Soi giao dịch"}</ToyButton>
    </div>
  );
}

function Flow({ sign, items }: { sign: string; items: { token: string; amount: { display: string } }[] }) {
  return <>{items.map((x, i) => <div key={`${sign}${i}`} className="text-[12.5px] font-bold" style={{ color: "var(--ink)" }}>{sign} {x.amount.display} {x.token.startsWith("0x") ? "tiền lạ" : x.token}</div>)}</>;
}

function CheckCard({ c, demo }: { c: TxCheck; demo: boolean }) {
  const send = useSendTx(), reject = useRejectTx();
  const tone = TONE[c.level], d = c.diff;
  const err = [send.error, reject.error].find(Boolean);
  const busy = send.isPending || reject.isPending;
  return (
    <article className="flex flex-col gap-1.5 rounded-[16px] p-2.5" style={{ background: tone.soft, border: `2px solid ${tone.dot}` }} data-tx-check={c.id} data-level={c.level} data-status={c.status}>
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ background: tone.dot, boxShadow: "0 0 0 2px #fff" }} aria-hidden />
        <span className="flex-1 text-[14px] font-bold" style={{ color: tone.ink }}>{LEVEL_VI[c.level]} · {KIND_VI[c.prepared.kind]}</span>
        {c.prepared.source !== "paste" ? <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-bold" style={{ color: "var(--ink-2)" }}>{SOURCE_VI[c.prepared.source]}</span> : null}
      </div>
      <div className="flex flex-col gap-0.5 rounded-[12px] bg-white/70 px-2 py-1" data-diff>
        <Flow sign="Ra" items={d.outflows} />
        <Flow sign="Vào" items={d.inflows} />
        {d.approvals.map((a, i) => <div key={i} className="text-[12.5px] font-bold" style={{ color: "var(--ink)" }}>Quyền: {a.unlimited ? "không giới hạn" : a.amount.display} {a.token.startsWith("0x") ? "tiền lạ" : a.token}</div>)}
        <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>Tới: {d.recipientLabel ?? (d.recipientKnown ? "địa chỉ đã duyệt" : "địa chỉ lạ")}</div>
        {d.chainReason ? <div className="text-[12.5px] font-bold" style={{ color: "var(--red-ink)" }}>Hợp đồng sẽ chặn: {reasonVi(d.chainReason)}</div> : null}
      </div>
      {c.findings.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Cảnh báo">
          {c.findings.map((f) => <li key={f.ruleId} title={f.detailVi} data-rule={f.ruleId} className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#fff", color: f.level === "danger" ? "var(--red-ink)" : "var(--amber-ink)", border: `2px solid ${f.level === "danger" ? "var(--red)" : "var(--amber)"}` }}>{f.titleVi}</li>)}
        </ul>
      ) : null}
      <p className="m-0 text-[13px] leading-snug" style={{ color: "var(--ink)" }} data-explanation>{c.explanationVi}</p>
      {c.status === "pending" ? (
        <div className="flex gap-2">
          <ToyButton color="red" size="sm" disabled={busy} onClick={() => reject.mutate(c.id)}>Từ chối</ToyButton>
          <ToyButton color="cream" size="sm" disabled={busy || !demo} title={demo ? undefined : "Chỉ gửi được ở chế độ demo"} onClick={() => send.mutate(c.id)}>Gửi</ToyButton>
        </div>
      ) : (
        <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--ink-2)" }}>
          {STATUS_VI[c.status]}{c.sentTx ? (c.sentTx.ok ? " · chain đã nhận" : ` · chain chặn: ${reasonVi(c.sentTx.reasonCode as ReasonCode) || "bị từ chối"}`) : ""}
        </p>
      )}
      {err ? <p className="m-0 text-[12.5px] font-bold" role="alert" style={{ color: "var(--red-ink)" }}>{err instanceof ApiError ? err.message : "Chưa làm được."}</p> : null}
      <p className="m-0 text-[11px] font-semibold" style={{ color: "var(--ink-2)" }} data-inside>Bên trong: soi #{c.id}{d.simulated ? " · chain đã giả lập" : " · đọc từ dữ liệu lệnh"} · {shortAddr(d.recipient)}</p>
    </article>
  );
}

export function TxGuardPanel() {
  const checks = useTxChecks(6);
  const demo = !!useHealth().data?.demoMode;
  return (
    <section className="mt-3 flex flex-col gap-2 border-t-2 border-dashed pt-2.5" style={{ borderColor: "#ecdcbc" }} aria-label="Soi giao dịch trước khi ký" data-txguard-panel>
      <div className="toy-eyebrow" style={{ fontSize: 14 }}>Soi trước khi ký</div>
      <p className="toy-body m-0" style={{ fontSize: 12.5, lineHeight: 1.35 }}>Giao dịch được chạy thử trước. Bạn xem kết quả rồi mới quyết định gửi hay từ chối.</p>
      <CheckForm />
      {checks.data?.length ? (
        <div className="flex flex-col gap-2" role="list" aria-label="Các lần soi gần đây">
          {checks.data.map((c) => <div key={c.id} role="listitem"><CheckCard c={c} demo={demo} /></div>)}
        </div>
      ) : <p className="toy-body m-0" style={{ fontSize: 13 }}>{checks.isError ? "Chưa đọc được các lần soi." : "Chưa soi giao dịch nào."}</p>}
    </section>
  );
}
