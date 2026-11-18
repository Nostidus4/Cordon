// Copilot in mock mode (CITY-004): the deterministic path of the backend Copilot (Backend/src/guardian/assistant/copilot/{intent,tools,service,executor}.py),
// ported to the browser so the public demo can draft -> see the check -> confirm / reject against the simulated chain.
// Same rules as the backend: the Copilot only PREPARES; a draft is `pending` until a person confirms; the chain (caps, whitelist) is the only allowance;
// a "danger" check needs an explicit risk acknowledgement. No LLM, no free-text reads beyond the few topics below (anything else -> a friendly "unknown").
import type { Attempt, CopilotDraft, CopilotEval, CopilotIntent, CopilotNumber, CopilotReply, CopilotPreparedTx } from "../../types";
import { money } from "../format";
import { ApiError, _debug, copilotSpend, mockApi, onMockReset, txGuardWorld } from "./server";
import { checkTx } from "./txguard";
import { fakeAddress, type Action } from "./core";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- intent parser (intent.py) ----------
type Kind = CopilotIntent;
interface Intent { kind: Kind; params: Record<string, unknown>; missingVi: string | null }
const intent = (kind: Kind, params: Record<string, unknown> = {}, missingVi: string | null = null): Intent => ({ kind, params, missingVi });

/** lower-case, accents removed (đ -> d), whitespace collapsed: matching is accent-insensitive. */
export const normalize = (text: string): string =>
  text.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/\p{Mn}/gu, "").replace(/\s+/g, " ").trim();

const HEX_ADDR = /0x[0-9a-f]{40}/g;
const INJECTION = [
  /\b(bo qua|quen|vo hieu hoa|tat|huy bo|bypass)\b.{0,30}\b(luat|quy tac|gioi han|han muc|chi dan|whitelist|danh sach|kiem tra)/,
  /\b(ignore|disregard|forget|override|bypass|disable|skip)\b.{0,30}\b(rules?|instructions?|limits?|caps?|polic(y|ies)|whitelist|checks?|guard)/,
  /(system prompt|developer mode|jailbreak|\bdan mode\b)/,
  /\b(ban|you) (la|are) (admin|quan tri|developer|root)\b/,
  /\b(chuyen|rut|gui|chuyen khoan|send|transfer|move|drain|empty|sweep)\b.{0,25}\b(het|toan bo|tat ca|everything|all (the )?(funds|money|balance|tokens)|entire)\b/,
  /\b(rut can|drain)\b/,
  /\b(het|toan bo|tat ca) (tien|so du|quy|kho)\b/,
];
const FORECAST = [
  /\b(du doan|tien doan|forecast|predict(ion)?)\b/,
  /\bgia\b.{0,40}\b(tuan sau|ngay mai|thang sau|nam sau|se (tang|giam)|tang hay giam|bao gio|sap toi)\b/,
  /\b(price|prices)\b.{0,40}\b(next (week|month|year|day)|tomorrow|go (up|down)|rise|fall|pump|moon|crash)\b/,
  /\bwill\b.{0,40}\b(price|eth|btc|token|coin)\b.{0,30}\b(go|rise|fall|increase|decrease|pump|moon|crash|up|down)\b/,
  /\b(co nen mua|nen mua|should i (buy|sell)|is it a good time to (buy|sell))\b/,
  /\b(se tang|se giam|co tang khong|co giam khong)\b/,
];
const PAY_VERBS = /\b(chuyen khoan|chuyen|tra|thanh toan|gui|pay|send|transfer|wire)\b/;
const SWAP_VERBS = /\b(doi|hoan doi|quy doi|swap|exchange|convert|trade)\b/;
const TOKENS: [string, string][] = [["tusdc", "tUSDC"], ["usdc", "tUSDC"], ["ttkb", "tTKB"], ["tkb", "tTKB"], ["tscam", "tSCAM"], ["scam", "tSCAM"]];
const TOKEN_RE = new RegExp(`\\b(${TOKENS.map(([a]) => a).join("|")})\\b`, "g");
const TOKEN_SEED = Object.fromEntries(TOKENS);
const RECIPIENTS: [RegExp, string][] = [
  [/\b(cloud)\b/, "vendor_cloud"], [/\b(du lieu|data api|data)\b/, "vendor_data_api"], [/\b(thiet ke|design)\b/, "vendor_intl_design"],
  [/\b(nguoi la|stranger|unknown wallet|vi la|unknown)\b/, "stranger_wallet"],
];
const SIGNERS: [RegExp, string | null][] = [
  [/\b(tro ly du lieu|agent data|data agent)\b/, "key_agent_data"],
  [/\b(tro ly thanh toan quoc te|agent intl|intl agent)\b/, "key_agent_intl_pay"],
  [/\b(tro ly can doi|agent can doi|rebalance agent)\b/, "key_agent_rebalance"],
  [/\b(phan mem thanh toan|payment (software|service))\b/, "key_svc_payment"],
  [/\b(?:tu|from|bang|dung|use|using|with|khoa|key|the)\s+(?:khoa\s+|key\s+|the\s+)?(?:cua\s+)?(?:anh\s+|chi\s+)?(minh|huy|lan)\b/, null],
];
const PERSON_KEY: Record<string, string> = { minh: "key_minh", huy: "key_huy_1", lan: "key_lan" };
const DEFAULT_SIGNER = "key_minh";
const NUM = "\\d+(?:[.,]\\d+)*";

/** '5.000' / '5,000' -> 5000 units; '1,5' -> 1.5; '20000' -> 20000. Base units (no floats) or null. */
function parseDecimal(tok: string, decimals: number): bigint | null {
  const t = tok.trim();
  let whole: bigint, frac = "";
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) whole = BigInt(t.replace(/[.,]/g, ""));
  else if (new RegExp(`^\\d+[.,]\\d{1,${decimals}}$`).test(t)) { const [w, f] = t.split(/[.,]/); whole = BigInt(w); frac = f; }
  else if (/^\d+$/.test(t)) whole = BigInt(t);
  else return null;
  return whole * 10n ** BigInt(decimals) + (frac ? BigInt(frac.padEnd(decimals, "0")) : 0n);
}
const stripAddresses = (t: string): [string, string[]] => [t.replace(HEX_ADDR, " "), t.match(HEX_ADDR) ?? []];
/** First number in `t`, skipping '#12'-style ids. */
function firstAmount(t: string): [string, boolean] | null {
  const m = new RegExp(`(?<![#\\w])(${NUM})\\s*(k|nghin|ngan)?\\b`).exec(t);
  return m ? [m[1], !!m[2]] : null;
}
function amountBase(tk: [string, boolean] | null, decimals: number): bigint | null {
  if (!tk) return null;
  const base = parseDecimal(tk[0], decimals);
  return base !== null && tk[1] ? base * 1000n : base;
}
function signerOf(t: string): [string | null, string] {
  for (const [pat, seed] of SIGNERS) {
    const m = pat.exec(t);
    if (m) return [seed ?? PERSON_KEY[m[1]], `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`];
  }
  return [null, t];
}
const tokensIn = (t: string): string[] => [...t.matchAll(TOKEN_RE)].map((m) => TOKEN_SEED[m[1]]);
const recipientOf = (t: string, addrs: string[]): string | null => addrs[0] ?? RECIPIENTS.find(([p]) => p.test(t))?.[1] ?? null;

function parsePay(n: string): Intent {
  const [t0, addrs] = stripAddresses(n);
  const [signer, t] = signerOf(t0);
  const token = tokensIn(t)[0] ?? "tUSDC";
  const amount = amountBase(firstAmount(t), token === "tUSDC" ? 6 : 18);
  const to = recipientOf(t, addrs);
  const params = { key: signer ?? DEFAULT_SIGNER, to, amount, token, memo: "copilot" };
  if (amount === null || amount <= 0n) return intent("unknown", params, "Bạn muốn chuyển bao nhiêu? Ví dụ: “Chuyển 5.000 USDC cho nhà cung cấp cloud”.");
  if (to === null) return intent("unknown", params, "Bạn muốn chuyển cho ai? Mình chỉ nhận tên nhà cung cấp hoặc một địa chỉ ví.");
  return intent("pay", params);
}
function parseSwap(n: string): Intent {
  const [t0] = stripAddresses(n);
  const [signer, t] = signerOf(t0);
  const toks = tokensIn(t);
  const dex = /\b(evil|evildex|san la|cho la)\b/.test(t) ? "evil_dex" : "mock_dex";
  const params: Record<string, unknown> = { key: signer ?? DEFAULT_SIGNER, protocol: dex };
  if (toks.length < 2 || toks[0] === toks[1]) return intent("unknown", params, "Bạn muốn đổi loại tiền nào sang loại nào? Ví dụ: “Đổi 1.000 USDC sang TKB”.");
  const [tokenIn, tokenOut] = toks;
  const mo = new RegExp(`\\b(toi thieu|it nhat|min(?:imum)?|at least)\\s*:?\\s*(${NUM})`).exec(t);
  const head = mo ? t.slice(0, mo.index) : t;
  const amountIn = amountBase(firstAmount(head), tokenIn === "tUSDC" ? 6 : 18);
  if (amountIn === null || amountIn <= 0n) return intent("unknown", params, "Bạn muốn đổi bao nhiêu?");
  // minOut is in the decimals of tokenOut (tTKB: 18); default = 98% of the 1:1 rate (spec §6.6), integers only
  const dIn = tokenIn === "tUSDC" ? 6 : 18, dOut = tokenOut === "tUSDC" ? 6 : 18;
  const minOut = (mo ? parseDecimal(mo[2], dOut) : null) ?? (((amountIn * 10n ** BigInt(dOut)) / 10n ** BigInt(dIn)) * 98n) / 100n;
  return intent("swap", { ...params, amountIn, tokenIn, tokenOut, minOut });
}
export function parseIntent(message: string): Intent {
  const n = normalize(message);
  if (!n) return intent("unknown", {}, "Bạn hãy gõ một câu hỏi hoặc một lệnh chi tiền.");
  if (INJECTION.some((p) => p.test(n))) return intent("injection_refused");
  const noAddr = n.replace(HEX_ADDR, " ");
  const isPay = PAY_VERBS.test(n) && firstAmount(noAddr) !== null;
  const isSwap = SWAP_VERBS.test(n) && tokensIn(n).length > 0;
  if (FORECAST.some((p) => p.test(n)) && !(isPay || isSwap)) return intent("forecast_refused");
  if (isSwap) return parseSwap(n);
  if (isPay) return parsePay(n);
  return intent("read");
}

// ---------- prepare (tools.py) ----------
class CopilotError extends Error {}
const RECIPIENT_LABEL: Record<string, string> = { vendor_cloud: "Nhà cung cấp cloud", vendor_data_api: "Nhà cung cấp dữ liệu", vendor_intl_design: "Nhà cung cấp thiết kế quốc tế" };
/** Untrusted label -> speakable text without digits. */
const clean = (label: string) => label.replace(/\s*\(\d+\)/g, "").replace(/\d+/g, "").replace(/\s+/g, " ").trim() || "ví chưa rõ";
const symbolOf = (s: string) => s;

interface Prepared { kind: "pay" | "swap"; prepared: CopilotPreparedTx; action: Action; details: CopilotDraft["details"]; summaryVi: string; checkInput: Record<string, unknown> }

function prepare(p: Record<string, unknown>, kind: "pay" | "swap"): Prepared {
  const S = _debug.state();
  const key = S.keys[p.key as string];
  if (!key) throw new CopilotError("Mình không tìm thấy thẻ này trong tổ chức.");
  const signer = clean(key.label);
  const dexSeed = p.protocol as string | undefined;
  if (kind === "pay") {
    const token = p.token as string, amount = p.amount as bigint;
    if (token === "tTKB") throw new CopilotError("Bản demo chỉ chuyển tUSDC. Bạn thử “Chuyển 5.000 USDC cho nhà cung cấp cloud”.");
    let to = p.to as string, toLabel: string;
    if (RECIPIENT_LABEL[to] || to === "stranger_wallet") toLabel = to === "stranger_wallet" ? "một ví chưa có trong danh sách" : RECIPIENT_LABEL[to];
    else if (/^0x[0-9a-f]{40}$/.test(to)) {
      const known = S.recipients.find((r) => fakeAddress(r).toLowerCase() === to);
      if (known) to = known;
      toLabel = known ? RECIPIENT_LABEL[known] ?? clean(known) : "một ví chưa có trong danh sách";
    } else throw new CopilotError("Mình không biết người nhận này. Hãy nêu tên nhà cung cấp hoặc địa chỉ ví.");
    const amt = money(amount);
    return {
      kind, action: { signer: key.id, kind: "pay", token, to, amount },
      prepared: { kind: "pay", signer: key.address, token: fakeAddress(token), to: /^0x/.test(to) ? to : fakeAddress(to), amount: amount.toString(), tokenOut: null, minOut: null, data: null, memo: "copilot", source: "copilot" },
      details: { signerLabel: signer, toLabel, tokenSymbol: symbolOf(token), tokenOutSymbol: null, amount: amt, minOut: null },
      summaryVi: `Chuyển ${amt.display} ${symbolOf(token)} từ ${signer} cho ${toLabel}.`,
      checkInput: { kind: "pay", signer: key.id, token, to, amount: amount.toString(), memo: "copilot", source: "copilot" },
    };
  }
  const tokenIn = p.tokenIn as string, tokenOut = p.tokenOut as string, amountIn = p.amountIn as bigint, minOut = p.minOut as bigint;
  if (tokenIn !== "tUSDC" || tokenOut !== "tTKB") throw new CopilotError("Bản demo chỉ đổi tUSDC sang tTKB. Bạn thử “Đổi 1.000 USDC sang TKB”.");
  if (minOut <= 0n) throw new CopilotError("Số tiền tối thiểu nhận phải lớn hơn 0.");
  const evil = dexSeed === "evil_dex";
  const dexLabel = evil ? "sàn lạ" : "chợ đã duyệt MockDEX";
  const inM = money(amountIn), minM = money(minOut, 18);
  return {
    kind, action: { signer: key.id, kind: "swap", token: tokenIn, tokenOut, dex: evil ? "evil_dex" : "MockDEX", amount: amountIn },
    prepared: { kind: "swap", signer: key.address, token: fakeAddress(tokenIn), to: fakeAddress(evil ? "evil_dex" : "MockDEX"), amount: amountIn.toString(), tokenOut: fakeAddress(tokenOut), minOut: minOut.toString(), data: null, memo: "", source: "copilot" },
    details: { signerLabel: signer, toLabel: dexLabel, tokenSymbol: tokenIn, tokenOutSymbol: tokenOut, amount: inM, minOut: minM },
    summaryVi: `Đổi ${inM.display} ${tokenIn} sang ${tokenOut} qua ${dexLabel} bằng ${signer}, nhận tối thiểu ${minM.display} ${tokenOut}.`,
    checkInput: { kind: "swap", signer: key.id, token: tokenIn, to: evil ? fakeAddress("evil_dex") : "MockDEX", amount: amountIn.toString(), tokenOut, minOut: minOut.toString(), source: "copilot" },
  };
}

// ---------- drafts (service.py / executor.py) ----------
interface DraftRec extends CopilotDraft { action: Action }
let drafts: DraftRec[] = [];
let nextDraftId = 1;
onMockReset(() => { drafts = []; nextDraftId = 1; });
const pub = ({ action: _a, ...d }: DraftRec): CopilotDraft => structuredClone(d);
const notPendingVi = (s: string) => ({
  rejected: "Lệnh nháp này đã bị huỷ, không gửi được nữa.", confirmed: "Lệnh nháp này đang được gửi.",
  sent: "Lệnh nháp này đã được gửi rồi.", blocked: "Lệnh nháp này đã được gửi và bị chặn rồi.",
})[s] ?? "Lệnh nháp này không còn chờ xác nhận.";
const find = (id: number): DraftRec => {
  const d = drafts.find((x) => x.id === id);
  if (!d) throw new ApiError("DRAFT_NOT_FOUND", "Không có lệnh nháp này.", 404);
  return d;
};

// ---------- replies ----------
const FORECAST_REPLY = "Mình không dự đoán giá hay khuyên mua bán. Mình chỉ đọc số liệu thật của kho và soạn lệnh chi khi bạn yêu cầu rõ ràng.";
const INJECTION_REPLY = "Mình không bỏ qua luật hay chuyển tiền theo lệnh như vậy. Hạn mức và danh sách người nhận là do hợp đồng trên chain giữ, mình chỉ soạn lệnh bình thường để bạn xác nhận.";
const UNKNOWN_REPLY = "Mình chưa hiểu yêu cầu này. Bạn thử hỏi số liệu (ví dụ: “Khu anh Minh còn chi được bao nhiêu?”) hoặc ra lệnh rõ ràng (ví dụ: “Chuyển 5.000 USDC cho nhà cung cấp cloud”).";
const NO_HL = { nodeIds: [] as string[], edgeIds: [] as string[] };
const reply = (kind: Kind, replyVi: string, numbers: CopilotNumber[] = [], draft: CopilotDraft | null = null, highlight = NO_HL): CopilotReply =>
  ({ intent: kind, replyVi, numbers, numbersVerified: true, draft, highlight });

const DISTRICTS: [string, string][] = [["minh", "minh"], ["huy", "huy"], ["lan", "lan"], ["du lieu", "agent_data"], ["thanh toan quoc te", "agent_intl_pay"], ["can doi", "agent_rebalance"], ["phan mem thanh toan", "svc_payment"]];
const FIXED: [RegExp, string][] = [
  [/huy cung bi chiem|huy.*(also|too).*compromis|compromis.*(minh and huy|minh va huy)/, "Nếu anh Huy cũng bị chiếm thì sao?"],
  [/vi sao.*co vang|why.*(yellow|flag)/, "Vì sao khu anh Minh có cờ vàng?"],
  [/\bsua the nao\b|how (do i|to|can i) fix|lam sao sua/, "Sửa thế nào?"],
  [/can doi.*huy|huy.*can doi|rebalance.*huy/, "Có nên giao trợ lý Cân đối cho anh Huy?"],
];
const spoken = (label: string) => { const s = label.replace(/\d+/g, "").trim().slice(0, 40) || "khu này"; return /^(Anh|Chị)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };

/** The few read topics of reads.py, answered from the mock API (numbers quoted with the path they were read from). */
async function readAnswer(t: string): Promise<CopilotReply | null> {
  const fixed = FIXED.find(([re]) => re.test(t))?.[1];
  if (fixed) {
    const a = await mockApi.askAssistant({ question: fixed, context: { screen: "assistant" } } as never);
    return { intent: "read", replyVi: a.answer, numbers: a.numbers.map((n) => ({ label: n.label, value: n.value, source: n.source as CopilotNumber["source"], path: n.path })), numbersVerified: a.numbersVerified, draft: null, highlight: a.highlight };
  }
  const pid = DISTRICTS.find(([k]) => new RegExp(`\\b${k}\\b`).test(t))?.[1] ?? "minh";
  const num = (label: string, value: string, source: CopilotNumber["source"], path: string): CopilotNumber[] => [{ label, value, source, path }];
  if (/\bbao nhieu (co|rui ro|finding)|how many (risk|flags?|findings)|\bso (co|rui ro)\b/.test(t)) {
    const n = String((await mockApi.getFindings()).length);
    return reply("read", `Hiện có ${n} cờ rủi ro đang mở.`, num("Số cờ rủi ro", n, "graph", "graph.findings.length"));
  }
  if (/\bbao nhieu khu|how many districts/.test(t)) {
    const n = String((await mockApi.getGraph()).districts.length);
    return reply("read", `Thành phố có ${n} khu.`, num("Số khu", n, "graph", "graph.districts.length"));
  }
  if (/phien ban (chinh sach|luat)|policy version/.test(t)) {
    const v = String((await mockApi.getGraph()).policyVersion);
    return reply("read", `Bộ luật đang chạy là phiên bản ${v}.`, num("Phiên bản luật", v, "graph", "graph.policyVersion"));
  }
  if (/bi chiem|compromis|bi lo khoa|key leak/.test(t)) {
    const sim = await mockApi.simulate({ compromised: [pid] });
    const who = spoken((await mockApi.getDistrict(pid)).label);
    return reply("read", `Nếu khu ${who} bị chiếm, kẻ gian có thể chi tới ${sim.totals.estimated.display} USDC/ngày.`, num("Ước tính", sim.totals.estimated.display, "simulate", "totals.estimated.display"), null, sim.highlights);
  }
  if (/bi khoa|khoa chua|\blocked\b|is .* locked/.test(t)) {
    const d = await mockApi.getDistrict(pid);
    return reply("read", `Khu ${spoken(d.label)} hiện ${d.locked ? "đang bị khoá" : "không bị khoá"}.`);
  }
  if (/han muc (chung|khu)|cong chung|district (cap|limit)/.test(t)) {
    const d = await mockApi.getDistrict(pid);
    if (!d.dailyCap) return reply("read", `Khu ${spoken(d.label)} chưa có hạn mức chung.`);
    return reply("read", `Hạn mức chung của khu ${spoken(d.label)} là ${d.dailyCap.display} USDC/ngày.`, num("Hạn mức chung", d.dailyCap.display, "district", "dailyCap.display"));
  }
  if (/han muc (the|khoa|rieng)|(card|key) (cap|limit)/.test(t)) {
    const d = await mockApi.getDistrict(pid);
    const cap = d.keys[0]?.dailyCap.display ?? "0";
    return reply("read", `Thẻ của khu ${spoken(d.label)} chi tối đa ${cap} USDC/ngày.`, num("Hạn mức thẻ", cap, "district", "keys.0.dailyCap.display"));
  }
  if (/da (chi|tieu)|spent|chi hom nay/.test(t)) {
    const d = await mockApi.getDistrict(pid);
    return reply("read", `Khu ${spoken(d.label)} hôm nay đã chi ${d.spentToday.display} USDC.`, num("Đã chi hôm nay", d.spentToday.display, "district", "spentToday.display"));
  }
  if (/con (chi|tieu) duoc|con lai|remaining|\bleft\b|(can|still) .{0,20}spend/.test(t)) {
    const d = await mockApi.getDistrict(pid);
    return reply("read", `Khu ${spoken(d.label)} hôm nay còn chi được ${d.remaining.display} USDC.`, num("Còn chi được", d.remaining.display, "district", "remaining.display"));
  }
  const m = /(?:de xuat|proposal|request)\s*#?\s*(\d+)/.exec(t);
  if (m) {
    const p = (await mockApi.getProposals()).find((x) => x.id === Number(m[1]));
    if (!p) return null;
    return reply("read", `Đề xuất ${p.id} đang có ${p.approvalCount}/${p.threshold} phiếu, trạng thái ${p.status}.`,
      [...num("Mã đề xuất", String(p.id), "proposal", "id"), ...num("Số phiếu", String(p.approvalCount), "proposal", "approvalCount"), ...num("Phiếu cần", String(p.threshold), "proposal", "threshold")]);
  }
  return null;
}

function draftReply(d: DraftRec): CopilotReply {
  let text = `Mình đã soạn lệnh, CHƯA gửi gì cả. ${d.summaryVi} Bấm “Xác nhận gửi” nếu đúng ý bạn.`;
  if (d.txCheckLevel === "danger") text += " Trạm soi báo mức nguy hiểm, bạn cần xác nhận rủi ro thêm một lần.";
  const numbers: CopilotNumber[] = [{ label: d.intent === "swap" ? "Số tiền đổi" : "Số tiền", value: d.details.amount.display, source: "draft", path: "draft.details.amount.display" }];
  if (d.intent === "swap" && d.details.minOut) numbers.push({ label: "Tối thiểu nhận", value: d.details.minOut.display, source: "draft", path: "draft.details.minOut.display" });
  return reply(d.intent, text, numbers, pub(d));
}

export const mockCopilot = {
  async askCopilot(message: string): Promise<CopilotReply> {
    await sleep(120);
    const msg = message.trim();
    if (!msg || msg.length > 600) throw new ApiError("VALIDATION_ERROR", "Tin nhắn phải từ 1 đến 600 ký tự.", 422);
    const parsed = parseIntent(msg);
    if (parsed.kind === "injection_refused") return reply(parsed.kind, INJECTION_REPLY);
    if (parsed.kind === "forecast_refused") return reply(parsed.kind, FORECAST_REPLY);
    if (parsed.kind === "pay" || parsed.kind === "swap") {
      let spec: Prepared;
      try { spec = prepare(parsed.params, parsed.kind); } catch (e) { if (e instanceof CopilotError) return reply("unknown", e.message); throw e; }
      let level: CopilotDraft["txCheckLevel"] = null, checkId: string | null = null;
      try { const c = checkTx(txGuardWorld(), spec.checkInput as never, Math.floor(Date.now() / 1000)); level = c.level; checkId = String(c.id); } catch { /* no check: the draft is still shown */ }
      const rec: DraftRec = {
        id: nextDraftId++, createdAt: Math.floor(Date.now() / 1000), intent: spec.kind, prepared: spec.prepared, details: spec.details, summaryVi: spec.summaryVi,
        status: "pending", txCheckId: checkId, txCheckLevel: level, result: null, action: spec.action,
      };
      drafts.push(rec);
      return draftReply(rec);
    }
    if (parsed.kind === "read") {
      const ans = await readAnswer(normalize(msg));
      if (ans) return ans;
    }
    return reply("unknown", parsed.missingVi ?? UNKNOWN_REPLY);
  },
  async getCopilotDrafts(): Promise<CopilotDraft[]> { return [...drafts].reverse().map(pub); },
  /** The only path that sends: through the same rules and limits as every other spend of the simulated chain. */
  async confirmCopilotDraft(id: number, acknowledgeRisk: boolean): Promise<CopilotDraft> {
    await sleep(120);
    const d = find(id);
    if (d.status !== "pending") throw new ApiError("DRAFT_NOT_PENDING", notPendingVi(d.status), 409);
    if (d.txCheckLevel === "danger" && !acknowledgeRisk)
      throw new ApiError("RISK_ACK_REQUIRED", "Trạm soi báo mức nguy hiểm cho lệnh này. Hãy xác nhận rủi ro rõ ràng nếu vẫn muốn gửi.", 409);
    const at: Attempt = copilotSpend(d.action);
    const ok = at.outcome === "ok";
    d.status = ok ? "sent" : "blocked";
    d.result = { txHash: at.txHash, simulated: at.simulated, ok, reasonCode: ok ? null : at.reasonCode };
    return pub(d);
  },
  async rejectCopilotDraft(id: number): Promise<CopilotDraft> {
    await sleep(60);
    const d = find(id);
    if (d.status !== "pending") throw new ApiError("DRAFT_NOT_PENDING", notPendingVi(d.status), 409);
    d.status = "rejected";
    return pub(d);
  },
  async getCopilotEval(): Promise<CopilotEval> {
    throw new ApiError("EVAL_NOT_RUN", "Báo cáo đánh giá chỉ có khi chạy với máy chủ thật.", 404);
  },
};
