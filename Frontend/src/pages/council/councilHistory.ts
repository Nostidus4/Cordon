// Council history built from indexed chain events (spec §10.6): emergency lock / pause (siết, 1 người), proposals executed (nới, 2/3).
import type { ChainEvent, CouncilMember } from "../../types";

export type HistoryKind = "tighten" | "loosen" | "propose" | "vote";
export interface HistoryItem {
  id: string; ts: string; kind: HistoryKind; title: string; detail?: string;
  /** shown as a chip: the rule that applied */
  rule: string; txHash: string; simulated: boolean; policyVersion?: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const SUBJECT: Record<string, string> = { minh: "anh Minh", huy: "anh Huy", lan: "chị Lan", agent_data: "Trợ lý Dữ liệu", agent_intl_pay: "Trợ lý Thanh toán quốc tế", agent_rebalance: "Trợ lý Cân đối", svc_payment: "Phần mềm thanh toán" };

/** `baselineOffset` = raw policy counter minus the label shown (health.policyVersion - policyLabel(health)); 0 in mock mode. */
export function buildHistory(events: ChainEvent[], members: CouncilMember[], baselineOffset = 0): HistoryItem[] {
  const who = (id: unknown) => members.find((m) => m.id === id)?.label ?? str(id);
  const emergencyTx = new Set(events.filter((e) => e.name === "EmergencyAction").map((e) => e.txHash));
  const titles = new Map<number, string>();
  const votes = new Map<number, number>();
  const out: HistoryItem[] = [];
  let policy: number | undefined;
  for (const e of events) {
    const p = e.payload;
    const base = { id: e.id, ts: e.ts, txHash: e.txHash, simulated: e.simulated };
    switch (e.name) {
      case "EmergencyAction": {
        const lock = p.action === "lockPrincipal";
        out.push({ ...base, kind: "tighten", rule: "siết · 1 người",
          title: lock ? `${who(p.member)} khoá khu ${SUBJECT[str(p.subject)] ?? str(p.subject)}` : `${who(p.member)} dừng cả kho`,
          detail: lock ? "Các thẻ trong khu bị gạch khỏi Tx AllowList. Chỉ cần một người." : "Mọi thẻ ở mọi khu ngừng chi. Chỉ cần một người." });
        break;
      }
      case "Paused":
        if (!emergencyTx.has(e.txHash)) out.push({ ...base, kind: "tighten", rule: "siết · 1 người", title: `${who(p.by)} dừng cả kho` });
        break;
      case "PrincipalLocked":
        if (!emergencyTx.has(e.txHash)) out.push({ ...base, kind: "tighten", rule: "siết · 1 người", title: `${who(p.by)} khoá khu ${SUBJECT[str(p.principalId)] ?? str(p.principalId)}` });
        break;
      case "Proposed": {
        const id = Number(p.proposalId); titles.set(id, str(p.title));
        out.push({ ...base, kind: "propose", rule: "đề xuất", title: `${who(p.proposer)} đề xuất #${id}`, detail: str(p.title) });
        break;
      }
      case "Approved": {
        const id = Number(p.proposalId); votes.set(id, (votes.get(id) ?? 0) + 1);
        out.push({ ...base, kind: "vote", rule: `phiếu ${votes.get(id)}/2`, title: `${who(p.member)} duyệt #${id}`, detail: titles.get(id) });
        break;
      }
      case "PolicyVersionBumped": policy = Number(p.version) - baselineOffset; break;
      case "Executed": {
        const id = Number(p.proposalId);
        out.push({ ...base, kind: "loosen", rule: "nới · 2/3", title: `Đề xuất #${id} được thực thi`, detail: titles.get(id), policyVersion: policy });
        break;
      }
    }
  }
  return out.reverse();
}
