// Scene 4 · Sự cố (spec §10.5, E1/E2): the same break-in, two outcomes, played on the city.
// Right-hand numbers come from attempt events only (principalSpentAfter); the left-hand "không có Cordon" is simulated.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { sfx } from "../../audio/sounds";
import { useActions } from "../../hooks/useActions";
import { useAttempts } from "../../hooks/useAttempts";
import { useCityStates } from "../../hooks/useCityStates";
import { useGraph } from "../../hooks/useGraph";
import { useScenarioRuns } from "../../hooks/useScenarioRuns";
import { useStream } from "../../hooks/useStream";
import { shortRpc } from "../../pages/incident/AttemptTimeline";
import { txUrl } from "../../lib/explorer";
import { pickReplayRun, useReplayPlayer } from "../../pages/incident/replay";
import { leftStateAtStep } from "../../pages/incident/leftSimulation";
import { reasonVi } from "../../shared/reasonCodes";
import { useUiStore } from "../../store/uiStore";
import type { Attempt } from "../../types";
import type { BuildingCode, CityStageProps } from "../contract";
import { LEFT_FULL, attackErrorVi, incidentNumbers, nextIncidentAction, recipientVi, signerShort, type IncidentAction } from "../logic";
import { Tile } from "../parts";
import { useCityProps, usePrimaryAction, useStageStore } from "../stageStore";
import { CheckIcon, Counter, CrossIcon, GateIcon, KindIcon, Ribbon, ToyButton, ToyCard, WarnIcon } from "../ui";
import { policyLabel } from "../../lib/policy";
import { byStep, liveRunAttempts } from "../../lib/dto";

const sortAttempts = (a: Attempt[]) => [...a].sort(byStep);
const U = 1_000_000n;
const toNum = (b: bigint | null) => (b == null ? 0 : Number(b / U));

/** Live attempts: query cache (patched by the stream bridge) + anything the stream delivered while the first fetch was in flight. */
function useLiveAttempts(): Attempt[] {
  const q = useAttempts();
  const [streamed, setStreamed] = useState<Attempt[]>([]);
  useStream((m) => { if (m.type === "attempt") setStreamed((s) => (s.some((a) => a.id === m.data.id) ? s : [...s, m.data])); else setStreamed([]); }, ["attempt", "reset"]);
  return useMemo(() => {
    const base = q.data ?? [];
    return liveRunAttempts(base, streamed);
  }, [q.data, streamed]);
}

/** "trả 10.000 cho Nhà cung cấp máy chủ" — plain Vietnamese, no ids. */
export function attemptText(a: Attempt): string {
  const amt = a.amount?.display;
  if (a.action === "pay") return `trả ${amt} cho ${recipientVi(a.to ?? "")}`;
  if (a.action === "swap") return `đổi ${amt ?? ""} ${/evil/i.test(a.to ?? "") ? "ở chợ lạ" : "ở chợ đã duyệt"}`.replace("  ", " ");
  if (a.action === "lock") return "khoá cả khu";
  return "thử gọi hợp đồng lạ";
}
const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
function evidence(a: Attempt): string {
  if (a.outcome === "blocked_at_protocol") return `bị chain từ chối · ${shortRpc(a.errorRaw)}`;
  if (!a.txHash) return "";
  return `${a.simulated ? "mô phỏng" : "giao dịch thật"} · ${shortHash(a.txHash)}`;
}

function TickerRow({ a }: { a: Attempt }) {
  const ok = a.outcome === "ok";
  const url = a.outcome === "blocked_at_protocol" ? null : txUrl(a.txHash, a.simulated);
  return (
    <motion.li className="toy-ticker-row" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
      <span className="font-toy text-[14px] font-bold" style={{ color: "var(--ink-2)" }}>{a.displayTime}</span>
      <div>
        <div className="flex items-start gap-1.5 font-semibold" style={{ color: "var(--ink)" }}>
          <span className="mt-[3px] shrink-0" style={{ color: ok ? "var(--teal-ink)" : "var(--red-ink)" }}>{ok ? <CheckIcon size={14} /> : <CrossIcon size={14} />}</span>
          <span><b>{signerShort(a.signer, a.signerLabel)}</b> {attemptText(a)}</span>
        </div>
        {!ok ? <div className="text-[13px] font-bold" style={{ color: "var(--red-ink)" }}>{reasonVi(a.reasonCode)}</div> : null}
        {evidence(a) ? (url ? <a className="block text-[12px] font-semibold underline" style={{ color: "var(--ink-2)" }} href={url} target="_blank" rel="noreferrer">{evidence(a)}</a>
          : <div className="text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>{evidence(a)}</div>) : null}
      </div>
    </motion.li>
  );
}

export function IncidentScene() {
  const nav = useNavigate();
  const actions = useActions();
  const mode = useUiStore((s) => s.mode);
  const replay = mode === "replay";
  const replayRunId = useUiStore((s) => s.replayRunId);
  const setReplayRunId = useUiStore((s) => s.setReplayRunId);
  const { data: graph } = useGraph();
  const { data: cityStates } = useCityStates();
  const { data: runs } = useScenarioRuns();
  const live = useLiveAttempts();
  const [attacking, setAttacking] = useState(false);
  const [attackError, setAttackError] = useState<string | null>(null);
  const preparing = useStageStore((s) => s.preparing);

  useEffect(() => { if (replay && !replayRunId) { const id = pickReplayRun(runs); if (id) setReplayRunId(id); } }, [replay, replayRunId, runs, setReplayRunId]);
  const player = useReplayPlayer(replay ? replayRunId : null);
  const replayAttempts = replay ? player.attempts : null; // (the player returns a fresh array every render)
  const replayShown = replay ? player.shown : -1;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attempts = useMemo(() => sortAttempts(replayAttempts ?? live), [replayShown, replayAttempts === null, live]);

  const minh = graph?.districts.find((d) => d.principalId === "minh");
  const policyV2 = (policyLabel(graph) ?? 1) >= 2 || replay;
  const nums = useMemo(() => incidentNumbers(attempts, { districtLocked: replay ? false : !!minh?.locked, capRaw: minh?.dailyCap?.raw ?? (replay ? "30000000000" : null) }), [attempts, minh, replay]);
  useEffect(() => { if (nums.attackDone || attempts.length === 0) setAttacking(false); }, [nums.attackDone, attempts.length]);
  useStream((m) => { if (m.type === "reset") { setAttacking(false); setAttackError(null); } }, ["reset"]);

  const next: IncidentAction = nextIncidentAction(nums, attacking);
  const night = (nums.attackDone || attacking) && !nums.locked;
  useEffect(() => { useStageStore.getState().setAutoNight(night); }, [night]);

  const buildingStates = useMemo(() => {
    if (!cityStates) return undefined;
    return Object.fromEntries(Object.entries(cityStates).map(([k, v]) => [k, v.state])) as Partial<Record<BuildingCode, "normal" | "warning" | "incident" | "recovery">>;
  }, [cityStates]);
  const cap = BigInt(minh?.dailyCap?.raw ?? "30000000000");
  const city = useMemo<Partial<CityStageProps>>(() => ({
    shot: nums.locked ? "district-minh" : "gate", showDomain: true,
    attempts, sharedCap: policyV2 ? nums.sharedCap ?? { spent: "0", cap: cap.toString() } : null,
    lockedDistricts: nums.locked ? ["minh"] : [], buildingStates,
  }), [nums, attempts, policyV2, buildingStates, cap]);
  useCityProps(city);

  const act = {
    agent: () => actions.runAgent.mutate(),
    attack: () => { sfx.alarm(); setAttacking(true); setAttackError(null); actions.runScene4.mutate(undefined, { onError: (e) => { setAttacking(false); setAttackError(attackErrorVi(e)); } }); },
    lock: () => actions.lock.mutate({ principalId: "minh", member: "lan" }),
    step7: () => actions.step7.mutate(),
  };
  usePrimaryAction(replay ? player.toggle : !policyV2 ? () => actions.policyV2.mutate() : next === "done" ? () => nav("/s/request") : attacking ? null : () => act[next]());

  const spent = nums.shared;
  const pct = spent !== null ? Math.min(100, Number((spent * 100n) / (cap || 1n))) : 0;
  const attemptsDesc = [...attempts].reverse();
  const doneMark = (d: boolean) => (d ? <CheckIcon size={16} /> : null);

  return (
    <>
      {/* left: what would have happened without Cordon (simulated) */}
      <div className="absolute bottom-24 left-6" data-slot="scene-left">
        <ToyCard tone="red" className="w-[310px] px-5 pb-4 pt-4" label="Không có Cordon, mô phỏng">
          <div className="flex items-center justify-between gap-2">
            <div className="font-toy text-[17px] font-bold leading-tight" style={{ color: "var(--ink)" }}>Không có Cordon</div>
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "#ffd9d2", color: "var(--red-d)" }}>mô phỏng</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
            <Counter value={nums.leftTotal} className="num" style={{ fontSize: 50, color: "var(--red-ink)" }} duration={0.5} tick="down" />
            <span className="font-toy text-[16px] font-bold" style={{ color: "var(--red-ink)" }}>/ {LEFT_FULL.toLocaleString("vi-VN")}</span>
          </div>
          <div className="toy-body" style={{ fontSize: 13.5 }}>công ty mất trong một ngày</div>
          <LeftCoins step={nums.leftStep} started={attempts.length > 0} />
          {nums.attackDone ? <p className="m-0 mt-2 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--red-ink)" }}><WarnIcon size={14} />Ngày mai lại mất tiếp…</p> : null}
        </ToyCard>
      </div>

      {/* right: with Cordon (live) */}
      <div className="absolute right-6 top-24 flex w-[min(350px,calc(100vw-48px))] flex-col gap-3" data-slot="scene-right">
        {!policyV2 && !preparing ? (
          <ToyCard className="p-4" label="Cần policy v2">
            <div className="font-toy text-[20px] font-bold leading-tight" style={{ color: "var(--ink)" }}>Khu anh Minh chưa có cổng chung</div>
            <p className="toy-body my-2">Cảnh này cần 5 thẻ chung một cổng 30.000/ngày.</p>
            <ToyButton color="orange" pulse disabled={actions.policyV2.isPending} onClick={() => actions.policyV2.mutate()}>Áp dụng policy v2 trước</ToyButton>
          </ToyCard>
        ) : !policyV2 ? null : (
          <ToyCard className="p-4" label="Cổng chung khu anh Minh" tone="sky">
            <Ribbon scene="incident">Cảnh 4 · Sự cố</Ribbon>
            <div className="mt-1 flex items-center gap-2.5">
              <GateIcon size={42} />
              <div className="font-toy text-[19px] font-bold leading-tight" style={{ color: "var(--ink)" }}>Cổng chung khu anh Minh</div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="toy-body" style={{ color: "var(--ink)" }}>Đã dùng chung</span>
              <Counter value={toNum(spent)} className="num" style={{ fontSize: 36, color: pct >= 80 ? "var(--amber-ink)" : "var(--ink)" }} duration={0.5} />
              <span className="font-toy text-[20px] font-bold" style={{ color: "var(--ink-2)" }}>/ {toNum(cap).toLocaleString("vi-VN")}</span>
            </div>
            <div className="toy-bar mt-2" role="progressbar" aria-label="Đã dùng chung" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${pct}%`, background: pct >= 80 ? "var(--amber)" : "var(--teal)" }} />
            </div>
            <Tile className="mt-3" label="Kẻ gian chi ra được" tone="teal" foot={nums.attackDone ? "Phần còn lại bị cổng giữ lại." : undefined}>
              <Counter value={toNum(nums.attacker)} className="num" style={{ fontSize: 40, color: "var(--teal-ink)" }} duration={0.5} />
            </Tile>
          </ToyCard>
        )}

        {policyV2 ? (
          <ToyCard className="flex max-h-[min(300px,calc(100vh-500px))] min-h-[130px] flex-col overflow-hidden px-4 pb-3 pt-3" label="Các lần thử" delay={0.1}>
            <div className="mb-1 flex items-center justify-between"><span className="font-toy text-[16px] font-bold" style={{ color: "var(--ink)" }}>Các lần thử</span>
              <span className="text-[12px] font-bold" style={{ color: "var(--ink-2)" }}>{attempts.length ? `${attempts.length} lần` : ""}</span></div>
            {attempts.length === 0 ? <p className="toy-body m-0 py-2">Chưa có lần thử nào. Bấm nút bên dưới để bắt đầu.</p> : (
              <ul className="toy-scroll toy-fade m-0 min-h-0 flex-1 list-none overflow-y-auto p-0" aria-live="polite">
                {attemptsDesc.map((a) => <TickerRow key={a.id} a={a} />)}
              </ul>
            )}
          </ToyCard>
        ) : null}
      </div>

      {/* bottom: the toy action buttons in story order; the next one pulses */}
      <div className="pointer-events-none absolute bottom-10 left-1/2 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 justify-center" data-slot="scene-bottom">
        {replay ? (
          <ToyCard className="pointer-events-auto flex items-center gap-4 px-5 py-3" label="Xem lại">
            <span className="font-toy text-[17px] font-bold" style={{ color: "var(--ink)" }}>Xem lại bản đã lưu · {player.shown}/{player.total}</span>
            <select aria-label="Chọn lần chạy" value={replayRunId ?? ""} onChange={(e) => setReplayRunId(e.target.value)}
              className="pointer-events-auto rounded-full border-2 px-3 py-1 font-toy text-[14px] font-bold" style={{ background: "var(--cream)", color: "var(--ink)", borderColor: "var(--ink-2)" }}>
              {(runs ?? []).filter((r) => r.attempts.length > 0).map((r) => (
                <option key={r.id} value={r.id}>{r.status === "recorded" ? "Bản ghi sẵn" : `Lần chạy ${new Date(r.startedAt * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`} · {r.attempts.length} bước</option>
              ))}
            </select>
            <ToyButton size="sm" onClick={player.toggle}>{player.playing ? "Tạm dừng" : "Chạy"}</ToyButton>
            <ToyButton size="sm" color="cream" onClick={player.restart}>↻ Từ đầu</ToyButton>
          </ToyCard>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-3">
          {attackError ? <ToyCard tone="red" className="px-4 py-2" label="Lỗi"><p role="alert" className="toy-body m-0 flex items-center gap-1.5 font-bold" style={{ color: "var(--red-ink)" }}><WarnIcon size={14} />{attackError}</p></ToyCard> : null}
          <div className="flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Các bước của cảnh sự cố">
            <ToyButton color="orange" size="sm" pulse={next === "agent" && policyV2} done={nums.agentDone} disabled={!policyV2 || next !== "agent" || actions.runAgent.isPending} onClick={act.agent}>{doneMark(nums.agentDone)}1 · Chạy trợ lý Cân đối buổi sáng</ToyButton>
            <ToyButton color="violet" size="sm" pulse={next === "attack" && !attacking} done={nums.attackDone} disabled={!policyV2 || nums.attackDone || attacking} onClick={act.attack}>{doneMark(nums.attackDone)}2 · Kẻ gian bắt đầu</ToyButton>
            <ToyButton color="red" size={next === "lock" ? "lg" : "sm"} pulse={next === "lock"} done={nums.locked} disabled={!policyV2 || nums.locked || !nums.attackDone || actions.lock.isPending} onClick={act.lock}>{doneMark(nums.locked)}3 · Khoá khu anh Minh</ToyButton>
            <ToyButton color="cream" size="sm" pulse={next === "step7"} done={nums.step7Done} disabled={!nums.locked || nums.step7Done || actions.step7.isPending} onClick={act.step7}>{doneMark(nums.step7Done)}4 · Thử lại bằng thẻ đã khoá</ToyButton>
            {next === "done" ? <ToyButton color="teal" pulse onClick={() => nav("/s/request")}>Tiếp: xin thêm quyền →</ToyButton> : null}
          </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Five little cards: red and crossed once the attacker has drained them (left side, simulated). */
function LeftCoins({ step, started }: { step: number; started: boolean }) {
  const st = leftStateAtStep(started ? step : -1);
  return (
    <ul className="m-0 mt-3 flex list-none justify-between gap-1 p-0" aria-label="Năm thẻ trong mô phỏng">
      {st.bars.map((b) => (
        <li key={b.id} className="flex flex-col items-center gap-0.5" title={b.label}>
          <span className="relative grid place-items-center rounded-full p-1" style={{ background: b.drained ? "#ffc9c0" : "#f1e4cc", transition: "background 300ms" }}>
            <KindIcon kind={b.kind === "HUMAN" ? "person" : b.kind === "AGENT" ? "robot" : "server"} size={28} />
            {b.drained ? <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full text-white" style={{ background: "var(--red)" }}><CrossIcon size={9} /></span> : null}
          </span>
          <span className="text-[11px] font-bold" style={{ color: b.drained ? "var(--red-ink)" : "var(--ink-2)" }}>{b.drained ? "−20.000" : "20.000"}</span>
        </li>
      ))}
    </ul>
  );
}
