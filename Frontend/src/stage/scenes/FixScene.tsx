// Scene 3 · Sửa (spec §4.4 scene 3, C1): "Gom 5 thẻ về khu anh Minh, chung 30.000/ngày". Lan proposes, Lan + Trang approve (2/3) -> policy v2.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useActions } from "../../hooks/useActions";
import { useFindings } from "../../hooks/useFindings";
import { useProposals } from "../../hooks/useProposals";
import type { MemberId } from "../../types";
import type { CityStageProps } from "../contract";
import { MemberButton, Tile } from "../parts";
import { useCityProps, usePrimaryAction } from "../stageStore";
import { Confetti, Ribbon, Stamp, ToyButton, ToyCard } from "../ui";

const MEMBERS: { id: MemberId; name: string }[] = [{ id: "trang", name: "Trang" }, { id: "lan", name: "Lan" }, { id: "huy", name: "Huy" }];
const ORDER: MemberId[] = ["lan", "trang"];

export function FixScene() {
  const nav = useNavigate();
  const actions = useActions();
  const { data: findings } = useFindings();
  const { data: proposals } = useProposals();
  const finding = findings?.find((f) => f.ruleId === "R1_MULTI_KEY_NO_SHARED_CAP" && f.principalId === "minh" && f.suggestedChange);
  const merge = useMemo(() => (proposals ?? []).filter((p) => p.change.kind === "consolidate").sort((a, b) => b.id - a.id)[0], [proposals]);
  const { data: draft } = useQuery({ queryKey: ["stage-draft", finding?.id], queryFn: () => api.draftProposal({ findingId: finding!.id }), enabled: !!finding && !merge });
  const report = (merge ?? draft)?.riskReport;

  const status: "draft" | "open" | "done" = !merge ? "draft" : merge.status === "executed" ? "done" : "open";
  const approved = new Set(merge?.approvals.map((a) => a.member) ?? []);
  const [burst, setBurst] = useState(0);
  const prev = useRef(status);
  useEffect(() => { if (prev.current !== "done" && status === "done") setBurst((b) => b + 1); prev.current = status; }, [status]);
  const [busy, setBusy] = useState(false);

  const city = useMemo<Partial<CityStageProps>>(() => ({ shot: status === "done" ? "gate" : "district-minh", showDomain: true }), [status]);
  useCityProps(city);

  const propose = async () => { if (!finding || busy) return; setBusy(true); try { await actions.createProposal.mutateAsync({ findingId: finding.id, proposer: "lan" }); } finally { setBusy(false); } };
  const approve = async (member: MemberId) => { if (!merge || busy) return; setBusy(true); try { await actions.approve.mutateAsync({ id: merge.id, member }); } finally { setBusy(false); } };
  const nextApprover = ORDER.find((m) => !approved.has(m));
  usePrimaryAction(status === "draft" ? (finding ? () => void propose() : null) : status === "open" ? (nextApprover ? () => void approve(nextApprover) : null) : () => nav("/s/incident"));

  // dev-only: ?approve=1 plays the whole flow (propose -> Lan -> Trang)
  useEffect(() => {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("approve") !== "1" || !finding) return;
    let off = false;
    void (async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await wait(900); if (off) return;
      const p = await api.createProposal({ findingId: finding.id, proposer: "lan" });
      await wait(600); await api.approveProposal(p.id, "lan"); await wait(600); await api.approveProposal(p.id, "trang");
    })();
    return () => { off = true; };
  }, [finding?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const approvedCount = approved.size;
  return (
    <div className="absolute bottom-12 left-6">
      <ToyCard className="relative w-[min(540px,calc(100vw-48px))] px-6 pb-6 pt-5" label="Đề xuất gom thẻ">
        <Confetti burst={burst} />
        <Ribbon scene="fix">Cảnh 3 · Sửa</Ribbon>
        <div className="toy-eyebrow mt-1">Đề xuất</div>
        <h2 className="m-0 mt-0.5 font-toy text-[26px] font-extrabold leading-[1.1]" style={{ color: "var(--ink)" }}>Gom 5 thẻ về khu anh Minh, chung 30.000/ngày</h2>

        {report ? (
          <div className="mt-4 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
            <Tile label="Rủi ro thật" tone="teal">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="num" style={{ fontSize: "clamp(22px, 2vw, 28px)", color: "var(--ink-2)", textDecoration: "line-through", textDecorationThickness: 3, opacity: 0.75 }}>{report.before.estimated.display}</span>
                <span className="font-toy text-[26px] font-bold" aria-label="thành" style={{ color: "var(--ink-2)" }}>→</span>
                <span className="num" style={{ fontSize: "clamp(28px, 2.6vw, 36px)", color: "var(--teal-ink)" }}>{report.after.estimated.display}</span>
              </div>
            </Tile>
            <Tile label="Chain chặn" foot="Tăng vì 5 thẻ giờ chung một cổng, và đây là mức chặn thật.">
              <div className="flex flex-wrap items-center gap-x-2"><span className="num" style={{ fontSize: 20, color: "var(--ink-2)" }}>{report.before.enforced.display}</span><span className="font-toy text-[20px] font-bold">→</span><span className="num" style={{ fontSize: 24 }}>{report.after.enforced.display}</span></div>
            </Tile>
          </div>
        ) : <div className="toy-body mt-4">Đang soạn đề xuất…</div>}

        <div className="mt-5">
          {status === "draft" ? (
            <div className="flex items-center gap-3">
              <ToyButton size="lg" pulse disabled={!finding || busy} onClick={() => void propose()}>Lan gửi đề xuất</ToyButton>
              <span className="toy-body">Cần 2 trong 3 người duyệt.</span>
            </div>
          ) : null}
          {status !== "draft" ? (
            <>
              <div className="flex items-end justify-between gap-1" role="group" aria-label="Hội đồng duyệt">
                {MEMBERS.map((m) => (
                  <MemberButton key={m.id} member={m.id} name={m.name}
                    state={approved.has(m.id) ? "approved" : status === "done" ? "waiting" : "ready"} busy={busy} onClick={() => void approve(m.id)} />
                ))}
                <div className="flex min-w-0 flex-1 items-center justify-end pl-2">
                  {status === "done" ? <Stamp sub="policy v2">Đã thực thi</Stamp>
                    : <div className="text-right"><div className="num" style={{ fontSize: 34 }}>{approvedCount}/3</div><div className="toy-body">đã duyệt, cần 2</div></div>}
                </div>
              </div>
              {status === "open" && nextApprover ? <p className="toy-body mb-0 mt-3">{merge?.proposer === "lan" ? "Lan đã gửi đề xuất. " : ""}Bấm vào mặt người duyệt để duyệt.</p> : null}
            </>
          ) : null}
          {status === "done" ? <div className="mt-4"><ToyButton size="lg" pulse onClick={() => nav("/s/incident")}>Xem sự cố →</ToyButton></div> : null}
        </div>
      </ToyCard>
    </div>
  );
}
