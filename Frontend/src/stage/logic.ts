// Pure logic of the scene stage: routing between scenes, spread -> city props + counter, incident numbers, popover text.
// Nothing here touches React, timers or the network, so it is unit-tested directly (logic.test.ts).
import { buildSpreadPlan, counterAt, spreadOrder, type SpreadPlan } from "../graph/spread";
import { deriveView } from "../pages/incident/incidentView";
import { leftStateAtStep, leftStepFromAttempts } from "../pages/incident/leftSimulation";
import { KEY_CAP } from "../shared/scenario4";
import { fmtDisplay, fmtPercent, percentOf } from "../lib/format";
import type { Attempt, GraphSnapshot, Proposal, SimResult } from "../types";
import type { BuildingCode, CityStageProps, SceneId } from "./contract";

// ---------- scenes & routes ----------
export const STAGE_SCENES = ["look", "try", "fix", "incident", "request"] as const;
export type StageScene = (typeof STAGE_SCENES)[number];

export const SCENE_META: Record<StageScene, { n: number; label: string; short: string }> = {
  look: { n: 1, label: "Nhìn", short: "①" },
  try: { n: 2, label: "Thử", short: "②" },
  fix: { n: 3, label: "Sửa", short: "③" },
  incident: { n: 4, label: "Sự cố", short: "④" },
  request: { n: 5, label: "Xin thêm quyền", short: "⑤" },
};

export const isStageScene = (x: string | undefined): x is StageScene => !!x && (STAGE_SCENES as readonly string[]).includes(x);
export const scenePath = (s: SceneId): string => (s === "intro" ? "/" : `/s/${s}`);
/** Scene order including the intro at index 0. */
const ORDER: SceneId[] = ["intro", ...STAGE_SCENES];
export function neighborScene(s: SceneId, dir: 1 | -1): SceneId {
  const i = ORDER.indexOf(s);
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, i + dir))];
}
/** Which scene a pathname belongs to ("/" = intro). */
export function sceneFromPath(pathname: string): SceneId | null {
  if (pathname === "/" || pathname === "") return "intro";
  const m = /^\/s\/([^/]+)\/?$/.exec(pathname);
  return m && isStageScene(m[1]) ? m[1] : null;
}

// ---------- money helpers ----------
export const disp = (b: bigint | number): string => fmtDisplay(typeof b === "bigint" ? b : BigInt(Math.round(b)) * 1_000_000n);
/** base-unit bigint -> "30.000" */
export const fmtB = (b: bigint): string => fmtDisplay(b);

// ---------- scene 2: spread ----------
/** Spread prop for CityStage: step k reveals order[k]; stepsDone = how many steps have fired (0 = none, so step = -1). */
export function spreadProp(graph: GraphSnapshot, sim: Pick<SimResult, "reachedKeys" | "totals">, principalIds: string[], stepsDone: number): NonNullable<CityStageProps["spread"]> {
  const from = principalIds.map((p) => `p:${p}`);
  // the city only knows graph edge ids: drop the synthetic `x:*` exposure lines
  const order = spreadOrder(graph, sim, principalIds).map((o) => ({ nodeIds: o.nodeIds, edgeIds: o.edgeIds.filter((e) => !e.startsWith("x:")) }));
  return { from, order, step: stepsDone - 1 };
}
export { buildSpreadPlan, counterAt };
export type { SpreadPlan };

/** The counter (base units) after `stepsDone` steps: Bạn nghĩ -> Rủi ro thật. */
export const counterAfter = (plan: SpreadPlan, stepsDone: number): bigint => counterAt(plan, stepsDone);

// ---------- scene 4: incident numbers (all from events, never summed on the client) ----------
export interface IncidentNumbers {
  /** "Đã dùng chung" from the newest principalSpentAfter (null before the first event) */
  shared: bigint | null;
  attacker: bigint;
  /** the left-hand simulation ("không có Cordon"), display units */
  leftTotal: number;
  leftStep: number;
  locked: boolean;
  attackDone: boolean;
  agentDone: boolean;
  step7Done: boolean;
  /** the gate gauge prop for CityStage (cap from the district, spent from events) */
  sharedCap: { spent: string; cap: string } | null;
}
export function incidentNumbers(attempts: Attempt[], opts: { districtLocked?: boolean; capRaw?: string | null }): IncidentNumbers {
  const view = deriveView(attempts, !!opts.districtLocked);
  const leftStep = leftStepFromAttempts(view.attempts);
  const left = leftStateAtStep(view.attempts.length ? leftStep : -1);
  return {
    shared: view.sharedSpent,
    attacker: view.attackerSpent,
    leftTotal: view.attempts.length ? left.total : 0,
    leftStep,
    locked: view.locked,
    attackDone: view.attackDone,
    agentDone: view.maxStep >= 0,
    step7Done: !!view.step7,
    sharedCap: opts.capRaw && view.sharedSpent !== null ? { spent: view.sharedSpent.toString(), cap: opts.capRaw } : null,
  };
}
export const LEFT_FULL = 5 * KEY_CAP;

export type IncidentAction = "agent" | "attack" | "lock" | "step7" | "done";
/** Which toy button pulses next (spec §10.5 control order). */
export function nextIncidentAction(n: Pick<IncidentNumbers, "agentDone" | "attackDone" | "locked" | "step7Done">, attacking: boolean): IncidentAction {
  if (!n.agentDone && !attacking) return "agent";
  if (!n.attackDone) return "attack";
  if (!n.locked) return "lock";
  if (!n.step7Done) return "step7";
  return "done";
}

// ---------- plain-words labels ----------
export const BUILDING_NAME: Record<BuildingCode, string> = {
  B01: "Hội đồng duyệt", B02: "Tòa Giáo Dục", B03: "Kho tiền", B04: "Tòa Tiêu Dùng",
  B05: "Tòa An Toàn", B06: "Tòa Tăng Trưởng", B07: "Tòa Trách Nhiệm", B08: "Quảng trường",
};
const RECIPIENT_VI: Record<string, string> = { vendor_data_api: "Nhà cung cấp dữ liệu", vendor_cloud: "Nhà cung cấp máy chủ", vendor_intl_design: "Hãng thiết kế nước ngoài", stranger_wallet: "Ví lạ" };
export const recipientVi = (id: string) => RECIPIENT_VI[id] ?? id;
const SIGNER_SHORT: Record<string, string> = {
  key_minh: "Thẻ anh Minh", key_agent_data: "Trợ lý Dữ liệu", key_agent_intl_pay: "Trợ lý Thanh toán QT",
  key_agent_rebalance: "Trợ lý Cân đối", key_svc_payment: "Phần mềm thanh toán", lan: "Chị Lan",
};
export const signerShort = (id: string, fallback?: string) => SIGNER_SHORT[id] ?? fallback ?? id;
/** "Trợ lý Dữ liệu" -> "Dữ liệu" for tiny captions. */
export const tinyLabel = (label: string) => label.replace(/^Trợ lý /, "").replace(/^Thẻ của /, "").replace(/^Phần mềm /, "Phần mềm ");
const KEY_TINY: Record<string, string> = { key_minh: "Anh Minh", key_agent_data: "Dữ liệu", key_agent_intl_pay: "Quốc tế", key_agent_rebalance: "Cân đối", key_svc_payment: "Thanh toán", key_huy_1: "Anh Huy", key_huy_2: "Anh Huy", key_lan: "Chị Lan" };
/** One-word caption for a key node id ("k:key_agent_data" -> "Dữ liệu"). */
export const keyTiny = (nodeId: string, label: string) => KEY_TINY[nodeId.replace(/^k:/, "")] ?? tinyLabel(label);
export const casualName = (label: string) => (label ? label.charAt(0).toLowerCase() + label.slice(1) : label);

// ---------- popover for a picked pin / fence ----------
export interface NodeInfo {
  title: string;
  kind: "person" | "robot" | "server" | "gate" | "other";
  lines: { text: string; declared?: boolean }[];
}
const KIND_ICON = { HUMAN: "person", AGENT: "robot", SERVICE: "server" } as const;

export function describeNode(graph: GraphSnapshot, id: string): NodeInfo | null {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return null;
  const labelOf = (nid: string) => graph.nodes.find((n) => n.id === nid)?.label ?? nid;
  if (node.type === "Key") {
    const into = graph.edges.filter((e) => e.to === id);
    const holder = into.find((e) => e.type === "HOLDS_KEY");
    const declared = into.filter((e) => e.source !== "onchain" && e.type !== "HOLDS_KEY");
    const lines: NodeInfo["lines"] = [];
    if (holder) lines.push({ text: `Đang nằm ở khu của ${casualName(labelOf(holder.from))}` });
    if (node.data.keyDailyCap) lines.push({ text: `Trần riêng ${node.data.keyDailyCap.display}/ngày` });
    for (const e of declared) lines.push({ text: `${e.type === "ADMINS" ? "Quản trị" : "Điều khiển"}: ${casualName(labelOf(e.from))}`, declared: true });
    if (!declared.length) lines.push({ text: "Ghi thẳng trên chain" });
    return { title: node.label, kind: node.data.kind ? KIND_ICON[node.data.kind] : "other", lines };
  }
  if (node.type === "Principal") {
    const d = graph.districts.find((x) => `p:${x.principalId}` === id);
    const lines: NodeInfo["lines"] = [];
    lines.push({ text: d ? `${d.keys.length} thẻ` : "Khu" });
    lines.push({ text: d?.dailyCap ? `Cổng chung ${d.dailyCap.display}/ngày` : "Không có cổng chung" });
    return { title: node.label, kind: node.data.kind ? KIND_ICON[node.data.kind] : "person", lines };
  }
  if (node.type === "Recipient") return { title: recipientVi(node.id.replace(/^r:/, "")), kind: "other", lines: [{ text: "Nơi nhận tiền đã duyệt" }] };
  return { title: node.label, kind: "other", lines: [] };
}

export const barePrincipal = (nodeId: string) => nodeId.replace(/^p:/, "");

// ---------- scene 5 numbers: never zeros, never post-lock values ----------
export interface RequestNumbers {
  p12: { before: string; after: string; beforePct: string; afterPct: string };
  p13: { before: string; after: string; huyConflicted: boolean };
}
const TREASURY = 2_000_000n * 1_000_000n;
const pctText = (raw: string) => fmtPercent(percentOf(BigInt(raw), TREASURY));

/** Numbers of requests #12 / #13 as the story tells them, or null while they are not real yet (-> skeleton, never "0 → 0").
 *  Open proposals are recomputed live, so once Lan has locked Minh's district (scene 4) the live report collapses to 0.
 *  `remembered` is the snapshot taken while the district was still open; it wins over a live report of a locked district. */
export function requestNumbers(p12: Proposal | undefined, p13: Proposal | undefined, minhLocked: boolean, remembered: RequestNumbers | null): RequestNumbers | null {
  if (!p12 || !p13) return null;
  const nz = (p: Proposal) => BigInt(p.riskReport.before.enforced.raw) > 0n && BigInt(p.riskReport.after.enforced.raw) > 0n;
  const live = (): RequestNumbers => ({
    p12: { before: p12.riskReport.before.enforced.display, after: p12.riskReport.after.enforced.display, beforePct: pctText(p12.riskReport.before.enforced.raw), afterPct: pctText(p12.riskReport.after.enforced.raw) },
    p13: { before: p13.riskReport.before.enforced.display, after: p13.riskReport.after.enforced.display, huyConflicted: p13.conflictedMembers.includes("huy") },
  });
  if (minhLocked) return remembered; // live values describe a locked district: only the snapshot is the story
  return nz(p12) && nz(p13) ? live() : remembered;
}
