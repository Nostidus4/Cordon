// Scene 5 · Xin thêm quyền (spec §4.4 scene 5, F1/F2): request #12 and the linked "give the rebalancing assistant to Huy" request.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActions } from "../../hooks/useActions";
import { useProposals } from "../../hooks/useProposals";
import { fmtPercent, percentOf, rawToBig, toBase } from "../../lib/format";
import { useGraph } from "../../hooks/useGraph";
import { getRemembered } from "../requestMemory";
import { requestNumbers } from "../logic";
import { useUiStore } from "../../store/uiStore";
import type { MemberId, Proposal } from "../../types";
import type { CityStageProps } from "../contract";
import { AssistantBubble, MemberButton, Tile } from "../parts";
import { useCityProps, usePrimaryAction, useStageStore } from "../stageStore";
import { EndCard } from "../EndCard";
import { ArrowRightGlyph, PersonIcon, Ribbon, RobotIcon, ToyButton, ToyCard, WarnIcon } from "../ui";

const TREASURY = toBase(2_000_000);
const pct = (m: { raw: string }) => fmtPercent(percentOf(rawToBig(m), TREASURY));
const MEMBERS: { id: MemberId; name: string }[] = [{ id: "trang", name: "Trang" }, { id: "lan", name: "Lan" }, { id: "huy", name: "Huy" }];

export function RequestScene() {
  const nav = useNavigate();
  const actions = useActions();
  const { data: proposals } = useProposals();
  const highlight = useUiStore((s) => s.highlight);
  const ended = useStageStore((s) => s.ended);
  const setEnded = useStageStore((s) => s.setEnded);
  const p12 = proposals?.find((p) => p.id === 12);
  const p13 = proposals?.find((p) => p.id === 13);
  const [busy, setBusy] = useState(false);

  useEffect(() => { useUiStore.getState().clearHighlight(); return () => useUiStore.getState().clearHighlight(); }, []);
  useEffect(() => { // dev-only: ?end=1 (after StagePage reset the flag for this scene)
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("end") !== "1") return;
    const t = setTimeout(() => setEnded(true), 600);
    return () => clearTimeout(t);
  }, [setEnded]);

  const city = useMemo<Partial<CityStageProps>>(() => ({
    shot: "council", showDomain: true,
    highlight: highlight.nodeIds.length || highlight.edgeIds.length ? { ...highlight, tone: "amber" } : undefined,
  }), [highlight]);
  useCityProps(city);
  usePrimaryAction(() => setEnded(true));

  const approve = async (p: Proposal, member: MemberId) => { if (busy) return; setBusy(true); try { await actions.approve.mutateAsync({ id: p.id, member }); } finally { setBusy(false); } };
  const { data: graph } = useGraph();
  const preparing = useStageStore((s) => s.preparing);
  const minhLocked = !!graph?.districts.find((d) => d.principalId === "minh")?.locked;
  // never render 0 / 0%: real numbers or a skeleton (see requestNumbers)
  const nums = requestNumbers(p12, p13, minhLocked, getRemembered());
  const huyConflicted = nums?.p13.huyConflicted ?? false;

  return (
    <>
      <div className="absolute bottom-12 left-6 flex w-[min(520px,calc(100vw-48px))] flex-col gap-3">
        {!nums || !p12 || !p13 ? (
          <ToyCard className="px-6 pb-5 pt-5" label="Đang tải số liệu">
            <Ribbon scene="request">Cảnh 5 · Xin thêm quyền</Ribbon>
            <div className="mt-2 space-y-3" aria-busy="true">
              <div className="h-7 w-3/4 animate-pulse rounded-full" style={{ background: "#eadbbd" }} />
              <div className="grid grid-cols-2 gap-3"><div className="h-[74px] animate-pulse rounded-[18px]" style={{ background: "#f1e4cc" }} /><div className="h-[74px] animate-pulse rounded-[18px]" style={{ background: "#f1e4cc" }} /></div>
              <p className="toy-body m-0">{preparing ? "Đang chuẩn bị cảnh…" : minhLocked ? "Khu anh Minh đã khoá nên số liệu cũ không còn. Bấm “Chơi lại” để xem lại từ đầu." : "Đang lấy số liệu…"}</p>
            </div>
          </ToyCard>
        ) : (
          <>
            <ToyCard className="px-6 pb-5 pt-5" label="Đơn 12">
              <Ribbon scene="request">Cảnh 5 · Xin thêm quyền</Ribbon>
              <div className="toy-eyebrow mt-1">Đơn #12</div>
              <h2 className="m-0 font-toy text-[25px] font-extrabold leading-[1.1]" style={{ color: "var(--ink)" }}>Nâng khu anh Minh {nums.p12.before} → {nums.p12.after}</h2>
              <div className="mt-3 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
                <Tile label="Chain chặn"><div className="flex flex-wrap items-center gap-x-2"><span className="num" style={{ fontSize: 20, color: "var(--ink-2)" }}>{nums.p12.before}</span><ArrowRightGlyph /><span className="num" style={{ fontSize: 28, color: "var(--red-ink)" }}>{nums.p12.after}</span></div></Tile>
                <Tile label="Phần quỹ chính" tone="amber"><div className="flex flex-wrap items-center gap-x-2"><span className="num" style={{ fontSize: 20, color: "var(--ink-2)" }}>{nums.p12.beforePct}</span><ArrowRightGlyph /><span className="num" style={{ fontSize: 28, color: "var(--amber-ink)" }}>{nums.p12.afterPct}</span></div></Tile>
              </div>
            </ToyCard>

            <ToyCard className="px-6 pb-4 pt-4" label="Đơn đi kèm" delay={0.1}>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2"><RobotIcon size={40} /><PersonIcon size={40} color="#4d8cf5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="toy-eyebrow" style={{ fontSize: 14 }}>Đi kèm · đơn #{p13.id}</div>
                  <div className="font-toy text-[20px] font-bold leading-tight" style={{ color: "var(--ink)" }}>Giao trợ lý Cân đối cho anh Huy</div>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap"><span className="num" style={{ fontSize: 20, color: "var(--ink-2)" }}>{nums.p13.before}</span><ArrowRightGlyph /><span className="num" style={{ fontSize: 26, color: "var(--red-ink)" }}>{nums.p13.after}</span></div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-1" role="group" aria-label="Hội đồng duyệt đơn giao trợ lý">
                {MEMBERS.map((m) => {
                  const blocked = m.id === "huy" && huyConflicted;
                  const done = p13.approvals.some((a) => a.member === m.id);
                  return <MemberButton key={m.id} member={m.id} name={m.name} busy={busy}
                    state={done ? "approved" : blocked ? "blocked" : p13.status !== "open" ? "waiting" : "ready"}
                    reason={blocked ? "Anh Huy ngồi Hội đồng và là người nhận thêm quyền" : undefined} onClick={() => void approve(p13, m.id)} />;
                })}
                <div className="flex-1" />
              </div>
              {huyConflicted ? (
                <p className="m-0 mt-2.5 flex items-start gap-1.5 text-[13.5px] font-bold leading-snug" style={{ color: "var(--red-ink)" }}>
                  <span className="mt-0.5"><WarnIcon size={15} /></span>Anh Huy vừa ngồi Hội đồng vừa nhận thêm quyền, nên không tự duyệt được.
                </p>
              ) : null}
            </ToyCard>
          </>
        )}
        <div className="flex items-center gap-3 pl-1"><ToyButton size="lg" color="teal" onClick={() => setEnded(true)}>Xem tóm tắt →</ToyButton></div>
      </div>

      <div className="absolute right-6 top-24">
        <ToyCard className="w-[min(350px,calc(100vw-48px))] p-4" label="Trợ lý" delay={0.15}>
          <AssistantBubble questionIds={["give_agent_huy"]} screen="requests" principalIds={["huy"]} proposalId={p13?.id}
            devAskId={import.meta.env.DEV ? new URLSearchParams(window.location.search).get("ask") : null} />
        </ToyCard>
      </div>
      {ended ? <EndCard /> : null}
    </>
  );
}
