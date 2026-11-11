// Shared assistant panel (Simulate + Requests). Fixed questions only (spec §9.5); numbers come from the answer, never invented here.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import { ASSISTANT_QUESTIONS } from "../../shared/assistantQuestions";
import { useAssistant } from "../../hooks/useAssistant";
import type { AssistantAnswer } from "../../types";
import { Card, cn } from "../ui";
import { AnswerView } from "./AnswerView";

interface Turn { id: number; questionId: string; question: string; status: "typing" | "done" | "error"; answer?: AssistantAnswer }
const MIN_TYPING_MS = 650;

export function AssistantPanel(props: {
  screen: "simulate" | "request";
  questionIds: string[];
  context: { principalIds?: string[]; proposalId?: string | number };
  onHighlight?: (h: { nodeIds: string[]; edgeIds: string[] }) => void;
  onSuggestion?: (s: { title: string; change: unknown }) => void;
}) {
  const { screen, questionIds, context, onHighlight, onSuggestion } = props;
  const { ask } = useAssistant();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const questions = questionIds.map((id) => ASSISTANT_QUESTIONS.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);

  useEffect(() => {
    const go = () => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    go();
    const t = [500, 1500].map((ms) => setTimeout(go, ms)); // the answer keeps growing while it reveals
    return () => t.forEach(clearTimeout);
  }, [turns, pending]);
  const onAsk = useCallback(async (q: (typeof questions)[number]) => {
    if (pending) return;
    const id = ++seq.current;
    setPending(true);
    setTurns((t) => [...t, { id, questionId: q.id, question: q.text, status: "typing" }]);
    const started = Date.now();
    try {
      const pid = context.proposalId === undefined ? undefined : Number(context.proposalId);
      const answer = await ask({ question: q.text, context: { screen: screen === "request" ? "requests" : "simulate", principalIds: context.principalIds, proposalId: Number.isFinite(pid) ? pid : undefined } });
      const wait = Math.max(0, MIN_TYPING_MS - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: "done", answer } : x)));
      onHighlight?.(answer.highlight);
    } catch {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
    } finally { setPending(false); }
  }, [ask, context.principalIds, context.proposalId, onHighlight, pending, screen]);

  // dev-only hook for screenshots/demos: ?ask=how_fix asks that question once, shortly after mount
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || autoAsked.current) return;
    const id = new URLSearchParams(window.location.search).get("ask");
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    autoAsked.current = true;
    setTimeout(() => void askRef.current(q), 3500);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const askRef = useRef(onAsk);
  askRef.current = onAsk;

  return (
    <Card padded={false} strong className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Trợ lý Guardian">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <div className="grid size-9 place-items-center rounded-xl bg-[image:var(--brand-gradient)] shadow-[var(--shadow-glow-brand)]"><Sparkles className="size-4.5 text-white" aria-hidden /></div>
        <div className="leading-tight">
          <h2 className="text-[14px] font-semibold text-text">Trợ lý Guardian</h2>
          <p className="text-[11.5px] text-faint">Trả lời từ số liệu thật của giả lập</p>
        </div>
      </div>

      <div ref={scroller} aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex gap-2.5">
            <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Sparkles className="size-3.5" aria-hidden /></div>
            <p className="rounded-2xl rounded-tl-sm bg-white/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-muted">
              Bạn muốn hỏi gì? Bấm một câu bên dưới, mình sẽ trả lời bằng số liệu và tô <span className="font-semibold text-warn">viền vàng</span> những phần liên quan trên bản đồ.
            </p>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[88%] rounded-2xl rounded-tr-sm bg-brand/25 px-3.5 py-2 text-[13.5px] font-medium text-text ring-1 ring-brand/40">{t.question}</p>
              </div>
              <div className="flex gap-2.5">
                <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Sparkles className="size-3.5" aria-hidden /></div>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-white/5 px-3.5 py-3">
                  {t.status === "typing" ? <TypingDots /> : t.status === "error" ? (
                    <p className="text-[13px] text-bad"><span aria-hidden>✕</span> Chưa trả lời được lúc này. Thử lại sau vài giây.</p>
                  ) : t.answer ? <AnswerView answer={t.answer} onSuggestion={onSuggestion} /> : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-line bg-black/10 p-3">
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint"><MessageCircleQuestion className="size-3.5" aria-hidden /> Câu hỏi gợi ý</p>
        <div className="flex flex-col gap-1.5">
          {questions.map((q, i) => {
            const asked = turns.some((t) => t.questionId === q.id && t.status === "done");
            return (
              <button key={q.id} type="button" disabled={pending} onClick={() => onAsk(q)}
                className={cn("group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-medium transition-all duration-150 disabled:opacity-50",
                  "border-line bg-white/4 text-text hover:border-brand/60 hover:bg-brand-soft active:scale-[0.985]", asked && "border-ok/25")}>
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-md bg-white/8 text-[11px] font-bold text-muted group-hover:bg-brand/30">{i + 1}</span>
                <span className="flex-1">{q.text}</span>
                {asked ? <span className="text-[11px] font-semibold text-ok" aria-label="đã hỏi">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function TypingDots() {
  return (
    <div role="status" className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => <motion.span key={i} className="size-1.5 rounded-full bg-brand" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
      </span>
      Đang tính trên đồ thị…
    </div>
  );
}
