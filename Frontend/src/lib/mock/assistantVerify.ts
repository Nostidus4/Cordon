// Spec §9.4: every number in the assistant's `answer` must appear in numbers[], and each numbers[].value must equal the value
// read back from `path` of the tool result. Pure helpers (used by the mock's assistant_logs, unit-tested).
import type { AssistantAnswer, AssistantNumberCheck } from "../../types";
import { fmtDisplay } from "../format";

/** Numeric tokens of a sentence: "140.000", "7%", "6,5%", "5". Normalised without the % sign. */
export function numbersInText(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((t) => t.replace(/[.,]$/, ""));
}
const norm = (v: string) => v.replace(/%/g, "").replace(/\/ngày/g, "").trim();

/** Reads `a.b[0].c`, `list[fnName].x` (match item whose `fn` equals fnName) and `arr.length`. Returns undefined when unresolved. */
export function readPath(root: unknown, path: string): unknown {
  const parts = path.match(/[^.[\]]+|\[[^\]]*\]/g) ?? [];
  let cur: unknown = root;
  for (const raw of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (raw.startsWith("[")) {
      const key = raw.slice(1, -1);
      if (!Array.isArray(cur)) return undefined;
      cur = /^\d+$/.test(key) ? cur[Number(key)] : cur.find((x) => x && typeof x === "object" && (x as { fn?: string }).fn === key);
    } else if (raw === "length" && Array.isArray(cur)) cur = cur.length;
    else {
      const o = cur as Record<string, unknown>;
      // shorthand: `calls[fn].cap` means `calls[fn].args.cap`
      cur = raw in o ? o[raw] : (o.args && typeof o.args === "object" ? (o.args as Record<string, unknown>)[raw] : undefined);
    }
  }
  return cur;
}

/** Canonical comparable string of a resolved value: money base units (>= 7 digits) are shown as `30.000`, `{display}` objects unwrap. */
export function renderValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") { const d = (v as { display?: unknown }).display; return typeof d === "string" ? d : null; }
  if (typeof v === "number") return String(v).replace(".", ",");
  const s = String(v);
  return /^\d{7,}$/.test(s) ? fmtDisplay(BigInt(s)) : s;
}

export interface VerifyResult { checks: AssistantNumberCheck[]; uncovered: string[]; verified: boolean }

export function verifyAnswer(answer: Pick<AssistantAnswer, "answer" | "numbers">, tools: Partial<Record<AssistantAnswer["numbers"][number]["source"], unknown>>): VerifyResult {
  const checks: AssistantNumberCheck[] = answer.numbers.map((n) => {
    const toolValue = renderValue(readPath(tools[n.source], n.path));
    return { ...n, toolValue, match: toolValue !== null && norm(toolValue) === norm(n.value) };
  });
  const covered = new Set(answer.numbers.flatMap((n) => numbersInText(n.value)));
  const uncovered = [...new Set(numbersInText(answer.answer).filter((t) => !covered.has(t)))];
  return { checks, uncovered, verified: checks.every((c) => c.match) && uncovered.length === 0 };
}
