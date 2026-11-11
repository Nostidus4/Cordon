// In-browser mock backend: same operations as the §8.6 API + a stream bus shaped like the live SSE.
import type {
  ActionResult, AgentRun, AgentRunInputs, AskRequest, AssistantAnswer, AssistantLog, AssistantToolCall, Attempt, ChainEvent, CityStates, CityBuildingId, CityBuildingState,
  CreateProposalRequest, DistrictDetail, DraftProposalRequest, Finding, GraphSnapshot, Health, LockRequest, MemberId, Org,
  PauseRequest, Proposal, ProposalDraft, ProposedChange, RiskReport, ScenarioRun, SimResult, SimulateRequest, StreamListener, StreamMessage,
} from "../../types";
import { keccak256 } from "js-sha3";
import { SCENE4_STEPS } from "../../shared/scenario4";
import { REASONS, type ReasonCode } from "../../shared/reasonCodes";
import { fmtDisplay, fmtPercent, money, percentOf } from "../format";
import { verifyAnswer } from "./assistantVerify";
import {
  MAIN_TREASURY, U, applyCalls, applySpend, buildDistrictDetail, buildDistricts, buildGraph, changeToCalls, computeFindings, evaluate,
  fakeHex, fakeTxHash, keyRemaining, keysOf, remainingOf, seedState, simulate, spentOf, subjectOf, titleOf, type Action, type State,
} from "./core";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export const mockConfig = { latencyMs: 140, stepDelayMs: 2600 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const lat = () => (mockConfig.latencyMs > 0 ? sleep(mockConfig.latencyMs) : Promise.resolve());

// ---------- world ----------
let S: State = seedState();
let events: ChainEvent[] = [];
let attempts: Attempt[] = [];
let runs: ScenarioRun[] = [];
let agentRuns: AgentRun[] = [];
let assistantLogs: AssistantLog[] = [];
let currentRunId: string | null = null;
let counter = 0;
let epoch = 0; // bumped on reset to cancel timers
let runActive = false;
let lastAgentBlocked = false;
const bootAt = Date.now();
const BLOCK_BASE = 1_284_310;
const nowIso = () => new Date().toISOString();
const currentBlock = () => BLOCK_BASE + Math.floor((Date.now() - bootAt) / 2000);
const nextId = (p: string) => `${p}-${++counter}`;

const listeners = new Set<StreamListener>();
export function subscribe(l: StreamListener): () => void { listeners.add(l); return () => listeners.delete(l); }
const emit = (m: StreamMessage) => listeners.forEach((l) => { try { l(m); } catch { /* ignore */ } });

let lastCityJson = "";
function emitCity(force = false) {
  const c = deriveCity();
  const j = JSON.stringify(c);
  if (force || j !== lastCityJson) { lastCityJson = j; emit({ type: "city_updated", data: c }); }
}
function graphUpdated() {
  emit({ type: "graph_updated", data: { version: S.graphVersion, policyVersion: S.policyVersion, block: currentBlock() } });
}
function pushEvent(name: string, payload: Record<string, unknown>, txHash?: string): ChainEvent {
  const e: ChainEvent = { id: nextId("ev"), chain: "l1", block: currentBlock(), txHash: txHash ?? fakeTxHash(`ev${counter}`), simulated: true, logIndex: 0, name, payload, ts: nowIso() };
  events.push(e); emit({ type: "event", data: e });
  return e;
}

// recorded run for Replay (spec §10.5): a clean earlier take of scene 4
const RECORDED_ID = "run-recorded-1";
function recordedAttempts(): Attempt[] {
  return SCENE4_STEPS.map((st) => ({
    id: `rec-${st.step}`, runId: RECORDED_ID, step: st.step, ts: `2026-11-10T07:${String(st.step).padStart(2, "0")}:00.000Z`, scenarioTime: st.time,
    signer: st.signer, signerLabel: signerLabel(st.signer), principalId: st.kind === "lock" ? "minh" : "minh",
    action: { kind: st.kind, label: st.label, token: st.token, to: st.to, dex: st.dex, amount: st.amount ? money(st.amount) : undefined },
    outcome: st.expect, reasonCode: st.reason ?? null,
    txHash: st.expect === "blocked_at_protocol" ? null : fakeTxHash(`rec${st.step}`), simulated: true,
    errorRaw: st.expect === "blocked_at_protocol" ? rpcError(st.signer) : st.reason ? `execution reverted: ${REASONS[st.reason].error}()` : null,
    keySpentAfter: null, principalSpentAfter: st.sharedAfter !== null ? money(U(st.sharedAfter)) : null,
  }));
}
const recordedRun = (): ScenarioRun => ({ id: RECORDED_ID, name: "Cảnh 4 · bản quay tốt (đã lưu)", startedAt: "2026-11-10T07:00:00.000Z", finishedAt: "2026-11-10T07:07:00.000Z", status: "recorded", attemptCount: 8 });
const rpcError = (signer: string) => `rpc error -32000: cannot send transaction: address ${S.keys[signer]?.address ?? signer} is not on the TxAllowList`;
function signerLabel(id: string): string {
  if (S.keys[id]) return S.keys[id].label;
  return S.members.find((m) => m.id === id)?.label ?? id;
}

// ---------- attempts ----------
function ensureRun(name = "Cảnh 4 · sự cố"): string {
  if (currentRunId) return currentRunId;
  const id = nextId("run");
  currentRunId = id;
  runs.push({ id, name, startedAt: nowIso(), finishedAt: null, status: "running", attemptCount: 0 });
  return id;
}
function recordAttempt(step: number, a: Action, label: string, scenarioTime: string): Attempt {
  const runId = ensureRun();
  const res = evaluate(S, a);
  if (res.outcome === "ok") applySpend(S, a);
  const pid = res.principalId;
  const reverted = res.outcome === "reverted";
  const at: Attempt = {
    id: nextId("at"), runId, step, ts: nowIso(), scenarioTime, signer: a.signer, signerLabel: signerLabel(a.signer), principalId: pid,
    action: { kind: a.kind, label, token: a.token, to: a.to, dex: a.dex, amount: a.amount ? money(a.amount) : undefined },
    outcome: res.outcome, reasonCode: res.reason,
    txHash: res.outcome === "blocked_at_protocol" ? null : fakeTxHash(`at${counter}`), simulated: true,
    errorRaw: res.outcome === "blocked_at_protocol" ? rpcError(a.signer) : reverted && res.reason ? `execution reverted: ${REASONS[res.reason].error}()` : null,
    keySpentAfter: S.keys[a.signer] ? money(S.keys[a.signer].spent) : null,
    principalSpentAfter: pid && a.kind !== "approve" ? money(spentOf(S, pid)) : null,
  };
  attempts.push(at);
  const run = runs.find((r) => r.id === runId); if (run) run.attemptCount++;
  if (res.outcome === "ok" && a.kind !== "approve") {
    pushEvent(a.kind === "pay" ? "Paid" : "Swapped", {
      key: a.signer, principalId: pid, token: a.token, to: a.to, dex: a.dex, amount: money(a.amount ?? 0n),
      keySpentAfter: at.keySpentAfter, principalSpentAfter: at.principalSpentAfter,
    }, at.txHash!);
  }
  emit({ type: "attempt", data: at });
  emitCity();
  return at;
}

// ---------- agent (§7.1) ----------
function agentRunOnceSync(): AgentRun {
  const total = S.vaultUsdc + S.vaultTkb;
  const share = total === 0n ? 0 : Number((S.vaultTkb * 1000n) / total) / 10;
  const target = 20, threshold = 5;
  const id = nextId("ar");
  let run: AgentRun;
  const agentKey = S.keys.key_agent_rebalance;
  const shortfallNow = (total * BigInt(target)) / 100n - S.vaultTkb;
  const inputs: AgentRunInputs = {
    vaultUsdc: money(S.vaultUsdc), vaultTkb: money(S.vaultTkb), driftThreshold: threshold, shortfall: money(shortfallNow > 0n ? shortfallNow : 0n), maxPerRun: money(U(5000)),
    keyRemaining: money(agentKey ? keyRemaining(agentKey) : 0n), districtRemaining: money(agentKey ? remainingOf(S, agentKey.principalId) : 0n),
  };
  if (share >= target - threshold) {
    run = { id, decision: { action: "none", tokenIn: "tUSDC", tokenOut: "tTKB", amountIn: null, tTKBShareBefore: share, targetShare: target },
      reasonText: `Tỉ trọng tTKB ${fmtPercent(share)} đã gần mục tiêu ${target}%, không cần đổi thêm.`, reasonSource: "template", reasonHash: null,
      txHash: null, simulated: true, outcome: "noop", reasonCode: null, createdAt: nowIso(), inputs };
    lastAgentBlocked = false;
  } else {
    const shortfall = (total * BigInt(target)) / 100n - S.vaultTkb;
    const amount = shortfall < U(5000) ? shortfall : U(5000);
    const a: Action = { signer: "key_agent_rebalance", kind: "swap", token: "tUSDC", tokenOut: "tTKB", dex: "MockDEX", amount };
    const res = evaluate(S, a);
    const reasonText = res.outcome === "ok"
      ? `Tỉ trọng tTKB đang ${fmtPercent(share)} thấp hơn mục tiêu ${target}%, nên đổi ${fmtDisplay(amount)} tUSDC sang tTKB.`
      : `Lệnh đổi ${fmtDisplay(amount)} tUSDC bị chặn: ${REASONS[res.reason!].vi}. Trợ lý không gửi giao dịch.`;
    let txHash: string | null = null;
    if (res.outcome === "ok") {
      const hasStep0 = attempts.some((x) => x.runId === currentRunId && x.step === 0);
      if (!hasStep0) { const at = recordAttempt(0, a, SCENE4_STEPS[0].label.replace("5.000", fmtDisplay(amount)), "09:00"); txHash = at.txHash; }
      else { applySpend(S, a); txHash = fakeTxHash(`ag${counter}`); pushEvent("Swapped", { key: a.signer, principalId: res.principalId, amount: money(amount), principalSpentAfter: money(spentOf(S, res.principalId!)) }, txHash); }
    }
    lastAgentBlocked = res.outcome !== "ok";
    run = { id, decision: { action: "swap", tokenIn: "tUSDC", tokenOut: "tTKB", amountIn: money(amount), tTKBShareBefore: share, targetShare: target },
      reasonText, reasonSource: "template", reasonHash: res.outcome === "ok" ? "0x" + fakeHex(reasonText, 64) : null, txHash, simulated: true,
      outcome: res.outcome === "ok" ? "ok" : "blocked", reasonCode: res.reason, createdAt: nowIso(), inputs };
  }
  agentRuns.push(run);
  emit({ type: "agent_run", data: run });
  emitCity();
  return run;
}

// ---------- proposals ----------
/** Canonical JSON: sorted keys, no spaces, generatedAt excluded. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => k !== "generatedAt").sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
/** keccak256 (spec §6.5) of the canonical riskReport. */
export function hashRiskReport(r: RiskReport): string { return `0x${keccak256(canonicalJson(r))}`; }
function buildDraft(change: ProposedChange): ProposalDraft {
  const subject = subjectOf(change);
  const calls = changeToCalls(S, change);
  const clone = structuredClone(S); applyCalls(clone, calls);
  const sim = (st: State) => simulate(st, [subject]);
  const conflicted = S.members.filter((m) => m.principalId && m.principalId === subject).map((m) => m.id as MemberId);
  const before = sim(S), after = sim(clone);
  const warnings: ProposalDraft["warnings"] = [];
  const findingsAfter: Finding[] = computeFindings(clone).filter((f) => f.principalId === subject || f.ruleId !== "R4_COUNCIL_CONCENTRATION");
  if (conflicted.length) {
    const m = S.members.find((x) => x.id === conflicted[0])!;
    warnings.push({ code: "CONFLICT_OF_INTEREST", text: `${m.label} đang ngồi Hội đồng và là chủ khu nhận thêm quyền, không được duyệt đề xuất này.` });
    warnings.push({ code: "CONCENTRATION", text: `Khu ${subject} sẽ lên ${after.totals.enforced.display}/ngày (từ ${before.totals.enforced.display}) kèm một phiếu duyệt. Nên lập khu do Hội đồng sở hữu.` });
    findingsAfter.push({ id: `F-R4-${subject}`, ruleId: "R4_COUNCIL_CONCENTRATION", severity: "HIGH", principalId: subject,
      title: `${m.label} vừa giữ phiếu duyệt vừa nhận thêm quyền`, detail: "Dồn quyền chi tiêu và quyền duyệt vào cùng một người.", createdAt: nowIso(), resolvedByProposal: null });
  }
  const declaredTouch = S.declared.some((e) => subject === e.from);
  if (declaredTouch) warnings.push({ code: "DATA_DECLARED", text: "Một phần ước tính dựa trên quan hệ tự khai, chưa kiểm chứng." });
  const riskReport: RiskReport = { before: before.totals, after: after.totals, findingsBefore: computeFindings(S), findingsAfter, conflictOfInterest: conflicted.length > 0, generatedAt: nowIso(), graphVersion: S.graphVersion };
  return {
    title: titleOf(S, change), subjectPrincipal: subject, change, calls, describe: calls.map((c) => c.describe),
    riskReport, riskReportHash: hashRiskReport(riskReport),
    conflictedMembers: conflicted, warnings,
  };
}
function resolveChange(req: DraftProposalRequest): ProposedChange {
  if (req.change) return req.change;
  if (req.findingId) {
    const f = computeFindings(S, true).find((x) => x.id === req.findingId);
    if (!f?.suggestedChange) throw new ApiError("FINDING_NOT_FOUND", "Không tìm thấy finding hoặc không có đề xuất tự sinh", 404);
    return f.suggestedChange;
  }
  throw new ApiError("BAD_REQUEST", "Cần findingId hoặc change");
}
function nextProposalId(): number { let n = 11; while (S.proposals.some((p) => p.id === n) || (n === 12 || n === 13)) n++; return n; }
function addProposal(change: ProposedChange, proposer: MemberId, id?: number): Proposal {
  const existing = S.proposals.find((p) => p.status === "open" && JSON.stringify(p.change) === JSON.stringify(change));
  if (existing) return existing;
  const d = buildDraft(change);
  const p: Proposal = { ...d, id: id ?? nextProposalId(), proposer, approvals: [], threshold: 2, status: "open", createdAt: nowIso(), executedAt: null, resultingPolicyVersion: null };
  S.proposals.push(p);
  pushEvent("Proposed", { proposalId: p.id, proposer, title: p.title, subjectPrincipal: p.subjectPrincipal });
  emit({ type: "proposal_updated", data: { proposalId: p.id, status: p.status, approvals: 0 } });
  emitCity();
  return p;
}
function seedRequests() {
  S.requestsSeeded = true;
  const minhCap = S.principals.minh.dailyCap ?? U(30000);
  addProposal({ kind: "raise_cap", principalId: "minh", newCapRaw: U(130000).toString() }, "trang", 12);
  addProposal({ kind: "move_key", key: "key_agent_rebalance", toPrincipal: "huy" }, "trang", 13);
  void minhCap;
}
function executeProposal(p: Proposal) {
  const calls = p.calls;
  const firstConsolidate = p.change.kind === "consolidate";
  applyCalls(S, calls);
  p.status = "executed"; p.executedAt = nowIso(); p.resultingPolicyVersion = S.policyVersion;
  for (const c of calls) {
    if (c.fn === "moveKey") pushEvent("KeyMoved", { key: c.args.key, toId: c.args.toId });
    if (c.fn === "setPrincipalDailyCap") pushEvent("CapChanged", { kind: "principal", subject: c.args.id, newCap: money(BigInt(c.args.cap)) });
    if (c.fn === "createPrincipal") pushEvent("PrincipalCreated", { id: c.args.id });
  }
  pushEvent("PolicyVersionBumped", { version: S.policyVersion });
  pushEvent("Executed", { proposalId: p.id });
  emit({ type: "proposal_updated", data: { proposalId: p.id, status: p.status, approvals: p.approvals.length } });
  graphUpdated();
  if (firstConsolidate && !S.requestsSeeded) seedRequests();
}
function approve(id: number, member: MemberId): Proposal {
  const p = S.proposals.find((x) => x.id === id);
  if (!p) throw new ApiError("PROPOSAL_NOT_FOUND", `Không có đề xuất #${id}`, 404);
  if (p.status !== "open") throw new ApiError("PROPOSAL_NOT_OPEN", "Đề xuất đã đóng");
  if (!S.members.some((m) => m.id === member)) throw new ApiError("NOT_COUNCIL_MEMBER", "Không thuộc Hội đồng", 403);
  const fresh = buildDraft(p.change);
  if (fresh.conflictedMembers.includes(member))
    throw new ApiError("CONFLICT_OF_INTEREST", `Xung đột lợi ích: ${S.members.find((m) => m.id === member)!.label} là chủ khu bị ảnh hưởng, không được duyệt.`, 403);
  if (p.approvals.some((a) => a.member === member)) throw new ApiError("ALREADY_APPROVED", "Đã duyệt rồi");
  p.approvals.push({ member, at: nowIso() });
  pushEvent("Approved", { proposalId: id, member });
  if (p.approvals.length >= p.threshold) executeProposal(p);
  else emit({ type: "proposal_updated", data: { proposalId: p.id, status: p.status, approvals: p.approvals.length } });
  emitCity();
  return liveProposal(p);
}
/** Spec §6.5: calls, riskReport and riskReportHash are recorded at `propose` and stay FROZEN (the hash is on-chain); only status/approvals are live. */
function liveProposal(p: Proposal): Proposal { return structuredClone(p); }

// ---------- city ----------
const RANK: Record<CityBuildingState, number> = { normal: 0, recovery: 1, warning: 2, incident: 3 };
export function deriveCity(): CityStates {
  const openProps = S.proposals.filter((p) => p.status === "open");
  const r1 = computeFindings(S);
  const blocked = attempts.filter((a) => a.runId === currentRunId && a.outcome !== "ok");
  const lastBlocked = blocked[blocked.length - 1];
  const locked = Object.values(S.principals).filter((p) => p.locked);
  const nearCap = activeNear();
  const c = {} as CityStates;
  c.B01 = openProps.length ? { state: "warning", reasonVi: `${openProps.length} đề xuất đang chờ Hội đồng duyệt`, evidence: { kind: "proposal", ref: String(openProps[0].id) } }
    : { state: "normal", reasonVi: "Hội đồng không có đề xuất nào chờ duyệt" };
  c.B02 = { state: "normal", reasonVi: "Quỹ chính và kho chi tiêu cân đối" };
  c.B03 = S.paused ? { state: "incident", reasonVi: "Cả kho đang dừng (pauseAll)", evidence: { kind: "event", ref: "Paused" } }
    : nearCap ? { state: "warning", reasonVi: `Khu ${nearCap.id} đã dùng ${fmtPercent(nearCap.pct)} hạn mức chung hôm nay`, evidence: { kind: "event", ref: nearCap.id } }
    : { state: "normal", reasonVi: "Hạn mức các khu còn rộng" };
  c.B04 = lastBlocked ? { state: "incident", reasonVi: `${blocked.length} lần thử bị chặn${lastBlocked.reasonCode ? ": " + REASONS[lastBlocked.reasonCode].vi : ""}`, evidence: { kind: "attempt", ref: lastBlocked.id, txHash: lastBlocked.txHash, simulated: lastBlocked.simulated } }
    : { state: "normal", reasonVi: "Chưa có lần thử nào bị chặn" };
  c.B05 = locked.length ? { state: "recovery", reasonVi: `Khu ${locked.map((l) => l.id).join(", ")} đã bị khoá, các thẻ bị gạch khỏi chain`, evidence: { kind: "event", ref: "PrincipalLocked" } }
    : { state: "normal", reasonVi: "Không có khu nào bị khoá" };
  const lastAgent = agentRuns[agentRuns.length - 1];
  c.B06 = lastAgentBlocked ? { state: "warning", reasonVi: `Trợ lý Cân đối bị chặn: ${lastAgent?.reasonCode ? REASONS[lastAgent.reasonCode].vi : ""}`, evidence: { kind: "agent_run", ref: lastAgent.id } }
    : { state: "normal", reasonVi: lastAgent?.outcome === "ok" ? "Trợ lý Cân đối vừa đổi tiền thành công trong rào chắn" : "Trợ lý Cân đối sẵn sàng", evidence: lastAgent ? { kind: "agent_run", ref: lastAgent.id, txHash: lastAgent.txHash, simulated: true } : undefined };
  c.B07 = r1.length ? { state: "warning", reasonVi: `${r1[0].title}`, evidence: { kind: "finding", ref: r1[0].id } } : { state: "normal", reasonVi: "Không có phát hiện rủi ro đang mở" };
  const worst = (Object.values(c) as { state: CityBuildingState }[]).reduce<CityBuildingState>((w, x) => (RANK[x.state] > RANK[w] ? x.state : w), "normal");
  c.B08 = { state: worst, reasonVi: worst === "normal" ? "Toàn thành phố bình thường" : worst === "incident" ? "Có sự cố đang xử lý" : worst === "warning" ? "Có cảnh báo cần xem" : "Đang khôi phục sau khoá khu" };
  return c;
}
function activeNear(): { id: string; pct: number } | null {
  for (const p of Object.values(S.principals)) {
    if (p.dailyCap && p.dailyCap > 0n) { const pct = percentOf(spentOf(S, p.id), p.dailyCap); if (pct >= 80) return { id: p.id, pct }; }
  }
  return null;
}

// ---------- assistant (§9.5) ----------
function answerFor(req: AskRequest): AssistantAnswer {
  const q = req.question.trim();
  const v2 = computeFindings(S).length === 0;
  if (q === "Nếu anh Huy cũng bị chiếm thì sao?") {
    const sim = simulate(S, ["minh", "huy"]);
    const est = sim.totals.estimated.display, pct = fmtPercent(sim.totals.percentOfMainTreasury);
    return {
      answer: `Hai khu cộng lại ${est}/ngày, khoảng ${pct} quỹ chính. ${v2 ? "Khu anh Minh đã có cổng chung nên không bị cộng dồn." : "Lý do lớn nhất: khu anh Minh chưa có cổng chung."}`,
      numbers: [
        { label: "Ước tính hai khu", value: est, source: "simulate", path: "totals.estimated.display" },
        { label: "Tỉ lệ quỹ chính", value: pct, source: "simulate", path: "totals.percentOfMainTreasury" },
      ],
      highlight: sim.highlights,
      warnings: sim.totals.estimated.raw !== sim.totals.enforced.raw ? [{ code: "DATA_DECLARED", text: "Phần ước tính gồm quan hệ tự khai, chưa kiểm chứng." }] : undefined,
    };
  }
  if (q === "Vì sao khu anh Minh có cờ vàng?") {
    const sim = simulate(S, ["minh"]);
    if (v2) return { answer: `Khu anh Minh hiện không còn cờ vàng: ${keysOf(S, "minh").length} thẻ dùng chung trần ${S.principals.minh.dailyCap ? fmtDisplay(S.principals.minh.dailyCap) : "?"}/ngày.`,
      numbers: [
        { label: "Số thẻ trong khu", value: String(keysOf(S, "minh").length), source: "district", path: "keys.length" },
        ...(S.principals.minh.dailyCap ? [{ label: "Trần chung khu", value: fmtDisplay(S.principals.minh.dailyCap), source: "district" as const, path: "dailyCap.display" }] : []),
      ], highlight: sim.highlights };
    return {
      answer: `Anh Minh điều khiển ${sim.reachedKeys.length} thẻ: thẻ của anh, các trợ lý AI và phần mềm thanh toán. Mỗi thẻ có trần riêng ${fmtDisplay(S.keys.key_minh.dailyCap)} nhưng không có trần chung.`,
      numbers: [
        { label: "Số thẻ điều khiển", value: String(sim.reachedKeys.length), source: "simulate", path: "reachedKeys.length" },
        { label: "Trần riêng mỗi thẻ", value: fmtDisplay(S.keys.key_minh.dailyCap), source: "district", path: "keys[0].dailyCap.display" },
      ],
      highlight: sim.highlights,
      warnings: [{ code: "DATA_DECLARED", text: "Quan hệ điều khiển là tự khai, chưa kiểm chứng." }],
    };
  }
  if (q === "Sửa thế nào?") {
    const f = computeFindings(S)[0];
    if (!f?.suggestedChange) return { answer: "Hiện không có phát hiện rủi ro nào đang mở để sửa.", numbers: [], highlight: { nodeIds: [], edgeIds: [] } };
    const d = buildDraft(f.suggestedChange);
    return {
      answer: `Gom các thẻ về một khu và đặt trần chung ${fmtDisplay(BigInt((f.suggestedChange as { sharedCapRaw: string }).sharedCapRaw))}/ngày. Mức mất tối đa mỗi ngày giảm từ ${d.riskReport.before.estimated.display} xuống ${d.riskReport.after.estimated.display}.`,
      numbers: [
        { label: "Ước tính trước", value: d.riskReport.before.estimated.display, source: "proposal", path: "riskReport.before.estimated.display" },
        { label: "Ước tính sau", value: d.riskReport.after.estimated.display, source: "proposal", path: "riskReport.after.estimated.display" },
        { label: "Trần chung đề xuất", value: fmtDisplay(BigInt((f.suggestedChange as { sharedCapRaw: string }).sharedCapRaw)), source: "proposal", path: "calls[setPrincipalDailyCap].cap" },
      ],
      highlight: simulate(S, [f.principalId]).highlights,
      suggestions: [{ title: d.title, change: f.suggestedChange }],
    };
  }
  if (q === "Có nên giao trợ lý Cân đối cho anh Huy?") {
    const d = buildDraft({ kind: "move_key", key: "key_agent_rebalance", toPrincipal: "huy" });
    const b = d.riskReport.before.enforced.display, a = d.riskReport.after.enforced.display;
    return {
      answer: `Không nên. Anh Huy đang ngồi Hội đồng; khu anh sẽ lên ${a}/ngày (từ ${b}) kèm một phiếu duyệt. Nên lập khu do Hội đồng sở hữu, hạn mức ${fmtDisplay(U(100000))}/ngày, chỉ sàn đã duyệt.`,
      numbers: [
        { label: "Khu anh Huy trước", value: b, source: "proposal", path: "riskReport.before.enforced.display" },
        { label: "Khu anh Huy sau", value: a, source: "proposal", path: "riskReport.after.enforced.display" },
        { label: "Hạn mức khu Hội đồng", value: fmtDisplay(U(100000)), source: "proposal", path: "suggestions[0].change.capRaw" },
      ],
      highlight: { nodeIds: ["p:huy", "k:key_agent_rebalance", "m:huy"], edgeIds: [] },
      warnings: d.warnings.filter((w) => w.code !== "DATA_DECLARED"),
      suggestions: [{ title: "Lập khu do Hội đồng sở hữu, hạn mức 100.000/ngày", change: { kind: "council_district", id: "council_ops", keys: ["key_agent_rebalance"], capRaw: U(100000).toString() } }],
    };
  }
  return { answer: "Mình chỉ trả lời 4 câu hỏi có sẵn ở bản demo này. Hãy bấm một trong các nút câu hỏi.", numbers: [], highlight: { nodeIds: [], edgeIds: [] } };
}

/** The read-only tools the assistant would call for each fixed question (spec §9.2), with their results, to check numbers (§9.4). */
function assistantTools(q: string, answer: AssistantAnswer): { toolCalls: AssistantToolCall[]; roots: Partial<Record<"simulate" | "district" | "proposal" | "graph", unknown>> } {
  const call = (tool: AssistantToolCall["tool"], args: Record<string, unknown>, resultSummary: string): AssistantToolCall => ({ tool, args, resultSummary });
  const sim = (ids: string[]) => simulate(S, ids);
  const simSummary = (r: SimResult) => `enforced ${r.totals.enforced.display} · estimated ${r.totals.estimated.display} · ${r.reachedKeys.length} thẻ`;
  if (q === "Nếu anh Huy cũng bị chiếm thì sao?") { const r = sim(["minh", "huy"]); return { toolCalls: [call("simulate_compromise", { principals: ["minh", "huy"] }, simSummary(r))], roots: { simulate: r } }; }
  if (q === "Vì sao khu anh Minh có cờ vàng?") {
    const r = sim(["minh"]), d = buildDistrictDetail(S, "minh");
    return { toolCalls: [call("simulate_compromise", { principals: ["minh"] }, simSummary(r)), call("get_district", { principalId: "minh" }, `${d?.keys.length ?? 0} thẻ · cap ${d?.dailyCap?.display ?? "không có"}`)], roots: { simulate: r, district: d } };
  }
  if (q === "Sửa thế nào?") {
    const f = computeFindings(S)[0];
    if (!f?.suggestedChange) return { toolCalls: [call("list_findings", {}, "0 phát hiện đang mở")], roots: {} };
    const d = buildDraft(f.suggestedChange);
    return { toolCalls: [call("list_findings", {}, `${computeFindings(S).length} phát hiện · ${f.ruleId}`), call("simulate_compromise", { principals: [f.principalId], change: f.suggestedChange }, `trước ${d.riskReport.before.estimated.display} → sau ${d.riskReport.after.estimated.display}`)], roots: { proposal: { ...d, suggestions: answer.suggestions } } };
  }
  if (q === "Có nên giao trợ lý Cân đối cho anh Huy?") {
    const d = buildDraft({ kind: "move_key", key: "key_agent_rebalance", toPrincipal: "huy" });
    return { toolCalls: [call("get_proposal", { id: 13 }, `conflictedMembers ${d.conflictedMembers.join(",") || "không"} · sau ${d.riskReport.after.enforced.display}`)], roots: { proposal: { ...d, suggestions: answer.suggestions } } };
  }
  return { toolCalls: [], roots: {} };
}
function logAssistant(question: string, answer: AssistantAnswer): void {
  const { toolCalls, roots } = assistantTools(question.trim(), answer);
  const v = verifyAnswer(answer, roots);
  assistantLogs.push({ id: nextId("al"), question, toolCalls, answer: structuredClone(answer), checks: v.checks, uncovered: v.uncovered, numbersVerified: v.verified, createdAt: nowIso() });
}

// ---------- scenario 4 runner ----------
async function runScene4(): Promise<ScenarioRun> {
  if (runActive) throw new ApiError("RUN_IN_PROGRESS", "Kịch bản đang chạy", 409);
  const my = epoch;
  runActive = true;
  const runId = ensureRun();
  const run = runs.find((r) => r.id === runId)!;
  void (async () => {
    try {
      const steps = SCENE4_STEPS.filter((s) => s.step >= 1 && s.step <= 5);
      if (!attempts.some((a) => a.runId === runId && a.step === 0) && spentOf(S, "minh") === 0n) {
        agentRunOnceSync();
        await sleep(mockConfig.stepDelayMs); if (my !== epoch) return;
      }
      for (const st of steps) {
        await sleep(mockConfig.stepDelayMs); if (my !== epoch) return;
        recordAttempt(st.step, { signer: st.signer, kind: st.kind as "pay" | "swap", token: st.token, tokenOut: st.tokenOut, to: st.to, dex: st.dex, amount: st.amount }, st.label, st.time);
      }
      run.status = "completed"; run.finishedAt = nowIso();
    } finally { if (my === epoch) runActive = false; }
  })();
  return structuredClone(run);
}

// ---------- API surface ----------
const memberOf = (id: MemberId) => { if (!S.members.some((m) => m.id === id)) throw new ApiError("NOT_COUNCIL_MEMBER", "Không thuộc Hội đồng", 403); };
const ok = (txHash: string | null): ActionResult => ({ ok: true, txHash, simulated: true, policyVersion: S.policyVersion });

export const mockApi = {
  async getHealth(): Promise<Health> {
    await lat();
    const lastAgent = agentRuns[agentRuns.length - 1];
    return { ok: true, l1: { block: currentBlock(), latestBlockAt: nowIso() }, cchain: { block: 41_902_118 + Math.floor((Date.now() - bootAt) / 2000) }, indexerLagMs: 400,
      agent: { status: "idle", lastRunAt: lastAgent?.createdAt ?? null }, demoMode: true, chainMode: "sim", policyVersion: S.policyVersion, uptimeSec: Math.floor((Date.now() - bootAt) / 1000) };
  },
  async getOrg(): Promise<Org> {
    await lat();
    return { company: { name: "Mây Labs (giả định)", fictional: true }, mainTreasury: { label: "Safe 3/5 · Fuji C-Chain", balance: money(MAIN_TREASURY), token: "tUSDC" },
      vault: { label: "PolicyVault · Guardian L1", usdc: money(S.vaultUsdc), tkb: money(S.vaultTkb) }, council: { members: structuredClone(S.members), threshold: 2 } };
  },
  async getGraph(): Promise<GraphSnapshot> { await lat(); return buildGraph(S, currentBlock()); },
  async simulate(req: SimulateRequest): Promise<SimResult> { await lat(); return simulate(S, req.compromised, req.change); },
  async getFindings(): Promise<Finding[]> { await lat(); return computeFindings(S); },
  async getDistrict(id: string): Promise<DistrictDetail> {
    await lat(); const d = buildDistrictDetail(S, id);
    if (!d) throw new ApiError("DISTRICT_NOT_FOUND", `Không có khu ${id}`, 404);
    return d;
  },
  async getEvents(since?: string): Promise<ChainEvent[]> {
    await lat(); if (!since) return [...events];
    const i = events.findIndex((e) => e.id === since); return i < 0 ? [...events] : events.slice(i + 1);
  },
  async getAttempts(run?: string): Promise<Attempt[]> {
    await lat();
    if (run === RECORDED_ID) return recordedAttempts();
    return attempts.filter((a) => (run ? a.runId === run : a.runId === currentRunId));
  },
  async draftProposal(req: DraftProposalRequest): Promise<ProposalDraft> { await lat(); return buildDraft(resolveChange(req)); },
  async createProposal(req: CreateProposalRequest): Promise<Proposal> { await lat(); memberOf(req.proposer); return liveProposal(addProposal(resolveChange(req), req.proposer)); },
  async approveProposal(id: number, member: MemberId): Promise<Proposal> { await lat(); return approve(id, member); },
  async getProposals(): Promise<Proposal[]> { await lat(); return S.proposals.map(liveProposal).sort((a, b) => b.id - a.id); },
  async lockDistrict(req: LockRequest): Promise<ActionResult> {
    await lat(); memberOf(req.member);
    const p = S.principals[req.principalId];
    if (!p) throw new ApiError("DISTRICT_NOT_FOUND", `Không có khu ${req.principalId}`, 404);
    if (p.locked) throw new ApiError("ALREADY_LOCKED", "Khu đã bị khoá", 409);
    p.locked = true; for (const k of keysOf(S, p.id)) k.active = false;
    S.graphVersion++;
    const tx = fakeTxHash(`lock${++counter}`);
    pushEvent("EmergencyAction", { member: req.member, action: "lockPrincipal", subject: p.id }, tx);
    pushEvent("PrincipalLocked", { principalId: p.id, by: req.member, keysRemoved: keysOf(S, p.id).map((k) => k.id) }, tx);
    if (currentRunId) {
      const at: Attempt = { id: nextId("at"), runId: currentRunId, step: 6, ts: nowIso(), scenarioTime: "14:04", signer: req.member, signerLabel: signerLabel(req.member), principalId: p.id,
        action: { kind: "lock", label: `${signerLabel(req.member)} khoá khu ${p.id}: ${keysOf(S, p.id).length} thẻ bị gạch khỏi chain` }, outcome: "ok", reasonCode: null, txHash: tx, simulated: true, errorRaw: null, keySpentAfter: null, principalSpentAfter: null };
      attempts.push(at); const run = runs.find((r) => r.id === currentRunId); if (run) run.attemptCount++;
      emit({ type: "attempt", data: at });
    }
    graphUpdated(); emitCity();
    return ok(tx);
  },
  async pauseAll(req: PauseRequest): Promise<ActionResult> {
    await lat(); memberOf(req.member);
    if (S.paused) throw new ApiError("ALREADY_PAUSED", "Kho đã dừng", 409);
    S.paused = true; const tx = fakeTxHash(`pause${++counter}`);
    pushEvent("EmergencyAction", { member: req.member, action: "pauseAll" }, tx); pushEvent("Paused", { by: req.member }, tx);
    graphUpdated(); emitCity(); return ok(tx);
  },
  async askAssistant(req: AskRequest): Promise<AssistantAnswer> { await sleep(mockConfig.latencyMs > 0 ? 600 : 0); const a = answerFor(req); logAssistant(req.question, a); return a; },
  async runAgentOnce(): Promise<AgentRun> { await lat(); return agentRunOnceSync(); },
  async runScene4(): Promise<ScenarioRun> { await lat(); return runScene4(); },
  async runScene4Step7(): Promise<Attempt> {
    await lat();
    ensureRun();
    const st = SCENE4_STEPS[7];
    return recordAttempt(7, { signer: st.signer, kind: "approve", token: st.token }, st.label, st.time);
  },
  async applyPolicyV2(): Promise<ActionResult> {
    await lat();
    const f = computeFindings(S)[0];
    if (!f?.suggestedChange) return ok(null);
    const p = addProposal(f.suggestedChange, "trang");
    for (const m of ["lan", "trang"] as MemberId[]) if (p.status === "open") approve(p.id, m);
    return ok(null);
  },
  async getCityStates(): Promise<CityStates> { await lat(); return deriveCity(); },
  async getAgentRuns(): Promise<AgentRun[]> { await lat(); return structuredClone(agentRuns); },
  async getAssistantLogs(): Promise<AssistantLog[]> { await lat(); return structuredClone(assistantLogs); },
  async getScenarioRuns(): Promise<ScenarioRun[]> { await lat(); return [recordedRun(), ...runs.map((r) => ({ ...r }))]; },
  async resetDemo(): Promise<ActionResult> {
    await lat();
    epoch++; runActive = false; S = seedState(); events = []; attempts = []; runs = []; agentRuns = []; assistantLogs = []; currentRunId = null; lastAgentBlocked = false; lastCityJson = "";
    emit({ type: "reset", data: { at: nowIso() } }); graphUpdated(); emitCity(true);
    return ok(null);
  },
  subscribe,
};
export type MockApi = typeof mockApi;
export const _debug = { state: () => S, remaining: remainingOf, keyRemaining, buildDistricts };
