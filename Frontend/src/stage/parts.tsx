// Small shared pieces of the scene overlays: number tile, assistant speech bubble, council face button.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { segmentAnswer } from "../components/assistant/AnswerView";
import { useAssistant } from "../hooks/useAssistant";
import { ASSISTANT_QUESTIONS } from "../shared/assistantQuestions";
import type { AssistantAnswer, MemberId } from "../types";
import { CheckIcon, FaceAvatar, Mascot, useReduced, WarnIcon } from "./ui";

export function Tile({ label, tone, children, foot, className = "" }: { label: string; tone?: "red" | "teal" | "amber" | "violet"; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`toy-tile ${className}`} data-tone={tone}>
      <div className="toy-tile-label">{label}</div>
      <div className="mt-1">{children}</div>
      {foot ? <div className="mt-1.5 text-[12.5px] font-semibold leading-snug" style={{ color: "var(--ink-2)" }}>{foot}</div> : null}
    </div>
  );
}

const WARN_TITLE: Record<string, string> = { CONFLICT_OF_INTEREST: "Xung đột lợi ích", CONCENTRATION: "Quyền dồn về một chỗ" };

/** Friendly assistant: fixed questions (spec §9.5) as pill prompts, the answer as a speech bubble. Bold numbers come from `numbers[]`. */
export function AssistantBubble({ questionIds, screen, principalIds, proposalId, onAnswer, devAskId, className = "" }: {
  questionIds: string[]; screen: "simulate" | "requests"; principalIds?: string[]; proposalId?: number;
  onAnswer?: (a: AssistantAnswer, questionId: string) => void; devAskId?: string | null; className?: string;
}) {
  const { ask } = useAssistant();
  const reduced = useReduced();
  const [turn, setTurn] = useState<{ id: string; a?: AssistantAnswer } | null>(null);
  const busy = useRef(false);
  const qs = questionIds.map((id) => ASSISTANT_QUESTIONS.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);

  const onAsk = async (q: (typeof qs)[number]) => {
    if (busy.current) return;
    busy.current = true;
    setTurn({ id: q.id });
    const t0 = Date.now();
    try {
      const a = await ask({ question: q.text, context: { screen, principalIds, proposalId } });
      const wait = Math.max(0, 700 - (Date.now() - t0));
      if (wait && !reduced) await new Promise((r) => setTimeout(r, wait));
      setTurn({ id: q.id, a });
      onAnswer?.(a, q.id);
    } catch { setTurn(null); } finally { busy.current = false; }
  };
  const askRef = useRef(onAsk); askRef.current = onAsk;
  useEffect(() => { // dev-only: ?ask=<id> asks once for screenshots
    if (!import.meta.env.DEV || !devAskId) return;
    const q = qs.find((x) => x.id === devAskId);
    if (!q) return;
    const t = setTimeout(() => void askRef.current(q), 1200);
    return () => clearTimeout(t);
  }, [devAskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const segs = turn?.a ? segmentAnswer(turn.a.answer, turn.a.numbers) : [];
  const warns = (turn?.a?.warnings ?? []).filter((w) => w.code === "CONFLICT_OF_INTEREST"); // the answer already carries the rest
  return (
    <div className={className}>
      <div className="flex items-end gap-2">
        <Mascot size={52} />
        <div className="pb-1 font-toy text-[17px] font-bold" style={{ color: "var(--ink)" }}>Hỏi trợ lý nhé</div>
      </div>
      <div className="mt-2 flex flex-col items-start gap-1.5" role="group" aria-label="Câu hỏi cho trợ lý">
        {qs.map((q) => (
          <button key={q.id} type="button" className="toy-chip" style={{ fontSize: 15, padding: "6px 14px", textAlign: "left" }} aria-pressed={turn?.id === q.id} onClick={() => void onAsk(q)}>{q.text}</button>
        ))}
      </div>
      <div aria-live="polite" className="mt-2.5">
        {turn ? (
          <motion.div key={turn.id + (turn.a ? "a" : "p")} className="toy-bubble" initial={reduced ? false : { opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
            {!turn.a ? (
              <span className="inline-flex gap-1.5 py-1" aria-label="Trợ lý đang nghĩ">
                {[0, 1, 2].map((i) => <motion.i key={i} className="block size-2.5 rounded-full" style={{ background: "var(--violet)" }} animate={reduced ? undefined : { y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />)}
              </span>
            ) : (
              <>
                <p className="m-0 text-[15px] font-medium leading-[1.5]" style={{ color: "var(--ink)" }}>
                  {segs.map((s, i) => s.num
                    ? <b key={i} className="font-toy text-[18px]" style={{ background: "#ffe9a8", borderRadius: 6, padding: "0 4px" }}>{s.text}</b>
                    : <span key={i}>{s.text}</span>)}
                </p>
                {warns.map((w) => (
                  <div key={w.code} className="mt-2 flex gap-2 rounded-2xl px-3 py-2 text-[13.5px] font-semibold leading-snug" style={{ background: "var(--amber-soft)", color: "var(--amber-ink)" }}>
                    <span className="mt-0.5 shrink-0"><WarnIcon size={16} /></span>
                    <span><b>{WARN_TITLE[w.code] ?? "Lưu ý"}:</b> {w.text}</span>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

/** A council member as a face you can tap: "Duyệt" / ✓ đã duyệt / disabled with a visible reason. */
export function MemberButton({ member, name, state, onClick, reason, busy }: {
  member: MemberId; name: string; state: "ready" | "approved" | "waiting" | "blocked"; onClick?: () => void; reason?: string; busy?: boolean;
}) {
  const disabled = state !== "ready" || !!busy;
  const label = state === "approved" ? "Đã duyệt" : state === "blocked" ? "Không được duyệt · xung đột lợi ích" : state === "waiting" ? "Chưa duyệt" : "Duyệt";
  return (
    <div className="flex w-[116px] flex-col items-center gap-1.5 text-center">
      <button type="button" disabled={disabled} onClick={onClick} aria-label={`${name}: ${label}`} title={reason}
        className="relative grid size-[68px] place-items-center rounded-full border-[3px] bg-white p-0"
        style={{ borderColor: state === "approved" ? "var(--teal-d)" : state === "blocked" ? "#e5b8b0" : "#e9d5b0", cursor: disabled ? "default" : "pointer", boxShadow: state === "ready" ? "0 4px 0 var(--edge)" : "none", transition: "transform 100ms" }}>
        <FaceAvatar member={member} size={56} dim={state === "blocked" || state === "waiting"} />
        {state === "approved" ? <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-white text-white" style={{ background: "var(--teal-d)" }}><CheckIcon size={15} /></span> : null}
        {state === "blocked" ? <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-white text-white" style={{ background: "var(--red)" }} aria-hidden>✕</span> : null}
      </button>
      <div className="font-toy text-[16px] font-bold leading-none" style={{ color: "var(--ink)" }}>{name}</div>
      <div className="flex items-center gap-1 text-[13px] font-bold leading-tight" style={{ color: state === "approved" ? "var(--teal-ink)" : state === "blocked" ? "var(--red-ink)" : state === "ready" ? "var(--violet-d)" : "var(--ink-2)" }}>
        {state === "approved" ? "✓ " : state === "blocked" ? "✕ " : ""}{label}
      </div>
    </div>
  );
}
