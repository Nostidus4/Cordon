// Pure derivations of the "Agent AI" tab: who the agents are, which key/district binds each, what they did last.
// The rule engine / chain decide money; the LLM only words a reason or drafts something a human confirms.
import type { AgentRun, AgentStep, CopilotDraft, GraphSnapshot, Incident, PayrollAgentRun, TxCheck, Violation, ViolationSource } from "../../types";

export const REBALANCE_KEY = "key_agent_rebalance";
/** An agent counts as "just ran" for this many seconds after its last run. */
export const RECENT_SEC = 90;

export type AgentId = "rebalance" | "payroll" | "assistant" | "copilot" | "responder" | "txguard" | "attacker";
export type Tone = "ok" | "bad" | "warn" | "info" | "grey";

export interface Binding { keyId: string; keyLabel: string; principalId: string | null; district: string | null }

/** Join a key id with the graph: key node (label, principalId) and the district that lists it. */
export function bindKey(graph: GraphSnapshot | undefined, keyId: string): Binding {
  const node = graph?.nodes.find((n) => n.id === `k:${keyId}`);
  const dist = graph?.districts.find((d) => d.keys.includes(keyId) || (!!node?.data.principalId && d.principalId === node.data.principalId));
  return { keyId, keyLabel: node?.label ?? keyId, principalId: dist?.principalId ?? node?.data.principalId ?? null, district: dist?.label ?? null };
}

export type StatusKind = "busy" | "recent" | "idle" | "never" | "readonly" | "unavailable";
export interface Status { kind: StatusKind; ts: number | null; label: string }
export interface Outcome { tone: Tone; label: string }
export interface RosterCard {
  id: AgentId;
  name: string;
  role: string;
  mayDo: string;
  never: string;
  bindings: Binding[];
  bindingNote: string;
  status: Status;
  outcome: Outcome | null;
  scripted?: boolean;
}

const ago = (ts: number | null, now: number): StatusKind => (ts == null ? "never" : now - ts <= RECENT_SEC ? "recent" : "idle");
const newest = <T,>(list: T[] | undefined, ts: (x: T) => number): T | null => (list?.length ? list.reduce((a, b) => (ts(b) >= ts(a) ? b : a)) : null);

export function rebalanceOutcome(r: AgentRun | null): Outcome | null {
  if (!r) return null;
  if (r.outcome === "swapped") return { tone: "ok", label: "đã đổi" };
  if (r.outcome === "no_action") return { tone: "grey", label: "không cần làm gì" };
  return { tone: "bad", label: "bị chặn" };
}
export function payrollOutcome(r: PayrollAgentRun | null): Outcome | null {
  if (!r) return null;
  if (r.outcome === "acted") return { tone: "ok", label: "đã chuyển quỹ" };
  if (r.outcome === "blocked") return { tone: "bad", label: "bị chặn" };
  if (r.outcome === "kill_requested") return { tone: "warn", label: "xin bật công tắc dừng" };
  return { tone: "grey", label: "không cần làm gì" };
}

export function isOpenIncident(i: Pick<Incident, "status">): boolean { return i.status !== "resolved"; }

export interface RosterInput {
  graph?: GraphSnapshot;
  runs?: AgentRun[];
  payrollRuns?: PayrollAgentRun[];
  incidents?: Incident[];
  violations?: Violation[];
  drafts?: CopilotDraft[];
  checks?: TxCheck[];
  now: number; // epoch seconds
}

function txguardOutcome(c: TxCheck | null): Outcome | null {
  if (!c) return null;
  return { tone: c.level === "safe" ? "ok" : c.level === "caution" ? "warn" : "bad", label: c.level === "safe" ? "an toàn" : c.level === "caution" ? "cần cân nhắc" : "nguy hiểm" };
}

/** Status text without the clock (the view appends hh:mm for "recent"). */
export function statusLabel(s: Status): string {
  switch (s.kind) {
    case "busy": return "đang xử lý";
    case "recent": return "vừa chạy";
    case "idle": return "đang nghỉ";
    case "never": return "chưa chạy";
    case "readonly": return "chỉ đọc, chạy khi được hỏi";
    case "unavailable": return "chưa có dữ liệu ở bản demo trình duyệt";
  }
}

export function buildRoster(x: RosterInput): RosterCard[] {
  const lastRun = newest(x.runs, (r) => r.ts);
  const lastPay = newest(x.payrollRuns, (r) => r.ts);
  const openInc = (x.incidents ?? []).filter(isOpenIncident);
  const lastInc = newest(x.incidents, (i) => i.openedAt);
  const lastDraft = newest(x.drafts, (d) => d.createdAt);
  const lastCheck = newest(x.checks, (c) => c.createdAt);
  const pendingDrafts = (x.drafts ?? []).filter((d) => d.status === "pending");
  const attackerViol = (x.violations ?? []).filter((v) => v.source === "attacker");
  const lastAtk = newest(attackerViol, (v) => v.ts);
  const attackerKeys = [...new Set(attackerViol.map((v) => v.key))];
  const draftKeys = [...new Set((x.drafts ?? []).map((d) => d.details.signerLabel))];
  const st = (kind: StatusKind, ts: number | null, label = ""): Status => ({ kind, ts, label: label || statusLabel({ kind, ts, label: "" }) });

  return [
    {
      id: "rebalance", name: "Cân đối", role: "Giữ kho 80% tUSDC, 20% tTKB",
      mayDo: "Đổi tUSDC sang tTKB khi lệch quá 5%, tối đa 5.000 mỗi lần",
      never: "Không tự nới hạn mức; luật tính số tiền, mô hình ngôn ngữ chỉ viết lý do",
      bindings: [bindKey(x.graph, REBALANCE_KEY)], bindingNote: "Ký bằng thẻ này, bị cùng luật chain chặn",
      status: st(ago(lastRun?.ts ?? null, x.now), lastRun?.ts ?? null), outcome: rebalanceOutcome(lastRun),
    },
    {
      id: "payroll", name: "Quỹ lương", role: "Giữ đủ tiền cho ngày lương, phần dư đem gửi sinh lời",
      mayDo: "Rút hoặc gửi quỹ theo bậc thang; xin bật công tắc dừng khi có rủi ro",
      never: "Không vượt trần quỹ; công tắc dừng và Hội đồng đứng trên nó",
      bindings: [], bindingNote: "Khoá riêng của hợp đồng quỹ lương; mới chạy trên chain giả lập, chưa deploy lên L1",
      status: x.payrollRuns ? st(ago(lastPay?.ts ?? null, x.now), lastPay?.ts ?? null) : st("unavailable", null),
      outcome: payrollOutcome(lastPay),
    },
    {
      id: "assistant", name: "Trợ lý hỏi đáp", role: "Trả lời 4 câu hỏi cố định về rủi ro",
      mayDo: "Gọi công cụ chỉ đọc, rồi viết câu trả lời; mọi số phải khớp công cụ",
      never: "Không có khoá ký, không gửi giao dịch",
      bindings: [], bindingNote: "Không có thẻ nào", status: st("readonly", null), outcome: null,
    },
    {
      id: "copilot", name: "Copilot", role: "Soạn nháp giao dịch từ câu chat",
      mayDo: "Soạn nháp trả tiền hoặc đổi tiền, chạy thử kiểm tra",
      never: "Không tự gửi: nháp nào cũng chờ người xác nhận; khi gửi thì bị cùng luật chain chặn",
      bindings: [], bindingNote: draftKeys.length ? `Người xác nhận ký bằng thẻ: ${draftKeys.join(", ")}` : "Người xác nhận ký bằng thẻ của mình, trong khu của thẻ đó",
      status: x.drafts == null ? st("unavailable", null)
        : pendingDrafts.length ? st("busy", null, `${pendingDrafts.length} nháp chờ người xác nhận`)
        : st(ago(lastDraft?.createdAt ?? null, x.now), lastDraft?.createdAt ?? null),
      outcome: pendingDrafts.length ? { tone: "warn", label: "chờ người xác nhận" } : null,
    },
    {
      id: "responder", name: "Ứng cứu sự cố", role: "Phát hiện, khoanh vùng, đề xuất khôi phục",
      mayDo: "Siết ngay (khoá khu) khi thấy dấu hiệu; soạn đề xuất khôi phục",
      never: "Không tự nới: khôi phục luôn cần Hội đồng 2/3",
      bindings: [], bindingNote: "Siết bằng quyền một thành viên Hội đồng, không dùng thẻ tiêu tiền",
      status: openInc.length ? st("busy", openInc[0].openedAt, `đang xử lý ${openInc.length} sự cố`) : st(ago(lastInc?.openedAt ?? null, x.now), lastInc?.openedAt ?? null),
      outcome: lastInc ? (isOpenIncident(lastInc) ? { tone: "warn", label: "đang mở" } : { tone: "ok", label: "đã xong" }) : null,
    },
    {
      id: "txguard", name: "Kiểm tra giao dịch", role: "Đọc giao dịch trước khi gửi, báo mức nguy hiểm",
      mayDo: "Chạy thử, so trạng thái trước và sau, nêu cảnh báo",
      never: "Không có khoá ký; người dùng tự quyết gửi hay bỏ",
      bindings: [], bindingNote: "Không có thẻ nào",
      status: x.checks == null ? st("unavailable", null) : st("readonly", lastCheck?.createdAt ?? null),
      outcome: txguardOutcome(lastCheck),
    },
    {
      id: "attacker", name: "Kẻ tấn công (kịch bản giả lập)", role: "Diễn viên trong demo, không phải agent thật",
      mayDo: "Thử lấy thẻ bị lộ để trả ví lạ, đổi qua chợ lạ, vượt hạn mức",
      never: "Không có đường tắt: mọi lần thử đều qua cùng luật chain; thẻ lộ chỉ thiệt trong khu của nó",
      bindings: attackerKeys.map((k) => bindKey(x.graph, k)), bindingNote: attackerKeys.length ? "Mượn các thẻ này trong kịch bản" : "Chưa thử lần nào",
      status: st(ago(lastAtk?.ts ?? null, x.now), lastAtk?.ts ?? null),
      outcome: lastAtk ? { tone: "bad", label: "bị chặn" } : null, scripted: true,
    },
  ];
}

// ---------- rebalance run timeline ----------
export type StepTone = "ok" | "bad" | "grey";
export interface StepRow { key: AgentStep["key"]; label: string; tone: StepTone }
export const stepRows = (r: AgentRun): StepRow[] =>
  (r.steps ?? []).map((s) => ({ key: s.key, label: s.labelVi, tone: s.status === "ok" ? "ok" : s.status === "blocked" ? "bad" : "grey" }));

export type HashState = "match" | "mismatch" | "none";
export const hashState = (r: Pick<AgentRun, "reasonHashVerified">): HashState => (r.reasonHashVerified == null ? "none" : r.reasonHashVerified ? "match" : "mismatch");
export const reasonSourceVi = (s: AgentRun["reasonSource"]): string | null => (s === "llm" ? "câu do AI viết, đã kiểm số" : s === "template" ? "câu mẫu do luật sinh" : null);
export const sortRunsNewest = <T extends { ts: number; id: number }>(runs: T[] | undefined): T[] => [...(runs ?? [])].sort((a, b) => b.ts - a.ts || b.id - a.id);
/** "Xem thêm" paging: how many runs to show after `pages` clicks. */
export const visibleCount = (total: number, pages: number, size = 5): number => Math.min(total, size * Math.max(1, pages));

// ---------- incidents ----------
export interface IncidentStepRow { key: string; label: string; tone: "done" | "active" | "pending" | "skipped"; ts: number | null; detail: string; txHash: string | null }
export const incidentRows = (i: Incident): IncidentStepRow[] => i.steps.map((s) => ({ key: s.key, label: s.labelVi, tone: s.status, ts: s.ts, detail: s.detailVi, txHash: s.txHash }));

// ---------- violations by source ----------
export type SourceFilter = "all" | ViolationSource;
export const SOURCE_VI: Record<ViolationSource, string> = { agent: "Agent", attacker: "Kẻ tấn công", copilot: "Copilot", fault: "Lỗi cố ý", other: "Khác" };
export const filterViolations = (list: Violation[] | undefined, f: SourceFilter): Violation[] => (list ?? []).filter((v) => f === "all" || v.source === f);
export function countBySource(list: Violation[] | undefined): Record<SourceFilter, number> {
  const c: Record<SourceFilter, number> = { all: 0, agent: 0, attacker: 0, copilot: 0, fault: 0, other: 0 };
  for (const v of list ?? []) { c.all++; c[v.source]++; }
  return c;
}

// ---------- overview strip ----------
export interface NowStrip { lastRun: AgentRun | null; openIncident: Incident | null; lastAttacker: Violation | null }
export function nowStrip(x: { runs?: AgentRun[]; incidents?: Incident[]; violations?: Violation[] }): NowStrip {
  return {
    lastRun: newest(x.runs, (r) => r.ts),
    openIncident: newest((x.incidents ?? []).filter(isOpenIncident), (i) => i.openedAt),
    lastAttacker: newest((x.violations ?? []).filter((v) => v.source === "attacker"), (v) => v.ts),
  };
}
