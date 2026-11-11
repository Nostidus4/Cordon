// Renders one AssistantAnswer: bold numbers (with source tooltip), word-by-word reveal, warnings by code, suggestions.
import { Fragment, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Wand2 } from "lucide-react";
import type { AssistantAnswer } from "../../types";
import { Button, Tooltip, cn } from "../ui";

export type AssistantWarning = NonNullable<AssistantAnswer["warnings"]>[number];

const WARNING_STYLE: Record<AssistantWarning["code"], { glyph: string; title: string; cls: string }> = {
  CONFLICT_OF_INTEREST: { glyph: "✕", title: "Xung đột lợi ích", cls: "border-bad/50 bg-bad-soft text-bad" },
  CONCENTRATION: { glyph: "▲", title: "Tập trung quyền", cls: "border-warn/50 bg-warn-soft text-warn" },
  DATA_DECLARED: { glyph: "◇", title: "Dữ liệu tự khai, chưa kiểm chứng", cls: "border-dashed border-sim/60 bg-sim/10 text-sim" },
};
const SOURCE_TEXT: Record<AssistantAnswer["numbers"][number]["source"], string> = {
  simulate: "giả lập tức thời", district: "dữ liệu khu", proposal: "báo cáo rủi ro của đề xuất", graph: "đồ thị quyền",
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Seg { text: string; num?: AssistantAnswer["numbers"][number] }
/** Split the answer text so every `numbers[].value` occurrence becomes a bold segment. */
export function segmentAnswer(text: string, numbers: AssistantAnswer["numbers"]): Seg[] {
  const vals = [...new Set(numbers.map((n) => n.value).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!vals.length) return [{ text }];
  const re = new RegExp(`(?<![\\d.,])(${vals.map(esc).join("|")})(?![\\d])`, "g");
  return text.split(re).filter((p) => p !== "").map((p) => {
    const num = numbers.find((n) => n.value === p);
    return num ? { text: p, num } : { text: p };
  });
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.022 } } };
const word = { hidden: { opacity: 0, y: 5, filter: "blur(3px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.28 } } };

export function AnswerView({ answer, onSuggestion, animate = true }: {
  answer: AssistantAnswer; onSuggestion?: (s: { title: string; change: unknown }) => void; animate?: boolean;
}) {
  const segs = useMemo(() => segmentAnswer(answer.answer, answer.numbers), [answer]);
  return (
    <div className="space-y-3">
      <motion.p variants={container} initial={animate ? "hidden" : "show"} animate="show" className="text-[14px] leading-relaxed text-text">
        {segs.map((s, i) =>
          s.num ? (
            <motion.span key={i} variants={word} className="inline-block">
              <Tooltip content={<span>nguồn: <b>{SOURCE_TEXT[s.num.source]}</b><br /><span className="font-mono text-[10px] text-faint">{s.num.path}</span></span>}>
                <b tabIndex={0} className="cursor-help rounded bg-white/8 px-1 font-bold text-text underline decoration-dotted decoration-faint underline-offset-4 tnum">{s.text}</b>
              </Tooltip>
            </motion.span>
          ) : (
            <Fragment key={i}>
              {s.text.split(/(\s+)/).map((w, j) => (/^\s+$/.test(w) || w === "" ? <Fragment key={j}>{w}</Fragment> : <motion.span key={j} variants={word} className="inline-block">{w}</motion.span>))}
            </Fragment>
          ),
        )}
      </motion.p>

      {answer.numbers.length > 0 ? (
        <motion.dl initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: animate ? 0.9 : 0 }} className="grid grid-cols-1 gap-1.5">
          {answer.numbers.map((n) => (
            <div key={n.label + n.path} className="flex items-baseline justify-between gap-3 rounded-lg border border-line bg-white/4 px-3 py-1.5 text-[12.5px]">
              <dt className="text-muted">{n.label}</dt>
              <Tooltip content={<span>nguồn: <b>{SOURCE_TEXT[n.source]}</b></span>}><dd tabIndex={0} className="cursor-help font-bold text-text tnum">{n.value}</dd></Tooltip>
            </div>
          ))}
        </motion.dl>
      ) : null}

      {answer.warnings?.map((w, i) => {
        const st = WARNING_STYLE[w.code];
        return (
          <motion.div key={i} role="note" initial={animate ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay: animate ? 1.05 + i * 0.1 : 0 }}
            className={cn("flex gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] leading-snug", st.cls)}>
            <span aria-hidden className="mt-px font-bold">{st.glyph}</span>
            <span><b className="block text-[11px] uppercase tracking-wide">{st.title}</b><span className="text-text/90">{w.text}</span></span>
          </motion.div>
        );
      })}

      {answer.suggestions?.map((s, i) => (
        <motion.div key={i} initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: animate ? 1.2 : 0 }}
          className="rounded-xl border border-brand/45 bg-brand-soft p-3">
          <p className="mb-2 flex items-start gap-2 text-[13px] font-semibold text-text"><Wand2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{s.title}</p>
          {onSuggestion ? (
            <Button size="sm" variant="primary" icon={<ArrowRight className="size-3.5" />} onClick={() => onSuggestion({ title: s.title, change: s.change })}>Tạo đề xuất sửa</Button>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
