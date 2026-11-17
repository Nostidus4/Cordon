// Proposals on the Hội đồng tab: list (+ fixes suggested by findings) on the left, one proposal in full on the right. Selection lives in the URL (?id=N).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useEvents } from "../../../hooks/useEvents";
import { useFindings } from "../../../hooks/useFindings";
import { useOrg } from "../../../hooks/useOrg";
import { useProposals } from "../../../hooks/useProposals";
import { rawToBig } from "../../../lib/format";
import { MAIN_TREASURY_DEFAULT, MEMBER_FULL, changeKindLabel, beforeAfter, isRiskIncrease } from "../../../shared/requests/logic";
import { useUiStore } from "../../../store/uiStore";
import type { DraftProposalRequest, Proposal } from "../../../types";
import { isScene5, linkedScene5, pickProposalId, suggestionsFrom } from "../proposals.logic";
import { ACCENT, Chip, Empty } from "../ui";
import { Approvals, BeforeAfter, Composer, ExecutedSeal, PlainCalls, RiskReport, Timelock, Warnings } from "./ProposalsParts";
import { Scene5Side } from "./ProposalsScene5";

const STATUS = { open: { t: "violet", text: "chờ duyệt" }, executed: { t: "ok", text: "đã thực thi" }, cancelled: { t: "grey", text: "đã huỷ" } } as const;
const OC = { open: ACCENT.council, executed: "#22c55e", cancelled: "#b9ad93" } as const;

function Row({ p, selected, treasury, onSelect }: { p: Proposal; selected: boolean; treasury: bigint; onSelect: () => void }) {
  const est = beforeAfter(p, treasury).estimated;
  const st = p.queued && p.status === "open" ? { t: "warn" as const, text: "đang chờ giờ áp dụng" } : STATUS[p.status];
  return (
    <button type="button" className="sx-row" data-sel={selected} aria-current={selected ? "true" : undefined} onClick={onSelect} style={{ ["--oc" as string]: OC[p.status] }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="font-toy" style={{ fontSize: 16 }}>#{p.id}</b>
        <Chip t={st.t}>{st.text}</Chip>
        <span className="tnum px-label" style={{ marginLeft: "auto" }}>{p.approvals.length}/{p.threshold} phiếu</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, margin: "3px 0" }}>{p.title}</div>
      <div className="tnum px-label">{est.beforeDisplay} → <b style={{ color: est.tone === "bad" ? "var(--red-ink)" : est.tone === "ok" ? "var(--ok-ink)" : "var(--ink)" }}>{est.afterDisplay}</b> · quỹ chính {est.beforePctText} → {est.afterPctText}</div>
    </button>
  );
}

function Detail({ p, all, treasury, onOpen, onDraft }: { p: Proposal; all: Proposal[]; treasury: bigint; onOpen: (id: number) => void; onDraft: (d: DraftProposalRequest) => void }) {
  const { data: org } = useOrg();
  const { data: events } = useEvents();
  const demoMode = useUiStore((s) => s.demoMode);
  const members = org?.council ?? [];
  const executedEv = (events ?? []).find((e) => e.name === "Executed" && e.payload.id === p.id);
  const up = isRiskIncrease(p);
  const scene5 = isScene5(p);
  return (
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: scene5 ? "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" : "minmax(0, 1fr)" }}>
      <div className="grid gap-4" style={{ minWidth: 0 }}>
        <div className="px-card" data-tone={p.status === "executed" ? "ok" : p.conflictedMembers.length ? "bad" : undefined} style={{ borderTop: `6px solid ${OC[p.status]}` }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-toy" style={{ fontWeight: 800, fontSize: 22 }}>Đề xuất #{p.id}</span>
            <Chip t={STATUS[p.status].t}>{STATUS[p.status].text}</Chip>
            <Chip t="violet">{p.change ? changeKindLabel[p.change.kind] : "Khác"}</Chip>
            <Chip t={up ? "bad" : "ok"}>{up ? "▲ xin thêm quyền" : "▼ thu hẹp rủi ro"}</Chip>
          </div>
          <p className="font-toy" style={{ margin: "6px 0 4px", fontWeight: 800, fontSize: 20, lineHeight: 1.25 }}>{p.title}</p>
          <div className="px-label">{MEMBER_FULL[p.proposer]} đề xuất{p.subjectPrincipal ? <> · khu <b className="mono">{p.subjectPrincipal}</b></> : null} · {new Date(p.createdAt * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</div>
        </div>
        <ExecutedSeal proposal={p} txHash={executedEv?.txHash} simulated={executedEv?.simulated} />
        <Warnings proposal={p} />
        <div className="px-card"><BeforeAfter report={p} treasury={treasury} /></div>
        <div className="px-card"><PlainCalls calls={p.calls} describe={p.descriptionVi} /></div>
        <div className="px-card grid gap-3">
          <Approvals proposal={p} members={members} demoMode={demoMode} />
          <Timelock proposal={p} members={members} demoMode={demoMode} />
        </div>
        <div className="px-card"><RiskReport report={p.riskReport} hash={p.riskReportHash} /></div>
      </div>
      {scene5 ? <Scene5Side proposal={p} linked={linkedScene5(p, all)} onOpen={onOpen} onDraft={(change) => onDraft({ change })} treasury={treasury} /> : null}
    </div>
  );
}

export function Proposals() {
  const [sp, setSp] = useSearchParams();
  const { data: proposals, isLoading } = useProposals();
  const { data: findings } = useFindings();
  const { data: org } = useOrg();
  const list = useMemo(() => proposals ?? [], [proposals]);
  const treasury = org ? rawToBig(org.mainTreasury.balance) : MAIN_TREASURY_DEFAULT;
  const findingParam = sp.get("finding");
  const [draft, setDraft] = useState<DraftProposalRequest | null>(findingParam ? { findingId: findingParam } : null);
  useEffect(() => { if (findingParam) setDraft({ findingId: findingParam }); }, [findingParam]);

  const idParam = Number(sp.get("id")) || null;
  const selId = pickProposalId(list, idParam);
  const selected = list.find((p) => p.id === selId) ?? null;
  const suggestions = suggestionsFrom(findings, list);

  const select = (id: number) => { setDraft(null); setSp({ id: String(id) }); };
  const closeDraft = () => { setDraft(null); if (findingParam) setSp(selected ? { id: String(selected.id) } : {}, { replace: true }); };
  const sent = (id: number) => { setDraft(null); setSp({ id: String(id) }, { replace: true }); };

  // /he-thong/hoi-dong?id=N: bring that proposal into view once the list has loaded
  const detailRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef<number | null>(null);
  useEffect(() => {
    if (!idParam || !selected || selected.id !== idParam || scrolled.current === idParam) return;
    scrolled.current = idParam;
    const t = setTimeout(() => detailRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [idParam, selected]);

  const open = list.filter((p) => p.status === "open"), done = list.filter((p) => p.status !== "open");
  return (
    <div className="px-split">
      <aside className="px-list" data-tour="sys-proposals" aria-label="Danh sách đề xuất">
        {suggestions.length ? (
          <div className="px-list">
            <div className="px-label">Cordon gợi ý sửa</div>
            {suggestions.map((f) => (
              <button key={f.id} type="button" className="px-sugg" data-tour="sys-suggestion" onClick={() => setDraft({ findingId: f.id })}>
                <div className="flex items-center gap-2"><Chip t={f.severity === "HIGH" ? "bad" : "warn"}>{f.severity === "HIGH" ? "nặng" : "vừa"}</Chip><span className="mono px-label">{f.ruleId.split("_")[0]}</span></div>
                <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, margin: "3px 0" }}>{f.title}</div>
                <b style={{ fontSize: 12.5, color: ACCENT.council }}>Tạo đề xuất sửa</b>
              </button>
            ))}
          </div>
        ) : null}
        {isLoading ? <Empty>Đang tải…</Empty> : null}
        {open.length ? <><div className="px-label">Đang chờ duyệt · {open.length}</div>{open.map((p) => <Row key={p.id} p={p} treasury={treasury} selected={!draft && selId === p.id} onSelect={() => select(p.id)} />)}</> : null}
        {done.length ? <><div className="px-label" style={{ marginTop: 6 }}>Đã xử lý · {done.length}</div>{done.map((p) => <Row key={p.id} p={p} treasury={treasury} selected={!draft && selId === p.id} onSelect={() => select(p.id)} />)}</> : null}
        {!isLoading && !list.length && !suggestions.length ? <Empty>Chưa có đề xuất nào. Áp dụng chính sách v2 ở tab Tổng quan sẽ tạo đề xuất đầu tiên.</Empty> : null}
      </aside>
      <div ref={detailRef} style={{ minWidth: 0, scrollMarginTop: 12 }} aria-live="polite">
        {draft ? <Composer key={JSON.stringify(draft)} req={draft} treasury={treasury} onSent={sent} onCancel={closeDraft} />
          : selected ? <Detail key={selected.id} p={selected} all={list} treasury={treasury} onOpen={select} onDraft={setDraft} />
          : !isLoading ? <Empty>Chọn một đề xuất ở bên trái, hoặc bắt đầu từ một gợi ý sửa.</Empty> : null}
      </div>
    </div>
  );
}
