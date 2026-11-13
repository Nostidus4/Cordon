// Section 9: assistant Q&A log (spec §9): the question, the answer text and whether the backend verified every number against the tools.
import { useQueryClient } from "@tanstack/react-query";
import { useAssistantAsk } from "../../../hooks/useActions";
import { ASSISTANT_QUESTIONS } from "../../../shared/assistantQuestions";
import { isoOfSec } from "../../../lib/dto";
import { Mascot } from "../../../stage/ui";
import type { AssistantLog } from "../../../types";
import { sysKeys, useAssistantLogs } from "../data";
import { useFeed } from "../feed";
import { ACCENT, Empty, Section, fmtClock } from "../ui";

function LogCard({ log }: { log: AssistantLog }) {
  const ok = log.numbersVerified;
  const tone = ok ? "var(--ok-ink)" : "var(--red-ink)";
  return (
    <article style={{ background: "#fff", borderRadius: 24, padding: "16px 18px 14px", boxShadow: "0 10px 26px -20px rgba(45,34,80,.5), 0 2px 0 var(--line)", minWidth: 0 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span style={{ background: "#e3f1ff", borderRadius: "18px 18px 18px 4px", padding: "5px 14px", fontWeight: 700 }}>{log.question}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-2)" }}>{fmtClock(isoOfSec(log.ts))}</span>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Mascot size={30} />
        <p style={{ margin: 0, minWidth: 0, flex: 1, fontWeight: 500, lineHeight: 1.6 }}>{log.answer}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <b style={{ color: tone, fontSize: 13 }}>{ok ? "✓ Mọi số đã được kiểm" : "✕ Có số chưa khớp, đã thay bằng câu mẫu"}</b>
        {log.flaggedUntrusted ? <span style={{ fontSize: 12, color: "var(--red-ink)" }}>câu hỏi chứa chữ lạ, đã bị coi là không tin cậy</span> : null}
      </div>
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
