// Section 9: assistant Q&A log (spec §9): read-only tool calls, numbers[] and the rule "every number must match a tool value".
import { Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAssistantAsk } from "../../../hooks/useActions";
import { ASSISTANT_QUESTIONS } from "../../../shared/assistantQuestions";
import { numbersInText } from "../../../lib/mock/assistantVerify";
import { Mascot } from "../../../stage/ui";
import type { AssistantLog } from "../../../types";
import { summarizeLog, fmtArgs } from "../assistant.logic";
import { sysKeys, useAssistantLogs } from "../data";
import { useFeed } from "../feed";
import { ACCENT, Empty, Section, fmtClock } from "../ui";

/** The answer text with every numeric token marked: covered by numbers[] (green) or not (red). */
function Marked({ log }: { log: AssistantLog }) {
  const covered = new Set(log.answer.numbers.flatMap((n) => numbersInText(n.value)));
  const parts = log.answer.answer.split(/(\d+(?:[.,]\d+)*%?)/g);
  return (
    <p style={{ margin: 0, fontWeight: 500, lineHeight: 1.6 }}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const ok = numbersInText(p).every((t) => covered.has(t));
        return <mark key={i} className="tnum" title={ok ? "có trong numbers[]" : "KHÔNG có trong numbers[]"} style={{ background: ok ? "var(--ok-soft)" : "var(--red-soft)", color: ok ? "var(--ok-ink)" : "var(--red-ink)", borderRadius: 6, padding: "0 4px", fontWeight: 800, boxShadow: `0 2px 0 ${ok ? "var(--ok-line)" : "#ffb9b9"}` }}>{p}</mark>;
      })}
    </p>
  );
}

function LogCard({ log }: { log: AssistantLog }) {
  const sum = summarizeLog(log);
  const ok = sum.allOk;
  const tone = ok ? "var(--ok-ink)" : "var(--red-ink)";
  return (
    <article style={{ background: "#fff", borderRadius: 24, padding: "16px 18px 14px", boxShadow: "0 10px 26px -20px rgba(45,34,80,.5), 0 2px 0 var(--line)", minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span style={{ background: "#e3f1ff", borderRadius: "18px 18px 18px 4px", padding: "5px 14px", fontWeight: 700 }}>{log.question}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-2)" }}>{fmtClock(log.createdAt)}</span>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Mascot size={30} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Marked log={log} />
          {log.answer.suggestions?.length ? <div className="mt-1.5" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Gợi ý, chưa thành đề xuất: <b style={{ color: "var(--ink)" }}>{log.answer.suggestions[0].title}</b></div> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <b style={{ color: tone, fontSize: 13 }}>{sum.total ? (ok ? "✓ Mọi số đã được kiểm" : `✕ ${sum.failed + sum.uncovered} số không khớp`) : sum.fallback ? "Câu mẫu dự phòng, không có số để kiểm" : "Không có số nào để kiểm"}</b>
        {sum.total ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>numbers_verified = {String(log.numbersVerified)}</span> : null}
        {sum.fallback ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>fallback: không gọi công cụ nào</span> : null}
        {!log.numbersVerified && !sum.fallback ? <span style={{ fontSize: 12, color: "var(--red-ink)" }}>sẽ thay bằng câu mẫu dự phòng</span> : null}
      </div>

      {log.checks.length || log.uncovered.length ? (
        <div className="mt-2 grid gap-1">
          {log.checks.map((c, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-3" style={{ background: c.match ? "var(--ok-soft)" : "var(--red-soft)", borderRadius: 12, padding: "4px 12px" }}>
              <b style={{ color: c.match ? "var(--ok-ink)" : "var(--red-ink)", width: 14 }}>{c.match ? "✓" : "✕"}</b>
              <span style={{ flex: "1 1 120px" }}>{c.label}</span>
              <b className="font-toy tnum" style={{ fontSize: 16 }}>{c.value}</b>
              {!c.match ? <span style={{ fontSize: 12, color: "var(--red-ink)" }}>tool trả về {c.toolValue ?? "không đọc được"}</span> : null}
              <code className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>{c.source}.{c.path}</code>
            </div>
          ))}
          {log.uncovered.map((u) => <div key={u} style={{ background: "var(--red-soft)", borderRadius: 12, padding: "4px 12px", color: "var(--red-ink)" }}><b>✕</b> số <b className="tnum">{u}</b> có trong câu trả lời nhưng không có trong numbers[]</div>)}
        </div>
      ) : null}

      <details className="mt-2" style={{ fontSize: 12 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontWeight: 600 }}>Công cụ đã gọi ({log.toolCalls.length}), chỉ đọc</summary>
        <div className="mt-1.5 grid gap-1">
          {log.toolCalls.length === 0 ? <span style={{ color: "var(--ink-2)" }}>Không gọi công cụ nào.</span> : log.toolCalls.map((t, i) => (
            <div key={i} style={{ background: "#2d2250", borderRadius: 12, padding: "5px 10px" }}>
              <code className="mono" style={{ color: "#8fe7c9" }}>{t.tool}({fmtArgs(t.args).slice(0, 110)})</code>
              <div style={{ color: "#e9e0cd", fontSize: 12 }}>{t.resultSummary}</div>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

const QUICK = ASSISTANT_QUESTIONS;

export function Assistant() {
  const qc = useQueryClient();
  const { data: logs, isError, isLoading } = useAssistantLogs();
  const ask = useAssistantAsk();
  const list = [...(logs ?? [])].reverse();
  const run = (q: (typeof QUICK)[number]) => {
    useFeed.getState().rest1(true);
    ask.mutate({ question: q.text, context: { screen: q.screen } }, { onSuccess: () => qc.invalidateQueries({ queryKey: sysKeys.assistantLogs }) });
  };
  return (
    <Section id="tro-ly" accent={ACCENT.edu} title="Hỏi đáp với Trợ lý" sub="AI chỉ đọc, không ký. Mọi số trong câu trả lời phải khớp số mà công cụ đọc được."
      right={<span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-2)", background: "#e4eef2", borderRadius: 999, padding: "3px 12px" }}>AI chỉ đọc · không ký</span>}>
      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Hỏi Trợ lý">
        {QUICK.map((q) => <button key={q.id} type="button" className="toy-chip" style={{ fontSize: 14, padding: "4px 14px" }} disabled={ask.isPending} onClick={() => run(q)}>{q.text}</button>)}
        {ask.isPending ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>đang hỏi…</span> : null}
      </div>
      {isLoading ? <Empty>Đang tải…</Empty> : isError ? <Empty>Backend chưa mở nhật ký hỏi đáp.</Empty>
        : list.length === 0 ? <Empty>Chưa có câu hỏi nào. Bấm một câu ở trên để xem Trợ lý gọi công cụ và hệ thống kiểm số.</Empty>
        : <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 520px), 1fr))" }}>{list.slice(0, 4).map((l) => <LogCard key={l.id} log={l} />)}</div>}
    </Section>
  );
}
export default Assistant;
