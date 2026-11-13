// Scene 1 · Nhìn (spec §10.2, A1): who really holds which cards. Pins and fences open a small toy popover.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useCueOnRise } from "../../audio/useSound";
import { sfx } from "../../audio/sounds";
import { useFindings } from "../../hooks/useFindings";
import { useGraph } from "../../hooks/useGraph";
import { useSimulate } from "../../hooks/useSimulate";
import type { CameraShot, CityStageProps } from "../contract";
import { describeNode, keyTiny } from "../logic";
import { useCityProps, usePrimaryAction, useStageStore } from "../stageStore";
import { Counter, FlagIcon, KindIcon, Ribbon, ToyButton, ToyCard, CheckIcon, WarnIcon } from "../ui";

const KIND_OF: Record<string, "person" | "robot" | "server"> = { HUMAN: "person", AGENT: "robot", SERVICE: "server" };

export function LookScene() {
  const nav = useNavigate();
  const { data: graph } = useGraph();
  const { data: findings } = useFindings();
  const { data: sim } = useSimulate(["minh"]);
  const picked = useStageStore((s) => s.picked);
  const setPicked = useStageStore((s) => s.setPicked);

  const [shot, setShot] = useState<CameraShot>("district-minh");
  useEffect(() => { const t = setTimeout(() => setShot("overview"), 3600); return () => clearTimeout(t); }, []);

  const hasR1 = !!findings?.some((f) => f.ruleId === "R1_MULTI_KEY_NO_SHARED_CAP" && f.principalId === "minh");
  useCueOnRise(hasR1, () => { setTimeout(() => sfx.flag(), 450); }, true);
  const minh = graph?.districts.find((d) => d.principalId === "minh");
  const keys = sim?.reachedKeys.map((r) => graph?.nodes.find((n) => n.id === `k:${r.key}`)).filter((n): n is NonNullable<typeof n> => !!n) ?? [];
  const youThink = sim ? Number(BigInt(sim.totals.youThink.raw) / 1_000_000n) : 20000;

  const city = useMemo<Partial<CityStageProps>>(() => ({
    shot, showDomain: true,
    highlight: hasR1 && sim ? { nodeIds: sim.highlights.nodeIds, edgeIds: sim.highlights.edgeIds, tone: "amber" } : undefined,
  }), [shot, hasR1, sim]);
  useCityProps(city);
  const next = () => nav("/s/try");
  usePrimaryAction(next);

  // dev-only: ?pick=k:key_agent_data opens the popover without clicking in the canvas
  useEffect(() => {
    const id = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("pick") : null;
    if (!id) return;
    const t = setTimeout(() => setPicked({ type: "node", id }), 600); // after StagePage cleared the pick for this scene
    return () => clearTimeout(t);
  }, [setPicked]);

  const info = picked?.type === "node" && graph ? describeNode(graph, picked.id) : null;

  return (
    <>
      <div className="absolute bottom-12 left-6" data-slot="scene-left">
        <ToyCard className="w-[min(430px,calc(100vw-48px))] px-6 pb-6 pt-5" label="Bạn nghĩ anh Minh cầm bao nhiêu">
          <Ribbon scene="look">Cảnh 1 · Nhìn</Ribbon>
          <div className="toy-eyebrow mt-1" style={{ fontSize: 17 }}>Bạn nghĩ anh Minh chỉ cầm</div>
          <div className="mt-1 flex items-baseline gap-2">
            <Counter value={youThink} className="num" style={{ fontSize: 68, color: "var(--ink)" }} duration={0.9} />
            <span className="font-toy text-[22px] font-bold" style={{ color: "var(--ink-2)" }}>/ngày</span>
          </div>
          <div className="mt-3">
            {hasR1 ? (
              <span className="toy-flag"><FlagIcon /><WarnIcon size={14} color="var(--amber-ink)" />1 người · {keys.length || 5} thẻ · không có cổng chung</span>
            ) : (
              <span className="toy-flag" style={{ background: "var(--teal-soft)", borderColor: "#8fe3d3", color: "var(--teal-ink)" }}><CheckIcon size={15} />1 người · {keys.length || 5} thẻ · chung cổng {minh?.dailyCap?.display ?? ""}/ngày</span>
            )}
          </div>
          {keys.length ? (
            <ul className="m-0 mt-4 flex list-none gap-2.5 p-0" aria-label="Các thẻ anh Minh điều khiển">
              {keys.map((k) => (
                <li key={k.id} className="flex w-[62px] flex-col items-center gap-0.5 text-center">
                  <KindIcon kind={KIND_OF[k.data.kind ?? ""] ?? "other"} size={36} />
                  <span className="text-[11.5px] font-bold leading-tight" style={{ color: "var(--ink-2)" }}>{keyTiny(k.id, k.label)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-5"><ToyButton size="lg" pulse onClick={next}>Thử xem nếu anh Minh bị chiếm →</ToyButton></div>
        </ToyCard>
      </div>

      {info ? (
        <div className="absolute right-6 top-24" data-slot="scene-right">
          <ToyCard className="w-[300px] p-4" label="Chi tiết" key={picked ? JSON.stringify(picked) : "x"}>
            <div className="flex items-start gap-3">
              <KindIcon kind={info?.kind ?? "other"} size={46} />
              <div className="min-w-0 flex-1">
                <div className="font-toy text-[20px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{info?.title}</div>
              </div>
              <button type="button" aria-label="Đóng" onClick={() => setPicked(null)} className="grid size-8 place-items-center rounded-full border-0 bg-[#f1e4cc]" style={{ color: "var(--ink)", cursor: "pointer" }}><X size={16} strokeWidth={3} /></button>
            </div>
            <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
              {(info?.lines ?? []).map((l, i) => (
                <li key={i} className="toy-body" style={{ color: "var(--ink)" }}>
                  {l.text}
                  {l.declared ? <span className="mt-0.5 flex items-center gap-1 text-[13px] font-bold" style={{ color: "var(--amber-ink)" }}><WarnIcon size={13} />tự khai, chưa kiểm chứng</span> : null}
                </li>
              ))}
            </ul>
          </ToyCard>
        </div>
      ) : null}
    </>
  );
}
