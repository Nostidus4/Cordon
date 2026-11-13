// Pure helpers of the Council section (spec §6.5): symbolic calls, approval maths, conflict-of-interest reasons, emergency log.
import type { Call, ChainEvent, CouncilMember, Proposal } from "../../types";

/** `PolicyVault.setPrincipalDailyCap(minh, 30000000000)`: raw argument values, positional, exactly what the chain would receive. */
export const callSymbol = (c: Call): string => `${c.target}.${c.fn}(${Object.values(c.args).map((v) => (v && typeof v === "object" && "display" in v ? String((v as { display: unknown }).display) : String(v))).join(", ")})`;

export interface ApprovalSummary { approved: number; need: number; eligible: number; reached: boolean; stuck: boolean }
/** `stuck` = even if every non-conflicted member approved, the threshold would not be reached. */
export function approvalSummary(p: Pick<Proposal, "approvals" | "threshold" | "conflictedMembers">, members: Pick<CouncilMember, "id">[]): ApprovalSummary {
  const approved = new Set(p.approvals).size;
  const eligible = members.filter((m) => !p.conflictedMembers.includes(m.id)).length;
  return { approved, need: p.threshold, eligible, reached: approved >= p.threshold, stuck: eligible < p.threshold };
}

export interface ConflictCheck { conflict: boolean; reason: string }
/** Per-member conflict-of-interest check (spec §6.5: the member that owns the subject district may not approve). */
export function conflictCheck(m: Pick<CouncilMember, "id" | "principalId">, p: Pick<Proposal, "conflictedMembers" | "subjectPrincipal">): ConflictCheck {
  const subject = p.subjectPrincipal ?? "?";
  if (p.conflictedMembers.includes(m.id)) {
    return { conflict: true, reason: m.principalId && m.principalId === p.subjectPrincipal ? `là chủ khu ${m.principalId}, chính là đối tượng của đề xuất` : `có quyền trên khu ${subject}, đối tượng của đề xuất` };
  }
  return { conflict: false, reason: m.principalId ? `chủ khu ${m.principalId} khác ${subject}` : "không sở hữu khu nào" };
}

export interface EmergencyEntry { id: string; at: string; member: string; action: string; subject: string | null; label: string; txHash: string; simulated: boolean }
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
export function emergencyLabel(action: string, subject: string | null): string {
  switch (action) {
    case "lockPrincipal": return `Khoá khu ${subject ?? "?"}`;
    case "pauseAll": return "Dừng cả kho";
    case "unpauseAll": return "Mở lại kho";
    case "lowerCap": return `Hạ hạn mức khu ${subject ?? "?"}`;
    case "removeFromAllowlist": return "Gỡ khỏi whitelist";
    default: return action;
  }
}
/** `EmergencyAction` events (siết: one member is enough), newest first. */
export function emergencyActions(events: ChainEvent[]): EmergencyEntry[] {
  return events.filter((e) => e.name === "EmergencyAction")
    .map((e) => {
      const action = str(e.payload.action) ?? "?", subject = str(e.payload.subject);
      return { id: e.id, at: e.ts, member: str(e.payload.member) ?? "?", action, subject, label: emergencyLabel(action, subject), txHash: e.txHash, simulated: e.simulated };
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
