// Building blocks of one proposal on the Hội đồng tab: before/after, plain-words calls, risk report, approvals, timelock, execution seal, composer.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useActions } from "../../../hooks/useActions";
import { useGraph } from "../../../hooks/useGraph";
import { ApiError, api } from "../../../lib/api";
import { policyLabel } from "../../../lib/policy";
import { isWalletApproveEnabled, walletEnv } from "../../../lib/wallet/config";
import { MEMBER_FULL, approvalSlots, beforeAfter, type MetricBA } from "../../../shared/requests/logic";
import { FaceAvatar, Stamp, ToyButton } from "../../../stage/ui";
import { secondsToEta } from "../../../stage/TimelockBanner";
import { WalletApproveButton } from "../../../stage/WalletApproveButton";
import type { Call, CouncilMember, DraftProposalRequest, Finding, MemberId, Proposal } from "../../../types";
import { toast } from "../../../store/uiStore";
import { apiErrorVi, executorOf, isBenignApiError, timelockTotal, timelockView } from "../proposals.logic";
import { ACCENT, Empty, Hash } from "../ui";

export const PROPOSER: MemberId = "lan";

/** Council actions with one in flight at a time (a fast double click sends once) and errors in plain Vietnamese, no raw codes. */
function useCouncilAct() {
  const qc = useQueryClient();
  const inflight = useRef(false);
  const m = useMutation({
    mutationFn: (v: { kind: "approve" | "execute" | "veto"; id: number; member: MemberId }) =>
      v.kind === "approve" ? api.approveProposal(v.id, v.member) : v.kind === "execute" ? api.executeProposal(v.id, v.member) : api.vetoProposal(v.id, v.member),
    onSuccess: (_d, v) => { void qc.invalidateQueries(); if (v.kind === "veto") toast.warning("Đã phủ quyết đề xuất"); },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      if (isBenignApiError(code)) toast.info(apiErrorVi(code)); else toast.error(apiErrorVi(code));
      void qc.invalidateQueries();
    },
    onSettled: () => { inflight.current = false; },
  });
  const run = (v: { kind: "approve" | "execute" | "veto"; id: number; member: MemberId }) => { if (inflight.current) return; inflight.current = true; m.mutate(v); };
  return { run, pending: m.isPending, member: m.isPending ? m.variables?.member ?? null : null };
}

const GLYPH = { ok: "▼ ", bad: "▲ ", muted: "" } as const;
function metricTile(m: MetricBA, k: string) {
  return (
    <div key={k} className="sx-tile" data-tone={m.tone === "muted" ? undefined : m.tone}>
      <span className="k">{k}</span>
      <span className="v">{GLYPH[m.tone]}{m.afterDisplay}</span>
      <span className="s tnum">trước {m.beforeDisplay} ({m.delta.text}) · quỹ chính {m.beforePctText} → {m.afterPctText}</span>
    </div>
  );
}

/** Chain-enforced and estimated exposure before -> after, with the share of the main treasury. */
export function BeforeAfter({ report, treasury }: { report: Pick<Proposal, "riskReport">; treasury?: bigint }) {
  const { enforced, estimated, gap } = beforeAfter(report, treasury);
  return (
    <div data-tour="sys-before-after">
      <h3 className="px-h">Trước và sau</h3>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {metricTile(enforced, "Chain chặn")}
        {metricTile(estimated, "Ước tính")}
        {gap.visible ? (
          <div className="sx-tile" data-tone={gap.closes ? "ok" : "warn"} title="Rủi ro thật trừ phần chain chặn">
            <span className="k">Khoảng mù</span>
            <span className="v">{gap.afterDisplay}</span>
            <span className="s tnum">trước {gap.beforeDisplay}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** calls[] in plain Vietnamese, each with its small contract-call chip. */
export function PlainCalls({ calls, describe }: { calls: Call[]; describe: string[] }) {
  return (
    <div data-tour="sys-changes">
      <h3 className="px-h">Thay đổi bằng lời thường</h3>
      <ol className="px-lines">
        {describe.map((text, i) => (
          <li key={i}><span className="n">{i + 1}</span><span style={{ minWidth: 0, flex: 1 }}>{text}</span>{calls[i] ? <code className="mono">{calls[i].fn}</code> : null}</li>
        ))}
      </ol>
    </div>
  );
}

const WARN_TITLE = { CONFLICT_OF_INTEREST: "Xung đột lợi ích", CONCENTRATION: "Quyền dồn về một chỗ", DATA_DECLARED: "Dữ liệu tự khai" } as const;
export function Warnings({ proposal }: { proposal: Pick<Proposal, "warnings" | "conflictedMembers"> }) {
  if (!proposal.warnings.length) return null;
  const who = proposal.conflictedMembers.map((m) => MEMBER_FULL[m]).join(", ");
  return (
    <div className="grid gap-1.5">
      {proposal.warnings.map((w, i) => (
        <div key={i} className="sx-callout" data-t={w.code === "CONFLICT_OF_INTEREST" ? undefined : "amber"} role="alert" style={{ marginBottom: 0 }}>
          <b>⚠ {WARN_TITLE[w.code]}</b>{w.code === "CONFLICT_OF_INTEREST" && who ? <span>· không được duyệt: {who}</span> : null}
          <span style={{ fontWeight: 500 }}>{w.text}</span>
        </div>
      ))}
    </div>
  );
}

const FindingList = ({ items, empty }: { items: Finding[]; empty: string }) => (
  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
    {items.length ? items.map((f) => (
      <li key={f.id} className="px-note" data-t={f.severity === "HIGH" ? "bad" : undefined}><b className="g">{f.severity === "HIGH" ? "✕" : "▲"}</b><span>{f.title}</span></li>
    )) : <li className="px-note" data-t="ok"><b className="g">✓</b><span>{empty}</span></li>}
  </ul>
);

/** Frozen risk report: findings before -> after and the hash that is written on chain at propose time. */
export function RiskReport({ report, hash }: { report: Proposal["riskReport"]; hash: string }) {
  return (
    <div data-tour="sys-risk-report">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ marginBottom: 8 }}>
        <h3 className="px-h" style={{ margin: 0 }}>Báo cáo rủi ro đã đóng băng</h3>
        <span className="px-label">bằng chứng</span><Hash value={hash} head={10} tail={8} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div><div className="px-label" style={{ marginBottom: 4 }}>Phát hiện trước</div><FindingList items={report.findingsBefore} empty="Không có phát hiện" /></div>
        <div><div className="px-label" style={{ marginBottom: 4 }}>Phát hiện sau</div><FindingList items={report.findingsAfter} empty="Không còn phát hiện nào" /></div>
      </div>
      {report.conflictOfInterest ? <p style={{ margin: "8px 0 0", color: "var(--red-ink)", fontWeight: 700, fontSize: 12.5 }}>✕ Cờ xung đột lợi ích: bật</p> : null}
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-2)" }}>Băm keccak256 của báo cáo được ghi lên chain lúc đề xuất, nên không ai sửa số sau lưng người duyệt.</p>
    </div>
  );
}

const hasWallet = () => typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;

/** 3 council seats, demo-mode approve buttons, the wallet button and the conflict-of-interest block. */
export function Approvals({ proposal: p, members, demoMode }: { proposal: Proposal; members: Pick<CouncilMember, "id" | "label">[]; demoMode: boolean }) {
  const act = useCouncilAct();
  const slots = approvalSlots(p, members);
  const have = p.approvals.length, need = p.threshold;
  const [bypass, setBypass] = useState<{ code: string; message: string } | null>(null);
  const conflicted = slots.find((s) => s.state === "conflict");
  const open = p.status === "open";
  const tryDirect = async (m: MemberId) => {
    try { await api.approveProposal(p.id, m); setBypass(null); }
    catch (e) { const code = e instanceof ApiError ? e.code : "ERROR"; setBypass({ code, message: apiErrorVi(code) }); }
  };
  const walletOn = open && !p.queued && isWalletApproveEnabled(walletEnv, hasWallet());
  return (
    <div data-tour="sys-approvals">
      <div className="flex items-baseline gap-2">
        <h3 className="px-h" style={{ margin: 0 }}>Phiếu duyệt</h3>
        <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 26, color: have >= need ? "var(--ok-ink)" : ACCENT.council }}>{have}/{need}</span>
        <span className="px-label">cần {need} trên {members.length || 3} người, không ai trong khu bị ảnh hưởng được tự duyệt</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {slots.map((s) => (
          <div key={s.member} className="flex items-center gap-3" data-member={s.member} data-state={s.state}>
            <FaceAvatar member={s.member} size={34} dim={s.state !== "approved"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                {s.label}{p.proposer === s.member ? <span className="px-label"> · người đề xuất</span> : null}{" "}
                <span style={{ fontWeight: 700, fontSize: 12.5, color: s.state === "approved" ? "var(--ok-ink)" : s.state === "conflict" ? "var(--red-ink)" : "var(--ink-2)" }}>
                  {s.state === "approved" ? "· đã duyệt" : s.state === "conflict" ? "· không được duyệt" : "· chưa duyệt"}
                </span>
              </div>
              {s.state === "conflict" ? <div data-tour="sys-conflict" style={{ fontSize: 12, color: "var(--red-ink)" }}><b>✕</b> {s.disabledReason}</div> : null}
            </div>
            {demoMode ? (
              <span data-tour={`sys-approve-${s.member}`}>
                <ToyButton size="xs" color={s.state === "conflict" ? "cream" : "green"} disabled={!s.canApprove || act.pending} title={s.disabledReason} done={s.state === "approved"}
                  onClick={() => act.run({ kind: "approve", id: p.id, member: s.member })}>
                  {s.state === "approved" ? "✓ Đã duyệt" : `Duyệt: ${s.label.replace(/^(Chị|Anh) /, "")}`}
                </ToyButton>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {demoMode && open ? <p className="px-label" style={{ margin: "8px 0 0" }}>Chế độ demo: backend giữ khoá thử của 3 thành viên nên bấm thay họ được.</p> : null}
      {walletOn ? <div style={{ marginTop: 8 }}><p className="px-label" style={{ margin: 0 }}>Hoặc thành viên tự ký bằng ví của mình, backend không ký phiếu này.</p><WalletApproveButton proposalId={p.id} /></div> : null}
      {!demoMode && open && !walletOn ? <p className="px-label" style={{ margin: "8px 0 0" }}>Chờ các thành viên Hội đồng ký bằng ví của họ.</p> : null}
      {demoMode && conflicted && open ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => void tryDirect(conflicted.member)} className="px-label" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline dotted" }}>
            Thử bỏ qua giao diện: gọi thẳng contract bằng ví {conflicted.label}
          </button>
          {bypass ? (
            <div role="alert" className="sx-callout mt-2">
              <b className="mono">execution reverted: {bypass.code === "CONFLICT_OF_INTEREST" ? "ConflictOfInterest()" : bypass.code}</b><span style={{ fontWeight: 500 }}>{bypass.message}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Ticks once a second; unix seconds. */
function useNowSec(): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 500); return () => clearInterval(t); }, []);
  return now;
}

/** Timelock (#77): 2/3 reached -> wait until eta; anyone on the Council may veto meanwhile, anyone may execute after eta. */
export function Timelock({ proposal: p, members, demoMode }: { proposal: Proposal; members: Pick<CouncilMember, "id" | "label">[]; demoMode: boolean }) {
  const act = useCouncilAct();
  const nowSec = useNowSec();
  const seen = useRef(0);
  const view = timelockView(p, nowSec);
  if (!view || p.eta == null) return null;
  const left = secondsToEta(p.eta, nowSec * 1000);
  seen.current = Math.max(seen.current, left);
  const total = timelockTotal(p, seen.current); // real delay (eta minus the approval that queued it), so opening late still shows true progress
  const exec = executorOf(p, members);
  return (
    <div className="px-timelock" data-tour="sys-timelock" data-timelock={p.id} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-toy" style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>
          {view.ready ? "Đã đủ 2/3 · hết giờ chờ, áp dụng được rồi" : `Đã đủ 2/3 · chờ ${total} giây rồi mới áp dụng`}
        </div>
        <div className="font-toy tnum" style={{ fontSize: 32, fontWeight: 800, color: "var(--amber-ink)" }} data-countdown>{view.ready ? "0s" : `${left}s`}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber-ink)" }}>{view.ready ? "Hệ thống sẽ tự thực thi, hoặc bấm tay ngay bây giờ." : "Một thành viên vẫn chặn được trong lúc chờ."}</div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden", margin: "8px 0" }} aria-hidden>
        <div style={{ height: "100%", borderRadius: 999, background: "var(--amber)", width: `${Math.min(100, Math.max(0, 100 - (left / total) * 100))}%`, transition: "width 250ms linear" }} />
      </div>
      {demoMode ? (
        <div className="flex flex-wrap items-center gap-2">
          {view.ready && exec ? <ToyButton size="xs" color="green" disabled={act.pending} onClick={() => act.run({ kind: "execute", id: p.id, member: exec })}>Thực thi</ToyButton> : null}
          {members.map((m) => (
            <ToyButton key={m.id} size="xs" color="red" disabled={act.pending} icon={<FaceAvatar member={m.id} size={20} />} onClick={() => act.run({ kind: "veto", id: p.id, member: m.id })}>
              {m.label.replace(/^(Chị|Anh) /, "")} phủ quyết
            </ToyButton>
          ))}
        </div>
      ) : <p className="px-label" style={{ margin: 0 }}>Thành viên Hội đồng phủ quyết bằng ví của họ; hết giờ hệ thống tự thực thi.</p>}
    </div>
  );
}

/** Execution seal: the stamp thumps once on the open -> executed transition, then a permanent banner. */
export function ExecutedSeal({ proposal: p, txHash, simulated }: { proposal: Proposal; txHash?: string; simulated?: boolean }) {
  const { data: graph } = useGraph();
  const version = p.resultingPolicyVersion ?? policyLabel(graph) ?? null;
  const prev = useRef(p.status);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = p.status;
    if (was === "open" && p.status === "executed") { setBurst(true); const t = setTimeout(() => setBurst(false), 2600); return () => clearTimeout(t); }
  }, [p.status]);
  if (p.status !== "executed") return null;
  const hash = p.executedTxHash ?? txHash;
  return (
    <div className="px-seal" data-tour="sys-executed">
      {burst ? <Stamp sub={`chính sách v${version ?? "?"}`}>ĐÃ THỰC THI</Stamp> : null}
      <b className="font-toy" style={{ fontSize: 17, color: "var(--ok-ink)" }}>Đã thực thi · chính sách v{version ?? "?"}</b>
      <span className="px-label">Hội đồng duyệt đủ {p.threshold} phiếu{p.executedAt ? `, ${new Date(p.executedAt * 1000).toLocaleTimeString("vi-VN", { hour12: false })}` : ""}.</span>
      {hash ? <Hash value={hash} simulated={simulated} /> : null}
      <Link to="/he-thong/chinh-sach" style={{ marginLeft: "auto", fontWeight: 700, color: "var(--ok-ink)" }}>Xem chính sách mới</Link>
    </div>
  );
}

/** Draft preview + send: the draft comes from the backend (frozen report), the proposer is the demo member Lan. */
export function Composer({ req, treasury, onSent, onCancel }: { req: DraftProposalRequest; treasury?: bigint; onSent: (id: number) => void; onCancel: () => void }) {
  const actions = useActions();
  const q = useQuery({ queryKey: ["sys-draft", req], queryFn: () => api.draftProposal(req), staleTime: 0, gcTime: 0 });
  const d = q.data;
  const send = async () => { const p = await actions.createProposal.mutateAsync({ ...req, member: PROPOSER }); onSent(p.id); };
  return (
    <div className="px-card grid gap-4" data-tour="sys-composer" style={{ borderTop: `6px solid ${ACCENT.council}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="px-label" style={{ color: ACCENT.council }}>Bản nháp đề xuất</div>
          <h3 className="font-toy" style={{ margin: "2px 0 0", fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>{d ? d.title : "Đang soạn…"}</h3>
          <p className="px-label" style={{ margin: "4px 0 0" }}>Đã chạy giả lập trước và sau. Xem báo cáo rồi gửi Hội đồng duyệt.</p>
        </div>
        <ToyButton size="xs" color="cream" onClick={onCancel}>Huỷ</ToyButton>
      </div>
      {q.isError ? <div className="sx-callout" role="alert">Không soạn được bản nháp. Có thể phát hiện này đã được xử lý. <ToyButton size="xs" color="cream" onClick={() => void q.refetch()}>Thử lại</ToyButton></div> : null}
      {!d && !q.isError ? <Empty>Đang chạy giả lập…</Empty> : null}
      {d ? (
        <>
          <Warnings proposal={d} />
          <BeforeAfter report={d} treasury={treasury} />
          <PlainCalls calls={d.calls} describe={d.descriptionVi} />
          <RiskReport report={d.riskReport} hash={d.riskReportHash} />
          <div className="flex flex-wrap items-center gap-3">
            <ToyButton color="violet" disabled={actions.createProposal.isPending} onClick={() => void send()}>Gửi đề xuất ({MEMBER_FULL[PROPOSER]} đề xuất)</ToyButton>
            <span className="px-label">{d.classification === "tighten" ? "Siết: một thành viên là đủ." : "Nới: cần 2/3 Hội đồng."}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export const Block = ({ children, tone }: { children: ReactNode; tone?: "bad" | "ok" }) => <div className="px-card" data-tone={tone}>{children}</div>;
