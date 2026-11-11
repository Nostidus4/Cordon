// Pure helpers of the event log: which contract emitted an event, its key payload fields, filtering and search.
import type { ChainEvent } from "../../types";
import { shortHash } from "../../lib/format";

export type ContractId = "PolicyVault" | "PrincipalRegistry" | "GuardianCouncil" | "TxAllowList" | "other";

/** Colour per emitting contract: PolicyVault orange, Registry blue, Council violet, AllowList teal. */
export const CONTRACTS: { id: ContractId; label: string; color: string; soft: string; ink: string }[] = [
  { id: "PolicyVault", label: "PolicyVault", color: "#ff8c42", soft: "#fff0e2", ink: "#9a4a0d" },
  { id: "PrincipalRegistry", label: "PrincipalRegistry", color: "#18a8ff", soft: "#e0f3ff", ink: "#0b5e9c" },
  { id: "GuardianCouncil", label: "GuardianCouncil", color: "#8e5cf6", soft: "#efe7ff", ink: "#5b2fc4" },
  { id: "TxAllowList", label: "Tx AllowList", color: "#00b8b8", soft: "#d9f7f3", ink: "#0a6b66" },
  { id: "other", label: "Khác", color: "#8a8f9c", soft: "#ecedf0", ink: "#4a4f5c" },
];
export const contractMeta = (id: ContractId) => CONTRACTS.find((c) => c.id === id) ?? CONTRACTS[CONTRACTS.length - 1];

const OF: Record<string, ContractId> = {
  Paid: "PolicyVault", Swapped: "PolicyVault", PrincipalLocked: "PolicyVault", PrincipalUnlocked: "PolicyVault", Paused: "PolicyVault", Unpaused: "PolicyVault",
  CapChanged: "PolicyVault", AllowChanged: "PolicyVault", PolicyVersionBumped: "PolicyVault", TopUpRecorded: "PolicyVault",
  PrincipalCreated: "PrincipalRegistry", KeyAdded: "PrincipalRegistry", KeyMoved: "PrincipalRegistry", KeyDeactivated: "PrincipalRegistry",
  Proposed: "GuardianCouncil", Approved: "GuardianCouncil", Executed: "GuardianCouncil", Cancelled: "GuardianCouncil", EmergencyAction: "GuardianCouncil",
  RoleSet: "TxAllowList", AllowListModified: "TxAllowList",
};
export const contractOf = (name: string): ContractId => OF[name] ?? "other";

const FIELDS: Record<string, string[]> = {
  Paid: ["key", "principalId", "to", "amount", "keySpentAfter", "principalSpentAfter"],
  Swapped: ["key", "principalId", "dex", "amount", "keySpentAfter", "principalSpentAfter"],
  PrincipalLocked: ["principalId", "by", "keysRemoved"], PrincipalUnlocked: ["principalId"], Paused: ["by"], Unpaused: [],
  CapChanged: ["kind", "subject", "oldCap", "newCap"], AllowChanged: ["kind", "subject", "selector", "allowed"], PolicyVersionBumped: ["version"],
  PrincipalCreated: ["id", "label"], KeyAdded: ["id", "key", "kind"], KeyMoved: ["key", "fromId", "toId"], KeyDeactivated: ["key"],
  Proposed: ["proposalId", "proposer", "subjectPrincipal"], Approved: ["proposalId", "member"], Executed: ["proposalId"], Cancelled: ["proposalId"],
  EmergencyAction: ["member", "action", "subject"],
};

/** One payload value as short text (Money -> display, address/hash -> shortened, array -> joined or counted). */
export function fmtValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) { const s = v.map((x) => fmtValue(x) ?? "").join(", "); return v.length <= 3 && s.length <= 40 ? s : `${v.length} mục`; }
  if (typeof v === "object") { const d = (v as { display?: unknown }).display; return typeof d === "string" ? d : null; }
  const s = String(v);
  return /^0x[0-9a-fA-F]{16,}$/.test(s) ? shortHash(s, 6, 4) : s;
}

export function summarize(e: ChainEvent): [string, string][] {
  const keys = FIELDS[e.name] ?? Object.keys(e.payload).slice(0, 4);
  const out: [string, string][] = [];
  for (const k of keys) { const s = fmtValue(e.payload[k]); if (s !== null) out.push([k, s]); }
  return out;
}

export interface EventFilter { contracts: ReadonlySet<ContractId>; names: ReadonlySet<string>; q: string }

function matchesQuery(e: ChainEvent, q: string): boolean {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  if (e.txHash.toLowerCase().includes(n) || e.name.toLowerCase().includes(n)) return true;
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return v.toLowerCase().includes(n);
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(e.payload);
}

/** Newest first (block, then log index); empty sets mean "no filter". */
export function filterEvents(events: readonly ChainEvent[], f: EventFilter): ChainEvent[] {
  return events
    .filter((e) => (f.contracts.size === 0 || f.contracts.has(contractOf(e.name))) && (f.names.size === 0 || f.names.has(e.name)) && matchesQuery(e, f.q))
    .sort((a, b) => b.block - a.block || b.logIndex - a.logIndex || (a.id < b.id ? 1 : -1));
}

export const lastBlock = (events: readonly ChainEvent[]): number | null => events.reduce<number | null>((m, e) => (m === null || e.block > m ? e.block : m), null);

export function countBy<T>(items: readonly T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}
