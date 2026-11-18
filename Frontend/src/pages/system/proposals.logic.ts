// Pure helpers of the Hội đồng proposals view: default selection, finding-based suggestions, scene-5 linkage, timelock phase, "you think" number.
import type { District, Finding, GraphSnapshot, Money, MemberId, Proposal, ProposedChange } from "../../types";
import { money, toBase } from "../../lib/format";

/** Which proposal opens: the `?id=` one, else the oldest open one, else the newest. */
export function pickProposalId(list: Pick<Proposal, "id" | "status">[], idParam: number | null): number | null {
  if (idParam != null && list.some((p) => p.id === idParam)) return idParam;
  const open = list.filter((p) => p.status === "open").sort((a, b) => a.id - b.id);
  return (open[0] ?? [...list].sort((a, b) => b.id - a.id)[0])?.id ?? null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Findings that have an auto-generated fix nobody has proposed yet (open proposals with the same change hide it). */
export function suggestionsFrom(findings: Finding[] | undefined, proposals: Pick<Proposal, "status" | "change">[] | undefined): Finding[] {
  const open = (proposals ?? []).filter((p) => p.status === "open");
  return (findings ?? []).filter((f) => f.proposal && !open.some((p) => same(p.change, f.proposal)));
}
/** The open proposal that already carries a finding's fix, if any. */
export const proposalForFinding = (f: Pick<Finding, "proposal">, proposals: Pick<Proposal, "id" | "status" | "change">[] | undefined) =>
  f.proposal ? (proposals ?? []).find((p) => p.status === "open" && same(p.change, f.proposal)) : undefined;

/** Scene 5: #12 (raise Minh's cap) and #13 (give the rebalance agent to Huy) travel together. */
export const isScene5 = (p: Pick<Proposal, "id">) => p.id === 12 || p.id === 13;
export const linkedScene5 = (p: Pick<Proposal, "id">, all: Proposal[]) => (isScene5(p) ? all.find((x) => x.id === (p.id === 12 ? 13 : 12)) : undefined);
export const councilDistrictChange = (rebalanceKey: string): ProposedChange =>
  ({ kind: "create_district", principalId: "council_ops", label: "Khu do Hội đồng sở hữu", owner: "council", keys: [rebalanceKey], districtCap: money(toBase(100000)) });

export interface TimelockView { left: number; ready: boolean }
/** Timelock (#77): null unless the proposal is queued with an eta; `ready` once eta has passed. */
export function timelockView(p: Pick<Proposal, "queued" | "eta" | "status">, nowSec: number): TimelockView | null {
  if (p.status !== "open" || !p.queued || p.eta == null) return null;
  const left = Math.max(0, Math.ceil(p.eta - nowSec));
  return { left, ready: left === 0 };
}

/**
 * Real length of the timelock in seconds: from the approval that reached 2/3 (the newest `approvedAt`) to `eta`.
 * Falls back to the largest countdown seen on screen when the approval times are unknown, never below 1.
 */
export function timelockTotal(p: Pick<Proposal, "eta" | "members">, seenMax: number): number {
  const times = p.members.map((m) => m.approvedAt).filter((t): t is number => typeof t === "number");
  const queuedAt = times.length ? Math.max(...times) : null;
  if (p.eta != null && queuedAt != null && p.eta > queuedAt) return Math.ceil(p.eta - queuedAt);
  return Math.max(1, seenMax);
}

/** Plain Vietnamese for the API error codes of the Council actions; never shows a raw code. */
const API_ERROR_VI: Record<string, string> = {
  ALREADY_APPROVED: "Thành viên này đã duyệt đề xuất rồi.",
  CONFLICT_OF_INTEREST: "Xung đột lợi ích: chủ khu bị ảnh hưởng không được tự duyệt.",
  NOT_COUNCIL_MEMBER: "Chỉ thành viên Hội đồng mới làm được việc này.",
  PROPOSAL_NOT_OPEN: "Đề xuất này không còn ở trạng thái chờ duyệt.",
  PROPOSAL_NOT_FOUND: "Không tìm thấy đề xuất này.",
  TIMELOCK_NOT_READY: "Chưa hết giờ chờ nên chưa áp dụng được.",
  NEEDS_THRESHOLD: "Chưa đủ phiếu 2/3.",
  ALREADY_LOCKED: "Khu này đã bị khoá rồi.",
  ALREADY_PAUSED: "Kho đã dừng rồi.",
  DISTRICT_NOT_FOUND: "Không tìm thấy khu này.",
  BAD_REQUEST: "Yêu cầu chưa hợp lệ.",
};
export const apiErrorVi = (code: string | null | undefined): string => (code && API_ERROR_VI[code]) || "Có lỗi xảy ra, thử lại sau ít giây.";
/** Codes that only mean "someone already did it": shown as a calm notice, not a red error. */
export const isBenignApiError = (code: string | null | undefined): boolean => code === "ALREADY_APPROVED" || code === "ALREADY_LOCKED" || code === "ALREADY_PAUSED";

/** Member who signs the execute call in demo mode: someone who approved (any member may call it), else the first member. */
export const executorOf = (p: Pick<Proposal, "approvals">, members: { id: MemberId }[]): MemberId | null => p.approvals[0] ?? members[0]?.id ?? null;

/** What the owner believes: the shared cap when there is one, otherwise the sum of the human cards' own caps. */
export function youThinkOf(snap: GraphSnapshot, d: District): Money | null {
  if (d.dailyCap) return d.dailyCap;
  let sum = 0n, any = false;
  for (const k of d.keys) {
    const n = snap.nodes.find((x) => x.id === `k:${k}`);
    if (n?.data.kind === "HUMAN") { sum += BigInt(n.data.keyDailyCap?.raw ?? "0"); any = true; }
  }
  return any ? money(sum) : null;
}
