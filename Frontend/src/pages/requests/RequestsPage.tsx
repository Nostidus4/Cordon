// Requests screen (spec §10.4, scenes 3 & 5): proposal list + detail, composer for drafts from Simulate/findings, scene-5 assistant.
//
// Entry contract for other screens ("Tạo đề xuất sửa" on Simulate / Map):
//   navigate("/requests", { state: { draft: { findingId } } })                      (preferred)
//   navigate("/requests", { state: { draft: { change } } })
//   or URL: /requests?finding=<findingId>   /requests?change=<encodeURIComponent(JSON ProposedChange)>
// Selection lives in the URL: /requests?id=12
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { FilePlus2, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Skeleton, StatusChip } from "../../components/ui";
import { useActions } from "../../hooks/useActions";
import { useFindings } from "../../hooks/useFindings";
import { useOrg } from "../../hooks/useOrg";
import { useProposals } from "../../hooks/useProposals";
import { useUiStore } from "../../store/uiStore";
import { rawToBig } from "../../lib/format";
import type { DraftProposalRequest, MemberId, ProposedChange } from "../../types";
import { Composer, PROPOSER } from "./Composer";
import { ProposalCard } from "./ProposalCard";
import { ProposalDetail } from "./ProposalDetail";
import { MAIN_TREASURY_DEFAULT } from "./logic";

function parseDraft(search: URLSearchParams, state: unknown): DraftProposalRequest | null {
  const st = (state as { draft?: DraftProposalRequest } | null)?.draft;
  if (st && (st.findingId || st.change)) return st;
  const f = search.get("finding");
  if (f) return { findingId: f };
  const c = search.get("change");
  if (c) { try { return { change: JSON.parse(c) as ProposedChange }; } catch { return null; } }
  return null;
}

export default function RequestsPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const { data: proposals, isLoading } = useProposals();
  const { data: findings } = useFindings();
  const { data: org } = useOrg();
  const demoMode = useUiStore((s) => s.demoMode);
  const a = useActions();
  const treasury = org ? rawToBig(org.mainTreasury.balance) : MAIN_TREASURY_DEFAULT;

  // draft: from router state / query on arrival; then owned locally
  const [draft, setDraft] = useState<DraftProposalRequest | null>(() => parseDraft(sp, loc.state));
  useEffect(() => {
    const d = parseDraft(sp, loc.state);
    if (d) setDraft(d);
  }, [loc.key, sp.get("finding"), sp.get("change")]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => proposals ?? [], [proposals]);
  const idParam = Number(sp.get("id")) || null;
  const defaultId = useMemo(() => {
    const open = list.filter((p) => p.status === "open").sort((x, y) => x.id - y.id);
    return (open[0] ?? list[0])?.id ?? null;
  }, [list]);
  const selected = list.find((p) => p.id === (idParam ?? defaultId)) ?? null;

  const select = (id: number) => { setDraft(null); nav(`/requests?id=${id}`, { replace: false }); };
  const closeDraft = () => { setDraft(null); if (sp.has("finding") || sp.has("change")) setSp(selected ? { id: String(selected.id) } : {}, { replace: true }); else if (loc.state) nav(loc.pathname + loc.search, { replace: true, state: null }); };
  const openDraft = (d: DraftProposalRequest) => { setDraft(d); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const send = async () => {
    if (!draft) return;
    const p = await a.createProposal.mutateAsync({ ...draft, proposer: PROPOSER });
    setDraft(null);
    nav(`/requests?id=${p.id}`, { replace: true, state: null });
  };
  const approve = (member: MemberId) => { if (selected) a.approve.mutate({ id: selected.id, member }); };

  const suggestions = (findings ?? []).filter((f) => f.suggestedChange && f.resolvedByProposal == null && !list.some((p) => p.status === "open" && JSON.stringify(p.change) === JSON.stringify(f.suggestedChange)));
  const open = list.filter((p) => p.status === "open"), done = list.filter((p) => p.status !== "open");
  const pendingMember = a.approve.isPending ? a.approve.variables?.member ?? null : null;

  return (
    <>
      <PageHeader title="Đề xuất" en="Requests" description="Đơn xin thay đổi hạn mức và quyền. Cần 2/3 Hội đồng duyệt, người được hưởng lợi không được tự duyệt."
        actions={<StatusChip status={open.length ? "warn" : "ok"}>{open.length ? `${open.length} đang chờ duyệt` : "Không có đơn chờ"}</StatusChip>} />

      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--chrome-h)+12px)] lg:max-h-[calc(100vh-var(--chrome-h)-28px)] lg:overflow-y-auto lg:pr-1" data-tour="req-list" aria-label="Danh sách đề xuất">
          {suggestions.length ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-faint"><Sparkles className="size-3.5 text-brand" aria-hidden /> Cordon gợi ý</p>
              {suggestions.map((f) => (
                <motion.button key={f.id} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => openDraft({ findingId: f.id })} data-tour="req-suggestion"
                  className="group w-full rounded-[var(--radius-lg)] border border-dashed border-brand/50 bg-brand-soft p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand">
                  <div className="flex items-center gap-2"><StatusChip size="sm" status="bad">{f.severity}</StatusChip><code className="font-mono text-[10.5px] text-faint">{f.ruleId.split("_")[0]}</code></div>
                  <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-text">{f.title}</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand"><FilePlus2 className="size-3.5" aria-hidden /> Tạo đề xuất sửa</p>
                </motion.button>
              ))}
            </div>
          ) : null}

          {isLoading ? <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div> : null}
          {open.length ? <div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Đang chờ duyệt · {open.length}</p>
            {open.map((p, i) => <ProposalCard key={p.id} p={p} index={i} treasury={treasury} selected={!draft && selected?.id === p.id} onSelect={() => select(p.id)} />)}</div> : null}
          {done.length ? <div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Đã thực thi · {done.length}</p>
            {done.map((p, i) => <ProposalCard key={p.id} p={p} index={i} treasury={treasury} selected={!draft && selected?.id === p.id} onSelect={() => select(p.id)} />)}</div> : null}
          {!isLoading && !list.length && !suggestions.length ? <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-faint">Chưa có đề xuất nào.</p> : null}
        </aside>

        <section className="min-w-0" aria-live="polite">
          <>
            {draft ? (
              <motion.div key={`draft-${JSON.stringify(draft)}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Composer req={draft} sending={a.createProposal.isPending} onSend={send} onCancel={closeDraft} treasury={treasury} />
              </motion.div>
            ) : selected ? (
              <motion.div key={`p-${selected.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <ProposalDetail proposal={selected} all={list} members={org?.council ?? []} demoMode={demoMode} pendingMember={pendingMember}
                  onApprove={approve} onOpen={select} onDraft={(change) => openDraft({ change })} treasury={treasury} />
              </motion.div>
            ) : !isLoading ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card strong className="p-3">
                  <EmptyState title="Chưa có đề xuất nào" description="Bắt đầu từ một phát hiện: Cordon tự sinh bản nháp kèm báo cáo trước/sau, rồi gửi Hội đồng duyệt 2/3."
                    action={suggestions[0] ? <Button variant="primary" size="lg" icon={<FilePlus2 className="size-4" />} onClick={() => openDraft({ findingId: suggestions[0].id })}>Soạn đề xuất từ phát hiện đầu tiên</Button> : undefined} />
                </Card>
              </motion.div>
            ) : null}
          </>
        </section>
      </div>
    </>
  );
}
