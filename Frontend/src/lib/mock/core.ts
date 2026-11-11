// In-browser mock backend core: seed (spec §4), rules (spec §6.3 order), simulateCompromise (§8.4), findings (§8.5),
// proposal calls. Pure functions over `State`; money is bigint (base units, 6 decimals) internally.
import type {
  Call, CouncilMember, District, DistrictDetail, EdgeSource, Finding, GraphEdge, GraphNode, GraphSnapshot, KeyKind,
  MemberId, Proposal, ProposedChange, SimResult, SimResultCore, SimTotals,
} from "../../types";
import type { ReasonCode } from "../../shared/reasonCodes";
import { fmtDisplay, money, percentOf, toBase } from "../format";

export const U = (n: number | bigint) => toBase(n);
export const MAIN_TREASURY = U(2_000_000);

export interface MPrincipal { id: string; label: string; kind: KeyKind; dailyCap: bigint | null; locked: boolean }
export interface MKey { id: string; address: string; principalId: string; kind: KeyKind; label: string; dailyCap: bigint; active: boolean; spent: bigint }
export interface DeclaredEdge { id: string; from: string; to: string; relation: "CONTROLS" | "ADMINS"; note: string }
export interface State {
  policyVersion: number;
  graphVersion: number;
  principals: Record<string, MPrincipal>;
  keys: Record<string, MKey>;
  declared: DeclaredEdge[];
  tokens: string[];
  recipients: string[];
  protocols: string[];
  vaultUsdc: bigint;
  vaultTkb: bigint;
  paused: boolean;
  members: CouncilMember[];
  proposals: Proposal[];
  resolved: Record<string, number>; // findingId -> proposalId
  requestsSeeded: boolean;
}

export function fakeHex(seed: string, len: number): string {
  let h = 2166136261 >>> 0;
  let out = "";
  let i = 0;
  while (out.length < len) {
    const s = `${seed}:${i++}`;
    for (let c = 0; c < s.length; c++) { h ^= s.charCodeAt(c); h = Math.imul(h, 16777619) >>> 0; }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
}
export const fakeAddress = (id: string) => "0x" + fakeHex("addr:" + id, 40);
export const fakeTxHash = (n: number | string) => "0x" + fakeHex("tx:" + n, 64);

const KEYS: [string, string, KeyKind, string, number][] = [
  ["key_minh", "minh", "HUMAN", "Thẻ của anh Minh", 20000],
  ["key_agent_data", "agent_data", "AGENT", "Trợ lý Dữ liệu", 20000],
  ["key_agent_intl_pay", "agent_intl_pay", "AGENT", "Trợ lý Thanh toán quốc tế", 20000],
  ["key_agent_rebalance", "agent_rebalance", "AGENT", "Trợ lý Cân đối", 20000],
  ["key_svc_payment", "svc_payment", "SERVICE", "Phần mềm thanh toán", 20000],
  ["key_huy_1", "huy", "HUMAN", "Thẻ 1 của anh Huy", 20000],
  ["key_huy_2", "huy", "HUMAN", "Thẻ 2 của anh Huy", 20000],
  ["key_lan", "lan", "HUMAN", "Thẻ của chị Lan", 10000],
];
const PRINCIPALS: [string, string, KeyKind][] = [
  ["minh", "Anh Minh", "HUMAN"], ["agent_data", "Trợ lý Dữ liệu", "AGENT"], ["agent_intl_pay", "Trợ lý Thanh toán quốc tế", "AGENT"],
  ["agent_rebalance", "Trợ lý Cân đối", "AGENT"], ["svc_payment", "Phần mềm thanh toán", "SERVICE"], ["huy", "Anh Huy", "HUMAN"], ["lan", "Chị Lan", "HUMAN"],
];

export function seedState(): State {
  const principals: State["principals"] = {};
  for (const [id, label, kind] of PRINCIPALS) principals[id] = { id, label, kind, dailyCap: null, locked: false };
  const keys: State["keys"] = {};
  for (const [id, principalId, kind, label, cap] of KEYS)
    keys[id] = { id, address: fakeAddress(id), principalId, kind, label, dailyCap: U(cap), active: true, spent: 0n };
  const decl = (to: string, relation: "CONTROLS" | "ADMINS", note: string): DeclaredEdge => ({
    id: `e:minh-${relation.toLowerCase()}-${to.replace("key_", "")}`, from: "minh", to, relation, note,
  });
  return {
    policyVersion: 1, graphVersion: 1, principals, keys,
    declared: [
      decl("key_agent_data", "CONTROLS", "Anh Minh tạo và giữ khoá trên máy anh"),
      decl("key_agent_intl_pay", "CONTROLS", "Anh Minh tạo và giữ khoá trên máy anh"),
      decl("key_agent_rebalance", "CONTROLS", "Anh Minh tạo và giữ khoá trên máy anh"),
      decl("key_svc_payment", "ADMINS", "Máy chủ do anh Minh quản trị"),
    ],
    tokens: ["tUSDC", "tTKB"],
    recipients: ["vendor_data_api", "vendor_cloud", "vendor_intl_design"],
    protocols: ["MockDEX"],
    vaultUsdc: U(200_000), vaultTkb: 0n, paused: false,
    members: [
      { id: "trang", label: "Chị Trang", address: fakeAddress("council_trang"), principalId: null },
      { id: "lan", label: "Chị Lan", address: fakeAddress("council_lan"), principalId: "lan" },
      { id: "huy", label: "Anh Huy", address: fakeAddress("council_huy"), principalId: "huy" },
    ],
    proposals: [], resolved: {}, requestsSeeded: false,
  };
}

// ---------- derived helpers ----------
export const keysOf = (s: State, pid: string) => Object.values(s.keys).filter((k) => k.principalId === pid);
export const spentOf = (s: State, pid: string) => keysOf(s, pid).reduce((a, k) => a + k.spent, 0n);
export const activePrincipals = (s: State) => Object.values(s.principals).filter((p) => keysOf(s, p.id).length > 0);
export const labelOf = (s: State, pid: string) => s.principals[pid]?.label ?? pid;

export function remainingOf(s: State, pid: string): bigint {
  const p = s.principals[pid];
  if (!p || p.locked) return 0n;
  if (p.dailyCap !== null && p.dailyCap > 0n) { const r = p.dailyCap - spentOf(s, pid); return r > 0n ? r : 0n; }
  return keysOf(s, pid).filter((k) => k.active).reduce((a, k) => a + (k.dailyCap > k.spent ? k.dailyCap - k.spent : 0n), 0n);
}
export const keyRemaining = (k: MKey) => (k.dailyCap > k.spent ? k.dailyCap - k.spent : 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

// ---------- simulateCompromise (§8.4) ----------
export function simulateCore(s: State, compromised: string[]): SimResultCore {
  const S0 = [...new Set(compromised)].filter((p) => s.principals[p]);
  const via = new Map<string, Set<EdgeSource>>();
  const addVia = (k: string, v: EdgeSource) => via.set(k, (via.get(k) ?? new Set()).add(v));
  const nodeIds = new Set<string>(); const edgeIds = new Set<string>();
  const Sx: string[] = [];
  for (const p of S0) {
    nodeIds.add(`p:${p}`);
    for (const k of keysOf(s, p)) { addVia(k.id, "onchain"); nodeIds.add(`k:${k.id}`); edgeIds.add(`e:${p}-holds-${k.id}`); }
  }
  for (const e of s.declared) {
    if (!S0.includes(e.from)) continue;
    const key = s.keys[e.to]; if (!key) continue;
    addVia(key.id, "declared"); nodeIds.add(`k:${key.id}`); edgeIds.add(e.id);
    if (!S0.includes(key.principalId)) {
      nodeIds.add(`p:${key.principalId}`); edgeIds.add(`e:${key.principalId}-holds-${key.id}`);
      if (!Sx.includes(key.principalId)) Sx.push(key.principalId);
    }
  }
  const vault = s.vaultUsdc;
  const sum = (ps: string[]) => ps.reduce((a, p) => a + remainingOf(s, p), 0n);
  const enforced = min(vault, sum(S0));
  const estimated = min(vault, sum([...S0, ...Sx]));
  const youThink = S0.reduce((a, p) => {
    const pr = s.principals[p];
    if (pr.dailyCap !== null && pr.dailyCap > 0n) return a + pr.dailyCap;
    return a + keysOf(s, p).filter((k) => k.kind === "HUMAN").reduce((x, k) => x + k.dailyCap, 0n);
  }, 0n);
  const totals: SimTotals = {
    youThink: money(youThink), enforced: money(enforced), estimated: money(estimated), vaultBalance: money(vault),
    percentOfMainTreasury: percentOf(estimated, MAIN_TREASURY),
  };
  const perDistrict = [...S0, ...Sx].map((p) => ({
    principalId: p,
    enforced: money(S0.includes(p) ? remainingOf(s, p) : 0n),
    estimated: money(remainingOf(s, p)),
    note: S0.includes(p)
      ? (s.principals[p].dailyCap ? "Có hạn mức chung, chặn trên chain" : "Chưa có cổng chung: cộng từng thẻ")
      : "Đi qua quan hệ tự khai, chưa kiểm chứng",
  }));
  return {
    reachedKeys: [...via].map(([key, v]) => ({ key, via: [...v] })),
    perDistrict, totals,
    highlights: { nodeIds: [...nodeIds], edgeIds: [...edgeIds] },
    findings: computeFindings(s).filter((f) => S0.includes(f.principalId)),
  };
}

export function simulate(s: State, compromised: string[], change?: ProposedChange): SimResult {
  if (!change) return simulateCore(s, compromised);
  const before = simulateCore(s, compromised);
  const clone = structuredClone(s);
  applyCalls(clone, changeToCalls(s, change));
  const after = simulateCore(clone, compromised);
  return { ...after, before, after };
}

// ---------- findings (§8.5) ----------
export function controlledKeys(s: State, pid: string): string[] {
  const ks = new Set(keysOf(s, pid).map((k) => k.id));
  for (const e of s.declared) if (e.from === pid && s.keys[e.to]) ks.add(e.to);
  return [...ks];
}
export function computeFindings(s: State, _includeResolved = false): Finding[] {
  const out: Finding[] = [];
  for (const p of activePrincipals(s)) {
    const ctrl = controlledKeys(s, p.id);
    const districts = new Set(ctrl.map((k) => s.keys[k].principalId));
    if (districts.size < 2) continue;
    const foreign = ctrl.filter((k) => s.keys[k].principalId !== p.id);
    const maxCap = ctrl.reduce((m, k) => (s.keys[k].dailyCap > m ? s.keys[k].dailyCap : m), 0n);
    const cap = ((maxCap * 3n) / 2n / U(1)) * U(1);
    const id = `F-R1-${p.id}`;
    out.push({
      id, ruleId: "R1_MULTI_KEY_NO_SHARED_CAP", severity: "HIGH", principalId: p.id,
      title: `${p.label} điều khiển ${ctrl.length} thẻ ở ${districts.size} khu khác nhau`,
      detail: `Mỗi thẻ có trần riêng nhưng không có trần chung. Nếu ${p.label} bị chiếm, mất tối đa ${fmtDisplay(ctrl.reduce((a, k) => a + s.keys[k].dailyCap, 0n))}/ngày.`,
      createdAt: new Date(0).toISOString(), resolvedByProposal: s.resolved[id] ?? null,
      suggestedChange: { kind: "consolidate", into: p.id, keys: foreign, sharedCapRaw: cap.toString() },
      data: { controlledKeys: ctrl.length, districts: districts.size },
    });
  }
  return out;
}

// ---------- proposals: change -> calls ----------
const keyLabel = (s: State, k: string) => s.keys[k]?.label ?? k;
export function changeToCalls(s: State, c: ProposedChange): Call[] {
  const R = "PrincipalRegistry" as const, V = "PolicyVault" as const;
  const bump: Call = { target: V, fn: "bumpPolicyVersion", args: {}, describe: "Ghi nhận phiên bản chính sách mới" };
  const capCall = (pid: string, raw: string): Call => {
    const old = s.principals[pid]?.dailyCap;
    const from = old ? `từ ${fmtDisplay(old)} ` : "";
    return { target: V, fn: "setPrincipalDailyCap", args: { id: pid, cap: raw },
      describe: `${old ? "Đổi" : "Đặt"} hạn mức chung khu ${pid} ${from}${old ? "lên " : "là "}${fmtDisplay(BigInt(raw))}/ngày` };
  };
  const move = (k: string, to: string): Call => ({ target: R, fn: "moveKey", args: { key: k, toId: to }, describe: `Chuyển thẻ ${keyLabel(s, k)} (${k}) về khu ${to}` });
  switch (c.kind) {
    case "consolidate": return [...c.keys.map((k) => move(k, c.into)), capCall(c.into, c.sharedCapRaw), bump];
    case "raise_cap": return [capCall(c.principalId, c.newCapRaw), bump];
    case "move_key": return [move(c.key, c.toPrincipal), bump];
    case "council_district":
      return [
        { target: R, fn: "createPrincipal", args: { id: c.id, label: "Khu do Hội đồng sở hữu" }, describe: `Tạo khu mới ${c.id} do Hội đồng sở hữu` },
        ...c.keys.map((k) => move(k, c.id)), capCall(c.id, c.capRaw), bump,
      ];
  }
}
export function applyCalls(s: State, calls: Call[]): void {
  for (const c of calls) {
    if (c.fn === "createPrincipal") s.principals[c.args.id] = { id: c.args.id, label: c.args.label, kind: "AGENT", dailyCap: null, locked: false };
    else if (c.fn === "moveKey") { if (s.keys[c.args.key]) s.keys[c.args.key].principalId = c.args.toId; }
    else if (c.fn === "setPrincipalDailyCap") { if (s.principals[c.args.id]) s.principals[c.args.id].dailyCap = BigInt(c.args.cap); }
    else if (c.fn === "bumpPolicyVersion") { s.policyVersion += 1; s.graphVersion += 1; }
  }
}
export function subjectOf(c: ProposedChange): string {
  switch (c.kind) {
    case "consolidate": return c.into;
    case "raise_cap": return c.principalId;
    case "move_key": return c.toPrincipal;
    case "council_district": return c.id;
  }
}
export function titleOf(s: State, c: ProposedChange): string {
  switch (c.kind) {
    case "consolidate": return `Gom ${c.keys.length + keysOf(s, c.into).length} thẻ về khu ${c.into}, hạn mức chung ${fmtDisplay(BigInt(c.sharedCapRaw))}/ngày`;
    case "raise_cap": return `Nâng hạn mức khu ${c.principalId} lên ${fmtDisplay(BigInt(c.newCapRaw))}/ngày`;
    case "move_key": return `Giao ${keyLabel(s, c.key)} cho khu ${c.toPrincipal}`;
    case "council_district": return `Lập khu do Hội đồng sở hữu, hạn mức ${fmtDisplay(BigInt(c.capRaw))}/ngày`;
  }
}

// ---------- rule engine for pay / swap (§4.3 order, §6.3) ----------
export interface Action { signer: string; kind: "pay" | "swap" | "approve"; token?: string; tokenOut?: string; to?: string; dex?: string; amount?: bigint }
export interface EvalResult { outcome: "ok" | "reverted" | "blocked_at_protocol"; reason: ReasonCode | null; principalId: string | null }

export function evaluate(s: State, a: Action): EvalResult {
  const key = s.keys[a.signer];
  if (!key) return { outcome: "reverted", reason: "KEY_NOT_REGISTERED", principalId: null };
  const pid = key.principalId;
  // Tx AllowList is checked by the node, before the tx enters a block (no tx hash).
  if (!key.active) return { outcome: "blocked_at_protocol", reason: "BLOCKED_AT_PROTOCOL", principalId: pid };
  const rev = (reason: ReasonCode): EvalResult => ({ outcome: "reverted", reason, principalId: pid });
  if (a.kind === "approve") return { outcome: "ok", reason: null, principalId: pid };
  if (s.paused) return rev("VAULT_PAUSED");
  if (s.principals[pid].locked) return rev("DISTRICT_LOCKED");
  if (a.token && !s.tokens.includes(a.token)) return rev("TOKEN_NOT_ALLOWED");
  if (a.kind === "swap" && a.tokenOut && !s.tokens.includes(a.tokenOut)) return rev("TOKEN_NOT_ALLOWED");
  if (a.kind === "swap" && !s.protocols.includes(a.dex ?? "")) return rev("PROTOCOL_NOT_ALLOWED");
  if (a.kind === "pay" && !s.recipients.includes(a.to ?? "")) return rev("RECIPIENT_NOT_ALLOWED");
  const amt = a.amount ?? 0n;
  if (key.spent + amt > key.dailyCap) return rev("CARD_DAILY_CAP");
  const cap = s.principals[pid].dailyCap;
  if (cap && cap > 0n && spentOf(s, pid) + amt > cap) return rev("DISTRICT_DAILY_CAP");
  return { outcome: "ok", reason: null, principalId: pid };
}
export function applySpend(s: State, a: Action): void {
  const amt = a.amount ?? 0n;
  if (a.kind === "approve") return;
  s.keys[a.signer].spent += amt;
  s.vaultUsdc -= amt;
  if (a.kind === "swap") s.vaultTkb += amt; // fixed 1:1 rate on MockDEX
}

// ---------- views ----------
export function buildDistricts(s: State): District[] {
  return activePrincipals(s).map((p) => ({
    principalId: p.id, label: p.label, kind: p.kind,
    dailyCap: p.dailyCap ? money(p.dailyCap) : null, spentToday: money(spentOf(s, p.id)), locked: p.locked,
    keys: keysOf(s, p.id).map((k) => k.id),
  }));
}
export function buildGraph(s: State, block: number): GraphSnapshot {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  nodes.push({ id: "treasury", type: "Treasury", label: "Quỹ chính (Safe 3/5)", data: { balance: money(MAIN_TREASURY) } });
  nodes.push({ id: "vault", type: "Vault", label: "Kho chi tiêu", data: { balance: money(s.vaultUsdc), paused: s.paused } });
  nodes.push({ id: "council", type: "Council", label: "Hội đồng 2/3", data: {} });
  edges.push({ id: "e:treasury-funds-vault", from: "treasury", to: "vault", type: "FUNDS", source: "onchain" });
  for (const m of s.members) {
    nodes.push({ id: `m:${m.id}`, type: "Member", label: m.label, data: { principalId: m.principalId ?? undefined, address: m.address } });
    edges.push({ id: `e:${m.id}-approves-council`, from: `m:${m.id}`, to: "council", type: "APPROVES", source: "onchain" });
  }
  for (const p of activePrincipals(s)) {
    nodes.push({ id: `p:${p.id}`, type: "Principal", label: p.label, data: {
      principalId: p.id, kind: p.kind, locked: p.locked, dailyCap: p.dailyCap ? money(p.dailyCap) : null, spentToday: money(spentOf(s, p.id)) } });
    for (const k of keysOf(s, p.id)) {
      nodes.push({ id: `k:${k.id}`, type: "Key", label: k.label, data: {
        principalId: p.id, kind: k.kind, address: k.address, active: k.active, locked: p.locked,
        keyDailyCap: money(k.dailyCap), keySpentToday: money(k.spent) } });
      edges.push({ id: `e:${p.id}-holds-${k.id}`, from: `p:${p.id}`, to: `k:${k.id}`, type: "HOLDS_KEY", source: "onchain" });
    }
  }
  for (const e of s.declared)
    edges.push({ id: e.id, from: `p:${e.from}`, to: `k:${e.to}`, type: e.relation, source: "declared", note: e.note });
  for (const r of s.recipients) nodes.push({ id: `r:${r}`, type: "Recipient", label: r, data: { address: fakeAddress(r) } });
  for (const pr of s.protocols) nodes.push({ id: `pr:${pr}`, type: "Protocol", label: `${pr}.swapExactIn`, data: {} });
  for (const t of s.tokens) nodes.push({ id: `t:${t}`, type: "Token", label: t, data: {} });
  for (const k of Object.values(s.keys)) {
    if (k.kind === "HUMAN") continue;
    for (const r of s.recipients) edges.push({ id: `e:${k.id}-pay-${r}`, from: `k:${k.id}`, to: `r:${r}`, type: "MAY_PAY", source: "onchain" });
  }
  if (s.keys.key_agent_rebalance) edges.push({ id: "e:key_agent_rebalance-call-MockDEX", from: "k:key_agent_rebalance", to: "pr:MockDEX", type: "MAY_CALL", source: "onchain" });
  return { version: s.graphVersion, policyVersion: s.policyVersion, block, nodes, edges, districts: buildDistricts(s) };
}
export function buildDistrictDetail(s: State, pid: string): DistrictDetail | null {
  const p = s.principals[pid]; if (!p) return null;
  const ks = keysOf(s, pid);
  return {
    principalId: pid, label: p.label, kind: p.kind, dailyCap: p.dailyCap ? money(p.dailyCap) : null,
    spentToday: money(spentOf(s, pid)), remaining: money(remainingOf(s, pid)), locked: p.locked,
    keys: ks.map((k) => ({ key: k.id, address: k.address, kind: k.kind, label: k.label, active: k.active, dailyCap: money(k.dailyCap), spentToday: money(k.spent) })),
    declared: s.declared.filter((e) => e.from === pid || ks.some((k) => k.id === e.to)).map((e) => ({ from: e.from, to: e.to, relation: e.relation, note: e.note })),
  };
}
export type { MemberId };
