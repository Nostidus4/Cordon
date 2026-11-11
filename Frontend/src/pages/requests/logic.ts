// Pure logic of the Requests screen (spec §10.4, §6.5, §8.5): before/after numbers, approval slots, conflict-of-interest gating.
import type { CouncilMember, MemberId, Money, Proposal, ProposalDraft, ProposedChange } from "../../types";
import { fmtDisplay, fmtPercent, percentOf, rawToBig, toBase } from "../../lib/format";

export const MAIN_TREASURY_DEFAULT = toBase(2_000_000);
export const MEMBER_ORDER: MemberId[] = ["trang", "lan", "huy"];
export const MEMBER_SHORT: Record<MemberId, string> = { trang: "Trang", lan: "Lan", huy: "Huy" };
export const MEMBER_FULL: Record<MemberId, string> = { trang: "Chị Trang", lan: "Chị Lan", huy: "Anh Huy" };

export type Delta = { dir: "down" | "up" | "same"; abs: bigint; text: string };
export interface MetricBA {
  label: "Enforced" | "Estimated";
  before: bigint; after: bigint;
  beforeDisplay: string; afterDisplay: string;
  beforePct: number; afterPct: number;
  beforePctText: string; afterPctText: string;
  delta: Delta;
  /** red = moves toward risk, ok = toward safety, muted = neutral (e.g. Enforced rising to close the blind gap) */
  tone: "ok" | "bad" | "muted";
}
export interface GapBA { before: bigint; after: bigint; beforeDisplay: string; afterDisplay: string; closes: boolean; visible: boolean }

/** Percent of main treasury, 1 decimal, bigint maths: 30.000 / 2.000.000 -> 1,5%. */
export const pctOfTreasury = (m: bigint, treasury: bigint = MAIN_TREASURY_DEFAULT) => percentOf(m, treasury);

export function deltaOf(before: bigint, after: bigint): Delta {
  if (after === before) return { dir: "same", abs: 0n, text: "không đổi" };
  const abs = after > before ? after - before : before - after;
  return after < before ? { dir: "down", abs, text: `−${fmtDisplay(abs)}` } : { dir: "up", abs, text: `+${fmtDisplay(abs)}` };
}

function metric(label: MetricBA["label"], b: Money, a: Money, treasury: bigint, tone?: MetricBA["tone"]): MetricBA {
  const before = rawToBig(b), after = rawToBig(a);
  const bp = pctOfTreasury(before, treasury), ap = pctOfTreasury(after, treasury);
  return {
    label, before, after, beforeDisplay: b.display, afterDisplay: a.display,
    beforePct: bp, afterPct: ap, beforePctText: fmtPercent(bp), afterPctText: fmtPercent(ap), delta: deltaOf(before, after), tone: tone ?? deltaTone(deltaOf(before, after)),
  };
}

/** BEFORE -> AFTER for Enforced (chain-blocked) and Estimated (real risk if declared relations hold), plus the "khoảng mù" gap (Estimated − Enforced).
 *  Estimated moves toward risk (red) or safety (teal). Enforced rising while the blind gap shrinks is neutral, not red. */
export function beforeAfter(p: Pick<ProposalDraft, "riskReport">, treasury: bigint = MAIN_TREASURY_DEFAULT): { enforced: MetricBA; estimated: MetricBA; gap: GapBA } {
  const { before, after } = p.riskReport;
  const eb = rawToBig(before.enforced), ea = rawToBig(after.enforced), sb = rawToBig(before.estimated), sa = rawToBig(after.estimated);
  const gb = sb > eb ? sb - eb : 0n, ga = sa > ea ? sa - ea : 0n;
  const closes = ga < gb;
  const dE = deltaOf(eb, ea);
  const enforcedTone: MetricBA["tone"] = dE.dir === "down" ? "ok" : dE.dir === "same" ? "muted" : closes ? "muted" : "bad";
  return {
    enforced: metric("Enforced", before.enforced, after.enforced, treasury, enforcedTone),
    estimated: metric("Estimated", before.estimated, after.estimated, treasury),
    gap: { before: gb, after: ga, beforeDisplay: fmtDisplay(gb), afterDisplay: fmtDisplay(ga), closes, visible: gb > 0n || ga > 0n },
  };
}

/** Tone of a delta: exposure going down is good (ok), going up is a risk (bad). */
export const deltaTone = (d: Delta): "ok" | "bad" | "muted" => (d.dir === "down" ? "ok" : d.dir === "up" ? "bad" : "muted");

export type SlotState = "approved" | "proposer" | "conflict" | "pending";
export interface ApprovalSlot {
  member: MemberId; label: string; state: SlotState; at?: string;
  /** may this member's demo button be pressed right now */
  canApprove: boolean;
  /** why the button is disabled (VI), if it is */
  disabledReason?: string;
}

export const conflictReason = (label: string) =>
  `${label} đang ngồi Hội đồng và là chủ khu nhận thêm quyền (xung đột lợi ích, §6.5). Contract sẽ revert ConflictOfInterest().`;

/** The 3 approval slots and the demo-button gating. A conflicted member is blocked even if they already could approve elsewhere. */
export function approvalSlots(p: Pick<Proposal, "approvals" | "conflictedMembers" | "status" | "proposer">, members: Pick<CouncilMember, "id" | "label">[] = []): ApprovalSlot[] {
  return MEMBER_ORDER.map((id) => {
    const label = members.find((m) => m.id === id)?.label ?? MEMBER_FULL[id];
    const approval = p.approvals.find((a) => a.member === id);
    const conflicted = p.conflictedMembers.includes(id);
    let disabledReason: string | undefined;
    if (approval) disabledReason = "Đã duyệt";
    else if (p.status !== "open") disabledReason = p.status === "executed" ? "Đề xuất đã thực thi" : "Đề xuất đã đóng";
    else if (conflicted) disabledReason = conflictReason(label);
    const state: SlotState = approval ? "approved" : conflicted ? "conflict" : "pending";
    return { member: id, label, state, at: approval?.at, canApprove: !disabledReason, disabledReason };
  });
}

export const approvalCount = (p: Pick<Proposal, "approvals">) => p.approvals.length;
/** Can the proposal still reach threshold given conflicts? (2 non-conflicted members needed) */
export const canReachThreshold = (p: Pick<Proposal, "threshold" | "conflictedMembers" | "approvals">) =>
  MEMBER_ORDER.filter((m) => !p.conflictedMembers.includes(m) || p.approvals.some((a) => a.member === m)).length >= p.threshold;

export const changeKindLabel: Record<ProposedChange["kind"], string> = {
  consolidate: "Gom khu", raise_cap: "Nâng hạn mức", move_key: "Chuyển thẻ", council_district: "Khu Hội đồng",
};

/** Is this a "grant more power" request? Judged on the worst case (max of Enforced, Estimated) before vs after. */
export const isRiskIncrease = (p: Pick<ProposalDraft, "riskReport">) => {
  const { before, after } = p.riskReport;
  const worst = (t: typeof before) => { const e = rawToBig(t.enforced), s = rawToBig(t.estimated); return e > s ? e : s; };
  return worst(after) > worst(before);
};

/** Canonical JSON of the risk report (sorted keys, volatile `generatedAt` removed) -> stable hash input (spec §8.5). */
export function canonicalReport(r: ProposalDraft["riskReport"]): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "generatedAt" && k !== "createdAt").sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, strip(x)]));
    }
    return v;
  };
  return JSON.stringify(strip(r));
}

/** Deterministic hash of the report: SHA-256 via WebCrypto (contract uses keccak256; same canonical input). Falls back to FNV when unavailable. */
export async function hashReport(r: ProposalDraft["riskReport"]): Promise<string> {
  const text = canonicalReport(r);
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return "0x" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "0x" + h.toString(16).padStart(8, "0").repeat(8);
  }
}

/** Highlights which describe lines belong to which call kind, for icons. */
export type CallKind = "cap" | "move" | "create" | "bump" | "other";
export const callKind = (fn: string): CallKind =>
  fn === "setPrincipalDailyCap" ? "cap" : fn === "moveKey" ? "move" : fn === "createPrincipal" ? "create" : fn === "bumpPolicyVersion" ? "bump" : "other";
